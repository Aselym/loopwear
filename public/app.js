// Üye ekranları ve yönlendirme. Ekran düzenleri LoopWear_Demo_2.html'den gelir; davranış MVP şartnamesine göredir.
import { S, t, setLang, esc, api, post, errText, catName, matName, condName, colorName, sizeName, stationName, activeStations, fmt, when, IC, statusPill, toast, postCard, postSummary, confetti, pointsPop, countUp, notifTone, sheet, confirmSheet, pickSheet, qrSvg, compressPhoto, impactMetrics, methodSheet, notifText, name, LOOPY } from './core.js';
import { renderAdmin } from './admin.js';

const app = document.getElementById('app');
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };
const x = (key, params) => esc(t(key, params));
const wordmark = (size = 22) => `<div class="logo-wordmark" style="font-size:${size}px">L<span class="lp">oo</span>pWear</div>`;

const NAV = [
  ['home', '#/', '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>'],
  ['discover', '#/discover', '<circle cx="12" cy="12" r="9"/><path d="M15 9l-2 6-6 2 2-6 6-2Z"/>'],
  ['drop', '#/drop', '<path d="M12 3a5 5 0 0 0-5 5c0 5 5 8 5 8s5-3 5-8a5 5 0 0 0-5-5Z"/><path d="M9 21h6"/>'],
  ['wardrobe', '#/wardrobe', '<path d="M9 4l3 2 3-2"/><path d="M5 9l4-3 3 2 3-2 4 3-2 3v9H7v-9Z"/>'],
  ['impact', '#/impact', '<path d="M20 4C10 4 4 10 4 18c8 0 14-6 16-14Z"/>'],
];
const nav = (active) => `<nav class="bottomnav" aria-label="LoopWear">${NAV.map(([k, h, d]) => (k === 'drop'
  ? `<a class="navitem fab" href="${h}"><div class="fabcircle"><svg viewBox="0 0 24 24">${d}</svg></div><span>${x('nav_drop')}</span></a>`
  : `<a class="navitem ${active === k ? 'active' : ''}" href="${h}" ${active === k ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24">${d}</svg><span>${x(`nav_${k}`)}</span></a>`)).join('')}</nav>`;
const langSwitch = () => `<div class="lang" role="group" aria-label="${x('language')}"><button data-lang="tr" class="${S.lang === 'tr' ? 'on' : ''}">TR</button><button data-lang="en" class="${S.lang === 'en' ? 'on' : ''}">EN</button></div>`;
const headerIcons = () => `<div class="row"><a class="iconbtn" href="#/notifications" aria-label="${x('notifications')}">${IC.bell}${S.user?.unread ? `<span class="dot">${S.user.unread}</span>` : ''}</a><a class="iconbtn" href="#/profile" aria-label="${x('profile')}">${IC.user}</a></div>`;
const backbar = (middle = '', right = '<span style="width:38px"></span>', backAttr = 'data-back') => `<div class="backbar"><button class="iconbtn" ${backAttr} aria-label="${x('back')}">${IC.back}</button>${middle}${right}</div>`;
const installed = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
const titleBar = (title) => backbar(`<span style="font-weight:900;font-size:16px">${esc(title)}</span>`);
const errorBox = () => `<div class="card center stack"><p class="muted">${x('load_error')}</p><button class="btn line" data-retry>${x('retry')}</button></div>`;
const skeleton = () => '<div class="skeleton"></div><div class="skeleton"></div>';
const screen = (html) => { app.innerHTML = `<div class="screen">${html}</div>`; };
const infoRow = (icon, label, value) => `<div class="card row gap12">${icon}<div><div class="muted">${esc(label)}</div><div style="font-weight:800;font-size:13.5px">${esc(value)}</div></div></div>`;

async function refreshUser() {
  const { user } = await api('/api/me');
  S.user = user;
  if (user?.lang && !sessionStorage.getItem('lw_lang_set')) setLang(user.lang);
}

// ---------- Kart ----------
function itemCard(it) {
  return `<article class="pcard" data-open="${esc(it.id)}">
    <button class="fav-heart ${it.favorite ? 'on' : ''}" data-fav="${esc(it.id)}" aria-pressed="${it.favorite}" aria-label="${x('favorites')}">${IC.heart}</button>
    <div class="prod-illustration">${it.photos[0] ? `<img loading="lazy" src="${esc(it.photos[0])}" alt="">` : ''}</div>
    <div class="pb"><div class="pn">${esc(catName(it.category))} · ${esc(sizeName(it.size))}</div><div class="pp">${fmt(it.point_value)} ${x('points')}</div>${statusPill(it.status)}</div>
  </article>`;
}

async function toggleFav(id, btn) {
  const { favorite } = await post(`/api/items/${id}/favorite`);
  btn.classList.toggle('on', favorite);
  btn.setAttribute('aria-pressed', favorite);
}

// ---------- Açılış ----------
function splash() {
  screen(`<div class="backbar" style="justify-content:flex-end">${langSwitch()}</div>
    <div class="content center-col" style="justify-content:center;padding-top:0;padding-bottom:0">
      <img src="${LOOPY.hero}" class="mascot" style="width:180px;margin-bottom:18px" alt="Loopy">
      ${wordmark(32)}<p class="muted" style="font-size:14px;max-width:260px;margin-top:8px">${x('tagline')}</p>
    </div>
    <div class="stack" style="padding:20px 20px calc(36px + var(--safe-b))"><a class="btn" href="#/start">${x('start')}</a>${installed ? '' : `<a class="btn line navy" href="/indir">${x('install_app')}</a>`}</div>`);
}
function onboarding() {
  screen(`<div class="content center-col" style="justify-content:center;padding-bottom:0">
      <img src="${LOOPY.hero}" class="mascot" style="width:170px;margin-bottom:22px" alt="">
      <h1 class="page-title" style="font-size:22px">${x('tagline')}</h1>
      <p class="muted" style="max-width:280px">${x('intro')}</p>
    </div>
    <div class="stack" style="padding:20px 20px calc(36px + var(--safe-b))"><a class="btn" href="#/register">${x('create_account')}</a><a class="btn line navy" href="#/login">${x('log_in')}</a></div>`);
}

function authForm(mode) {
  const reg = mode === 'register';
  screen(`${backbar(wordmark(17), langSwitch())}<div class="content bare">
    <h1 class="page-title">${x(reg ? 'create_account' : 'log_in')}</h1>
    <form id="authForm" novalidate>
      ${reg ? `<div class="field"><label for="dn">${x('display_name')}</label><input class="input" id="dn" name="display_name" autocomplete="nickname" maxlength="40" required><span class="hint">${x('display_name_hint')}</span></div>` : ''}
      <div class="field"><label for="em">${x('email')}</label><input class="input" id="em" name="email" type="email" inputmode="email" autocomplete="email" required></div>
      <div class="field"><label for="pw">${x('password')}</label><input class="input" id="pw" name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required>${reg ? `<span class="hint">${x('password_hint')}</span>` : ''}</div>
      <div class="err" hidden style="margin-bottom:12px"></div>
      <button class="btn" type="submit">${x(reg ? 'create_account' : 'log_in')}</button>
      <p class="center muted" style="margin-top:14px">${x(reg ? 'have_account' : 'no_account')} <a class="link" href="#/${reg ? 'login' : 'register'}">${x(reg ? 'log_in' : 'create_account')}</a></p>
      ${reg ? `<p class="center muted" style="margin-top:10px;font-size:12.5px"><a class="link" href="/gizlilik">${x('privacy')}</a></p>` : ''}
    </form></div>`);
  const f = document.getElementById('authForm');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = f.querySelector('.err'); const btn = f.querySelector('button[type=submit]');
    err.hidden = true; btn.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(f));
      body.lang = S.lang;
      const { user } = await post(`/api/auth/${reg ? 'register' : 'login'}`, body);
      S.user = user;
      go(user.role === 'admin' ? '#/admin' : '#/');
    } catch (ex) { err.textContent = errText(ex); err.hidden = false; } finally { btn.disabled = false; }
  });
}

