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
import { t } from './i18n.ts'

// Duello nel Far West contro il bandito Baffone: alla campana spunta, e bisogna colpirlo prima che tiri fuori la bandierina.
// In Difficile può passare anche la signora Rosina, che non va colpita. In Arcade si va avanti finché non si sbaglia.
// Millisecondi che Baffone aspetta prima della bandierina, al primo round; poi ogni round è un po' più svelto.
const WAIT: Record<Diff, number> = { facile: 1500, media: 1050, difficile: 750 }
const WIN = 3 // vince chi arriva prima a 3
const DIST = 6 // metri
const HEIGHT = 1.7
const BODY = { y: 1.05, r: 0.42 } // centro e raggio della zona da colpire
const KEY = 'lt:duel:best'
const ARCADE_KEY = 'lt:duel:arcade'

export type DuelResult = { me: number; bot: number; won: boolean; best: number; record: number; arcade: boolean; streakRecord: number; newSpeed: boolean; newStreak: boolean }

const readNum = (k: string) => {
  try {
    return Number(localStorage.getItem(k)) || 0
  } catch {
    return 0
  }
}
const writeNum = (k: string, v: number) => {
  try {
    localStorage.setItem(k, String(v))
  } catch {}
}
export const loadDuelRecord = () => readNum(KEY)
export const loadDuelArcade = () => readNum(ARCADE_KEY)

