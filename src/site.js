import { renderApp, renderProject } from './render.js';

const DATA = JSON.parse(document.getElementById('cv-data').textContent);
const app = document.getElementById('app');
const dialog = document.getElementById('project-dialog');
const dialogBody = document.getElementById('dialog-body');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lang = document.documentElement.lang;
let lastTrigger = null;

const store = {
  get() { try { return localStorage.getItem('cv-lang'); } catch { return null; } },
  set(v) { try { localStorage.setItem('cv-lang', v); } catch { /* storage blocked */ } }
};

function wanted() {
  let q = null;
  try { q = new URLSearchParams(location.search).get('lang'); } catch { /* ignore */ }
  if (q === 'de' || q === 'en') return q;
  const s = store.get();
  if (s === 'de' || s === 'en') return s;
  return 'en'; // English by default; the scribbled hint points visitors to DE
}

function applyMeta(c) {
  document.documentElement.lang = c.lang;
  document.title = c.meta.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', c.meta.description);
}

function setLang(next, { persist = true, updateUrl = true, boot = false } = {}) {
  if (!DATA[next]) return;
  if (persist) store.set(next);
  if (updateUrl) {
    try {
      const u = new URL(location.href);
      u.searchParams.set('lang', next);
      history.replaceState(null, '', u);
    } catch { /* ignore */ }
  }
  if (next === lang) return;
  lang = next;
  const y = window.scrollY;
  app.innerHTML = renderApp(DATA[next], DATA.assets);
  applyMeta(DATA[next]);
  if (boot) return;
  initView(true);
  window.scrollTo(0, y);
  rewriteHint(next);
  document.querySelector(`.lang-btn[data-lang="${next}"]`)?.focus({ preventScroll: true });
}