// ---------- Ana sayfa ----------
const pointsCard = (u) => `<a class="card solid flat row between" href="#/wallet" style="background:linear-gradient(120deg,#F1F4F0,#F7F3E9);text-decoration:none"><div class="row gap12"><div style="width:38px;height:38px;border-radius:50%;background:var(--navy);display:flex;align-items:center;justify-content:center;flex:none">${IC.loop}</div><div><div style="font-size:20px;font-weight:900;color:var(--navy)">${fmt(u.wallet_balance)} <span style="font-size:13px;font-weight:700;color:var(--text2)">${x('points')}</span></div><div style="font-size:11px;color:var(--text2)">${x('wallet_note')}</div></div></div></a>`;

async function home() {
  const u = S.user;
  screen(`<div class="content">
    <div class="row between" style="margin-bottom:18px"><div><div style="font-size:19px;font-weight:900">${x('hello', { name: u.display_name })}</div></div>${headerIcons()}</div>
    ${pointsCard(u)}
    <div class="card solid flat" style="background:#EDF1EA;margin-top:2px"><div class="row between" style="align-items:flex-start"><div style="max-width:210px"><div style="font-weight:900;font-size:16px;line-height:1.3;margin-bottom:10px">${x('home_cta_title')}</div><a class="btn small" href="#/drop" style="padding:11px 18px;display:inline-flex">${x('drop_cta')}</a></div><img src="${LOOPY.face}" class="mascot" style="width:64px;margin-top:-6px" alt=""></div></div>
    <div class="row between" style="margin:18px 0 10px"><h2 class="section-title" style="margin:0">${x('nav_discover')}</h2><a class="link" href="#/discover">${x('see_all')}</a></div>
    <div id="fresh">${skeleton()}</div>
    <div class="row between" style="margin:22px 0 10px"><h2 class="section-title" style="margin:0">${x('blog_title')}</h2><a class="link" href="#/blog">${x('blog_all')}</a></div>
    <div id="homeBlog">${skeleton()}</div>
    <div id="giftCard"></div>
    <h2 class="section-title">${x('impact_section')}</h2><div id="impactCard"></div>
  </div>${nav('home')}`);
  try {
    const [{ items }, gifts, imp, { posts }] = await Promise.all([api('/api/items'), api('/api/gifts'), api('/api/me/impact'), api('/api/blog').catch(() => ({ posts: [] }))]);
    const hb = document.getElementById('homeBlog');
    if (hb) hb.innerHTML = posts.length ? `<div class="stack">${posts.slice(0, 3).map(postCard).join('')}</div>` : `<div class="card center"><p class="muted">${x('blog_empty')}</p></div>`;
    const box = document.getElementById('fresh');
    if (!box) return;
    const fresh = [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);
    box.innerHTML = fresh.length
      ? `<div class="grid2">${fresh.map(itemCard).join('')}</div><a class="btn line navy" href="#/discover" style="margin-top:12px">${x('go_discover')}</a>`
      : `<div class="card center stack"><h3>${x('no_items_title')}</h3><p class="muted">${x('no_items_body')}</p><a class="btn" href="#/drop">${x('drop_cta')}</a></div>`;
    if (gifts.gifts.some((g) => g.stock > 0)) document.getElementById('giftCard').innerHTML = `<a class="card solid flat row between" href="#/gifts" style="background:#FBF4EC;text-decoration:none;margin-top:14px"><div><div style="font-weight:900;font-size:14.5px">${x('gifts_card_title')}</div><p class="muted" style="margin-top:2px">${x('gifts_card_body')}</p></div>${IC.chevronRight}</a>`;
    document.getElementById('impactCard').innerHTML = `<a class="card solid flat row gap12" href="#/impact" style="background:#F5F1E6;text-decoration:none">${IC.leafCircle}<div><div style="font-weight:900;font-size:14.5px">${imp.total ? x('impact_summary', { n: imp.total }) : x('impact_title')}</div><p class="muted" style="margin-top:2px">${imp.total ? `${x('ref_label')}: ${imp.co2.count ? `${fmt(imp.co2.sum, 1)} kg CO₂e` : x('data_soon')}` : x('impact_summary_none')}</p></div></a>`;
  } catch { const b = document.getElementById('fresh'); if (b) b.innerHTML = errorBox(); }
}

// ---------- Keşfet ----------
async function discover() {
  const f = S.filters;
  const chip = (key, label, val) => `<button class="chip ${val ? 'on' : ''}" data-filter="${key}">${esc(val || label)} ${IC.chevron}</button>`;
  const active = f.q || f.category || f.size || f.material || f.ready || f.sort;
  screen(`<div class="content">
    <div class="row between" style="margin-bottom:14px"><h1 class="page-title" style="margin:0">${x('nav_discover')}</h1>${headerIcons()}</div>
    <div class="searchbar">${IC.search}<input id="q" type="search" value="${esc(f.q)}" placeholder="${x('search_ph')}" aria-label="${x('search_ph')}"></div>
    <div class="chiprow">
      ${chip('category', t('filter_category'), f.category && catName(f.category))}${chip('size', t('filter_size'), f.size && sizeName(f.size))}${chip('material', t('filter_material'), f.material && matName(f.material))}
      <button class="chip ${f.ready ? 'on' : ''}" data-filter="ready">${x('filter_ready')}</button><button class="chip ${f.sort ? 'on' : ''}" data-filter="sort">${x('sort_points')}</button>
    </div>
    <div class="row between" style="margin:10px 0 12px;color:var(--text2);font-size:12.5px;font-weight:700"><div class="row">${IC.pin}<span id="count"></span></div>${active ? `<button class="link" data-filter="clear">${x('clear_filters')}</button>` : ''}</div>
    <div id="list">${skeleton()}</div></div>${nav('discover')}`);
  const load = async () => {
    const p = new URLSearchParams();
    for (const k of ['q', 'category', 'size', 'material', 'sort']) if (f[k]) p.set(k, f[k]);
    if (f.ready) p.set('ready', '1');
    const list = document.getElementById('list');
    try {
      const { items } = await api(`/api/items?${p}`);
      if (!document.getElementById('list')) return;
      const st = activeStations();
      document.getElementById('count').textContent = `${st.length === 1 ? `${stationName(st[0].id)} · ` : ''}${t('items_count', { n: items.length })}`;
      list.innerHTML = items.length ? `<div class="grid2">${items.map(itemCard).join('')}</div>`
        : `<div class="card center stack"><p class="muted">${p.toString() ? x('empty_filter') : x('no_items_title')}</p>${p.toString() ? `<button class="btn line navy" data-filter="clear">${x('clear_filters')}</button>` : `<a class="btn" href="#/drop">${x('drop_cta')}</a>`}</div>`;
    } catch { list.innerHTML = errorBox(); }
  };
  let timer;
  document.getElementById('q').addEventListener('input', (e) => { f.q = e.target.value; clearTimeout(timer); timer = setTimeout(load, 220); });
  await load();
}

async function filterAction(key) {
  const f = S.filters; const c = S.catalog;
  if (key === 'clear') S.filters = { q: '', category: '', size: '', material: '', ready: false, sort: '' };
  else if (key === 'ready') f.ready = !f.ready;
  else if (key === 'sort') f.sort = f.sort ? '' : 'points';
  else {
    const opts = { category: c.categories.filter((o) => !o.retired).map((o) => ({ value: o.id, label: name(o) })), size: c.sizes.map((s) => ({ value: s, label: sizeName(s) })), material: c.materials.filter((o) => !o.retired).map((o) => ({ value: o.id, label: name(o) })) }[key];
    const v = await pickSheet(t(`filter_${key}`), [{ value: '', label: t('all') }, ...opts], { search: key === 'category' ? t('search_category') : null, current: f[key] });
    if (v === undefined) return;
    f[key] = v;
  }
  discover();
}