export async function playDuel(diff: Diff, arcade: boolean, onEnd: (r: DuelResult | null) => void) {
  let phase: 'mira' | 'attesa' | 'duello' | 'esito' | 'fine' = 'mira'
  let yaw0 = 0
  let me = 0, bot = 0, round = 0, best = 0
  let bellAt = 0, readyShown = false, limit = 0
  let az = 0, ladyAz = 0
  let who: 'baffone' | 'insieme' | 'rosina' = 'baffone' // chi spunta alla campana
  let look: 'pronto' | 'preso' | 'bang' = 'pronto'
  let ladyLook: 'pronto' | 'offesa' = 'pronto'
  let lookAt = 0
  let raf = 0
  let timer = 0
  const H = settings.gunH

  hud.innerHTML = `
    <div class="hud-tr"><button class="hud-btn" data-a="esci" aria-label="${t('Esci')}">${icon('close')}</button></div>
    <div class="hud-ml pill"><b data-me>0</b><small>${arcade ? t('di fila') : t('tu')}</small></div>
    ${arcade ? '' : `<div class="hud-mr pill"><b data-bot>0</b><small>${t('Baffone')}</small></div>`}
    <div class="hud-flash" data-flash style="--fc:#ffd23f"></div>
    <div class="hud-msg" hidden></div>
    <div class="hud-full" data-portrait hidden>${t('Gira il telefono in orizzontale')}</div>`
  const $ = (s: string) => hud.querySelector<HTMLElement>(`[data-${s}]`)
  hud.querySelector('[data-a="esci"]')!.addEventListener('click', () => finish(true))
  const offTrigger = onTrigger(document.getElementById('stage')!, fire)

  try {
    await openStage()
  } catch {
    finish(true)
    alert(t('Non riesco ad aprire la fotocamera. Controlla il permesso nelle impostazioni del browser.'))
    return
  }
  if (phase !== 'mira') return
  say(t('Punta il fucile davanti a te e premi il grilletto'))
  raf = requestAnimationFrame(frame)

  function startRound() {
    phase = 'attesa'
    look = 'pronto'
    ladyLook = 'pronto'
    readyShown = false
    az = (Math.random() * 2 - 1) * 18 * D
    ladyAz = az + (Math.random() < 0.5 ? -1 : 1) * 12 * D
    const roll = Math.random()
    who = diff !== 'difficile' ? 'baffone' : roll < 0.25 ? 'rosina' : roll < 0.65 ? 'insieme' : 'baffone'
    bellAt = performance.now() + 2500 + Math.random() * 3000 // attesa a caso: non si può indovinare
    limit = Math.max(450, WAIT[diff] * 0.92 ** round)
    say(t('Pronti...'), 0, 'huge')
  }

  // lost: in Arcade il primo sbaglio chiude la partita. again: si rifà il round senza punti.
  function next(lost = false, again = false) {
    phase = 'esito'
    $('me')!.textContent = String(me)
    if ($('bot')) $('bot')!.textContent = String(bot)
    timer = window.setTimeout(() => {
      if (arcade ? lost : me >= WIN || bot >= WIN) return finish(false)
      if (!again) round++
      startRound()
    }, 2200)
  }

  function lose(text: string) {
    bot++
    say(arcade ? t('{text}. Fine della corsa!', { text }) : text, 2000, 'warn')
    next(true)
  }

  // Il punto da colpire (la pancia) sullo schermo, con il raggio in pixel.
  function body(a: number) {
    const h = dirFrom(yaw0 + a, 0)
    const p = project(sensors.q, [h[0] * DIST, BODY.y - H, h[2] * DIST], view())
    return p && { x: p.x, y: p.y, r: (view().f * BODY.r) / p.depth }
  }
  const under = (a: number, x: number, y: number) => {
    const b = body(a)
    return !!b && Math.hypot(b.x - x, b.y - y) <= b.r * (1 + settings.tol)
  }
  const hasBandit = () => who !== 'rosina'
  const hasLady = () => who !== 'baffone'

  function fire() {
    const now = performance.now()
    if (size.h > size.w) return
    if (phase === 'mira') {
      yaw0 = sensors.yaw
      phase = 'esito'
      say(t('Bene! Arriva Baffone...'), 1200)
      timer = window.setTimeout(startRound, 1400)
      return
    }
    if (phase === 'attesa') {
      play('oops')
      return lose(t('Troppo presto! Il round va a Baffone'))
    }
    if (phase !== 'duello') return
    play('pew')
    beamFx(settings.color)
    const [ax, ay] = aimPoint()
    if (hasLady() && under(ladyAz, ax, ay)) {
      ladyLook = 'offesa'
      lookAt = now
      play('oops')
      sparkFx(ax, ay)
      return lose(t('Ehi! Era la signora Rosina, lei non si colpisce'))
    }
    if (!hasBandit() || !under(az, ax, ay)) return sparkFx(ax, ay)
    const ms = Math.round(now - bellAt)
    me++
    best = best ? Math.min(best, ms) : ms
    look = 'preso'
    lookAt = now
    play('hit')
    burstFx(ax, ay, [settings.color, '#ffd23f', '#ffffff', '#c98a4b'])
    hitmarkerFx(ax, ay)
    textFx(ax, ay, `${ms} ms`, '#ffffff')
    say([t('Preso! Gli è volato il cappello'), t('Che riflessi!'), t('Più veloce del vento!')][me % 3], 1800)
    next()
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    $('portrait')!.hidden = size.w >= size.h
    if (phase === 'attesa' && !readyShown && now > bellAt - 1300) {
      readyShown = true
      say(t('Attenti...'), 0, 'huge')
    }
    if (phase === 'attesa' && now >= bellAt) {
      phase = 'duello'
      play('bell')
      say(t('Ora!'), 600, 'huge')
    }
    if (phase === 'duello' && now - bellAt > limit) {
      if (!hasBandit()) {
        // passava solo la signora Rosina: brava che non hai sparato, si rifà il round
        say(t('Brava! Era solo la signora Rosina'), 1800)
        next(false, true)
      } else {
        look = 'bang'
        lookAt = now
        play('bang')
        navigator.vibrate?.([60, 40, 60])
        lose(t('BANG! Baffone è stato più veloce'))
      }
    }
    $('flash')!.style.opacity = look === 'bang' ? String(Math.max(0, 0.6 - (now - lookAt) / 900)) : '0'

    ctx.clearRect(0, 0, size.w, size.h)
    const show = phase === 'duello' || (phase === 'esito' && (look !== 'pronto' || ladyLook !== 'pronto' || who === 'rosina'))
    if (show && hasLady()) drawFigure(now, ladyAz, (h, t) => lady(ctx, h, ladyLook, t))
    if (show && hasBandit()) drawFigure(now, az, (h, t) => bandit(ctx, h, look, t))
    drawFx()
    const [ax, ay] = aimPoint()
    drawCrosshair(ax, ay, phase === 'duello' && hasBandit() && under(az, ax, ay), settings.color)
  }

  function drawFigure(now: number, a: number, draw: (h: number, t: number) => void) {
    const h = dirFrom(yaw0 + a, 0)
    const v = view()
    const feet = project(sensors.q, [h[0] * DIST, -H, h[2] * DIST], v)
    const head = project(sensors.q, [h[0] * DIST, HEIGHT - H, h[2] * DIST], v)
    if (!feet || !head) return
    // spunta dal basso in un attimo
    const up = phase === 'duello' ? Math.min(1, (now - bellAt) / 120) : 1
    ctx.save()
    ctx.translate(feet.x, feet.y)
    ctx.scale(up, up)
    draw(feet.y - head.y, (now - lookAt) / 1000)
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
    const newSpeed = !!best && (!record || best < record)
    if (newSpeed) writeNum(KEY, (record = best))
    let streakRecord = loadDuelArcade()
    const newStreak = arcade && me > streakRecord
    if (newStreak) writeNum(ARCADE_KEY, (streakRecord = me))
    onEnd({ me, bot, won: me > bot, best, record, arcade, streakRecord, newSpeed, newStreak })
  }
}

