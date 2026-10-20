# Elenca i testi del PDF con posizione e font, e scrive una pagina HTML che ne misura la larghezza in Helvetica.
import sys, os, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdfedit import load, stream
from en import T
src, out = sys.argv[1], sys.argv[2]
dec = lambda s: re.sub(r'\\(.)', r'\1', re.sub(r'\\([0-7]{3})', lambda m: chr(int(m.group(1), 8)), s))
head, objs, tr = load(src)
items = []
for n, b in objs.items():
    r = stream(b)
    if r is None: continue
    font = None
    for m in re.finditer(rb'/(F\d) ([\d.]+) Tf|1 0 0 1 ([\d.-]+) ([\d.-]+) Tm \(((?:\\.|[^\\)])*)\) Tj', r):
        if m.group(1): font = (m.group(1).decode(), float(m.group(2))); continue
        k = m.group(5).decode('latin1')
        items.append(dict(font=font, x=float(m.group(3)), it=k, itd=dec(k), end=dec(T[k])))
json.dump(items, open(out + '.json', 'w'))
open(out + '.html', 'w').write('<html><body><script>const I=' + json.dumps(items) + ';const c=document.createElement("canvas").getContext("2d");const w=(f,s)=>{c.font=(f==="F2"?"bold ":"")+"1000px Helvetica";return c.measureText(s).width/1000};document.body.textContent=JSON.stringify(I.map(i=>[w(i.font[0],i.itd),w(i.font[0],i.end)]))</script></body></html>')
