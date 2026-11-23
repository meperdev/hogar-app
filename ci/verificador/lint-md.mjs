// Linta los .md de <raiz> con las reglas del verificador.
// El contenido del PR es solo dato: nunca se leen configuraciones, reglas ni
// código de <raiz>; solo las reglas-markdownlint.json que viven junto a este script.
import fs from 'node:fs';
import path from 'node:path';
import { lint } from 'markdownlint/promise';

const IGNORAR = new Set(['node_modules', '.git', 'odd', '.atl']);
const raiz = process.argv[2];

if (!raiz) {
  console.error('Uso: node lint-md.mjs <raiz>');
  process.exit(2);
}
if (!fs.existsSync(raiz) || !fs.statSync(raiz).isDirectory()) {
  console.error(`No existe la raíz: ${raiz}`);
  process.exit(2);
}

const archivos = [];
(function recorrer(dir) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(entrada.name)) continue;
    const p = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(p);
    else if (entrada.name.endsWith('.md')) archivos.push(p);
  }
})(raiz);
archivos.sort();

if (!archivos.length) {
  console.log(`Sin archivos .md en ${raiz}`);
  process.exit(0);
}

const reglas = JSON.parse(fs.readFileSync(new URL('./reglas-markdownlint.json', import.meta.url), 'utf8'));
// La API devuelve un objeto { archivo: [errores] }.
const resultados = await lint({ files: archivos, config: reglas });
const revisados = Object.keys(resultados).length;

const errores = [];
for (const [archivo, lista] of Object.entries(resultados)) {
  for (const error of lista) {
    errores.push({
      archivo,
      linea: error.lineNumber,
      regla: error.ruleNames.join('/'),
      descripcion: error.ruleDescription,
      detalle: error.errorDetail,
      contexto: error.errorContext,
    });
  }
}

if (!errores.length) {
  console.log(`OK: ${revisados} archivos Markdown sin errores`);
  process.exit(0);
}

for (const e of errores) {
  const detalle = e.detalle ? ` [${e.detalle}]` : '';
  const contexto = e.contexto ? ` (${e.contexto})` : '';
  console.log(`${e.archivo}:${e.linea} ${e.regla} ${e.descripcion}${detalle}${contexto}`);
}
console.error(`${errores.length} error(es) de Markdown en ${revisados} archivos`);
process.exit(1);
