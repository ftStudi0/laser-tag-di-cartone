import { play } from './audio.ts'
import { icon } from './icons.ts'
import { D, dirFrom, forward, project, screenDir, type Vec3 } from './math.ts'
import { mode, sensors } from './sensors.ts'
import { recordKey, saveRecord, settings } from './settings.ts'
import {
  aimPoint, beamFx, burstFx, closeStage, ctx, drawCrosshair, drawFx, hitmarkerFx, hud, openStage, say, size, sparkFx, textFx, videoSize, view,
} from './stage.ts'
import { ARCADE, azAt, BOOTH, boothSchedule, CLAY, clayEl, claySchedule, DUCK, duckAt, duckSchedule, POINTS, schedule, trainingTarget, zDist, ZOMBIE, zombieSchedule, type Diff, type Target, type Theme } from './targets.ts'
import { drawTarget, drawZombie, GOLD, TINTS } from './themes.ts'
import type { Z3 } from './zombie3d.ts'
import { heat, onTrigger } from './trigger.ts'
import { esc } from './ui.ts'
import { t } from './i18n.ts'

export type GameOpts = { theme: Theme; diff: Diff; duration: number; heat: boolean; booth?: boolean; clay?: boolean; ducks?: boolean; arcade?: boolean } // duration 0 = allenamento; heat: il fucile si scalda; booth: chiosco del luna park; clay: tiro al piattello; ducks: anatre al volo
export type Result = GameOpts & { score: number; shots: number; good: number; best: number; rank: number }
// Sfida a bersagli: stesso gioco, ma seme, tempo e pausa arrivano dal server e i punti vanno a lui.
export type Multi = {
  seed: number
  clock: () => { t: number; paused: boolean } // secondi dall'inizio (negativi prima del via)
  ended: () => boolean
  isDir: boolean
  pause: (on: boolean) => void
  report: (s: { score: number; shots: number; good: number; best: number }) => void
  board: () => { name: string; score: number; me: boolean }[]
  color?: string // a squadre: il colore della squadra
  resume?: { score: number; shots: number; good: number; best: number } // chi rientra a metà riparte dai suoi punti
  // Bersagli condivisi: tutti li vedono nella stessa direzione e il primo che colpisce li prende
  shared?: {
    ref: string // cosa puntare per la direzione zero comune, per esempio "la TV"
    size: number
    taken: () => Record<string, string>
    colorOf: (playerId: string) => string
    nameOf: (playerId: string) => string
    me: string
    claim: (id: number) => void
    score: () => number
  }
}

const AMMO = 10
const FLY = 0.4 // secondi dell'animazione "vola via"
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches

