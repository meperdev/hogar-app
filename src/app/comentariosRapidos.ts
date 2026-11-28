import { z } from 'zod'

export type ComentarioRapidoItem = {
  id: string
  categoriaId: string
  texto: string
  activo: boolean
  orden: number
}

export type CategoriaComentarioOpcion = {
  id: string
  nombre: string
  icono: string | null
  orden: number
}

export type DatosComentariosRapidos = {
  comentarios: ComentarioRapidoItem[]
  categorias: CategoriaComentarioOpcion[]
}

export type NuevoComentarioRapidoEntrada = {
  categoriaId: string
  texto: string
}

export interface ComentariosRapidosPort {
  listar(hogarId: string): Promise<DatosComentariosRapidos>
  crear(entrada: NuevoComentarioRapidoEntrada): Promise<ComentarioRapidoItem>
  eliminar(comentarioId: string): Promise<void>
}

export class ErrorComentarioRapido extends Error {}

const esquemaTexto = z.string().trim().min(1).max(80)

export function validarTextoComentarioRapido(texto: string): string {
  const res = esquemaTexto.safeParse(texto)
  if (!res.success) {
    throw new ErrorComentarioRapido('Ingresa un comentario entre 1 y 80 caracteres.')
  }
  return res.data
}
