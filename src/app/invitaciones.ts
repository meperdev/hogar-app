import { extraerTokenInvitacion } from '../domain/invitaciones'

export type InvitacionCreada = {
  invitacionId: string
  token: string
  expiraEn: string
  hogarNombre: string
  miembroObjetivoId: string | null
  nota: string | null
}

export type InvitacionActiva = {
  id: string
  nota: string | null
  miembroObjetivoId: string | null
  miembroObjetivoNombre: string | null
  creadaEn: string
  expiraEn: string
}

export type ResultadoCanjeInvitacion = {
  hogarId: string
  miembroId: string
  hogarNombre: string
}

export interface InvitacionesPort {
  crear(entrada?: {
    miembroObjetivoId?: string | null | undefined
    nota?: string | null | undefined
  }): Promise<InvitacionCreada>
  listar(): Promise<InvitacionActiva[]>
  revocar(invitacionId: string): Promise<{ revocada: boolean }>
  canjear(entrada: {
    token: string
    nombreMiembro?: string | null | undefined
  }): Promise<ResultadoCanjeInvitacion>
}

export class ErrorInvitacion extends Error {}

export interface AlmacenTemporal {
  getItem(clave: string): string | null
  setItem(clave: string, valor: string): void
  removeItem(clave: string): void
}

const CLAVE_TOKEN_PENDIENTE = 'hogar-app:invitacion-pendiente'

function obtenerAlmacen(almacen?: AlmacenTemporal): AlmacenTemporal | null {
  if (almacen) return almacen
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

export function guardarTokenInvitacionPendiente(
  entrada: string,
  almacen?: AlmacenTemporal,
): string | null {
  const token = extraerTokenInvitacion(entrada)
  if (!token) return null
  try {
    obtenerAlmacen(almacen)?.setItem(CLAVE_TOKEN_PENDIENTE, token)
  } catch {
    // Almacenamiento bloqueado por modo privado: se mantiene el flujo sin romper UI.
  }
  return token
}

export function leerTokenInvitacionPendiente(almacen?: AlmacenTemporal): string | null {
  try {
    const crudo = obtenerAlmacen(almacen)?.getItem(CLAVE_TOKEN_PENDIENTE) ?? ''
    return extraerTokenInvitacion(crudo)
  } catch {
    return null
  }
}

export function limpiarTokenInvitacionPendiente(almacen?: AlmacenTemporal): void {
  try {
    obtenerAlmacen(almacen)?.removeItem(CLAVE_TOKEN_PENDIENTE)
  } catch {
    // Sin efecto si no hay acceso a storage.
  }
}
