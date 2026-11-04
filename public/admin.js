// Yönetici paneli: telefonda ve bilgisayarda aynı ekranlar.
import { S, t, esc, api, post, errText, catName, matName, condName, sizeName, stationName, activeStations, fmt, when, IC, statusPill, toast, sheet, pickSheet, compressPhoto, name } from './core.js';

const x = (k, p) => esc(t(k, p));
const TABS = ['summary', 'scan', 'drops', 'pickups', 'returns', 'support', 'intake', 'users', 'impact', 'settings', 'audit'];
let root; let counts = {};

const emptyBox = () => `<div class="card center muted">${x('a_empty')}</div>`;
const thumbs = (it) => `<div class="thumbs">${it.photos.map((p) => `<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="" loading="lazy"></a>`).join('')}</div>`;
const itemLine = (it) => `<b>${esc(catName(it.category))}, ${esc(sizeName(it.size))}</b><span class="small muted"> ${esc(matName(it.material))}, ${esc(condName(it.condition))}</span><div class="small strong" style="color:var(--sage-dark)">${fmt(it.point_value)} ${x('points')}</div>`;
const left = (iso) => {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return '0';
  return t('today_left_h', { h: Math.floor(ms / 3600e3), m: Math.floor((ms % 3600e3) / 60000) });
};

