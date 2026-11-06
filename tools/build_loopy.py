# Demodaki kırpık Loopy başından tam logo üretir: yün yumağın kesik yerlerini aynı renkte
# sargılarla tamamlar, çeneyi yuvarlar, halkanın içini saydam yapar. Çıktılar: public/assets.
# Çalıştırma: python tools/build_loopy.py <demo-yuz.png>   (LoopWear_Demo_2.html içindeki 130x117 görsel)
import sys
from collections import deque
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

K = 6  # büyütme
CROP_W = 114  # sağındaki konuşma balonu parçaları dışarıda kalır
BG = (252, 248, 237)  # temanın --bg rengi
GREEN, BEIGE, BLUE, RED = (92, 124, 98), (226, 204, 168), (63, 95, 134), (196, 96, 90)
# Dıştan içe sargılar: (kalınlık birimi, renk)
BANDS = [(9, GREEN), (5, BEIGE), (7, BLUE), (8, GREEN), (5, RED), (7, BEIGE), (9, GREEN), (6, BLUE), (9, GREEN), (6, BEIGE), (60, GREEN)]


def flood(mask, seeds):
    h, w = mask.shape
    seen = np.zeros_like(mask)
    q = deque()
    for y, x in seeds:
        if mask[y, x] and not seen[y, x]:
            seen[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for n, m in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= n < h and 0 <= m < w and mask[n, m] and not seen[n, m]:
                seen[n, m] = True
                q.append((n, m))
    return seen


def fit_circle(pts):
    x, y = np.array(pts, float).T
    A = np.c_[2 * x, 2 * y, np.ones(len(x))]
    sol = np.linalg.lstsq(A, x * x + y * y, rcond=None)[0]
    return sol[0], sol[1], float(np.sqrt(sol[2] + sol[0] ** 2 + sol[1] ** 2))


def build(src):
    im = Image.open(src).convert('RGB').crop((0, 0, CROP_W, 117))
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    white = a.min(axis=2) >= 232
    edge = [(0, x) for x in range(w)] + [(y, w - 1) for y in range(h)]
    outside = flood(white, edge)
    hole = white & ~outside
    hole[int(h * 0.3):, :] = False
    bg = outside | hole
    fg = ~bg

    # Daire: halkanın olmadığı üst sol sınır ve sağ sınır noktalarından
    pts = []
    for y in range(int(h * 0.42), int(h * 0.8)):
        xs = np.where(fg[y])[0]
        if len(xs):
            pts.append((xs[-1] + 1, y))
    for x in range(int(w * 0.12), int(w * 0.5)):
        ys = np.where(fg[:, x])[0]
        if len(ys):
            pts.append((x, ys[0]))
    cx, cy, r = fit_circle(pts)

    pad = 4
    ox = (max(0, r - cx) + pad) * K
    oy = pad * K
    W = int((cx + r + pad) * K + ox)
    H = int((cy + r + pad) * K + oy)
    C = (cx * K + ox, cy * K + oy)
    R = r * K

    # Altta tam yumak: iç içe sargılar, her biri ince ipliklerden
    disc = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(disc)
    d.ellipse((C[0] - R, C[1] - R, C[0] + R, C[1] + R), fill=GREEN + (255,))
    off = 0.0
    step = K * 0.55
    for units, col in BANDS:
        for i in range(int(units * K / step)):
            rr = R - off
            if rr <= 0:
                break
            shade = 1 + 0.2 * np.sin(i * 2.1)
            c = tuple(min(255, int(v * shade)) for v in col) + (255,)
            d.ellipse((C[0] - rr, C[1] - rr, C[0] + rr, C[1] + rr), outline=c, width=int(step) + 2)
            off += step
    disc = disc.filter(ImageFilter.GaussianBlur(K * 0.28))

    big = im.resize((w * K, h * K), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=K, percent=70, threshold=2))
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).resize((w * K, h * K), Image.BICUBIC).filter(ImageFilter.GaussianBlur(K * 0.35))
    art = big.convert('RGBA')
    art.putalpha(alpha)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    layer.paste(art, (int(ox), int(oy)))

    # Özgün görsel yuvarlak bir çeneyle biter; kesik kenar ve eller sargının altında kalır
    yy, xx = np.mgrid[0:H, 0:W]
    cut = h * K + oy
    dx = (xx - C[0]) / R
    chin = cut - 3 * K - (dx ** 2) * 20 * K
    fade = np.clip((chin - yy) / (2.2 * K), 0, 1)
    left_edge = np.clip((xx - ox - 1.5 * K) / (2 * K), 0, 1)
    la = np.asarray(layer).copy()
    la[..., 3] = (la[..., 3] * fade * left_edge).astype(np.uint8)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(disc)
    canvas.alpha_composite(Image.fromarray(la, 'RGBA'))
    return canvas


def icon(logo, size, scale, bg=BG):
    out = Image.new('RGB', (size, size), bg)
    k = size * scale / max(logo.size)
    fit = logo.resize((int(logo.width * k), int(logo.height * k)), Image.LANCZOS)
    out.paste(fit, ((size - fit.width) // 2, (size - fit.height) // 2), fit)
    return out


if __name__ == '__main__':
    logo = build(sys.argv[1])
    logo.save('public/assets/loopy-logo.png', optimize=True)
    for name in ('face', 'wave'):
        logo.resize((320, int(logo.height * 320 / logo.width)), Image.LANCZOS).save(f'public/assets/loopy-{name}.png', optimize=True)
    icon(logo, 512, 0.68).save('public/assets/icon-512.png', optimize=True)
    icon(logo, 192, 0.68).save('public/assets/icon-192.png', optimize=True)
    print('logo', logo.size)
