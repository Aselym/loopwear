// Ortak yardımcılar: durum, API, çeviri, biçimleme, simgeler, paneller.
import { DICT } from './i18n.js';

export const LOOPY = { hero: '/assets/loopy-hero.png', face: '/assets/loopy-face.png', wave: '/assets/loopy-wave.png' };

export const S = {
  user: null, catalog: null,
  lang: (() => { try { return localStorage.getItem('lw_lang'); } catch { return null; } })() || (navigator.language?.startsWith('tr') ? 'tr' : 'en'),
  filters: { q: '', category: '', size: '', material: '', ready: false, sort: '' },
  draft: null, wardrobeTab: 'dropped',
};

export function t(key, params = {}) {
  const s = DICT[S.lang]?.[key] ?? DICT.tr[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}
export function setLang(l) {
  S.lang = l;
  document.documentElement.lang = l;
  try { localStorage.setItem('lw_lang', l); } catch { /* özel pencere */ }
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, { method, credentials: 'same-origin', headers: body !== undefined || method !== 'GET' ? { 'Content-Type': 'application/json' } : {}, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  } catch { throw Object.assign(new Error('network'), { code: 'network' }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'generic'), { code: data.error || 'generic', missing: data.missing, status: res.status });
  return data;
}
export const post = (path, body) => api(path, { method: 'POST', body });
export const errText = (e) => (e.code === 'insufficient_points' && e.missing ? t('missing_points', { n: e.missing }) : DICT[S.lang][`e_${e.code}`] || t('e_generic'));

const L = () => (S.lang === 'en' ? 'en-GB' : 'tr-TR');
export const name = (o) => (o ? o[S.lang] ?? o.tr : '');
export const catName = (id) => name(S.catalog?.categories.find((c) => c.id === id)) || id;
export const matName = (id) => name(S.catalog?.materials.find((c) => c.id === id)) || id;
export const condName = (id) => name(S.catalog?.conditions.find((c) => c.id === id)) || id;
export const colorName = (id) => name(S.catalog?.colors.find((c) => c.id === id)) || id;
export const sizeName = (s) => (s === 'other' ? t('size_other') : s);
export const stationName = (id) => { const st = S.catalog?.stations.find((s) => s.id === id); return st ? (S.lang === 'en' ? st.name_en : st.name_tr) : ''; };
export const activeStations = () => (S.catalog?.stations || []).filter((s) => s.active);
export const fmt = (n, d = 0) => Number(n).toLocaleString(L(), { minimumFractionDigits: d, maximumFractionDigits: d });
export const when = (d) => new Date(d).toLocaleString(L(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const P = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const sized = (n, d, extra = P) => `<svg viewBox="0 0 24 24" width="${n}" height="${n}" style="flex:none" ${extra}>${d}</svg>`;
const thick = (w) => P.replace('stroke-width="2"', `stroke-width="${w}"`);
export const IC = {
  user: sized(18, '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c1.5-4 4.2-6 7-6s5.5 2 7 6"/>'),
  userLg: sized(34, '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c1.5-4 4.2-6 7-6s5.5 2 7 6"/>'),
  bell: sized(18, '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  back: sized(18, '<path d="M15 5l-7 7 7 7"/>', thick(2.2)),
  heart: '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-9.5-8.8C.8 8 2 4.5 5.3 3.7 7.8 3 10 4 12 6.5 14 4 16.2 3 18.7 3.7 22 4.5 23.2 8 21.5 11.2 19 15.6 12 20 12 20Z"/></svg>',
  heart2: sized(18, '<path d="M12 20s-7-4.4-9.5-8.8C.8 8 2 4.5 5.3 3.7 7.8 3 10 4 12 6.5 14 4 16.2 3 18.7 3.7 22 4.5 23.2 8 21.5 11.2 19 15.6 12 20 12 20Z"/>'),
  check: sized(12, '<path d="M5 13l4 4L19 7"/>', thick(3)),
  checkLg: '<svg viewBox="0 0 24 24" width="46" height="46" style="margin:0 auto" fill="none" stroke="#3F7254" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
  clock: sized(15, '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'),
  search: sized(17, '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  chevron: sized(13, '<path d="M6 9l6 6 6-6"/>', thick(2.4)),
  chevronRight: sized(15, '<path d="M9 6l6 6-6 6"/>', thick(2.4)),
  plus: sized(24, '<path d="M12 5v14M5 12h14"/>'),
  pin: sized(18, '<path d="M12 21s7-6.6 7-11.6A7 7 0 0 0 5 9.4C5 14.4 12 21 12 21Z"/><circle cx="12" cy="9.4" r="2.4"/>'),
  info: sized(15, '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".6" fill="currentColor"/>'),
  leaf: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#556A55" stroke-width="2" stroke-linejoin="round" style="flex:none"><path d="M20 4C10 4 4 10 4 18c8 0 14-6 16-14Z"/></svg>',
  shirt: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#556A55" stroke-width="2" stroke-linejoin="round" style="flex:none"><path d="M8 4l4 2 4-2 4 4-3 3v9H7v-9L4 8Z"/></svg>',
  locker: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#3F556A" stroke-width="1.8" stroke-linejoin="round" style="flex:none"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/><path d="M3 12h8M13 12h8"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.700l6.200-.9Z"/></svg>',
  star2: sized(18, '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.700l6.200-.9Z"/>'),
  loop: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><path d="M8 12a3 3 0 1 1 3 3c-3 0-3-6 0-6 4 0 5 6 8 6a3 3 0 1 0-3-3"/></svg>',
  leafCircle: '<div style="width:40px;height:40px;border-radius:50%;background:#556A55;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"><path d="M20 4C10 4 4 10 4 18c8 0 14-6 16-14Z"/></svg></div>',
  cloud: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#556A55" stroke-width="1.8" stroke-linejoin="round" style="margin:0 auto;display:block"><path d="M7 18a4 4 0 0 1-.5-8 5 5 0 0 1 9.600-1.800A4.500 4.500 0 0 1 17.500 18Z"/></svg>',
  drop: '<svg viewBox="0 0 24 24" width="26" height="30" fill="none" stroke="#3F556A" stroke-width="1.8" stroke-linejoin="round" style="margin:0 auto;display:block"><path d="M12 2s6 7 6 12a6 6 0 1 1-12 0c0-5 6-12 6-12Z"/></svg>',
  bars: sized(20, '<path d="M6 20V13M12 20V8M18 20V4"/>', thick(2.4)),
  qr: sized(18, '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM19 19h2v2h-2z"/>'),
  doc: sized(18, '<path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v4h4"/>'),
  shield: sized(18, '<path d="M12 3l7 3v6c0 5-3.500 7.500-7 9-3.500-1.500-7-4-7-9V6Z"/>'),
  gift: sized(18, '<rect x="4" y="10" width="16" height="10" rx="1.500"/><path d="M3 7h18v3H3zM12 7v13M12 7S10.500 3 8.500 3.500 8 7 12 7ZM12 7s1.500-4 3.500-3.500S16 7 12 7Z"/>'),
};
export const STATUS_PILL = { PENDING_DROP: 'p-wait', READY: 'p-ready', PENDING_PICKUP: 'p-mid', PICKUP_READY: 'p-ready', COMPLETED: 'p-ready', RETURN_PENDING: 'p-info', EXPIRED: 'p-bad', REJECTED: 'p-bad', CANCELLED: 'p-bad', RETURNED: 'p-info' };
export const statusPill = (st) => `<span class="pill ${STATUS_PILL[st] || 'p-info'}">${st === 'READY' ? IC.check : st === 'PENDING_DROP' ? IC.clock : ''}<span>${esc(t(`st_${st}`))}</span></span>`;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOAST_IC = { success: '✓', error: '!', info: '•' };
export function toast(msg, kind = 'info') {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = `toast t-${kind}`; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="t-ic">${TOAST_IC[kind] || '•'}</span><span>${esc(msg)}</span>`;
  document.body.append(el);
  setTimeout(() => el.remove(), 3400);
}

const CONFETTI = ['#3F7254', '#D47F7F', '#3F5F86', '#E2C9A0', '#E9B949', '#7FB38C', '#F2A65A'];
export function confetti(count = 46) {
  if (reduced()) return;
  const box = document.createElement('div');
  box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i += 1) {
    const p = document.createElement('i');
    const round = Math.random() < 0.35;
    p.style.cssText = `left:${Math.random() * 100}%;background:${CONFETTI[i % CONFETTI.length]};width:${round ? 9 : 7}px;height:${round ? 9 : 13}px;border-radius:${round ? '50%' : '2px'};--dx:${(Math.random() - 0.5) * 160}px;--r:${Math.random() * 720 - 360}deg;animation-duration:${1.4 + Math.random() * 1.1}s;animation-delay:${Math.random() * 0.25}s`;
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 2900);
}

// Kazanılan puan: ortada büyüyüp sönen rozet ve konfeti
export function pointsPop(points) {
  confetti();
  const el = document.createElement('div');
  el.className = 'points-pop'; el.setAttribute('role', 'status');
  el.innerHTML = `<div class="pp-burst"></div><div class="pp-num">+${fmt(points)}</div><div class="pp-unit">${esc(t('points'))}</div>`;
  document.body.append(el);
  setTimeout(() => el.remove(), reduced() ? 1200 : 2100);
}

// Sayıyı sıfırdan hedefe sayar
export function countUp(el, to, ms = 900) {
  if (!el) return;
  if (reduced()) { el.textContent = fmt(to); return; }
  const start = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - start) / ms);
    el.textContent = fmt(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Bildirim türünün tonu: olumlu, olumsuz ya da bilgi
const GOOD = new Set(['item_published', 'item_ready', 'drop_approved', 'pickup_ready', 'pickup_completed', 'return_approved', 'support_closed', 'item_corrected']);
const BAD = new Set(['drop_rejected', 'drop_expired', 'pickup_rejected', 'pickup_expired', 'return_rejected']);
export const notifTone = (kind) => (GOOD.has(kind) ? 'success' : BAD.has(kind) ? 'error' : 'info');

// Alt panel; kapatıldığında çözülen söz döner
export function sheet(html, onMount) {
  const ov = document.getElementById('overlay');
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    const close = (v) => { scrim.remove(); resolve(v); };
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
    scrim.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close()));
    ov.append(scrim);
    onMount?.(scrim.querySelector('.sheet'), close);
  });
}

export function confirmSheet(title, body, okLabel, { danger } = {}) {
  return sheet(`<h2>${esc(title)}</h2><p class="muted">${esc(body)}</p>
    <button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(okLabel)}</button><button class="btn line navy" data-close>${esc(t('cancel'))}</button>`,
  (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => close(true)));
}

// Tek seçimli liste; arama isteğe bağlı
export function pickSheet(title, options, { search, current } = {}) {
  const list = (opts) => opts.map((o) => `<button class="opt ${o.value === current ? 'on' : ''}" data-v="${esc(o.value)}"><span>${esc(o.label)}</span>${o.right ? `<span class="muted small">${esc(o.right)}</span>` : ''}</button>`).join('');
  const norm = (x) => String(x).toLocaleLowerCase('tr').replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c]));
  return sheet(`<h2>${esc(title)}</h2>${search ? `<div class="searchbar" style="margin:0">${IC.search}<input aria-label="${esc(search)}" placeholder="${esc(search)}"></div>` : ''}<div data-list>${list(options)}</div>`,
    (el, close) => {
      const box = el.querySelector('[data-list]');
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) close(b.dataset.v); });
      el.querySelector('input')?.addEventListener('input', (e) => { const q = norm(e.target.value); box.innerHTML = list(options.filter((o) => norm(o.label).includes(q))); });
    });
}

export function qrSvg(text) {
  const q = window.qrcode(0, 'M');
  q.addData(text); q.make();
  return q.createSvgTag({ scalable: true, margin: 0 });
}

// Yüklemeden önce küçült: stant interneti zayıf olabilir
export function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('photo')); };
    img.src = url;
  });
}

export function impactMetrics(impact) {
  const m = (bg, ic, v, unit) => `<div class="card solid metric" style="background:${bg}">${ic}${v == null ? `<div class="none">${esc(t('data_soon'))}</div>` : `<div class="v">${v}</div>`}<div class="muted">${unit}</div></div>`;
  return `<div class="grid2">${m('#EEF2EC', IC.cloud, impact?.co2 == null ? null : `${fmt(impact.co2, 1)} kg`, 'CO₂e')}${m('#ECF0F3', IC.drop, impact?.water == null ? null : `${fmt(impact.water)} L`, esc(t('water')))}</div>`;
}

export function methodSheet() {
  return sheet(`<h2>${esc(t('method_title'))}</h2>
    <p>${esc(t('method_1'))}</p><p>${esc(t('method_2'))}</p><p>${esc(t('method_3'))}</p><p class="small muted">${esc(t('method_4'))}</p>
    <details><summary class="link" style="cursor:pointer">${esc(t('sources'))}</summary>
      <p class="small" style="margin-top:8px"><a href="https://www.calpsc.org/_files/ugd/ad724e_df7e1839e74d4c00949f03f25f24f24e.pdf" target="_blank" rel="noopener">${esc(t('src_1'))}</a></p>
      <p class="small" style="margin-top:8px"><a href="https://www.mdpi.com/2071-1050/17/10/4411" target="_blank" rel="noopener">${esc(t('src_2'))}</a></p>
    </details>
    <button class="btn line navy" data-close>${esc(t('close'))}</button>`);
}

export function notifText(n) {
  const p = n.params || {};
  return t(`n_${n.kind}`, { cat: catName(p.category), station: stationName(p.station), points: p.points, reason: p.reason });
}
