// Verifica que los enlaces relativos en .md y .html apunten a archivos que existen.
import fs from 'node:fs';
import path from 'node:path';
const IGNORAR = new Set(['node_modules', '.git', 'odd', '.atl']);
const archivos = [];
(function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p);
    else if (/\.(md|html)$/.test(e.name)) archivos.push(p);
  }
})('.');
const rotos = [];
for (const f of archivos) {
  const txt = fs.readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
  const re = f.endsWith('.md') ? /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g : /(?:href|src)="([^"]+)"/g;
  for (const m of txt.matchAll(re)) {
    let u = m[1];
    if (/^(https?:|mailto:|tel:|#|data:|javascript:)/.test(u)) continue;
    u = decodeURIComponent(u.split('#')[0].split('?')[0]);
    if (!u) continue;
    const destino = u.startsWith('/') ? path.join('.', u) : path.join(path.dirname(f), u);
    if (!fs.existsSync(destino)) rotos.push(`${f}: ${m[1]}`);
  }
}
if (rotos.length) { console.error('Enlaces rotos:\n' + rotos.join('\n')); process.exit(1); }
console.log(`OK: ${archivos.length} archivos sin enlaces relativos rotos`);
