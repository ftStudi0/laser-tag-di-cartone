import type { Kind, Theme } from './targets.ts'
import { star } from './stage.ts'
import { t } from './i18n.ts'

export const THEMES: Record<Theme, string> = { palloncini: t('Palloncini'), stelle: t('Stelle'), mostri: t('Mostriciattoli'), lattine: t('Lattine'), zombi: t('Zombi buffi') }
export const TINTS = ['#ff5a5f', '#3d8bfd', '#2ec27e', '#a66cff']
export const GOLD = '#ffc531'
const OUT = 'rgba(40,30,60,0.55)'

type C = CanvasRenderingContext2D

function eye(c: C, x: number, y: number, r: number) {
  c.fillStyle = '#fff'
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#2b2340'
  c.beginPath()
  c.arc(x, y + r * 0.15, r * 0.55, 0, Math.PI * 2)
  c.fill()
}

function smile(c: C, x: number, y: number, r: number) {
  c.strokeStyle = '#2b2340'
  c.lineWidth = Math.max(1.5, r * 0.25)
  c.lineCap = 'round'
  c.beginPath()
  c.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI)
  c.stroke()
}

function kitten(c: C, x: number, y: number, r: number) {
  c.fillStyle = '#ffab4c'
  c.strokeStyle = OUT
  c.lineWidth = r * 0.07
  c.beginPath()
  c.moveTo(x - r * 0.8, y - r * 0.2)
  c.lineTo(x - r * 0.7, y - r * 1.05)
  c.lineTo(x - r * 0.2, y - r * 0.7)
  c.moveTo(x + r * 0.8, y - r * 0.2)
  c.lineTo(x + r * 0.7, y - r * 1.05)
  c.lineTo(x + r * 0.2, y - r * 0.7)
  c.fill()
  c.stroke()
  c.beginPath()
  c.arc(x, y, r * 0.85, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  c.fillStyle = '#2b2340'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(x + s * r * 0.32, y - r * 0.1, r * 0.11, r * 0.17, 0, 0, Math.PI * 2)
    c.fill()
  }
  c.fillStyle = '#ff6fb5'
  c.beginPath()
  c.moveTo(x - r * 0.1, y + r * 0.12)
  c.lineTo(x + r * 0.1, y + r * 0.12)
  c.lineTo(x, y + r * 0.24)
  c.fill()
  c.strokeStyle = '#2b2340'
  c.lineWidth = Math.max(1, r * 0.03)
  c.beginPath()
  for (const s of [-1, 1]) {
    c.moveTo(x + s * r * 0.25, y + r * 0.2)
    c.lineTo(x + s * r * 0.85, y + r * 0.1)
    c.moveTo(x + s * r * 0.25, y + r * 0.28)
    c.lineTo(x + s * r * 0.85, y + r * 0.35)
  }
  c.stroke()
  // cuoricino sopra: è un amico
  c.fillStyle = '#ff5a8a'
  const hy = y - r * 1.25, hs = r * 0.2
  c.beginPath()
  c.moveTo(x, hy + hs)
  c.bezierCurveTo(x - hs * 2, hy - hs * 0.5, x - hs * 0.5, hy - hs * 1.6, x, hy - hs * 0.4)
  c.bezierCurveTo(x + hs * 0.5, hy - hs * 1.6, x + hs * 2, hy - hs * 0.5, x, hy + hs)
  c.fill()
}

