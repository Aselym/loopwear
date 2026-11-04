"""Masaüstündeki kaynak dosyalardan server/catalog.json ve public/assets görsellerini üretir."""
import base64, hashlib, io, json, os, re, sys
import openpyxl
from PIL import Image, ImageDraw

SRC = os.path.expanduser('~/Desktop/loopwear')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# kod, Excel/belge adı, İngilizce ad, baz puan (Puanlama şartnamesi 4-5)
CATS = [
 ('coat','Kaban','Coat',60),('puffer','Kışlık mont / şişme mont','Winter / puffer jacket',60),
 ('leather_jacket','Deri / suni deri ceket','Leather / faux leather jacket',55),
 ('trench','Trençkot / yağmurluk','Trench coat / raincoat',55),('blazer','Blazer ceket','Blazer',50),
 ('denim_jacket','Kot ceket','Denim jacket',50),('other_jacket','Diğer ceketler','Other jackets',50),
 ('sweater','Kazak','Sweater',45),('cardigan','Hırka','Cardigan',45),('sweatshirt','Sweatshirt','Sweatshirt',45),
 ('hoodie','Kapüşonlu sweatshirt','Hoodie',45),('vest','Yelek','Vest',40),('suit','Takım elbise','Suit',55),
 ('jeans','Jean pantolon','Jeans',45),('trousers','Kumaş pantolon','Trousers',45),('dress','Elbise','Dress',45),
 ('jumpsuit','Tulum','Jumpsuit',45),('sweatpants','Eşofman altı','Sweatpants',40),('shirt','Gömlek','Shirt',40),
 ('blouse','Bluz','Blouse',35),('skirt','Etek','Skirt',35),('shorts','Şort / bermuda','Shorts',30),
 ('polo','Polo yaka tişört','Polo shirt',30),('longsleeve','Uzun kollu tişört','Long-sleeve T-shirt',30),
 ('tshirt','Kısa kollu tişört','Short-sleeve T-shirt',25)]
MATS = [('acrylic','Akrilik','Acrylic'),('cotton','Pamuk','Cotton'),('leather','Deri','Leather'),('linen','Keten','Linen'),
 ('polyamide','Poliamid','Polyamide'),('polyester','Polyester','Polyester'),('rubber','Kauçuk','Rubber'),('silk','İpek','Silk'),
 ('elastane','Elastan','Elastane'),('viscose','Viskon','Viscose'),('wool','Yün','Wool')]

wb = openpyxl.load_workbook(os.path.join(SRC,'LoopWear_Etki_VeriSeti_v2.xlsx'), data_only=True)
cat_by = {n:c for c,n,_,_ in CATS}; mat_by = {n:c for c,n,_ in MATS}
weights = {cat_by[r[0]]: r[1] for r in list(wb['Kategori ağırlıkları'].iter_rows(values_only=True))[1:]}
factors = {mat_by[r[0]]: {'co2':r[1],'water':r[2]} for r in list(wb['Materyal faktörleri'].iter_rows(values_only=True))[1:]}
closed = sorted(f"{cat_by[r[0]]}|{mat_by[r[1]]}" for r in list(wb['Hesaplanan referanslar'].iter_rows(values_only=True))[1:] if 'kapal' in r[8])
assert len(weights)==25 and len(factors)==11 and len(closed)==59

catalog = {
 'scoring_version':'v0.1','impact_version':'v2',
 'categories':[{'id':c,'tr':n,'en':e,'points':p,'weight':weights[c]} for c,n,e,p in CATS],
 'materials':[{'id':c,'tr':n,'en':e,**factors[c]} for c,n,e in MATS]+[
   {'id':'blend','tr':'Karışım','en':'Blend','co2':None,'water':None},
   {'id':'unknown','tr':'Diğer / bilmiyorum','en':"Other / don't know",'co2':None,'water':None}],
 'closed':closed,
 'conditions':[
  {'id':'very_good','points':30,'tr':'Çok iyi','en':'Very good','desc_tr':'Temiz, giyime hazır; belirgin kullanım izi, solma veya tüylenme yok.','desc_en':'Clean and ready to wear; no visible wear, fading or pilling.'},
  {'id':'good','points':20,'tr':'İyi','en':'Good','desc_tr':'Temiz ve giyime hazır; hafif kullanım izi olabilir, formu iyi.','desc_en':'Clean and ready to wear; may show light wear, keeps its shape.'},
  {'id':'acceptable','points':10,'tr':'Kabul edilebilir','en':'Acceptable','desc_tr':'Temiz ve kullanılabilir; hafif solma veya tüylenme bulunabilir.','desc_en':'Clean and usable; may have light fading or pilling.'}],
 'sizes':['XS','S','M','L','XL','XXL','other'],
 'colors':[{'id':i,'tr':t,'en':e} for i,t,e in [('black','Siyah','Black'),('white','Beyaz','White'),('grey','Gri','Grey'),('navy','Lacivert','Navy'),('blue','Mavi','Blue'),('green','Yeşil','Green'),('red','Kırmızı','Red'),('pink','Pembe','Pink'),('yellow','Sarı','Yellow'),('orange','Turuncu','Orange'),('purple','Mor','Purple'),('brown','Kahverengi','Brown'),('beige','Bej','Beige'),('multi','Çok renkli','Multicolour')]],
}
json.dump(catalog, open(os.path.join(ROOT,'server/catalog.json'),'w',encoding='utf8'), ensure_ascii=False, indent=1)

print('ok')
