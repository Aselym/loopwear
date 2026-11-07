// HTTP katmanı: yönlendirme, oturum, statik dosyalar. İş kuralları logic.js'te.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newId } from './db.js';
import * as L from './logic.js';

const { AppError, catalog } = L;
const scrypt = promisify(scryptCb);
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.apk': 'application/vnd.android.package-archive' };
const SESSION_DAYS = 60;

async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}
async function checkPassword(pw, stored) {
  const [salt, key] = stored.split(':');
  const got = await scrypt(pw, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(got, Buffer.from(key, 'hex'));
}
const hashToken = (t) => createHash('sha256').update(t).digest('hex');

export async function seed(db, { adminEmail = process.env.ADMIN_EMAIL, adminPassword = process.env.ADMIN_PASSWORD } = {}) {
  await db.q(`INSERT INTO stations (id, name_tr, name_en, campus_label, active, sort_order) VALUES
    ('stand','COP31 LoopStation','COP31 LoopStation','Antalya',TRUE,0),
    ('north','Kuzey LoopStation','North LoopStation','Boğaziçi',FALSE,1),
    ('south','Güney LoopStation','South LoopStation','Boğaziçi',FALSE,2)
    ON CONFLICT (id) DO NOTHING`);
  for (const [k, v] of Object.entries(L.DEFAULT_SETTINGS)) await db.q('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [k, v]);
  const [g] = await db.q('SELECT id FROM gifts LIMIT 1');
  if (!g) await db.q("INSERT INTO gifts (id, name_tr, name_en, points, stock) VALUES ($1,'LoopWear anahtarlık','LoopWear keychain',20,0)", [newId()]);
  if (adminEmail && adminPassword) {
    const email = adminEmail.toLowerCase();
    const [u] = await db.q('SELECT id FROM users WHERE email=$1', [email]);
    if (!u) {
      await db.q("INSERT INTO users (id, email, password_hash, display_name, role, default_station_id, public_code) VALUES ($1,$2,$3,'LoopWear','admin','stand',$4)",
        [newId(), email, await hashPassword(adminPassword), `UQ-${randomBytes(12).toString('base64url')}`]);
    }
  }
}

// ---------- Görünümler ----------
async function itemsView(db, rows, userId) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const imgs = await db.q('SELECT id, item_id FROM item_images WHERE item_id = ANY($1) ORDER BY sort_order', [ids]);
  const snaps = await db.q('SELECT * FROM impact_snapshots WHERE item_id = ANY($1)', [ids]);
  const subs = userId ? await db.q('SELECT item_id FROM subscriptions WHERE user_id=$1 AND active AND item_id = ANY($2)', [userId, ids]) : [];
  const favs = userId ? await db.q('SELECT item_id FROM favorites WHERE user_id=$1 AND item_id = ANY($2)', [userId, ids]) : [];
  const owners = [...new Set(rows.map((r) => r.owner_id))];
  const avgs = await db.q('SELECT reviewed_owner_id AS o, avg(score)::float AS a, count(*)::int AS n FROM reviews WHERE reviewed_owner_id = ANY($1) AND NOT hidden GROUP BY 1', [owners]);
  const avgBy = Object.fromEntries(avgs.map((a) => [a.o, a]));
  const snapBy = Object.fromEntries(snaps.map((s) => [s.item_id, s]));
  const subSet = new Set(subs.map((s) => s.item_id));
  const favSet = new Set(favs.map((s) => s.item_id));
  return rows.map((r) => {
    const s = snapBy[r.id];
    const av = avgBy[r.owner_id];
    return {
      id: r.id, category: r.category, material: r.material, size: r.size, condition: r.condition, color: r.color,
      station_id: r.station_id, point_value: r.point_value, status: r.status, status_reason: r.status_reason,
      created_at: r.created_at, ready_at: r.ready_at, mine: r.owner_id === userId,
      photos: imgs.filter((i) => i.item_id === r.id).map((i) => `/api/photos/${i.id}`),
      impact: s ? { co2: s.co2e_reference, water: s.water_reference, version: s.methodology_version } : null,
      subscribed: subSet.has(r.id), favorite: favSet.has(r.id),
      rating: av && av.n >= 3 ? { avg: Math.round(av.a * 10) / 10, count: av.n } : null,
    };
  });
}

// Onay bekleyen ürün Keşfet'te görünmez; sahibi Dolabım'dan izler
const VISIBLE = "('READY','PENDING_PICKUP','PICKUP_READY')";

export function normalizeText(s) {
  return String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c])).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function matchesSearch(item, q) {
  const cat = catalog.categories.find((c) => c.id === item.category);
  const mat = catalog.materials.find((m) => m.id === item.material);
  const hay = normalizeText([cat?.tr, cat?.en, mat?.tr, mat?.en, item.size].join(' '));
  return normalizeText(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

async function userView(db, u) {
  const [{ n }] = await db.q('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND NOT read', [u.id]);
  return { id: u.id, email: u.email, display_name: u.display_name, role: u.role, default_station_id: u.default_station_id, wallet_balance: u.wallet_balance, public_code: u.public_code, lang: u.lang, unread: n };
}

// ---------- Yönlendirme ----------
export function createApp(db, { secureCookie = process.env.NODE_ENV === 'production', now = () => Date.now() } = {}) {
  const routes = [];
  const route = (method, path, opts, fn) => {
    const keys = [];
    const re = new RegExp(`^${path.replace(/:([a-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, fn, ...opts });
  };
  const pub = {}; const member = { auth: true }; const admin = { auth: true, admin: true };
  const attempts = new Map();

  const limited = (key, max) => {
    const t = now(); const a = attempts.get(key);
    if (!a || t - a.t > 60000) { attempts.set(key, { t, n: 1 }); return false; }
    a.n += 1;
    return a.n > max;
  };

  async function startSession(res, userId) {
    const token = randomBytes(32).toString('base64url');
    await db.q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2, now() + ($3||' days')::interval)", [hashToken(token), userId, SESSION_DAYS]);
    res.setHeader('Set-Cookie', `lw_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secureCookie ? '; Secure' : ''}`);
  }

  // ----- Üyelik (UC-01) -----
  route('POST', '/api/auth/register', pub, async ({ body, res, ip }) => {
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.display_name || '').trim().slice(0, 40);
    const password = String(body.password || '');
    if (limited(`reg:${ip}`, 120)) throw new AppError('too_many', 429);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('invalid_email');
    if (password.length < 8) throw new AppError('weak_password');
    if (!name) throw new AppError('name_required');
    const s = await L.getSettings(db);
    const hash = await hashPassword(password);
    const id = newId();
    const lang = body.lang === 'en' ? 'en' : 'tr';
    const [st] = await db.q('SELECT id FROM stations WHERE active ORDER BY sort_order LIMIT 1');
    try {
      await db.tx(async (t) => {
        await t.q('INSERT INTO users (id, email, password_hash, display_name, default_station_id, public_code, lang) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [id, email, hash, name, st?.id || null, `UQ-${randomBytes(12).toString('base64url')}`, lang]);
        const pts = Number(s.starter_points) || 0;
        if (pts > 0) await L.moveWallet(t, id, pts, 'STARTER', { reason: 'starter_points' });
        await L.audit(t, id, 'user', id, 'register', null, null, null);
      });
    } catch (e) {
      if (/unique|duplicate/i.test(e.message)) throw new AppError('email_taken', 409);
      throw e;
    }
    await startSession(res, id);
    const [u] = await db.q('SELECT * FROM users WHERE id=$1', [id]);
    return { user: await userView(db, u) };
  });

  route('POST', '/api/auth/login', pub, async ({ body, res }) => {
    const email = String(body.email || '').trim().toLowerCase();
    if (limited(`login:${email}`, 10)) throw new AppError('too_many', 429);
    const [u] = await db.q('SELECT * FROM users WHERE email=$1', [email]);
    if (!u || !(await checkPassword(String(body.password || ''), u.password_hash))) throw new AppError('bad_login', 401);
    await startSession(res, u.id);
    return { user: await userView(db, u) };
  });

  route('POST', '/api/auth/logout', member, async ({ token, res }) => {
    await db.q('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]);
    res.setHeader('Set-Cookie', 'lw_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return {};
  });

  route('GET', '/api/me', pub, async ({ user }) => ({ user: user ? await userView(db, user) : null }));

  route('PATCH', '/api/me', member, async ({ user, body }) => {
    if (body.display_name !== undefined) {
      const n = String(body.display_name).trim().slice(0, 40);
      if (!n) throw new AppError('name_required');
      await db.q('UPDATE users SET display_name=$2 WHERE id=$1', [user.id, n]);
    }
    if (body.lang === 'tr' || body.lang === 'en') await db.q('UPDATE users SET lang=$2 WHERE id=$1', [user.id, body.lang]);
    if (body.default_station_id) {
      const [st] = await db.q('SELECT id FROM stations WHERE id=$1 AND active', [body.default_station_id]);
      if (!st) throw new AppError('invalid_station');
      await db.q('UPDATE users SET default_station_id=$2 WHERE id=$1', [user.id, st.id]);
    }
    const [u] = await db.q('SELECT * FROM users WHERE id=$1', [user.id]);
    return { user: await userView(db, u) };
  });

  route('GET', '/api/catalog', pub, async () => {
    const stations = await db.q('SELECT id, name_tr, name_en, campus_label, active FROM stations ORDER BY sort_order');
    return { ...catalog, stations };
  });

  // ----- Keşfet (UC-05) -----
  route('GET', '/api/items', pub, async ({ query, user }) => {
    const where = [`status IN ${VISIBLE}`]; const p = [];
    for (const k of ['category', 'size', 'material']) {
      if (query.get(k)) { p.push(query.get(k)); where.push(`${k}=$${p.length}`); }
    }
    if (query.get('station')) { p.push(query.get('station')); where.push(`station_id=$${p.length}`); }
    if (query.get('ready') === '1') where.push("status='READY'");
    const order = query.get('sort') === 'points' ? "point_value ASC, created_at DESC" : "CASE WHEN status='READY' THEN 0 ELSE 1 END, created_at DESC";
    let rows = await db.q(`SELECT * FROM items WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 300`, p);
    const q = query.get('q');
    if (q) rows = rows.filter((r) => matchesSearch(r, q));
    return { items: await itemsView(db, rows, user?.id) };
  });

  route('GET', '/api/items/:id', pub, async ({ params, user }) => {
    const [row] = await db.q('SELECT * FROM items WHERE id=$1', [params.id]);
    if (!row) throw new AppError('not_found', 404);
    const canSee = user && (row.owner_id === user.id || user.role === 'admin');
    const buyer = user ? await db.q('SELECT id FROM reservations WHERE item_id=$1 AND buyer_id=$2 LIMIT 1', [row.id, user.id]) : [];
    if (!VISIBLE.includes(`'${row.status}'`) && !canSee && !buyer.length) throw new AppError('not_found', 404);
    const [view] = await itemsView(db, [row], user?.id);
    if (row.owner_id === user?.id && row.status === 'PENDING_DROP') view.drop_token = row.drop_token;
    return { item: view };
  });

  route('POST', '/api/items', member, async ({ user, body }) => {
    const r = await L.createItem(db, user.id, body);
    const [row] = await db.q('SELECT * FROM items WHERE id=$1', [r.id]);
    const [item] = await itemsView(db, [row], user.id);
    item.drop_token = row.drop_token;
    return { item, duplicate: r.duplicate };
  });

  route('POST', '/api/items/:id/cancel', member, async ({ user, params }) => { await L.cancelItem(db, user.id, params.id); return {}; });

  route('POST', '/api/items/:id/notify', member, async ({ user, params }) => {
    const [row] = await db.q('SELECT status, owner_id FROM items WHERE id=$1', [params.id]);
    if (!row || row.status !== 'PENDING_DROP') throw new AppError('invalid_state', 409);
    const [cur] = await db.q('SELECT active FROM subscriptions WHERE user_id=$1 AND item_id=$2', [user.id, params.id]);
    const active = !cur?.active;
    await db.q('INSERT INTO subscriptions (user_id, item_id, active) VALUES ($1,$2,$3) ON CONFLICT (user_id, item_id) DO UPDATE SET active=$3', [user.id, params.id, active]);
    return { subscribed: active };
  });

  route('POST', '/api/items/:id/favorite', member, async ({ user, params }) => {
    const del = await db.q('DELETE FROM favorites WHERE user_id=$1 AND item_id=$2 RETURNING item_id', [user.id, params.id]);
    if (del.length) return { favorite: false };
    await db.q('INSERT INTO favorites (user_id, item_id) VALUES ($1,$2)', [user.id, params.id]);
    return { favorite: true };
  });

  route('POST', '/api/items/:id/reserve', member, async ({ user, params }) => L.reserveItem(db, user.id, params.id));

  // ----- Dolabım, cüzdan, etki -----
  route('GET', '/api/me/wardrobe', member, async ({ user }) => {
    const dropped = await db.q('SELECT * FROM items WHERE owner_id=$1 ORDER BY created_at DESC', [user.id]);
    const droppedView = await itemsView(db, dropped, user.id);
    droppedView.forEach((v, i) => { if (dropped[i].status === 'PENDING_DROP') v.drop_token = dropped[i].drop_token; });
    const res = await db.q(`SELECT r.*, (SELECT status FROM returns WHERE reservation_id=r.id ORDER BY requested_at DESC LIMIT 1) AS return_status,
        EXISTS(SELECT 1 FROM reviews WHERE reservation_id=r.id) AS reviewed FROM reservations r WHERE buyer_id=$1 ORDER BY requested_at DESC`, [user.id]);
    const resItems = res.length ? await db.q('SELECT * FROM items WHERE id = ANY($1)', [res.map((r) => r.item_id)]) : [];
    const views = await itemsView(db, resItems, user.id);
    const byId = Object.fromEntries(views.map((v) => [v.id, v]));
    const s = await L.getSettings(db);
    const mapped = res.map((r) => ({
      id: r.id, status: r.status, amount: r.amount, requested_at: r.requested_at, approved_at: r.approved_at, pickup_expires_at: r.pickup_expires_at,
      completed_at: r.completed_at, reason: r.reason, return_status: r.return_status, reviewed: r.reviewed, item: byId[r.item_id],
      qr_token: r.status === 'PICKUP_READY' && !r.qr_used ? r.qr_token : null,
      return_until: r.completed_at ? new Date(new Date(r.completed_at).getTime() + Number(s.return_hours) * 3600e3).toISOString() : null,
    }));
    const favs = await db.q('SELECT i.* FROM favorites f JOIN items i ON i.id=f.item_id WHERE f.user_id=$1 ORDER BY f.created_at DESC', [user.id]);
    const gifts = await db.q('SELECT o.id, o.status, o.amount, o.qr_token, o.created_at, g.name_tr, g.name_en FROM gift_orders o JOIN gifts g ON g.id=o.gift_id WHERE o.user_id=$1 ORDER BY o.created_at DESC', [user.id]);
    return {
      dropped: droppedView,
      reserved: mapped.filter((r) => ['PENDING_PICKUP', 'PICKUP_READY'].includes(r.status)),
      acquired: mapped.filter((r) => ['COMPLETED', 'RETURNED'].includes(r.status)),
      closed: mapped.filter((r) => ['REJECTED', 'EXPIRED'].includes(r.status)),
      favorites: await itemsView(db, favs, user.id),
      gifts,
    };
  });

  route('GET', '/api/me/transactions', member, async ({ user }) => ({ transactions: await db.q('SELECT id, type, amount, balance_after, reason, item_id, created_at FROM transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200', [user.id]) }));

  route('GET', '/api/me/impact', member, async ({ user }) => {
    const rows = await db.q("SELECT i.* FROM items i WHERE i.owner_id=$1 AND i.status NOT IN ('REJECTED','EXPIRED','CANCELLED') ORDER BY i.created_at DESC", [user.id]);
    const items = await itemsView(db, rows, user.id);
    const co2 = items.filter((i) => i.impact?.co2 != null);
    const water = items.filter((i) => i.impact?.water != null);
    const [{ n: completed }] = await db.q("SELECT count(*)::int AS n FROM items WHERE owner_id=$1 AND status='COMPLETED'", [user.id]);
    const [{ n: acquired }] = await db.q("SELECT count(*)::int AS n FROM reservations WHERE buyer_id=$1 AND status='COMPLETED'", [user.id]);
    return {
      items, total: items.length, completed, acquired,
      co2: { sum: co2.reduce((s, i) => s + i.impact.co2, 0), count: co2.length },
      water: { sum: water.reduce((s, i) => s + i.impact.water, 0), count: water.length },
    };
  });

  route('GET', '/api/me/notifications', member, async ({ user }) => ({ notifications: await db.q('SELECT id, kind, params, read, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [user.id]) }));
  route('POST', '/api/me/notifications/read', member, async ({ user }) => { await db.q('UPDATE notifications SET read=TRUE WHERE user_id=$1 AND NOT read', [user.id]); return {}; });

  route('POST', '/api/returns', member, async ({ user, body }) => L.requestReturn(db, user.id, body.reservation_id, body.reason));
  route('POST', '/api/reviews', member, async ({ user, body }) => { await L.createReview(db, user.id, body.reservation_id, body.score, body.comment); return {}; });

  route('GET', '/api/me/support', member, async ({ user }) => ({ requests: await db.q('SELECT id, kind, message, status, created_at FROM support_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [user.id]) }));
  route('POST', '/api/support', member, async ({ user, body }) => {
    if (limited(`support:${user.id}`, 5)) throw new AppError('too_many', 429);
    return L.createSupportRequest(db, user.id, body);
  });

  route('GET', '/api/gifts', pub, async () => ({ gifts: await db.q('SELECT id, name_tr, name_en, points, stock FROM gifts WHERE active ORDER BY points') }));
  route('POST', '/api/gifts/:id/buy', member, async ({ user, params }) => L.buyGift(db, user.id, params.id));

  // ----- Yönetici -----
  const queue = async (status, userId, order = 'created_at ASC') => {
    const rows = await db.q(`SELECT * FROM items WHERE status=$1 ORDER BY ${order}`, [status]);
    return itemsView(db, rows, userId);
  };

  route('GET', '/api/admin/summary', admin, async ({ query }) => {
    const st = query.get('station'); const from = query.get('from'); const to = query.get('to');
    const cond = []; const p = [];
    if (st) { p.push(st); cond.push(`station_id=$${p.length}`); }
    if (from) { p.push(from); cond.push(`created_at >= $${p.length}::date`); }
    if (to) { p.push(to); cond.push(`created_at < $${p.length}::date + 1`); }
    const w = cond.length ? `AND ${cond.join(' AND ')}` : '';
    const counts = await db.q(`SELECT status, count(*)::int AS n FROM items WHERE TRUE ${w} GROUP BY 1`, p);
    const by = Object.fromEntries(counts.map((c) => [c.status, c.n]));
    const [imp] = await db.q(`SELECT coalesce(sum(s.co2e_reference),0)::float AS co2, coalesce(sum(s.water_reference),0)::float AS water, count(s.co2e_reference)::int AS n
      FROM impact_snapshots s JOIN items i ON i.id=s.item_id WHERE i.status NOT IN ('REJECTED','EXPIRED','CANCELLED') ${w.replace(/station_id/g, 'i.station_id').replace(/created_at/g, 'i.created_at')}`, p);
    const [{ moved }] = await db.q('SELECT coalesce(sum(abs(amount)),0)::int AS moved FROM transactions');
    const [{ users }] = await db.q("SELECT count(*)::int AS users FROM users WHERE role='member'");
    const [{ pending_returns: pr }] = await db.q("SELECT count(*)::int AS pending_returns FROM returns WHERE status='PENDING'");
    const [{ n: pendingSupport }] = await db.q("SELECT count(*)::int AS n FROM support_requests WHERE status='OPEN'");
    return { pending_support: pendingSupport, pending_drops: by.PENDING_DROP || 0, pending_pickups: by.PENDING_PICKUP || 0, pending_returns: pr, ready: by.READY || 0, completed: by.COMPLETED || 0, points_moved: moved, users, impact: imp };
  });

  route('GET', '/api/admin/drops', admin, async ({ user }) => {
    const s = await L.getSettings(db);
    const items = await queue('PENDING_DROP', user.id);
    const rows = await db.q("SELECT i.id, u.display_name, u.email FROM items i JOIN users u ON u.id=i.owner_id WHERE i.status='PENDING_DROP'");
    return { items: items.map((it) => ({ ...it, owner: rows.find((r) => r.id === it.id), expires_at: new Date(new Date(it.created_at).getTime() + Number(s.drop_hours) * 3600e3).toISOString() })) };
  });

  route('GET', '/api/admin/pickups', admin, async ({ user }) => {
    const res = await db.q("SELECT r.*, u.display_name, u.email FROM reservations r JOIN users u ON u.id=r.buyer_id WHERE r.status IN ('PENDING_PICKUP','PICKUP_READY') ORDER BY r.requested_at");
    const items = res.length ? await db.q('SELECT * FROM items WHERE id = ANY($1)', [res.map((r) => r.item_id)]) : [];
    const views = Object.fromEntries((await itemsView(db, items, user.id)).map((v) => [v.id, v]));
    return { reservations: res.map((r) => ({ id: r.id, status: r.status, amount: r.amount, requested_at: r.requested_at, pickup_expires_at: r.pickup_expires_at, qr_token: r.qr_token, buyer: { display_name: r.display_name, email: r.email }, item: views[r.item_id] })) };
  });

  route('GET', '/api/admin/returns', admin, async ({ user }) => {
    const s = await L.getSettings(db);
    const rets = await db.q(`SELECT x.*, r.item_id, r.completed_at, r.amount, u.display_name, u.email FROM returns x JOIN reservations r ON r.id=x.reservation_id JOIN users u ON u.id=r.buyer_id WHERE x.status='PENDING' ORDER BY x.requested_at`);
    const items = rets.length ? await db.q('SELECT * FROM items WHERE id = ANY($1)', [rets.map((r) => r.item_id)]) : [];
    const views = Object.fromEntries((await itemsView(db, items, user.id)).map((v) => [v.id, v]));
    return { returns: rets.map((r) => ({ id: r.id, reason: r.reason, requested_at: r.requested_at, amount: r.amount, until: new Date(new Date(r.completed_at).getTime() + Number(s.return_hours) * 3600e3).toISOString(), buyer: { display_name: r.display_name, email: r.email }, item: views[r.item_id] })) };
  });

  route('POST', '/api/admin/items/:id/approve-drop', admin, async ({ user, params, body }) => { await L.approveDrop(db, user.id, params.id, body); return {}; });
  route('POST', '/api/admin/items/:id/reject-drop', admin, async ({ user, params, body }) => { await L.rejectDrop(db, user.id, params.id, body); return {}; });
  route('POST', '/api/admin/items/:id/remove', admin, async ({ user, params, body }) => { await L.removeItem(db, user.id, params.id, body); return {}; });
  route('POST', '/api/admin/reservations/:id/approve', admin, async ({ user, params, body }) => { await L.approvePickup(db, user.id, params.id, body); return {}; });
  route('POST', '/api/admin/reservations/:id/reject', admin, async ({ user, params, body }) => { await L.rejectPickup(db, user.id, params.id, body); return {}; });
  route('POST', '/api/admin/returns/:id/approve', admin, async ({ user, params, body }) => { await L.decideReturn(db, user.id, params.id, { ...body, approve: true }); return {}; });
  route('POST', '/api/admin/returns/:id/reject', admin, async ({ user, params, body }) => { await L.decideReturn(db, user.id, params.id, { ...body, approve: false }); return {}; });

  route('POST', '/api/admin/scan', admin, async ({ body, user }) => {
    const r = await L.resolveToken(db, body.token);
    if (r.item_id) {
      const [row] = await db.q('SELECT * FROM items WHERE id=$1', [r.item_id]);
      [r.item] = await itemsView(db, [row], user.id);
    }
    if (r.type === 'gift') {
      const [o] = await db.q('SELECT g.name_tr, g.name_en, o.amount, u.display_name FROM gift_orders o JOIN gifts g ON g.id=o.gift_id JOIN users u ON u.id=o.user_id WHERE o.id=$1', [r.order_id]);
      r.gift = o;
    }
    return r;
  });
  route('POST', '/api/admin/scan/complete', admin, async ({ user, body }) => L.completePickup(db, user.id, body.token, body));
  route('POST', '/api/admin/scan/gift', admin, async ({ user, body }) => { await L.redeemGift(db, user.id, body.token, body); return {}; });

  route('POST', '/api/admin/intake', admin, async ({ user, body }) => {
    const target = await L.resolveToken(db, body.user_code);
    if (target.type !== 'user') throw new AppError('invalid_qr');
    return L.createItem(db, target.user_id, body, { assisted: true, actorId: user.id, reason: body.reason });
  });

  route('GET', '/api/admin/users', admin, async ({ query }) => {
    const q = normalizeText(query.get('q'));
    const rows = await db.q(`SELECT u.id, u.email, u.display_name, u.role, u.wallet_balance, u.created_at,
        (SELECT count(*)::int FROM items WHERE owner_id=u.id) AS dropped,
        (SELECT count(*)::int FROM reservations WHERE buyer_id=u.id AND status='COMPLETED') AS acquired,
        (SELECT round(avg(score)::numeric,1)::float FROM reviews WHERE reviewed_owner_id=u.id AND NOT hidden) AS rating
      FROM users u ORDER BY u.created_at DESC LIMIT 500`);
    return { users: q ? rows.filter((u) => normalizeText(`${u.email} ${u.display_name}`).includes(q)) : rows };
  });
  route('GET', '/api/admin/users/:id', admin, async ({ params }) => {
    const [u] = await db.q('SELECT id, email, display_name, wallet_balance FROM users WHERE id=$1', [params.id]);
    if (!u) throw new AppError('not_found', 404);
    const transactions = await db.q('SELECT type, amount, balance_after, reason, created_at FROM transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [params.id]);
    return { user: u, transactions };
  });
  route('GET', '/api/admin/support', admin, async () => ({ requests: await db.q("SELECT s.id, s.kind, s.message, s.created_at, u.display_name, u.email FROM support_requests s JOIN users u ON u.id=s.user_id WHERE s.status='OPEN' ORDER BY s.created_at") }));
  route('POST', '/api/admin/support/:id/close', admin, async ({ user, params, body }) => { await L.closeSupportRequest(db, user.id, params.id, body); return {}; });
  route('POST', '/api/admin/users/:id/points', admin, async ({ user, params, body }) => L.adjustPoints(db, user.id, params.id, body.amount, body.reason));

  const impactRows = async (query) => {
    const cond = ["i.status NOT IN ('REJECTED','EXPIRED','CANCELLED')"]; const p = [];
    for (const k of ['category', 'material']) if (query.get(k)) { p.push(query.get(k)); cond.push(`i.${k}=$${p.length}`); }
    return db.q(`SELECT i.category, i.material, count(*)::int AS items, count(s.co2e_reference)::int AS with_data,
        coalesce(sum(s.co2e_reference),0)::float AS co2, coalesce(sum(s.water_reference),0)::float AS water
      FROM items i LEFT JOIN impact_snapshots s ON s.item_id=i.id WHERE ${cond.join(' AND ')} GROUP BY 1,2 ORDER BY co2 DESC`, p);
  };
  route('GET', '/api/admin/impact', admin, async ({ query }) => ({ rows: await impactRows(query) }));
  route('GET', '/api/admin/impact.csv', admin, async ({ query, res }) => {
    const rows = await impactRows(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="loopwear-etki.csv"');
    const lines = ['category,material,items,items_with_data,co2e_reference_kg,water_reference_l', ...rows.map((r) => [r.category, r.material, r.items, r.with_data, r.co2.toFixed(1), r.water.toFixed(0)].join(','))];
    return { raw: `﻿${lines.join('\n')}` };
  });

  route('GET', '/api/admin/audit', admin, async () => ({ entries: await db.q('SELECT a.*, u.display_name AS actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 300') }));

  route('GET', '/api/admin/reviews', admin, async () => ({ reviews: await db.q('SELECT id, score, comment, hidden, created_at FROM reviews ORDER BY created_at DESC LIMIT 200') }));
  route('POST', '/api/admin/reviews/:id/hide', admin, async ({ user, params, body }) => {
    const why = String(body.reason || '').trim();
    if (!why) throw new AppError('reason_required');
    await db.tx(async (t) => {
      await t.q('UPDATE reviews SET hidden=NOT hidden WHERE id=$1', [params.id]);
      await L.audit(t, user.id, 'review', params.id, 'toggle_hide', null, null, why);
    });
    return {};
  });

  route('POST', '/api/admin/stations/:id', admin, async ({ user, params, body }) => {
    await db.tx(async (t) => {
      const [s] = await t.q('UPDATE stations SET active=$2 WHERE id=$1 RETURNING id', [params.id, !!body.active]);
      if (!s) throw new AppError('not_found', 404);
      await L.audit(t, user.id, 'station', params.id, 'set_active', null, !!body.active, body.reason || 'station_update');
    });
    return {};
  });
  route('GET', '/api/admin/settings', admin, async () => ({ settings: await L.getSettings(db) }));
  route('POST', '/api/admin/settings', admin, async ({ user, body }) => {
    for (const k of Object.keys(L.DEFAULT_SETTINGS)) {
      if (body[k] === undefined) continue;
      const v = Number(body[k]);
      if (!Number.isInteger(v) || v < 0) throw new AppError('invalid_amount');
      await db.tx(async (t) => {
        await t.q('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [k, String(v)]);
        await L.audit(t, user.id, 'setting', k, 'update', null, v, 'settings_update');
      });
    }
    return {};
  });
  route('GET', '/api/admin/gifts', admin, async () => ({ gifts: await db.q('SELECT * FROM gifts ORDER BY created_at') }));
  route('POST', '/api/admin/gifts', admin, async ({ user, body }) => {
    const pts = Number(body.points); const stock = Number(body.stock);
    if (!String(body.name_tr || '').trim() || !Number.isInteger(pts) || pts <= 0 || !Number.isInteger(stock) || stock < 0) throw new AppError('invalid_item');
    const id = body.id || newId();
    await db.tx(async (t) => {
      await t.q(`INSERT INTO gifts (id, name_tr, name_en, points, stock, active) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO UPDATE SET name_tr=$2, name_en=$3, points=$4, stock=$5, active=$6`, [id, body.name_tr.trim(), String(body.name_en || body.name_tr).trim(), pts, stock, body.active !== false]);
      await L.audit(t, user.id, 'gift', id, 'upsert', null, `${pts}/${stock}`, 'gift_update');
    });
    return { id };
  });

  // Stant ekranı için herkese açık toplamlar
  route('GET', '/api/public/stats', pub, async () => {
    const [i] = await db.q(`SELECT count(*) FILTER (WHERE status NOT IN ('REJECTED','EXPIRED','CANCELLED'))::int AS items, count(*) FILTER (WHERE status='COMPLETED')::int AS completed FROM items`);
    const [imp] = await db.q(`SELECT coalesce(sum(s.co2e_reference),0)::float AS co2, coalesce(sum(s.water_reference),0)::float AS water FROM impact_snapshots s JOIN items i ON i.id=s.item_id WHERE i.status NOT IN ('REJECTED','EXPIRED','CANCELLED')`);
    const [{ users }] = await db.q("SELECT count(*)::int AS users FROM users WHERE role='member'");
    return { ...i, ...imp, users };
  });

  // ----- İstek işleyici -----
  async function readBody(req) {
    const chunks = []; let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 16 * 1024 * 1024) throw new AppError('too_large', 413);
      chunks.push(c);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('bad_json'); }
  }

  const json = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

  async function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname === '/indir' || pathname === '/get' ? 'indir.html' : pathname === '/ekran' ? 'ekran.html' : pathname === '/gizlilik' || pathname === '/privacy' ? 'gizlilik.html' : decodeURIComponent(pathname.slice(1));
    const file = normalize(join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC.replace(/[\\/]$/, '') + sep)) return json(res, 403, { error: 'forbidden' });
    try {
      const s = await stat(file);
      if (!s.isFile()) throw new Error('nofile');
      const ext = extname(file);
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': /\/(fonts|vendor)\//.test(pathname) ? 'public, max-age=2592000' : 'no-cache' };
      if (ext === '.apk') headers['Content-Disposition'] = 'attachment; filename="LoopWear.apk"';
      res.writeHead(200, headers);
      res.end(await readFile(file));
    } catch {
      if (extname(pathname)) return json(res, 404, { error: 'not_found' });
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      res.end(await readFile(join(PUBLIC, 'index.html')));
    }
    return undefined;
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://x');
    try {
      const photo = /^\/api\/photos\/([^/]+)$/.exec(url.pathname);
      if (photo && req.method === 'GET') {
        const [img] = await db.q('SELECT data, mime FROM item_images WHERE id=$1', [photo[1]]);
        if (!img) return json(res, 404, { error: 'not_found' });
        res.writeHead(200, { 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
        return res.end(Buffer.from(img.data));
      }
      if (!url.pathname.startsWith('/api/')) return await serveStatic(req, res, url.pathname);
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) return json(res, 404, { error: 'not_found' });
      const m = r.re.exec(url.pathname);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const token = /(?:^|;\s*)lw_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      let user = null;
      if (token) {
        const [u] = await db.q('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now()', [hashToken(token)]);
        user = u || null;
      }
      if (r.auth && !user) throw new AppError('auth_required', 401);
      if (r.admin && user.role !== 'admin') throw new AppError('forbidden', 403);
      // Basit CSRF koruması: yazma isteklerinde çerezle birlikte JSON başlığı şart
      if (req.method !== 'GET' && token && !/application\/json/.test(req.headers['content-type'] || '')) throw new AppError('bad_request', 400);
      const body = req.method === 'GET' ? {} : await readBody(req);
      const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
      const out = await r.fn({ req, res, params, query: url.searchParams, body, user, token, ip });
      if (out && out.raw !== undefined) { res.writeHead(200); return res.end(out.raw); }
      return json(res, 200, out || {});
    } catch (e) {
      if (e instanceof AppError) return json(res, e.status, { error: e.code, missing: e.missing });
      if (e.code === '23505' && /res_one_active/.test(e.message)) return json(res, 409, { error: 'not_available' });
      console.error(e);
      return json(res, 500, { error: 'server_error' });
    }
  };
}
