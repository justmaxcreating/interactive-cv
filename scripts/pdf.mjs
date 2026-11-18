// Renders both CV PDFs (and the OG image) with Playwright Chromium.
// npm run pdf                                  -> dist/max/cv/*.pdf
// npm run pdf -- --variant=solutions_engineer  -> out/variants/*_solutions_engineer.pdf
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { build, argVariant, KEYWORDS } from './build.mjs';
import { PDF_FILES } from '../src/render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const variant = argVariant();
const { content, prints } = await build({ variant });

const outDir = variant ? path.join(ROOT, 'out', 'variants') : path.join(ROOT, 'dist', 'max', 'cv');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const results = [];

for (const lang of ['en', 'de']) {
  const c = content[lang];
  await page.goto(pathToFileURL(prints[lang]).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const raw = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true });

  const doc = await PDFDocument.load(raw);
  doc.setTitle(c.meta.pdf_title, { showInWindowTitleBar: true });
  doc.setAuthor(c.contact.name);
  doc.setSubject(c.meta.pdf_subject);
  doc.setKeywords(KEYWORDS);
  doc.setCreator('Maximilian Nitsche');
  doc.setProducer('Playwright Chromium + pdf-lib');
  doc.setLanguage(c.locale);
  const pages = doc.getPageCount();
  const name = PDF_FILES[lang].replace('.pdf', variant ? `_${variant}.pdf` : '.pdf');
  await fs.writeFile(path.join(outDir, name), await doc.save());
  results.push({ name, pages });
}

// Open Graph image 1200 x 630
if (!variant) {
  const c = content.en;
  const fonts = pathToFileURL(path.join(ROOT, 'dist', 'max', 'assets', 'fonts')).href;
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<!doctype html><html><head><style>
    @font-face{font-family:M;font-weight:800;src:url('${fonts}/manrope-800.woff2')}
    @font-face{font-family:M;font-weight:600;src:url('${fonts}/manrope-600.woff2')}
    @font-face{font-family:S;font-style:italic;src:url('${fonts}/instrument-serif-400-italic.woff2')}
    body{margin:0;width:1200px;height:630px;background:#F2F0EA;color:#0D0D0D;font-family:M;display:flex;flex-direction:column;justify-content:flex-end;padding:72px 80px;box-sizing:border-box;
      background-image:linear-gradient(to right,rgba(209,209,199,.6) 1px,transparent 1px),linear-gradient(to bottom,rgba(209,209,199,.6) 1px,transparent 1px);background-size:128px 128px}
    .e{font-weight:800;font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:#800020;margin-bottom:28px}
    h1{font-weight:800;font-size:124px;line-height:.9;letter-spacing:-.03em;text-transform:uppercase;margin:0}
    h1 span{font-family:S;font-weight:400;text-transform:none;color:#800020;letter-spacing:0;font-size:1.08em}
    p{font-weight:600;font-size:24px;margin:32px 0 0;color:#55554F}
  </style></head><body><div class="e">${c.contact.title.replace('&', '&amp;')}</div><h1>Maximilian<br><span>Nitsche.</span></h1><p>elevion.studio/max</p></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(ROOT, 'dist', 'max', 'assets', 'og.jpg'));
}

await browser.close();
for (const r of results) console.log(`${r.pages > 2 ? 'TOO LONG' : 'ok'}  ${r.name}: ${r.pages} page(s)`);
console.log(`Output: ${path.relative(ROOT, outDir)}`);
if (results.some((r) => r.pages > 2)) process.exitCode = 1;
