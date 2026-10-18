# Genera le icone PNG della PWA (bersaglio su fondo crema), senza librerie esterne.
import math, struct, zlib, sys

def png(path, n):
    rows = []
    for y in range(n):
        row = bytearray([0])
        for x in range(n):
            d = math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2)
            c = (255, 244, 228)
            for r, col in ((0.78, (217, 87, 42)), (0.62, (255, 255, 255)), (0.46, (255, 122, 69)), (0.30, (255, 255, 255)), (0.14, (61, 139, 253))):
                if d < r:
                    c = col
            row += bytes(c)
        rows.append(bytes(row))
    raw = zlib.compress(b''.join(rows), 9)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0)) + chunk(b'IDAT', raw) + chunk(b'IEND', b''))

out = sys.argv[1]
for name, n in (('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)):
    png(f'{out}/{name}', n)
