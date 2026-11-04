// Gerçek Chrome ile telefon görünümü ve kamerayla QR okutma testi.
// Çalıştırma: npm i --no-save playwright-core && node tools/qa-phone.mjs <çıktı klasörü>
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { openDb } from '../server/db.js';
import { createApp, seed } from '../server/app.js';

const OUT = process.argv[2] || '.data/qa';
mkdirSync(OUT, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const fail = []; const check = (name, ok, extra = '') => { console.log(`${ok ? 'GEÇTİ' : 'KALDI'}: ${name} ${extra}`); if (!ok) fail.push(name); };

const db = await openDb({ url: '' });
await seed(db, { adminEmail: 'qa-admin@example.com', adminPassword: 'qa-admin-parola-1' });
const server = createServer(createApp(db, { secureCookie: false })).listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://localhost:${server.address().port}`;

const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' };

// Bir üye kıyafet bırakır, bırakma kodu oluşur
const plain = await chromium.launch({ executablePath: CHROME, headless: true });
const member = await plain.newContext({ ...MOBILE, locale: 'tr-TR' });
const reg = await member.request.post(`${base}/api/auth/register`, { data: { email: 'qa-uye@example.com', password: 'qa-uye-parola-1', display_name: 'QA' } });
check('üyelik', reg.ok());
const item = await (await member.request.post(`${base}/api/items`, { data: { category: 'tshirt', material: 'cotton', size: 'M', condition: 'acceptable', color: 'navy', station_id: 'stand', consents: [true, true, true, true], photos: [PX, PX, PX] } })).json();
const token = item.item.drop_token;

// Telefon görünümü: alt çubuklar ekranın altında, yatay taşma yok
const page = await member.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const screens = [['ana-sayfa', '/#/'], ['kesfet', '/#/discover'], ['urun', `/#/item/${item.item.id}`], ['birak', '/#/drop'], ['dolabim', '/#/wardrobe'], ['etkim', '/#/impact'], ['profil', '/#/profile'], ['qr', `/#/qr/drop/${item.item.id}`]];
for (const [name, path] of screens) {
  await page.goto(base + path);
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const bar = document.querySelector('.bottomnav, .footer-bar')?.getBoundingClientRect();
    return { w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, barBottom: bar?.bottom, barW: bar?.width };
  });
  check(`${name}: yatay taşma yok`, m.sw <= m.w, `${m.sw}/${m.w}`);
  if (m.barBottom != null) check(`${name}: alt çubuk en altta`, Math.abs(m.barBottom - m.h) < 2, `${m.barBottom}/${m.h}`);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}
check('sayfa hatası yok', errors.length === 0, errors.join('; '));

// QR'ı görüntü dosyasına, oradan sahte kamera akışına çevir
const qrPage = await plain.newPage({ viewport: { width: 640, height: 480 } });
await qrPage.goto(`${base}/indir`);
await qrPage.addScriptTag({ url: `${base}/vendor/qrcode.js` });
await qrPage.evaluate((text) => {
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  document.body.innerHTML = `<div style="width:640px;height:480px;background:#fff;display:flex;align-items:center;justify-content:center"><div style="width:400px;height:400px">${q.createSvgTag({ scalable: true, margin: 2 })}</div></div>`;
}, token);
const png = join(OUT, 'qr-frame.png');
await qrPage.screenshot({ path: png });
const mjpeg = join(OUT, 'qr.mjpeg');
execFileSync('python', ['-c', `
from PIL import Image; import io,sys
im=Image.open(sys.argv[1]).convert('RGB'); b=io.BytesIO(); im.save(b,'JPEG',quality=92)
open(sys.argv[2],'wb').write(b.getvalue()*30)
`, png, mjpeg]);
await plain.close();

// Yönetici telefonu: kamera açılır, kod okunur
const cam = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${mjpeg}`] });
const adminCtx = await cam.newContext({ ...MOBILE, locale: 'tr-TR', permissions: ['camera'] });
await adminCtx.request.post(`${base}/api/auth/login`, { data: { email: 'qa-admin@example.com', password: 'qa-admin-parola-1' } });
const ap = await adminCtx.newPage();
await ap.goto(`${base}/#/admin/scan`);
let read = false;
try { await ap.waitForFunction(() => /Bırakma kodu/.test(document.getElementById('scanResult')?.innerText || ''), null, { timeout: 15000 }); read = true; } catch { /* aşağıda raporlanır */ }
check('kamera QR kodunu okudu ve ürünü buldu', read);
await ap.screenshot({ path: join(OUT, 'kamera-okuma.png') });
if (read) {
  await ap.click('[data-approve-drop]');
  await ap.click('.sheet [data-ok]');
  await ap.waitForTimeout(800);
  const st = await (await adminCtx.request.get(`${base}/api/items/${item.item.id}`)).json();
  check('okutulan ürün onaylandı', st.item.status === 'READY', st.item.status);
}
await cam.close();
server.close(); server.closeAllConnections(); await db.close();
writeFileSync(join(OUT, 'sonuc.txt'), fail.length ? fail.join('\n') : 'hepsi geçti');
console.log(fail.length ? `${fail.length} KONTROL KALDI` : 'HEPSİ GEÇTİ');
process.exit(fail.length ? 1 : 0);
