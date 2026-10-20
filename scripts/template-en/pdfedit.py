# Legge un PDF semplice di ReportLab, decodifica gli stream (ASCII85 + Flate) e lo riscrive con l'xref rifatto.
import re, zlib, base64, sys

def load(path):
    d = open(path, 'rb').read()
    objs = {int(n): body for n, body in re.findall(rb'(\d+) 0 obj\n(.*?)endobj\n', d, re.S)}
    trailer = re.search(rb'trailer\s*(<<.*?>>)', d, re.S).group(1)
    return d[:d.index(b'\n') + 1], objs, trailer

def stream(body):
    m = re.search(rb'stream\n(.*?)endstream', body, re.S)
    if not m: return None
    a = m.group(1).strip()
    return zlib.decompress(base64.a85decode(a if a.startswith(b'<~') else b'<~' + a, adobe=True))

def with_stream(body, raw):
    enc = base64.a85encode(zlib.compress(raw), adobe=True)[2:]  # ReportLab scrive senza "<~"
    hdr = re.sub(rb'/Length \d+', b'/Length %d' % len(enc), body[:body.index(b'stream\n')])
    return hdr + b'stream\n' + enc + b'endstream\n'

def save(path, head, objs, trailer):
    out = bytearray(head + b'%\x93\x8c\x8b\x9e ReportLab Generated PDF document\n')
    offs = {}
    for n in sorted(objs):
        offs[n] = len(out)
        out += b'%d 0 obj\n' % n + objs[n] + b'endobj\n'
    x = len(out)
    size = max(objs) + 1
    out += b'xref\n0 %d\n0000000000 65535 f \n' % size
    for n in range(1, size):
        out += (b'%010d 00000 n \n' % offs[n]) if n in offs else b'0000000000 65535 f \n'
    out += b'trailer\n' + re.sub(rb'/Size \d+', b'/Size %d' % size, trailer) + b'\nstartxref\n%d\n%%%%EOF\n' % x
    open(path, 'wb').write(out)
