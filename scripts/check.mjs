// Acceptance checks: PDF page count, text extraction (reading order), PNG per page,
// en/em dash scan over all project files, TODO list, WCAG contrast of the tokens.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mupdf from 'mupdf';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out', 'check');
await fs.mkdir(OUT, { recursive: true });
const DASHES = new RegExp('[\\u2013\\u2014]');
let failed = false;

async function walk(dir, acc = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'out', 'deploy'].includes(e.name) || e.name.startsWith('._')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// 1. PDFs
const pdfDirs = [path.join(ROOT, 'dist', 'max', 'cv'), path.join(ROOT, 'out', 'variants')];
for (const d of pdfDirs) {
  let files = [];
  try { files = (await fs.readdir(d)).filter((f) => f.endsWith('.pdf') && !f.startsWith('._')); } catch { continue; }
  for (const f of files) {
    const doc = mupdf.Document.openDocument(await fs.readFile(path.join(d, f)), 'application/pdf');
    const n = doc.countPages();
    let text = '';
    for (let i = 0; i < n; i++) {
      const pg = doc.loadPage(i);
      text += `\n===== page ${i + 1} =====\n` + pg.toStructuredText('preserve-whitespace').asText();
      const pix = pg.toPixmap(mupdf.Matrix.scale(1.6, 1.6), mupdf.ColorSpace.DeviceRGB, false);
      await fs.writeFile(path.join(OUT, `${f.replace('.pdf', '')}-p${i + 1}.png`), pix.asPNG());
    }
    await fs.writeFile(path.join(OUT, f.replace('.pdf', '.txt')), text);
    const meta = ['info:Title', 'info:Author', 'info:Subject', 'info:Keywords'].map((k) => `${k.slice(5)}=${doc.getMetaData(k) ? 'set' : 'MISSING'}`).join(' ');
    const dash = DASHES.test(text);
    if (n > 2 || dash) failed = true;
    console.log(`${n > 2 ? 'FAIL' : 'ok  '} ${f}: ${n} page(s), ${meta}${dash ? ', CONTAINS DASH' : ''}`);
  }
}

// 2. Dash scan over every text file we own
const textExt = /\.(html|css|js|mjs|json|md|txt|toml|svg|xml)$/i;
const hits = [];
for (const f of await walk(ROOT)) {
  if (!textExt.test(f) || f.endsWith('package-lock.json')) continue;
  const lines = (await fs.readFile(f, 'utf8')).split('\n');
  lines.forEach((l, i) => { if (DASHES.test(l)) hits.push(`${path.relative(ROOT, f)}:${i + 1}`); });
}
if (hits.length) { failed = true; console.log(`FAIL dash scan:\n  ${hits.join('\n  ')}`); }
else console.log('ok   dash scan: no en or em dashes in project files');

// 3. TODO placeholders
const todos = new Set();
for (const l of ['de', 'en']) {
  const raw = await fs.readFile(path.join(ROOT, 'content', `${l}.json`), 'utf8');
  for (const m of raw.matchAll(/\[\[TODO:([^\]]*)\]\]/g)) todos.add(`[${l}] ${m[1].trim()}`);
}
console.log(`\nTODO placeholders (${todos.size}):\n  ${[...todos].join('\n  ')}`);

// 4. Contrast of the color tokens (WCAG 2.x)
const lum = (hex) => {
  const [r, g, b] = hex.match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const pairs = [['#0D0D0D', '#F2F0EA'], ['#800020', '#F2F0EA'], ['#5E5E58', '#F2F0EA'], ['#5E5E58', '#E9E6DC'], ['#800020', '#E9E6DC'], ['#5E5E58', '#F7F5EF'], ['#F2F0EA', '#0D0D0D'], ['#F2F0EA', '#800020']];
console.log('\nContrast (AA needs 4.5):');
for (const [fg, bg] of pairs) {
  const r = ratio(fg, bg);
  if (r < 4.5) failed = true;
  console.log(`  ${r >= 4.5 ? 'ok  ' : 'FAIL'} ${fg} on ${bg}: ${r.toFixed(2)}`);
}
console.log(`\nPNG + text output: ${path.relative(ROOT, OUT)}`);
process.exitCode = failed ? 1 : 0;
