// Revisa los mockups de <raiz>/design/mockups a 390x844:
// axe (WCAG 2.2 AA), objetivos táctiles >= 44x44 px, scroll horizontal,
// controles tapados y CTA principal visible sin scroll.
//
// El HTML del PR es solo dato y nada del mockup se ejecuta:
//   1. Preflight estático: falla si el HTML trae <script>, atributos on*,
//      href/src "javascript:" o <iframe>/<object>/<embed>.
//   2. Las medidas corren en un contexto con javaScriptEnabled: false.
//   3. axe corre en un contexto aparte con JS habilitado porque axe-core usa
//      timers y Chromium los suspende cuando la ejecución de scripts está
//      deshabilitada. Ese contexto solo recibe documentos que pasaron el
//      preflight (sin código ejecutable), aborta toda solicitud que no sea
//      file: y bloquea service workers.
import fs from 'node:fs';
import path from 'node:path';

const ANCHO = 390;
const ALTO = 844;
const ETIQUETAS_AXE = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const MIN_JUSTIFICACION = 10;

let raiz = '.';
let archivoReporte = null;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--reporte') archivoReporte = args[++i] ?? null;
  else if (args[i].startsWith('--reporte=')) archivoReporte = args[i].slice('--reporte='.length);
  else if (!args[i].startsWith('--')) raiz = args[i];
}

const dir = path.join(raiz, 'design', 'mockups');
const existeDir = fs.existsSync(dir) && fs.statSync(dir).isDirectory();
const html = existeDir
  ? fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.html')).sort()
  : [];
const hayReadme = existeDir && fs.existsSync(path.join(dir, 'README.md'));

const reporte = { raiz, fallas: 0, archivos: {} };

function escribirReporte() {
  if (!archivoReporte) return;
  const destino = path.resolve(archivoReporte);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(reporte, null, 2) + '\n');
}

// --- Preflight: el mockup no puede traer código ejecutable --------------------

// Etiquetas capaces de cargar o embeber otro documento.
const ETIQUETAS_PROHIBIDAS = new Set(['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet']);