// Gerekçe zorunlu: hazır seçenek ya da serbest metin
function reasonSheet(title, presets, { extra = '', okLabel, danger } = {}) {
  return sheet(`<h2>${esc(title)}</h2>${extra}
    <div class="field"><label for="rs">${x('a_note_reason')}</label><div class="row" style="flex-wrap:wrap;gap:6px">${presets.map((p) => `<button class="chip" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div><textarea class="input" id="rs" maxlength="280" style="margin-top:6px">${esc(presets[0] || '')}</textarea></div>
    <p class="err" hidden>${x('e_reason_required')}</p>
    <button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(okLabel || t('a_approve'))}</button><button class="btn line navy" data-close>${x('cancel')}</button>`,
  (el, close) => {
    const ta = el.querySelector('#rs');
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) ta.value = b.dataset.p; });
    el.querySelector('[data-ok]').addEventListener('click', () => {
      const reason = ta.value.trim();
      if (!reason) { el.querySelector('.err').hidden = false; return; }
      const vals = {};
      el.querySelectorAll('[data-extra]').forEach((i) => { vals[i.dataset.extra] = i.type === 'checkbox' ? i.checked : i.value; });
      close({ reason, ...vals });
    });
  });
}

async function act(fn, reload = true) {
  try { await fn(); toast(t('a_done')); } catch (e) { toast(errText(e)); }
  if (reload) renderAdmin(document.getElementById('app'), current.a, current.b);
}
let current = {};

function shell(tab, html) {
  document.getElementById('app').innerHTML = `<div class="admin"><aside class="side"><div class="row between"><span class="logo-wordmark">L<span class="lp">oo</span>pWear</span></div>
    <nav aria-label="${x('admin_panel')}">${TABS.map((k) => `<a href="#/admin/${k}" class="${tab === k ? 'on' : ''}">${x(`a_${k}`)}${counts[k] ? `<b>${counts[k]}</b>` : ''}</a>`).join('')}<a href="#/">${x('a_exit')}</a></nav></aside>
    <main class="main" id="amain">${html}</main></div>`;
}
const set = (html) => { const m = document.getElementById('amain'); if (m) m.innerHTML = html; };

async function loadCounts() {
  try {
    const s = await api('/api/admin/summary');
    counts = { drops: s.pending_drops, pickups: s.pending_pickups, returns: s.pending_returns, support: s.pending_support };
    return s;
  } catch { return null; }
}

// ---------- Özet ----------
async function summary() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const s = await api(`/api/admin/summary?${q}`);
  const stat = (href, n, l) => `<a class="stat" href="${href}" style="text-decoration:none;color:inherit"><b>${n}</b><span class="small muted">${esc(l)}</span></a>`;
  set(`<h1 style="margin-bottom:14px">${x('a_summary')}</h1>
    <div class="row" style="flex-wrap:wrap;margin-bottom:14px">
      <button class="chip ${q.get('station') ? 'on' : ''}" data-afilter="station">${esc(q.get('station') ? stationName(q.get('station')) : t('d_station'))}</button>
      <label class="small">${x('a_from')} <input class="input" style="padding:6px 8px;width:auto;font-size:13px" type="date" data-adate="from" value="${esc(q.get('from') || '')}"></label>
      <label class="small">${x('a_to')} <input class="input" style="padding:6px 8px;width:auto;font-size:13px" type="date" data-adate="to" value="${esc(q.get('to') || '')}"></label>
    </div>
    <div class="stats">
      ${stat('#/admin/drops', fmt(s.pending_drops), t('a_pending_drops'))}${stat('#/admin/pickups', fmt(s.pending_pickups), t('a_pending_pickups'))}${stat('#/admin/returns', fmt(s.pending_returns), t('a_pending_returns'))}
      ${stat('#/discover', fmt(s.ready), t('a_ready'))}${stat('#/admin/audit', fmt(s.completed), t('a_completed'))}${stat('#/admin/users', fmt(s.users), t('a_members'))}
      ${stat('#/admin/users', fmt(s.points_moved), t('a_points_moved'))}${stat('#/admin/impact', `${fmt(s.impact.co2, 1)} kg`, t('a_ref_co2'))}${stat('#/admin/impact', `${fmt(s.impact.water)} L`, t('a_ref_water'))}
    </div>`);
}

// ---------- Bırakma onayları ----------
const dropCard = (it) => `<div class="card stack">${thumbs(it)}<div>${itemLine(it)}</div>
  <div class="small muted">${x('a_owner')}: ${esc(it.owner?.display_name)} (${esc(it.owner?.email)})<br>${x('d_station')}: ${esc(stationName(it.station_id))}<br>${x('a_time_left', { t: left(it.expires_at) })}</div>
  <div class="row"><button class="btn small green" style="flex:1;width:100%" data-approve-drop="${esc(it.id)}" data-cond="${esc(it.condition)}">${x('a_approve')}</button><button class="btn small danger" style="flex:1;width:100%" data-reject-drop="${esc(it.id)}">${x('a_reject')}</button></div></div>`;
async function drops() {
  const { items } = await api('/api/admin/drops');
  set(`<h1 style="margin-bottom:14px">${x('a_drops')}</h1>${items.length ? `<div class="queue">${items.map(dropCard).join('')}</div>` : emptyBox()}`);
}
const condSelect = (cur) => `<div class="field"><label for="cs">${x('a_correct_condition')}</label><select class="input" id="cs" data-extra="condition">${S.catalog.conditions.map((c) => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(name(c))}</option>`).join('')}</select></div>`;
async function approveDropFlow(id, cond) {
  const r = await reasonSheet(t('a_approve'), [t('a_preset_ok')], { extra: condSelect(cond) });
  if (r) await act(() => post(`/api/admin/items/${id}/approve-drop`, r));
}
async function rejectDropFlow(id) {
  const r = await reasonSheet(t('a_reject'), [t('a_preset_stain'), t('a_preset_policy'), t('a_preset_nostock')], { okLabel: t('a_reject'), danger: true });
  if (r) await act(() => post(`/api/admin/items/${id}/reject-drop`, r));
}

// ---------- Teslim alma ----------
async function pickups() {
  const { reservations: rs } = await api('/api/admin/pickups');
  set(`<h1 style="margin-bottom:14px">${x('a_pickups')}</h1>${rs.length ? `<div class="queue">${rs.map((r) => `<div class="card stack">${thumbs(r.item)}<div>${itemLine(r.item)}</div>
    <div class="small muted">${x('a_buyer')}: ${esc(r.buyer.display_name)} (${esc(r.buyer.email)})<br>${when(r.requested_at)}<br>${x('d_station')}: ${esc(stationName(r.item.station_id))}</div>
    ${r.status === 'PENDING_PICKUP' ? `<div class="row"><button class="btn small green" style="flex:1;width:100%" data-approve-pick="${esc(r.id)}">${x('a_approve_qr')}</button><button class="btn small danger" style="flex:1;width:100%" data-reject-pick="${esc(r.id)}">${x('a_reject')}</button></div>` : `<span class="pill p-info" style="align-self:flex-start">${x('a_awaiting_pickup')}, ${x('a_time_left', { t: left(r.pickup_expires_at) })}</span>`}</div>`).join('')}</div>` : emptyBox()}`);
}

// ---------- İade ----------
async function returns() {
  const { returns: rs } = await api('/api/admin/returns');
  set(`<h1 style="margin-bottom:14px">${x('a_returns')}</h1>${rs.length ? `<div class="queue">${rs.map((r) => `<div class="card stack">${thumbs(r.item)}<div>${itemLine(r.item)}</div>
    <div class="small muted">${x('a_buyer')}: ${esc(r.buyer.display_name)}<br>${x('a_return_reason')}: ${esc(r.reason)}<br>${x('a_refund')}: ${fmt(r.amount)} ${x('points')}<br>${x('a_time_left', { t: left(r.until) })}</div>
    <div class="row"><button class="btn small green" style="flex:1;width:100%" data-approve-ret="${esc(r.id)}">${x('a_approve')}</button><button class="btn small danger" style="flex:1;width:100%" data-reject-ret="${esc(r.id)}">${x('a_reject')}</button></div></div>`).join('')}</div>` : emptyBox()}`);
}

// ---------- Destek ve hesap kapatma talepleri ----------
async function support() {
  const { requests: rs } = await api('/api/admin/support');
  set(`<h1 style="margin-bottom:14px">${x('a_support')}</h1>${rs.length ? `<div class="queue">${rs.map((r) => `<div class="card stack"><span class="pill ${r.kind === 'close_account' ? 'p-wait' : 'p-info'}" style="align-self:flex-start">${x(`support_kind_${r.kind}`)}</span>
    <div><b>${esc(r.display_name)}</b><div class="small muted">${esc(r.email)}, ${esc(when(r.created_at))}</div></div>${r.message ? `<p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(r.message)}</p>` : ''}
    <button class="btn small green" data-support-done="${esc(r.id)}">${x('a_support_done')}</button></div>`).join('')}</div>` : emptyBox()}`);
}

// ---------- QR okutma ----------
let stream = null; let raf = 0;
function stopScanner() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((tr) => tr.stop());
  stream = null;
}
window.__stopScanner = stopScanner;

