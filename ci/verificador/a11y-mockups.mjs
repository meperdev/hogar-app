// Revisa los mockups de <raiz>/design/mockups a 390x844:
// axe (WCAG 2.2 AA), objetivos táctiles >= 44x44 px, scroll horizontal,
// controles tapados y CTA principal visible sin scroll.
//
// El HTML del PR es solo dato y el documento del PR NUNCA se carga con JavaScript
// habilitado:
//   1. Contención antes de leer: raiz-segura.mjs resuelve el destino real de la
//      raíz, de design/mockups y de cada HTML; un enlace que sale de la raíz o
//      está roto es una falla y no se lee.
//   2. Preflight estático: falla si el HTML trae <script>, atributos on*, href/src
//      "javascript:" o <iframe>/<object>/<embed>. Es un lint de mockups estáticos;
//      la garantía no depende de él.
//   3. Un único contexto con javaScriptEnabled: false carga el mockup. Las
//      medidas usan solo APIs síncronas del DOM vía CDP.
//   4. Cada solicitud del navegador —la navegación incluida— pasa por
//      raiz-segura.mjs: un file: se resuelve a ruta y realpath, y solo continúa si
//      el destino real queda dentro de la raíz real del PR. Cualquier otra cosa
//      (otro file:, http:, blob:, data: que no sea una imagen en línea, destino
//      inexistente) se aborta y cuenta como falla del mockup.
//   5. axe-core se inyecta desde el verificador (fijado por lockfile) con
//      page.evaluate: es código nuestro por CDP, no un <script> de la página, y
//      corre igual con los scripts de la página deshabilitados. Chromium suspende
//      los timers con JS deshabilitado, así que axe.run se ejecuta con una cola de
//      timers que el mismo evaluate vacía de forma síncrona (ver violacionesAxe).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { abrirRaiz, reportarViolaciones } from './raiz-segura.mjs';

const ANCHO = 390;
const ALTO = 844;
const ETIQUETAS_AXE = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const MIN_JUSTIFICACION = 10;
const TIMEOUT_ARCHIVO = 30_000;

let raizTexto = '.';
let archivoReporte = null;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--reporte') archivoReporte = args[++i] ?? null;
  else if (args[i].startsWith('--reporte=')) archivoReporte = args[i].slice('--reporte='.length);
  else if (!args[i].startsWith('--')) raizTexto = args[i];
}

const reporte = { raiz: raizTexto, fallas: 0, archivos: {} };

function escribirReporte() {
  if (!archivoReporte) return;
  const destino = path.resolve(archivoReporte);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(reporte, null, 2) + '\n');
}

function fallarPorContencion(violaciones) {
  if (!reportarViolaciones(violaciones)) return false;
  reporte.fallas = violaciones.length;
  reporte.motivo = 'contención de rutas';
  reporte.violaciones = violaciones;
  escribirReporte();
  console.error(`${violaciones.length} entrada(s) fuera de la raíz; no se leyó ningún archivo`);
  return true;
}

