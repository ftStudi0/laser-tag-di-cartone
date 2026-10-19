import { play } from './audio.ts'
import { D } from './math.ts'
import { sensors } from './sensors.ts'
import { hud, say } from './stage.ts'

// Grilletto conduttivo: qualsiasi tocco è uno sparo, tranne sui pulsanti.
// Debounce di 150 ms per i rimbalzi della striscia e niente spari extra con più dita.
export function onTrigger(el: HTMLElement, fire: (x: number, y: number) => void) {
  const down = new Set<number>()
  let last = -1e9
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest('button, input, select, label, a')) return
    if (e.isPrimary) down.clear() // nessun altro dito giù: ripulisce eventuali pointerup persi
    down.add(e.pointerId)
    downAt ||= performance.now()
    e.preventDefault()
    if (down.size > 1) return
    const now = performance.now()
    if (now - last < 150) return
    last = now
    fire(e.clientX, e.clientY)
  }
  const onUp = (e: PointerEvent) => {
    down.delete(e.pointerId)
    if (!down.size) downAt = 0
  }
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  return () => {
    downAt = 0
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
  }
}

// Da quanto tempo il grilletto è tenuto premuto (0 se è lasciato).
let downAt = 0
export const holdMs = () => (downAt ? performance.now() - downAt : 0)
export const RELOAD_PITCH = 60 * D
export const HOLD_MS = 5000

// Ricarica: fucile alzato oltre 60 gradi per mezzo secondo, oppure grilletto tenuto premuto 5 secondi
// (per i telefoni che non sentono bene l'inclinazione).
export function reloader(full: () => boolean, done: () => void) {
  let upSince = 0
  const clear = () => {
    const t = hud.querySelector('.hud-msg')?.textContent ?? ''
    if (t === 'Ricarica...' || t.startsWith('Tieni premuto')) say('')
  }
  return (now: number) => {
    const up = sensors.pitch > RELOAD_PITCH
    upSince = up ? upSince || now : 0
    const held = holdMs()
    if (full()) return clear()
    if ((up && now - upSince > 500) || held >= HOLD_MS) {
      done()
      play('reload')
      say('Carico!', 800)
    } else if (up) say('Ricarica...', 0)
    else if (held > 800) say(`Tieni premuto... ${Math.ceil((HOLD_MS - held) / 1000)}`, 0)
    else clear()
  }
}
