// Linta los .md de <raiz> con las reglas del verificador.
// El contenido del PR es solo dato: nunca se leen configuraciones, reglas ni
// código de <raiz>; solo las reglas-markdownlint.json que viven junto a este script.
//
// La contención corre ANTES de leer: raiz-segura.mjs resuelve el destino real de
// la raíz y de cada .md; un enlace que sale de la raíz (o roto) es una falla y
// ese archivo no se entrega a markdownlint.
import fs from 'node:fs';
import { lint } from 'markdownlint/promise';
import { abrirRaiz, reportarViolaciones } from './raiz-segura.mjs';

const raizTexto = process.argv[2];

if (!raizTexto) {
  console.error('Uso: node lint-md.mjs <raiz>');
  process.exit(2);
}

let raiz;
try {
  raiz = abrirRaiz(raizTexto);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const { entradas } = raiz.listar({ extensiones: ['.md'] });

if (reportarViolaciones(raiz.violaciones)) {
  console.error(`${raiz.violaciones.length} entrada(s) fuera de la raíz; no se leyó ningún archivo`);
  process.exit(1);
}

const archivos = entradas.map(e => e.real);

if (!archivos.length) {
  console.log(`Sin archivos .md en ${raizTexto}`);
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