let raiz;
try {
  raiz = abrirRaiz(raizTexto);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const dirRelativo = path.join('design', 'mockups');
const listado = raiz.listar({ desde: dirRelativo, extensiones: ['.html'] });

if (fallarPorContencion(raiz.violaciones)) process.exit(1);

const html = listado.entradas;
const hayReadme = listado.nombres.has('README.md');

if (!html.length) {
  if (hayReadme) {
    console.error(`FAIL: ${path.join(dirRelativo, 'README.md')} declara mockups pero no hay archivos HTML`);
    reporte.fallas = 1;
    reporte.motivo = 'README sin HTML';
    escribirReporte();
    process.exit(1);
  }
  console.log('::notice::sin mockups, no aplica');
  escribirReporte();
  process.exit(0);
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

const inocentes = [];
for (const entrada of html) {
  const hallazgos = codigoEjecutable(fs.readFileSync(entrada.real, 'utf8'));
  if (!hallazgos.length) {
    inocentes.push(entrada);
    continue;
  }
  reporte.fallas++;
  reporte.archivos[entrada.nombre] = { codigoProhibido: hallazgos };
  console.log(`FAIL ${entrada.nombre} el mockup trae código ejecutable: ${hallazgos.join(', ')}`);
}

if (!inocentes.length) {
  escribirReporte();
  console.error(`${reporte.fallas} de ${html.length} mockups con fallas`);
  process.exit(1);
}

// --- Navegador -------------------------------------------------------------

function conTimeout(promesa, etiqueta) {
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new Error(`timeout de ${TIMEOUT_ARCHIVO / 1000}s en ${etiqueta}`)),
      TIMEOUT_ARCHIVO,
    );
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

const { chromium } = await import('playwright');
const { default: axe } = await import('axe-core');
// Código del verificador (axe fijado por lockfile), no del mockup: se inyecta
// por CDP (page.evaluate), que no es un <script> de la página.
const fuenteAxe = axe.source;

const navegador = await chromium.launch();
// Un único contexto, con JavaScript deshabilitado. El documento del PR nunca se
// interpreta con JS habilitado; axe y las medidas entran por CDP.
const contexto = await navegador.newContext({
  viewport: { width: ANCHO, height: ALTO },
  isMobile: true,
  hasTouch: true,
  javaScriptEnabled: false,
  serviceWorkers: 'block',
});
// Cada solicitud del navegador se confina a la raíz real del PR; el handler
// también intercepta la navegación, así que el documento inicial pasa por acá.
// Lo bloqueado se anota contra el mockup en curso y lo vuelve una falla.
let mockupEnCurso = null;
const bloqueos = new Map();

function registrarBloqueo(url, motivo) {
  if (!mockupEnCurso) return;
  const previos = bloqueos.get(mockupEnCurso) ?? [];
  // Chromium puede repetir la misma solicitud; una sola entrada por URL y motivo.
  if (previos.some(b => b.url === url && b.motivo === motivo)) return;
  previos.push({ url, motivo });
  bloqueos.set(mockupEnCurso, previos);
}

await contexto.route('**/*', ruta => {
  const solicitud = ruta.request();
  const revision = raiz.revisarSolicitud(solicitud.url(), solicitud.resourceType());
  if (revision.permitir) return ruta.continue();
  registrarBloqueo(solicitud.url(), revision.motivo);
  return ruta.abort();
});

async function violacionesAxe(pagina) {
  return pagina.evaluate(async etiquetas => {
    // Chromium suspende setTimeout/setInterval/rAF cuando la ejecución de scripts
    // está deshabilitada, y axe.run los necesita. Se reemplazan por una cola que
    // este mismo evaluate vacía de forma síncrona, cediendo a las microtareas
    // entre vueltas. El documento del PR nunca tuvo JavaScript habilitado.
    const cola = [];
    const originales = {
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
      setInterval: window.setInterval,
      clearInterval: window.clearInterval,
      requestAnimationFrame: window.requestAnimationFrame,
      cancelAnimationFrame: window.cancelAnimationFrame,
    };
    const encolar = fn => {
      cola.push(fn);
      return cola.length;
    };
    window.setTimeout = encolar;
    window.setInterval = encolar;
    window.requestAnimationFrame = encolar;
    window.clearTimeout = () => {};
    window.clearInterval = () => {};
    window.cancelAnimationFrame = () => {};
    try {
      let listo = false;
      let salida = null;
      let error = null;
      window.axe
        .run(document, {
          runOnly: { type: 'tag', values: etiquetas },
          performanceTimer: false,
          iframes: false,
        })
        .then(resultado => {
          salida = resultado;
          listo = true;
        }, fallo => {
          error = fallo;
          listo = true;
        });
      let vueltas = 0;
      while (!listo && vueltas++ < 200_000) {
        const pendientes = cola.splice(0, cola.length);
        for (const fn of pendientes) {
          try {
            fn(performance.now());
          } catch {
            // Un timer roto no debe colgar la medición; axe reporta su propio error.
          }
        }
        await null;
      }
      if (!listo) throw new Error(`axe no terminó en ${vueltas} vueltas`);
      if (error) throw error;
      return salida.violations.map(v => ({
        id: v.id,
        impacto: v.impact,
        ayuda: v.help,
        nodos: v.nodes.map(n => n.target.join(' ')),
      }));
    } finally {
      window.setTimeout = originales.setTimeout;
      window.clearTimeout = originales.clearTimeout;
      window.setInterval = originales.setInterval;
      window.clearInterval = originales.clearInterval;
      window.requestAnimationFrame = originales.requestAnimationFrame;
      window.cancelAnimationFrame = originales.cancelAnimationFrame;
    }
  }, ETIQUETAS_AXE);
}

for (const entrada of inocentes) {
  const archivo = entrada.nombre;
  const esIndex = archivo.toLowerCase() === 'index.html';
  const url = pathToFileURL(entrada.real).href;
  // La navegación se confina antes de pedirla, con la misma frontera del handler.
  const navegacion = raiz.revisarSolicitud(url, 'document');
  if (!navegacion.permitir) {
    reporte.fallas++;
    reporte.archivos[archivo] = { error: `navegación bloqueada: ${navegacion.motivo}` };
    console.error(`FAIL ${archivo} navegación bloqueada: ${navegacion.motivo} (${url})`);
    continue;
  }
  mockupEnCurso = archivo;
  const pagina = await contexto.newPage();
  try {
    const { violaciones, datos } = await conTimeout(
      (async () => {
        await pagina.goto(url);
        const ejecutables = await pagina.evaluate(
          () => document.querySelectorAll('script,iframe,frame,frameset,object,embed,applet').length,
        );
        if (ejecutables) throw new Error(`${ejecutables} elementos ejecutables llegaron al DOM`);
        await pagina.evaluate(fuenteAxe);
        const violaciones = await violacionesAxe(pagina);
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
        return { violaciones, datos };
      })(),
      archivo,
    );

    const justificacionCta = datos.sinCta?.justificacion ?? '';
    const faltaCta = datos.sinCta?.falta ?? false;
    const bloqueadas = bloqueos.get(archivo) ?? [];
    const falla = bloqueadas.length || violaciones.length || datos.chicos.length || datos.hscroll ||
      datos.tapados.length || datos.sinScroll.length || datos.fijos.length || faltaCta;

    reporte.archivos[archivo] = {
      axe: violaciones,
      chicos: datos.chicos,
      hscroll: datos.hscroll,
      tapados: datos.tapados,
      sinScroll: datos.sinScroll,
      fijos: datos.fijos,
      sinCta: justificacionCta || null,
      bloqueadas,
    };

    if (falla) {
      reporte.fallas++;
      const partes = [];
      if (violaciones.length) partes.push('axe: ' + violaciones.map(v => `${v.id}(${v.impacto})x${v.nodos.length}`).join(','));
      if (bloqueadas.length) {
        partes.push('recursos bloqueados fuera de la raíz real: ' +
          bloqueadas.map(b => `${b.motivo} (${b.url})`).join(' | '));
      }
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
    mockupEnCurso = null;
    await pagina.close().catch(() => {});
  }
}

await navegador.close();
escribirReporte();

if (reporte.fallas) {
  console.error(`${reporte.fallas} de ${html.length} mockups con fallas`);
  process.exit(1);
}
console.log(`OK: ${html.length} mockups sin fallas`);