// ---------- Ürün detayı ----------
async function itemDetail(id) {
  screen(`<div class="content bare">${skeleton()}</div>`);
  let it;
  try { ({ item: it } = await api(`/api/items/${id}`)); } catch { screen(`<div class="content">${errorBox()}</div>`); return; }
  const u = S.user;
  const ready = it.status === 'READY'; const waiting = it.status === 'PENDING_DROP';
  let foot = '';
  if (it.mine) foot = `<p class="center muted">${x('your_item')}</p>${waiting ? `<a class="btn" href="#/qr/drop/${esc(it.id)}">${x('show_drop_qr')}</a>` : ''}`;
  else if (ready) foot = `<div class="row between"><div><div style="font-weight:900;font-size:18px;color:var(--navy)">${fmt(it.point_value)} ${x('points')}</div><div style="font-size:11px;color:var(--text2)">${x('current_balance')}: ${fmt(u.wallet_balance)} ${x('points')}</div></div></div><a class="btn green" href="#/reserve/${esc(it.id)}">${x('want_it')}</a>`;
  else if (['PENDING_PICKUP', 'PICKUP_READY'].includes(it.status)) foot = `<p class="center muted">${x('not_for_you')}</p>`;
  screen(`${backbar('', `<button class="iconbtn" data-fav="${esc(it.id)}" aria-pressed="${it.favorite}" aria-label="${x('favorites')}"><span class="fav-heart ${it.favorite ? 'on' : ''}" style="position:static;background:none">${IC.heart}</span></button>`)}
    <div class="content bare" style="padding-top:6px">
    <div class="gallery" id="gal">${it.photos.map((p) => `<img src="${esc(p)}" alt="${esc(catName(it.category))}">`).join('')}</div>
    <div class="dots" id="dots">${it.photos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
    <h1 style="margin-bottom:8px">${esc(catName(it.category))}</h1>
    <div class="row" style="flex-wrap:wrap;margin-bottom:14px"><span class="pill p-info">${x('d_size')} ${esc(sizeName(it.size))}</span><span class="pill p-ready">${esc(condName(it.condition))}</span>${statusPill(it.status)}</div>
    ${waiting ? `<p class="footnote" style="margin:0 0 14px">${x('pending_note')}</p>` : ''}
    ${infoRow(IC.leaf, t('d_material'), `${matName(it.material)} (${t('declared')})`)}
    ${infoRow(IC.shirt, t('d_color'), colorName(it.color))}
    ${infoRow(IC.pin, t('d_location'), stationName(it.station_id))}
    ${infoRow(IC.locker, t('d_status'), t(`st_${it.status}`))}
    ${it.rating ? infoRow(IC.star2, t('d_rating'), `${fmt(it.rating.avg, 1)} / 5`) : ''}
    <h2 class="section-title">${x('ref_title')}</h2>${impactMetrics(it.impact)}
    <div style="margin-top:12px"><button class="link" data-method>${x('how_calc')}</button></div>
    </div>${foot ? `<div class="footer-bar">${foot}</div>` : ''}`);
  const gal = document.getElementById('gal');
  gal?.addEventListener('scroll', () => {
    const i = Math.round(gal.scrollLeft / gal.clientWidth);
    document.querySelectorAll('#dots i').forEach((d, k) => d.classList.toggle('on', k === i));
  }, { passive: true });
}

// ---------- Rezervasyon onayı ----------
async function reserveScreen(id) {
  screen(`<div class="content bare">${skeleton()}</div>`);
  let it;
  try { ({ item: it } = await api(`/api/items/${id}`)); } catch { screen(`<div class="content">${errorBox()}</div>`); return; }
  const bal = S.user.wallet_balance; const short = it.point_value - bal;
  screen(`${titleBar(t('confirm_title'))}<div class="content bare">
    <div class="card row gap12"><img class="thumb lg" src="${esc(it.photos[0] || '')}" alt=""><div><div style="font-weight:900;font-size:16px">${esc(catName(it.category))}</div><div class="row" style="margin-top:6px;flex-wrap:wrap"><span class="pill p-info">${x('d_size')} ${esc(sizeName(it.size))}</span><span class="pill p-ready">${esc(condName(it.condition))}</span></div><div style="font-weight:900;font-size:18px;color:var(--navy);margin-top:8px">${fmt(it.point_value)} ${x('points')}</div></div></div>
    <div class="card"><div class="fin"><span class="muted">${x('current_balance')}</span><span class="strong">${fmt(bal)} ${x('points')}</span></div><div class="fin"><span class="muted">${x('this_item')}</span><span class="strong" style="color:var(--coral)">−${fmt(it.point_value)} ${x('points')}</span></div>
      ${short > 0 ? '' : `<div class="divider"></div><div class="fin"><span class="strong">${x('new_balance')}</span><span style="font-weight:900;color:var(--sage-dark);font-size:16px">${fmt(bal - it.point_value)} ${x('points')}</span></div>`}</div>
    <div class="card row gap12">${IC.pin}<div><div style="font-weight:800;font-size:13.5px">${x('pickup_point')}</div><div style="font-weight:900;font-size:14px">${esc(stationName(it.station_id))}</div></div></div>
    ${short > 0 ? `<p class="err">${x('missing_points', { n: short })}</p>` : `<p class="footnote">${x('confirm_note')}</p>`}
    </div><div class="footer-bar">${short > 0 ? `<a class="btn" href="#/drop">${x('drop_cta')}</a>` : `<button class="btn" data-reserve="${esc(it.id)}">${x('confirm_btn')}</button>`}<div class="center"><button class="link" style="color:var(--text2)" data-back>${x('cancel')}</button></div></div>`);
}
async function reserve(id) {
  try {
    await post(`/api/items/${id}/reserve`);
    await refreshUser();
    S.wardrobeTab = 'reserved';
    toast(t('reserved_toast'), 'success');
    confetti(30);
    go('#/wardrobe');
  } catch (e) { toast(errText(e), 'error'); itemDetail(id); }
}

// ---------- Bırak akışı ----------
const STEPS = ['cap_consent', 'cap_photos', 'cap_info', 'cap_station'];
const newDraft = () => ({ step: 1, consents: [false, false, false, false], category: '', condition: '', size: '', material: '', color: '', station_id: activeStations().some((s) => s.id === S.user?.default_station_id) ? S.user.default_station_id : activeStations()[0]?.id || '', photos: [null, null, null, null], client_key: crypto.randomUUID?.() || String(Date.now() + Math.random()) });
const stepBar = (d) => `<div class="backbar"><button class="iconbtn" data-drop-back aria-label="${x('back')}">${IC.back}</button><span class="cap">${d.step} / ${STEPS.length} — ${x(STEPS[d.step - 1])}</span><span style="width:38px"></span></div>`;