function balloon(c: C, x: number, y: number, r: number, col: string) {
  c.strokeStyle = 'rgba(255,255,255,0.8)'
  c.lineWidth = Math.max(1, r * 0.04)
  c.beginPath()
  c.moveTo(x, y + r * 0.95)
  c.quadraticCurveTo(x + r * 0.25, y + r * 1.3, x - r * 0.05, y + r * 1.7)
  c.stroke()
  c.fillStyle = col
  c.strokeStyle = OUT
  c.lineWidth = r * 0.06
  c.beginPath()
  c.ellipse(x, y, r * 0.82, r, 0, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  c.beginPath()
  c.moveTo(x, y + r * 0.95)
  c.lineTo(x - r * 0.12, y + r * 1.12)
  c.lineTo(x + r * 0.12, y + r * 1.12)
  c.fill()
  c.fillStyle = 'rgba(255,255,255,0.5)'
  c.beginPath()
  c.ellipse(x - r * 0.32, y - r * 0.4, r * 0.15, r * 0.28, -0.4, 0, Math.PI * 2)
  c.fill()
}

function starTarget(c: C, x: number, y: number, r: number, col: string, t: number) {
  c.fillStyle = col
  c.strokeStyle = OUT
  c.lineWidth = r * 0.07
  c.lineJoin = 'round'
  star(c, x, y + r * 0.08, r * 1.08, Math.sin(t * 2) * 0.12)
  c.fill()
  c.stroke()
  eye(c, x - r * 0.2, y, r * 0.13)
  eye(c, x + r * 0.2, y, r * 0.13)
  smile(c, x, y + r * 0.12, r * 0.15)
}

function monster(c: C, x: number, y: number, r: number, col: string, t: number) {
  c.fillStyle = col
  c.strokeStyle = OUT
  c.lineWidth = r * 0.06
  c.beginPath()
  c.moveTo(x - r * 0.55, y - r * 0.65)
  c.lineTo(x - r * 0.45, y - r * 1.1)
  c.lineTo(x - r * 0.2, y - r * 0.8)
  c.moveTo(x + r * 0.55, y - r * 0.65)
  c.lineTo(x + r * 0.45, y - r * 1.1)
  c.lineTo(x + r * 0.2, y - r * 0.8)
  c.fill()
  c.stroke()
  c.beginPath()
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2
    const rr = r * (0.92 + 0.06 * Math.sin(a * 5 + t * 4))
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  c.fill()
  c.stroke()
  eye(c, x, y - r * 0.2, r * 0.32)
  c.fillStyle = '#2b2340'
  c.beginPath()
  c.ellipse(x, y + r * 0.42, r * 0.32, r * 0.16, 0, 0, Math.PI)
  c.fill()
  c.fillStyle = '#fff'
  c.fillRect(x - r * 0.12, y + r * 0.42, r * 0.1, r * 0.1)
  c.fillRect(x + r * 0.04, y + r * 0.42, r * 0.1, r * 0.1)
}

function can(c: C, x: number, y: number, r: number, col: string) {
  const w = r * 0.62, h = r * 0.95
  c.strokeStyle = OUT
  c.lineWidth = r * 0.06
  c.fillStyle = '#d9dde3'
  c.beginPath()
  c.roundRect(x - w, y - h, w * 2, h * 2, r * 0.15)
  c.fill()
  c.stroke()
  c.fillStyle = col
  c.fillRect(x - w, y - h * 0.6, w * 2, h * 1.2)
  c.fillStyle = 'rgba(255,255,255,0.85)'
  star(c, x, y, r * 0.32)
  c.fill()
  c.fillStyle = 'rgba(255,255,255,0.35)'
  c.fillRect(x - w * 0.7, y - h, w * 0.25, h * 2)
  c.fillStyle = '#b8bec7'
  c.beginPath()
  c.ellipse(x, y - h, w, r * 0.13, 0, 0, Math.PI * 2)
  c.fill()
  c.stroke()
}

export const ZSKIN = ['#9ad97a', '#b9a3ff', '#7fd6c8', '#c8e07a']
export const ZSHIRT = ['#ff9f1c', '#3d8bfd', '#ff6fb5', '#2ec27e']
export const ZPANTS = '#5b4a8b'

// Zombi buffo visto di fronte, con i piedi in (x, footY) e alto h pixel. Nessun sangue, nessuna faccia paurosa.
export function drawZombie(c: C, x: number, footY: number, h: number, t: number, kind: Kind, tint: number, speed = 1) {
  const u = h / 100
  const Y = (y: number) => footY - y * u
  const ph = t * 6 * speed
  const bob = Math.abs(Math.sin(ph)) * 2
  const lw = Math.max(1, 2 * u)
  const shape = (fill: string, draw: () => void) => {
    c.fillStyle = fill
    c.strokeStyle = OUT
    c.lineWidth = lw
    c.beginPath()
    draw()
    c.fill()
    c.stroke()
  }
  c.fillStyle = 'rgba(0,0,0,0.22)'
  c.beginPath()
  c.ellipse(x, footY, 24 * u, 5 * u, 0, 0, Math.PI * 2)
  c.fill()
  if (kind === 'dorato') {
    const g = c.createRadialGradient(x, Y(60), 10 * u, x, Y(60), 70 * u)
    g.addColorStop(0, 'rgba(255,230,120,0.6)')
    g.addColorStop(1, 'rgba(255,230,120,0)')
    c.fillStyle = g
    c.fillRect(x - 70 * u, Y(130), 140 * u, 140 * u)
  }
  for (const s of [-1, 1]) {
    const lift = Math.max(0, Math.sin(ph) * s) * 5
    shape(ZPANTS, () => c.roundRect(x + s * 10 * u - 6 * u, Y(46 + bob), 12 * u, (46 - lift) * u, 4 * u))
    shape('#2b2340', () => c.ellipse(x + s * 11 * u, Y(lift + 2), 8 * u, 4 * u, 0, 0, Math.PI * 2))
  }
  const shirt = kind === 'dorato' ? GOLD : ZSHIRT[tint % 4]
  const skin = ZSKIN[tint % 4]
  shape(shirt, () => c.roundRect(x - 18 * u, Y(74 + bob), 36 * u, 32 * u, 8 * u))
  shape('rgba(255,255,255,0.55)', () => c.roundRect(x + 4 * u, Y(60 + bob), 8 * u, 8 * u, 2 * u)) // toppa
  for (const s of [-1, 1]) {
    const sw = Math.sin(ph + (s > 0 ? Math.PI : 0)) * 3
    shape(skin, () => c.roundRect(Math.min(x + s * 14 * u, x + s * 30 * u), Y(71 + bob + sw), 16 * u, 9 * u, 4 * u))
    shape(skin, () => c.arc(x + s * 31 * u, Y(67 + bob + sw), 5.5 * u, 0, Math.PI * 2))
  }
  shape(skin, () => c.arc(x, Y(88 + bob), 18 * u, 0, Math.PI * 2))
  c.strokeStyle = '#2b2340'
  c.lineWidth = lw
  c.beginPath()
  for (const dx of [-5, 0, 5]) {
    c.moveTo(x + dx * u, Y(104 + bob))
    c.lineTo(x + (dx + 2) * u, Y(110 + bob))
  }
  c.stroke()
  if (kind === 'veloce') shape('#ff5a5f', () => c.rect(x - 18 * u, Y(99 + bob), 36 * u, 5 * u))
  if (kind === 'dorato')
    shape(GOLD, () => {
      const b = Y(103 + bob)
      c.moveTo(x - 11 * u, b)
      c.lineTo(x - 13 * u, b - 12 * u)
      c.lineTo(x - 6 * u, b - 6 * u)
      c.lineTo(x, b - 14 * u)
      c.lineTo(x + 6 * u, b - 6 * u)
      c.lineTo(x + 13 * u, b - 12 * u)
      c.lineTo(x + 11 * u, b)
      c.closePath()
    })
  // occhi storti e sorriso con un dentino
  const wob = Math.sin(t * 3) * 1.2 * u
  eye(c, x - 7 * u, Y(91 + bob), 6.5 * u)
  eye(c, x + 8 * u, Y(90 + bob) + wob, 4.5 * u)
  c.strokeStyle = '#2b2340'
  c.lineWidth = lw * 1.3
  c.lineCap = 'round'
  c.beginPath()
  c.arc(x, Y(84 + bob), 7 * u, 0.2 * Math.PI, 0.8 * Math.PI)
  c.stroke()
  c.fillStyle = '#fff'
  c.fillRect(x - 3 * u, Y(78 + bob), 3.5 * u, 3.5 * u)
}

export function drawTarget(c: C, theme: Theme, kind: Kind, tint: number, x: number, y: number, r: number, t: number) {
  if (theme === 'zombi') return drawZombie(c, x, y + r * 1.4, r * 2.8, t, kind, tint)
  if (kind === 'amico') return kitten(c, x, y, r)
  const col = kind === 'dorato' ? GOLD : TINTS[tint % 4]
  if (kind === 'dorato') {
    const g = c.createRadialGradient(x, y, r * 0.5, x, y, r * 1.7)
    g.addColorStop(0, 'rgba(255,230,120,0.7)')
    g.addColorStop(1, 'rgba(255,230,120,0)')
    c.fillStyle = g
    c.beginPath()
    c.arc(x, y, r * 1.7, 0, Math.PI * 2)
    c.fill()
  }
  if (kind === 'veloce') {
    // alette che sbattono
    c.fillStyle = 'rgba(255,255,255,0.9)'
    c.strokeStyle = OUT
    c.lineWidth = r * 0.05
    const flap = Math.sin(t * 18) * 0.35
    for (const s of [-1, 1]) {
      c.beginPath()
      c.ellipse(x + s * r * 1.05, y - r * 0.2, r * 0.45, r * 0.22, s * (0.5 + flap), 0, Math.PI * 2)
      c.fill()
      c.stroke()
    }
  }
  if (theme === 'palloncini') balloon(c, x, y, r, col)
  else if (theme === 'stelle') starTarget(c, x, y, r, col, t)
  else if (theme === 'mostri') monster(c, x, y, r, col, t)
  else can(c, x, y, r, col)
  if (kind === 'dorato') {
    c.fillStyle = '#fff'
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + (i * Math.PI * 2) / 3
      star(c, x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.25, r * 0.16)
      c.fill()
    }
  }
}
