// İş kuralları. Etkili durum değişiklikleri burada, tek işlem (transaction) içinde olur.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { newId } from './db.js';

export const catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));

const catById = Object.fromEntries(catalog.categories.map((c) => [c.id, c]));
const matById = Object.fromEntries(catalog.materials.map((m) => [m.id, m]));
const condById = Object.fromEntries(catalog.conditions.map((c) => [c.id, c]));
const closed = new Set(catalog.closed);

export const DEFAULT_SETTINGS = { starter_points: '20', drop_hours: '24', pickup_hours: '24', return_hours: '72' };

export class AppError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

// Tahmin edilemez, tek kullanımlık QR içeriği
const qrToken = (prefix) => `${prefix}-${randomBytes(16).toString('base64url')}`;

export function computePoints(category, condition) {
  const c = catById[category]; const k = condById[condition];
  if (!c || !k) throw new AppError('invalid_item');
  return Math.max(0, Math.min(100, c.points + k.points));
}

export function computeImpact(category, material) {
  const c = catById[category]; const m = matById[material];
  const usable = c && m && m.co2 != null && !closed.has(`${category}|${material}`);
  return {
    weight_kg: usable ? c.weight : null,
    co2_factor: usable ? m.co2 : null,
    water_factor: usable ? m.water : null,
    co2e_reference: usable ? c.weight * m.co2 : null,
    water_reference: usable ? c.weight * m.water : null,
    methodology_version: catalog.impact_version,
  };
}

