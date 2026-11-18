// Build: content/*.json -> dist/max (website) + .build/print-*.html (PDF sources).
// Usage: node scripts/build.mjs [--variant=solutions_engineer]
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { renderApp, esc, txt, BASE } from '../src/render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'max');
const BUILD = path.join(ROOT, '.build');
const MEDIA = path.join(ROOT, 'media');
const SITE_URL = 'https://elevion.studio/max/';
const LANGS = ['en', 'de'];
const IMG_EXT = /\.(jpe?g|png|webp|avif|tiff?)$/i;

export const KEYWORDS = [
  'Generative AI', 'LLM', 'Claude', 'OpenAI', 'AI agents', 'MCP', 'API integrations', 'workflow automation',
  'prompt engineering', 'solution design', 'customer-facing', 'discovery', 'demos', 'proofs of concept',
  'stakeholder management', 'performance marketing', 'Meta Ads', 'creative testing', 'marketing automation',
  'martech', 'data analysis', 'dashboards', 'reporting', 'Figma', 'generative media', 'image generation',
  'video generation', 'Make.com', 'n8n', 'Supabase'
];

export function argVariant(argv = process.argv) {
  const a = argv.find((x) => x.startsWith('--variant='));
  return a ? a.split('=')[1] : null;
}

// content/private.json (not in git) holds details that only belong in the PDFs, e.g. the phone number.
export async function loadContent(lang) {
  const c = JSON.parse(await fs.readFile(path.join(ROOT, 'content', `${lang}.json`), 'utf8'));
  const priv = path.join(ROOT, 'content', 'private.json');
  if (existsSync(priv)) {
    const p = JSON.parse(await fs.readFile(priv, 'utf8'));
    c.contact = { ...c.contact, ...(p.contact || {}) };
  }
  return c;
}

async function findImage(dir, base) {
  if (!existsSync(dir)) return null;
  const f = (await fs.readdir(dir)).find((n) => n.toLowerCase().startsWith(base) && IMG_EXT.test(n));
  return f ? path.join(dir, f) : null;
}

// One source image -> avif + webp at several widths + jpg fallback.
async function responsive(src, outBase, widths, ratio) {
  const meta = await sharp(src).metadata();
  const out = { avif: [], webp: [], fallback: '', w: 0, h: 0 };
  for (const w of widths) {
    const width = Math.min(w, meta.width);
    const height = ratio ? Math.round(width / ratio) : Math.round((meta.height / meta.width) * width);
    const pipe = () => sharp(src).rotate().resize(width, height, { fit: 'cover', position: 'attention' });
    const name = `${outBase}-${width}`;
    await pipe().avif({ quality: 55 }).toFile(path.join(DIST, 'assets', 'img', `${name}.avif`));
    await pipe().webp({ quality: 78 }).toFile(path.join(DIST, 'assets', 'img', `${name}.webp`));
    out.avif.push({ src: `${BASE}assets/img/${name}.avif`, w: width });
    out.webp.push({ src: `${BASE}assets/img/${name}.webp`, w: width });
    if (w === widths[0]) {
      await pipe().jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(DIST, 'assets', 'img', `${name}.jpg`));
      out.fallback = `${BASE}assets/img/${name}.jpg`;
      out.w = width; out.h = height;
    }
  }
  return out;
}

// Width and height of an MP4, read from its tkhd box (no ffprobe needed).
async function videoSize(file) {
  const buf = await fs.readFile(file);
  let w = 0, h = 0;
  for (let i = buf.indexOf('tkhd'); i !== -1; i = buf.indexOf('tkhd', i + 4)) {
    const version = buf[i + 4];
    const off = i + 4 + (version === 1 ? 92 : 80);
    const tw = buf.readUInt32BE(off) >>> 16, th = buf.readUInt32BE(off + 4) >>> 16;
    if (tw && th) { w = tw; h = th; break; }
  }
  return { w: w || 1440, h: h || 810 };
}

