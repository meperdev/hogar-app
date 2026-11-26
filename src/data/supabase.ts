import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { crearControladorBalance } from '../app/controladorBalance'
import { crearControladorCompraRapida } from '../app/controladorCompraRapida'
import { crearControladorObligaciones } from '../app/controladorObligaciones'
import { ErrorFundacion, type Servicios } from '../app/fundacion'
import { crearPuertoBalance, crearRemotoBalance } from './balance'
import { crearPuertoCompraRapida, crearRemotoSupabase } from './compraRapida'
import { AdministradorBaseActor } from './db'
import { crearPuertoObligaciones, crearRemotoObligaciones } from './obligaciones'
import { uuidV7 } from './uuid'

const configuracion = z.object({
  // z.httpUrl() exige un dominio con TLD y rechaza http://127.0.0.1:54321 (Supabase local).
  url: z.url({ protocol: /^https?$/ }),
  clavePublica: z.string().trim().min(1).refine((clave) => !clave.startsWith('sb_secret_')),
})
const miembro = z.object({
  id: z.uuid(),
  nombre: z.string(),
  rol: z.enum(['admin', 'miembro']),
  activo: z.boolean(),
})

export function conectarSupabase(url: unknown, clavePublica: unknown): Servicios | null {
  const config = configuracion.safeParse({ url, clavePublica })
  if (!config.success) return null

  const cliente = createClient(config.data.url, config.data.clavePublica, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })

  // Una sola base viva por conexión: al cambiar de actor se cierra la anterior.
  const bases = new AdministradorBaseActor()
  const remoto = crearRemotoSupabase(cliente)

  return {
    auth: {
      observarSesion(observar) {
        const { data } = cliente.auth.onAuthStateChange((_, sesion) => {
          observar(sesion ? { usuarioId: sesion.user.id } : null)
        })
        return () => data.subscription.unsubscribe()
      },
      async pedirCodigo(email) {
        const { error } = await cliente.auth.signInWithOtp({ email })
        if (error) throw new ErrorFundacion('No se pudo enviar el código. Intentá de nuevo.')
      },
      async verificarCodigo(email, token) {
        const { error } = await cliente.auth.verifyOtp({ email, token, type: 'email' })
        if (error) throw new ErrorFundacion('Código inválido o vencido. Revisalo o pedí otro.')
      },
      async salir() {
        const { error } = await cliente.auth.signOut({ scope: 'local' })
        if (error) throw new ErrorFundacion('No se pudo cerrar la sesión. Intentá de nuevo.')
      },
    },
    hogares: {
      async cargar({ usuarioId }) {
        const afiliacion = await cliente.from('miembro').select('id,hogar_id')
          .eq('usuario_id', usuarioId).eq('activo', true).is('eliminado_en', null)
          .maybeSingle()
        if (afiliacion.error) throw afiliacion.error
        if (!afiliacion.data) return null
        const { id, hogar_id: hogarId } = z.object({
          id: z.uuid(), hogar_id: z.uuid(),
        }).parse(afiliacion.data)

        const [hogar, miembros] = await Promise.all([
          cliente.from('hogar').select('id,nombre').eq('id', hogarId)
            .is('eliminado_en', null).maybeSingle(),
          cliente.from('miembro').select('id,nombre,rol,activo').eq('hogar_id', hogarId)
            .is('eliminado_en', null).order('nombre'),
        ])
        if (hogar.error) throw hogar.error
        if (miembros.error) throw miembros.error
        if (!hogar.data) return null
        const lista = miembro.array().parse(miembros.data)
        const miembroActual = lista.find((fila) => fila.id === id && fila.activo)
        if (!miembroActual) return null
        return {
          ...z.object({ id: z.uuid(), nombre: z.string() }).parse(hogar.data),
          miembros: lista,
          miembroActual,
        }
      },
      async crear({ nombre, nombreMiembro }) {
        const { data, error } = await cliente.rpc('crear_hogar', {
          p_nombre: nombre, p_nombre_miembro: nombreMiembro,
        })
        if (error?.code === '23505') throw new ErrorFundacion('Ya pertenecés a un hogar.')
        if (error?.code === '22023') throw new ErrorFundacion('Revisá el largo de los nombres.')
        if (error) throw error
        const resultado = z.object({ hogar_id: z.uuid(), miembro_id: z.uuid() }).parse(data)
        return { hogarId: resultado.hogar_id, miembroId: resultado.miembro_id }
      },
    },
    compras: (alcance) =>
      crearControladorCompraRapida({
        port: crearPuertoCompraRapida({
          base: () => bases.abrir(alcance),
          remoto,
          alcance,
        }),
        alcance,
        ahora: () => new Date(),
        nuevoId: () => uuidV7(),
        programar: (tarea, ms) => {
          setTimeout(tarea, ms)
        },
      }),
    obligaciones: (alcance) =>
      crearControladorObligaciones({
        port: crearPuertoObligaciones({
          base: () => bases.abrir(alcance),
          remoto: crearRemotoObligaciones(cliente),
          hogarId: alcance.hogarId,
        }),
        alcance,
        ahora: () => new Date(),
        nuevoId: () => uuidV7(),
      }),
    balance: (alcance) =>
      crearControladorBalance({
        port: crearPuertoBalance({
          base: () => bases.abrir(alcance),
          remoto: crearRemotoBalance(cliente),
          alcance,
        }),
        alcance,
        ahora: () => new Date(),
        nuevoId: () => uuidV7(),
      }),
  }
}
