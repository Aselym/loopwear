# Ekibin gönderdiği yüksek çözünürlüklü tam boy Loopy'den uygulama görsellerini üretir:
# saydam tam boy (giriş ve sonuç ekranları), yalnız baş (logo, kartlar) ve uygulama ikonları.
# Çalıştırma: python tools/build_loopy.py <loopy-tam-boy.webp|png>
import sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

BG = (252, 248, 237)  # temanın --bg rengi
OUT = 'public/assets'


def cutout(im):
    """Kenara bağlı arka planı saydam yapar; kenarlarda renk farkına göre yumuşak geçiş bırakır."""
    a = np.asarray(im.convert('RGB')).astype(int)
    h, w, _ = a.shape
    ref = np.median(np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)]), axis=0)
    d = np.abs(a - ref).sum(axis=2)
    near = d < 30
    seen = np.zeros((h, w), bool)
    q = deque()
    for y, x in [(y, x) for y in (0, h - 1) for x in range(w)] + [(y, x) for y in range(h) for x in (0, w - 1)]:
        if near[y, x] and not seen[y, x]:
            seen[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for n, m in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= n < h and 0 <= m < w and near[n, m] and not seen[n, m]:
                seen[n, m] = True
                q.append((n, m))
    soft = np.clip((d - 8) / 22, 0, 1)
    alpha = np.where(seen, soft, 1.0)
    out = im.convert('RGBA')
    out.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)))
    return out.crop(out.getbbox()), ref


def hull(points):
    pts = sorted(set(points))
    def half(seq):
        h = []
        for p in seq:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) <= 0:
                h.pop()
            h.append(p)
        return h
    lower, upper = half(pts), half(reversed(pts))
    return lower[:-1] + upper[:-1]


def head(full, ref):
    """Renkli yün sargılarının dış çizgisiyle başı (halka dahil) gövdeden ayırır; halkanın içini boşaltır."""
    a = np.asarray(full).astype(int)
    rgb, al = a[..., :3], a[..., 3]
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    yarn = (sat > 70) & (al > 200)
    rows = yarn.sum(axis=1)
    top = int(np.argmax(rows > 20))
    end = top
    gap = 0
    for y in range(top, len(rows)):
        if rows[y] > 20:
            end, gap = y, 0
        else:
            gap += 1
            if gap > 12:
                break
    yarn[end + 1:] = False
    ys, xs = np.nonzero(yarn)
    step = max(1, len(xs) // 20000)
    poly = hull(list(zip(xs[::step].tolist(), ys[::step].tolist())))
    from PIL import ImageDraw
    mask = Image.new('L', full.size, 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    m = np.asarray(mask.filter(ImageFilter.GaussianBlur(2))).astype(float) / 255
    # Halkanın içi: yumağın gövdesi başlamadan önceki satırlarda arka plan rengindeki boşluk
    width = yarn.sum(axis=1)
    ball_top = int(np.argmax(width > width.max() * 0.45))
    d = np.abs(rgb - ref).sum(axis=2)
    hole = np.ones_like(m)
    hole[:ball_top] = np.clip((d[:ball_top] - 8) / 22, 0, 1)
    # Boyun: her sütunda en alttaki sargının altı kesilir
    low = np.full(yarn.shape[1], -1)
    cols = np.nonzero(yarn.any(axis=0))[0]
    low[cols] = yarn.shape[0] - 1 - np.argmax(yarn[::-1, cols], axis=0)
    # Seyrek sütunlarda alt çizgi komşulardan tamamlanır, sonra yumuşatılır
    k = max(3, yarn.shape[1] // 12)
    low = np.array([low[max(0, i - k): i + k + 1].max() for i in range(len(low))])
    kern = np.ones(k) / k
    low = np.convolve(np.pad(low, k, mode='edge'), kern, mode='same')[k:-k]
    yy = np.arange(yarn.shape[0])[:, None]
    hole *= np.clip((low[None, :] + 3 - yy) / 4, 0, 1)
    # Yumağın elipsi dışında kalan omuz parçaları (askı halkası hariç)
    ys2, xs2 = np.nonzero(yarn[ball_top:])
    cy, cx = (ball_top + ys2.max() + ball_top + ys2.min()) / 2, (xs2.max() + xs2.min()) / 2
    ry, rx = (ys2.max() - ys2.min()) / 2 * 1.02, (xs2.max() - xs2.min()) / 2 * 1.02
    xx = np.arange(yarn.shape[1])[None, :]
    r = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    ell = np.clip((1.0 - r) * 60, 0, 1)
    ell[:int(cy)] = 1
    hole *= ell
    alpha = np.minimum(m, al / 255) * hole
    out = full.copy()
    out.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)))
    return out.crop(out.getbbox())


def fit(im, height):
    return im.resize((round(im.width * height / im.height), height), Image.LANCZOS)


def icon(logo, size, scale):
    out = Image.new('RGB', (size, size), BG)
    k = size * scale / max(logo.size)
    f = logo.resize((round(logo.width * k), round(logo.height * k)), Image.LANCZOS)
    out.paste(f, ((size - f.width) // 2, (size - f.height) // 2), f)
    return out


if __name__ == '__main__':
    full, ref = cutout(Image.open(sys.argv[1]))
    fit(full, 720).save(f'{OUT}/loopy-hero.png', optimize=True)
    h = head(full, ref)
    fit(h, 640).save(f'{OUT}/loopy-logo.png', optimize=True)
    for name in ('face', 'wave'):
        fit(h, 300).save(f'{OUT}/loopy-{name}.png', optimize=True)
    icon(h, 512, 0.7).save(f'{OUT}/icon-512.png', optimize=True)
    icon(h, 192, 0.7).save(f'{OUT}/icon-192.png', optimize=True)
    print('tam boy', full.size, 'baş', h.size)