/* Count-up numbers */
function countUp(el) {
  const target = Number(el.dataset.count);
  const { prefix = '', suffix = '', locale } = el.dataset;
  const fmt = (n) => `${prefix}${Math.round(n).toLocaleString(locale)}${suffix}`;
  if (reduced) { el.textContent = fmt(target); return; }
  const t0 = performance.now();
  const dur = 1400;
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(target * (1 - Math.pow(1 - p, 4)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* Card preview clips: load and play only while on screen, never with reduced motion */
let clipIo;
function initClips() {
  clipIo?.disconnect();
  const clips = app.querySelectorAll('video.card-clip');
  if (reduced || !clips.length || !('IntersectionObserver' in window)) return;
  clipIo = new IntersectionObserver((entries) => {
    entries.forEach(({ target: v, isIntersecting }) => {
      if (isIntersecting) {
        if (!v.src) {
          v.src = v.dataset.src;
          v.addEventListener('playing', () => v.classList.add('on'), { once: true });
        }
        v.play().catch(() => { /* autoplay blocked: poster stays */ });
      } else if (v.src) v.pause();
    });
  }, { rootMargin: '120px 0px' });
  clips.forEach((v) => clipIo.observe(v));
}

let io;
// Phones: once the hero has scrolled away, the header name gives way to the section links.
let heroIo;
function initHeroWatch() {
  heroIo?.disconnect();
  const hero = app.querySelector('.hero');
  if (!hero || !('IntersectionObserver' in window)) return;
  heroIo = new IntersectionObserver(([e]) => {
    document.documentElement.classList.toggle('past-hero', !e.isIntersecting && e.boundingClientRect.top < 0);
  }, { rootMargin: '-60px 0px 0px 0px' });
  heroIo.observe(hero);
}

// Phones: sections fold to their headline. The h2 text gets wrapped in a real button there.
const phone = matchMedia('(max-width: 767px)');
const openFolds = new Set();
function initFolds() {
  app.querySelectorAll('.sec[data-fold]').forEach((sec, i) => {
    const h2 = sec.querySelector('.sec-head .h2');
    const body = [...sec.querySelector('.wrap').children].filter((el) => !el.classList.contains('sec-head'));
    const bodyId = `fold-${i}`;
    if (body[0]) body[0].id ||= bodyId;
    sec.classList.toggle('open', openFolds.has(i));
    sec.dataset.foldIndex = i;
    const btn = h2.querySelector('.fold-btn');
    if (phone.matches && !btn) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'fold-btn';
      b.setAttribute('aria-controls', body[0]?.id || bodyId);
      while (h2.firstChild) b.appendChild(h2.firstChild);
      h2.appendChild(b);
    } else if (!phone.matches && btn) {
      while (btn.firstChild) h2.insertBefore(btn.firstChild, btn);
      btn.remove();
    }
    h2.querySelector('.fold-btn')?.setAttribute('aria-expanded', String(openFolds.has(i)));
  });
}
function setFold(sec, open) {
  const i = Number(sec.dataset.foldIndex);
  if (open) openFolds.add(i); else openFolds.delete(i);
  sec.classList.toggle('open', open);
  sec.querySelector('.fold-btn')?.setAttribute('aria-expanded', String(open));
}
phone.addEventListener?.('change', initFolds);

function initView(instant = false) {
  initClips();
  initHeroWatch();
  initFolds();
  io?.disconnect();
  const els = app.querySelectorAll('.reveal');
  const nums = app.querySelectorAll('.stat-num');
  if (instant || reduced || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in'));
    if (!instant) nums.forEach(countUp);
    return;
  }
  nums.forEach((el) => { el.dataset.pending = '1'; });
  io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      e.target.querySelectorAll('.stat-num[data-pending]').forEach((n) => { delete n.dataset.pending; countUp(n); });
      io.unobserve(e.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach((el) => io.observe(el));
}

/* Dialog ad gallery: scrolls itself, wraps seamlessly, and yields to swipe, trackpad or mouse drag */
function runReel(el) {
  let pos = 0, down = false, sx = 0, sl = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    down = true; sx = e.clientX; sl = el.scrollLeft; el.classList.add('drag'); el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => { if (down) el.scrollLeft = sl - (e.clientX - sx); });
  const up = () => { down = false; el.classList.remove('drag'); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  if (reduced) return;
  const step = () => {
    if (!el.isConnected || !dialog.open) return;
    const half = el.scrollWidth / 2;
    if (Math.abs(el.scrollLeft - pos) > 2) pos = el.scrollLeft; // visitor scrolled: continue from there
    if (!down) pos += 0.6;
    if (half > 0 && pos >= half) pos -= half;
    if (half > 0 && pos < 0) pos += half;
    el.scrollLeft = pos;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* Project dialog: native modal gives inert background, focus containment and Escape */
function openProject(id, trigger) {
  dialogBody.innerHTML = renderProject(DATA[lang], id, DATA.assets);
  lastTrigger = trigger;
  dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector('[data-close]')?.focus();
  const r = dialog.querySelector('.d-reel .reel');
  if (r) runReel(r);
  const v = dialog.querySelector('video[data-autoplay]');
  if (v && !reduced) v.play().catch(() => { /* autoplay blocked: controls stay available */ });
}
dialog.addEventListener('close', () => {
  dialog.querySelectorAll('video').forEach((v) => v.pause());
  lastTrigger?.focus();
});
dialog.addEventListener('click', (e) => {
  if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
});

// Theme: follows the system until the visitor picks one; the choice is remembered.
function currentTheme() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark' || t === 'light') return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function syncThemeMeta() {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', currentTheme() === 'dark' ? '#141311' : '#F2F0EA');
}
syncThemeMeta();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeMeta);

document.addEventListener('click', (e) => {
  const fh = phone.matches && e.target.closest('.sec[data-fold] .sec-head');
  if (fh) { const sec = fh.closest('.sec'); setFold(sec, !sec.classList.contains('open')); return; }
  const jump = e.target.closest('a[href^="#"]');
  if (jump) {
    const target = document.querySelector(jump.getAttribute('href'));
    const sec = target?.closest('.sec[data-fold]');
    if (sec && phone.matches && !sec.classList.contains('open')) setFold(sec, true);
  }
  if (e.target.closest('[data-theme-toggle]')) {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('cv-theme', next); } catch { /* storage blocked */ }
    syncThemeMeta();
    return;
  }
  const lb = e.target.closest('.lang-btn');
  if (lb) { setLang(lb.dataset.lang); return; }
  const vb = e.target.closest('[data-video-load]');
  if (vb) {
    const box = vb.closest('.video');
    const f = document.createElement('iframe');
    f.src = box.dataset.videoSrc;
    f.title = box.dataset.videoTitle;
    f.allow = 'autoplay; fullscreen';
    f.allowFullscreen = true;
    box.replaceChildren(f);
    f.focus();
    return;
  }
  const card = e.target.closest('[data-project]');
  if (card) openProject(card.dataset.project, card);
});

/* Scroll progress */
const bar = document.getElementById('progress');
if (bar && !reduced) {
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
      ticking = false;
    });
  }, { passive: true });
}