function codigoEjecutable(txt) {
  const hallazgos = new Set();
  // Comentarios y CDATA son inertes: no se inspeccionan.
  const limpio = txt
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  // Solo etiquetas reales: el texto suelto no cuenta como atributo.
  for (const etiqueta of limpio.matchAll(/<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const nombre = etiqueta[1].toLowerCase();
    if (ETIQUETAS_PROHIBIDAS.has(nombre)) hallazgos.add(`<${nombre}>`);
    for (const atributo of etiqueta[2].matchAll(/(?:^|\s)([a-zA-Z_][\w:.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g)) {
      const clave = atributo[1].toLowerCase();
      const valor = atributo[2].replace(/^["']|["']$/g, '').trim();
      if (/^on[a-z]+$/.test(clave)) hallazgos.add(`atributo ${clave}`);
      else if ((clave === 'href' || clave === 'src') && /^javascript:/i.test(valor)) {
        hallazgos.add(`${clave}="javascript:"`);
      }
    }
  }
  return [...hallazgos];
}

if (!html.length) {
  if (hayReadme) {
    console.error(`FAIL: ${path.join(dir, 'README.md')} declara mockups pero no hay archivos HTML`);
    reporte.fallas = 1;
    reporte.motivo = 'README sin HTML';
    escribirReporte();
    process.exit(1);
  }
  console.log('::notice::sin mockups, no aplica');
  escribirReporte();
  process.exit(0);
}

const inocentes = [];
for (const archivo of html) {
  const hallazgos = codigoEjecutable(fs.readFileSync(path.join(dir, archivo), 'utf8'));
  if (!hallazgos.length) {
    inocentes.push(archivo);
    continue;
  }
  reporte.fallas++;
  reporte.archivos[archivo] = { codigoProhibido: hallazgos };
  console.log(`FAIL ${archivo} el mockup trae código ejecutable: ${hallazgos.join(', ')}`);
}

if (!inocentes.length) {
  escribirReporte();
  console.error(`${reporte.fallas} de ${html.length} mockups con fallas`);
  process.exit(1);
}

// --- Navegador -------------------------------------------------------------

const { chromium } = await import('playwright');
const { default: axe } = await import('axe-core');
// Código del verificador (axe fijado por lockfile), no del mockup: se inyecta
// por CDP (page.evaluate), que no es un <script> de la página.
const fuenteAxe = axe.source;

const navegador = await chromium.launch();
const nuevoContexto = js => navegador.newContext({
  viewport: { width: ANCHO, height: ALTO },
  isMobile: true,
  hasTouch: true,
  javaScriptEnabled: js,
  serviceWorkers: 'block',
});
// Los mockups son estáticos: solo se permite leer archivos locales, nunca la red.
const soloArchivos = contexto => contexto.route(
  '**/*',
  ruta => (ruta.request().url().startsWith('file:') ? ruta.continue() : ruta.abort()),
);

const contextoMedidas = await nuevoContexto(false);
const contextoAxe = await nuevoContexto(true);
await soloArchivos(contextoMedidas);
await soloArchivos(contextoAxe);

async function violacionesAxe(url) {
  const pagina = await contextoAxe.newPage();
  try {
    await pagina.goto(url);
    const ejecutables = await pagina.evaluate(
      () => document.querySelectorAll('script,iframe,frame,frameset,object,embed,applet').length,
    );
    if (ejecutables) throw new Error(`${ejecutables} elementos ejecutables llegaron al DOM`);
    await pagina.evaluate(fuenteAxe);
    return await pagina.evaluate(async etiquetas => {
      const resultado = await window.axe.run(document, { runOnly: { type: 'tag', values: etiquetas } });
      return resultado.violations.map(v => ({
        id: v.id,
        impacto: v.impact,
        ayuda: v.help,
        nodos: v.nodes.map(n => n.target.join(' ')),
      }));
    }, ETIQUETAS_AXE);
  } finally {
    await pagina.close();
  }
}

for (const archivo of inocentes) {
  const esIndex = archivo.toLowerCase() === 'index.html';
  const url = 'file://' + path.resolve(dir, archivo);
  const pagina = await contextoMedidas.newPage();
  try {
    await pagina.goto(url);

    const violaciones = await violacionesAxe(url);

    const datos = await pagina.evaluate(({ ancho, alto, esIndex, minJustificacion }) => {
      const resultado = { chicos: [], hscroll: false, tapados: [], sinScroll: [], fijos: [], sinCta: null };

      const visible = e => {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || e.type === 'hidden') return false;
        if (e.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
        const d = e.closest('details:not([open])');
        if (d && !e.closest('summary')) return false;
        for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
        }
        return true;
      };

      const nombre = e => {
        const texto = (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        if (texto) return texto;
        return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}`;
      };

      const dueno = (e, t) => {
        if (!t) return false;
        if (e.contains(t) || t.contains(e)) return true;
        const etiquetas = e.labels ? [...e.labels] : [];
        return etiquetas.some(l => l.contains(t) || t.contains(l));
      };

      // Fijo o sticky propio o de algún ancestro: el control queda siempre en pantalla.
      const esFijo = e => {
        for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
          const pos = getComputedStyle(n).position;
          if (pos === 'fixed' || pos === 'sticky') return true;
        }
        return false;
      };

      const controles = [...document.querySelectorAll('a,button,input,select,textarea,[role=button]')];
      const visibles = controles.filter(visible);

      // Una pantalla sin CTA puede omitirlo solo con justificación en <body>.
      if (!esIndex && !document.querySelector('[data-sin-scroll]')) {
        const justificacion = (document.body.getAttribute('data-sin-cta') ?? '').trim().replace(/\s+/g, ' ');
        resultado.sinCta = {
          presente: document.body.hasAttribute('data-sin-cta'),
          justificacion,
          falta: justificacion.length < minJustificacion,
        };
      }

      resultado.hscroll = document.documentElement.scrollWidth > ancho;

      // Tamaño: para radio/checkbox el objetivo real es su etiqueta; alcanza con que
      // el control o cualquiera de sus etiquetas visibles llegue a 44x44.
      for (const e of controles) {
        if (!visible(e)) continue;
        const objetivos = [e];
        if (e.type === 'radio' || e.type === 'checkbox') {
          for (const l of e.labels || []) objetivos.push(l);
          const envolvente = e.closest('label');
          if (envolvente) objetivos.push(envolvente);
        }
        const alcanza = objetivos.some(o => {
          if (!visible(o)) return false;
          const r = o.getBoundingClientRect();
          return r.width >= 44 && r.height >= 44;
        });
        if (!alcanza) resultado.chicos.push(nombre(e));
      }

      window.scrollTo(0, 0);

      // Los controles fijos/sticky deben entrar completos en el viewport.
      for (const e of visibles) {
        if (!esFijo(e)) continue;
        const r = e.getBoundingClientRect();
        if (r.left < -0.5 || r.top < -0.5 || r.right > ancho + 0.5 || r.bottom > alto + 0.5) {
          resultado.fijos.push(nombre(e));
        }
      }

      // CTA principal: completo en el viewport, sin scroll y sin tapadores,
      // con las 4 esquinas y el centro libres (inset 2px).
      for (const e of controles.filter(el => el.hasAttribute('data-sin-scroll'))) {
        if (!visible(e)) {
          resultado.sinScroll.push(`${nombre(e)} (no visible)`);
          continue;
        }
        const r = e.getBoundingClientRect();
        const dentro = r.left >= -0.5 && r.top >= -0.5 && r.right <= ancho + 0.5 && r.bottom <= alto + 0.5;
        if (!dentro) {
          resultado.sinScroll.push(nombre(e));
          continue;
        }
        const puntos = [
          [r.left + 2, r.top + 2],
          [r.right - 2, r.top + 2],
          [r.left + 2, r.bottom - 2],
          [r.right - 2, r.bottom - 2],
          [r.left + r.width / 2, r.top + r.height / 2],
        ];
        if (puntos.some(([x, y]) => !dueno(e, document.elementFromPoint(x, y)))) {
          resultado.sinScroll.push(`${nombre(e)} (tapado)`);
        }
      }

      // Cada control, al centro de la pantalla, no puede quedar tapado por otro.
      for (const e of visibles) {
        if (esFijo(e)) continue;
        e.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = e.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // Fuera de la pantalla a propósito (ej. enlace "Saltar al contenido"): no aplica.
        if (cx < 0 || cy < 0 || cx > ancho || cy > alto) continue;
        if (!dueno(e, document.elementFromPoint(cx, cy))) resultado.tapados.push(nombre(e));
      }
      window.scrollTo(0, 0);

      return resultado;
    }, { ancho: ANCHO, alto: ALTO, esIndex, minJustificacion: MIN_JUSTIFICACION });

    const justificacionCta = datos.sinCta?.justificacion ?? '';
    const faltaCta = datos.sinCta?.falta ?? false;
    const falla = violaciones.length || datos.chicos.length || datos.hscroll ||
      datos.tapados.length || datos.sinScroll.length || datos.fijos.length || faltaCta;

    reporte.archivos[archivo] = {
      axe: violaciones,
      chicos: datos.chicos,
      hscroll: datos.hscroll,
      tapados: datos.tapados,
      sinScroll: datos.sinScroll,
      fijos: datos.fijos,
      sinCta: justificacionCta || null,
    };

    if (falla) {
      reporte.fallas++;
      const partes = [];
      if (violaciones.length) partes.push('axe: ' + violaciones.map(v => `${v.id}(${v.impacto})x${v.nodos.length}`).join(','));
      if (datos.chicos.length) partes.push('<44px: ' + datos.chicos.join(' | '));
      if (datos.hscroll) partes.push('scroll horizontal');
      if (datos.tapados.length) partes.push('tapados: ' + datos.tapados.join(' | '));
      if (datos.sinScroll.length) partes.push('sin-scroll: ' + datos.sinScroll.join(' | '));
      if (datos.fijos.length) partes.push('fijos fuera: ' + datos.fijos.join(' | '));
      if (faltaCta) {
        if (!datos.sinCta.presente) {
          partes.push(`sin CTA: falta [data-sin-scroll] y <body data-sin-cta> con al menos ${MIN_JUSTIFICACION} caracteres`);
        } else if (!justificacionCta) {
          partes.push(`sin CTA: <body data-sin-cta> vacío (mínimo ${MIN_JUSTIFICACION} caracteres)`);
        } else {
          partes.push(`sin CTA: justificación de ${justificacionCta.length} caracteres (mínimo ${MIN_JUSTIFICACION})`);
        }
      }
      console.log(`FAIL ${archivo} ${partes.join(' ')}`);
    } else {
      console.log(`OK ${archivo}${justificacionCta ? ` (sin CTA: "${justificacionCta}")` : ''}`);
    }
  } catch (error) {
    reporte.fallas++;
    reporte.archivos[archivo] = { error: error.message };
    console.error(`FAIL ${archivo} error: ${error.message}`);
  } finally {
    await pagina.close();
  }
}

await navegador.close();
escribirReporte();

if (reporte.fallas) {
  console.error(`${reporte.fallas} de ${html.length} mockups con fallas`);
  process.exit(1);
}
console.log(`OK: ${html.length} mockups sin fallas`);
