import { z } from 'zod'
import type { AlcanceCompra, ControladorCompraRapida } from './compraRapida'

export type Sesion = { usuarioId: string }
export type Rol = 'admin' | 'miembro'
export type Miembro = { id: string; nombre: string; rol: Rol; activo: boolean }
export type Hogar = {
  id: string
  nombre: string
  miembroActual: Miembro
  miembros: Miembro[]
}
export type NombreHogar = { nombre: string; nombreMiembro: string }
export type HogarCreado = { hogarId: string; miembroId: string }

export interface AuthPort {
  observarSesion(observar: (sesion: Sesion | null) => void): () => void
  pedirCodigo(correo: string): Promise<void>
  verificarCodigo(correo: string, codigo: string): Promise<void>
  salir(): Promise<void>
}

export interface HogarPort {
  cargar(sesion: Sesion): Promise<Hogar | null>
  crear(nombres: NombreHogar): Promise<HogarCreado>
}

export type Servicios = {
  auth: AuthPort
  hogares: HogarPort
  /** Núcleo 1: controlador de compra rápida por actor (ver `compraRapida.ts`). */
  compras?: (alcance: AlcanceCompra) => ControladorCompraRapida
}

export class ErrorFundacion extends Error {}

const correoValido = z.string().trim().pipe(z.email())
const codigoValido = z.string().trim().regex(/^[0-9]{6}$/)
const nombresValidos = z.object({
  nombre: z.string().trim().min(1),
  nombreMiembro: z.string().trim().min(1),
})

function validarCorreo(correo: string): string {
  const resultado = correoValido.safeParse(correo)
  if (!resultado.success) throw new ErrorFundacion('Ingresá un correo válido.')
  return resultado.data
}

export async function pedirCodigo(auth: AuthPort, correo: string) {
  await auth.pedirCodigo(validarCorreo(correo))
}

export async function verificarCodigo(
  auth: AuthPort, correo: string, codigo: string,
) {
  const resultado = codigoValido.safeParse(codigo)
  if (!resultado.success) {
    throw new ErrorFundacion('Ingresá el código de seis dígitos.')
  }
  await auth.verificarCodigo(validarCorreo(correo), resultado.data)
}

export async function crearHogar(hogares: HogarPort, nombres: NombreHogar) {
  const resultado = nombresValidos.safeParse(nombres)
  if (!resultado.success) {
    throw new ErrorFundacion('Ingresá el nombre del hogar y tu nombre.')
  }
  return hogares.crear(resultado.data)
}

export function estadoInvitacion(rol: Rol) {
  return rol === 'admin' ? 'pendiente' : 'sin-permiso'
}
