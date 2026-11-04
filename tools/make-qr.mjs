// Stant QR'ını yazdırmaya uygun PNG olarak üretir.
// Çalıştırma: npm i --no-save playwright-core && node tools/make-qr.mjs <adres> <çıktı.png>
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const [url, out] = process.argv.slice(2);
if (!url || !out) throw new Error('Kullanım: make-qr.mjs <adres> <çıktı.png>');
const qrcode = createRequire(import.meta.url)('qrcode-generator');
const q = qrcode(0, 'Q');
q.addData(url); q.make();
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
await page.setContent(`<body style="margin:0;background:#fff">${q.createSvgTag({ scalable: true, margin: 4 })}</body>`);
await page.addStyleTag({ content: 'svg{width:1200px;height:1200px;display:block}' });
await page.screenshot({ path: out });
await browser.close();
console.log('hazır:', out);
