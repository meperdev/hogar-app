import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  ErrorMedioDePago,
  validarNuevoMedio,
  type MedioDePagoItem,
  type MediosDePagoPort,
} from '../app/mediosDePago'

const esquemaMedio = z.object({
  id: z.uuid(),
  nombre: z.string(),
  tipo: z.enum(['efectivo', 'cuenta']),
  owner_tipo: z.enum(['miembro', 'hogar']),
  owner_miembro_id: z.uuid().nullable(),
  activo: z.boolean(),
  orden: z.number().int().default(0),
})

function mapearMedio(fila: z.infer<typeof esquemaMedio>): MedioDePagoItem {
  return {
    id: fila.id,
    nombre: fila.nombre,
    tipo: fila.tipo,
    ownerTipo: fila.owner_tipo,
    ownerMiembroId: fila.owner_miembro_id,
    activo: fila.activo,
    orden: fila.orden,
  }
}

function errorRpcMedio(error: { code?: string }, porDefecto: string): never {
  if (error.code === '42501') {
    throw new ErrorMedioDePago('Solo el dueño del medio o un administrador puede modificarlo.')
  }
  if (error.code === '23505') {
    throw new ErrorMedioDePago('Ya existe un medio de pago activo con ese nombre.')
  }
  if (error.code === '22023') {
    throw new ErrorMedioDePago('Revisa el nombre o los datos del medio de pago.')
  }
  throw new ErrorMedioDePago(porDefecto)
}

export function crearMediosDePagoSupabase(cliente: SupabaseClient): MediosDePagoPort {
  return {
    async listar(hogarId) {
      const { data, error } = await cliente
        .from('medio_de_pago')
        .select('id,nombre,tipo,owner_tipo,owner_miembro_id,activo,orden')
        .eq('hogar_id', hogarId)
        .is('eliminado_en', null)
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true })
      if (error) throw new ErrorMedioDePago('No se pudieron cargar los medios de pago.')
      return esquemaMedio.array().parse(data).map(mapearMedio)
    },

    async crear(entrada) {
      const validado = validarNuevoMedio(entrada)
      const params: Record<string, unknown> = {
        p_nombre: validado.nombre,
        p_tipo: validado.tipo,
        p_owner_tipo: validado.ownerTipo,
      }
      if (validado.ownerMiembroId !== undefined) {
        params.p_owner_miembro_id = validado.ownerTipo === 'hogar' ? null : validado.ownerMiembroId
      }
      const { data, error } = await cliente.rpc('crear_medio_de_pago', params)
      if (error) errorRpcMedio(error, 'No se pudo guardar el medio de pago.')
      return mapearMedio(esquemaMedio.parse(data))
    },

    async editar(entrada) {
      const nombre = validarNuevoMedio({
        nombre: entrada.nombre,
        tipo: 'cuenta',
        ownerTipo: entrada.ownerTipo,
        ownerMiembroId: entrada.ownerMiembroId,
      }).nombre
      const { data, error } = await cliente.rpc('editar_medio_de_pago', {
        p_medio_id: entrada.medioId,
        p_nombre: nombre,
        p_owner_tipo: entrada.ownerTipo,
        p_owner_miembro_id: entrada.ownerTipo === 'hogar' ? null : (entrada.ownerMiembroId ?? null),
      })
      if (error) errorRpcMedio(error, 'No se pudo actualizar el medio de pago.')
      return mapearMedio(esquemaMedio.parse(data))
    },

    async cambiarActivo(medioId, activo) {
      const { data, error } = await cliente.rpc('archivar_medio_de_pago', {
        p_medio_id: medioId,
        p_activo: activo,
      })
      if (error) errorRpcMedio(error, 'No se pudo actualizar el medio de pago.')
      return z.object({ id: z.uuid(), activo: z.boolean() }).parse(data)
    },

    async reordenar(ids) {
      if (ids.length === 0) return
      const { error } = await cliente.rpc('reordenar_medios_de_pago', { p_ids: ids })
      if (error) errorRpcMedio(error, 'No se pudo guardar el orden de los medios.')
    },
  }
}
