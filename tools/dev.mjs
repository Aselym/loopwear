// Yerel geliştirme: test yöneticisiyle gömülü veritabanını başlatır.
process.env.ADMIN_EMAIL ||= 'yonetici@loopwear.test';
process.env.ADMIN_PASSWORD ||= 'yonetici-test-2026';
await import('../server/index.js');