function dropFlow() {
  const d = S.draft || (S.draft = newDraft());
  if (d.step === 1) {
    const all = d.consents.every(Boolean);
    screen(`${stepBar(d)}<div class="content bare"><h1 class="page-title" style="font-size:22px">${x('consent_title')}</h1><p class="muted" style="margin-bottom:16px">${x('consent_body')}</p>
      ${d.consents.map((on, i) => `<button class="toggle-row" role="switch" aria-checked="${on}" data-consent="${i}"><span class="label">${x(`consent_${i + 1}`)}</span><span class="switch ${on ? 'on' : ''}"><span class="knob"></span></span></button>`).join('')}
      ${all ? '' : `<p class="muted" style="display:flex;gap:6px;align-items:center">${IC.info}${x('consent_missing')}</p>`}</div>
      <div class="footer-bar"><button class="btn green" data-drop-next ${all ? '' : 'disabled'}>${x('continue')}</button></div>`);
    return;
  }
  if (d.step === 2) {
    const labels = ['ph_front', 'ph_back', 'ph_detail', 'ph_optional'];
    const ready = d.photos.slice(0, 3).every(Boolean);
    screen(`${stepBar(d)}<div class="content bare"><h1 class="page-title" style="font-size:22px">${x('photos_title')}</h1><p class="muted" style="margin-bottom:16px">${x('photos_body')}</p>
      <div class="grid2">${labels.map((l, i) => `<label class="photoslot ${d.photos[i] ? 'filled' : ''}">${d.photos[i] ? `<img src="${d.photos[i]}" alt=""><span class="ph-ok"><span class="badge-check">${IC.check}</span></span><span class="lbl">${x(l)}</span><button class="rm" data-rm="${i}">${x('remove')}</button>` : `${IC.plus}<span>${x(l)}</span>`}<input type="file" accept="image/*" data-photo="${i}" aria-label="${x(l)}" ${d.photos[i] ? 'hidden' : ''}></label>`).join('')}</div>
      <div class="card solid flat row gap12" style="background:#EEF2EC;margin-top:16px"><img src="${LOOPY.face}" class="mascot" style="width:46px;flex-shrink:0" alt=""><div><div style="font-size:11.5px;font-weight:800;color:var(--sage-dark)">${x('loopy_tip_head')}</div><div style="font-size:12.5px;font-weight:700">${x('loopy_tip')}</div></div></div>
      </div><div class="footer-bar">${ready ? '' : `<p class="center muted">${x('photos_missing')}</p>`}<button class="btn green" data-drop-next ${ready ? '' : 'disabled'}>${x('continue')}</button></div>`);
    return;
  }
  if (d.step === 3) {
    const sel = (key, label, val) => `<div class="field"><span class="label">${esc(label)}</span><button class="fakeinput ${val ? '' : 'ph'}" data-pick="${key}"><span>${esc(val || t('choose'))}</span>${IC.chevron}</button></div>`;
    const cond = S.catalog.conditions.find((c) => c.id === d.condition);
    const ok = d.category && d.condition && d.size && d.material && d.color;
    screen(`${stepBar(d)}<div class="content bare"><h1 class="page-title" style="font-size:22px">${x('info_title')}</h1><p class="muted" style="margin-bottom:16px">${x('info_body')}</p>
      ${sel('category', t('d_category'), d.category && catName(d.category))}${sel('size', t('d_size'), d.size && sizeName(d.size))}${sel('material', t('d_material'), d.material && matName(d.material))}${sel('color', t('d_color'), d.color && colorName(d.color))}${sel('condition', t('d_condition'), d.condition && condName(d.condition))}
      ${cond ? `<p class="footnote" style="margin:-4px 0 12px">${esc(cond[`desc_${S.lang}`])}</p>` : ''}
      <p class="muted" style="display:flex;gap:6px;align-items:center">${IC.info}${x('brand_note')}</p></div>
      <div class="footer-bar"><button class="btn green" data-drop-next ${ok ? '' : 'disabled'}>${x('continue')}</button></div>`);
    return;
  }
  const stations = activeStations();
  screen(`${stepBar(d)}<div class="content bare"><h1 class="page-title" style="font-size:22px">${x('station_title')}</h1><p class="muted" style="margin-bottom:14px">${x('station_body')}</p>
    ${stations.map((s) => `<button class="radio-row ${d.station_id === s.id ? 'checked' : ''}" role="radio" aria-checked="${d.station_id === s.id}" data-station-pick="${esc(s.id)}"><span class="radio-dot"></span><span style="flex:1"><span style="display:block;font-weight:800;font-size:14px">${esc(stationName(s.id))}</span><span class="muted">${esc(s.campus_label)}</span></span></button>`).join('')}
    <div class="err" id="dropErr" hidden></div></div>
    <div class="footer-bar"><button class="btn green" data-publish ${d.station_id ? '' : 'disabled'}>${x('publish')}</button></div>`);
}

async function dropPick(key) {
  const d = S.draft; const c = S.catalog;
  const map = {
    category: [t('d_category'), c.categories.filter((o) => !o.retired).map((o) => ({ value: o.id, label: name(o) })), { search: t('search_category') }],
    condition: [t('d_condition'), c.conditions.map((o) => ({ value: o.id, label: name(o) }))],
    size: [t('d_size'), c.sizes.map((s) => ({ value: s, label: sizeName(s) }))],
    material: [t('d_material'), c.materials.filter((o) => !o.retired).map((o) => ({ value: o.id, label: name(o) }))],
    color: [t('d_color'), c.colors.map((o) => ({ value: o.id, label: name(o) }))],
  }[key];
  const v = await pickSheet(map[0], map[1], { ...(map[2] || {}), current: d[key] });
  if (v === undefined) return;
  d[key] = v;
  const y = window.scrollY; dropFlow(); window.scrollTo(0, y);
}

async function publishDrop() {
  const d = S.draft;
  const started = Date.now();
  const AN = ['an_1', 'an_2', 'an_3', 'an_4'];
  const STEP_MS = 950;
  screen(`<div class="backbar" style="justify-content:center">${wordmark(17)}</div><div class="content center-col ai-screen" style="justify-content:center">
    <div class="ai-orb"><span class="ai-ring"></span><span class="ai-ring r2"></span><img src="${LOOPY.face}" alt=""></div>
    <span class="ai-chip">LoopAI</span>
    <h1 style="font-size:21px;margin-top:10px">${x('analyzing')}</h1>
    <div class="card" style="width:100%;text-align:left;margin-top:16px">${AN.map((k, i) => `<div class="checklist-row"><span style="font-weight:700;font-size:13.5px">${x(k)}</span><span data-an="${i}" class="${i ? 'idle' : 'spin'}"></span></div>`).join('')}</div>
    <div class="progressbar ai"><div class="fill" id="anFill"></div></div></div>`);
  const step = (i) => {
    const prev = document.querySelector(`[data-an="${i - 1}"]`);
    if (prev) { prev.className = 'badge-check'; prev.innerHTML = IC.check; }
    const cur = document.querySelector(`[data-an="${i}"]`);
    if (cur) cur.className = 'spin';
    const f = document.getElementById('anFill');
    if (f) f.style.width = `${Math.min(100, 12 + i * 26)}%`;
  };
  AN.forEach((_, i) => { if (i) setTimeout(() => step(i), i * STEP_MS); });
  try {
    const { item } = await post('/api/items', { category: d.category, material: d.material, size: d.size, condition: d.condition, color: d.color, station_id: d.station_id, consents: d.consents, photos: d.photos.filter(Boolean), client_key: d.client_key });
    await refreshUser();
    await new Promise((r) => setTimeout(r, Math.max(0, AN.length * STEP_MS - (Date.now() - started))));
    step(AN.length);
    await new Promise((r) => setTimeout(r, 350));
    S.draft = null;
    S.lastDrop = item;
    go(`#/drop/result/${item.id}`);
  } catch (e) {
    dropFlow();
    const box = document.getElementById('dropErr');
    if (box) { box.textContent = errText(e); box.hidden = false; }
  }
}

async function dropResult(id) {
  let it = S.lastDrop?.id === id ? S.lastDrop : null;
  if (!it) ({ item: it } = await api(`/api/items/${id}`));
  screen(`<div class="content bare center-col" style="padding-top:calc(30px + var(--safe-t))">
    <img src="${LOOPY.hero}" class="mascot" style="width:170px;margin-bottom:10px" alt="Loopy">
    <h1>${x('result_loopy')}</h1><p class="muted" style="margin-bottom:16px">${x('result_note')}</p>
    <div class="card solid flat earned">${IC.checkLg}<div class="muted" style="margin-top:6px">${x('earned')}</div><div class="earned-num"><span id="earnedNum">0</span> <span style="font-size:15px">${x('points')}</span></div><div class="muted">${esc(catName(it.category))} · ${esc(condName(it.condition))}</div></div>
    <div style="width:100%;text-align:left"><h2 class="section-title" style="margin-top:0">${x('ref_title')}</h2>${impactMetrics(it.impact)}<div class="fin" style="margin-top:10px"><span class="muted">${x('added_to_impact')}</span><button class="link" style="white-space:nowrap" data-method>${x('how_calc')}</button></div></div>
    <p class="footnote" style="width:100%;text-align:left">${x('drop_deadline', { station: stationName(it.station_id) })}</p>
    </div><div class="footer-bar"><a class="btn green" href="#/qr/drop/${esc(it.id)}">${x('create_code')}</a><a class="btn line" href="#/impact">${x('go_impact')}</a></div>`);
  if (S.lastDrop?.id === id && !S.lastDrop.celebrated) {
    S.lastDrop.celebrated = true;
    pointsPop(it.point_value);
    setTimeout(() => countUp(document.getElementById('earnedNum'), it.point_value), 350);
  } else {
    const n = document.getElementById('earnedNum');
    if (n) n.textContent = fmt(it.point_value);
  }
}

