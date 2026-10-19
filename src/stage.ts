import { viewFor } from './math.ts'
import { screenAngle } from './sensors.ts'
import { settings } from './settings.ts'

// Lo "stage" è il video della fotocamera a tutto schermo, con sopra un canvas e la HUD.
const el = document.getElementById('stage')!
export const video = el.querySelector('video')!
const canvas = el.querySelector('canvas')!
export const hud = el.querySelector<HTMLElement>('.hud')!
export const ctx = canvas.getContext('2d')!
export const size = { w: 0, h: 0 }

let stream: MediaStream | null = null
let lock: any = null
let awake = false

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  size.w = innerWidth
  size.h = innerHeight
  canvas.width = Math.round(size.w * dpr)
  canvas.height = Math.round(size.h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
addEventListener('resize', resize)

// iPhone: due tocchi veloci fanno scorrere o ingrandire la pagina e sotto resta una fascia nera.
// Si blocca il gesto (non i pulsanti) e, se la pagina si è spostata lo stesso, si rimette a posto.
el.addEventListener('touchend', (e) => {
  if (!(e.target as Element).closest('button, input, select, label, a')) e.preventDefault()
}, { passive: false })
el.addEventListener('dblclick', (e) => e.preventDefault())
const unshift = () => {
  if (!el.hidden && (scrollY || visualViewport?.offsetTop)) scrollTo(0, 0)
}
visualViewport?.addEventListener('scroll', unshift)
addEventListener('scroll', unshift)

async function startCamera() {
  if (stream?.getVideoTracks()[0]?.readyState === 'live') return
  // le immagini restano qui: il video va solo sullo schermo, non viene mai inviato o salvato
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  })
  video.srcObject = stream
  await video.play().catch(() => {})
}

async function keepAwake() {
  try {
    lock = await (navigator as any).wakeLock?.request('screen')
  } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || el.hidden) return
  if (awake) keepAwake()
  startCamera().catch(() => {}) // su iPhone la fotocamera si ferma quando l'app va in background
})

export async function openStage(withCamera = true) {
  el.hidden = false
  document.body.classList.add('in-stage')
  resize()
  awake = true
  keepAwake()
  if (withCamera) await startCamera()
}

export function closeStage() {
  el.hidden = true
  document.body.classList.remove('in-stage')
  hud.innerHTML = ''
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  video.srcObject = null
  awake = false
  lock?.release?.().catch?.(() => {})
  lock = null
  fx.length = 0
}

export const view = (fov = settings.fov) => viewFor(size.w, size.h, video.videoWidth || 1280, video.videoHeight || 720, fov)
export const videoSize = () => [video.videoWidth || 1280, video.videoHeight || 720]
export const aimPoint = (): [number, number] => [size.w / 2 + settings.offX, size.h / 2 + settings.offY]
// Con il telefono girato di 90 gradi in senso antiorario la fotocamera è a sinistra.
export const cameraLeft = () => screenAngle() === 90

export function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}

let chR = 22
export function drawCrosshair(x: number, y: number, locked: boolean, color: string) {
  chR += ((locked ? 13 : 22) - chR) * 0.35
  const r = chR
  ctx.save()
  ctx.lineCap = 'round'
  for (const [w, c] of [[6, 'rgba(0,0,0,0.45)'], [3, locked ? color : '#fff']] as const) {
    ctx.lineWidth = w
    ctx.strokeStyle = c
    ctx.beginPath()
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4
      ctx.moveTo(x + Math.cos(a - 0.5) * r, y + Math.sin(a - 0.5) * r)
      ctx.arc(x, y, r, a - 0.5, a + 0.5)
      ctx.moveTo(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6))
      ctx.lineTo(x + Math.cos(a) * (r + 12), y + Math.sin(a) * (r + 12))
    }
    ctx.stroke()
  }
  ctx.fillStyle = locked ? color : '#fff'
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, locked ? 5 : 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

// Effetti: ognuno disegna se stesso dato l'avanzamento k da 0 a 1.
type Fx = { t0: number; dur: number; draw: (k: number) => void }
const fx: Fx[] = []
const add = (dur: number, draw: (k: number) => void) => fx.push({ t0: performance.now(), dur, draw })

export function drawFx() {
  const now = performance.now()
  for (let i = fx.length - 1; i >= 0; i--) {
    const k = (now - fx[i].t0) / fx[i].dur
    if (k >= 1) fx.splice(i, 1)
    else {
      ctx.save()
      fx[i].draw(Math.max(0, k))
      ctx.restore()
    }
  }
}

