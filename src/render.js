// Shared renderer for the website. Runs in Node (prerender at build time)
// and in the browser (language switch). Pure functions, no DOM access.

export const BASE = '/max/';
export const PDF_FILES = {
  en: 'Maximilian_Nitsche_CV_EN.pdf',
  de: 'Maximilian_Nitsche_Lebenslauf_DE.pdf'
};
export const pdfHref = (lang) => `${BASE}cv/${PDF_FILES[lang]}`;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (ch) => ESC[ch]);

// Escaped text with visible TODO markers.
export const txt = (s = '') =>
  esc(s)
    .replace(/(\d) (€|%)/g, '$1 $2')
    .replace(/\[\[TODO:([^\]]*)\]\]/g, '<mark class="todo">[[TODO:$1]]</mark>');

// Headline: one *accent* word in the serif italic.
export const head = (s = '') => txt(s).replace(/\*([^*]+)\*/g, '<span class="accent">$1</span>');

export const isTodo = (s = '') => /\[\[TODO/.test(s);

const pad = (n) => String(n).padStart(2, '0');

function picture(img, { alt, sizes, cls = '', eager = false, ratio, label }) {
  if (!img) {
    return `<span class="ph ${cls}" style="aspect-ratio:${ratio}" role="img" aria-label="${esc(label)}"><span>${esc(label)}</span></span>`;
  }
  const set = (list) => list.map((v) => `${v.src} ${v.w}w`).join(', ');
  return `<picture class="${cls}">
    <source type="image/avif" srcset="${set(img.avif)}" sizes="${sizes}">
    <source type="image/webp" srcset="${set(img.webp)}" sizes="${sizes}">
    <img src="${img.fallback}" width="${img.w}" height="${img.h}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
  </picture>`;
}

function sectionHead(n, title, id) {
  return `<header class="sec-head reveal">
    <span class="sec-index" aria-hidden="true">${pad(n)}.</span>
    <h2 id="${id}" class="h2">${head(title)}</h2>
  </header>`;
}

function langSwitch(c) {
  const b = (l) =>
    `<button type="button" class="lang-btn" data-lang="${l}" aria-pressed="${c.lang === l}" lang="${l}">${l.toUpperCase()}</button>`;
  return `<div class="lang" role="group" aria-label="${esc(c.ui.lang_label)}">${b('de')}<span aria-hidden="true">|</span>${b('en')}</div>`;
}

function renderHeader(c) {
  return `<header class="topbar">
    <div class="wrap topbar-in">
      <a class="mark" href="?lang=${c.lang}">Max Nitsche<span class="dot">.</span></a>
      <nav class="nav" aria-label="Main">
        <a href="#projects">${esc(c.ui.nav_projects)}</a>
        <a href="#experience">${esc(c.ui.nav_experience)}</a>
        <a href="#contact">${esc(c.ui.nav_contact)}</a>
      </nav>
      ${langSwitch(c)}
      <button type="button" class="theme-btn" data-theme-toggle aria-label="${esc(c.ui.theme_label)}" title="${esc(c.ui.theme_label)}">
        <svg class="i-moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
        <svg class="i-sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
    </div>
  </header>`;
}

function renderHero(c, assets) {
  return `<section class="hero grid-lines" aria-labelledby="hero-name">
    <div class="wrap hero-in">
      <div class="hero-text">
        <p class="hero-role reveal">${esc(c.contact.title)}</p>
        <h1 id="hero-name" class="hero-name reveal d1">${esc(c.contact.name)}</h1>
        <p class="claim reveal d2">${txt(c.hero.claim)}</p>
        ${assets.signature ? `<img class="sig reveal d2" src="${assets.signature.src}" width="${assets.signature.w}" height="${assets.signature.h}" alt="" decoding="async">` : ''}
        <div class="cta reveal d3">
          <a class="btn btn-dark" href="${pdfHref(c.lang)}" download>${esc(c.ui.btn_cv)}</a>
          <a class="btn btn-ghost" href="#contact">${esc(c.ui.btn_contact)}</a>
          <a class="btn btn-ghost" href="${esc(c.contact.linkedin)}" rel="me noopener" target="_blank">${esc(c.ui.btn_linkedin)}</a>
        </div>
        <p class="meta reveal d3">${esc(c.contact.location_short)} <span aria-hidden="true">✻</span> ${esc(c.ui.open_to)}</p>
      </div>
      <figure class="hero-photo reveal d2">
        ${picture(assets.portrait, { alt: c.ui.portrait_alt, sizes: '(min-width: 900px) 280px, 280px', eager: true, ratio: '4 / 5', label: c.ui.portrait_alt })}
        ${assets.shades ? `<span class="photo-shades" aria-hidden="true">${picture(assets.shades, { alt: '', sizes: '280px', ratio: '4 / 5' })}</span>` : ''}
      </figure>
    </div>
  </section>`;
}

function renderImpact(c, n) {
  const items = c.impact
    .map((s, i) => {
      const shown = `${s.prefix}${Number(s.value).toLocaleString(c.locale)}${s.suffix}`;
      return `<li class="stat reveal d${i}">
        <span class="stat-num" data-count="${s.value}" data-prefix="${esc(s.prefix)}" data-suffix="${esc(s.suffix)}" data-locale="${c.locale}">${esc(shown)}</span>
        <span class="stat-label">${txt(s.label)}</span>
        <span class="stat-note">${txt(s.note)}</span>
      </li>`;
    })
    .join('');
  return `<section data-fold class="sec" aria-labelledby="impact-h">
    <div class="wrap">
      ${sectionHead(n, c.ui.impact_title, 'impact-h')}
      <ul class="stats" role="list">${items}</ul>
    </div>
  </section>`;
}

// Endless ad ticker: the list is rendered twice and the track slides by half its width.
function reel(ads, { cls = '', alt = '', limit = ads.length } = {}) {
  const items = ads.slice(0, limit);
  const row = (hidden) => items
    .map((a, k) => `<img src="${a.src}" width="${a.w}" height="${a.h}" alt="${hidden ? '' : esc(`${alt} ${k + 1}`)}" loading="lazy" decoding="async">`)
    .join('');
  return `<span class="reel ${cls}"><span class="reel-track"><span class="reel-set">${row(!!cls)}</span><span class="reel-set" aria-hidden="true">${row(true)}</span></span></span>`;
}

function cardMedia(c, p, assets, img) {
  const ads = assets.reels?.[p.id];
  if (ads?.length) return reel(ads, { cls: 'card-reel', limit: 12 });
  const pic = picture(img, { alt: '', sizes: '(min-width: 1100px) 360px, (min-width: 700px) 45vw, 92vw', cls: 'card-img', ratio: '16 / 10', label: c.ui.image_placeholder });
  const clip = assets.clips?.[p.id];
  // Preview clip: no src until the card is on screen (site.js), so nothing loads up front.
  return clip?.card && img
    ? `${pic}<video class="card-clip" data-src="${clip.card}" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"></video>`
    : pic;
}

function renderProjects(c, assets, n) {
  const cards = c.projects
    .map((p, i) => {
      const img = assets.projects?.[p.id]?.[0] || null;
      return `<li class="card reveal d${i % 3}">
        <button type="button" class="card-btn" data-project="${p.id}" aria-haspopup="dialog">
          <span class="card-media">${cardMedia(c, p, assets, img)}${p.demo_note ? `<span class="card-flag">${esc(p.demo_note)}</span>` : ''}</span>
          <span class="card-body">
            <span class="card-meta"><span class="card-no">${pad(i + 1)}</span>${esc(p.org)}</span>
            <span class="card-title">${txt(p.title)}</span>
            <span class="card-teaser">${txt(p.teaser)}</span>
            <span class="tags">${p.stack.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span>
            <span class="card-more">${esc(c.ui.project_open)} <span aria-hidden="true">→</span></span>
          </span>
        </button>
      </li>`;
    })
    .join('');
  return `<section data-fold class="sec sec-deep" id="projects" aria-labelledby="projects-h">
    <div class="wrap">
      ${sectionHead(n, c.ui.projects_title, 'projects-h')}
      <p class="lead reveal">${txt(c.ui.projects_intro)}</p>
      <ul class="cards" role="list">${cards}</ul>
    </div>
  </section>`;
}

function renderExperience(c, n) {
  const items = c.experience
    .map((e) => {
      const pos = e.positions
        .map((p) => `<li class="pos"><span class="pos-title">${txt(p.title)}</span><span class="pos-dates">${esc(p.dates)}</span></li>`)
        .join('');
      return `<li class="job reveal">
        <h3 class="job-co">${txt(e.company)}${e.location ? `<span class="job-loc">, ${esc(e.location)}</span>` : ''}</h3>
        <ul class="positions" role="list">${pos}</ul>
        ${e.description ? `<p class="job-desc">${txt(e.description)}</p>` : ''}
        <ul class="bullets">${e.bullets.map((b) => `<li>${txt(b)}</li>`).join('')}</ul>
      </li>`;
    })
    .join('');
  return `<section data-fold class="sec" id="experience" aria-labelledby="experience-h">
    <div class="wrap">
      ${sectionHead(n, c.ui.experience_title, 'experience-h')}
      <ol class="timeline" role="list">${items}</ol>
    </div>
  </section>`;
}

function renderTools(c, n) {
  const groups = c.skills
    .map(
      (g, i) => `<div class="tool-group reveal d${i % 3}">
        <h3 class="h3">${esc(g.group)}</h3>
        <ul class="tags" role="list">${g.items.map((t) => `<li class="tag">${esc(t)}</li>`).join('')}</ul>
      </div>`
    )
    .join('');
  return `<section data-fold class="sec sec-deep" aria-labelledby="tools-h">
    <div class="wrap">
      ${sectionHead(n, c.ui.tools_title, 'tools-h')}
      <div class="tool-grid">${groups}</div>
    </div>
  </section>`;
}

function renderEducation(c, n) {
  const edu = c.education
    .map(
      (e) => `<div class="edu reveal">
        <p class="pos-dates">${esc(e.dates)}</p>
        <h3 class="h3 edu-deg">${txt(e.degree)}</h3>
        <p class="edu-school">${txt(e.school)}</p>
        <ul class="bullets">${e.bullets.map((b) => `<li>${txt(b)}</li>`).join('')}</ul>
      </div>`
    )
    .join('');
  const langs = c.languages
    .map((l) => `<li><span class="lang-name">${esc(l.name)}</span><span class="lang-level">${esc(l.level)}</span></li>`)
    .join('');
  return `<section data-fold class="sec" aria-labelledby="edu-h">
    <div class="wrap">
      ${sectionHead(n, c.ui.education_title, 'edu-h')}
      <div class="edu-grid">
        ${edu}
        <div class="langs reveal d1">
          <h3 class="h3">${esc(c.ui.languages_label)}</h3>
          <ul role="list">${langs}</ul>
        </div>
      </div>
    </div>
  </section>`;
}

function renderContact(c, n) {
  return `<section class="sec contact" id="contact" aria-labelledby="contact-h">
    <div class="wrap">
      ${sectionHead(n, c.ui.contact_title, 'contact-h')}
      <p class="lead reveal">${txt(c.ui.contact_intro)}</p>
      <dl class="contact-list reveal d1">
        <div><dt>${esc(c.ui.contact_email)}</dt><dd><a class="big-link ulink" href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a></dd></div>
        <div><dt>${esc(c.ui.contact_linkedin)}</dt><dd><a class="ulink" href="${esc(c.contact.linkedin)}" rel="me noopener" target="_blank">${esc(c.contact.linkedin_label)}</a></dd></div>
        <div><dt>${esc(c.ui.contact_downloads)}</dt><dd class="dl-links">
          <a class="ulink" href="${pdfHref('en')}" download hreflang="en">${esc(c.ui.download_en)}</a>
          <a class="ulink" href="${pdfHref('de')}" download hreflang="de">${esc(c.ui.download_de)}</a>
        </dd></div>
      </dl>
      <aside class="studio reveal d2">
        <p class="studio-q">${head(c.ui.elevion_teaser)}</p>
        <a class="btn btn-ghost studio-btn" href="https://elevion.studio/" target="_blank" rel="noopener">${esc(c.ui.elevion_cta)} <span aria-hidden="true">↗</span><span class="sr-only"> (${esc(c.ui.new_tab)})</span></a>
      </aside>
    </div>
  </section>`;
}

function renderFooter(c) {
  return `<footer class="foot">
    <div class="wrap foot-in">
      <span class="mark">Max Nitsche<span class="dot">.</span></span>
      <span class="foot-note">${esc(c.ui.footer_note)}</span>
      <span class="foot-links">
        <a href="https://elevion.studio/impressum.html">${esc(c.ui.footer_imprint)}</a>
        <a href="https://elevion.studio/datenschutzerklaerung.html">${esc(c.ui.footer_privacy)}</a>
      </span>
    </div>
  </footer>`;
}

export function renderApp(c, assets) {
  return `${renderHeader(c)}
  <main id="main">
    ${renderHero(c, assets)}
    ${renderImpact(c, 1)}
    ${renderProjects(c, assets, 2)}
    ${renderExperience(c, 3)}
    ${renderTools(c, 4)}
    ${renderEducation(c, 5)}
    ${renderContact(c, 6)}
  </main>
  ${renderFooter(c)}`;
}

export function renderProject(c, id, assets) {
  const i = c.projects.findIndex((p) => p.id === id);
  const p = c.projects[i];
  if (!p) return '';
  const imgs = assets.projects?.[p.id] || [];
  const block = (label, body) => (body ? `<div class="d-block"><h3 class="d-label">${esc(label)}</h3><p>${txt(body)}</p></div>` : '');
  // Video is click-to-load: no request to Google until the visitor asks for it.
  const video = p.video?.provider === 'gdrive'
    ? `<div class="d-block"><h3 class="d-label">${esc(c.ui.d_video)}</h3>
        <div class="video" data-video-src="https://drive.google.com/file/d/${esc(p.video.id)}/preview" data-video-title="${esc(p.title)}">
          <button type="button" class="video-btn" data-video-load><span class="video-play" aria-hidden="true"></span>${esc(c.ui.video_load)}</button>
          <p class="video-note">${esc(c.ui.video_note)}</p>
        </div></div>`
    : '';
  const clip = assets.clips?.[p.id];
  const poster = clip && imgs[0] ? imgs[0].webp[imgs[0].webp.length - 1].src : '';
  const demo = clip
    ? `<figure class="d-clip">
        <video src="${clip.src}" width="${clip.w}" height="${clip.h}" ${poster ? `poster="${poster}"` : ''} muted loop playsinline controls preload="metadata" data-autoplay aria-label="${esc(p.title)}"></video>
        ${p.demo_note ? `<figcaption>${esc(p.demo_note)}</figcaption>` : ''}
      </figure>`
    : '';
  const ads = assets.reels?.[p.id];
  const adReel = ads?.length ? `<div class="d-reel">${reel(ads, { alt: p.reel_label || p.title })}</div>` : '';
  const shown = clip ? imgs.slice(1) : imgs;
  const gallery = shown.length
    ? shown.map((img, k) => picture(img, { alt: `${p.title}, ${k + 1}`, sizes: '(min-width: 900px) 820px, 92vw', cls: 'd-img' })).join('')
    : video || demo || adReel ? '' : picture(null, { ratio: '16 / 10', cls: 'd-img', label: c.ui.image_placeholder });
  return `<div class="d-head">
      <p class="card-meta"><span class="card-no">${pad(i + 1)}</span>${esc(p.org)}</p>
      <h2 class="d-title" id="dialog-title">${txt(p.title)}</h2>
      <button type="button" class="d-close" data-close aria-label="${esc(c.ui.close)}"><span aria-hidden="true">×</span></button>
    </div>
    <div class="d-content">
      ${demo}
      ${adReel}
      ${block(c.ui.d_context, p.context)}
      ${block(c.ui.d_solution, p.solution)}
      <div class="d-block"><h3 class="d-label">${esc(c.ui.d_stack)}</h3><ul class="tags" role="list">${p.stack.map((t) => `<li class="tag">${esc(t)}</li>`).join('')}</ul></div>
      ${block(c.ui.d_result, p.result)}
      ${p.link ? `<p class="d-block"><a class="btn btn-dark" href="${esc(p.link)}" target="_blank" rel="noopener">${esc(c.ui.d_link)} <span aria-hidden="true">↗</span></a></p>` : ''}
      ${video}
      ${gallery ? `<div class="d-gallery">${gallery}</div>` : ''}
    </div>`;
}
