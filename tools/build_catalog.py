"""Ekibin 16 ürünlük etki veri setinden server/catalog.json üretir (etki v3).

Çalıştırma: python tools/build_catalog.py <LoopWear_Etki_Veri_Seti_16_Urun.xlsx>
Kondisyon, beden ve renkler mevcut katalogdan korunur. Eski kategori ve materyaller
"retired" olarak kalır: seçim listelerinde görünmez, eski kayıtların adı okunur.
"""
import json, os, re, sys
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, 'server', 'catalog.json')

# kod, Excel adı, İngilizce ad, baz puan (Puanlama şartnamesindeki eş kategoriden)
CATS = [
    ('tshirt', 'Tişört', 'T-shirt', 25), ('longsleeve', 'Uzun kollu tişört', 'Long-sleeve T-shirt', 30),
    ('shirt', 'Gömlek', 'Shirt', 40), ('blouse', 'Bluz', 'Blouse', 35), ('sweatshirt', 'Sweatshirt', 'Sweatshirt', 45),
    ('hoodie', 'Kapüşonlu sweatshirt', 'Hoodie', 45), ('sweater', 'Kazak', 'Sweater', 45), ('cardigan', 'Hırka', 'Cardigan', 45),
    ('jeans', 'Jean pantolon', 'Jeans', 45), ('trousers', 'Kumaş pantolon', 'Trousers', 45), ('shorts', 'Şort', 'Shorts', 30),
    ('skirt', 'Etek', 'Skirt', 35), ('dress', 'Elbise', 'Dress', 45), ('mont', 'Mont', 'Coat / puffer', 60),
    ('jacket', 'Ceket', 'Jacket', 50), ('blazer', 'Blazer', 'Blazer', 50),
]
# kod, Excel'deki adın başı, gösterilecek ad, İngilizce ad
MATS = [
    ('cotton', 'Pamuk', 'Pamuk', 'Cotton'), ('polyester', 'Polyester', 'Polyester', 'Polyester'),
    ('viscose', 'Viskon', 'Viskon', 'Viscose'), ('wool', 'Yün', 'Yün', 'Wool'), ('acrylic', 'Akrilik', 'Akrilik', 'Acrylic'),
    ('linen', 'Keten', 'Keten', 'Linen'), ('polyamide', 'Naylon / poliamid', 'Naylon / poliamid', 'Nylon / polyamide'),
    ('recycled_polyester', 'Geri dönüştürülmüş polyester', 'Geri dönüştürülmüş polyester', 'Recycled polyester'),
    ('recycled_cotton', 'Geri dönüştürülmüş pamuk', 'Geri dönüştürülmüş pamuk', 'Recycled cotton'),
    ('cotton_polyester', 'Pamuk-polyester', 'Pamuk-polyester karışımı (%50/%50)', 'Cotton-polyester blend (50/50)'),
    ('cotton_viscose', 'Pamuk-viskon', 'Pamuk-viskon karışımı (%50/%50)', 'Cotton-viscose blend (50/50)'),
    ('polyester_elastane', 'Polyester-elastan', 'Polyester-elastan karışımı (%95/%5)', 'Polyester-elastane blend (95/5)'),
]


def mat_code(label):
    for code, head, _, _ in sorted(MATS, key=lambda m: -len(m[1])):
        if label.startswith(head):
            return code
    raise ValueError(label)


def main(xlsx):
    old = json.load(open(PATH, encoding='utf-8'))
    ws = openpyxl.load_workbook(xlsx, data_only=True).worksheets[0]
    cat_by = {n: c for c, n, _, _ in CATS}
    impacts, weights = {}, {}
    for row in list(ws.iter_rows(values_only=True))[1:]:
        if not row[0]:
            continue
        m = re.match(r'(.+?) \(varsayılan (\d+) g\)', row[0])
        cat = cat_by[m.group(1)]
        weights[cat] = int(m.group(2)) / 1000
        impacts[f'{cat}|{mat_code(row[1])}'] = [round(float(row[2]), 2), round(float(row[3]))]
    assert len(impacts) == len(CATS) * len(MATS), len(impacts)

    active = {c for c, *_ in CATS}
    retired = [dict(c, retired=True) for c in old['categories'] if c['id'] not in active and not c.get('retired')]
    retired += [c for c in old['categories'] if c.get('retired') and c['id'] not in active]
    mats_active = {c for c, *_ in MATS} | {'unknown'}
    mat_retired = [dict(m, retired=True) for m in old['materials'] if m['id'] not in mats_active]
    catalog = {
        **old,
        'impact_version': 'v3',
        'categories': [{'id': c, 'tr': n, 'en': e, 'points': p, 'weight': weights[c]} for c, n, e, p in CATS] + retired,
        'materials': [{'id': c, 'tr': tr, 'en': en} for c, _, tr, en in MATS]
        + [{'id': 'unknown', 'tr': 'Bilmiyorum', 'en': "Don't know"}] + mat_retired,
        'impacts': impacts,
        'closed': [],
    }
    json.dump(catalog, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('kategori', len(CATS), 'materyal', len(MATS), 'etki', len(impacts), 'eski', len(retired), len(mat_retired))


if __name__ == '__main__':
    main(sys.argv[1])