export async function getSettings(db) {
  const rows = await db.q('SELECT key, value FROM settings');
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

export async function audit(t, actorId, entityType, entityId, action, oldValue, newValue, reason) {
  await t.q(
    'INSERT INTO audit_log (id, actor_id, entity_type, entity_id, action, old_value, new_value, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [newId(), actorId, entityType, entityId, action, oldValue == null ? null : String(oldValue), newValue == null ? null : String(newValue), reason || null],
  );
}

export async function notify(t, userId, kind, params = {}) {
  await t.q('INSERT INTO notifications (id, user_id, kind, params) VALUES ($1,$2,$3,$4)', [newId(), userId, kind, JSON.stringify(params)]);
}

// Bakiye değişikliği ve hareket kaydı her zaman birlikte yazılır
export async function moveWallet(t, userId, amount, type, { itemId = null, reason = null } = {}) {
  const [u] = await t.q('UPDATE users SET wallet_balance = wallet_balance + $2 WHERE id = $1 RETURNING wallet_balance', [userId, amount]);
  await t.q(
    'INSERT INTO transactions (id, user_id, item_id, type, amount, balance_after, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [newId(), userId, itemId, type, amount, u.wallet_balance, reason],
  );
  return u.wallet_balance;
}

const requireReason = (reason) => {
  const r = String(reason || '').trim();
  if (!r) throw new AppError('reason_required');
  return r;
};

const notifyParams = (item) => ({ category: item.category, station: item.station_id, item_id: item.id });

// ---------- Ürün oluşturma (UC-02) ----------
export async function createItem(db, ownerId, input, opts = {}) {
  const { category, material, size, condition, color, station_id, consents, photos, client_key } = input;
  if (!opts.assisted && !(Array.isArray(consents) && consents.length === 4 && consents.every(Boolean))) throw new AppError('consents_required');
  if (!Array.isArray(photos) || photos.length < 3 || photos.length > 4) throw new AppError('photos_required');
  if (!catById[category] || !matById[material] || !condById[condition]) throw new AppError('invalid_item');
  if (!catalog.sizes.includes(size) || !catalog.colors.some((c) => c.id === color)) throw new AppError('invalid_item');
  const decoded = photos.map((p, i) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(p || '');
    if (!m) throw new AppError('invalid_photo');
    const data = Buffer.from(m[2], 'base64');
    if (data.length > 3 * 1024 * 1024) throw new AppError('photo_too_large');
    return { mime: m[1], data, sort_order: i, image_type: ['front', 'back', 'detail', 'label'][i] };
  });
  return db.tx(async (t) => {
    if (client_key) {
      const [dup] = await t.q('SELECT id FROM items WHERE owner_id=$1 AND client_key=$2', [ownerId, client_key]);
      if (dup) return { id: dup.id, duplicate: true };
    }
    const [st] = await t.q('SELECT id FROM stations WHERE id=$1 AND active', [station_id]);
    if (!st) throw new AppError('invalid_station');
    const points = computePoints(category, condition);
    const id = newId();
    const status = opts.assisted ? 'READY' : 'PENDING_DROP';
    await t.q(
      `INSERT INTO items (id, owner_id, client_key, category, material, size, condition, condition_source, color, station_id, point_value, status, drop_token, drop_token_used, scoring_version, ready_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, ownerId, client_key || null, category, material, size, condition, opts.assisted ? 'staff' : 'user', color, station_id, points, status,
        qrToken('LW'), !!opts.assisted, catalog.scoring_version, opts.assisted ? new Date().toISOString() : null],
    );
    for (const p of decoded) {
      await t.q('INSERT INTO item_images (id, item_id, data, mime, sort_order, image_type) VALUES ($1,$2,$3,$4,$5,$6)', [newId(), id, p.data, p.mime, p.sort_order, p.image_type]);
    }
    const im = computeImpact(category, material);
    await t.q(
      'INSERT INTO impact_snapshots (item_id, weight_kg, co2_factor, water_factor, co2e_reference, water_reference, methodology_version) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, im.weight_kg, im.co2_factor, im.water_factor, im.co2e_reference, im.water_reference, im.methodology_version],
    );
    await moveWallet(t, ownerId, points, 'DROP_EARN', { itemId: id });
    await notify(t, ownerId, 'item_published', { ...notifyParams({ id, category, station_id }), points });
    if (opts.assisted) await audit(t, opts.actorId, 'item', id, 'assisted_create', null, 'READY', opts.reason || 'staff_intake');
    return { id, duplicate: false, points, impact: im };
  });
}

// Kayıt anında verilen puan geri alınır (süre dolumu, red, iptal). Harcanmışsa bakiye eksiye düşer.
async function reverseDropPoints(t, item, type, reason) {
  await moveWallet(t, item.owner_id, -item.point_value, type, { itemId: item.id, reason });
}

async function closeSubscriptions(t, itemId) {
  await t.q('UPDATE subscriptions SET active=FALSE WHERE item_id=$1', [itemId]);
}

export async function cancelItem(db, ownerId, itemId) {
  return db.tx(async (t) => {
    const [item] = await t.q("UPDATE items SET status='CANCELLED', status_reason='owner_cancelled' WHERE id=$1 AND owner_id=$2 AND status='PENDING_DROP' RETURNING *", [itemId, ownerId]);
    if (!item) throw new AppError('not_cancellable', 409);
    await reverseDropPoints(t, item, 'DROP_REVERSAL', 'owner_cancelled');
    await closeSubscriptions(t, itemId);
    await audit(t, ownerId, 'item', itemId, 'cancel', 'PENDING_DROP', 'CANCELLED', 'owner_cancelled');
  });
}

// ---------- Yönetici bırakma kararı (UC-04) ----------
export async function approveDrop(db, adminId, itemId, { reason, condition } = {}) {
  const why = requireReason(reason);
  return db.tx(async (t) => {
    const [item] = await t.q("UPDATE items SET status='READY', ready_at=now(), status_reason=NULL, drop_token_used=TRUE WHERE id=$1 AND status='PENDING_DROP' RETURNING *", [itemId]);
    if (!item) throw new AppError('invalid_state', 409);
    await audit(t, adminId, 'item', itemId, 'approve_drop', 'PENDING_DROP', 'READY', why);
    if (condition && condition !== item.condition) await applyConditionChange(t, adminId, item, condition, why);
    const subs = await t.q('SELECT user_id FROM subscriptions WHERE item_id=$1 AND active', [itemId]);
    for (const s of subs) await notify(t, s.user_id, 'item_ready', notifyParams(item));
    await closeSubscriptions(t, itemId);
    await notify(t, item.owner_id, 'drop_approved', notifyParams(item));
  });
}

async function applyConditionChange(t, adminId, item, condition, why) {
  if (!condById[condition]) throw new AppError('invalid_item');
  const points = computePoints(item.category, condition);
  const diff = points - item.point_value;
  await t.q("UPDATE items SET condition=$2, condition_source='staff', point_value=$3 WHERE id=$1", [item.id, condition, points]);
  if (diff !== 0) await moveWallet(t, item.owner_id, diff, 'ADMIN_ADJUST', { itemId: item.id, reason: why });
  await audit(t, adminId, 'item', item.id, 'correct_condition', `${item.condition}/${item.point_value}`, `${condition}/${points}`, why);
  await notify(t, item.owner_id, 'item_corrected', { ...notifyParams(item), points });
}

export async function rejectDrop(db, adminId, itemId, { reason } = {}) {
  const why = requireReason(reason);
  return db.tx(async (t) => {
    const [item] = await t.q("UPDATE items SET status='REJECTED', status_reason=$2 WHERE id=$1 AND status='PENDING_DROP' RETURNING *", [itemId, why]);
    if (!item) throw new AppError('invalid_state', 409);
    await reverseDropPoints(t, item, 'DROP_REVERSAL', why);
    await closeSubscriptions(t, itemId);
    await audit(t, adminId, 'item', itemId, 'reject_drop', 'PENDING_DROP', 'REJECTED', why);
    await notify(t, item.owner_id, 'drop_rejected', { ...notifyParams(item), reason: why });
  });
}

export async function removeItem(db, adminId, itemId, { reason } = {}) {
  const why = requireReason(reason);
  return db.tx(async (t) => {
    const [item] = await t.q("UPDATE items SET status='REJECTED', status_reason=$2 WHERE id=$1 AND status='READY' RETURNING *", [itemId, why]);
    if (!item) throw new AppError('invalid_state', 409);
    await audit(t, adminId, 'item', itemId, 'remove', 'READY', 'REJECTED', why);
    await notify(t, item.owner_id, 'drop_rejected', { ...notifyParams(item), reason: why });
  });
}

// ---------- Rezervasyon (UC-06) ----------
export async function reserveItem(db, buyerId, itemId) {
  return db.tx(async (t) => {
    const [peek] = await t.q('SELECT owner_id, point_value FROM items WHERE id=$1', [itemId]);
    if (!peek) throw new AppError('not_found', 404);
    if (peek.owner_id === buyerId) throw new AppError('own_item', 403);
    // Atomik: durum aynı anda yalnızca bir istekle değişir
    const [item] = await t.q("UPDATE items SET status='PENDING_PICKUP' WHERE id=$1 AND status='READY' RETURNING *", [itemId]);
    if (!item) throw new AppError('not_available', 409);
    const [u] = await t.q('SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE', [buyerId]);
    if (u.wallet_balance < item.point_value) throw Object.assign(new AppError('insufficient_points', 409), { missing: item.point_value - u.wallet_balance });
    const id = newId();
    await t.q("INSERT INTO reservations (id, item_id, buyer_id, status, amount) VALUES ($1,$2,$3,'PENDING_PICKUP',$4)", [id, itemId, buyerId, item.point_value]);
    await moveWallet(t, buyerId, -item.point_value, 'PICKUP_HOLD', { itemId });
    await audit(t, buyerId, 'item', itemId, 'reserve', 'READY', 'PENDING_PICKUP', null);
    return { id };
  });
}

// ---------- Teslim alma kararı (UC-07) ----------
export async function approvePickup(db, adminId, reservationId, { reason } = {}) {
  const why = requireReason(reason);
  const s = await getSettings(db);
  return db.tx(async (t) => {
    const token = qrToken('AL');
    const [r] = await t.q(
      `UPDATE reservations SET status='PICKUP_READY', approved_at=now(), pickup_expires_at=now()+($3||' hours')::interval, qr_token=$2
       WHERE id=$1 AND status='PENDING_PICKUP' RETURNING *`,
      [reservationId, token, s.pickup_hours],
    );
    if (!r) throw new AppError('invalid_state', 409);
    const [item] = await t.q("UPDATE items SET status='PICKUP_READY' WHERE id=$1 RETURNING *", [r.item_id]);
    await audit(t, adminId, 'reservation', r.id, 'approve_pickup', 'PENDING_PICKUP', 'PICKUP_READY', why);
    await notify(t, r.buyer_id, 'pickup_ready', { ...notifyParams(item), reservation_id: r.id });
  });
}

async function releaseReservation(t, r, status, type, why, actorId) {
  await t.q('UPDATE reservations SET status=$2, reason=$3 WHERE id=$1', [r.id, status, why]);
  const [item] = await t.q("UPDATE items SET status='READY' WHERE id=$1 RETURNING *", [r.item_id]);
  await moveWallet(t, r.buyer_id, r.amount, type, { itemId: r.item_id, reason: why });
  await audit(t, actorId, 'reservation', r.id, status.toLowerCase(), r.status, status, why);
  return item;
}

export async function rejectPickup(db, adminId, reservationId, { reason } = {}) {
  const why = requireReason(reason);
  return db.tx(async (t) => {
    const [r] = await t.q("SELECT * FROM reservations WHERE id=$1 AND status='PENDING_PICKUP' FOR UPDATE", [reservationId]);
    if (!r) throw new AppError('invalid_state', 409);
    const item = await releaseReservation(t, r, 'REJECTED', 'PICKUP_REFUND', why, adminId);
    await notify(t, r.buyer_id, 'pickup_rejected', { ...notifyParams(item), reason: why, points: r.amount });
  });
}

// ---------- QR çözümleme ve teslim ----------
export async function resolveToken(db, token) {
  const t = String(token || '').trim();
  if (t.startsWith('LW-')) {
    const [item] = await db.q('SELECT id, status, drop_token_used FROM items WHERE drop_token=$1', [t]);
    if (!item) throw new AppError('invalid_qr', 404);
    if (item.drop_token_used || item.status !== 'PENDING_DROP') throw new AppError('used_qr', 409);
    return { type: 'drop', item_id: item.id };
  }
  if (t.startsWith('AL-')) {
    const [r] = await db.q('SELECT id, item_id, qr_used, status, pickup_expires_at FROM reservations WHERE qr_token=$1', [t]);
    if (!r) throw new AppError('invalid_qr', 404);
    if (r.qr_used || r.status !== 'PICKUP_READY') throw new AppError('used_qr', 409);
    if (new Date(r.pickup_expires_at) < new Date()) throw new AppError('expired_qr', 409);
    return { type: 'pickup', reservation_id: r.id, item_id: r.item_id };
  }
  if (t.startsWith('GF-')) {
    const [o] = await db.q('SELECT id, status FROM gift_orders WHERE qr_token=$1', [t]);
    if (!o) throw new AppError('invalid_qr', 404);
    if (o.status !== 'PENDING') throw new AppError('used_qr', 409);
    return { type: 'gift', order_id: o.id };
  }
  if (t.startsWith('UQ-')) {
    const [u] = await db.q('SELECT id, display_name FROM users WHERE public_code=$1', [t]);
    if (!u) throw new AppError('invalid_qr', 404);
    return { type: 'user', user_id: u.id, display_name: u.display_name };
  }
  throw new AppError('invalid_qr', 404);
}

export async function completePickup(db, adminId, token, { reason } = {}) {
  const why = requireReason(reason);
  return db.tx(async (t) => {
    const [r] = await t.q(
      "UPDATE reservations SET status='COMPLETED', qr_used=TRUE, completed_at=now() WHERE qr_token=$1 AND status='PICKUP_READY' AND NOT qr_used AND pickup_expires_at > now() RETURNING *",
      [String(token || '')],
    );
    if (!r) throw new AppError('used_qr', 409);
    const [item] = await t.q("UPDATE items SET status='COMPLETED' WHERE id=$1 RETURNING *", [r.item_id]);
    await audit(t, adminId, 'reservation', r.id, 'complete_pickup', 'PICKUP_READY', 'COMPLETED', why);
    await notify(t, r.buyer_id, 'pickup_completed', { ...notifyParams(item), reservation_id: r.id });
    return { item_id: item.id, reservation_id: r.id };
  });
}

// ---------- İade (UC-08) ----------
export async function requestReturn(db, buyerId, reservationId, reason) {
  const why = requireReason(reason);
  const s = await getSettings(db);
  return db.tx(async (t) => {
    const [r] = await t.q(
      "SELECT * FROM reservations WHERE id=$1 AND buyer_id=$2 AND status='COMPLETED' AND completed_at + ($3||' hours')::interval > now() FOR UPDATE",
      [reservationId, buyerId, s.return_hours],
    );
    if (!r) throw new AppError('return_closed', 409);
    const [used] = await t.q('SELECT id FROM returns WHERE reservation_id=$1', [r.id]);
    if (used) throw new AppError('return_exists', 409);
    const id = newId();
    await t.q("INSERT INTO returns (id, reservation_id, status, reason) VALUES ($1,$2,'PENDING',$3)", [id, r.id, why]);
    await t.q("UPDATE items SET status='RETURN_PENDING' WHERE id=$1", [r.item_id]);
    await audit(t, buyerId, 'return', id, 'request', 'COMPLETED', 'RETURN_PENDING', why);
    return { id };
  });
}

export async function decideReturn(db, adminId, returnId, { approve, republish, reason } = {}) {
  const why = requireReason(reason);
  return db.tx(async (t) => {
    const [ret] = await t.q("UPDATE returns SET status=$2, decision_reason=$3, decided_at=now() WHERE id=$1 AND status='PENDING' RETURNING *", [returnId, approve ? 'APPROVED' : 'REJECTED', why]);
    if (!ret) throw new AppError('invalid_state', 409);
    const [r] = await t.q('SELECT * FROM reservations WHERE id=$1', [ret.reservation_id]);
    let newStatus = 'COMPLETED';
    if (approve) {
      await moveWallet(t, r.buyer_id, r.amount, 'RETURN_REFUND', { itemId: r.item_id, reason: why });
      await t.q("UPDATE reservations SET status='RETURNED' WHERE id=$1", [r.id]);
      newStatus = republish ? 'READY' : 'RETURNED';
    }
    const [item] = await t.q("UPDATE items SET status=$2, ready_at=CASE WHEN $2='READY' THEN now() ELSE ready_at END WHERE id=$1 RETURNING *", [r.item_id, newStatus]);
    await audit(t, adminId, 'return', returnId, approve ? 'approve' : 'reject', 'RETURN_PENDING', newStatus, why);
    await notify(t, r.buyer_id, approve ? 'return_approved' : 'return_rejected', { ...notifyParams(item), reason: why, points: r.amount });
  });
}

// ---------- Değerlendirme ----------
export async function createReview(db, userId, reservationId, score, comment) {
  const n = Number(score);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new AppError('invalid_score');
  return db.tx(async (t) => {
    const [r] = await t.q("SELECT r.id, i.owner_id FROM reservations r JOIN items i ON i.id=r.item_id WHERE r.id=$1 AND r.buyer_id=$2 AND r.status IN ('COMPLETED','RETURNED')", [reservationId, userId]);
    if (!r) throw new AppError('not_found', 404);
    const [dup] = await t.q('SELECT id FROM reviews WHERE reservation_id=$1', [reservationId]);
    if (dup) throw new AppError('already_reviewed', 409);
    await t.q('INSERT INTO reviews (id, reservation_id, reviewer_id, reviewed_owner_id, score, comment) VALUES ($1,$2,$3,$4,$5,$6)', [newId(), reservationId, userId, r.owner_id, n, String(comment || '').slice(0, 280) || null]);
  });
}

// ---------- Hediyelik ----------
export async function buyGift(db, userId, giftId) {
  return db.tx(async (t) => {
    const [g] = await t.q('UPDATE gifts SET stock=stock-1 WHERE id=$1 AND active AND stock>0 RETURNING *', [giftId]);
    if (!g) throw new AppError('gift_unavailable', 409);
    const [u] = await t.q('SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (u.wallet_balance < g.points) throw Object.assign(new AppError('insufficient_points', 409), { missing: g.points - u.wallet_balance });
    const id = newId();
    await t.q("INSERT INTO gift_orders (id, gift_id, user_id, amount, status, qr_token) VALUES ($1,$2,$3,$4,'PENDING',$5)", [id, giftId, userId, g.points, qrToken('GF')]);
    await moveWallet(t, userId, -g.points, 'GIFT_SPEND', { reason: g.name_tr });
    return { id };
  });
}

export async function redeemGift(db, adminId, token, { reason } = {}) {
  const why = requireReason(reason);
  return db.tx(async (t) => {
    const [o] = await t.q("UPDATE gift_orders SET status='REDEEMED', redeemed_at=now() WHERE qr_token=$1 AND status='PENDING' RETURNING *", [String(token || '')]);
    if (!o) throw new AppError('used_qr', 409);
    await audit(t, adminId, 'gift_order', o.id, 'redeem', 'PENDING', 'REDEEMED', why);
  });
}

// ---------- Destek ve hesap kapatma talebi ----------
export async function createSupportRequest(db, userId, { kind, message } = {}) {
  if (!['support', 'close_account'].includes(kind)) throw new AppError('invalid_input');
  const text = String(message || '').trim().slice(0, 1000);
  if (kind === 'support' && !text) throw new AppError('message_required');
  if (kind === 'close_account') {
    const [open] = await db.q("SELECT id FROM support_requests WHERE user_id=$1 AND kind='close_account' AND status='OPEN'", [userId]);
    if (open) return { id: open.id };
  }
  const id = newId();
  await db.q('INSERT INTO support_requests (id, user_id, kind, message) VALUES ($1,$2,$3,$4)', [id, userId, kind, text || null]);
  return { id };
}

export async function closeSupportRequest(db, adminId, id, { reason } = {}) {
  const why = requireReason(reason);
  return db.tx(async (t) => {
    const [r] = await t.q("UPDATE support_requests SET status='CLOSED', closed_at=now() WHERE id=$1 AND status='OPEN' RETURNING *", [id]);
    if (!r) throw new AppError('invalid_state', 409);
    await audit(t, adminId, 'support', id, 'close', 'OPEN', 'CLOSED', why);
    await notify(t, r.user_id, 'support_closed', { reason: why });
  });
}

// ---------- Elle puan düzeltme ----------
export async function adjustPoints(db, adminId, userId, amount, reason) {
  const why = requireReason(reason);
  const n = Number(amount);
  if (!Number.isInteger(n) || n === 0) throw new AppError('invalid_amount');
  return db.tx(async (t) => {
    const [before] = await t.q('SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!before) throw new AppError('not_found', 404);
    const after = await moveWallet(t, userId, n, 'ADMIN_ADJUST', { reason: why });
    await audit(t, adminId, 'user', userId, 'adjust_points', before.wallet_balance, after, why);
    return { balance: after };
  });
}

// ---------- Zamanlayıcı: 24 saat kuralı ve gelinmeyen teslimler ----------
export async function sweep(db) {
  const s = await getSettings(db);
  const expired = await db.q(`SELECT id FROM items WHERE status='PENDING_DROP' AND created_at + ($1||' hours')::interval < now()`, [s.drop_hours]);
  for (const { id } of expired) {
    await db.tx(async (t) => {
      const [item] = await t.q("UPDATE items SET status='EXPIRED', status_reason='drop_timeout' WHERE id=$1 AND status='PENDING_DROP' RETURNING *", [id]);
      if (!item) return;
      await reverseDropPoints(t, item, 'DROP_REVERSAL', 'drop_timeout');
      await closeSubscriptions(t, id);
      await audit(t, null, 'item', id, 'expire', 'PENDING_DROP', 'EXPIRED', 'drop_timeout');
      await notify(t, item.owner_id, 'drop_expired', { ...notifyParams(item), points: item.point_value });
    });
  }
  const late = await db.q("SELECT id FROM reservations WHERE status='PICKUP_READY' AND pickup_expires_at < now()");
  for (const { id } of late) {
    await db.tx(async (t) => {
      const [r] = await t.q("SELECT * FROM reservations WHERE id=$1 AND status='PICKUP_READY' FOR UPDATE", [id]);
      if (!r) return;
      const item = await releaseReservation(t, r, 'EXPIRED', 'PICKUP_REFUND', 'pickup_timeout', null);
      await notify(t, r.buyer_id, 'pickup_expired', { ...notifyParams(item), points: r.amount });
    });
  }
  return { expired: expired.length, late: late.length };
}
