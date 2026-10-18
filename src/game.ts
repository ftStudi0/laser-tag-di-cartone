import { play } from './audio.ts'
import { D, dirFrom, forward, project, screenDir, type Vec3 } from './math.ts'
import { mode, sensors } from './sensors.ts'
import { recordKey, saveRecord, settings } from './settings.ts'
import {
  aimPoint, beamFx, burstFx, closeStage, ctx, drawCrosshair, drawFx, hitmarkerFx, hud, openStage, say, size, sparkFx, textFx, videoSize, view,
} from './stage.ts'
import { azAt, DIFF, POINTS, schedule, trainingTarget, type Diff, type Target, type Theme } from './targets.ts'
import { drawTarget, GOLD, TINTS } from './themes.ts'
import { onTrigger } from './trigger.ts'

export type GameOpts = { theme: Theme; diff: Diff; duration: number } // duration 0 = allenamento
export type Result = GameOpts & { score: number; shots: number; good: number; best: number; rank: number }

const AMMO = 10
const RELOAD_PITCH = 60 * D
const FLY = 0.4 // secondi dell'animazione "vola via"

export async function playSolo(opts: GameOpts, onEnd: (r: Result | null) => void) {
  const training = opts.duration === 0
  const sizeMul = mode() === 'bussola' ? 1.5 : 1 // la bussola trema: bersagli più grandi
  const useAmmo = DIFF[opts.diff].ammo && !training
  const targets: Target[] = training ? [] : schedule((Math.random() * 2 ** 32) >>> 0, opts.diff, opts.duration, sizeMul)
  const color = settings.color

  let phase: 'mira' | 'via' | 'gioco' | 'fine' = 'mira'
  let paused = false
  let recenter = false
  let gameT = 0
  let viaAt = 0
  let lastCount = 0
  let lastNow = performance.now()
  let lastShot = -1e9
  let yaw0 = 0
  let ammo = AMMO
  let upSince = 0
  let score = 0, shots = 0, good = 0, streak = 0, best = 0
  let raf = 0
  let fps = 0

  hud.innerHTML = `
    <div class="hud-tl pill" data-ammo></div>
    <div class="hud-tr">
      <button class="hud-btn" data-a="pausa" aria-label="Pausa">⏸</button>
      <button class="hud-btn" data-a="ricentra" aria-label="Ricentra">⟳</button>
      <button class="hud-btn" data-a="esci" aria-label="Esci">✕</button>
    </div>
    <div class="hud-ml pill"><b data-score>0</b><small>punti</small><small data-streak></small></div>
    <div class="hud-mr pill"><b data-time>${training ? 'Allenamento' : fmt(opts.duration)}</b></div>
    <div class="hud-msg" hidden></div>
    <div class="hud-full" data-pause hidden>Pausa<small>Tocca ▶ per riprendere</small></div>
    <div class="hud-full" data-portrait hidden>Gira il telefono in orizzontale</div>
    <pre class="hud-debug" data-debug ${settings.debug ? '' : 'hidden'}></pre>`
  const $ = (s: string) => hud.querySelector<HTMLElement>(`[data-${s}]`)!
  const pauseBtn = hud.querySelector<HTMLElement>('[data-a="pausa"]')!

  const setPaused = (p: boolean) => {
    paused = p
    $('pause').hidden = !p
    pauseBtn.textContent = p ? '▶' : '⏸'
  }

  hud.querySelector('.hud-tr')!.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('button')?.dataset.a
    if (a === 'esci') finish(true)
    if (a === 'pausa' && phase === 'gioco') setPaused(!paused)
    if (a === 'ricentra' && phase === 'gioco') {
      recenter = true
      setPaused(false)
      say('Punta davanti a te e premi il grilletto')
    }
  })

  const onHide = () => document.visibilityState === 'hidden' && phase === 'gioco' && setPaused(true)
  document.addEventListener('visibilitychange', onHide)
  sensors.onShake = () => phase === 'gioco' && say('Piano! Si cammina', 2000, 'warn')

  const offTrigger = onTrigger(document.getElementById('stage')!, fire)

  try {
    await openStage()
  } catch {
    finish(true)
    alert('Non riesco ad aprire la fotocamera. Controlla il permesso nelle impostazioni del browser.')
    return
  }
  say('Punta il fucile davanti a te e premi il grilletto')
  raf = requestAnimationFrame(frame)

  function alive(t: Target) {
    return t.hitAt === undefined && t.born <= gameT && gameT < t.born + t.life
  }

  function dirOf(t: Target) {
    return dirFrom(yaw0 + azAt(t, gameT), t.el)
  }

  function fire() {
    const now = performance.now()
    if (phase === 'mira') {
      yaw0 = sensors.yaw
      phase = 'via'
      viaAt = now
      return
    }
    if (recenter) {
      yaw0 = sensors.yaw
      recenter = false
      say('Ricentrato!', 900)
      return
    }
    if (phase !== 'gioco' || paused || size.h > size.w) return
    if (now - lastShot < 300) return // cadenza massima
    if (sensors.pitch > RELOAD_PITCH) return // durante la ricarica non si spara
    if (useAmmo && ammo === 0) {
      play('click')
      say('Ricarica! Alza il fucile', 1500, 'warn')
      return
    }
    lastShot = now
    if (useAmmo) ammo--
    shots++
    play('pew')
    beamFx(color)
    const [ax, ay] = aimPoint()
    const t = pick(ax, ay)
    if (!t) {
      sparkFx(ax, ay)
      streak = 0
      return
    }
    t.hitAt = gameT
    const pts = POINTS[t.kind]
    navigator.vibrate?.(30)
    if (t.kind === 'amico') {
      score = Math.max(0, score + pts)
      streak = 0
      play('oops')
      textFx(ax, ay, String(pts), '#ffab4c')
      say('Il gattino no!', 1200)
      return
    }
    good++
    streak++
    best = Math.max(best, streak)
    score += pts
    play('pop_' + opts.theme)
    play('hit')
    burstFx(ax, ay, [color, t.kind === 'dorato' ? GOLD : TINTS[t.tint], '#ffffff', '#ffd23f'])
    hitmarkerFx(ax, ay)
    textFx(ax, ay, `+${pts}`, t.kind === 'dorato' ? GOLD : '#ffffff')
  }

  // Il bersaglio sotto il mirino (centro dentro il cerchio allargato della tolleranza), il più centrato.
  function pick(x: number, y: number, kindFilter = false) {
    const v = view()
    let bestT: Target | null = null, bestD = Infinity
    for (const t of targets) {
      if (!alive(t) || (kindFilter && t.kind === 'amico')) continue
      const p = project(sensors.q, dirOf(t), v)
      if (!p) continue
      const r = (v.f * (t.r / t.dist)) / p.depth
      const d = Math.hypot(p.x - x, p.y - y) / (r * (1 + settings.tol))
      if (d <= 1 && d < bestD) {
        bestD = d
        bestT = t
      }
    }
    return bestT
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, (now - lastNow) / 1000)
    lastNow = now
    fps += (1 / Math.max(dt, 0.001) - fps) * 0.05
    const portrait = size.h > size.w
    $('portrait').hidden = !portrait

    if (phase === 'via') {
      const left = 3 - (now - viaAt) / 1000
      const n = Math.ceil(left)
      if (n !== lastCount && n > 0) {
        lastCount = n
        play('beep')
        say(String(n), 0, 'huge')
      }
      if (left <= 0) {
        phase = 'gioco'
        play('go')
        say('Via!', 700, 'huge')
      }
    }
    if (phase === 'gioco' && !paused && !recenter && !portrait) gameT += dt
    if (phase === 'gioco' && !training && gameT >= opts.duration) return finish(false)

    if (training && phase === 'gioco') {
      while (targets.filter(alive).length < 3) targets.push(trainingTarget(targets.length, gameT, sizeMul))
    }

    // ricarica: fucile alzato oltre 60 gradi per mezzo secondo
    if (useAmmo && phase === 'gioco') {
      if (sensors.pitch > RELOAD_PITCH) {
        upSince ||= now
        if (ammo < AMMO && now - upSince > 500) {
          ammo = AMMO
          play('reload')
          say('Carico!', 800)
        } else if (ammo < AMMO) say('Ricarica...', 0)
      } else if (upSince) {
        upSince = 0
        if (hud.querySelector('.hud-msg')!.textContent === 'Ricarica...') say('')
      }
    }

    draw(now)
    updateHud()
  }

  function draw(now: number) {
    const v = view()
    const t = now / 1000
    ctx.clearRect(0, 0, size.w, size.h)
    const [ax, ay] = aimPoint()
    let nearest: { a: number; d: [number, number] } | null = null
    const fwd = forward(sensors.q)
    let anyVisible = false
    if (phase === 'gioco') {
      for (const tg of targets) {
        if (tg.born > gameT || tg.hitAt !== undefined) continue
        const end = tg.born + tg.life
        if (gameT >= end + FLY) continue
        const p = project(sensors.q, dirOf(tg), v)
        const r = p ? (v.f * (tg.r / tg.dist)) / p.depth : 0
        const onScreen = p && p.x > -r && p.x < size.w + r && p.y > -r && p.y < size.h + r
        if (!onScreen) {
          if (gameT < end && tg.kind !== 'amico') {
            const dir = dirOf(tg)
            const ang = Math.acos(Math.max(-1, Math.min(1, dot(fwd, dir))))
            if (!nearest || ang < nearest.a) nearest = { a: ang, d: screenDir(sensors.q, dir) }
          }
          continue
        }
        if (gameT < end && tg.kind !== 'amico') anyVisible = true
        const pop = Math.min(1, (gameT - tg.born) / 0.2)
        const fly = Math.max(0, (gameT - end) / FLY)
        ctx.save()
        ctx.globalAlpha = 1 - fly
        drawTarget(ctx, opts.theme, tg.kind, tg.tint, p.x, p.y - fly * r * 2, r * (0.6 + 0.4 * pop), t)
        ctx.restore()
      }
      // la freccia solo se non si vede nessun bersaglio da colpire, per non confondere
      if (nearest && !anyVisible) arrow(nearest.d)
    }
    drawFx()
    const locked = phase === 'gioco' && !paused && pick(ax, ay, true) !== null
    drawCrosshair(ax, ay, locked, color)
    if (settings.debug) {
      const [vw, vh] = videoSize()
      $('debug').textContent =
        `fps ${fps.toFixed(0)}  sensori ${mode()}\nimbardata ${(sensors.yaw / D).toFixed(1)}  beccheggio ${(sensors.pitch / D).toFixed(1)}\n` +
        `fov ${settings.fov.toFixed(1)}  video ${vw}x${vh}  f ${v.f.toFixed(0)}\nbersagli vivi ${targets.filter(alive).length}  t ${gameT.toFixed(1)}`
    }
  }

  // Freccia sul bordo verso il bersaglio più vicino fuori schermo.
  function arrow([dx, dy]: [number, number]) {
    const n = Math.hypot(dx, dy) || 1
    const ux = dx / n, uy = dy / n
    const m = 56
    const s = Math.min((size.w / 2 - m) / Math.abs(ux || 1e-6), (size.h / 2 - m) / Math.abs(uy || 1e-6))
    const x = size.w / 2 + ux * s, y = size.h / 2 + uy * s
    const a = Math.atan2(uy, ux)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    ctx.fillStyle = '#ffd23f'
    ctx.strokeStyle = 'rgba(40,30,60,0.7)'
    ctx.lineWidth = 4
    ctx.lineJoin = 'round'
    const k = 1 + 0.12 * Math.sin(performance.now() / 120)
    ctx.scale(k, k)
    ctx.beginPath()
    ctx.moveTo(26, 0)
    ctx.lineTo(-8, -22)
    ctx.lineTo(-8, -9)
    ctx.lineTo(-24, -9)
    ctx.lineTo(-24, 9)
    ctx.lineTo(-8, 9)
    ctx.lineTo(-8, 22)
    ctx.closePath()
    ctx.stroke()
    ctx.fill()
    ctx.restore()
  }

  let hudKey = ''
  function updateHud() {
    const time = training ? 'Allenamento' : fmt(Math.max(0, opts.duration - gameT))
    const key = `${score}|${streak}|${ammo}|${time}`
    if (key === hudKey) return
    hudKey = key
    $('score').textContent = String(score)
    $('streak').textContent = streak >= 3 ? `serie ${streak}` : ''
    $('time').textContent = time
    $('ammo').innerHTML = useAmmo
      ? `<span class="ammo">${'<i></i>'.repeat(ammo)}${'<i class="off"></i>'.repeat(AMMO - ammo)}</span>`
      : '<span class="ammo-free">Colpi infiniti</span>'
  }

  function finish(aborted: boolean) {
    if (phase === 'fine') return
    phase = 'fine'
    cancelAnimationFrame(raf)
    offTrigger()
    document.removeEventListener('visibilitychange', onHide)
    sensors.onShake = () => {}
    closeStage()
    if (aborted || training) return onEnd(null)
    play('end')
    const name = settings.name || 'Senza nome'
    const rank = saveRecord(recordKey(opts.diff, opts.duration), { name, score, acc: shots ? good / shots : 0, streak: best, date: Date.now() })
    onEnd({ ...opts, score, shots, good, best, rank })
  }
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export function fmt(s: number) {
  const n = Math.ceil(s)
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}
