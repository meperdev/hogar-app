import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  ErrorComentarioRapido,
  validarTextoComentarioRapido,
  type CategoriaComentarioOpcion,
  type ComentarioRapidoItem,
  type ComentariosRapidosPort,
} from '../app/comentariosRapidos'

const esquemaComentario = z.object({
  id: z.uuid(),
  categoria_id: z.uuid(),
  texto: z.string(),
  activo: z.boolean(),
  orden: z.number().int().default(0),
})

const esquemaCategoria = z.object({
  id: z.uuid(),
  nombre: z.string(),
  icono: z.string().nullable(),
  orden: z.number().int(),
})

function esTablaInexistente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205'
}

function mapearComentario(fila: z.infer<typeof esquemaComentario>): ComentarioRapidoItem {
  return {
    id: fila.id,
    categoriaId: fila.categoria_id,
    texto: fila.texto,
    activo: fila.activo,
    orden: fila.orden,
  }
}

function errorRpcComentario(error: { code?: string }, porDefecto: string): never {
  if (error.code === '42501') {
    throw new ErrorComentarioRapido('Necesitas pertenecer al hogar para administrar comentarios frecuentes.')
  }
  if (error.code === '23505') {
    throw new ErrorComentarioRapido('Ya existe ese comentario frecuente en esta categoría.')
  }
  if (error.code === '22023') {
    throw new ErrorComentarioRapido('Revisa la categoría o el texto del comentario.')
  }
  throw new ErrorComentarioRapido(porDefecto)
}

export function crearComentariosRapidosSupabase(cliente: SupabaseClient): ComentariosRapidosPort {
  return {
    async listar(hogarId) {
      const [comentariosRes, categoriasRes] = await Promise.all([
        cliente
          .from('comentario_rapido')
          .select('id,categoria_id,texto,activo,orden')
          .eq('hogar_id', hogarId)
          .eq('activo', true)
          .is('eliminado_en', null),
        cliente
          .from('categoria')
          .select('id,nombre,icono,orden')
          .eq('hogar_id', hogarId)
          .eq('activa', true)
          .is('eliminado_en', null),
      ])

      if (categoriasRes.error) {
        throw new ErrorComentarioRapido('No se pudieron cargar los comentarios frecuentes.')
      }
      if (comentariosRes.error && !esTablaInexistente(comentariosRes.error)) {
        throw new ErrorComentarioRapido('No se pudieron cargar los comentarios frecuentes.')
      }

      const comentarios = comentariosRes.error
        ? []
        : esquemaComentario
            .array()
            .parse(comentariosRes.data)
            .map(mapearComentario)
            .sort((a, b) => a.orden - b.orden || a.texto.localeCompare(b.texto, 'es'))

      const categorias: CategoriaComentarioOpcion[] = esquemaCategoria
        .array()
        .parse(categoriasRes.data)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))

      return { comentarios, categorias }
    },

    async crear(entrada) {
      const texto = validarTextoComentarioRapido(entrada.texto)
      const { data, error } = await cliente.rpc('crear_comentario_rapido', {
        p_categoria_id: entrada.categoriaId,
        p_texto: texto,
      })
      if (error) errorRpcComentario(error, 'No se pudo guardar el comentario frecuente.')
      return mapearComentario(esquemaComentario.parse(data))
    },

    async eliminar(comentarioId) {
      const { error } = await cliente.rpc('eliminar_comentario_rapido', {
        p_comentario_id: comentarioId,
      })
      if (error) errorRpcComentario(error, 'No se pudo eliminar el comentario frecuente.')
    },
  }
}
