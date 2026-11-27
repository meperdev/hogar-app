import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  ErrorComercio,
  validarNombreComercio,
  type CategoriaComercioOpcion,
  type ComercioFrecuenteItem,
  type ComerciosPort,
} from '../app/comercios'

const esquemaComercio = z.object({
  id: z.uuid(),
  nombre: z.string(),
  categoria_sugerida_id: z.uuid().nullable(),
  activo: z.boolean(),
  orden: z.number().int().default(0),
})

const esquemaCategoria = z.object({
  id: z.uuid(),
  nombre: z.string(),
  icono: z.string().nullable(),
  orden: z.number().int(),
})

function mapearComercio(fila: z.infer<typeof esquemaComercio>): ComercioFrecuenteItem {
  return {
    id: fila.id,
    nombre: fila.nombre,
    categoriaSugeridaId: fila.categoria_sugerida_id,
    activo: fila.activo,
    orden: fila.orden,
  }
}

function errorRpcComercio(error: { code?: string }, porDefecto: string): never {
  if (error.code === '42501') {
    throw new ErrorComercio('Necesitas pertenecer al hogar para administrar comercios.')
  }
  if (error.code === '23505') {
    throw new ErrorComercio('Ya existe un comercio activo con ese nombre.')
  }
  if (error.code === '22023') {
    throw new ErrorComercio('Revisa el nombre o la categoría del comercio.')
  }
  throw new ErrorComercio(porDefecto)
}

export function crearComerciosSupabase(cliente: SupabaseClient): ComerciosPort {
  return {
    async listar(hogarId) {
      const [comerciosRes, categoriasRes] = await Promise.all([
        cliente
          .from('comercio_frecuente')
          .select('id,nombre,categoria_sugerida_id,activo,orden')
          .eq('hogar_id', hogarId)
          .is('eliminado_en', null),
        cliente
          .from('categoria')
          .select('id,nombre,icono,orden')
          .eq('hogar_id', hogarId)
          .eq('activa', true)
          .is('eliminado_en', null),
      ])

      if (comerciosRes.error || categoriasRes.error) {
        throw new ErrorComercio('No se pudieron cargar los comercios frecuentes.')
      }

      const comercios = esquemaComercio
        .array()
        .parse(comerciosRes.data)
        .map(mapearComercio)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))

      const categorias: CategoriaComercioOpcion[] = esquemaCategoria
        .array()
        .parse(categoriasRes.data)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))

      return { comercios, categorias }
    },

    async crear(entrada) {
      const nombre = validarNombreComercio(entrada.nombre)
      const { data, error } = await cliente.rpc('crear_comercio_frecuente', {
        p_nombre: nombre,
        p_categoria_sugerida_id: entrada.categoriaSugeridaId,
      })
      if (error) errorRpcComercio(error, 'No se pudo guardar el comercio.')
      return mapearComercio(esquemaComercio.parse(data))
    },

    async editar(entrada) {
      const nombre = validarNombreComercio(entrada.nombre)
      const { data, error } = await cliente.rpc('editar_comercio_frecuente', {
        p_comercio_id: entrada.comercioId,
        p_nombre: nombre,
        p_categoria_sugerida_id: entrada.categoriaSugeridaId,
      })
      if (error) errorRpcComercio(error, 'No se pudo actualizar el comercio.')
      return mapearComercio(esquemaComercio.parse(data))
    },

    async cambiarActivo(comercioId, activo) {
      const { data, error } = await cliente.rpc('archivar_comercio_frecuente', {
        p_comercio_id: comercioId,
        p_activo: activo,
      })
      if (error) errorRpcComercio(error, 'No se pudo actualizar el comercio.')
      return z.object({ id: z.uuid(), activo: z.boolean() }).parse(data)
    },

    async reordenar(ids) {
      if (ids.length === 0) return
      const { error } = await cliente.rpc('reordenar_comercios_frecuentes', { p_ids: ids })
      if (error) errorRpcComercio(error, 'No se pudo guardar el orden de los comercios.')
    },
  }
}
