import type { Ambito, CategoriaOpcion, MedioOpcion } from './compraRapida'
import type {
  EspecieMascota,
  EstadoItemDespensa,
  GastoMascotasMes,
  Mascota,
  TipoInsumo,
} from '../domain/mascotas'

export type { Ambito, CategoriaOpcion, MedioOpcion }

export type VistaDespensa = {
  periodo: string
  hoy: string
  sinConexion: boolean
  mascotas: Mascota[]
  mascotasActivas: Mascota[]
  items: EstadoItemDespensa[]
  gastoMes: GastoMascotasMes
  categoriaMascotasId: string | null
  categorias: Pick<CategoriaOpcion, 'id' | 'nombre'>[]
  medios: MedioOpcion[]
}

export type EntradaCrearMascota = {
  nombre: string
  especie: EspecieMascota
  fechaNacimiento: string | null
}

export type EntradaCrearInsumo = {
  nombre: string
  mascotaId: string | null
  tipo: TipoInsumo
  categoriaId: string
  frecuenciaDias: number | null
  umbralAlertaPct: number
  montoHabitual: number | null
}

export type EntradaAjusteNivel = {
  itemDespensaId: string
  nivelPct: number
  fecha?: string
}

export type EntradaRecompra = {
  itemId: string
  mascotaId: string | null
  fecha: string
  descripcion: string
  monto: number
  ambito: Ambito
  medioId: string
  cuotas: number
  actualizarMontoHabitual: boolean
}

export interface ControladorMascotas {
  cargar(periodo?: string): Promise<VistaDespensa>
  crearMascota(entrada: EntradaCrearMascota): Promise<{ loteId: string }>
  crearInsumo(entrada: EntradaCrearInsumo): Promise<{ loteId: string }>
  ajustarNivel(entrada: EntradaAjusteNivel): Promise<{ loteId: string }>
  recomprar(entrada: EntradaRecompra): Promise<{ loteId: string }>
}