async function startCamera(onCode) {
  const v = document.getElementById('cam');
  const note = document.getElementById('camNote');
  if (!v) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    v.srcObject = stream;
    await v.play();
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const loop = () => {
      if (!stream) return;
      if (v.readyState === v.HAVE_ENOUGH_DATA && window.jsQR) {
        const k = 480 / Math.max(v.videoWidth, v.videoHeight);
        c.width = v.videoWidth * k; c.height = v.videoHeight * k;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const code = window.jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) { stopScanner(); onCode(code.data); return; }
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
  } catch {
    document.querySelector('.scanner')?.setAttribute('hidden', '');
    if (note) note.hidden = false;
    document.getElementById('camTitle')?.setAttribute('hidden', '');
  }
}

function scanView() {
  set(`<h1 style="margin-bottom:14px">${x('a_scan')}</h1><div class="stack" style="max-width:520px">
    <div class="scanner"><video id="cam" playsinline muted></video></div><p class="small muted" id="camNote" hidden>${x('a_scan_camera_off')}</p>
    <p class="muted" id="camTitle">${x('a_scan_title')}</p>
    <form class="row" id="manual"><input class="input" id="tok" aria-label="${x('a_scan_manual')}" placeholder="${x('a_scan_manual')}" autocapitalize="off" autocomplete="off"><button class="btn small" style="white-space:nowrap;padding:13px 14px">${x('a_scan_check')}</button></form>
    <div id="scanResult"></div></div>`);
  document.getElementById('manual').addEventListener('submit', (e) => { e.preventDefault(); const v = document.getElementById('tok').value.trim(); if (v) { stopScanner(); showToken(v); } });
  startCamera(showToken);
}

