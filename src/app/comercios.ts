import { z } from 'zod'

export type ComercioFrecuenteItem = {
  id: string
  nombre: string
  categoriaSugeridaId: string | null
  activo: boolean
  orden: number
}

export type CategoriaComercioOpcion = {
  id: string
  nombre: string
  icono: string | null
  orden: number
}

export type DatosComercios = {
  comercios: ComercioFrecuenteItem[]
  categorias: CategoriaComercioOpcion[]
}

export type NuevoComercioEntrada = {
  nombre: string
  categoriaSugeridaId: string | null
}

export type EditarComercioEntrada = {
  comercioId: string
  nombre: string
  categoriaSugeridaId: string | null
}

export interface ComerciosPort {
  listar(hogarId: string): Promise<DatosComercios>
  crear(entrada: NuevoComercioEntrada): Promise<ComercioFrecuenteItem>
  editar(entrada: EditarComercioEntrada): Promise<ComercioFrecuenteItem>
  cambiarActivo(comercioId: string, activo: boolean): Promise<{ id: string; activo: boolean }>
  reordenar(ids: string[]): Promise<void>
}

export class ErrorComercio extends Error {}

const esquemaNombre = z.string().trim().min(1).max(80)

export function validarNombreComercio(nombre: string): string {
  const res = esquemaNombre.safeParse(nombre)
  if (!res.success) {
    throw new ErrorComercio('Ingresa un nombre de comercio entre 1 y 80 caracteres.')
  }
  return res.data
}