// ---------- QR ekranları ----------
async function qrScreen(kind, id) {
  screen(`<div class="content bare">${skeleton()}</div>`);
  try {
    let title; let body; let token; let details = ''; let top = '';
    const w = kind === 'me' ? null : await api('/api/me/wardrobe');
    const productCard = (it, pill) => `<div class="card row gap12" style="width:100%;text-align:left"><img class="thumb" style="width:64px;height:64px" src="${esc(it.photos[0] || '')}" alt=""><div style="flex:1"><div style="font-weight:900;font-size:14.5px">${esc(catName(it.category))} · ${esc(sizeName(it.size))}</div><div style="font-weight:800;color:var(--sage-dark);font-size:13px">${fmt(it.point_value)} ${x('points')}</div></div>${pill}</div>`;
    if (kind === 'drop') {
      const it = w.dropped.find((i) => i.id === id);
      token = it?.drop_token;
      if (!token) throw new Error('gone');
      title = t('qr_drop_title'); body = t('qr_drop_body', { station: stationName(it.station_id) });
      details = `<div class="card solid flat" style="width:100%;margin-top:14px;background:#F5F1E6;text-align:left"><div style="font-weight:800;font-size:14px">${esc(stationName(it.station_id))}</div><div class="row" style="margin-top:6px;color:var(--sage-dark);font-weight:700;font-size:12.5px">${IC.clock}${x('drop_within')}</div></div>
        <div class="card" style="width:100%;text-align:left"><div style="font-weight:800;font-size:14px;margin-bottom:10px">${x('how_drop')}</div>${[1, 2, 3].map((n) => `<div class="row gap12" style="padding:4px 0"><div class="badge-check" style="background:var(--navy)">${n}</div><span style="font-size:13px;font-weight:700">${x(`how_drop_${n}`)}</span></div>`).join('')}</div>`;
    } else if (kind === 'pickup') {
      const r = w.reserved.find((i) => i.id === id);
      token = r?.qr_token;
      if (!token) throw new Error('gone');
      title = t('qr_pick_title'); body = t('qr_pick_body', { station: stationName(r.item.station_id) });
      top = productCard(r.item, `<span class="pill p-ready">${x('st_PICKUP_READY')}</span>`);
      details = `<div class="row" style="color:var(--sage-dark);font-weight:800;font-size:13px;margin-top:12px">${IC.clock}${x('qr_valid_until', { time: when(r.pickup_expires_at) })}</div>`;
    } else if (kind === 'gift') {
      const g = w.gifts.find((i) => i.id === id);
      token = g?.status === 'PENDING' ? g.qr_token : null;
      if (!token) throw new Error('gone');
      title = t('qr_gift_title'); body = `${S.lang === 'en' ? g.name_en : g.name_tr}. ${t('qr_gift_body')}`;
    } else { title = t('my_code'); body = t('my_code_body'); token = S.user.public_code; }
    screen(`${backbar(wordmark(17))}<div class="content bare center-col"><h1 style="font-size:21px">${esc(title)}</h1><p class="muted" style="margin-bottom:14px">${esc(body)}</p>${top}
      <div class="qr-wrap"><div class="qr-code" role="img" aria-label="QR">${qrSvg(token)}</div>${kind === 'me' ? `<div style="font-weight:900;font-size:15px">${esc(S.user.display_name)}</div>` : `<span class="muted">${x('qr_single')}</span>`}</div>
      ${details}<img src="${LOOPY.wave}" class="mascot" style="width:74px;margin-top:10px" alt=""></div>`);
  } catch { go('#/wardrobe'); }
}

// ---------- Dolabım ----------
async function wardrobe() {
  const tabs = ['dropped', 'reserved', 'acquired'];
  const tab = S.wardrobeTab;
  screen(`<div class="content"><div class="row between" style="margin-bottom:14px"><h1 class="page-title" style="margin:0">${x('nav_wardrobe')}</h1>${headerIcons()}</div>
    <div class="tab-row" role="tablist">${tabs.map((k) => `<button role="tab" aria-selected="${tab === k}" class="tab-item ${tab === k ? 'active' : ''}" data-wtab="${k}">${x(`tab_${k}`)}</button>`).join('')}</div><div class="row between" style="margin-bottom:10px"><span style="font-weight:800;font-size:13.5px" id="wcount"></span></div><div id="wlist">${skeleton()}</div></div>${nav('wardrobe')}`);
  let w;
  try { w = await api('/api/me/wardrobe'); } catch { document.getElementById('wlist').innerHTML = errorBox(); return; }
  const box = document.getElementById('wlist');
  if (!box) return;
  const empty = `<div class="card center stack"><h3>${x('empty_wardrobe')}</h3><p class="muted">${x('empty_wardrobe_body')}</p><a class="btn" href="#/drop">${x('drop_cta')}</a><a class="btn line navy" href="#/discover">${x('nav_discover')}</a></div>`;
  const line = (it, inner) => `<div class="card row gap12" style="align-items:flex-start"><img class="thumb" src="${esc(it.photos[0] || '')}" alt="" data-open="${esc(it.id)}" style="cursor:pointer"><div style="flex:1;min-width:0"><div style="font-weight:900;font-size:14.5px;cursor:pointer" data-open="${esc(it.id)}">${esc(catName(it.category))}</div><div style="font-weight:800;color:var(--sage-dark);font-size:13px;margin:2px 0 4px">${fmt(it.point_value)} ${x('points')}</div>${inner}</div></div>`;
  const giftLine = (g, inner) => `<div class="card row gap12" style="align-items:flex-start"><img class="thumb mascot" src="${LOOPY.face}" alt=""><div style="flex:1;min-width:0"><div style="font-weight:900;font-size:14.5px">${esc(S.lang === 'en' ? g.name_en : g.name_tr)}</div>${inner}</div></div>`;
  let rows = [];
  if (tab === 'dropped') {
    rows = w.dropped.map((it) => line(it, `${statusPill(it.status)}${it.status_reason && !/_/.test(it.status_reason) ? `<div class="muted" style="margin-top:2px">${esc(it.status_reason)}</div>` : ''}${it.status === 'PENDING_DROP' ? `<div class="actions"><a class="btn small" href="#/qr/drop/${esc(it.id)}">${x('show_qr')}</a><button class="btn small danger" data-cancel="${esc(it.id)}" data-pts="${it.point_value}">${x('cancel_item')}</button></div>` : ''}`));
  } else if (tab === 'reserved') {
    rows = [...w.reserved.map((r) => line(r.item, `${statusPill(r.status)}${r.qr_token ? `<div class="muted" style="margin-top:2px">${x('qr_valid_until', { time: when(r.pickup_expires_at) })}</div><div class="actions"><a class="btn small green" href="#/qr/pickup/${esc(r.id)}">${x('show_qr')}</a></div>` : ''}`)),
      ...w.gifts.filter((g) => g.status === 'PENDING').map((g) => giftLine(g, `<span class="pill p-info" style="margin-top:4px">${x('gift_ready')}</span><div class="actions"><a class="btn small green" href="#/qr/gift/${esc(g.id)}">${x('show_qr')}</a></div>`)),
      ...w.closed.map((r) => line(r.item, `<span class="pill p-bad">${x(`res_${r.status}`)}</span>`))];
  } else {
    rows = [...w.acquired.map((r) => {
      const open = r.status === 'COMPLETED' && !r.return_status && new Date(r.return_until) > new Date();
      return line(r.item, `<span class="pill ${r.status === 'RETURNED' ? 'p-info' : 'p-ready'}">${x(r.status === 'RETURNED' ? 'res_RETURNED' : 'st_COMPLETED')}</span>
        ${r.return_status === 'PENDING' ? `<div class="muted" style="margin-top:2px">${x('return_pending')}</div>` : ''}${r.return_status === 'REJECTED' ? `<div class="muted" style="margin-top:2px">${x('return_rejected')}</div>` : ''}
        ${open ? `<div class="muted" style="margin-top:2px">${x('return_until', { time: when(r.return_until) })}</div>` : ''}
        <div class="actions">${open ? `<button class="btn small line navy" data-return="${esc(r.id)}">${x('start_return')}</button>` : ''}${r.reviewed ? `<span class="muted">${x('rated')}</span>` : `<button class="btn small" data-rate="${esc(r.id)}">${x('rate')}</button>`}</div>`);
    }), ...w.gifts.filter((g) => g.status !== 'PENDING').map((g) => giftLine(g, `<span class="pill p-ready" style="margin-top:4px">${x('gift_done')}</span>`))];
  }
  document.getElementById('wcount').textContent = t('items_count', { n: rows.length });
  box.innerHTML = rows.length ? rows.join('') : empty;
}

