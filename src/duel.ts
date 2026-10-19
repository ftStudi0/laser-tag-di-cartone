import { play } from './audio.ts'
import { icon } from './icons.ts'
import { D, dirFrom, project } from './math.ts'
import { sensors } from './sensors.ts'
import { settings } from './settings.ts'
import {
  aimPoint, beamFx, burstFx, closeStage, ctx, drawCrosshair, drawFx, hitmarkerFx, hud, openStage, say, size, sparkFx, textFx, view,
} from './stage.ts'
import type { Diff } from './targets.ts'
import { onTrigger } from './trigger.ts'

// Duello nel Far West contro il bandito Baffone: alla campana spunta, e bisogna colpirlo prima che spruzzi.
// Millisecondi che Baffone aspetta prima di spruzzare, al primo round; poi ogni round è un po' più svelto.
const WAIT: Record<Diff, number> = { facile: 1500, media: 1050, difficile: 750 }
const WIN = 3 // vince chi arriva prima a 3
const DIST = 6 // metri
const HEIGHT = 1.7
const BODY = { y: 1.05, r: 0.42 } // centro e raggio della zona da colpire
const KEY = 'lt:duel:best'

export type DuelResult = { me: number; bot: number; won: boolean; best: number; record: number }

export function loadDuelRecord(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

export async function playDuel(diff: Diff, onEnd: (r: DuelResult | null) => void) {
  let phase: 'mira' | 'attesa' | 'duello' | 'esito' | 'fine' = 'mira'
  let yaw0 = 0
  let me = 0, bot = 0, round = 0, best = 0
  let bellAt = 0, readyShown = false, limit = 0
  let az = 0
  let look: 'pronto' | 'preso' | 'spruzza' = 'pronto'
  let lookAt = 0
  let raf = 0
  let timer = 0
  const H = settings.gunH

  hud.innerHTML = `
    <div class="hud-tr"><button class="hud-btn" data-a="esci" aria-label="Esci">${icon('close')}</button></div>
    <div class="hud-ml pill"><b data-me>0</b><small>tu</small></div>
    <div class="hud-mr pill"><b data-bot>0</b><small>Baffone</small></div>
    <div class="hud-flash" data-flash style="--fc:#3d8bfd"></div>
    <div class="hud-msg" hidden></div>
    <div class="hud-full" data-portrait hidden>Gira il telefono in orizzontale</div>`
  const $ = (s: string) => hud.querySelector<HTMLElement>(`[data-${s}]`)!
  hud.querySelector('[data-a="esci"]')!.addEventListener('click', () => finish(true))
  const offTrigger = onTrigger(document.getElementById('stage')!, fire)

  try {
    await openStage()
  } catch {
    finish(true)
    alert('Non riesco ad aprire la fotocamera. Controlla il permesso nelle impostazioni del browser.')
    return
  }
  if (phase !== 'mira') return
  say('Punta il fucile davanti a te e premi il grilletto')
  raf = requestAnimationFrame(frame)

  function startRound() {
    phase = 'attesa'
    look = 'pronto'
    readyShown = false
    az = (Math.random() * 2 - 1) * 20 * D
    bellAt = performance.now() + 2500 + Math.random() * 3000 // attesa a caso: non si può indovinare
    limit = WAIT[diff] * 0.92 ** round
    say('Pronti...', 0, 'huge')
  }

  function next() {
    phase = 'esito'
    $('me').textContent = String(me)
    $('bot').textContent = String(bot)
    timer = window.setTimeout(() => {
      if (me >= WIN || bot >= WIN) return finish(false)
      round++
      startRound()
    }, 2200)
  }

  // Il punto da colpire (la pancia di Baffone) sullo schermo, con il raggio in pixel.
  function body() {
    const h = dirFrom(yaw0 + az, 0)
    const p = project(sensors.q, [h[0] * DIST, BODY.y - H, h[2] * DIST], view())
    return p && { x: p.x, y: p.y, r: (view().f * BODY.r) / p.depth }
  }

  function fire() {
    const now = performance.now()
    if (size.h > size.w) return
    if (phase === 'mira') {
      yaw0 = sensors.yaw
      phase = 'esito'
      say('Bene! Arriva Baffone...', 1200)
      timer = window.setTimeout(startRound, 1400)
      return
    }
    if (phase === 'attesa') {
      bot++
      play('oops')
      say('Troppo presto! Il round va a Baffone', 2000, 'warn')
      return next()
    }
    if (phase !== 'duello') return
    play('pew')
    beamFx(settings.color)
    const [ax, ay] = aimPoint()
    const b = body()
    if (!b || Math.hypot(b.x - ax, b.y - ay) > b.r * (1 + settings.tol)) return sparkFx(ax, ay)
    const ms = Math.round(now - bellAt)
    me++
    best = best ? Math.min(best, ms) : ms
    look = 'preso'
    lookAt = now
    play('hit')
    burstFx(ax, ay, [settings.color, '#ffd23f', '#ffffff', '#c98a4b'])
    hitmarkerFx(ax, ay)
    textFx(ax, ay, `${ms} ms`, '#ffffff')
    say(['Preso! Gli è volato il cappello', 'Che riflessi!', 'Più veloce del vento!'][me % 3], 1800)
    next()
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    $('portrait').hidden = size.w >= size.h
    if (phase === 'attesa' && !readyShown && now > bellAt - 1300) {
      readyShown = true
      say('Attenti...', 0, 'huge')
    }
    if (phase === 'attesa' && now >= bellAt) {
      phase = 'duello'
      play('bell')
      say('Ora!', 600, 'huge')
    }
    if (phase === 'duello' && now - bellAt > limit) {
      bot++
      look = 'spruzza'
      lookAt = now
      play('splash')
      navigator.vibrate?.([60, 40, 60])
      say('Splash! Baffone è stato più veloce', 2000, 'warn')
      next()
    }
    $('flash').style.opacity = look === 'spruzza' ? String(Math.max(0, 0.6 - (now - lookAt) / 900)) : '0'

    ctx.clearRect(0, 0, size.w, size.h)
    const show = phase === 'duello' || (phase === 'esito' && look !== 'pronto')
    if (show) drawBaffone(now)
    drawFx()
    const [ax, ay] = aimPoint()
    const b = phase === 'duello' ? body() : null
    drawCrosshair(ax, ay, !!b && Math.hypot(b.x - ax, b.y - ay) <= b.r * (1 + settings.tol), settings.color)
  }

  function drawBaffone(now: number) {
    const h = dirFrom(yaw0 + az, 0)
    const v = view()
    const feet = project(sensors.q, [h[0] * DIST, -H, h[2] * DIST], v)
    const head = project(sensors.q, [h[0] * DIST, HEIGHT - H, h[2] * DIST], v)
    if (!feet || !head) return
    // spunta dal basso in un attimo
    const up = phase === 'duello' ? Math.min(1, (now - bellAt) / 120) : 1
    ctx.save()
    ctx.translate(feet.x, feet.y)
    ctx.scale(up, up)
    bandit(ctx, feet.y - head.y, look, (now - lookAt) / 1000)
    ctx.restore()
  }

  function finish(aborted: boolean) {
    if (phase === 'fine') return
    phase = 'fine'
    cancelAnimationFrame(raf)
    clearTimeout(timer)
    offTrigger()
    closeStage()
    if (aborted) return onEnd(null)
    play('end')
    let record = loadDuelRecord()
    if (best && (!record || best < record)) {
      record = best
      try {
        localStorage.setItem(KEY, String(best))
      } catch {}
    }
    onEnd({ me, bot, won: me > bot, best, record })
  }
}

// Baffone di cartone: cappello largo, baffoni, gilet e pistola ad acqua colorata. Disegnato con i piedi in (0, 0), alto h px.
function bandit(c: CanvasRenderingContext2D, h: number, look: 'pronto' | 'preso' | 'spruzza', t: number) {
  const u = h / 100
  c.lineJoin = 'round'
  c.lineWidth = Math.max(1.5, u * 1.2)
  c.strokeStyle = 'rgba(40,30,60,0.7)'
  const shape = (fill: string, f: () => void) => {
    c.fillStyle = fill
    c.beginPath()
    f()
    c.fill()
    c.stroke()
  }
  // gambe e stivali
  shape('#5b4a8b', () => {
    c.rect(-11 * u, -46 * u, 9 * u, 40 * u)
    c.rect(2 * u, -46 * u, 9 * u, 40 * u)
  })
  shape('#6b3f1f', () => {
    c.roundRect(-13 * u, -8 * u, 12 * u, 8 * u, 2 * u)
    c.roundRect(1 * u, -8 * u, 12 * u, 8 * u, 2 * u)
  })
  // camicia e gilet
  shape('#ffd23f', () => c.roundRect(-15 * u, -78 * u, 30 * u, 34 * u, 6 * u))
  shape('#a8743f', () => {
    c.roundRect(-15 * u, -78 * u, 11 * u, 34 * u, 5 * u)
    c.roundRect(4 * u, -78 * u, 11 * u, 34 * u, 5 * u)
  })
  // un fiore all'occhiello: è un bandito buffo
  shape('#ff6fb5', () => c.arc(-9 * u, -66 * u, 3 * u, 0, Math.PI * 2))
  // braccio con la pistola ad acqua, puntata verso di te
  shape('#ffd23f', () => c.roundRect(13 * u, -76 * u, 7 * u, 22 * u, 3 * u))
  shape('#2ec27e', () => c.roundRect(10 * u, -60 * u, 16 * u, 9 * u, 3 * u))
  shape('#ff9f1c', () => c.roundRect(12 * u, -54 * u, 6 * u, 9 * u, 2 * u))
  // fazzoletto al collo
  shape('#ff5a5f', () => {
    c.moveTo(-9 * u, -80 * u)
    c.lineTo(9 * u, -80 * u)
    c.lineTo(0, -71 * u)
    c.closePath()
  })
  // testa
  shape('#ffcc9a', () => c.arc(0, -88 * u, 10 * u, 0, Math.PI * 2))
  c.fillStyle = '#2a1f3d'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.arc(s * 4 * u, -90 * u, 1.6 * u, 0, Math.PI * 2)
    c.fill()
  }
  // baffoni a manubrio
  c.fillStyle = '#4a2f1b'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(s * 5 * u, -84 * u, 6 * u, 2.6 * u, s * -0.25, 0, Math.PI * 2)
    c.fill()
  }
  // cappello: vola via quando è preso
  c.save()
  if (look === 'preso') {
    const k = Math.min(1, t / 0.8)
    c.translate(8 * u * k, -40 * u * k)
    c.rotate(k * 1.2)
  }
  shape('#7a4a26', () => c.ellipse(0, -97 * u, 19 * u, 4 * u, 0, 0, Math.PI * 2))
  shape('#8f5a2e', () => c.roundRect(-9 * u, -112 * u, 18 * u, 15 * u, 5 * u))
  shape('#ff5a5f', () => c.rect(-9 * u, -101 * u, 18 * u, 3 * u))
  c.restore()
  // lo spruzzo d'acqua verso di te
  if (look === 'spruzza') {
    c.fillStyle = 'rgba(61,139,253,0.75)'
    for (let i = 0; i < 9; i++) {
      const d = (t * 3 + i * 0.11) % 1
      c.beginPath()
      c.arc((26 + d * 30) * u, (-56 + Math.sin(i * 2.1) * 6 * d) * u, (2 + d * 5) * u, 0, Math.PI * 2)
      c.fill()
    }
  }
}