async function buildAssets(projects) {
  await fs.mkdir(path.join(DIST, 'assets', 'img'), { recursive: true });
  const assets = { portrait: null, shades: null, signature: null, projects: {}, clips: {}, reels: {} };
  const sigFile = path.join(MEDIA, 'signature.png');
  if (existsSync(sigFile)) {
    const out = path.join(DIST, 'assets', 'img', 'signature.webp');
    await fs.mkdir(path.dirname(out), { recursive: true });
    const info = await sharp(sigFile).trim().resize({ width: 480 }).webp({ quality: 82, alphaQuality: 90 }).toFile(out);
    assets.signature = { src: `${BASE}assets/img/signature.webp`, w: info.width, h: info.height };
  }
  const portrait = await findImage(MEDIA, 'portrait');
  if (portrait) {
    assets.portrait = await responsive(portrait, 'portrait', [280, 560], 4 / 5);
    await fs.mkdir(BUILD, { recursive: true });
    // 30 x 40 mm at 300 dpi for the PDF
    await sharp(portrait).rotate().resize(354, 472, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88 }).toFile(path.join(BUILD, 'portrait-print.jpg'));
  }
  // Easter egg: in light mode the portrait cross-fades to a version with sunglasses.
  const shades = await findImage(MEDIA, 'shades');
  if (shades && assets.portrait) assets.shades = await responsive(shades, 'shades', [280, 560], 4 / 5);
  for (const p of projects) {
    const dir = path.join(MEDIA, 'projects', p.id);
    if (!existsSync(dir)) continue;
    const files = (await fs.readdir(dir)).filter((n) => IMG_EXT.test(n) && !n.startsWith('.')).sort();
    if (existsSync(path.join(dir, 'demo.mp4'))) {
      // Pre-compressed screen recording (H.264, 1440 px). Copied as is.
      await fs.mkdir(path.join(DIST, 'assets', 'video'), { recursive: true });
      await fs.copyFile(path.join(dir, 'demo.mp4'), path.join(DIST, 'assets', 'video', `${p.id}.mp4`));
      const m = await videoSize(path.join(dir, 'demo.mp4'));
      assets.clips[p.id] = { src: `${BASE}assets/video/${p.id}.mp4`, w: m.w, h: m.h };
      if (existsSync(path.join(dir, 'card.mp4'))) {
        await fs.copyFile(path.join(dir, 'card.mp4'), path.join(DIST, 'assets', 'video', `${p.id}-card.mp4`));
        assets.clips[p.id].card = `${BASE}assets/video/${p.id}-card.mp4`;
      }
    }
    const reelDir = path.join(dir, 'reel');
    if (existsSync(reelDir)) {
      // Ad ticker: one small WebP per creative, 480 px high (2x for a 240 px row).
      const ads = (await fs.readdir(reelDir)).filter((n) => IMG_EXT.test(n) && !n.startsWith('.')).sort();
      assets.reels[p.id] = [];
      for (const [i, f] of ads.entries()) {
        const name = `${p.id}-reel-${String(i + 1).padStart(2, '0')}.webp`;
        const info = await sharp(path.join(reelDir, f)).rotate().resize({ height: 480, withoutEnlargement: true }).webp({ quality: 74 }).toFile(path.join(DIST, 'assets', 'img', name));
        assets.reels[p.id].push({ src: `${BASE}assets/img/${name}`, w: info.width, h: info.height });
      }
    }
    assets.projects[p.id] = [];
    for (const [i, f] of files.entries()) {
      assets.projects[p.id].push(await responsive(path.join(dir, f), `${p.id}-${i + 1}`, [720, 1440]));
    }
  }
  return assets;
}

async function copyFonts() {
  const dir = path.join(DIST, 'assets', 'fonts');
  await fs.mkdir(dir, { recursive: true });
  const fs1 = path.join(ROOT, 'node_modules', '@fontsource');
  const map = [
    ['manrope/files/manrope-latin-400-normal.woff2', 'manrope-400.woff2'],
    ['manrope/files/manrope-latin-500-normal.woff2', 'manrope-500.woff2'],
    ['manrope/files/manrope-latin-600-normal.woff2', 'manrope-600.woff2'],
    ['manrope/files/manrope-latin-800-normal.woff2', 'manrope-800.woff2'],
    ['instrument-serif/files/instrument-serif-latin-400-italic.woff2', 'instrument-serif-400-italic.woff2'],
    ['nothing-you-could-do/files/nothing-you-could-do-latin-400-normal.woff2', 'hand-400.woff2']
  ];
  for (const [from, to] of map) await fs.copyFile(path.join(fs1, from), path.join(dir, to));
}

function jsonLd(c) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: c.contact.name,
    jobTitle: c.contact.title,
    url: SITE_URL,
    email: `mailto:${c.contact.email}`,
    image: `${SITE_URL}assets/og.jpg`,
    address: { '@type': 'PostalAddress', addressLocality: 'Würzburg', addressCountry: 'DE' },
    sameAs: [c.contact.linkedin],
    alumniOf: { '@type': 'CollegeOrUniversity', name: 'Julius-Maximilians-Universität Würzburg' },
    knowsAbout: KEYWORDS,
    knowsLanguage: ['de', 'en']
  };
}