async function favorites() {
  screen(`${titleBar(t('favorites'))}<div class="content bare" id="fv">${skeleton()}</div>`);
  try {
    const w = await api('/api/me/wardrobe');
    document.getElementById('fv').innerHTML = w.favorites.length ? `<div class="grid2">${w.favorites.map(itemCard).join('')}</div>` : `<div class="card center"><p class="muted">${x('favorites_empty')}</p></div>`;
  } catch { document.getElementById('fv').innerHTML = errorBox(); }
}

async function cancelFlow(id, pts) {
  if (!await confirmSheet(t('cancel_item'), t('cancel_item_q', { n: pts }), t('cancel_item'), { danger: true })) return;
  try { await post(`/api/items/${id}/cancel`); await refreshUser(); wardrobe(); } catch (e) { toast(errText(e)); }
}
async function returnFlow(id) {
  const reason = await sheet(`<h2>${x('start_return')}</h2><div class="field" style="margin:0"><label for="rr">${x('return_reason')}</label><textarea class="input" id="rr" maxlength="280"></textarea></div><button class="btn" data-ok>${x('send')}</button><button class="btn line navy" data-close>${x('cancel')}</button>`,
    (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => { const v = el.querySelector('#rr').value.trim(); if (v) close(v); else el.querySelector('#rr').focus(); }));
  if (!reason) return;
  try { await post('/api/returns', { reservation_id: id, reason }); toast(t('return_sent'), 'success'); wardrobe(); } catch (e) { toast(errText(e)); }
}
async function rateFlow(id) {
  let score = 0;
  const data = await sheet(`<h2>${x('rate_title')}</h2><p class="muted">${x('rate_note')}</p><div class="stars">${[1, 2, 3, 4, 5].map((i) => `<button data-s="${i}" aria-label="${i}">${IC.star}</button>`).join('')}</div><div class="field" style="margin:0"><label for="rc">${x('comment_opt')}</label><textarea class="input" id="rc" maxlength="280"></textarea></div><button class="btn" data-ok disabled>${x('send')}</button><button class="btn line navy" data-close>${x('cancel')}</button>`,
    (el, close) => {
      el.querySelector('.stars').addEventListener('click', (e) => {
        const b = e.target.closest('[data-s]'); if (!b) return;
        score = Number(b.dataset.s);
        el.querySelectorAll('[data-s]').forEach((s) => s.classList.toggle('on', Number(s.dataset.s) <= score));
        el.querySelector('[data-ok]').disabled = false;
      });
      el.querySelector('[data-ok]').addEventListener('click', () => close({ score, comment: el.querySelector('#rc').value }));
    });
  if (!data) return;
  try { await post('/api/reviews', { reservation_id: id, ...data }); toast(t('thanks'), 'success'); confetti(24); wardrobe(); } catch (e) { toast(errText(e)); }
}

// ---------- Etkim ----------
async function impact() {
  screen(`<div class="content"><div class="row between" style="margin-bottom:14px"><h1 class="page-title" style="margin:0">${x('impact_title')}</h1>${headerIcons()}</div><div id="imp">${skeleton()}</div></div>${nav('impact')}`);
  let d;
  try { d = await api('/api/me/impact'); } catch { document.getElementById('imp').innerHTML = errorBox(); return; }
  const box = document.getElementById('imp');
  if (!box) return;
  box.innerHTML = `<div class="card"><div style="font-weight:800;font-size:14px;margin-bottom:12px">${x('cycle_title')}</div><div class="kpi-row"><div class="kpi"><div class="num">${fmt(d.total)}</div><div class="lbl">${x('k_added')}</div></div><div class="kpi-sep"></div><div class="kpi"><div class="num g">${fmt(d.completed)}</div><div class="lbl">${x('k_completed')}</div></div><div class="kpi-sep"></div><div class="kpi"><div class="num c">${fmt(d.acquired)}</div><div class="lbl">${x('k_acquired')}</div></div></div></div>
    <h2 class="section-title" style="margin-top:0">${x('ref_total')}</h2>
    ${d.total ? `${impactMetrics({ co2: d.co2.count ? d.co2.sum : null, water: d.water.count ? d.water.sum : null })}<p class="muted" style="margin:10px 0 14px">${x('coverage', { n: d.total, m: d.co2.count })}</p>` : `<div class="card center stack"><p class="muted">${x('impact_empty')}</p><a class="btn" href="#/drop">${x('drop_cta')}</a></div>`}
    <div class="card"><div style="font-weight:800;font-size:14px;margin-bottom:10px">${x('how_built')}</div><div class="row gap12" style="padding:6px 0">${IC.shirt}<span style="font-size:13px;font-weight:700">${x('how_built_1')}</span></div><div class="row gap12" style="padding:6px 0">${IC.leaf}<span style="font-size:13px;font-weight:700">${x('how_built_2')}</span></div><div class="divider"></div><button class="link" data-method>${x('how_calc')}</button></div>
    ${d.items.length ? `<h2 class="section-title">${x('my_items')}</h2>${d.items.map((it) => `<div class="card row gap12" data-open="${esc(it.id)}" style="cursor:pointer"><img class="thumb" src="${esc(it.photos[0] || '')}" alt=""><div style="flex:1"><div style="font-weight:900;font-size:14.5px">${esc(catName(it.category))}</div><div class="muted">${esc(matName(it.material))} (${x('declared')})</div><div style="font-size:12.5px;font-weight:700">${it.impact?.co2 != null ? `${fmt(it.impact.co2, 1)} kg CO₂e · ${fmt(it.impact.water)} ${x('litre')}` : x('data_soon')}</div></div></div>`).join('')}` : ''}`;
}