/* Boot */
const w = wanted();
if (w !== lang) setLang(w, { persist: false, updateUrl: false, boot: true });
document.documentElement.removeAttribute('data-swap');

/* First visit on desktop: handwritten notes in the free space above the portrait.
   One points to DE | EN, one to the theme switch. They follow the page language,
   sit below the header and fade out on scroll or resize. */
let rewriteHint = () => {};
const HINTS = {
  lang: { en: 'Choose your language', de: 'Wähle deine Sprache' },
  theme: { en: 'Light mode would be here', de: 'Hier wäre der Light Mode' },
  themeSub: { en: '(but who likes that?)', de: '(aber wer mag das schon?)' }
};
function initLangHint() {
  if (!matchMedia('(min-width: 900px)').matches) return;
  let showLang = true, showTheme = true;
  try {
    if (sessionStorage.getItem('cv-hint')) return;
    if (store.get()) showLang = false;
    if (localStorage.getItem('cv-theme')) showTheme = false;
  } catch { /* storage blocked: show both */ }
  if (currentTheme() !== 'dark') showTheme = false;
  if (!showLang && !showTheme) return;
  if (!app.querySelector('.hero-photo') || !app.querySelector('.lang')) return;

  const NS = 'http://www.w3.org/2000/svg';
  const hint = document.createElement('div');
  hint.className = 'lang-hint';
  hint.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('lh-arrow');
  hint.appendChild(svg);
  document.body.appendChild(hint);

  const make = (key, sub) => {
    const box = document.createElement('span');
    box.className = 'lh-text';
    const main = document.createElement('span');
    box.appendChild(main);
    let small = null;
    if (sub) { small = document.createElement('span'); small.className = 'lh-sub'; box.appendChild(small); }
    const line = document.createElementNS(NS, 'path'); line.classList.add('lh-line');
    const tip = document.createElementNS(NS, 'path'); tip.classList.add('lh-head');
    svg.append(line, tip);
    hint.appendChild(box);
    main.className = 'lh-main';
    const set = (l) => { main.textContent = HINTS[key][l] || HINTS[key].en; if (small) small.textContent = HINTS[sub][l] || HINTS[sub].en; };
    return { box, main, small, line, tip, set };
  };
  const notes = [];
  const langNote = showLang ? make('lang') : null;
  const themeNote = showTheme ? make('theme', 'themeSub') : null;
  if (langNote) notes.push(langNote);
  if (themeNote) notes.push(themeNote);

  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    timers.forEach(clearTimeout);
    rewriteHint = () => {};
    try { sessionStorage.setItem('cv-hint', '1'); } catch { /* ignore */ }
    hint.classList.add('out');
    setTimeout(() => hint.remove(), 600);
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', dismiss);
  };
  const onScroll = () => { if (scrollY > 40) dismiss(); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', dismiss);

  // Layout: generous space between header and portrait. The language note sits left of
  // the switch, the theme note lower and right-aligned with the photo.
  const textRight = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().right; };
  const place = () => {
    const p = app.querySelector('.hero-photo').getBoundingClientRect();
    const sw = app.querySelector('.lang').getBoundingClientRect();
    const th = app.querySelector('.theme-btn').getBoundingClientRect();
    const X = scrollX, Y = scrollY;
    const room = p.top - sw.bottom;
    const titleRight = Math.max(textRight(app.querySelector('.hero-name')), textRight(app.querySelector('.hero-role')));
    if (langNote) {
      const w = langNote.box.offsetWidth;
      langNote.box.style.left = `${Math.max(titleRight + 64, sw.left - w - 24) + X}px`;
      langNote.box.style.top = `${sw.bottom + room * 0.4 + Y}px`;
    }
    if (themeNote) {
      themeNote.box.style.left = `${p.right + X - themeNote.box.offsetWidth + 4}px`;
      themeNote.box.style.top = `${p.top + Y - themeNote.box.offsetHeight - 20}px`;
    }
    return { sw, th, X, Y };
  };
  // Even arc from a little above a note toward (not onto) its target.
  const arc = (note, target, fromX, bend, gap = 20) => {
    const r = note.box.getBoundingClientRect();
    const ax = r.left + scrollX + r.width * fromX, ay = r.top + scrollY - gap;
    const tx = target.left + scrollX + target.width / 2, ty = target.bottom + scrollY;
    const dx0 = tx - ax, dy0 = ty - ay, d0 = Math.hypot(dx0, dy0);
    const ex = ax + dx0 * (1 - 36 / d0), ey = ay + dy0 * (1 - 36 / d0);
    const dx = ex - ax, dy = ey - ay, len = Math.hypot(dx, dy);
    const cx = (ax + ex) / 2 + (-dy / len) * len * bend, cy = (ay + ey) / 2 + (dx / len) * len * bend;
    note.line.setAttribute('d', `M${ax},${ay} Q${cx},${cy} ${ex},${ey}`);
    const ang = Math.atan2(ey - cy, ex - cx);
    const hd = (a) => `${ex - 10 * Math.cos(ang + a)},${ey - 10 * Math.sin(ang + a)}`;
    note.tip.setAttribute('d', `M${hd(0.55)} L${ex},${ey} L${hd(-0.55)}`);
    [note.line, note.tip].forEach((el) => {
      const l = el.getTotalLength();
      el.style.strokeDasharray = l;
      el.style.strokeDashoffset = reduced ? 0 : l;
      el.style.opacity = reduced ? '1' : '0';
    });
  };
  // Each line writes itself on; a note's sub-line can follow later.
  const write = (note, l, subDelay = 0) => {
    note.box.classList.remove('fade');
    [note.main, note.small].forEach((el) => el?.classList.remove('write'));
    note.set(l);
    place();
    void note.box.offsetWidth;
    note.main.classList.add('write');
    if (note.small) later(() => note.small.classList.add('write'), subDelay);
  };
  const draw = (note) => [note.line, note.tip].forEach((el) => { el.style.opacity = '1'; el.style.strokeDashoffset = 0; });

  document.fonts.load("30px 'Hand'").finally(() => {
    if (gone) return;
    notes.forEach((n) => n.set(lang));
    const { sw, th } = place();
    if (langNote) arc(langNote, sw, 0.9, -0.16);
    if (themeNote) arc(themeNote, th, 0.9, 0.12, 34);
    rewriteHint = (l) => notes.forEach((n) => {
      if (reduced) { n.set(l); place(); return; }
      n.box.classList.add('fade');
      later(() => write(n, l, 700), 320);
    });
    if (reduced) { notes.forEach((n) => [n.main, n.small].forEach((el) => el?.classList.add('write'))); return; }
    // Sequence: language note, its arrow, a pause; then the light mode line, its arrow, the aside.
    if (langNote) { later(() => write(langNote, lang), 700); later(() => draw(langNote), 2100); }
    if (themeNote) {
      const d = langNote ? 4700 : 700;
      later(() => write(themeNote, lang, 2600), d);
      later(() => draw(themeNote), d + 1500);
    }
  });
  // The theme note goes once someone actually switches theme.
  document.addEventListener('click', (e) => {
    if (themeNote && e.target.closest('[data-theme-toggle]')) {
      themeNote.box.style.opacity = '0';
      themeNote.line.style.opacity = '0';
      themeNote.tip.style.opacity = '0';
    }
  });
}

initView();
initLangHint();
