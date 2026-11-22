// Revisa cada mockup a 390x844: axe (WCAG 2.2 AA) y objetivos táctiles >= 44x44px.
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2] || 'design/mockups';
if (!fs.existsSync(dir)) { console.log(`Sin ${dir}: nada que revisar`); process.exit(0); }
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort();
if (!files.length) { console.log('Sin mockups HTML'); process.exit(0); }
const { chromium } = await import('playwright');
const { default: AxeBuilder } = await import('@axe-core/playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
// Los mockups son estáticos: solo se permite leer archivos locales, nunca la red.
await ctx.route('**/*', ruta => (ruta.request().url().startsWith('file:') ? ruta.continue() : ruta.abort()));
let fallas = 0;
for (const f of files) {
  const p = await ctx.newPage();
  await p.goto('file://' + path.resolve(dir, f));
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const chicos = await p.$$eval('a,button,input,select,textarea,[role=button]', els => els.filter(e => {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || e.type === 'radio' || e.type === 'checkbox' || e.type === 'hidden') return false;
    return r.width < 44 || r.height < 44;
  }).map(e => (e.tagName + ' ' + (e.getAttribute('aria-label') || e.innerText || e.id || '')).trim().slice(0, 60)));
  const hscroll = await p.evaluate(() => document.documentElement.scrollWidth > 390);
  // Regla del bug 2026-11-22 (docs/bug-rules/2026-11-22-pr1-cta-tapado-por-barra.md):
  // 1) cada control, llevado al centro de la pantalla, no puede quedar tapado por otro elemento;
  // 2) los controles con data-sin-scroll tienen que verse completos y libres sin scrollear.
  const tapados = await p.evaluate(() => {
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
    const libre = e => {
      const r = e.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      // Fuera de la pantalla a propósito (ej. enlace "Saltar al contenido" hasta recibir foco): no aplica.
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return !e.matches('[data-sin-scroll]');
      const t = document.elementFromPoint(cx, cy);
      if (!t) return false;
      const labels = e.labels ? [...e.labels] : [];
      return e.contains(t) || t.contains(e) || labels.some(l => l.contains(t) || t.contains(l));
    };
    const nombre = e => (e.tagName + ' ' + (e.getAttribute('aria-label') || e.innerText || e.id || '')).trim().slice(0, 60);
    const out = [];
    const els = [...document.querySelectorAll('a,button,input,select,textarea,[role=button]')].filter(visible);
    window.scrollTo(0, 0);
    for (const e of els.filter(e => e.hasAttribute('data-sin-scroll'))) {
      const r = e.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight || !libre(e)) out.push('sin-scroll: ' + nombre(e));
    }
    for (const e of els) {
      if (getComputedStyle(e).position === 'fixed' || e.closest('nav')) continue;
      e.scrollIntoView({ block: 'center', inline: 'nearest' });
      if (!libre(e)) out.push(nombre(e));
    }
    window.scrollTo(0, 0);
    return out;
  });
  const v = r.violations.map(x => `${x.id}(${x.impact})x${x.nodes.length}`);
  const ok = !v.length && !chicos.length && !hscroll && !tapados.length;
  if (!ok) fallas++;
  console.log(`${ok ? 'OK ' : 'FAIL'} ${f}${v.length ? ' axe: ' + v.join(',') : ''}${chicos.length ? ' <44px: ' + chicos.join(' | ') : ''}${hscroll ? ' scroll horizontal' : ''}${tapados.length ? ' tapados: ' + tapados.join(' | ') : ''}`);
  await p.close();
}
await b.close();
process.exit(fallas ? 1 : 0);
