// Piccoli aiuti per disegnare le schermate dei menu.
export const app = document.getElementById('app')!

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function render(html: string) {
  app.innerHTML = html
  app.querySelectorAll('.seg button, .card').forEach((b) => b.setAttribute('aria-pressed', String(b.classList.contains('on'))))
  app.scrollTop = 0
  scrollTo(0, 0)
}

export const on = (sel: string, fn: (el: HTMLElement) => void) =>
  app.querySelectorAll<HTMLElement>(sel).forEach((el) => el.addEventListener('click', () => fn(el)))

// Su Android: schermo intero e orizzontale. Su iPhone non c'è, serve la PWA.
export function goFullscreen() {
  const d = document.documentElement
  if (document.fullscreenElement || !d.requestFullscreen) return
  d.requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as any)?.lock?.('landscape'))
    .catch(() => {})
}