function siteHtml(en, de, assets) {
  const c = en;
  // No phone number on the website (spam protection): strip it from the embedded data.
  const web = (x) => ({ ...x, contact: { ...x.contact, phone: undefined } });
  const data = JSON.stringify({ en: web(en), de: web(de), assets }).replace(/</g, '\\u003c');
  const boot = `(function(){var d=document.documentElement;d.classList.add('js');var t=null;try{t=localStorage.getItem('cv-theme')}catch(e){}d.setAttribute('data-theme',t==='light'?'light':'dark');var l=null;try{l=new URLSearchParams(location.search).get('lang')}catch(e){}if(l!=='de'&&l!=='en'){try{l=localStorage.getItem('cv-lang')}catch(e){}}if(l!=='de'&&l!=='en'){l='en'}if(l!==d.lang){d.setAttribute('data-swap','');setTimeout(function(){d.removeAttribute('data-swap')},1500)}})();`;
  return `<!doctype html>
<html lang="${c.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.meta.title)}</title>
<meta name="description" content="${esc(c.meta.description)}">
<meta name="author" content="${esc(c.contact.name)}">
<meta name="theme-color" content="#F2F0EA">
<link rel="canonical" href="${SITE_URL}">
<link rel="alternate" hreflang="en" href="${SITE_URL}?lang=en">
<link rel="alternate" hreflang="de" href="${SITE_URL}?lang=de">
<link rel="alternate" hreflang="x-default" href="${SITE_URL}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(c.meta.title)}">
<meta property="og:description" content="${esc(c.meta.description)}">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:image" content="${SITE_URL}assets/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${en.meta.og_locale}">
<meta property="og:locale:alternate" content="${de.meta.og_locale}">
<meta property="profile:first_name" content="Maximilian">
<meta property="profile:last_name" content="Nitsche">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${BASE}assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="${BASE}assets/fonts/manrope-800.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${BASE}assets/fonts/instrument-serif-400-italic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${BASE}assets/fonts/manrope-500.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${BASE}assets/styles.css">
<link rel="modulepreload" href="${BASE}assets/js/render.js">
<script>${boot}</script>
<script type="application/ld+json">${JSON.stringify(jsonLd(c))}</script>
</head>
<body>
<a class="skip" href="#main">${esc(c.ui.skip)}</a>
<div id="progress" aria-hidden="true"></div>
<div class="noise" aria-hidden="true"></div>
<div id="app">
${renderApp(c, assets)}
</div>
<dialog class="dialog" id="project-dialog" aria-labelledby="dialog-title"><div id="dialog-body"></div></dialog>
<script type="application/json" id="cv-data">${data}</script>
<script type="module" src="${BASE}assets/js/site.js"></script>
</body>
</html>
`;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#F2F0EA"/><text x="10" y="46" font-family="Manrope, Arial, sans-serif" font-weight="800" font-size="38" fill="#0D0D0D">M</text><circle cx="52" cy="42" r="5" fill="#800020"/></svg>`;

/* ---------- Print template (ATS: single column, real text, standard headings) ---------- */
export function printHtml(c, { profile, portrait, fontsDir }) {
  const f = (file) => pathToFileURL(path.join(fontsDir, file)).href;
  const P = c.pdf;
  const jobs = c.experience
    .map((e) => {
      const org = `${e.company}${e.location ? ` (${e.location})` : ''}`;
      const lines = e.positions
        .map((p) => `<div class="line"><h3><strong>${txt(p.title)}</strong>, ${txt(org)}</h3><span class="dates">${esc(p.dates)}</span></div>`)
        .join('');
      return `<article class="job">${lines}
        ${e.description ? `<p class="desc">${txt(e.description)}</p>` : ''}
        <ul>${e.bullets.map((b) => `<li>${txt(b)}</li>`).join('')}</ul>
      </article>`;
    })
    .join('');
  const edu = c.education
    .map((e) => `<article class="job"><div class="line"><h3><strong>${txt(e.degree)}</strong>, ${txt(e.school)}</h3><span class="dates">${esc(e.dates)}</span></div>
      <ul>${e.bullets.map((b) => `<li>${txt(b)}</li>`).join('')}</ul></article>`)
    .join('');
  const skills = c.skills.map((g) => `<p class="skill"><strong>${esc(g.group)}:</strong> ${esc(g.items.join(', '))}</p>`).join('');
  const langs = c.languages.map((l) => `${esc(l.name)} (${esc(l.level)})`).join(', ');
  const photo = portrait
    ? `<img class="photo" src="${pathToFileURL(portrait).href}" alt="${esc(c.ui.portrait_alt)}">`
    : `<div class="photo photo-ph" aria-hidden="true"></div>`;
  const a = (href, label) => `<a href="${esc(href)}">${esc(label)}</a>`;
  return `<!doctype html>
<html lang="${c.lang}">
<head>
<meta charset="utf-8">
<title>${esc(c.meta.pdf_title)}</title>
<meta name="author" content="${esc(c.contact.name)}">
<style>
@font-face { font-family: 'Manrope'; font-weight: 400; src: url('${f('manrope-400.woff2')}') format('woff2'); }
@font-face { font-family: 'Manrope'; font-weight: 600; src: url('${f('manrope-600.woff2')}') format('woff2'); }
@font-face { font-family: 'Manrope'; font-weight: 800; src: url('${f('manrope-800.woff2')}') format('woff2'); }
@font-face { font-family: 'Instrument Serif'; font-style: italic; font-weight: 400; src: url('${f('instrument-serif-400-italic.woff2')}') format('woff2'); }
@page { size: A4; margin: 15mm 18mm 14mm; }
:root { --red: #800020; --black: #0D0D0D; --gray: #55554F; --border: #D1D1C7; }
* { box-sizing: border-box; }
html { background: #fff; }
body { margin: 0; font: 400 10pt/1.33 'Manrope', Arial, sans-serif; color: var(--black); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
a { color: var(--black); text-decoration: underline; text-decoration-color: rgba(128,0,32,.5); text-underline-offset: 1.5pt; }
header.cv { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; padding-bottom: 3.5mm; border-bottom: 1.2pt solid var(--red); margin-bottom: 3.5mm; }
h1 { font-weight: 800; font-size: 23pt; line-height: 1; letter-spacing: -.02em; text-transform: uppercase; margin: 0 0 2.2mm; }
.contact .role { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-size: 17pt; line-height: 1.1; color: var(--red); margin: 0 0 3.2mm; }
.contact p { margin: 0; font-size: 9pt; line-height: 1.55; }
.contact .sep { color: var(--border); padding: 0 1.6mm; }
.photo { width: 30mm; height: 40mm; object-fit: cover; border-radius: 1.2mm; flex: none; }
.photo-ph { background: repeating-linear-gradient(135deg, #E9E6DC 0 2mm, #E1DED3 2mm 4mm); border: .5pt solid var(--border); }
section { margin-bottom: 3mm; }
h2 { font-weight: 800; font-size: 9.5pt; letter-spacing: .05em; text-transform: uppercase; color: var(--red); margin: 0 0 2mm; padding-bottom: 1.1mm; border-bottom: .6pt solid var(--border); break-after: avoid; }
p { margin: 0; }
.job { margin-bottom: 2.3mm; }
.line { display: flex; justify-content: space-between; align-items: baseline; gap: 4mm; break-after: avoid; }
h3 { font-size: 10pt; font-weight: 400; margin: 0; }
h3 strong { font-weight: 800; }
.dates { font-size: 8.5pt; font-weight: 600; color: var(--gray); white-space: nowrap; }
.desc { color: var(--gray); font-size: 9pt; margin-top: .4mm; }
ul { margin: .8mm 0 0; padding-left: 4mm; }
li { margin-bottom: .45mm; break-inside: avoid; padding-left: .5mm; }
li::marker { color: var(--red); }
.skill { margin-bottom: .9mm; }
mark.todo { background: #FFE58A; font-weight: 600; }
.live { display: block; margin: 0 0 4.5mm; padding: 2.2mm 3.2mm 2.4mm; background: #F2F0EA; border-left: 1.2pt solid var(--red); border-radius: 0 1mm 1mm 0; font-size: 8.5pt; line-height: 1.35; }
.live-q { display: block; font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-size: 12pt; line-height: 1.15; color: var(--red); margin-bottom: .6mm; }
.live-cta { display: block; color: var(--gray); }
.live-cta a { font-weight: 600; }
</style>
</head>
<body>
<aside class="live"><span class="live-q">${esc(P.interactive_q)}</span><span class="live-cta">${esc(P.interactive_cta)} ${a(`${c.contact.website.replace(/\/?$/, "/")}?lang=${c.lang}`, c.contact.website_label)}</span></aside>
<header class="cv">
  <div class="contact">
    <h1>${esc(c.contact.name)}</h1>
    <p class="role">${esc(c.contact.title)}</p>
    <p>${esc(P.l_location)}: ${esc(c.contact.location)}</p>
    <p>${esc(P.l_email)}: ${a(`mailto:${c.contact.email}`, c.contact.email)}${c.contact.phone ? `<span class="sep">|</span>${esc(P.l_phone)}: ${a(`tel:${c.contact.phone.replace(/\s/g, '')}`, c.contact.phone)}` : ''}</p>
    <p>${esc(P.l_linkedin)}: ${a(c.contact.linkedin, c.contact.linkedin_label)}</p>
    <p>${esc(P.l_website)}: ${a(c.contact.website, c.contact.website_label)}</p>
  </div>
  ${photo}
</header>
<section><h2>${esc(P.h_profile)}</h2><p>${txt(profile)}</p></section>
<section><h2>${esc(P.h_experience)}</h2>${jobs}</section>
<section><h2>${esc(P.h_education)}</h2>${edu}</section>
<section><h2>${esc(P.h_skills)}</h2>${skills}</section>
<section><h2>${esc(P.h_languages)}</h2><p>${langs}</p></section>
<section><h2>${esc(P.h_interests)}</h2><p>${txt(c.interests)}</p></section>
</body>
</html>`;
}

// Offline copy that opens by double-click (file://): module scripts are blocked there,
// so render.js + site.js are inlined as one classic script and /max/ paths point into dist/max/.
async function localHtml(html) {
  const LOCAL = 'dist/max/';
  const render = (await fs.readFile(path.join(ROOT, 'src', 'render.js'), 'utf8'))
    .replace(/^export const BASE = '\/max\/';/m, `const BASE = '${LOCAL}';`)
    .replace(/^export /gm, '');
  const site = (await fs.readFile(path.join(ROOT, 'src', 'site.js'), 'utf8')).replace(/^import .*$/m, '');
  const js = `(function(){\n${render}\n${site}\n})();`.replace(/<\/script/gi, '<\\/script');
  return html
    .replace(/<link rel="(modulepreload|preload)"[^>]*>\n/g, '')
    .replace(/<script type="module" src="[^"]*"><\/script>/, () => `<script>${js}</script>`)
    .replace(/(^|[\s"'(,])\/max\//g, `$1${LOCAL}`);
}

export async function build({ variant = null } = {}) {
  const content = {};
  for (const l of LANGS) content[l] = await loadContent(l);
  await fs.mkdir(DIST, { recursive: true });
  await fs.mkdir(path.join(DIST, 'assets', 'js'), { recursive: true });
  await fs.mkdir(path.join(DIST, 'cv'), { recursive: true });
  await fs.mkdir(BUILD, { recursive: true });
  await copyFonts();
  await fs.copyFile(path.join(ROOT, 'src', 'styles.css'), path.join(DIST, 'assets', 'styles.css'));
  await fs.copyFile(path.join(ROOT, 'src', 'render.js'), path.join(DIST, 'assets', 'js', 'render.js'));
  await fs.copyFile(path.join(ROOT, 'src', 'site.js'), path.join(DIST, 'assets', 'js', 'site.js'));
  await fs.writeFile(path.join(DIST, 'assets', 'favicon.svg'), FAVICON);
  const assets = await buildAssets(content.en.projects);
  const html = siteHtml(content.en, content.de, assets);
  await fs.writeFile(path.join(DIST, 'index.html'), html);
  await fs.writeFile(path.join(ROOT, 'Max-CV-lokal.html'), await localHtml(html));

  const portrait = existsSync(path.join(BUILD, 'portrait-print.jpg')) ? path.join(BUILD, 'portrait-print.jpg') : null;
  const prints = {};
  for (const l of LANGS) {
    const c = content[l];
    let profile = c.profile;
    if (variant) {
      profile = c.profile_variants?.[variant];
      if (!profile) throw new Error(`Variant "${variant}" missing in content/${l}.json profile_variants. Available: ${Object.keys(c.profile_variants || {}).join(', ')}`);
    }
    const file = path.join(BUILD, `print-${l}.html`);
    await fs.writeFile(file, printHtml(c, { profile, portrait, fontsDir: path.join(DIST, 'assets', 'fonts') }));
    prints[l] = file;
  }
  console.log(`Built dist/max (portrait: ${assets.portrait ? 'yes' : 'placeholder'}, project images: ${Object.keys(assets.projects).length})${variant ? `, variant: ${variant}` : ''}`);
  return { content, prints, assets };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await build({ variant: argVariant() });
}
