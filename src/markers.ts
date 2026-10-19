import { D, inPoly } from './math.ts'
import { settings } from './settings.ts'
import { aimPoint, size, video } from './stage.ts'

// Lato del quadrato nero stampato, in metri (vedi la pagina Stampa i marker).
export const MARKER_M = 0.144
// I marker dei giocatori sono i numeri da 1 in su (id del dizionario da 0).
export type Marker = { num: number; pts: [number, number][]; side: number } // pts in px dello schermo, side in px del video

const CROP_W = 640
const CROP_H = 480

// Analizza di continuo il ritaglio centrale del video (attorno al mirino) a risoluzione piena.
export function createDetector(fps = 15) {
  const worker = new Worker(new URL('./marker.worker.ts', import.meta.url), { type: 'module' })
  const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  const state = { markers: [] as Marker[], at: 0, fps: 0, ms: 0 }
  let busy = false
  let sentAt = 0
  let geo = { sx: 0, sy: 0, scale: 1, vw: 1, vh: 1 }
  let waiters: ((m: Marker[]) => void)[] = []

  const toScreen = (u: number, v: number, g: typeof geo): [number, number] => [
    (u - g.vw / 2) * g.scale + size.w / 2,
    (v - g.vh / 2) * g.scale + size.h / 2,
  ]

  worker.onmessage = (e: MessageEvent<{ markers: { id: number; c: [number, number][] }[]; ms: number }>) => {
    busy = false
    const g = geo
    state.markers = e.data.markers.map((m) => ({
      num: m.id + 1,
      pts: m.c.map(([x, y]) => toScreen(x + g.sx, y + g.sy, g)),
      side: m.c.reduce((s, p, i) => s + Math.hypot(p[0] - m.c[(i + 1) % 4][0], p[1] - m.c[(i + 1) % 4][1]), 0) / 4,
    }))
    const now = performance.now()
    state.fps += (1000 / Math.max(1, now - state.at) - state.fps) * 0.2
    state.at = sentAt
    state.ms = e.data.ms
    waiters.forEach((w) => w(state.markers))
    waiters = []
  }

  function send() {
    const vw = video.videoWidth, vh = video.videoHeight
    if (!vw || busy) return
    const scale = Math.max(size.w / vw, size.h / vh)
    const [ax, ay] = aimPoint()
    const w = Math.min(CROP_W, vw), h = Math.min(CROP_H, vh)
    const u = (ax - size.w / 2) / scale + vw / 2, v = (ay - size.h / 2) / scale + vh / 2
    const sx = Math.round(Math.max(0, Math.min(vw - w, u - w / 2)))
    const sy = Math.round(Math.max(0, Math.min(vh - h, v - h / 2)))
    if (c.canvas.width !== w || c.canvas.height !== h) Object.assign(c.canvas, { width: w, height: h })
    c.drawImage(video, sx, sy, w, h, 0, 0, w, h)
    const data = c.getImageData(0, 0, w, h).data
    geo = { sx, sy, scale, vw, vh }
    busy = true
    sentAt = performance.now()
    worker.postMessage({ w, h, data }, [data.buffer]) // il ritaglio resta sul telefono: va solo al worker
  }

  return {
    state,
    tick(now: number) {
      if (now - sentAt >= 1000 / fps) send()
    },
    // Risultato fresco per lo sparo: l'ultimo se ha meno di 100 ms, altrimenti si analizza il frame attuale.
    fresh(): Promise<Marker[]> {
      if (performance.now() - state.at < 100) return Promise.resolve(state.markers)
      return new Promise((res) => {
        waiters.push(res)
        send()
      })
    },
    dispose() {
      worker.terminate()
      waiters.forEach((w) => w([]))
    },
  }
}
export type Detector = ReturnType<typeof createDetector>

export const markerUnder = (ms: Marker[], x: number, y: number) => ms.find((m) => inPoly(m.pts, x, y, settings.tol)) ?? null

// Distanza stimata dalla dimensione in pixel del marker.
export function distanceOf(m: Marker) {
  const vw = Math.max(video.videoWidth, video.videoHeight) || 1280
  const f = vw / 2 / Math.tan((settings.fov * D) / 2)
  return (f * MARKER_M) / m.side
}

export function drawMarker(c: CanvasRenderingContext2D, m: Marker, color: string, width = 4) {
  c.save()
  c.lineJoin = 'round'
  c.strokeStyle = color
  c.lineWidth = width
  c.beginPath()
  m.pts.forEach(([x, y]) => c.lineTo(x, y))
  c.closePath()
  c.stroke()
  c.restore()
}
