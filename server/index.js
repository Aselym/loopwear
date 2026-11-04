import { createServer } from 'node:http';
import { openDb } from './db.js';
import { createApp, seed } from './app.js';
import { sweep } from './logic.js';

const PORT = Number(process.env.PORT) || 3100;
const db = await openDb({ dataDir: process.env.DATABASE_URL ? undefined : (process.env.PGLITE_DIR || '.data/pg') });
await seed(db);
const handler = createApp(db);
createServer(handler).listen(PORT, () => console.log(`LoopWear http://localhost:${PORT}`));

// Sistem zamanlayıcısı: 24 saat kuralı ve teslim süreleri
const tick = () => sweep(db).catch((e) => console.error('sweep', e));
tick();
setInterval(tick, 60_000);