export async function playSolo(opts: GameOpts, onEnd: (r: Result | null) => void, multi?: Multi) {
  const booth = !!opts.booth
  if (booth) opts = { ...opts, duration: BOOTH.duration, heat: false, theme: opts.theme === 'zombi' ? 'palloncini' : opts.theme }
  const clay = !!opts.clay
  if (clay) opts = { ...opts, duration: CLAY.duration, heat: false }
  const ducks = !!opts.ducks
  if (ducks) opts = { ...opts, duration: DUCK.duration, heat: false }
  const arcade = !!opts.arcade && !multi
  if (arcade) opts = { ...opts, duration: ARCADE.duration, heat: false }
  const training = opts.duration === 0 && !multi
  const shared = multi?.shared
  const sizeMul = (mode() === 'bussola' ? 1.5 : 1) * (shared?.size ?? 1) // la bussola trema: bersagli più grandi
  const gun = heat(opts.heat && !training ? AMMO : 0)
  const zombi = opts.theme === 'zombi'
  const seed = multi?.seed ?? (Math.random() * 2 ** 32) >>> 0
  const targets: Target[] = training ? [] : booth ? boothSchedule(seed, opts.diff, sizeMul, opts.duration) : clay ? claySchedule(seed, opts.diff, sizeMul, opts.duration) : ducks ? duckSchedule(seed, opts.diff, sizeMul, opts.duration) : (zombi ? zombieSchedule : schedule)(seed, opts.diff, opts.duration, sizeMul)
  const color = multi?.color ?? settings.color
  const H = settings.gunH // altezza degli occhi sul pavimento virtuale
  let z3: { render: (items: Z3[], ...rest: any[]) => void; dispose: () => void } | null = null

  // nella Sfida la direzione zero si prende al via, nei condivisi puntando tutti lo stesso riferimento
  let phase: 'mira' | 'via' | 'gioco' | 'fine' = multi && !shared ? 'via' : 'mira'
  const aimText = shared ? t('Tutti insieme: puntate {ref} e premete il grilletto', { ref: shared.ref }) : t('Punta davanti a te e premi il grilletto')
  let paused = false
  let recenter = false
  let gameT = 0
  let viaAt = 0
  let lastCount = 0
  let lastNow = performance.now()
  let lastShot = -1e9
  let yaw0 = 0
  let { score, shots, good, best } = multi?.resume ?? { score: 0, shots: 0, good: 0, best: 0 }
  let streak = 0
  let lives = ARCADE.shots // Arcade: i colpi che si possono ancora sbagliare
  let raf = 0
  let fps = 0
  let dogAt = -1e9 // quando è spuntato il cane

  hud.innerHTML = `
    <div class="hud-tl pill" data-ammo></div>
    <div class="hud-tr">
      ${!multi || multi.isDir ? `<button class="hud-btn" data-a="pausa" aria-label="${t('Pausa')}">${icon('pause')}</button>` : ''}
      <button class="hud-btn" data-a="ricentra" aria-label="${t('Ricentra')}">${icon('recenter')}</button>
      <button class="hud-btn" data-a="esci" aria-label="${t('Esci')}">${icon('close')}</button>
    </div>
    <div class="hud-ml pill"><b data-score>0</b><small>${t('punti')}</small><small data-streak></small>${multi ? '<ol class="live" data-live></ol>' : ''}</div>
    <div class="hud-mr pill"><b data-time>${training ? t('Allenamento') : arcade ? '0:00' : fmt(opts.duration)}</b></div>
    <div class="hud-msg" hidden></div>
    <div class="hud-full" data-pause hidden>${t('Pausa')}<small>${multi && !multi.isDir ? t('Aspetta il regista') : t('Tocca {icon} in alto a destra per riprendere', { icon: icon('play', 18) })}</small></div>
    <div class="hud-full" data-portrait hidden>${t('Gira il telefono in orizzontale')}</div>
    <pre class="hud-debug" data-debug ${settings.debug ? '' : 'hidden'}></pre>`
  const $ = (s: string) => hud.querySelector<HTMLElement>(`[data-${s}]`)!
  const pauseBtn = hud.querySelector<HTMLElement>('[data-a="pausa"]')

  const setPaused = (p: boolean) => {
    paused = p
    $('pause').hidden = !p
    if (!pauseBtn) return
    pauseBtn.innerHTML = icon(p ? 'play' : 'pause')
    pauseBtn.setAttribute('aria-label', p ? t('Riprendi') : t('Pausa'))
  }

  hud.querySelector('.hud-tr')!.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('button')?.dataset.a
    if (a === 'esci' && (!multi || confirm(t('Esci dalla sfida? Puoi rientrare dalla lobby.')))) finish(true)
    if (a === 'pausa' && multi) multi.pause(!paused)
    else if (a === 'pausa' && phase === 'gioco') setPaused(!paused)
    if (a === 'ricentra' && phase === 'gioco') {
      recenter = true
      if (!multi) setPaused(false)
      say(shared ? t('Punta {ref} e premi il grilletto', { ref: shared.ref }) : aimText)
    }
  })

  const onHide = () => !multi && document.visibilityState === 'hidden' && phase === 'gioco' && setPaused(true)
  document.addEventListener('visibilitychange', onHide)
  sensors.onShake = () => phase === 'gioco' && say(t('Piano! Si cammina'), 2000, 'warn')

  const offTrigger = onTrigger(document.getElementById('stage')!, fire)

  try {
    await openStage()
  } catch {
    finish(true)
    alert(t('Non riesco ad aprire la fotocamera. Controlla il permesso nelle impostazioni del browser.'))
    return
  }
  if (zombi && settings.z3d) {
    try {
      const { createZombies3D } = await import('./zombie3d.ts')
      const stageEl = document.getElementById('stage')!
      z3 = createZombies3D(stageEl, stageEl.querySelector('canvas')!)
    } catch {
      say(t('Il 3D non si è caricato: uso il 2D'), 2500, 'warn')
    }
  }
  if ((phase as string) === 'fine') return // uscita durante il caricamento (finish la cambia)
  say(shared ? aimText : multi ? t('Al via punta il fucile davanti a te') : t('Punta il fucile davanti a te e premi il grilletto'))
  raf = requestAnimationFrame(frame)

  function alive(t: Target) {
    return t.hitAt === undefined && t.born <= gameT && gameT < t.born + t.life
  }

  // Direzione e distanza del punto da colpire. Gli zombi camminano sul pavimento, H metri sotto gli occhi.
  function geo(t: Target): { dir: Vec3; dist: number } {
    if (t.duck) {
      const p = duckAt(t, gameT)
      return { dir: dirFrom(yaw0 + p.az, p.el), dist: t.dist }
    }
    if (t.d0 === undefined) return { dir: dirFrom(yaw0 + azAt(t, gameT), t.vel === undefined ? t.el : clayEl(t, gameT)), dist: t.dist }
    const d = zDist(t, gameT)
    const h = dirFrom(yaw0 + t.az, 0)
    const y = ZOMBIE.hitY - H
    const len = Math.hypot(d, y)
    return { dir: [(h[0] * d) / len, y / len, (h[2] * d) / len], dist: len }
  }

  function fire() {
    const now = performance.now()
    if (phase === 'mira') {
      yaw0 = sensors.yaw
      phase = 'via'
      viaAt = now
      if (shared) {
        play('beep')
        say(t('Fatto! Aspetta il via'), 0)
      }
      return
    }
    if (recenter) {
      yaw0 = sensors.yaw
      recenter = false
      say(t('Ricentrato!'), 900)
      return
    }
    if (phase !== 'gioco' || paused || size.h > size.w) return
    if (now - lastShot < 300) return // cadenza massima
    if ((booth && !arcade && shots >= BOOTH.shots) || (arcade && lives <= 0)) return play('click')
    if (!gun.take(now)) return play('click') // scotta ancora
    lastShot = now
    if (booth && !arcade && shots + 1 === BOOTH.shots) setTimeout(() => phase === 'gioco' && finish(false), 1200) // ultimo colpo: si vede com'è andata
    shots++
    play('pew')
    beamFx(color)
    const [ax, ay] = aimPoint()
    const hit = pick(ax, ay)
    if (!hit) {
      sparkFx(ax, ay)
      streak = 0
      miss()
      return report()
    }
    hit.hitAt = gameT
    const pts = POINTS[hit.kind]
    navigator.vibrate?.(30)
    shared?.claim(hit.id) // i punti li assegna il server al primo che arriva
    if (hit.kind === 'amico') {
      score = Math.max(0, score + pts)
      streak = 0
      play('oops')
      textFx(ax, ay, String(pts), '#ffab4c')
      say(t('Il gattino no!'), 1200)
      miss()
      return report()
    }
    good++
    streak++
    best = Math.max(best, streak)
    score += pts
    play(clay ? 'crack' : ducks ? 'quack' : 'pop_' + opts.theme)
    if (ducks) say([t('Qua qua!'), t('Che spavento!'), t('Scappa via!')][good % 3], 600)
    if (zombi) say([t('Preso!'), t('Che solletico!'), t('Puff!')][good % 3], 600)
    play('hit')
    burstFx(ax, ay, ducks ? ['#ffffff', '#f4e9d0', hit.kind === 'dorato' ? GOLD : '#ffd23f', color] : clay ? [hit.kind === 'dorato' ? GOLD : '#ff8a3d', '#c4561d', '#ffffff', color] : [color, hit.kind === 'dorato' ? GOLD : TINTS[hit.tint], '#ffffff', '#ffd23f'])
    hitmarkerFx(ax, ay)
    textFx(ax, ay, `+${pts}`, hit.kind === 'dorato' ? GOLD : '#ffffff')
    report()
  }

  // Arcade: uno sbaglio costa un colpo; finiti i colpi, finisce la partita
  function miss() {
    if (!arcade) return
    lives--
    if (lives === 3) say(t('Attenzione: ti restano 3 colpi'), 1400, 'warn')
    if (lives <= 0) setTimeout(() => phase === 'gioco' && finish(false), 1200)
  }

  function report() {
    multi?.report({ score, shots, good, best })
  }

  // Il bersaglio sotto il mirino (centro dentro il cerchio allargato della tolleranza), il più centrato.
  function pick(x: number, y: number, kindFilter = false) {
    const v = view()
    let bestT: Target | null = null, bestD = Infinity
    for (const t of targets) {
      if (!alive(t) || (kindFilter && t.kind === 'amico')) continue
      const g = geo(t)
      const p = project(sensors.q, g.dir, v)
      if (!p) continue
      const r = (v.f * (t.r / g.dist)) / p.depth
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

    const clock = multi?.clock()
    if (clock && clock.paused !== paused) setPaused(clock.paused)
    if (multi?.ended()) return finish(false)
    if (phase === 'mira' && shared && clock && clock.t >= 0) {
      yaw0 = sensors.yaw // nessuno ha premuto: vale dove punta adesso, si può ricentrare
      phase = 'via'
    }
    if (phase === 'via') {
      const left = clock ? -clock.t : 3 - (now - viaAt) / 1000
      const n = Math.ceil(left)
      if (n !== lastCount && n > 0 && n <= 3) {
        lastCount = n
        play('beep')
        say(String(n), 0, 'huge')
      }
      if (left <= 0) {
        if (multi && !shared) yaw0 = sensors.yaw
        phase = 'gioco'
        play('go')
        say(t('Via!'), 700, 'huge')
      }
    }
    if (clock) gameT = Math.max(0, clock.t) // tempo comune a tutti i telefoni
    else if (phase === 'gioco' && !paused && !recenter && !portrait) gameT += dt
    if (phase === 'gioco' && !training && gameT >= opts.duration) return finish(false)

    if (training && phase === 'gioco') {
      while (targets.filter(alive).length < 3) {
        const t = trainingTarget(targets.length, gameT, sizeMul)
        // zombi fermi in piedi, a 3-5 metri
        targets.push(zombi ? { ...t, el: 0, d0: t.dist, v: 0, r: ZOMBIE.hitR * sizeMul } : t)
      }
    }

    // bersagli presi da altri: spariscono anche qui, con lo scoppio nel colore di chi li ha presi
    if (shared && phase === 'gioco') {
      const taken = shared.taken()
      for (const t of targets) {
        const by = taken[t.id]
        if (!by || by === shared.me || t.hitAt !== undefined) continue
        const p = project(sensors.q, geo(t).dir, view())
        if (p && p.x > 0 && p.x < size.w && p.y > 0 && p.y < size.h) {
          burstFx(p.x, p.y, [shared.colorOf(by), '#ffffff'])
          textFx(p.x, p.y, shared.nameOf(by), shared.colorOf(by))
        }
        t.hitAt = gameT
        t.caught = true // niente animazione del colpo
      }
      score = shared.score()
    }

    // uno zombi arrivato vicino ti fa il solletico: un punto in meno (nei condivisi se ne va e basta)
    if (zombi && phase === 'gioco') {
      for (const tg of targets) {
        if (tg.hitAt !== undefined || gameT < tg.born + tg.life) continue
        tg.hitAt = gameT
        tg.caught = true
        if (shared) continue
        score = Math.max(0, score - 1)
        streak = 0
        play('oops')
        say(t('Uno zombi ti ha fatto il solletico! -1'), 1500, 'warn')
        miss()
        navigator.vibrate?.([40, 60, 40])
        report()
      }
    }

    if (phase === 'gioco') gun.tick(now)
    // anatra scappata: il cane spunta dall'erba e ride
    if (ducks && phase === 'gioco')
      for (const tg of targets)
        if (!tg.launched && tg.hitAt === undefined && gameT >= tg.born + tg.life) {
          tg.launched = true
          dogAt = gameT
          play('laugh')
          say(t('Scappata! Il cane se la ride'), 1200)
        }
    // il "tunk" della macchina che lancia i piattelli
    if (clay && phase === 'gioco')
      for (const tg of targets)
        if (!tg.launched && tg.born <= gameT) {
          tg.launched = true
          play('launch')
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
    const zs: { tg: Target; d: number; pop: number }[] = []
    if (booth && phase !== 'mira') drawBooth(v)
    if (ducks && phase !== 'mira') drawGrass(v, t)
    if (phase === 'gioco') {
      for (const tg of targets) {
        if (tg.born > gameT) continue
        const end = tg.born + tg.life
        const pop = tg.hitAt !== undefined ? (gameT - tg.hitAt) / 0.25 : 0 // zombi colpito: si rimpicciolisce e sparisce
        if (ducks) {
          const d = duckAt(tg, gameT)
          if (d.flee > 1.2) continue
          const p = project(sensors.q, geo(tg).dir, v)
          if (!p) continue
          const r = (v.f * (tg.r / tg.dist)) / p.depth
          if (alive(tg) && p.x > -r && p.x < size.w + r && p.y > -r && p.y < size.h + r) anyVisible = true
          else if (alive(tg)) {
            const ang = Math.acos(Math.max(-1, Math.min(1, dot(fwd, geo(tg).dir))))
            if (!nearest || ang < nearest.a) nearest = { a: ang, d: screenDir(sensors.q, geo(tg).dir) }
          }
          drawDuck(ctx, p.x, p.y, r, gameT - tg.born, tg.kind, d.face, d.flee > 0)
          continue
        }
        if (tg.hitAt !== undefined && (!zombi || tg.caught || pop >= 1)) continue
        if (!zombi && gameT >= end + FLY) continue
        const g = geo(tg)
        const p = project(sensors.q, g.dir, v)
        const r = p ? (v.f * (tg.r / g.dist)) / p.depth : 0
        const m = zombi ? r * 2 : r
        const onScreen = p && p.x > -m && p.x < size.w + m && p.y > -m && p.y < size.h + m
        const isAlive = alive(tg)
        if (isAlive && tg.kind !== 'amico') {
          if (onScreen) anyVisible = true
          else {
            const ang = Math.acos(Math.max(-1, Math.min(1, dot(fwd, g.dir))))
            if (!nearest || ang < nearest.a) nearest = { a: ang, d: screenDir(sensors.q, g.dir) }
          }
        }
        if (zombi) {
          zs.push({ tg, d: zDist(tg, gameT), pop })
          continue
        }
        if (!onScreen) continue
        const popIn = Math.min(1, (gameT - tg.born) / 0.2)
        const fly = clay ? (gameT >= end ? 1 : 0) : Math.max(0, (gameT - end) / FLY)
        ctx.save()
        ctx.globalAlpha = 1 - fly
        if (clay) drawClay(ctx, p.x, p.y, r, gameT - tg.born, tg.kind)
        else drawTarget(ctx, opts.theme, tg.kind, tg.tint, p.x, p.y - fly * r * 2, r * (0.6 + 0.4 * popIn), t)
        ctx.restore()
      }
      if (zombi) drawZombies(zs, v, t)
      // la freccia solo se non si vede nessun bersaglio da colpire, per non confondere
      if (nearest && !anyVisible && !booth) arrow(nearest.d)
    }
    if (z3 && phase !== 'gioco') z3.render([], sensors.q, v, size.w, size.h, H, t)
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

  // Zombi: in 3D li disegna Three.js, in 2D sagome con i piedi sul pavimento, dal più lontano al più vicino.
  function drawZombies(zs: { tg: Target; d: number; pop: number }[], v: ReturnType<typeof view>, t: number) {
    if (z3) {
      z3.render(
        zs.map(({ tg, d, pop }) => {
          const h = dirFrom(yaw0 + tg.az, 0)
          return { id: tg.id, x: h[0] * d, z: h[2] * d, kind: tg.kind, tint: tg.tint, speed: Math.max(0.3, (tg.v ?? 0) / 0.4), pop }
        }),
        sensors.q, v, size.w, size.h, H, t,
      )
      return
    }
    zs.sort((a, b) => b.d - a.d)
    for (const { tg, d, pop } of zs) {
      const h = dirFrom(yaw0 + tg.az, 0)
      const feet = project(sensors.q, [h[0] * d, -H, h[2] * d], v)
      const head = project(sensors.q, [h[0] * d, ZOMBIE.height - H, h[2] * d], v)
      if (!feet || !head) continue
      const px = feet.y - head.y
      if (feet.x < -px || feet.x > size.w + px || head.y > size.h || feet.y < 0) continue
      ctx.save()
      ctx.globalAlpha = 1 - pop
      ctx.translate(feet.x, feet.y)
      ctx.scale(1 - pop, 1 - pop)
      drawZombie(ctx, 0, 0, px, t, tg.kind, tg.tint, Math.max(0.3, (tg.v ?? 0) / 0.4))
      ctx.restore()
    }
  }

  // Il chiosco: pannello di fondo, tre binari, tendone a righe e bancone, fissati davanti a dove hai puntato all'inizio.
  function drawBooth(v: ReturnType<typeof view>) {
    const quad = (a1: number, e1: number, a2: number, e2: number, fill: string) => {
      const pts = [[a1, e1], [a2, e1], [a2, e2], [a1, e2]].map(([a, e]) => project(sensors.q, dirFrom(yaw0 + a, e), v))
      if (pts.some((p) => !p)) return
      ctx.fillStyle = fill
      ctx.beginPath()
      pts.forEach((p) => ctx.lineTo(p!.x, p!.y))
      ctx.closePath()
      ctx.fill()
    }
    const h = BOOTH.half + 5 * D, top = 13 * D, bottom = -13 * D
    ctx.save()
    ctx.globalAlpha = 0.85
    quad(-h, bottom, h, top, '#bfe3ff')
    ctx.globalAlpha = 1
    for (const e of BOOTH.rows) quad(-h, e - 3.2 * D, h, e - 2.4 * D, '#a8743f') // binario sotto ogni fila
    const n = 10
    for (let i = 0; i < n; i++) quad(-h + (2 * h * i) / n, top, -h + (2 * h * (i + 1)) / n, top + 6 * D, i % 2 ? '#ffffff' : '#ff5a5f')
    quad(-h, bottom - 5 * D, h, bottom, '#c98a4b')
    quad(-h, bottom - 0.6 * D, h, bottom, '#8a5a2b')
    ctx.restore()
  }

  // Il prato delle anatre: una striscia d'erba con i ciuffi davanti a te, e il cane che spunta quando un'anatra scappa.
  function drawGrass(v: ReturnType<typeof view>, t: number) {
    const at = (a: number, e: number) => project(sensors.q, dirFrom(yaw0 + a, e), v)
    const h = DUCK.half + 12 * D, top = DUCK.el0 + 1 * D, bottom = DUCK.el0 - 9 * D
    const dog = gameT - dogAt
    if (dog < 1.6) {
      const up = Math.min(1, dog / 0.25, (1.6 - dog) / 0.25) // sale, ride, riscende
      const p = at(0, top + (6 * up - 5) * D)
      const p2 = at(0, top + 5 * D)
      if (p && p2) drawDog(ctx, p.x, p.y, Math.abs(p.y - p2.y) * 0.9, t)
    }
    ctx.save()
    const n = 24
    for (let i = 0; i < n; i++) {
      const a1 = -h + (2 * h * i) / n, a2 = -h + (2 * h * (i + 1)) / n
      const pts = [at(a1, bottom), at(a1, top), at((a1 + a2) / 2, top + (i % 3 ? 1.5 : 3) * D), at(a2, top), at(a2, bottom)]
      if (pts.some((p) => !p)) continue
      ctx.fillStyle = i % 2 ? '#5cb85c' : '#4cae4c'
      ctx.beginPath()
      pts.forEach((p) => ctx.lineTo(p!.x, p!.y))
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
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
    const k = REDUCED ? 1 : 1 + 0.12 * Math.sin(performance.now() / 120)
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
    const time = training ? t('Allenamento') : arcade ? fmt(gameT) : fmt(Math.max(0, opts.duration - gameT))
    const live = multi ? multi.board() : []
    const ammo = gun.shown(performance.now())
    const key = `${score}|${streak}|${ammo}|${shots}|${lives}|${gun.hot()}|${time}|${live.map((l) => l.name + l.score).join()}`
    if (key === hudKey) return
    hudKey = key
    $('score').textContent = String(score)
    $('streak').textContent = streak >= 3 ? t('serie {n}', { n: streak }) : ''
    $('time').textContent = time
    if (multi)
      $('live').innerHTML = live.slice(0, 4).map((l) => `<li class="${l.me ? 'mine' : ''}">${esc(l.name)} <b>${l.score}</b></li>`).join('')
    $('ammo').innerHTML = arcade
      ? `<span class="ammo-free">${t('Colpi')} <b>${lives}</b></span>`
      : booth
      ? `<span class="ammo-free">${t('Colpi')} <b>${BOOTH.shots - shots}</b></span>`
      : opts.heat && !training
      ? `<span class="ammo ${gun.hot() ? 'hot' : ''}">${'<i></i>'.repeat(ammo)}${'<i class="off"></i>'.repeat(AMMO - ammo)}</span>`
      : `<span class="ammo-free">${t('Colpi infiniti')}</span>`
  }

  function finish(aborted: boolean) {
    if (phase === 'fine') return
    phase = 'fine'
    cancelAnimationFrame(raf)
    offTrigger()
    document.removeEventListener('visibilitychange', onHide)
    sensors.onShake = () => {}
    z3?.dispose()
    closeStage()
    if (multi) {
      report()
      return onEnd(null) // la classifica la mostra la lobby, per tutti
    }
    if (aborted || training) return onEnd(null)
    play('end')
    const name = settings.name || t('Senza nome')
    const rank = saveRecord(recordKey(opts.diff, arcade ? 0 : opts.duration, booth ? 'chiosco' : clay ? 'piattello' : ducks ? 'anatre' : zombi ? 'zombi' : 'tiro'), { name, score, acc: shots ? good / shots : 0, streak: best, date: Date.now() })
    onEnd({ ...opts, score, shots, good, best, rank })
  }
}

// Il piattello: un disco arancione visto un po' di sbieco, che gira mentre vola.
export function drawClay(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, kind: string) {
  const col = kind === 'dorato' ? GOLD : '#ff8a3d'
  const tilt = 0.45 + 0.15 * Math.sin(t * 9)
  c.save()
  c.translate(x, y)
  c.lineWidth = Math.max(1.5, r * 0.12)
  c.strokeStyle = 'rgba(40,30,60,0.6)'
  c.fillStyle = '#c4561d'
  c.beginPath()
  c.ellipse(0, r * 0.12, r, r * tilt, 0, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = col
  c.beginPath()
  c.ellipse(0, 0, r, r * tilt, 0, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  c.fillStyle = 'rgba(255,255,255,0.45)'
  c.beginPath()
  c.ellipse(0, 0, r * 0.45, r * tilt * 0.45, 0, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

// L'anatra di profilo: corpo, testa verde, becco arancione e ala che sbatte. Quando scappa sbatte più forte.
export function drawDuck(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, kind: string, face: number, flee: boolean) {
  const body = kind === 'dorato' ? GOLD : kind === 'veloce' ? '#5b8def' : '#a0703c'
  const flap = Math.sin(t * (flee ? 30 : 16))
  c.save()
  c.translate(x, y)
  c.scale(face < 0 ? -1 : 1, 1)
  c.lineWidth = Math.max(1.5, r * 0.08)
  c.strokeStyle = 'rgba(40,30,60,0.7)'
  c.fillStyle = body
  c.beginPath()
  c.ellipse(0, 0, r, r * 0.6, 0, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  c.fillStyle = kind === 'dorato' ? '#fff3b0' : '#2e9e5b'
  c.beginPath()
  c.arc(r * 0.85, -r * 0.5, r * 0.38, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  c.fillStyle = '#ff9f1c'
  c.beginPath()
  c.moveTo(r * 1.15, -r * 0.55)
  c.lineTo(r * 1.6, -r * 0.42)
  c.lineTo(r * 1.15, -r * 0.3)
  c.closePath()
  c.fill()
  c.stroke()
  c.fillStyle = '#fff'
  c.beginPath()
  c.arc(r * 0.95, -r * 0.6, r * 0.12, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#222'
  c.beginPath()
  c.arc(r * 0.98, -r * 0.6, r * 0.06, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = kind === 'dorato' ? '#e0b000' : '#f4e9d0'
  c.beginPath()
  c.moveTo(-r * 0.3, -r * 0.1)
  c.quadraticCurveTo(-r * 0.1, -r * (0.4 + 0.9 * flap), r * 0.4, -r * 0.1)
  c.closePath()
  c.fill()
  c.stroke()
  c.restore()
}

// Il cane che ride, solo la testa sopra l'erba: y è il mento, s l'altezza.
function drawDog(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  const k = Math.sin(t * 20) * s * 0.03 // ridacchia
  c.save()
  c.translate(x, y + k)
  c.lineWidth = Math.max(1.5, s * 0.04)
  c.strokeStyle = 'rgba(40,30,60,0.7)'
  c.fillStyle = '#7a4a24'
  for (const sx of [-1, 1]) {
    c.beginPath()
    c.ellipse(sx * s * 0.38, -s * 0.62, s * 0.13, s * 0.3, sx * 0.3, 0, Math.PI * 2)
    c.fill()
    c.stroke()
  }
  c.fillStyle = '#c98a4b'
  c.beginPath()
  c.ellipse(0, -s * 0.5, s * 0.36, s * 0.42, 0, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  c.fillStyle = '#f4dcc0'
  c.beginPath()
  c.ellipse(0, -s * 0.28, s * 0.22, s * 0.16, 0, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#222'
  c.beginPath()
  c.arc(0, -s * 0.38, s * 0.06, 0, Math.PI * 2)
  c.fill()
  c.lineWidth = Math.max(1.5, s * 0.035)
  c.strokeStyle = '#222'
  for (const sx of [-1, 1]) { // occhi chiusi dal ridere
    c.beginPath()
    c.arc(sx * s * 0.14, -s * 0.6, s * 0.06, Math.PI, 0)
    c.stroke()
  }
  c.fillStyle = '#e8506e'
  c.beginPath()
  c.arc(0, -s * 0.24, s * 0.09, 0, Math.PI)
  c.fill()
  c.restore()
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export function fmt(s: number) {
  const n = Math.ceil(s)
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}