async function showToken(token) {
  const box = document.getElementById('scanResult');
  const again = `<button class="btn line navy" data-scan-again>${x('a_scan_again')}</button>`;
  let r;
  try { r = await post('/api/admin/scan', { token }); } catch (e) { box.innerHTML = `<div class="stack"><p class="err">${esc(errText(e))}</p>${again}</div>`; return; }
  if (r.type === 'drop') {
    box.innerHTML = `<div class="card stack"><span class="pill p-wait" style="align-self:flex-start">${x('a_scan_drop')}</span>${thumbs(r.item)}<div>${itemLine(r.item)}</div><div class="row"><button class="btn small green" style="flex:1;width:100%" data-approve-drop="${esc(r.item.id)}" data-cond="${esc(r.item.condition)}">${x('a_approve')}</button><button class="btn small danger" style="flex:1;width:100%" data-reject-drop="${esc(r.item.id)}">${x('a_reject')}</button></div></div>`;
  } else if (r.type === 'pickup') {
    box.innerHTML = `<div class="card stack"><span class="pill p-ready" style="align-self:flex-start">${x('a_scan_pickup')}</span>${thumbs(r.item)}<div>${itemLine(r.item)}</div><button class="btn green" data-complete="${esc(token)}">${x('a_complete_pickup')}</button></div>`;
  } else if (r.type === 'gift') {
    box.innerHTML = `<div class="card stack"><span class="pill p-info" style="align-self:flex-start">${x('a_scan_gift')}</span><b>${esc(S.lang === 'en' ? r.gift.name_en : r.gift.name_tr)}</b><span class="small muted">${esc(r.gift.display_name)}</span><button class="btn green" data-gift-done="${esc(token)}">${x('a_complete_gift')}</button></div>`;
  } else {
    box.innerHTML = `<div class="card stack"><span class="pill p-info" style="align-self:flex-start">${x('a_scan_user')}</span><b>${esc(r.display_name)}</b><a class="btn" href="#/admin/intake/${encodeURIComponent(token)}" style="text-decoration:none">${x('a_intake_for')}</a></div>`;
  }
}

