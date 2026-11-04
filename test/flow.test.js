// Şartname kabul testleri (K1-K10) ve etki/puanlama testleri, gerçek HTTP katmanı üzerinden.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDb } from '../server/db.js';
import { createApp, seed } from '../server/app.js';
import { sweep, computePoints, computeImpact } from '../server/logic.js';

const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
let db; let server; let base; let n = 0;

class Client {
  cookie = '';
  async call(method, path, body) {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
  get(p) { return this.call('GET', p); }
  post(p, b = {}) { return this.call('POST', p, b); }
}

async function member() {
  const c = new Client();
  n += 1;
  const r = await c.post('/api/auth/register', { email: `u${n}@example.com`, password: 'parola1234', display_name: `U${n}` });
  assert.equal(r.status, 200);
  c.id = r.data.user.id;
  c.code = r.data.user.public_code;
  return c;
}
const balance = async (c) => (await c.get('/api/me')).data.user.wallet_balance;
const itemBody = (o = {}) => ({ category: 'denim_jacket', material: 'cotton', size: 'M', condition: 'very_good', color: 'blue', station_id: 'stand', consents: [true, true, true, true], photos: [PX, PX, PX], ...o });
let admin;

before(async () => {
  db = await openDb({ url: process.env.TEST_DATABASE_URL || '' });
  await seed(db, { adminEmail: 'admin@example.com', adminPassword: 'adminparola1' });
  server = createServer(createApp(db, { secureCookie: false })).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  admin = new Client();
  assert.equal((await admin.post('/api/auth/login', { email: 'admin@example.com', password: 'adminparola1' })).status, 200);
});
after(async () => { server.close(); server.closeAllConnections(); await db.close(); });

const ready = async (owner, o) => {
  const { data } = await owner.post('/api/items', itemBody(o));
  assert.equal((await admin.post(`/api/admin/items/${data.item.id}/approve-drop`, { reason: 'Uygun' })).status, 200);
  return data.item;
};

test('puan formülü belgelerdeki örnekleri üretir', () => {
  assert.equal(computePoints('denim_jacket', 'very_good'), 80);
  assert.equal(computePoints('shirt', 'good'), 60);
  assert.equal(computePoints('tshirt', 'acceptable'), 35);
});

test('etki: pamuklu tişört 13,6 kg ve 2400 L; kapalı ve bilinmeyen eşleşmede değer yok', () => {
  const t = computeImpact('tshirt', 'cotton');
  assert.equal(t.co2e_reference.toFixed(1), '13.6');
  assert.equal(Math.round(t.water_reference), 2400);
  assert.equal(computeImpact('tshirt', 'unknown').co2e_reference, null);
  assert.equal(computeImpact('tshirt', 'blend').water_reference, null);
  assert.equal(computeImpact('tshirt', 'elastane').co2e_reference, null);
  assert.equal(computeImpact('denim_jacket', 'leather').co2e_reference, null);
  assert.equal(computeImpact('leather_jacket', 'cotton').co2e_reference, null);
  assert.ok(computeImpact('leather_jacket', 'leather').co2e_reference > 0);
});

test('K1: 4 onay ve en az 3 görsel olmadan kayıt olmaz', async () => {
  const u = await member();
  assert.equal((await u.post('/api/items', itemBody({ consents: [true, true, true, false] }))).data.error, 'consents_required');
  assert.equal((await u.post('/api/items', itemBody({ photos: [PX, PX] }))).data.error, 'photos_required');
  assert.equal((await u.post('/api/items', itemBody({ photos: [PX, PX, PX, PX, PX] }))).data.error, 'photos_required');
  assert.equal((await u.post('/api/items', itemBody({ photos: [PX, PX, PX, PX] }))).status, 200);
});

test('K2: kayıt sonrası bekleyen ürün Keşfette görünür, rezerve edilemez, zil çalışır; puan ve QR anında', async () => {
  const u = await member(); const v = await member();
  const before = await balance(u);
  const { data } = await u.post('/api/items', itemBody());
  assert.equal(data.item.status, 'PENDING_DROP');
  assert.ok(data.item.drop_token.startsWith('LW-'));
  assert.equal(await balance(u), before + 80);
  const list = await v.get('/api/items');
  assert.ok(list.data.items.some((i) => i.id === data.item.id));
  assert.equal((await v.post(`/api/items/${data.item.id}/reserve`)).data.error, 'not_available');
  assert.equal((await v.post(`/api/items/${data.item.id}/notify`)).data.subscribed, true);
  assert.equal((await v.post(`/api/items/${data.item.id}/notify`)).data.subscribed, false);
});

test('K3: 24 saatte onaylanmazsa EXPIRED olur, Keşfetten kalkar, puan geri alınır', async () => {
  const u = await member();
  const start = await balance(u);
  const { data } = await u.post('/api/items', itemBody());
  await sweep(db);
  assert.equal((await u.get(`/api/items/${data.item.id}`)).data.item.status, 'PENDING_DROP');
  await db.q("UPDATE items SET created_at = now() - interval '25 hours' WHERE id=$1", [data.item.id]);
  await sweep(db);
  assert.equal((await u.get(`/api/items/${data.item.id}`)).data.item.status, 'EXPIRED');
  assert.ok(!(await u.get('/api/items')).data.items.some((i) => i.id === data.item.id));
  assert.equal(await balance(u), start);
  const impact = (await u.get('/api/me/impact')).data;
  assert.equal(impact.total, 0);
});

test('K4: onayla kart READY olur, abonelere bildirim gider', async () => {
  const u = await member(); const v = await member();
  const { data } = await u.post('/api/items', itemBody());
  await v.post(`/api/items/${data.item.id}/notify`);
  assert.equal((await admin.post(`/api/admin/items/${data.item.id}/approve-drop`, {})).data.error, 'reason_required');
  await admin.post(`/api/admin/items/${data.item.id}/approve-drop`, { reason: 'Uygun' });
  assert.equal((await v.get(`/api/items/${data.item.id}`)).data.item.status, 'READY');
  const notes = (await v.get('/api/me/notifications')).data.notifications;
  assert.ok(notes.some((x) => x.kind === 'item_ready'));
});

test('K5: READY süresiz kalır ve eşzamanlı istekte yalnızca biri rezerve eder', async () => {
  const u = await member();
  const item = await ready(u);
  await db.q("UPDATE items SET ready_at = now() - interval '400 hours', created_at = now() - interval '400 hours' WHERE id=$1", [item.id]);
  await sweep(db);
  assert.equal((await u.get(`/api/items/${item.id}`)).data.item.status, 'READY');
  const buyers = await Promise.all([member(), member(), member()]);
  for (const b of buyers) await admin.post(`/api/admin/users/${b.id}/points`, { amount: 100, reason: 'test' });
  const results = await Promise.all(buyers.map((b) => b.post(`/api/items/${item.id}/reserve`)));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  const balances = await Promise.all(buyers.map(balance));
  assert.equal(balances.filter((b) => b === 40).length, 1); // 20 + 100 - 80
  assert.equal(balances.filter((b) => b === 120).length, 2);
});

test('K6: rezervasyonda puan düşer, reddedilirse aynı tutar iade edilir; yetersiz ve kendi ürünü engellenir', async () => {
  const u = await member(); const b = await member();
  const item = await ready(u);
  assert.equal((await u.post(`/api/items/${item.id}/reserve`)).data.error, 'own_item');
  const poor = await b.post(`/api/items/${item.id}/reserve`);
  assert.equal(poor.data.error, 'insufficient_points');
  assert.equal(poor.data.missing, 60);
  assert.equal((await b.get(`/api/items/${item.id}`)).data.item.status, 'READY');
  await admin.post(`/api/admin/users/${b.id}/points`, { amount: 60, reason: 'test' });
  const r = await b.post(`/api/items/${item.id}/reserve`);
  assert.equal(await balance(b), 0);
  assert.equal((await admin.post(`/api/admin/reservations/${r.data.id}/reject`, { reason: 'Ürün bulunamadı' })).status, 200);
  assert.equal(await balance(b), 80);
  assert.equal((await b.get(`/api/items/${item.id}`)).data.item.status, 'READY');
});

async function toPickupReady(owner, buyer) {
  const item = await ready(owner);
  await admin.post(`/api/admin/users/${buyer.id}/points`, { amount: 80, reason: 'test' });
  const { data } = await buyer.post(`/api/items/${item.id}/reserve`);
  await admin.post(`/api/admin/reservations/${data.id}/approve`, { reason: 'Uygun' });
  const w = (await buyer.get('/api/me/wardrobe')).data;
  return { item, resId: data.id, token: w.reserved.find((r) => r.id === data.id).qr_token };
}

test('K7: onayda tek kullanımlık QR üretilir, kullanılmış QR geçersizdir', async () => {
  const u = await member(); const b = await member();
  const { item, token } = await toPickupReady(u, b);
  assert.ok(token.startsWith('AL-') && token.length > 20);
  assert.equal((await admin.post('/api/admin/scan', { token })).data.type, 'pickup');
  assert.equal((await admin.post('/api/admin/scan/complete', { token, reason: 'QR okutuldu' })).status, 200);
  assert.equal((await b.get(`/api/items/${item.id}`)).data.item.status, 'COMPLETED');
  assert.ok(!(await b.get('/api/items')).data.items.some((i) => i.id === item.id));
  assert.equal((await admin.post('/api/admin/scan', { token })).data.error, 'used_qr');
  assert.equal((await admin.post('/api/admin/scan/complete', { token, reason: 'x' })).data.error, 'used_qr');
});

test('gelinmeyen teslimde 24 saat sonra rezervasyon kapanır ve puan iade edilir', async () => {
  const u = await member(); const b = await member();
  const { item, resId, token } = await toPickupReady(u, b);
  const after = await balance(b);
  await db.q("UPDATE reservations SET pickup_expires_at = now() - interval '1 minute' WHERE id=$1", [resId]);
  assert.equal((await admin.post('/api/admin/scan', { token })).data.error, 'expired_qr');
  await sweep(db);
  assert.equal(await balance(b), after + 80);
  assert.equal((await b.get(`/api/items/${item.id}`)).data.item.status, 'READY');
});

test('K8: 3 gün içinde iade açılır, kabulde iade hareketi oluşur; süre sonrası kapalı', async () => {
  const u = await member(); const b = await member();
  const { item, resId, token } = await toPickupReady(u, b);
  await admin.post('/api/admin/scan/complete', { token, reason: 'QR okutuldu' });
  const spent = await balance(b);
  const ret = await b.post('/api/returns', { reservation_id: resId, reason: 'Beden uymadı' });
  assert.equal(ret.status, 200);
  assert.equal((await b.get(`/api/items/${item.id}`)).data.item.status, 'RETURN_PENDING');
  assert.ok(!(await b.get('/api/items')).data.items.some((i) => i.id === item.id));
  await admin.post(`/api/admin/returns/${ret.data.id}/approve`, { reason: 'Geri alındı', republish: true });
  assert.equal(await balance(b), spent + 80);
  assert.equal((await b.get(`/api/items/${item.id}`)).data.item.status, 'READY');
  const tx = (await b.get('/api/me/transactions')).data.transactions;
  assert.ok(tx.some((t) => t.type === 'RETURN_REFUND' && t.amount === 80));

  const u2 = await member(); const b2 = await member();
  const late = await toPickupReady(u2, b2);
  await admin.post('/api/admin/scan/complete', { token: late.token, reason: 'QR okutuldu' });
  await db.q("UPDATE reservations SET completed_at = now() - interval '73 hours' WHERE id=$1", [late.resId]);
  assert.equal((await b2.post('/api/returns', { reservation_id: late.resId, reason: 'Geç' })).data.error, 'return_closed');
});

test('iade reddinde ürün teslim edilmiş kalır, puan iade edilmez', async () => {
  const u = await member(); const b = await member();
  const { item, resId, token } = await toPickupReady(u, b);
  await admin.post('/api/admin/scan/complete', { token, reason: 'QR okutuldu' });
  const spent = await balance(b);
  const ret = await b.post('/api/returns', { reservation_id: resId, reason: 'Vazgeçtim' });
  await admin.post(`/api/admin/returns/${ret.data.id}/reject`, { reason: 'Ürün getirilmedi' });
  assert.equal(await balance(b), spent);
  assert.equal((await b.get(`/api/items/${item.id}`)).data.item.status, 'COMPLETED');
});

test('değerlendirme tek kayıttır ve anonimdir', async () => {
  const u = await member(); const b = await member();
  const { resId, token } = await toPickupReady(u, b);
  await admin.post('/api/admin/scan/complete', { token, reason: 'QR okutuldu' });
  assert.equal((await b.post('/api/reviews', { reservation_id: resId, score: 6 })).data.error, 'invalid_score');
  assert.equal((await b.post('/api/reviews', { reservation_id: resId, score: 5, comment: 'Güzel' })).status, 200);
  assert.equal((await b.post('/api/reviews', { reservation_id: resId, score: 4 })).data.error, 'already_reviewed');
  const view = (await b.get('/api/items')).data.items[0];
  assert.ok(view && !('owner_id' in view));
});

test('K9: yönetici kararları gerekçe, zaman ve kullanıcıyla kaydedilir; üye panele giremez', async () => {
  const u = await member();
  const item = await ready(u);
  const log = (await admin.get('/api/admin/audit')).data.entries;
  const row = log.find((e) => e.entity_id === item.id && e.action === 'approve_drop');
  assert.equal(row.reason, 'Uygun');
  assert.equal(row.old_value, 'PENDING_DROP');
  assert.equal(row.new_value, 'READY');
  assert.ok(row.actor_id && row.created_at);
  assert.equal((await u.get('/api/admin/audit')).status, 403);
  assert.equal((await new Client().get('/api/admin/audit')).status, 401);
  assert.equal((await admin.post(`/api/admin/users/${u.id}/points`, { amount: 5 })).data.error, 'reason_required');
});

test('K10: Etkim yöntem sürümünü saklar; eksik değer sıfır sayılmaz; red ve iptalde toplamdan çıkar', async () => {
  const u = await member();
  const a = await u.post('/api/items', itemBody({ category: 'tshirt', material: 'cotton', condition: 'acceptable' }));
  assert.equal(a.data.item.point_value, 35);
  assert.equal(a.data.item.impact.version, 'v2');
  await u.post('/api/items', itemBody({ category: 'shirt', material: 'unknown', condition: 'good' }));
  let imp = (await u.get('/api/me/impact')).data;
  assert.equal(imp.total, 2);
  assert.equal(imp.co2.count, 1);
  assert.equal(imp.co2.sum.toFixed(1), '13.6');
  assert.equal(Math.round(imp.water.sum), 2400);
  await u.post(`/api/items/${a.data.item.id}/cancel`);
  imp = (await u.get('/api/me/impact')).data;
  assert.equal(imp.total, 1);
  assert.equal(imp.co2.count, 0);
});

test('aynı gönderim iki kez puan ve ürün oluşturmaz', async () => {
  const u = await member();
  const start = await balance(u);
  const a = await u.post('/api/items', itemBody({ client_key: 'k1' }));
  const b = await u.post('/api/items', itemBody({ client_key: 'k1' }));
  assert.equal(a.data.item.id, b.data.item.id);
  assert.equal(b.data.duplicate, true);
  assert.equal(await balance(u), start + 80);
});

test('red ve onayda kondisyon düzeltme: puan farkı işlenir, red tüm puanı geri alır', async () => {
  const u = await member();
  const start = await balance(u);
  const a = (await u.post('/api/items', itemBody())).data.item;
  await admin.post(`/api/admin/items/${a.id}/approve-drop`, { reason: 'Hafif kullanım izi', condition: 'good' });
  const after = (await u.get(`/api/items/${a.id}`)).data.item;
  assert.equal(after.point_value, 70);
  assert.equal(await balance(u), start + 70);
  const r = (await u.post('/api/items', itemBody())).data.item;
  await admin.post(`/api/admin/items/${r.id}/reject-drop`, { reason: 'Leke var' });
  assert.equal(await balance(u), start + 70);
  assert.ok(!(await u.get('/api/items')).data.items.some((i) => i.id === r.id));
});

test('stant: başlangıç puanı kıyafete yetmez, hediyeliğe yeter; görevli kabulü puanı ziyaretçiye yazar', async () => {
  const v = await member();
  assert.equal(await balance(v), 20);
  const owner = await member();
  const cheap = await ready(owner, { category: 'tshirt', condition: 'acceptable' });
  assert.equal((await v.post(`/api/items/${cheap.id}/reserve`)).data.error, 'insufficient_points');
  const gifts = (await admin.get('/api/admin/gifts')).data.gifts;
  assert.equal((await v.post(`/api/gifts/${gifts[0].id}/buy`)).data.error, 'gift_unavailable');
  await admin.post('/api/admin/gifts', { ...gifts[0], stock: 1 });
  assert.equal((await v.post(`/api/gifts/${gifts[0].id}/buy`)).status, 200);
  assert.equal(await balance(v), 0);
  const w = (await v.get('/api/me/wardrobe')).data;
  const token = w.gifts[0].qr_token;
  assert.equal((await admin.post('/api/admin/scan', { token })).data.type, 'gift');
  assert.equal((await admin.post('/api/admin/scan/gift', { token, reason: 'Teslim edildi' })).status, 200);
  assert.equal((await admin.post('/api/admin/scan', { token })).data.error, 'used_qr');

  const intake = await admin.post('/api/admin/intake', { ...itemBody({ consents: undefined }), user_code: v.code, reason: 'Standda kabul' });
  assert.equal(intake.status, 200);
  assert.equal(await balance(v), 80);
  assert.equal((await v.get(`/api/items/${intake.data.id}`)).data.item.status, 'READY');
});

test('arama Türkçe karakter ve büyük harfe duyarsızdır', async () => {
  const u = await member();
  const a = (await u.post('/api/items', itemBody({ category: 'shirt' }))).data.item;
  const found = async (q) => (await u.get(`/api/items?q=${encodeURIComponent(q)}`)).data.items.some((i) => i.id === a.id);
  assert.ok(await found('göm'));
  assert.ok(await found('GOM'));
  assert.ok(await found('gömlek m'));
  assert.ok(!(await found('kaban')));
});
