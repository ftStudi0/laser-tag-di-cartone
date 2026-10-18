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