// La signora Rosina: vestito a campana, cappellino col fiore e ombrellino. Passa di lì: non va colpita.
function lady(c: CanvasRenderingContext2D, h: number, look: 'pronto' | 'offesa', time: number) {
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
  // ombrellino sulla spalla, dietro
  shape('#ff6fb5', () => {
    c.moveTo(-34 * u, -96 * u)
    c.quadraticCurveTo(-30 * u, -124 * u, -4 * u, -118 * u)
    c.lineTo(-19 * u, -103 * u)
    c.closePath()
  })
  c.beginPath()
  c.moveTo(-19 * u, -103 * u)
  c.lineTo(-10 * u, -70 * u)
  c.stroke()
  // scarpette
  shape('#a66cff', () => {
    c.roundRect(-10 * u, -5 * u, 8 * u, 5 * u, 2 * u)
    c.roundRect(2 * u, -5 * u, 8 * u, 5 * u, 2 * u)
  })
  // vestito a campana
  shape('#a66cff', () => {
    c.moveTo(-9 * u, -78 * u)
    c.lineTo(9 * u, -78 * u)
    c.lineTo(22 * u, -6 * u)
    c.quadraticCurveTo(0, -1 * u, -22 * u, -6 * u)
    c.closePath()
  })
  shape('#ffffff', () => c.rect(-15 * u, -24 * u, 30 * u, 4 * u)) // balza bianca
  // braccia
  shape('#ffcc9a', () => {
    c.roundRect(-14 * u, -76 * u, 6 * u, 22 * u, 3 * u)
    c.roundRect(8 * u, -76 * u, 6 * u, 22 * u, 3 * u)
  })
  // testa con chignon
  shape('#6b3f1f', () => c.arc(0, -98 * u, 6 * u, 0, Math.PI * 2))
  shape('#ffcc9a', () => c.arc(0, -88 * u, 10 * u, 0, Math.PI * 2))
  c.fillStyle = '#2a1f3d'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.arc(s * 4 * u, -89 * u, 1.6 * u, 0, Math.PI * 2)
    c.fill()
  }
  // bocca: sorride, o fa "oh!" se l'hai colpita
  c.strokeStyle = '#c44619'
  c.beginPath()
  if (look === 'offesa') c.arc(0, -83 * u, 2 * u, 0, Math.PI * 2)
  else c.arc(0, -85 * u, 3.5 * u, 0.2, Math.PI - 0.2)
  c.stroke()
  // cappellino col fiore
  c.strokeStyle = 'rgba(40,30,60,0.7)'
  shape('#ffd23f', () => c.ellipse(0, -97 * u, 14 * u, 3 * u, 0, 0, Math.PI * 2))
  shape('#ffd23f', () => c.roundRect(-7 * u, -104 * u, 14 * u, 7 * u, 3 * u))
  shape('#ff5a5f', () => c.arc(6 * u, -101 * u, 3 * u, 0, Math.PI * 2))
  if (look === 'offesa' && time < 1.5) {
    c.fillStyle = '#ffffff'
    c.font = `800 ${9 * u}px 'Baloo 2 Variable', system-ui, sans-serif`
    c.textAlign = 'center'
    c.fillText(t('Ehi!'), 0, -122 * u)
  }
}

