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
  const v = r.violations.map(x => `${x.id}(${x.impact})x${x.nodes.length}`);
  const ok = !v.length && !chicos.length && !hscroll;
  if (!ok) fallas++;
  console.log(`${ok ? 'OK ' : 'FAIL'} ${f}${v.length ? ' axe: ' + v.join(',') : ''}${chicos.length ? ' <44px: ' + chicos.join(' | ') : ''}${hscroll ? ' scroll horizontal' : ''}`);
  await p.close();
}
await b.close();
process.exit(fallas ? 1 : 0);