// ---------- Görevli kıyafet kabulü ----------
let intake = null;
function intakeView(code) {
  if (!intake) intake = { user_code: code ? decodeURIComponent(code) : '', category: '', condition: '', size: '', material: '', color: '', station_id: activeStations()[0]?.id || '', photos: [null, null, null, null], client_key: crypto.randomUUID?.() || String(Date.now()) };
  if (code) intake.user_code = decodeURIComponent(code);
  const d = intake; const c = S.catalog;
  const sel = (key, label, val) => `<div class="field"><span class="label">${esc(label)}</span><button class="fakeinput ${val ? '' : 'ph'}" data-ipick="${key}"><span>${esc(val || t('choose'))}</span>${IC.chevron}</button></div>`;
  const labelFor = { category: d.category && name(c.categories.find((o) => o.id === d.category)), condition: d.condition && name(c.conditions.find((o) => o.id === d.condition)), size: d.size && sizeName(d.size), material: d.material && name(c.materials.find((o) => o.id === d.material)), color: d.color && name(c.colors.find((o) => o.id === d.color)) };
  const labels = ['ph_front', 'ph_back', 'ph_detail', 'ph_optional'];
  const ok = d.user_code && d.category && d.condition && d.size && d.material && d.color && d.photos.slice(0, 3).every(Boolean);
  set(`<h1 style="margin-bottom:6px">${x('a_intake_title')}</h1><p class="muted" style="margin-bottom:14px;max-width:60ch">${x('a_intake_body')}</p><div class="stack" style="max-width:520px">
    <div class="field"><label for="uc">${x('a_member_code')}</label><div class="row"><input class="input" id="uc" value="${esc(d.user_code)}" autocapitalize="off" autocomplete="off"><a class="btn small line navy" href="#/admin/scan" style="padding:13px 14px;white-space:nowrap">${x('a_scan')}</a></div></div>
    ${sel('category', t('d_category'), labelFor.category)}${sel('condition', t('d_condition'), labelFor.condition)}${sel('size', t('d_size'), labelFor.size)}${sel('material', t('d_material'), labelFor.material)}${sel('color', t('d_color'), labelFor.color)}
    <div class="grid2">${labels.map((l, i) => `<label class="photoslot">${d.photos[i] ? `<img src="${d.photos[i]}" alt=""><span class="lbl">${x(l)}</span><button class="rm" data-irm="${i}">${x('remove')}</button>` : `${IC.plus}<span>${x(l)}</span>`}<input type="file" accept="image/*" data-iphoto="${i}" aria-label="${x(l)}" ${d.photos[i] ? 'hidden' : ''}></label>`).join('')}</div>
    <button class="btn green" data-intake-save ${ok ? '' : 'disabled'}>${x('publish')}</button></div>`);
  document.getElementById('uc').addEventListener('change', (e) => { d.user_code = e.target.value.trim(); intakeView(); });
}
async function intakePick(key) {
  const c = S.catalog;
  const map = { category: [c.categories.map((o) => ({ value: o.id, label: name(o) })), t('search_category')], condition: [c.conditions.map((o) => ({ value: o.id, label: name(o), right: `+${o.points}` }))], size: [c.sizes.map((s) => ({ value: s, label: sizeName(s) }))], material: [c.materials.map((o) => ({ value: o.id, label: name(o) }))], color: [c.colors.map((o) => ({ value: o.id, label: name(o) }))] }[key];
  const v = await pickSheet(t(`d_${key}`), map[0], { search: map[1], current: intake[key] });
  if (v !== undefined) { intake[key] = v; intakeView(); }
}
async function intakeSave() {
  const d = intake;
  try {
    const scan = await post('/api/admin/scan', { token: d.user_code });
    if (scan.type !== 'user') throw Object.assign(new Error('invalid_qr'), { code: 'invalid_qr' });
    const r = await post('/api/admin/intake', { ...d, photos: d.photos.filter(Boolean), reason: t('a_intake') });
    toast(t('a_intake_done', { name: scan.display_name, n: r.points }));
    intake = null;
    location.hash = '#/admin/intake';
    intakeView();
  } catch (e) { toast(errText(e)); }
}

