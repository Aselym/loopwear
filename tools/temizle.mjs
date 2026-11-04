// Stant öncesi deneme kayıtlarını siler: üyeler, ürünler, işlemler. Yönetici, istasyon, ayar ve hediyelikler kalır.
// Varsayılan yalnızca sayar. Silmek için: DATABASE_URL=... node tools/temizle.mjs --sil
import { openDb } from '../server/db.js';

const TABLES = ['subscriptions', 'favorites', 'reviews', 'notifications', 'returns', 'reservations', 'transactions', 'impact_snapshots', 'item_images', 'items', 'gift_orders', 'audit_log', 'support_requests'];
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL gerekli');
const db = await openDb();
const count = async () => {
  const out = {};
  for (const t of TABLES) [{ n: out[t] }] = await db.q(`SELECT count(*)::int AS n FROM ${t}`);
  [{ n: out.uyeler }] = await db.q("SELECT count(*)::int AS n FROM users WHERE role <> 'admin'");
  return out;
};
console.log('Mevcut:', await count());
if (process.argv.includes('--sil')) {
  await db.tx(async (t) => {
    await t.q(`TRUNCATE ${TABLES.join(', ')} CASCADE`);
    await t.q("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role <> 'admin')");
    await t.q("DELETE FROM users WHERE role <> 'admin'");
    await t.q("UPDATE users SET wallet_balance = 0 WHERE role = 'admin'");
  });
  console.log('Silindi:', await count());
  console.log('Hediyelik stoğu değişmedi, panelden gerçek adedi gir.');
} else {
  console.log('Hiçbir şey silinmedi. Silmek için --sil ekle.');
}
await db.close();
