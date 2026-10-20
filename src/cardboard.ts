import { settings } from './settings.ts'

// Personaggi ritagliati dal cartone: attorno al disegno un bordo color cartone con le onde,
// sotto lo spessore più scuro, come una sagoma tagliata con il taglierino.
const art = document.createElement('canvas')
const rim = document.createElement('canvas')
const top = document.createElement('canvas')

export type Box = { left: number; top: number; right: number; bottom: number } // px rispetto al punto di ancoraggio

const CARD = '#d6a463'
const EDGE = '#9a6a3a'
const N = 24 // timbri attorno alla sagoma: più sono, più il bordo è liscio
const HAND = [0.2, 0.9, 0.4, 0.7, 0.1, 0.6, 1, 0.3, 0.8, 0.5, 0, 0.7, 0.4, 0.9, 0.2, 0.6]

export function cardboard(c: CanvasRenderingContext2D, box: Box, draw: (c: CanvasRenderingContext2D) => void) {
  const k = Math.min(2, devicePixelRatio || 1)
  const w = box.right - box.left, h = box.bottom - box.top
  const b = Math.max(2.5, Math.min(9, h * 0.03)) // larghezza del bordo di cartone
  const pad = b * 2.5
  const W = Math.ceil((w + 2 * pad) * k), H = Math.ceil((h + 2 * pad) * k)
  for (const cv of [art, rim, top]) if (cv.width < W || cv.height < H) Object.assign(cv, { width: Math.max(cv.width, W), height: Math.max(cv.height, H) })
  const a = art.getContext('2d')!, r = rim.getContext('2d')!
  a.setTransform(1, 0, 0, 1, 0, 0)
  a.clearRect(0, 0, art.width, art.height)
  a.setTransform(k, 0, 0, k, (pad - box.left) * k, (pad - box.top) * k)
  draw(a)
  a.setTransform(1, 0, 0, 1, 0, 0)

  // la sagoma, timbrata tutto intorno: prima lo spessore scuro spostato in basso, poi il bordo chiaro
  r.setTransform(1, 0, 0, 1, 0, 0)
  r.clearRect(0, 0, rim.width, rim.height)
  const stamp = (dx: number, dy: number) => r.drawImage(art, 0, 0, W, H, dx * k, dy * k, W, H)
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2
    stamp(Math.cos(t) * b + b * 0.3, Math.sin(t) * b + b * 0.5)
  }
  r.globalCompositeOperation = 'source-in'
  r.fillStyle = EDGE
  r.fillRect(0, 0, W, H)
  r.globalCompositeOperation = 'source-over'
  const tc = top.getContext('2d')!
  tc.globalCompositeOperation = 'source-over'
  tc.clearRect(0, 0, top.width, top.height)
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2
    const j = b * (0.9 + 0.2 * HAND[i % HAND.length]) // il taglierino non va mai dritto: bordo appena irregolare
    tc.drawImage(art, 0, 0, W, H, Math.cos(t) * j * k, Math.sin(t) * j * k, W, H)
  }
  tc.globalCompositeOperation = 'source-in'
  tc.fillStyle = CARD
  tc.fillRect(0, 0, W, H)
  // le onde del cartone, righe verticali appena visibili
  tc.globalCompositeOperation = 'source-atop'
  tc.fillStyle = 'rgba(120, 80, 40, 0.12)'
  for (let x = 0; x < W; x += 4 * k) tc.fillRect(x, 0, 1.5 * k, H)
  r.drawImage(top, 0, 0, W, H, 0, 0, W, H)
  // il disegno sopra
  r.drawImage(art, 0, 0, W, H, 0, 0, W, H)
  c.drawImage(rim, 0, 0, W, H, box.left - pad, box.top - pad, W / k, H / k)
}

// Disegna attorno a (x, y): da ritagliare nel cartone se l'impostazione è accesa, altrimenti così com'è.
export function cutout(c: CanvasRenderingContext2D, x: number, y: number, box: Box, draw: (c: CanvasRenderingContext2D) => void) {
  c.save()
  c.translate(x, y)
  if (settings.cardboard) cardboard(c, box, draw)
  else draw(c)
  c.restore()
}
