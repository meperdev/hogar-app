// Verifica que los enlaces relativos y las anclas de .md y .html bajo <raiz> sean válidos.
// El contenido del PR es solo dato: no se ejecuta nada, solo se lee texto.
import fs from 'node:fs';
import path from 'node:path';

const IGNORAR = new Set(['node_modules', '.git', 'odd', '.atl']);
const raiz = process.argv[2];

if (!raiz) {
  console.error('Uso: node check-links.mjs <raiz>');
  process.exit(2);
}
const raizAbs = path.resolve(raiz);
if (!fs.existsSync(raizAbs) || !fs.statSync(raizAbs).isDirectory()) {
  console.error(`No existe la raíz: ${raiz}`);
  process.exit(2);
}

const archivos = [];
(function recorrer(dir) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(entrada.name)) continue;
    const p = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(p);
    else if (/\.(md|html)$/i.test(entrada.name)) archivos.push(p);
  }
})(raizAbs);
archivos.sort();

const dentroDeRaiz = p => p === raizAbs || p.startsWith(raizAbs + path.sep);
const mostrar = abs => path.join(raiz, path.relative(raizAbs, abs)) || raiz;

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
    const md = quitarCodigoMd(txt);
    const ocupados = new Set();
    for (const m of md.matchAll(/^[ \t]{0,3}#{1,6}[ \t]+(.+)$/gm)) {
      let texto = m[1].trim().replace(/[ \t]+#+$/, '').trim();
      const base = slug(texto);
      if (!base) continue;
      let candidato = base;
      for (let n = 1; ocupados.has(candidato); n++) candidato = `${base}-${n}`;
      ocupados.add(candidato);
      anclas.add(candidato);
    }
  }
  for (const id of idsHtml(txt)) if (id) anclas.add(id);
  cacheAnclas.set(archivo, anclas);
  return anclas;
}

// --- Validación ---------------------------------------------------------------

const rotos = [];

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

  if (!dentroDeRaiz(destinoAbs)) {
    rotos.push({ archivo: etiqueta, destino: destinoCrudo, motivo: 'sale de la raíz' });
    return;
  }
  if (!fs.existsSync(destinoAbs)) {
    rotos.push({ archivo: etiqueta, destino: destinoCrudo, motivo: 'no existe' });
    return;
  }
  if (ancla === null || ancla === '') return;

  const ext = path.extname(destinoAbs).toLowerCase();
  if (ext !== '.md' && ext !== '.html') return;
  if (!fs.statSync(destinoAbs).isFile()) return;

  const anclas = anclasDe(destinoAbs, ext === '.md');
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
