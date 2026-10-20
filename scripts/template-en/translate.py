# Traduce il template del fucile: sostituisce i testi e sposta quelli centrati o allineati a destra
# perché il nuovo testo resti centrato o finisca nello stesso punto.
# Uso: python3 -I translate.py originale.pdf tradotto.pdf misure.json larghezze.json
import sys, os, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdfedit import load, stream, with_stream, save
from en import T, ALIGN
src, dst, mj, wj = sys.argv[1:5]
items, widths = json.load(open(mj)), json.load(open(wj))
MM = 72 / 25.4
off = lambda v: abs(v / MM - round(v / MM * 2) / 2)  # distanza dal mezzo millimetro più vicino
def align(i, wi):
    if i['it'] in ALIGN: return ALIGN[i['it']]
    r = [off(i['x']), off(i['x'] + wi / 2), off(i['x'] + wi)]
    return 'LCR'[r.index(min(r))] if min(r) < 0.02 and r[0] > 0.02 else 'L'
queue = iter(zip(items, widths))
head, objs, tr = load(src)
moved = []
def sub(m):
    i, (wi, we) = next(queue)
    assert i['it'] == m.group(3).decode('latin1')
    s = i['font'][1]; wi *= s; we *= s
    a = align(i, wi)
    x = float(m.group(1)) + {'L': 0, 'C': (wi - we) / 2, 'R': wi - we}[a]
    if a != 'L': moved.append((a, i['it'][:40]))
    return b'1 0 0 1 %.4f %s Tm (%s) Tj' % (x, m.group(2), T[i['it']].encode('latin1'))
for n in sorted(objs):
    r = stream(objs[n])
    if r is None: continue
    objs[n] = with_stream(objs[n], re.sub(rb'1 0 0 1 ([\d.-]+) ([\d.-]+) Tm \(((?:\\.|[^\\)])*)\) Tj', sub, r))
for n, b in objs.items():
    objs[n] = b.replace(b'(Fucile di cartone, template)', b'(Cardboard blaster, template)')
save(dst, head, objs, tr)
print(len(moved), 'testi riallineati')
