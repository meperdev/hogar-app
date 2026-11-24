import { esFechaCivil } from './fechas';
import { decimalAPesos } from './iva';

/**
 * Resultado de leer un QR de factura electrónica DIAN. Nunca se consulta la red:
 * el parseo es puro y la verificación es solo un enlace para abrir aparte.
 */
export type QrDian =
  | {
      formato: 'campos';
      numFac: string | null;
      fecha: string | null;
      nitComercio: string | null;
      montoTotal: number | null;
      iva: number | null;
      cufe: string;
      urlVerificacion: string;
    }
  | { formato: 'url'; cufe: string; urlVerificacion: string }
  | { formato: 'invalido'; motivo: string };

const HOSTS_DIAN: readonly string[] = [
  'catalogo-vpfe.dian.gov.co',
  'catalogo-vpfe-hab.dian.gov.co',
];

const PATRON_CUFE = /^[0-9a-fA-F]{96}$/;

const CAMPOS_CONOCIDOS = new Set([
  'numfac',
  'fecfac',
  'horfac',
  'nitfac',
  'docadq',
  'valfac',
  'valiva',
  'valotroim',
  'valtolfac',
  'cufe',
  'cude',
]);

export function urlVerificacionDian(cufe: string, host = 'catalogo-vpfe.dian.gov.co'): string {
  return `https://${host}/document/searchqr?documentkey=${cufe}`;
}

function esCufe(valor: string): boolean {
  return PATRON_CUFE.test(valor);
}

function textoONulo(campos: Map<string, string>, clave: string): string | null {
  const valor = campos.get(clave);
  return valor === undefined || valor === '' ? null : valor;
}

/** Extrae CUFE y host de una URL DIAN válida, o null si el token no lo es. */
function analizarUrl(token: string): { cufe: string; host: string } | null {
  if (!token.startsWith('http://') && !token.startsWith('https://')) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(token);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!HOSTS_DIAN.includes(host)) {
    return null;
  }

  let cufe: string | null = null;
  for (const [clave, valor] of url.searchParams) {
    if (clave.toLowerCase() === 'documentkey' && esCufe(valor)) {
      cufe = valor.toLowerCase();
      break;
    }
  }
  if (cufe === null) {
    const segmentos = url.pathname.split('/').filter((segmento) => segmento !== '');
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo !== undefined && esCufe(ultimo)) {
      cufe = ultimo.toLowerCase();
    }
  }
  return cufe === null ? null : { cufe, host };
}

function indiceSeparador(linea: string): number {
  const dosPuntos = linea.indexOf(':');
  const igual = linea.indexOf('=');
  if (dosPuntos < 0) {
    return igual;
  }
  if (igual < 0) {
    return dosPuntos;
  }
  return Math.min(dosPuntos, igual);
}

/** Lee el CUFE/CUDE declarado en los campos, siempre en minúsculas. */
function cufeDeCampos(campos: Map<string, string>): string | null {
  for (const clave of ['cufe', 'cude']) {
    const valor = campos.get(clave);
    if (valor !== undefined && esCufe(valor)) {
      return valor.toLowerCase();
    }
  }
  return null;
}

/**
 * Parsea el texto de un QR DIAN en formato campos o solo URL. Nunca lanza por
 * contenido inválido: devuelve `{ formato: 'invalido' }`.
 */
export function parsearQrDian(texto: string): QrDian {
  const campos = new Map<string, string>();
  let urlDian: { cufe: string; host: string } | null = null;

  for (const lineaCruda of texto.split(/\r?\n/)) {
    const linea = lineaCruda.trim();
    if (linea === '') {
      continue;
    }
    for (const token of linea.split(/\s+/)) {
      const analizada = analizarUrl(token);
      if (analizada !== null && urlDian === null) {
        urlDian = analizada;
      }
    }
    if (linea.startsWith('http://') || linea.startsWith('https://')) {
      continue;
    }
    const separador = indiceSeparador(linea);
    if (separador < 0) {
      continue;
    }
    const clave = linea.slice(0, separador).trim().toLowerCase();
    if (!CAMPOS_CONOCIDOS.has(clave) || campos.has(clave)) {
      continue;
    }
    campos.set(clave, linea.slice(separador + 1).trim());
  }

  const cufe = cufeDeCampos(campos);
  if (cufe !== null) {
    if (urlDian !== null && urlDian.cufe !== cufe) {
      return { formato: 'invalido', motivo: 'El CUFE del QR no coincide con su enlace' };
    }
    const fechaTexto = campos.get('fecfac');
    return {
      formato: 'campos',
      numFac: textoONulo(campos, 'numfac'),
      fecha: fechaTexto !== undefined && esFechaCivil(fechaTexto) ? fechaTexto : null,
      nitComercio: textoONulo(campos, 'nitfac'),
      montoTotal: decimalAPesos(campos.get('valtolfac') ?? ''),
      iva: decimalAPesos(campos.get('valiva') ?? ''),
      cufe,
      urlVerificacion:
        urlDian !== null
          ? urlVerificacionDian(cufe, urlDian.host)
          : urlVerificacionDian(cufe),
    };
  }

  if (urlDian !== null) {
    return {
      formato: 'url',
      cufe: urlDian.cufe,
      urlVerificacion: urlVerificacionDian(urlDian.cufe, urlDian.host),
    };
  }

  return { formato: 'invalido', motivo: 'No es un QR de factura electrónica DIAN' };
}
