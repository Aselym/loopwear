// Tek arayüz: üretimde Postgres (DATABASE_URL), geliştirme ve testte gömülü PGlite.
import { mkdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

export const newId = () => randomBytes(12).toString('base64url');

const schema = () => readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export async function openDb({ url = process.env.DATABASE_URL, dataDir } = {}) {
  let db;
  const wrap = (c) => ({ q: async (sql, p = []) => (await c.query(sql, p)).rows });
  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 8 });
    db = {
      ...wrap(pool),
      tx: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const r = await fn(wrap(c));
          await c.query('COMMIT');
          return r;
        } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
      },
      exec: (sql) => pool.query(sql),
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    if (dataDir) mkdirSync(dataDir, { recursive: true });
    const lite = new PGlite(dataDir);
    await lite.waitReady;
    db = {
      ...wrap(lite),
      tx: (fn) => lite.transaction((t) => fn(wrap(t))),
      exec: (sql) => lite.exec(sql),
      close: () => lite.close(),
    };
  }
  await db.exec(schema());
  return db;
}
