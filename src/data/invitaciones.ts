import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  ErrorInvitacion,
  type InvitacionActiva,
  type InvitacionCreada,
  type InvitacionesPort,
  type ResultadoCanjeInvitacion,
} from '../app/invitaciones'

const esquemaCreada = z.object({
  invitacion_id: z.uuid(),
  token: z.string().min(16),
  expira_en: z.string(),
  hogar_nombre: z.string(),
  miembro_objetivo_id: z.uuid().nullable(),
  nota: z.string().nullable(),
})

const esquemaActiva = z.object({
  id: z.uuid(),
  nota: z.string().nullable(),
  miembro_objetivo_id: z.uuid().nullable(),
  miembro_objetivo_nombre: z.string().nullable(),
  creada_en: z.string(),
  expira_en: z.string(),
})

const esquemaCanje = z.object({
  hogar_id: z.uuid(),
  miembro_id: z.uuid(),
  hogar_nombre: z.string(),
})

function errorRpcInvitacion(error: { code?: string; message?: string }, porDefecto: string): never {
  if (error.code === '42501') {
    throw new ErrorInvitacion('Solo un administrador del hogar puede gestionar invitaciones.')
  }
  if (error.code === '23505') {
    throw new ErrorInvitacion('Tu cuenta ya pertenece a un hogar activo.')
  }
  if (error.code === '22023') {
    const msg = error.message?.toLowerCase() ?? ''
    if (msg.includes('nombre')) {
      throw new ErrorInvitacion('Ingresa tu nombre entre 1 y 80 caracteres.')
    }
    if (msg.includes('nota')) {
      throw new ErrorInvitacion('La nota admite hasta 120 caracteres.')
    }
    if (msg.includes('miembro objetivo')) {
      throw new ErrorInvitacion('Ese miembro ya tiene cuenta o no está disponible.')
    }
    throw new ErrorInvitacion('Esta invitación no es válida, ya se usó o expiró.')
  }
  throw new ErrorInvitacion(porDefecto)
}

export function crearPuertoInvitaciones(cliente: SupabaseClient): InvitacionesPort {
  return {
    async crear(entrada) {
      const { data, error } = await cliente.rpc('crear_invitacion', {
        p_miembro_objetivo_id: entrada?.miembroObjetivoId ?? null,
        p_nota: entrada?.nota?.trim() || null,
      })
      if (error) errorRpcInvitacion(error, 'No se pudo crear la invitación. Intenta de nuevo.')
      const parsed = esquemaCreada.parse(data)
      const creada: InvitacionCreada = {
        invitacionId: parsed.invitacion_id,
        token: parsed.token,
        expiraEn: parsed.expira_en,
        hogarNombre: parsed.hogar_nombre,
        miembroObjetivoId: parsed.miembro_objetivo_id,
        nota: parsed.nota,
      }
      return creada
    },

    async listar() {
      const { data, error } = await cliente.rpc('listar_invitaciones')
      if (error) errorRpcInvitacion(error, 'No se pudieron cargar las invitaciones activas.')
      const filas = esquemaActiva.array().parse(data)
      return filas.map(
        (fila): InvitacionActiva => ({
          id: fila.id,
          nota: fila.nota,
          miembroObjetivoId: fila.miembro_objetivo_id,
          miembroObjetivoNombre: fila.miembro_objetivo_nombre,
          creadaEn: fila.creada_en,
          expiraEn: fila.expira_en,
        }),
      )
    },

    async revocar(invitacionId) {
      const { data, error } = await cliente.rpc('revocar_invitacion', {
        p_invitacion_id: invitacionId,
      })
      if (error) errorRpcInvitacion(error, 'No se pudo cancelar la invitación.')
      return z.object({ revocada: z.boolean() }).parse(data)
    },

    async canjear({ token, nombreMiembro }) {
      const { data, error } = await cliente.rpc('canjear_invitacion', {
        p_token: token,
        p_nombre_miembro: nombreMiembro?.trim() || null,
      })
      if (error) errorRpcInvitacion(error, 'No se pudo aceptar la invitación. Intenta de nuevo.')
      const parsed = esquemaCanje.parse(data)
      const resultado: ResultadoCanjeInvitacion = {
        hogarId: parsed.hogar_id,
        miembroId: parsed.miembro_id,
        hogarNombre: parsed.hogar_nombre,
      }
      return resultado
    },
  }
}