// ---------- Profil ----------
async function profile() {
  const u = S.user;
  const row = (icon, label, href, sub) => `<a class="pr-row" href="${href}"><span class="row gap12"><span class="pr-ic">${icon}</span><span><span style="display:block;font-weight:700;font-size:13.5px">${esc(label)}</span>${sub ? `<span class="muted" style="font-size:11px">${esc(sub)}</span>` : ''}</span></span>${IC.chevronRight}</a>`;
  const div = '<div class="divider" style="margin:0"></div>';
  screen(`${titleBar(t('profile'))}<div class="content bare">
    <div class="row gap16" style="margin-bottom:18px"><div style="width:66px;height:66px;border-radius:50%;background:#E7DFD0;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none;color:var(--navy)">${IC.userLg}</div><div><div style="font-weight:900;font-size:18px">${esc(u.display_name)}</div><div class="muted">${esc(u.email)}</div></div></div>
    <a class="card solid flat row between" href="#/wallet" style="background:#F1F4F0;text-decoration:none"><div><div style="font-size:26px;font-weight:900;color:var(--sage-dark)">${fmt(u.wallet_balance)} <span style="font-size:13px;color:var(--text2);font-weight:700">${x('points')}</span></div><p class="muted">${x('wallet_note')}</p></div><div style="width:40px;height:40px;border-radius:50%;background:#F8E6E6;display:flex;align-items:center;justify-content:center;color:var(--coral);flex:none">${IC.bars}</div></a>
    <h2 class="section-title">${x('account')}</h2>
    <div class="card">${row(IC.qr, t('my_code'), '#/qr/me/me')}${div}${row(IC.bars, t('wallet_history'), '#/wallet')}${div}${row(IC.bell, t('notifications'), '#/notifications')}${div}${row(IC.heart2, t('favorites'), '#/favorites')}${div}${row(IC.gift, t('gifts'), '#/gifts')}</div>
    <h2 class="section-title">LoopWear</h2>
    <div class="card">${row(IC.pin, t('stations_nav'), '#/stations')}${div}${installed ? '' : `${row(IC.doc, t('install_app'), '/indir')}${div}`}${row(IC.leaf, t('blog_title'), '#/blog')}${div}${row(IC.bell, t('support'), '#/support')}${div}${row(IC.shield, t('privacy'), '/gizlilik')}${div}<button class="pr-row" data-method><span class="row gap12"><span class="pr-ic">${IC.doc}</span><span style="font-weight:700;font-size:13.5px">${x('methodology')}</span></span>${IC.chevronRight}</button>${div}<div class="pr-row" style="cursor:default"><span style="font-weight:700;font-size:13.5px">${x('language')}</span>${langSwitch()}</div></div>
    ${u.role === 'admin' ? `<div class="card" style="border-color:var(--coral)">${row(IC.shield, t('admin_panel'), '#/admin')}</div>` : ''}
    <button class="center" style="width:100%;color:var(--coral);font-weight:800;padding:10px 0 20px" data-logout>${x('log_out')}</button></div>`);
}

async function wallet() {
  screen(`${titleBar(t('wallet_history'))}<div class="content bare" id="tx">${skeleton()}</div>`);
  try {
    const { transactions: tx } = await api('/api/me/transactions');
    document.getElementById('tx').innerHTML = `${pointsCard(S.user).replace('href="#/wallet"', '')}${tx.length ? `<div class="card">${tx.map((r, i) => `${i ? '<div class="divider" style="margin:6px 0"></div>' : ''}<div class="fin"><span><span style="display:block;font-weight:700;font-size:13.5px">${x(`tx_${r.type}`)}</span><span class="muted" style="font-size:11.5px">${when(r.created_at)}</span></span><span class="strong" style="color:${r.amount > 0 ? 'var(--sage-dark)' : 'var(--coral)'}">${r.amount > 0 ? '+' : '−'}${fmt(Math.abs(r.amount))}</span></div>`).join('')}</div>` : `<p class="muted">${x('no_tx')}</p>`}`;
  } catch { document.getElementById('tx').innerHTML = errorBox(); }
}

async function support() {
  screen(`${titleBar(t('support'))}<div class="content bare">
    <form id="sf"><div class="field"><label for="sm">${x('support_message')}</label><textarea class="input" id="sm" maxlength="1000" rows="4" required></textarea><span class="hint">${x('support_hint')}</span></div><div class="err" hidden style="margin-bottom:12px"></div><button class="btn" type="submit">${x('send')}</button></form>
    <h2 class="section-title">${x('close_account')}</h2><p class="muted" style="margin-bottom:12px">${x('close_account_body')}</p><button class="btn line navy" data-close-account>${x('close_account_btn')}</button>
    <div id="sl"></div></div>`);
  const f = document.getElementById('sf');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = f.querySelector('.err'); err.hidden = true;
    try { await post('/api/support', { kind: 'support', message: f.querySelector('textarea').value }); toast(t('support_sent'), 'success'); support(); } catch (ex) { err.textContent = errText(ex); err.hidden = false; }
  });
  try {
    const { requests: r } = await api('/api/me/support');
    if (r.length) document.getElementById('sl').innerHTML = `<h2 class="section-title">${x('support_mine')}</h2><div class="card">${r.map((s, i) => `${i ? '<div class="divider" style="margin:6px 0"></div>' : ''}<div class="fin"><span><span style="display:block;font-weight:700;font-size:13.5px">${x(`support_kind_${s.kind}`)}</span><span class="muted" style="font-size:12px">${esc(when(s.created_at))}</span></span><span class="muted" style="font-size:12px">${x(`support_${s.status}`)}</span></div>`).join('')}</div>`;
  } catch { /* liste olmadan da form çalışır */ }
}

// ---------- İklim gündemi ----------
async function blog() {
  screen(`${titleBar(t('blog_title'))}<div class="content bare"><p class="muted" style="margin-bottom:14px">${x('blog_sub')}</p><div id="bl">${skeleton()}</div></div>`);
  try {
    const { posts } = await api('/api/blog');
    const box = document.getElementById('bl');
    if (box) box.innerHTML = posts.length ? `<div class="stack">${posts.map(postCard).join('')}</div>` : `<div class="card center"><p class="muted">${x('blog_empty')}</p></div>`;
  } catch { const box = document.getElementById('bl'); if (box) box.innerHTML = errorBox(); }
}
async function blogPost(id) {
  screen(`<div class="content bare">${skeleton()}</div>`);
  let p;
  try { ({ post: p } = await api(`/api/blog/${id}`)); } catch { screen(`<div class="content">${errorBox()}</div>`); return; }
  screen(`${titleBar(t('blog_title'))}<div class="content bare">
    ${p.image ? `<img src="${esc(p.image)}" alt="" style="width:100%;border-radius:18px;margin-bottom:14px">` : ''}
    <div class="post-meta" style="margin-bottom:6px"><span class="post-lang">${esc(p.lang.toUpperCase())}</span><span>${esc(p.source || 'LoopWear')}</span><span>${esc(p.published_on || '')}</span></div>
    <h1 class="page-title" style="font-size:22px">${esc(p.title)}</h1>
    ${postSummary(p) ? `<p class="muted" style="margin-bottom:12px">${esc(postSummary(p))}</p>` : ''}
    ${(p.body || '').split(/\n{2,}/).filter(Boolean).map((para) => `<p style="margin-bottom:12px;line-height:1.6">${esc(para)}</p>`).join('')}
    ${p.url ? `<a class="btn line navy" href="${esc(p.url)}" target="_blank" rel="noopener">${x('blog_read')} ↗</a>` : ''}
  </div>`);
}

async function notifications() {
  screen(`${titleBar(t('notifications'))}<div class="content bare" id="nt">${skeleton()}</div>`);
  try {
    const { notifications: n } = await api('/api/me/notifications');
    document.getElementById('nt').innerHTML = n.length ? n.map((r) => `<div class="card notif n-${notifTone(r.kind)} ${r.read ? '' : 'unread'}" ${r.params?.item_id ? `data-open="${esc(r.params.item_id)}"` : ''}><p style="font-size:13.5px;font-weight:700">${esc(notifText(r))}</p><span class="muted" style="font-size:11.5px">${when(r.created_at)}</span></div>`).join('') : `<div class="card center"><p class="muted">${x('no_notifications')}</p></div>`;
    await post('/api/me/notifications/read');
    S.user.unread = 0;
  } catch { document.getElementById('nt').innerHTML = errorBox(); }
}

