import { audioState, play, setVolume } from './audio.ts'
import { fmt } from './game.ts'
import { icon } from './icons.ts'
import { D } from './math.ts'
import { createDetector, drawMarker, markerUnder, type Detector, type Marker } from './markers.ts'
import type { Net } from './net.ts'
import { COUNTDOWN_MS, endAt, OUT_MS, participants, practice, remaining, RATE_MS, status, TEAMS, type Ev, type Player, type Room } from './rules.ts'
import { mode, sensors } from './sensors.ts'
import { settings } from './settings.ts'
import {
  aimPoint, beamFx, burstFx, closeStage, ctx, drawCrosshair, drawFx, hitmarkerFx, hud, openStage, say, size, sparkFx, textFx, video,
} from './stage.ts'
import { heat, onTrigger } from './trigger.ts'
import { t } from './i18n.ts'


// Il colore di chi spara: quello della squadra, oppure il suo. Mai rosso per chi viene colpito: giallo brillante.
export const shooterColor = (r: Room, p: Player | undefined) =>
  !p ? '#ffd23f' : r.config.mode === 'squadre' ? TEAMS[p.team].color : p.color === '#ff5a5f' ? '#ffd23f' : p.color

export async function playLaser(net: Net, onEnd: () => void) {
  let room = net.room!
  const me = () => room.players.find((p) => p.id === net.me)
  const isDir = () => room.dirId === net.me
  const color = () => shooterColor(room, me())
  const gun = heat(room.config.ammo)
  let lastShot = -1e9
  let lastCount = 0
  let wasOut = false
  let flashT = 0
  let flashColor = '#ffd23f'
  let glow: { m: Marker; t: number } | null = null
  let raf = 0
  let done = false
  let fps = 0, lastNow = performance.now()
  let det: Detector | null = null

  hud.innerHTML = `
    <div class="hud-tl pill lt-life"><span data-life></span><span data-ammo></span></div>
    <div class="hud-tr">
      ${isDir() ? `<button class="hud-btn" data-a="pausa" aria-label="${t('Pausa per tutti')}">${icon('pause')}</button>` : ''}
      <button class="hud-btn" data-a="esci" aria-label="${t('Esci')}">${icon('close')}</button>
    </div>
    <div class="hud-ml pill"><b data-score>0</b><small>${t('punti')}</small><small data-team></small></div>
    <div class="hud-mr pill"><b data-time></b><small data-shield hidden>${icon('shield', 14)} ${t('scudo')}</small></div>
    <div class="hud-flash" data-flash></div>
    <div class="hud-msg" hidden></div>
    <div class="hud-full lt-out" data-out hidden><span class="drain" data-drain></span>${t('Fuori gioco')}<span class="out-hearts" data-outh></span><small data-outt></small></div>
    <div class="hud-full" data-pause hidden>${t('Pausa')}
      ${isDir() ? `<small>${t('Tocca {icon} in alto a destra per riprendere', { icon: icon('play', 18) })}</small><button class="btn primary lt-stop" data-a="fine">${icon('stop', 20)}${t('Termina la partita')}</button>` : `<small>${t('Aspetta il regista')}</small>`}
    </div>
    <div class="hud-full" data-portrait hidden>${t('Gira il telefono in orizzontale')}</div>
    <pre class="hud-debug" data-debug ${settings.debug ? '' : 'hidden'}></pre>`
  const $ = (s: string) => hud.querySelector<HTMLElement>(`[data-${s}]`)!

  hud.addEventListener('click', onClick)
  function onClick(e: Event) {
    const a = (e.target as HTMLElement).closest('button')?.dataset.a
    if (a === 'esci' && confirm(t('Esci dalla partita? Puoi rientrare dalla lobby.'))) finish()
    if (a === 'pausa') net.send({ t: 'pause', on: !room.pausedAt })
    if (a === 'fine' && confirm(t('Terminare la partita per tutti?'))) net.send({ t: 'stop' })
  }

  const offTrigger = onTrigger(document.getElementById('stage')!, fire)
  sensors.onShake = () => say(t('Piano! Si cammina'), 2000, 'warn')
  const prevState = net.onState
  net.onState = onState

  try {
    await openStage()
  } catch {
    finish()
    alert(t('Non riesco ad aprire la fotocamera. Controlla il permesso nelle impostazioni del browser.'))
    return
  }
  if (done) return
  // i telefoni senza giroscopio sono anche i più lenti: meno analisi al secondo
  det = createDetector(mode() === 'giroscopio' ? 15 : 11)
  raf = requestAnimationFrame(frame)
  setVolume(settings.volume * room.volume)

  function onState(r: Room, ev?: Ev) {
    room = r
    setVolume(settings.volume * r.volume)
    if (r.phase !== 'gioco') return finish()
    if (ev?.k !== 'hit') return
    const by = r.players.find((p) => p.id === ev.by)
    const to = r.players.find((p) => p.id === ev.to)
    if (ev.to === net.me) {
      flashT = performance.now()
      flashColor = shooterColor(r, by)
      play('colpito', 1.6) // più forte: tutti nella stanza sentono chi è stato preso
      navigator.vibrate?.(ev.out ? [80, 60, 200] : 120)
      if (ev.out) play('fuori')
      say(t('Ti ha preso {name}!', { name: by?.name ?? t('qualcuno') }), 1600, 'warn')
    }
    if (ev.by === net.me) {
      const [ax, ay] = aimPoint()
      textFx(ax, ay, ev.out ? '+4' : '+1', '#ffffff')
      if (ev.out) say(t('{name} è fuori gioco!', { name: to?.name ?? '' }), 1500)
    }
  }

  // Fogli di prova: i cuori si contano solo su questo telefono, come per un avversario vero.
  const sheets: Record<number, { life: number; outUntil: number }> = {}
  function sheet(n: number) {
    const s = (sheets[n] ??= { life: room.config.life, outUntil: 0 })
    if (s.life <= 0 && performance.now() >= s.outUntil) s.life = room.config.life
    return s
  }

  // Il marker sotto il mirino è un avversario che si può colpire adesso?
  function target(ms: Marker[], x: number, y: number, now: number) {
    const m = markerUnder(ms, x, y)
    if (!m) return null
    const self = me()
    const p = participants(room).find((p) => p.marker === m.num && p.id !== net.me)
    if (!self) return null
    if (!p) return practice(room, self, m.num) && sheet(m.num).life > 0 ? { m, p: null } : null
    if (room.config.mode === 'squadre' && p.team === self.team) return null
    if (status(p, now) !== 'in gioco') return null
    return { m, p }
  }

  async function fire() {
    const now = performance.now()
    const sNow = net.serverNow()
    const self = me()
    if (done || !det || !self || size.h > size.w) return
    if (room.pausedAt || sNow < room.startAt || sNow >= endAt(room) || status(self, sNow) !== 'in gioco') return
    if (now - lastShot < RATE_MS) return
    if (!gun.take(now)) return play('click') // scotta ancora
    lastShot = now
    // effetto subito, nello stesso frame del tocco; l'esito arriva appena il riconoscimento risponde
    const rate = room.config.mode === 'squadre' ? [1.15, 0.87][self.team] : 1
    play('pew', 1, rate)
    beamFx(color())
    const [ax, ay] = aimPoint()
    const ms = await det.fresh()
    const hit = target(ms, ax, ay, net.serverNow())
    const under = markerUnder(ms, ax, ay)
    const out = !hit && under && practice(room, self, under.num) // foglio di prova fuori gioco: niente punto
    net.send({ t: 'shot', marker: out ? null : under?.num ?? null })
    if (!hit) {
      // marker visto ma non colpibile: si dice perché, così si capisce che il riconoscimento funziona
      if (under) say(why(under.num, net.serverNow()), 1400, 'warn')
      return sparkFx(ax, ay)
    }
    glow = { m: hit.m, t: performance.now() }
    if (!hit.p) {
      const s = sheet(hit.m.num)
      if (--s.life <= 0) {
        s.outUntil = performance.now() + OUT_MS
        say(t('Il foglio {n} è fuori gioco!', { n: hit.m.num }), 1500)
      }
    }
    play('hit')
    burstFx(ax, ay, [color(), hit.p?.color ?? '#ffd23f', '#ffffff', '#ffd23f'])
    hitmarkerFx(ax, ay)
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, (now - lastNow) / 1000)
    lastNow = now
    fps += (1 / Math.max(dt, 0.001) - fps) * 0.05
    const sNow = net.serverNow()
    const self = me()
    const portrait = size.h > size.w
    $('portrait').hidden = !portrait
    $('pause').hidden = !room.pausedAt
    const pb = hud.querySelector<HTMLElement>('[data-a="pausa"]')
    if (pb) pb.innerHTML = icon(room.pausedAt ? 'play' : 'pause')

    // conto alla rovescia sincronizzato con l'ora del server
    const left = room.startAt - sNow
    if (left > 0 && left <= COUNTDOWN_MS) {
      const n = Math.ceil(left / 1000)
      if (n !== lastCount) {
        lastCount = n
        play('beep')
        say(String(n), 0, 'huge')
      }
    } else if (left <= 0 && lastCount > 0) {
      lastCount = 0
      play('go')
      say(t('Via!'), 700, 'huge')
    } else if (left > COUNTDOWN_MS && !lastCount) {
      lastCount = 4
      say(t('Si parte tra poco...'))
    }

    // fuori gioco: 8 secondi, poi di nuovo in gioco con lo scudo
    const st = self ? status(self, sNow) : 'in gioco'
    $('out').hidden = st !== 'fuori'
    if (st === 'fuori') {
      // il velo si svuota e i cuori si riaccendono uno alla volta man mano che passa il tempo
      const left = Math.max(0, Math.min(1, (self!.outUntil - sNow) / OUT_MS))
      $('drain').style.setProperty('--left', String(left))
      const lit = Math.floor((1 - left) * room.config.life)
      const key = `${lit}`
      if ($('outh').dataset.k !== key) {
        $('outh').dataset.k = key
        $('outh').innerHTML = Array.from({ length: room.config.life }, (_, i) => `<i class="${i < lit ? '' : 'off'}">${icon('heart', 34)}</i>`).join('')
      }
      $('outt').textContent = t('Di nuovo in gioco tra {s}', { s: Math.ceil((self!.outUntil - sNow) / 1000) })
      gun.reset()
    }
    if (wasOut && st !== 'fuori') {
      play('rientro')
      say(t('Di nuovo in gioco!'), 1500)
    }
    wasOut = st === 'fuori'
    $('shield').hidden = st !== 'protetto'

    gun.tick(now)

    det!.tick(now)
    const ms = now - det!.state.at < 300 ? det!.state.markers : []
    ctx.clearRect(0, 0, size.w, size.h)
    const [ax, ay] = aimPoint()
    const aimed = target(ms, ax, ay, sNow)
    for (const m of ms) badge(m, sNow)
    if (aimed) drawMarker(ctx, aimed.m, color(), 4)
    // il marker colpito si illumina per un istante
    if (glow && now - glow.t < 250) {
      ctx.save()
      ctx.globalAlpha = 1 - (now - glow.t) / 250
      ctx.shadowColor = color()
      ctx.shadowBlur = 18
      drawMarker(ctx, glow.m, '#ffffff', 7)
      ctx.restore()
    }
    drawFx()
    const canShoot = !room.pausedAt && st === 'in gioco' && left <= 0
    drawCrosshair(ax, ay, canShoot && !!aimed, color())

    const fl = Math.max(0, 1 - (now - flashT) / 500)
    $('flash').style.opacity = String(fl)
    $('flash').style.setProperty('--fc', flashColor)
    updateHud(sNow)
    if (settings.debug)
      $('debug').textContent = `fps ${fps.toFixed(0)}  marker ${det!.state.fps.toFixed(0)} al secondo, ${det!.state.ms.toFixed(0)} ms\n` +
        `video ${video.videoWidth}x${video.videoHeight}  visti ${ms.map((m) => m.num).join(', ') || 'nessuno'}${ms[0] ? ` (lato ${ms[0].side.toFixed(0)} px)` : ''}  beccheggio ${(sensors.pitch / D).toFixed(0)}\n` +
        `orologio ${net.offset.toFixed(0)} ms  ${net.online ? 'in linea' : 'disconnesso'}  sensori ${mode()}  audio ${audioState()}`
  }

  function why(num: number, now: number) {
    const p = participants(room).find((p) => p.marker === num)
    if (!p) return me() && practice(room, me()!, num) ? t('Il foglio {n} è fuori gioco', { n: num }) : t('Nessuno in partita ha il numero {n}', { n: num })
    if (p.id === net.me) return t('Questo è il tuo numero!')
    if (room.config.mode === 'squadre' && p.team === me()?.team) return t('{name} è della tua squadra', { name: p.name })
    return status(p, now) === 'fuori' ? t('{name} è fuori gioco', { name: p.name }) : t('{name} ha lo scudo', { name: p.name })
  }

  // Sopra il marker si disegna il bersaglio del giocatore con nome, cuori e punti. Il riconoscimento usa il video, non il disegno.
  function badge(m: Marker, now: number) {
    const p = room.players.find((p) => p.marker === m.num)
    const self = me()
    if (!p && self && practice(room, self, m.num)) {
      const s = sheet(m.num)
      return s.life > 0
        ? rings(m, '#ffd23f', [t('Foglio {n}', { n: m.num }), '\u2665'.repeat(s.life)], 0.92, true)
        : rings(m, '#9aa3ad', [t('Foglio {n}', { n: m.num }), t('fuori gioco')], 0.6)
    }
    if (!p) return drawMarker(ctx, m, 'rgba(255,255,255,0.55)', 2)
    const st = status(p, now)
    const life = p.life <= 0 && now >= p.outUntil ? room.config.life : p.life
    rings(
      m,
      st === 'fuori' ? '#9aa3ad' : room.config.mode === 'squadre' ? TEAMS[p.team].color : p.color,
      [p.name, st === 'fuori' ? t('fuori gioco') : '\u2665'.repeat(Math.max(0, life)) + (st === 'protetto' ? ' ' + t('scudo') : ''), t('{n} punti', { n: p.score })],
      st === 'fuori' ? 0.6 : 0.92,
      st !== 'fuori',
    )
  }

  function rings(m: Marker, c: string, lines: string[], alpha = 0.92, hearts = false) {
    const cx = m.pts.reduce((s, q) => s + q[0], 0) / 4
    const cy = m.pts.reduce((s, q) => s + q[1], 0) / 4
    const r = Math.max(18, Math.hypot(m.pts[0][0] - m.pts[2][0], m.pts[0][1] - m.pts[2][1]) * 0.5)
    ctx.save()
    ctx.globalAlpha = alpha
    ;[c, '#ffffff', c, '#ffffff', c].forEach((col, i) => {
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(cx, cy, r * (1 - i * 0.2), 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1
    const fs = Math.max(13, Math.min(26, r * 0.45))
    ctx.font = `800 ${fs}px 'Baloo 2 Variable', system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    lines.forEach((s, i) => {
      const y = cy - r - fs * (lines.length - i - 0.6)
      ctx.fillStyle = hearts && i === 1 ? '#ff6fae' : '#ffffff' // cuori rosa come nella HUD
      ctx.strokeText(s, cx, y)
      ctx.fillText(s, cx, y)
    })
    ctx.restore()
  }

  let hudKey = ''
  function updateHud(sNow: number) {
    const self = me()
    if (!self) return
    const c = room.config
    const life = self.life <= 0 && sNow >= self.outUntil ? c.life : self.life
    const time = fmt(remaining(room, sNow) / 1000)
    const ammo = gun.shown(performance.now())
    const key = `${life}|${ammo}|${gun.hot()}|${self.score}|${time}|${net.online}`
    if (key === hudKey) return
    hudKey = key
    $('life').innerHTML = Array.from({ length: c.life }, (_, i) => `<i class="${i < life ? '' : 'off'}">${icon('heart', 20)}</i>`).join('')
    $('ammo').innerHTML = c.ammo
      ? `<span class="ammo ${gun.hot() ? 'hot' : ''}">${'<i></i>'.repeat(ammo)}${'<i class="off"></i>'.repeat(c.ammo - ammo)}</span>`
      : `<span class="ammo-free">${t('Colpi infiniti')}</span>`
    $('score').textContent = String(self.score)
    $('team').textContent = c.mode === 'squadre' ? TEAMS[self.team].name : ''
    $('time').textContent = net.online ? time : t('Rete...')
  }

  function finish() {
    if (done) return
    done = true
    cancelAnimationFrame(raf)
    offTrigger()
    hud.removeEventListener('click', onClick)
    sensors.onShake = () => {}
    net.onState = prevState
    det?.dispose()
    closeStage()
    setVolume(settings.volume)
    onEnd()
  }
}