// ---------- Kullanıcılar ----------
async function users() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '';
  const { users: us } = await api(`/api/admin/users?q=${encodeURIComponent(q)}`);
  set(`<h1 style="margin-bottom:14px">${x('a_users')}</h1><form class="searchbar" id="us" style="margin-bottom:12px;max-width:420px">${IC.search}<input name="q" value="${esc(q)}" placeholder="${x('a_search_users')}" aria-label="${x('a_search_users')}"></form>
    <div class="tbl-wrap"><table><thead><tr><th>${x('display_name')}</th><th>${x('email')}</th><th>${x('a_balance')}</th><th>${x('a_dropped')}</th><th>${x('a_acquired')}</th><th>${x('a_rating')}</th><th></th></tr></thead><tbody>
    ${us.map((u) => `<tr><td>${esc(u.display_name)}</td><td>${esc(u.email)}</td><td><b>${fmt(u.wallet_balance)}</b></td><td>${u.dropped}</td><td>${u.acquired}</td><td>${u.rating ?? ''}</td><td><button class="link small" data-user="${esc(u.id)}">${x('wallet_history')}</button></td></tr>`).join('')}</tbody></table></div>`);
  document.getElementById('us').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/admin/users?q=${encodeURIComponent(e.target.q.value)}`; });
}
async function userDetail(id) {
  const { user: u, transactions: tx } = await api(`/api/admin/users/${id}`);
  const r = await sheet(`<h2>${esc(u.display_name)}</h2><p class="small muted">${esc(u.email)}</p><p><b>${x('a_balance')}: ${fmt(u.wallet_balance)} ${x('points')}</b></p>
    <div class="card" style="max-height:30dvh;overflow:auto">${tx.map((o) => `<div class="fin small"><span>${x(`tx_${o.type}`)}${o.reason ? `<br><span class="muted">${esc(o.reason)}</span>` : ''}<br><span class="muted">${when(o.created_at)}</span></span><b>${o.amount > 0 ? '+' : ''}${o.amount}</b></div>`).join('') || `<p class="muted">${x('no_tx')}</p>`}</div>
    <h3>${x('a_adjust')}</h3><div class="field"><label for="am">${x('a_amount')}</label><input class="input" id="am" type="number" inputmode="numeric"></div><div class="field"><label for="ar">${x('a_note_reason')}</label><input class="input" id="ar" maxlength="280"></div>
    <button class="btn" data-ok>${x('save')}</button><button class="btn line navy" data-close>${x('close')}</button>`, (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => close({ amount: Number(el.querySelector('#am').value), reason: el.querySelector('#ar').value })));
  if (r) await act(() => post(`/api/admin/users/${id}/points`, r));
}

// ---------- Etkiler ----------
async function impact() {
  const q = location.hash.split('?')[1] || '';
  const p = new URLSearchParams(q);
  const { rows } = await api(`/api/admin/impact?${q}`);
  set(`<h1 style="margin-bottom:6px">${x('a_impact')}</h1><p class="small muted" style="margin-bottom:12px">${x('ref_label')}</p>
    <div class="row" style="flex-wrap:wrap;margin-bottom:12px"><button class="chip ${p.get('category') ? 'on' : ''}" data-ifilter="category">${esc(p.get('category') ? catName(p.get('category')) : t('d_category'))}</button><button class="chip ${p.get('material') ? 'on' : ''}" data-ifilter="material">${esc(p.get('material') ? matName(p.get('material')) : t('d_material'))}</button><a class="btn small line navy" href="/api/admin/impact.csv?${esc(q)}" download style="text-decoration:none">${x('a_export')}</a></div>
    ${rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>${x('d_category')}</th><th>${x('d_material')}</th><th>${x('a_items')}</th><th>${x('a_with_data')}</th><th>kg CO₂e</th><th>${x('litre')}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(catName(r.category))}</td><td>${esc(matName(r.material))}</td><td>${r.items}</td><td>${r.with_data}</td><td>${fmt(r.co2, 1)}</td><td>${fmt(r.water)}</td></tr>`).join('')}</tbody></table></div>` : emptyBox()}`);
}

// ---------- Ayarlar ----------
async function settings() {
  const [{ settings: s }, { gifts }, { reviews }] = await Promise.all([api('/api/admin/settings'), api('/api/admin/gifts'), api('/api/admin/reviews')]);
  S.catalog = await api('/api/catalog');
  S.catalog.closedSet = new Set(S.catalog.closed);
  const num = (k, label) => `<div class="field"><label for="s_${k}">${esc(label)}</label><input class="input" id="s_${k}" type="number" min="0" data-setting="${k}" value="${esc(s[k])}"></div>`;
  set(`<h1 style="margin-bottom:14px">${x('a_settings')}</h1><div class="stack" style="max-width:720px">
    <h2>${x('a_stations')}</h2><div class="card">${S.catalog.stations.map((st) => `<button class="check ${st.active ? 'on' : ''}" role="switch" aria-checked="${st.active}" data-station="${esc(st.id)}" data-active="${st.active}" style="margin-bottom:6px"><span class="box">${IC.check}</span><span>${esc(S.lang === 'en' ? st.name_en : st.name_tr)}<span class="small muted" style="display:block;font-weight:400">${esc(st.campus_label)}</span></span></button>`).join('')}</div>
    <h2>${x('a_rules')}</h2><div class="form-grid">${num('starter_points', t('a_starter'))}${num('drop_hours', t('a_drop_hours'))}${num('pickup_hours', t('a_pickup_hours'))}${num('return_hours', t('a_return_hours'))}</div><button class="btn small" style="align-self:flex-start" data-save-settings>${x('save')}</button>
    <h2>${x('a_gifts')}</h2>${gifts.map((g) => `<div class="card form-grid" data-giftrow="${esc(g.id)}"><div class="field"><label>${x('a_gift_name')}</label><input class="input" data-g="name_tr" value="${esc(g.name_tr)}"></div><div class="field"><label>${x('a_gift_name_en')}</label><input class="input" data-g="name_en" value="${esc(g.name_en)}"></div><div class="field"><label>${x('a_gift_points')}</label><input class="input" type="number" min="1" data-g="points" value="${g.points}"></div><div class="field"><label>${x('a_gift_stock')}</label><input class="input" type="number" min="0" data-g="stock" value="${g.stock}"></div><button class="btn small" style="align-self:end;padding:13px 14px" data-save-gift="${esc(g.id)}">${x('save')}</button></div>`).join('')}
    <button class="btn small line navy" style="align-self:flex-start" data-add-gift>${x('a_gift_add')}</button>
    <h2>${x('a_reviews')}</h2>${reviews.length ? `<div class="tbl-wrap"><table><tbody>${reviews.map((r) => `<tr><td><b>${r.score}/5</b></td><td style="${r.hidden ? 'text-decoration:line-through' : ''}">${esc(r.comment || '')}</td><td>${when(r.created_at)}</td><td>${r.comment ? `<button class="link small" data-hide="${esc(r.id)}">${x(r.hidden ? 'a_show' : 'a_hide')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : emptyBox()}
  </div>`);
}