// Baffone di cartone: cappello largo, baffoni, gilet e rivoltella giocattolo con la bandierina. Disegnato con i piedi in (0, 0), alto h px.
export function bandit(c: CanvasRenderingContext2D, h: number, look: 'pronto' | 'preso' | 'bang', t: number) {
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
  // braccio con la rivoltella giocattolo: calcio di legno, tamburo, canna lunga e cane
  shape('#ffd23f', () => c.roundRect(13 * u, -77 * u, 7 * u, 20 * u, 3 * u))
  shape('#8f5a2e', () => {
    c.moveTo(16 * u, -63 * u)
    c.lineTo(23 * u, -63 * u)
    c.lineTo(21 * u, -52 * u)
    c.lineTo(15 * u, -53 * u)
    c.closePath()
  })
  shape('#b8c0cc', () => c.roundRect(18 * u, -67 * u, 10 * u, 6 * u, 1.5 * u))
  shape('#8e98a8', () => c.arc(25 * u, -64 * u, 3.6 * u, 0, Math.PI * 2))
  shape('#b8c0cc', () => c.roundRect(27 * u, -66.5 * u, 15 * u, 3.5 * u, 1.2 * u))
  shape('#8e98a8', () => c.rect(17 * u, -69.5 * u, 3 * u, 3 * u))
  shape('#ffcc9a', () => c.arc(18 * u, -60 * u, 3.5 * u, 0, Math.PI * 2))
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
  // la bandierina: esce dalla canna un'asta corta, e sotto l'asta si srotola verso il basso la bandiera con scritto BANG!
  if (look === 'bang') {
    const k = Math.min(1, t / 0.15)
    const x0 = 42 * u, y0 = -64.8 * u
    const tip = x0 + 38 * u * k
    const fh = 16 * u * Math.max(0, Math.min(1, (t - 0.15) / 0.2))
    if (fh > 0) {
      const fx = x0 + 11 * u, w = tip - fx
      const wave = Math.sin(t * 12) * 1.5 * u
      c.fillStyle = '#ffffff'
      c.strokeStyle = '#ff5a5f'
      c.lineWidth = Math.max(2, u * 1.4)
      c.beginPath()
      c.moveTo(fx, y0)
      c.lineTo(fx + w, y0)
      c.lineTo(fx + w, y0 + fh)
      c.quadraticCurveTo(fx + w / 2, y0 + fh + wave, fx, y0 + fh)
      c.closePath()
      c.fill()
      c.stroke()
      if (fh > 12 * u) {
        c.fillStyle = '#ff5a5f'
        c.font = `800 ${7 * u}px 'Baloo 2 Variable', system-ui, sans-serif`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText('BANG!', fx + w / 2, y0 + fh / 2)
      }
    }
    // l'asta sopra la bandiera
    c.strokeStyle = '#6b3f1f'
    c.lineWidth = Math.max(2, u * 1.6)
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(x0, y0)
    c.lineTo(tip, y0)
    c.stroke()
  }
}
