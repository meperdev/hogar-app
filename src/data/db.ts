import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import type { CatalogoCompra } from '../app/compraRapida';
import type { RegistroLocal } from '../app/controladorCompraRapida';
import type { LoteCompra } from '../domain/loteCompra';

/**
 * Alcance local de la réplica. La base Dexie se abre por `(hogar_id, actor)`
 * (architecture §9.3): dos miembros en el mismo teléfono nunca comparten
 * stores y cambiar de sesión cierra la base del actor anterior.
 */
export const esquemaAlcanceActor = z.object({
  hogarId: z.uuid(),
  miembroId: z.uuid(),
});

export type AlcanceActor = z.infer<typeof esquemaAlcanceActor>;

/**
 * Preferencias locales por actor (`incluir_personales`, último medio de pago).
 * No se replican y no son datos derivados del dominio.
 */
export interface PreferenciaLocal {
  clave: string;
  valor: string;
  actualizadoEn: string;
}

/**
 * Lote de compra esperando envío (`sync_push`). `creadoEn` es el ISO del reloj
 * del dispositivo: la ventana de Deshacer compara contra él. Un lote rechazado
 * por el servidor queda con `estado: 'rechazado'` y su motivo en español; el
 * lote original se conserva como evidencia.
 */
export interface EntradaOutbox {
  loteId: string;
  creadoEn: string;
  lote: LoteCompra;
  estado: 'pendiente' | 'rechazado';
  motivo: string | null;
}

/** Copia local del catálogo visible para el actor, para arrancar sin red. */
export interface CatalogoLocal {
  clave: string;
  valor: CatalogoCompra;
  actualizadoEn: string;
}

const PREFIJO_BASE = 'hogar-app';

/**
 * Nombre estable de la base para un alcance. Valida el alcance: un id vacío o
 * mal formado nunca llega a abrir una base compartida por accidente.
 */
export function nombreBaseActor(alcance: AlcanceActor): string {
  const { hogarId, miembroId } = esquemaAlcanceActor.parse(alcance);
  return `${PREFIJO_BASE}:${hogarId}:${miembroId}`;
}

/**
 * Base Dexie de un solo actor. El constructor NO abre la base y no toca datos:
 * abrir es una decisión explícita (`abrirBaseActor` o `AdministradorBaseActor`).
 * La versión 2 agrega el espacio del núcleo 1: outbox de lotes de compra,
 * registros locales de compras guardadas y la última copia del catálogo. Las
 * tablas espejo del resto del dominio llegan con sus núcleos.
 */
export class BaseActorDexie extends Dexie {
  declare preferencias: Table<PreferenciaLocal, string>;
  declare outbox: Table<EntradaOutbox, string>;
  declare registros: Table<RegistroLocal, string>;
  declare catalogo: Table<CatalogoLocal, string>;

  constructor(alcance: AlcanceActor) {
    super(nombreBaseActor(alcance));
    this.version(1).stores({ preferencias: 'clave' });
    this.version(2).stores({
      preferencias: 'clave',
      outbox: 'loteId, creadoEn, estado',
      registros: 'compraId, loteId, cufe, creadoEn',
      catalogo: 'clave',
    });
  }
}

/** Crea la base del actor sin abrirla. */
export function crearBaseActor(alcance: AlcanceActor): BaseActorDexie {
  return new BaseActorDexie(alcance);
}

/** Abre (o crea) la base del actor. */
export async function abrirBaseActor(
  alcance: AlcanceActor,
): Promise<BaseActorDexie> {
  const base = crearBaseActor(alcance);
  await base.open();
  return base;
}

/**
 * Administra la base viva de la sesión. Al abrir otro alcance cierra la base
 * anterior antes de abrir la nueva, para no mezclar actores en el mismo
 * dispositivo.
 */
export class AdministradorBaseActor {
  #actual: BaseActorDexie | null = null;

  get baseActual(): BaseActorDexie | null {
    return this.#actual;
  }

  get abierta(): boolean {
    return this.#actual?.isOpen() ?? false;
  }

  async abrir(alcance: AlcanceActor): Promise<BaseActorDexie> {
    const siguiente = crearBaseActor(alcance);

    if (this.#actual && this.#actual.name === siguiente.name) {
      siguiente.close();
      return this.#actual;
    }

    this.cerrar();
    await siguiente.open();
    this.#actual = siguiente;
    return siguiente;
  }

  cerrar(): void {
    this.#actual?.close();
    this.#actual = null;
  }
}