// ---------- İşlem kaydı ----------
async function audit() {
  const { entries } = await api('/api/admin/audit');
  set(`<h1 style="margin-bottom:14px">${x('a_audit')}</h1><div class="tbl-wrap"><table><thead><tr><th>${x('a_when')}</th><th>${x('a_who')}</th><th>${x('a_what')}</th><th>${x('a_change')}</th><th>${x('a_note_reason')}</th></tr></thead><tbody>
    ${entries.map((e) => `<tr><td style="white-space:nowrap">${when(e.created_at)}</td><td>${esc(e.actor || t('a_system'))}</td><td>${esc(e.entity_type)}: ${esc(e.action)}</td><td>${esc(e.old_value ?? '')}${e.new_value != null ? ` / ${esc(e.new_value)}` : ''}</td><td>${esc(e.reason ?? '')}</td></tr>`).join('')}</tbody></table></div>`);
}

const VIEWS = { support, summary, drops, pickups, returns, users, impact, settings, audit };

export async function renderAdmin(app, a, b) {
  root = app;
  const raw = (a || 'summary').split('?')[0];
  const tab = TABS.includes(raw) ? raw : 'summary';
  current = { a, b };
  await loadCounts();
  shell(tab, '<div class="skeleton"></div>');
  try {
    if (tab === 'scan') return scanView();
    if (tab === 'intake') return intakeView((b || '').split('?')[0] || undefined);
    await VIEWS[tab]();
  } catch (e) { set(`<div class="card stack center"><p>${esc(errText(e))}</p><button class="btn line navy" data-retry>${x('retry')}</button></div>`); }
  return undefined;
}

