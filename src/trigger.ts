import { play } from './audio.ts'
import { COOL_MS } from './rules.ts'
import { say } from './stage.ts'
import { t } from './i18n.ts'

// Grilletto conduttivo: qualsiasi tocco è uno sparo, tranne sui pulsanti.
// Debounce di 150 ms per i rimbalzi della striscia e niente spari extra con più dita.
export function onTrigger(el: HTMLElement, fire: (x: number, y: number) => void) {
  const down = new Set<number>()
  let last = -1e9
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest('button, input, select, label, a')) return
    if (e.isPrimary) down.clear() // nessun altro dito giù: ripulisce eventuali pointerup persi
    down.add(e.pointerId)
    e.preventDefault()
    if (down.size > 1) return
    const now = performance.now()
    if (now - last < 150) return
    last = now
    fire(e.clientX, e.clientY)
  }
  const onUp = (e: PointerEvent) => down.delete(e.pointerId)
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  return () => {
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
  }
}

// Il fucile si scalda: dopo `max` colpi si ferma per COOL_MS, poi torna pronto da solo. max 0 = colpi infiniti.
export function heat(max: number) {
  let left = max
  let hotUntil = 0
  return {
    hot: () => !!max && left === 0,
    // consuma un colpo; false se il fucile scotta ancora
    take(now: number) {
      if (!max) return true
      if (left === 0) {
        if (now < hotUntil) return false
        left = max
      }
      if (--left === 0) {
        hotUntil = now + COOL_MS
        play('oops')
        say(t('Il fucile scotta! Si raffredda...'), COOL_MS, 'warn')
      }
      return true
    },
    tick(now: number) {
      if (max && left === 0 && now >= hotUntil) {
        left = max
        play('reload')
        say(t('Fucile pronto!'), 800)
      }
    },
    // barrette accese: mentre si raffredda si riaccendono poco a poco
    shown(now: number) {
      return left > 0 || !max ? left : Math.max(0, Math.min(max - 1, Math.floor(max * (1 - (hotUntil - now) / COOL_MS))))
    },
    reset() {
      left = max
      hotUntil = 0
    },
  }
}
