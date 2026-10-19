import { play, setVolume } from './audio.ts'
import { fmt } from './game.ts'
import { icon } from './icons.ts'
import { D } from './math.ts'
import { createDetector, drawMarker, markerUnder, type Detector, type Marker } from './markers.ts'
import type { Net } from './net.ts'
import { COUNTDOWN_MS, endAt, participants, remaining, RATE_MS, status, TEAMS, type Ev, type Player, type Room } from './rules.ts'
import { mode, sensors } from './sensors.ts'
import { settings } from './settings.ts'
import {
  aimPoint, beamFx, burstFx, closeStage, ctx, drawCrosshair, drawFx, hitmarkerFx, hud, openStage, say, size, sparkFx, textFx,
} from './stage.ts'
import { onTrigger } from './trigger.ts'

const RELOAD_PITCH = 60 * D

// Il colore di chi spara: quello della squadra, oppure il suo. Mai rosso per chi viene colpito: giallo brillante.
export const shooterColor = (r: Room, p: Player | undefined) =>
  !p ? '#ffd23f' : r.config.mode === 'squadre' ? TEAMS[p.team].color : p.color === '#ff5a5f' ? '#ffd23f' : p.color

export async function playLaser(net: Net, onEnd: () => void) {
  let room = net.room!
  const me = () => room.players.find((p) => p.id === net.me)
  const isDir = () => room.dirId === net.me
  const color = () => shooterColor(room, me())
  let ammo = room.config.ammo
  let lastShot = -1e9
  let upSince = 0
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
      ${isDir() ? `<button class="hud-btn" data-a="pausa" aria-label="Pausa per tutti">${icon('pause')}</button>` : ''}
      <button class="hud-btn" data-a="esci" aria-label="Esci">${icon('close')}</button>
    </div>
    <div class="hud-ml pill"><b data-score>0</b><small>punti</small><small data-team></small></div>
    <div class="hud-mr pill"><b data-time></b><small data-shield hidden>${icon('shield', 14)} scudo</small></div>
    <div class="hud-flash" data-flash></div>
    <div class="hud-msg" hidden></div>
    <div class="hud-full" data-out hidden>Fuori gioco<small data-outt></small></div>
    <div class="hud-full" data-pause hidden>Pausa
      ${isDir() ? `<small>Tocca ${icon('play', 18)} in alto a destra per riprendere</small><button class="btn primary lt-stop" data-a="fine">${icon('stop', 20)}Termina la partita</button>` : '<small>Aspetta il regista</small>'}
    </div>
    <div class="hud-full" data-portrait hidden>Gira il telefono in orizzontale</div>
    <pre class="hud-debug" data-debug ${settings.debug ? '' : 'hidden'}></pre>`
  const $ = (s: string) => hud.querySelector<HTMLElement>(`[data-${s}]`)!

  hud.addEventListener('click', onClick)
  function onClick(e: Event) {
    const a = (e.target as HTMLElement).closest('button')?.dataset.a
    if (a === 'esci' && confirm('Esci dalla partita? Puoi rientrare dalla lobby.')) finish()
    if (a === 'pausa') net.send({ t: 'pause', on: !room.pausedAt })
    if (a === 'fine' && confirm('Terminare la partita per tutti?')) net.send({ t: 'stop' })
  }

  const offTrigger = onTrigger(document.getElementById('stage')!, fire)
  sensors.onShake = () => say('Piano! Si cammina', 2000, 'warn')
  const prevState = net.onState
  net.onState = onState

  try {
    await openStage()
  } catch {
    finish()
    alert('Non riesco ad aprire la fotocamera. Controlla il permesso nelle impostazioni del browser.')
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
      say(`Ti ha preso ${by?.name ?? 'qualcuno'}!`, 1600, 'warn')
    }
    if (ev.by === net.me) {
      const [ax, ay] = aimPoint()
      textFx(ax, ay, ev.out ? '+4' : '+1', '#ffffff')
      if (ev.out) say(`${to?.name ?? ''} è fuori gioco!`, 1500)
    }
  }

  // Il marker sotto il mirino è un avversario che si può colpire adesso?
  function target(ms: Marker[], x: number, y: number, now: number) {
    const m = markerUnder(ms, x, y)
    if (!m) return null
    const self = me()
    const p = participants(room).find((p) => p.marker === m.num && p.id !== net.me)
    if (!p || !self) return null
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
    if (sensors.pitch > RELOAD_PITCH) return // durante la ricarica non si spara
    if (room.config.ammo && ammo <= 0) {
      play('click')
      say('Ricarica! Alza il fucile', 1500, 'warn')
      return
    }
    lastShot = now
    if (room.config.ammo) ammo--
    // effetto subito, nello stesso frame del tocco; l'esito arriva appena il riconoscimento risponde
    const rate = room.config.mode === 'squadre' ? [1.15, 0.87][self.team] : 1
    play('pew', 1, rate)
    beamFx(color())
    const [ax, ay] = aimPoint()
    const ms = await det.fresh()
    const hit = target(ms, ax, ay, net.serverNow())
    net.send({ t: 'shot', marker: markerUnder(ms, ax, ay)?.num ?? null })
    if (!hit) return sparkFx(ax, ay)
    glow = { m: hit.m, t: performance.now() }
    play('hit')
    burstFx(ax, ay, [color(), hit.p.color, '#ffffff', '#ffd23f'])
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
      say('Via!', 700, 'huge')
    } else if (left > COUNTDOWN_MS && !lastCount) {
      lastCount = 4
      say('Si parte tra poco...')
    }

    // fuori gioco: 8 secondi, poi di nuovo in gioco con lo scudo
    const st = self ? status(self, sNow) : 'in gioco'
    $('out').hidden = st !== 'fuori'
    if (st === 'fuori') {
      $('outt').textContent = `Di nuovo in gioco tra ${Math.ceil((self!.outUntil - sNow) / 1000)}`
      ammo = room.config.ammo
    }
    if (wasOut && st !== 'fuori') {
      play('rientro')
      say('Di nuovo in gioco!', 1500)
    }
    wasOut = st === 'fuori'
    $('shield').hidden = st !== 'protetto'

    // ricarica: fucile alzato oltre 60 gradi per mezzo secondo
    if (room.config.ammo && st === 'in gioco') {
      if (sensors.pitch > RELOAD_PITCH) {
        upSince ||= now
        if (ammo < room.config.ammo && now - upSince > 500) {
          ammo = room.config.ammo
          net.send({ t: 'reload' })
          play('reload')
          say('Carico!', 800)
        } else if (ammo < room.config.ammo) say('Ricarica...', 0)
      } else if (upSince) {
        upSince = 0
        if (hud.querySelector('.hud-msg')!.textContent === 'Ricarica...') say('')
      }
    }

    det!.tick(now)
    const ms = now - det!.state.at < 300 ? det!.state.markers : []
    ctx.clearRect(0, 0, size.w, size.h)
    const [ax, ay] = aimPoint()
    const t = target(ms, ax, ay, sNow)
    for (const m of ms) if (m !== t?.m) drawMarker(ctx, m, 'rgba(255,255,255,0.55)', 2)
    if (t) drawMarker(ctx, t.m, color(), 4)
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
    drawCrosshair(ax, ay, canShoot && !!t, color())

    const fl = Math.max(0, 1 - (now - flashT) / 500)
    $('flash').style.opacity = String(fl)
    $('flash').style.setProperty('--fc', flashColor)
    updateHud(sNow)
    if (settings.debug)
      $('debug').textContent = `fps ${fps.toFixed(0)}  marker ${det!.state.fps.toFixed(0)} al secondo, ${det!.state.ms.toFixed(0)} ms\n` +
        `visti ${ms.map((m) => m.num).join(', ') || 'nessuno'}  beccheggio ${(sensors.pitch / D).toFixed(0)}\n` +
        `orologio ${net.offset.toFixed(0)} ms  ${net.online ? 'in linea' : 'disconnesso'}`
  }

  let hudKey = ''
  function updateHud(sNow: number) {
    const self = me()
    if (!self) return
    const c = room.config
    const life = self.life <= 0 && sNow >= self.outUntil ? c.life : self.life
    const time = fmt(remaining(room, sNow) / 1000)
    const key = `${life}|${ammo}|${self.score}|${time}|${net.online}`
    if (key === hudKey) return
    hudKey = key
    $('life').innerHTML = Array.from({ length: c.life }, (_, i) => `<i class="${i < life ? '' : 'off'}">${icon('heart', 20)}</i>`).join('')
    $('ammo').innerHTML = c.ammo
      ? `<span class="ammo">${'<i></i>'.repeat(ammo)}${'<i class="off"></i>'.repeat(c.ammo - ammo)}</span>`
      : '<span class="ammo-free">Colpi infiniti</span>'
    $('score').textContent = String(self.score)
    $('team').textContent = c.mode === 'squadre' ? TEAMS[self.team].name : ''
    $('time').textContent = net.online ? time : 'Rete...'
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