// Panel dokunuşları
document.addEventListener('click', async (e) => {
  if (!root || !location.hash.startsWith('#/admin')) return;
  const q = (s) => e.target.closest(s); let el;
  if ((el = q('[data-approve-drop]'))) await approveDropFlow(el.dataset.approveDrop, el.dataset.cond);
  else if ((el = q('[data-reject-drop]'))) await rejectDropFlow(el.dataset.rejectDrop);
  else if ((el = q('[data-support-done]'))) { const r = await reasonSheet(t('a_support_done'), [t('a_preset_replied')], { okLabel: t('a_support_done') }); if (r) await act(() => post(`/api/admin/support/${el.dataset.supportDone}/close`, r)); }
  else if ((el = q('[data-approve-pick]'))) { const r = await reasonSheet(t('a_approve_qr'), [t('a_preset_pick')], { okLabel: t('a_approve_qr') }); if (r) await act(() => post(`/api/admin/reservations/${el.dataset.approvePick}/approve`, r)); }
  else if ((el = q('[data-reject-pick]'))) { const r = await reasonSheet(t('a_reject'), [t('a_preset_unavail')], { okLabel: t('a_reject'), danger: true }); if (r) await act(() => post(`/api/admin/reservations/${el.dataset.rejectPick}/reject`, r)); }
  else if ((el = q('[data-approve-ret]'))) { const r = await reasonSheet(t('a_approve'), [t('a_preset_back')], { extra: `<label class="row strong"><input type="checkbox" data-extra="republish"> ${x('a_republish')}</label>` }); if (r) await act(() => post(`/api/admin/returns/${el.dataset.approveRet}/approve`, r)); }
  else if ((el = q('[data-reject-ret]'))) { const r = await reasonSheet(t('a_reject'), [t('a_preset_noback')], { okLabel: t('a_reject'), danger: true }); if (r) await act(() => post(`/api/admin/returns/${el.dataset.rejectRet}/reject`, r)); }
  else if (q('[data-scan-again]')) scanView();
  else if ((el = q('[data-complete]'))) { const r = await reasonSheet(t('a_complete_pickup'), [t('a_preset_scan')], { okLabel: t('a_complete_pickup') }); if (r) await act(() => post('/api/admin/scan/complete', { token: el.dataset.complete, ...r })); }
  else if ((el = q('[data-gift-done]'))) { const r = await reasonSheet(t('a_complete_gift'), [t('a_preset_gift')], { okLabel: t('a_complete_gift') }); if (r) await act(() => post('/api/admin/scan/gift', { token: el.dataset.giftDone, ...r })); }
  else if ((el = q('[data-ipick]'))) await intakePick(el.dataset.ipick);
  else if ((el = q('[data-irm]'))) { e.preventDefault(); intake.photos[Number(el.dataset.irm)] = null; intakeView(); }
  else if (q('[data-intake-save]')) await intakeSave();
  else if ((el = q('[data-user]'))) await userDetail(el.dataset.user);
  else if ((el = q('[data-afilter]'))) {
    const v = await pickSheet(t('d_station'), [{ value: '', label: t('all') }, ...S.catalog.stations.map((s) => ({ value: s.id, label: stationName(s.id) }))]);
    if (v !== undefined) setQuery('summary', 'station', v);
  } else if ((el = q('[data-ifilter]'))) {
    const key = el.dataset.ifilter;
    const list = key === 'category' ? S.catalog.categories : S.catalog.materials;
    const v = await pickSheet(t(`d_${key}`), [{ value: '', label: t('all') }, ...list.map((o) => ({ value: o.id, label: name(o) }))]);
    if (v !== undefined) setQuery('impact', key, v);
  } else if ((el = q('[data-station]'))) await act(() => post(`/api/admin/stations/${el.dataset.station}`, { active: el.dataset.active !== 'true', reason: 'station_update' }));
  else if (q('[data-save-settings]')) {
    const body = {};
    document.querySelectorAll('[data-setting]').forEach((i) => { body[i.dataset.setting] = Number(i.value); });
    await act(() => post('/api/admin/settings', body));
  } else if ((el = q('[data-save-gift]'))) {
    const row = el.closest('[data-giftrow]'); const body = { id: el.dataset.saveGift };
    row.querySelectorAll('[data-g]').forEach((i) => { body[i.dataset.g] = i.type === 'number' ? Number(i.value) : i.value; });
    await act(() => post('/api/admin/gifts', body));
  } else if (q('[data-add-gift]')) await act(() => post('/api/admin/gifts', { name_tr: 'LoopWear', name_en: 'LoopWear', points: 20, stock: 0 }));
  else if ((el = q('[data-hide]'))) { const r = await reasonSheet(t('a_hide'), [t('a_preset_policy')]); if (r) await act(() => post(`/api/admin/reviews/${el.dataset.hide}/hide`, r)); }
});

function setQuery(tab, key, value) {
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  if (value) p.set(key, value); else p.delete(key);
  location.hash = `#/admin/${tab}?${p}`;
}

document.addEventListener('change', async (e) => {
  if (!location.hash.startsWith('#/admin')) return;
  const dt = e.target.closest('[data-adate]');
  if (dt) { setQuery('summary', dt.dataset.adate, dt.value); return; }
  const inp = e.target.closest('[data-iphoto]');
  if (inp?.files[0]) {
    try { intake.photos[Number(inp.dataset.iphoto)] = await compressPhoto(inp.files[0]); intakeView(); } catch { toast(t('photo_error')); }
  }
});
