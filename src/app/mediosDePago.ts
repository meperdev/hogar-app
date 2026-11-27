import { z } from 'zod'

export type TipoMedioPago = 'efectivo' | 'cuenta'
export type DuenoMedioPago = 'miembro' | 'hogar'

export type MedioDePagoItem = {
  id: string
  nombre: string
  tipo: TipoMedioPago
  ownerTipo: DuenoMedioPago
  ownerMiembroId: string | null
  activo: boolean
}

export type NuevoMedioEntrada = {
  nombre: string
  tipo: TipoMedioPago
  ownerTipo: DuenoMedioPago
}

export interface MediosDePagoPort {
  listar(hogarId: string): Promise<MedioDePagoItem[]>
  crear(entrada: NuevoMedioEntrada): Promise<MedioDePagoItem>
  cambiarActivo(medioId: string, activo: boolean): Promise<{ id: string; activo: boolean }>
}

export class ErrorMedioDePago extends Error {}

const esquemaNuevoMedio = z.object({
  nombre: z.string().trim().min(1).max(80),
  tipo: z.enum(['efectivo', 'cuenta']),
  ownerTipo: z.enum(['miembro', 'hogar']),
})

export function validarNuevoMedio(entrada: NuevoMedioEntrada): NuevoMedioEntrada {
  const res = esquemaNuevoMedio.safeParse(entrada)
  if (!res.success) {
    throw new ErrorMedioDePago('Ingresa un nombre entre 1 y 80 caracteres.')
  }
  return res.data
}