async function gifts() {
  screen(`${titleBar(t('gifts'))}<div class="content bare" id="gf">${skeleton()}</div>`);
  try {
    const { gifts: g } = await api('/api/gifts');
    document.getElementById('gf').innerHTML = g.length ? `<p class="muted" style="margin-bottom:12px">${x('current_balance')}: <b>${fmt(S.user.wallet_balance)} ${x('points')}</b></p>${g.map((o) => `<div class="card row gap12"><img class="thumb mascot" src="${LOOPY.face}" alt=""><div style="flex:1"><div style="font-weight:900;font-size:14.5px">${esc(S.lang === 'en' ? o.name_en : o.name_tr)}</div><div style="font-weight:800;color:var(--sage-dark);font-size:13px">${fmt(o.points)} ${x('points')}</div><div class="actions">${o.stock > 0 ? `<button class="btn small green" data-gift="${esc(o.id)}" data-pts="${o.points}" data-name="${esc(S.lang === 'en' ? o.name_en : o.name_tr)}">${x('buy_gift')}</button>` : `<span class="pill p-bad">${x('stock_out')}</span>`}</div></div></div>`).join('')}` : `<div class="card center"><p class="muted">${x('gift_empty')}</p></div>`;
  } catch { document.getElementById('gf').innerHTML = errorBox(); }
}
async function buyGift(btn) {
  if (S.user.wallet_balance < Number(btn.dataset.pts)) { toast(t('missing_points', { n: Number(btn.dataset.pts) - S.user.wallet_balance })); return; }
  if (!await confirmSheet(btn.dataset.name, t('gift_q', { name: btn.dataset.name, n: btn.dataset.pts }), t('buy_gift'))) return;
  try {
    const { id } = await post(`/api/gifts/${btn.dataset.gift}/buy`);
    await refreshUser();
    confetti();
    go(`#/qr/gift/${id}`);
  } catch (e) { toast(errText(e)); }
}

function stations() {
  screen(`${titleBar(t('stations_nav'))}<div class="content bare">${activeStations().map((s) => `<div class="card row between"><div class="row gap12">${IC.locker}<div><div style="font-weight:900;font-size:15px">${esc(stationName(s.id))}</div><div class="muted">${esc(s.campus_label)}</div></div></div><span class="pill p-ready">${x('station_active')}</span></div>`).join('')}</div>`);
}

// ---------- Yönlendirme ----------
const authed = { home, discover, wardrobe, impact, profile, wallet, notifications, gifts, stations, favorites, support };
async function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [head = 'home', a, b] = parts;
  window.scrollTo(0, 0);
  app.classList.toggle('wide', head === 'admin');
  document.querySelector('.toast')?.remove();
  document.getElementById('overlay').innerHTML = '';
  if (window.__stopScanner) window.__stopScanner();
  if (!S.user) {
    if (head === 'login') return authForm('login');
    if (head === 'register') return authForm('register');
    if (head === 'start') return onboarding();
    return splash();
  }
  if (['login', 'register', 'start'].includes(head)) { go(S.user.role === 'admin' ? '#/admin' : '#/'); return undefined; }
  if (head === 'admin') {
    if (S.user.role !== 'admin') { go('#/'); return undefined; }
    return renderAdmin(app, a, b);
  }
  if (head === 'item') return itemDetail(a);
  if (head === 'blog') return a ? blogPost(a) : blog();
  if (head === 'reserve') return reserveScreen(a);
  if (head === 'qr') return qrScreen(a, b);
  if (head === 'drop') {
    if (a === 'result') return dropResult(b);
    return dropFlow();
  }
  return (authed[head] || home)();
}

// Tüm dokunuşlar tek yerden
document.addEventListener('click', async (e) => {
  const q = (sel) => e.target.closest(sel);
  let el;
  try {
    if ((el = q('[data-lang]'))) {
      setLang(el.dataset.lang);
      try { sessionStorage.setItem('lw_lang_set', '1'); } catch { /* önemsiz */ }
      if (S.user) api('/api/me', { method: 'PATCH', body: { lang: el.dataset.lang } }).catch(() => {});
      route();
    } else if ((el = q('[data-fav]'))) { await toggleFav(el.dataset.fav, el.querySelector('.fav-heart') || el); }
    else if ((el = q('[data-reserve]'))) { await reserve(el.dataset.reserve); }
    else if ((el = q('[data-open]'))) { go(`#/item/${el.dataset.open}`); }
    else if (q('[data-back]')) { history.back(); }
    else if (q('[data-retry]')) { route(); }
    else if (q('[data-method]')) { methodSheet(); }
    else if ((el = q('[data-filter]'))) { await filterAction(el.dataset.filter); }
    else if ((el = q('[data-consent]'))) { const i = Number(el.dataset.consent); S.draft.consents[i] = !S.draft.consents[i]; dropFlow(); }
    else if (q('[data-drop-back]')) { if (S.draft.step > 1) { S.draft.step -= 1; dropFlow(); } else { S.draft = null; go('#/'); } }
    else if (q('[data-drop-next]')) { S.draft.step += 1; window.scrollTo(0, 0); dropFlow(); }
    else if ((el = q('[data-pick]'))) { await dropPick(el.dataset.pick); }
    else if ((el = q('[data-station-pick]'))) { S.draft.station_id = el.dataset.stationPick; dropFlow(); }
    else if ((el = q('[data-rm]'))) { e.preventDefault(); S.draft.photos[Number(el.dataset.rm)] = null; dropFlow(); }
    else if (q('[data-publish]')) { await publishDrop(); }
    else if ((el = q('[data-wtab]'))) { S.wardrobeTab = el.dataset.wtab; wardrobe(); }
    else if ((el = q('[data-cancel]'))) { await cancelFlow(el.dataset.cancel, el.dataset.pts); }
    else if ((el = q('[data-return]'))) { await returnFlow(el.dataset.return); }
    else if ((el = q('[data-rate]'))) { await rateFlow(el.dataset.rate); }
    else if ((el = q('[data-gift]'))) { await buyGift(el); }
    else if (q('[data-close-account]')) {
      if (await confirmSheet(t('close_account'), t('close_account_body'), t('close_account_btn'), { danger: true })) { await post('/api/support', { kind: 'close_account' }); toast(t('support_sent'), 'success'); support(); }
    } else if (q('[data-logout]')) { await post('/api/auth/logout'); S.user = null; S.draft = null; go('#/'); }
  } catch (ex) { toast(errText(ex)); }
});

document.addEventListener('change', async (e) => {
  const inp = e.target.closest('[data-photo]');
  if (!inp || !inp.files[0]) return;
  try {
    S.draft.photos[Number(inp.dataset.photo)] = await compressPhoto(inp.files[0]);
    dropFlow();
  } catch { toast(t('photo_error')); }
});

// Bildirim sayacı: uygulama içi bildirimler
setInterval(async () => {
  if (!S.user || document.hidden) return;
  try {
    const before = S.user.unread;
    await refreshUser();
    if (S.user && S.user.unread > before) {
      const { notifications: n } = await api('/api/me/notifications');
      const fresh = n.find((r) => !r.read);
      if (fresh) {
        const tone = notifTone(fresh.kind);
        toast(notifText(fresh), tone);
        if (tone === 'success') confetti(28);
      }
      const b = document.querySelector('.iconbtn[href="#/notifications"]');
      if (b) b.innerHTML = `${IC.bell}<span class="dot">${S.user.unread}</span>`;
    }
  } catch { /* bir sonraki turda yeniden dener */ }
}, 20000);

window.addEventListener('hashchange', route);

async function boot() {
  document.documentElement.lang = S.lang;
  try {
    S.catalog = await api('/api/catalog');
    S.catalog.closedSet = new Set(S.catalog.closed);
    await refreshUser();
  } catch {
    app.innerHTML = `<div class="content">${errorBox()}</div>`;
    document.querySelector('[data-retry]')?.addEventListener('click', boot);
    return;
  }
  route();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
boot();
