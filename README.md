# LoopWear

Kıyafet döngüsü uygulaması. Aynı web uygulaması hem PWA hem APK olarak çalışır; arayüz Türkçe ve İngilizcedir.

## Çalıştırma

```bash
npm install
npm test
node tools/dev.mjs
```

Yerelde veriler gömülü veritabanında (`.data/`) durur. Adres: http://localhost:3100

| Adres | Ne için |
|---|---|
| `/` | Uygulama |
| `/indir` | Stant QR'ının açtığı kurulum sayfası (telefona göre yönlendirir) |
| `/ekran` | Stanttaki büyük ekran: canlı toplamlar ve QR |
| `/#/admin` | Yönetici paneli (yönetici hesabıyla) |

## Yayına alma

Ortam değişkenleri:

| Değişken | Değer |
|---|---|
| `DATABASE_URL` | Postgres bağlantı adresi |
| `ADMIN_EMAIL` | İlk yönetici e-postası |
| `ADMIN_PASSWORD` | İlk yönetici parolası |
| `NODE_ENV` | `production` |

Başlatma komutu: `node server/index.js`. Sunucu tabloları ve başlangıç kayıtlarını kendisi oluşturur.

APK hazır olunca `public/LoopWear.apk` olarak eklenir; `/indir` sayfası Android'de indirme düğmesini kendiliğinden gösterir.

## Yapı

- `server/logic.js`: iş kuralları (puan, etki, durum geçişleri, QR, zamanlayıcı)
- `server/app.js`: HTTP uçları, oturum, statik dosyalar
- `server/catalog.json`: kategori puanları, materyal katsayıları, kapalı eşleşmeler. `tools/build_assets.py` kaynak Excel'den üretir
- `public/`: derleme gerektirmeyen arayüz
- `test/flow.test.js`: şartname kabul testleri K1-K10

Çelişkilerde esas: 2 Kasım 2026 tarihli MVP Use Case şartnamesi. Kondisyonun kaynağı her üründe tutulur (`condition_source`); AI kamera eklendiğinde formül değişmez.