// Raggio laser dal bordo in basso (lato opposto alla fotocamera) al mirino: 120 ms pieno, poi svanisce in 150 ms.
export function beamFx(color: string) {
  const [ex, ey] = aimPoint()
  const sx = size.w / 2 + (cameraLeft() ? 1 : -1) * size.w * 0.12
  const sy = size.h + 10
  add(270, (k) => {
    const ms = k * 270
    const a = ms < 120 ? 1 : 1 - (ms - 120) / 150
    const len = Math.min(1, ms / 40)
    const x = sx + (ex - sx) * len, y = sy + (ey - sy) * len
    const nx = -(ey - sy), ny = ex - sx
    const n = Math.hypot(nx, ny) || 1
    ctx.globalCompositeOperation = 'lighter'
    for (const [w0, w1, alpha, col] of [[34, 10, 0.35, color], [14, 4, 0.9, color], [5, 1.5, 1, '#ffffff']] as const) {
      const g = ctx.createLinearGradient(sx, sy, ex, ey)
      g.addColorStop(0, rgba(col, 0))
      g.addColorStop(0.35, rgba(col, alpha * a))
      g.addColorStop(1, rgba(col, alpha * a))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(sx + (nx / n) * w0, sy + (ny / n) * w0)
      ctx.lineTo(x + (nx / n) * w1, y + (ny / n) * w1)
      ctx.lineTo(x - (nx / n) * w1, y - (ny / n) * w1)
      ctx.lineTo(sx - (nx / n) * w0, sy - (ny / n) * w0)
      ctx.fill()
    }
  })
}

export function sparkFx(x: number, y: number) {
  const rays = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2 + Math.random() * 0.4)
  add(250, (k) => {
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(255,240,180,${1 - k})`
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const a of rays) {
      ctx.moveTo(x + Math.cos(a) * (6 + 24 * k), y + Math.sin(a) * (6 + 24 * k))
      ctx.lineTo(x + Math.cos(a) * (12 + 34 * k), y + Math.sin(a) * (12 + 34 * k))
    }
    ctx.stroke()
    ctx.fillStyle = `rgba(255,255,255,${1 - k})`
    ctx.beginPath()
    ctx.arc(x, y, 10 * (1 - k), 0, Math.PI * 2)
    ctx.fill()
  })
}

export function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
  c.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2
    const rr = i % 2 ? r * 0.45 : r
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  c.closePath()
}

// Stelline e coriandoli al colpo a segno.
export function burstFx(x: number, y: number, colors: string[]) {
  const ps = Array.from({ length: 18 }, (_, i) => {
    const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220
    return { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, c: colors[i % colors.length], s: 5 + Math.random() * 6, star: i % 2 === 0 }
  })
  add(750, (k) => {
    const t = k * 0.75
    ctx.globalAlpha = 1 - k * k
    for (const p of ps) {
      const px = x + p.vx * t, py = y + p.vy * t + 400 * t * t
      ctx.fillStyle = p.c
      if (p.star) star(ctx, px, py, p.s, t * 8)
      else {
        ctx.beginPath()
        ctx.rect(px - p.s / 2, py - p.s / 4, p.s, p.s / 2)
      }
      ctx.fill()
    }
  })
}

export function textFx(x: number, y: number, text: string, color: string) {
  add(850, (k) => {
    ctx.globalAlpha = 1 - k * k
    ctx.font = "800 32px 'Baloo 2 Variable', ui-rounded, system-ui, sans-serif"
    ctx.textAlign = 'center'
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.fillStyle = color
    ctx.strokeText(text, x, y - 30 - 50 * k)
    ctx.fillText(text, x, y - 30 - 50 * k)
  })
}

export function hitmarkerFx(x: number, y: number) {
  add(220, (k) => {
    ctx.globalAlpha = 1 - k
    ctx.lineCap = 'round'
    for (const [w, c] of [[6, 'rgba(0,0,0,0.5)'], [3, '#fff']] as const) {
      ctx.lineWidth = w
      ctx.strokeStyle = c
      ctx.beginPath()
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4
        ctx.moveTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9)
        ctx.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20)
      }
      ctx.stroke()
    }
  })
}

// Messaggio grande al centro della HUD; ms = 0 lo lascia finché non viene cambiato.
let msgTimer = 0
export function say(text: string, ms = 0, cls = '') {
  const m = hud.querySelector<HTMLElement>('.hud-msg')
  if (!m) return
  clearTimeout(msgTimer)
  m.textContent = text
  m.className = 'hud-msg ' + cls
  m.hidden = !text
  if (ms) msgTimer = window.setTimeout(() => (m.hidden = true), ms)
}
