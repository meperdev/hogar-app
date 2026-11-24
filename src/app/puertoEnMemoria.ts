import type { LoteCompra } from '../domain/loteCompra'
import type { CatalogoCompra, CompraExistente } from './compraRapida'
import type { CompraRapidaPort, RegistroLocal } from './controladorCompraRapida'

/**
 * Puerto en memoria para tests y demos: misma semántica observable que el
 * adaptador Dexie (outbox con ventana de Deshacer, registros locales, alias y
 * compras remotas simuladas). Úsalo con `crearControladorCompraRapida` en vez
 * de reimplementar el controlador.
 */
export class PuertoEnMemoria implements CompraRapidaPort {
  constructor(private readonly catalogo: CatalogoCompra) {}


  pendientes = new Map<string, LoteCompra>()
  registros: RegistroLocal[] = []
  enviados: LoteCompra[] = []
  preferencias = new Map<string, string>()
  alias = new Map<string, { nombreComercio: string; categoriaId: string | null }>()
  remotas = new Map<string, CompraExistente>()

  async cargarCatalogo() {
    return this.catalogo
  }
  async buscarAlias(nit: string) {
    return this.alias.get(nit) ?? null
  }
  async buscarPorCufe(cufe: string) {
    const local = this.registros.find((r) => r.cufe === cufe)
    if (local) return { fecha: local.fecha, montoTotal: local.montoTotal, descripcion: local.descripcion }
    return this.remotas.get(cufe) ?? null
  }
  async guardarLote(lote: LoteCompra, registro: RegistroLocal) {
    this.pendientes.set(lote.lote_id, lote)
    this.registros.push(registro)
  }
  async descartarLote(loteId: string) {
    if (!this.pendientes.delete(loteId)) return false
    this.registros = this.registros.filter((r) => r.loteId !== loteId)
    return true
  }
  async registrosDesde(desde: string) {
    return this.registros.filter((r) => r.creadoEn >= desde)
  }
  async enviarPendientes(antes: string) {
    for (const [id, lote] of this.pendientes) {
      const registro = this.registros.find((r) => r.loteId === id)
      if (registro && registro.creadoEn < antes) {
        this.enviados.push(lote)
        this.pendientes.delete(id)
      }
    }
  }
  async estadoSincronizacion() {
    return { pendientes: this.pendientes.size, rechazados: [] }
  }
  async leerPreferencia(clave: string) {
    return this.preferencias.get(clave) ?? null
  }
  async guardarPreferencia(clave: string, valor: string) {
    this.preferencias.set(clave, valor)
  }
}
