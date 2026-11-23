// Verifica que los enlaces relativos y las anclas de .md y .html bajo <raiz> sean válidos.
// El contenido del PR es solo dato: no se ejecuta nada, solo se lee texto.
// La contención corre antes de leer, con raiz-segura.mjs: se resuelve el destino
// real (fs.realpathSync) de la raíz y de cada entrada, y un enlace simbólico que
// sale de la raíz (o roto) es una falla que detiene la lectura. Además, todo
// destino de enlace se valida también sobre su ruta real.
import fs from 'node:fs';
import path from 'node:path';
import { abrirRaiz, reportarViolaciones } from './raiz-segura.mjs';

const raizTexto = process.argv[2];

if (!raizTexto) {
  console.error('Uso: node check-links.mjs <raiz>');
  process.exit(2);
}

let raiz;
try {
  raiz = abrirRaiz(raizTexto);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const raizAbs = raiz.raizAbs;
const mostrar = raiz.mostrar;

const { entradas } = raiz.listar({ extensiones: ['.md', '.html'] });

if (reportarViolaciones(raiz.violaciones)) {
  console.error(`${raiz.violaciones.length} entrada(s) fuera de la raíz; no se leyó ningún archivo`);
  process.exit(1);
}

const archivos = entradas.map(e => e.real);
const rotos = [];

// --- Extracción de texto y enlaces -------------------------------------------

const quitarComentarios = txt => txt.replace(/<!--[\s\S]*?-->/g, '');

function quitarCodigoMd(txt) {
  return txt
    .replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
}

function enlacesDeMarkdown(txt) {
  const destinos = [];
  // [texto](destino "título") e imágenes ![alt](destino)
  for (const m of txt.matchAll(/!?\[[^\]]*\]\(\s*(<[^>\s]+>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g)) {
    destinos.push(m[1]);
  }
  // Definiciones de referencia: [etiqueta]: destino "título"
  for (const m of txt.matchAll(/^[ \t]{0,3}\[[^\]]+\]:[ \t]*(<[^>\s]+>|\S+)/gm)) {
    destinos.push(m[1]);
  }
  return destinos;
}

function enlacesDeHtml(txt) {
  const destinos = [];
  // href/src con comillas simples o dobles (sin confundir data-href o xlink:href).
  for (const m of txt.matchAll(/(?<![\w:-])(?:href|src)\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    destinos.push(m[2] ?? m[3]);
  }
  return destinos;
}

// --- Anclas ------------------------------------------------------------------

function textoPlanoMarkdown(txt) {
  return txt
    .replace(/<[^>]*>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/`([^`]*)`/g, '$1');
}

// Slug estilo GitHub: minúsculas, sin puntuación salvo - y _, espacios a -,
// conserva letras acentuadas y ñ.
function slug(texto) {
  return textoPlanoMarkdown(texto)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

// Encabezado Setext: la línea de texto (no vacía, sin abrir otro bloque) seguida
// de una línea de solo = o solo -. En CommonMark, --- después de un párrafo es
// un encabezado de nivel 2, no una regla horizontal.
const NO_ES_PARRAFO = /^[ \t]{0,3}(?:[-*+][ \t]|\d{1,9}[.)][ \t]|>|#{1,6}[ \t]|```|~~~|<!--)/;

function esSetext(lineas, i) {
  const subrayado = /^[ \t]{0,3}(=+|-+)[ \t]*$/.exec(lineas[i]);
  if (!subrayado) return null;
  const anterior = lineas[i - 1];
  if (anterior === undefined) return null;
  if (!anterior.trim()) return null;
  if (NO_ES_PARRAFO.test(anterior)) return null;
  return anterior.trim();
}

function anclasMarkdown(md) {
  const lineas = md.split('\n');
  const ocupados = new Set();
  const anclas = new Set();
  const agregar = texto => {
    const base = slug(texto);
    if (!base) return;
    let candidato = base;
    for (let n = 1; ocupados.has(candidato); n++) candidato = `${base}-${n}`;
    ocupados.add(candidato);
    anclas.add(candidato);
  };
  // Encabezado YAML inicial: su contenido no genera anclas.
  let desde = 0;
  if (lineas[0]?.trim() === '---') {
    const cierre = lineas.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (cierre > 0) desde = cierre + 1;
  }
  for (let i = desde; i < lineas.length; i++) {
    const atx = /^[ \t]{0,3}#{1,6}[ \t]+(.+)$/.exec(lineas[i]);
    if (atx) {
      agregar(atx[1].trim().replace(/[ \t]+#+$/, '').trim());
      continue;
    }
    const setext = esSetext(lineas, i);
    if (setext) agregar(setext);
  }
  return anclas;
}

function idsHtml(txt) {
  const ids = [];
  const reId = /(?<![\w:-])id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g;
  for (const m of txt.matchAll(reId)) ids.push(m[1] ?? m[2] ?? m[3]);
  const reName = /<a\b[^>]*\sname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
  for (const m of txt.matchAll(reName)) ids.push(m[1] ?? m[2] ?? m[3]);
  return ids;
}

const cacheAnclas = new Map();

function anclasDe(archivo, esMarkdown) {
  if (cacheAnclas.has(archivo)) return cacheAnclas.get(archivo);
  const txt = quitarComentarios(fs.readFileSync(archivo, 'utf8'));
  const anclas = new Set();
  if (esMarkdown) {
    for (const ancla of anclasMarkdown(quitarCodigoMd(txt))) anclas.add(ancla);
  }
  for (const id of idsHtml(txt)) if (id) anclas.add(id);
  cacheAnclas.set(archivo, anclas);
  return anclas;
}

// --- Validación ---------------------------------------------------------------

function validar(archivo, destinoCrudo) {
  let destino = destinoCrudo.trim();
  if (destino.startsWith('<') && destino.endsWith('>')) destino = destino.slice(1, -1).trim();
  if (!destino) return;
  if (/^(?:https?:|mailto:|tel:|data:|javascript:|ftp:)/i.test(destino)) return;
  if (destino.startsWith('//')) return;

  const iHash = destino.indexOf('#');
  let ruta = iHash >= 0 ? destino.slice(0, iHash) : destino;
  let ancla = iHash >= 0 ? destino.slice(iHash + 1) : null;
  const iQuery = ruta.indexOf('?');
  if (iQuery >= 0) ruta = ruta.slice(0, iQuery);

  try {
    ruta = decodeURIComponent(ruta);
    if (ancla !== null) ancla = decodeURIComponent(ancla);
  } catch {
    // Porcentaje inválido: se valida tal cual.
  }

  const destinoAbs = ruta === ''
    ? archivo
    : ruta.startsWith('/')
      ? path.resolve(raizAbs, '.' + ruta)
      : path.resolve(path.dirname(archivo), ruta);

  const etiqueta = mostrar(archivo);

  const dentroDeRaiz = p => p === raizAbs || p.startsWith(raizAbs + path.sep);
  if (!dentroDeRaiz(destinoAbs)) {
    rotos.push({ archivo: etiqueta, destino: destinoCrudo, motivo: 'sale de la raíz' });
    return;
  }
  if (!fs.existsSync(destinoAbs)) {
    rotos.push({ archivo: etiqueta, destino: destinoCrudo, motivo: 'no existe' });
    return;
  }
  // El destino real decide: un symlink que sale de la raíz no es un enlace válido.
  let destinoReal;
  try {
    destinoReal = fs.realpathSync(destinoAbs);
  } catch {
    rotos.push({ archivo: etiqueta, destino: destinoCrudo, motivo: 'el destino real no se puede resolver' });
    return;
  }
  if (!raiz.dentroReal(destinoReal)) {
    rotos.push({ archivo: etiqueta, destino: destinoCrudo, motivo: 'el destino real sale de la raíz (enlace simbólico)' });
    return;
  }

  if (ancla === null || ancla === '') return;

  const ext = path.extname(destinoReal).toLowerCase();
  if (ext !== '.md' && ext !== '.html') return;
  if (!fs.statSync(destinoReal).isFile()) return;

  const anclas = anclasDe(destinoReal, ext === '.md');
  if (!anclas.has(ancla)) {
    rotos.push({ archivo: etiqueta, destino: destinoCrudo, motivo: `falta el ancla #${ancla}` });
  }
}

for (const archivo of archivos) {
  const esMarkdown = archivo.toLowerCase().endsWith('.md');
  let txt = quitarComentarios(fs.readFileSync(archivo, 'utf8'));
  if (esMarkdown) txt = quitarCodigoMd(txt);
  const destinos = esMarkdown ? enlacesDeMarkdown(txt) : enlacesDeHtml(txt);
  for (const destino of destinos) validar(archivo, destino);
}

if (rotos.length) {
  console.error('Enlaces rotos:');
  for (const r of rotos) console.error(`${r.archivo}: ${r.destino} (${r.motivo})`);
  process.exit(1);
}
console.log(`OK: ${archivos.length} archivos sin enlaces relativos rotos`);
