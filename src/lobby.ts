import qrcode from 'qrcode-generator'
import { setVolume } from './audio.ts'
import { fmt, playSolo } from './game.ts'
import { icon } from './icons.ts'
import { playLaser, shooterColor } from './lasertag.ts'
import { connect, createRoom, type Net } from './net.ts'
import { COLORS, DURATIONS, isReady, REFS, remaining, SHARED_SIZE, markerTaken as taken, MAX_MARKER, participants, status, teamScores, TEAMS, type Config, type Player, type Room, type Standing } from './rules.ts'
import type { Theme } from './targets.ts'
import { THEMES } from './themes.ts'
import { mode, sensors, startSensors } from './sensors.ts'
import { saveSettings, settings } from './settings.ts'
import { app, esc, goFullscreen, on, render } from './ui.ts'
import { t } from './i18n.ts'

const MODES = { ffa: t('Tutti contro tutti'), squadre: t('Due squadre') }
const GAMES = { laser: t('Laser tag'), sfida: t('Sfida a bersagli'), condivisi: t('Bersagli condivisi') }
const DIFFS = { facile: t('Facile'), media: t('Media'), difficile: t('Difficile') }
// nomi delle squadre e REFS vengono da file condivisi (anche col server): si traducono qui
const teamName = (i: number) => t(TEAMS[i].name)
const teamShort = (i: number) => t(TEAMS[i].name.replace('Squadra ', ''))
// i numeri doppi contano solo nel laser tag, dove il marker è il bersaglio
const markerTaken = (r: Room, p: Player) => r.config.game === 'laser' && taken(r, p)
const summary = (c: Config) => `${GAMES[c.game]}: ${MODES[c.mode]}, ` + (c.game !== 'laser' ? `${THEMES[c.theme]}, ${DIFFS[c.diff]}, ` : '') + fmt(c.duration)
let back: () => void = () => {}

// Crea partita: questo telefono diventa il regista.
export async function createGame(onBack: () => void) {
  back = onBack
  render(`<p class="note center">${t('Creo la partita...')}</p>`)
  try {
    enter(await createRoom())
  } catch {
    alert(t('Non riesco a creare la partita. Serve la connessione a internet.'))
    back()
  }
}

// Entra in partita con il codice di 4 lettere (o dal link del QR).
export function joinScreen(onBack: () => void, code = '') {
  back = onBack
  render(`
    <header class="bar"><button class="btn small" data-back>${icon('back', 20)}${t('Menu')}</button><h2>${t('Entra in partita')}</h2></header>
    <div class="join">
      <label class="field">${t('Il codice della partita')}
        <input class="code" data-code maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${esc(code)}">
      </label>
      <label class="field">${t('Il tuo nome')}
        <input class="name" data-name maxlength="12" autocomplete="off" placeholder="${t('Scrivilo qui')}" value="${esc(settings.name)}">
      </label>
      <button class="big primary" data-join>${icon('enter', 30)}${t('Entra')}</button>
      <p class="note">${t('Oppure inquadra il QR del regista con la fotocamera del telefono.')}</p>
    </div>`)
  const codeEl = app.querySelector<HTMLInputElement>('[data-code]')!
  const nameEl = app.querySelector<HTMLInputElement>('[data-name]')!
  codeEl.addEventListener('input', () => (codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z]/g, '')))
  on('[data-back]', back)
  on('[data-join]', () => {
    if (codeEl.value.length !== 4) return codeEl.focus()
    if (!nameEl.value.trim()) return nameEl.focus()
    settings.name = nameEl.value.trim()
    saveSettings()
    enter(codeEl.value)
  })
}

type View = 'lobby' | 'gioco' | 'fuori' | 'risultati'

function enter(code: string) {
  history.replaceState(null, '', `/?r=${code}`) // ricaricando la pagina si rientra nella stessa stanza
  const net = connect(code, () => ({ name: settings.name || t('Senza nome'), color: settings.color, marker: settings.marker }))
  let view: View = 'lobby'
  let lastPhase = ''
  render(`<p class="note center">${t('Mi collego alla partita...')}</p>`)

  const leave = () => {
    clearInterval(tick)
    net.close()
    history.replaceState(null, '', '/')
    back()
  }
  let wasResting = false
  const tick = setInterval(() => {
    // aggiorna i tempi senza ridisegnare tutto: plancia del regista e pausa tra i round
    const r = net.room
    if (!r || app.hidden) return
    if (view === 'gioco' && r.phase === 'gioco') return updateBoard(net)
    const resting = r.restUntil > net.serverNow()
    const rest = app.querySelector('[data-rest]')
    if (rest) rest.textContent = resting ? t('Pausa tra i round, per far riposare i telefoni: ancora {time}', { time: fmt((r.restUntil - net.serverNow()) / 1000) }) : ''
    if (wasResting && !resting) show() // riattiva il pulsante Via
    wasResting = resting
  }, 1000)

  net.onStatus = () => {
    if (net.error) {
      alert(t(net.error)) // i messaggi del server sono in italiano
      return leave()
    }
    app.querySelector('[data-net]')?.toggleAttribute('hidden', net.online)
  }
  net.onState = (r) => {
    if (r.phase !== lastPhase) {
      if (r.phase === 'gioco') view = 'gioco'
      else if (lastPhase === 'gioco') view = r.results ? 'risultati' : 'lobby'
      lastPhase = r.phase
    }
    setVolume(settings.volume * r.volume)
    show()
  }

  function show() {
    const r = net.room
    if (!r) return
    const me = r.players.find((p) => p.id === net.me)
    const isDir = r.dirId === net.me
    const plays = !isDir || r.config.plays
    if (view === 'gioco' && r.phase === 'gioco') {
      if (!plays) return board(net)
      if (app.hidden) return
      if (r.config.game !== 'laser' && mode() !== 'giroscopio' && mode() !== 'bussola') {
        view = 'fuori'
        alert(t('Questo telefono non sa quando ti giri, quindi non vede i bersagli intorno. Per lui arriverà la modalità Bersagli sui muri.'))
        return show()
      }
      app.hidden = true
      goFullscreen()
      const back = () => {
        app.hidden = false
        if (net.room?.phase === 'gioco') view = 'fuori' // uscito a metà: può rientrare
        net.onState(net.room!) // la fine del round può averla vista il gioco: ora la vede la lobby
      }
      if (r.config.game === 'laser') playLaser(net, back)
      else playChallenge(net, back)
      return
    }
    if (view === 'risultati' && r.results) return results(r, r.results, () => ((view = 'lobby'), show()))
    if (r.phase === 'gioco') return inGame(r, () => ((view = 'gioco'), show()))
    lobby(net, r, me, isDir, leave)
  }
}

// Sfida a bersagli: il gioco da soli, con seme, tempo e pausa del server. Ognuno spara ai suoi bersagli.
function playChallenge(net: Net, done: () => void) {
  const r = net.room!
  const c = r.config
  playSolo({ theme: c.theme, diff: c.diff, duration: c.duration, heat: c.ammo > 0 }, done, {
    seed: r.seed,
    clock: () => {
      const room = net.room!
      const now = net.serverNow()
      return { t: now < room.startAt ? (now - room.startAt) / 1000 : (room.config.duration * 1000 - remaining(room, now)) / 1000, paused: !!room.pausedAt }
    },
    ended: () => net.room?.phase !== 'gioco',
    isDir: r.dirId === net.me,
    pause: (on) => net.send({ t: 'pause', on }),
    report: (s) => net.send({ t: 'score', ...s }),
    board: () => {
      const room = net.room!
      const ps = participants(room)
      if (room.config.mode !== 'squadre') return [...ps].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, score: p.score, me: p.id === net.me }))
      // a squadre: i totali delle due squadre
      const mine = ps.find((p) => p.id === net.me)?.team
      const tot = teamScores(ps.map((p) => ({ ...p, acc: 0 })))
      return [0, 1].map((k) => ({ name: teamShort(k), score: tot[k], me: k === mine })).sort((a, b) => b.score - a.score)
    },
    color: c.mode === 'squadre' ? TEAMS[r.players.find((p) => p.id === net.me)?.team ?? 0].color : undefined,
    resume: ((p) => p && { score: p.score, shots: p.shots, good: p.hits, best: p.best })(r.players.find((p) => p.id === net.me)),
    shared: c.game !== 'condivisi' ? undefined : {
      ref: c.ref,
      size: SHARED_SIZE,
      me: net.me,
      taken: () => net.room!.taken,
      colorOf: (id) => shooterColor(net.room!, net.room!.players.find((p) => p.id === id)),
      nameOf: (id) => net.room!.players.find((p) => p.id === id)?.name ?? '',
      claim: (id) => net.send({ t: 'claim', id, at: net.serverNow() }),
      score: () => net.room!.players.find((p) => p.id === net.me)?.score ?? 0,
    },
  })
}

function rulesHtml(c: Config) {
  const gun = c.ammo ? t('Dopo {n} colpi il fucile si scalda: aspetta 2 secondi che si raffreddi.', { n: c.ammo }) : t('Colpi infiniti in questa partita.')
  if (c.game === 'condivisi') return rulesBox([
    ['users', t('Prima del via'), t('Mettetevi vicini, puntate tutti {ref} e premete il grilletto. Così i bersagli sono nello stesso posto per tutti.', { ref: t(c.ref) })],
    ['target', t('Si spara'), t('Gli stessi bersagli per tutti: chi lo colpisce prima lo prende, e il bersaglio sparisce anche per gli altri.')],
    ['heart', t('Attenzione'), c.theme === 'zombi' ? t('Gli zombi che arrivano vicino se ne vanno: colpiscili prima!') : t('Non colpire il gattino col cuore: toglie 2 punti.')],
    ['crown', t('Si vince'), c.mode === 'squadre' ? t('Vince la squadra che prende più bersagli.') : t('Vince chi prende più punti. Se i bersagli scivolano, ricentra con il pulsante in alto.')],
  ])
  if (c.game === 'sfida') return rulesBox([
    ['target', t('Si spara'), t('I bersagli compaiono intorno a te: girati, mira e tocca il grilletto. Tutti hanno gli stessi bersagli.')],
    ['zap', t('Colpi'), gun],
    ['heart', t('Attenzione'), c.theme === 'zombi' ? t('Se uno zombi ti arriva vicino ti fa il solletico: un punto in meno.') : t('Non colpire il gattino col cuore: toglie 2 punti.')],
    ['crown', t('Si vince'), c.mode === 'squadre' ? t('Vince la squadra che fa più punti: si sommano i punti di tutti.') : t('Vince chi ha più punti alla fine. La classifica si vede durante la sfida.')],
  ])
  return rulesBox([
    ['target', t('Si spara'), t('Metti il mirino sul foglio di un avversario e tocca il grilletto.')],
    ['zap', t('Colpi'), gun],
    ['heart', t('Fuori gioco'), t('Hai {n} cuori. Quando finiscono stai fuori 8 secondi, poi rientri con lo scudo.', { n: c.life })],
    ['crown', t('Si vince'), c.mode === 'squadre' ? t('Vince la squadra con più punti. Non si colpiscono i compagni.') : t('1 punto per ogni colpo, 3 in più quando mandi qualcuno fuori gioco.')],
  ])
}

function rulesBox(rules: [string, string, string][]) {
  return `<div class="rules">${rules.map(([i, t, d]) => `<div class="rule">${icon(i, 34)}<b>${t}</b><small>${d}</small></div>`).join('')}</div>`
}

function qrSvg(text: string) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
}

function chips(p: Player, r: Room) {
  const c = (ok: boolean, label: string) => `<span class="mini ${ok ? 'ok' : ''}">${label}</span>`
  const sens = r.config.game !== 'laser' ? c(p.ready.gyro, t('giroscopio')) : c(p.ready.sens, t('sensori'))
  return `${c(p.ready.gun, t('fucile'))}${sens}${c(p.ready.cam, t('fotocamera'))}${c(p.ready.cal, t('mirino'))}${markerTaken(r, p) ? `<span class="mini warn">${t('numero doppio')}</span>` : ''}`
}

function lobby(net: Net, r: Room, me: Player | undefined, isDir: boolean, leave: () => void) {
  const c = r.config
  const ps = participants(r)
  const online = ps.filter((p) => p.online)
  const allReady = online.length > 0 && online.every((p) => isReady(p, c) && !markerTaken(r, p))
  const resting = r.restUntil > net.serverNow()
  const link = `${location.origin}/?r=${r.code}`
  const iPlay = !!me && (!isDir || c.plays)
  // pagina ricaricata: il server ricorda "pronto", ma qui i sensori vanno riaccesi con un tocco su Pronto
  if (me?.ready.gun && !sensors.started) net.send({ t: 'ready', ready: { ...me.ready, gun: false } })
  const seg = (key: keyof Config, opts: [unknown, string][]) =>
    `<div class="seg">${opts.map(([v, l]) => `<button class="${c[key] === v ? 'on' : ''}" data-cfg="${key}" data-v='${JSON.stringify(v)}'>${l}</button>`).join('')}</div>`

  render(`
    <header class="bar"><button class="btn small" data-leave>${icon('back', 20)}${t('Esci')}</button><h2>${GAMES[c.game]}</h2>
      <span class="chip warn" data-net ${net.online ? 'hidden' : ''}>${t('Riconnessione...')}</span></header>
    <div class="lobby">
      <section>
        <div class="code-box">${isDir ? `<div class="qr">${qrSvg(link)}</div>` : ''}<div><small>${t('Codice della partita')}</small><b>${r.code}</b>${isDir ? `<small>${t('Gli altri toccano Entra in partita e scrivono il codice, oppure inquadrano il QR.')}</small>` : `<small>${summary(c)}</small>`}</div></div>
        ${isDir ? `
          <h3>${t('Gioco')}</h3>${seg('game', [['laser', GAMES.laser], ['sfida', GAMES.sfida], ['condivisi', GAMES.condivisi]])}
          <h3>${t('Come si gioca')}</h3>${seg('mode', [['ffa', MODES.ffa], ['squadre', MODES.squadre]])}
          ${c.game === 'laser' ? `
          <h3>${t('Durata')}</h3>${seg('duration', DURATIONS[c.game].map((s) => [s, `${s / 60} min`]))}
          <h3>${t('Cuori')}</h3>${seg('life', [[3, '3'], [5, '5'], [7, '7']])}` : `
          <h3>${t('Tema')}</h3>${seg('theme', (Object.keys(THEMES) as Theme[]).map((x) => [x, THEMES[x]]))}
          <div class="two"><div><h3>${t('Difficoltà')}</h3>${seg('diff', Object.entries(DIFFS))}</div>
          <div><h3>${t('Durata')}</h3>${seg('duration', DURATIONS[c.game].map((s) => [s, `${s / 60} min`]))}</div></div>
          ${c.game === 'condivisi' ? `<h3>${t("Cosa puntate tutti all'inizio")}</h3>${seg('ref', REFS.map((x) => [x, t(x)[0].toUpperCase() + t(x).slice(1)]))}` : ''}`}
          <h3>${t('Colpi')}</h3>${seg('ammo', [[0, t('Infiniti')], [10, t('Il fucile si scalda')]])}
          <h3>${t('Il regista')}</h3>${seg('plays', [[true, t('Gioco anche io')], [false, t('Faccio solo il regista')]])}
          <label class="field">${t('Volume per tutti')} <input type="range" min="0" max="1" step="0.1" value="${r.volume}" data-vol></label>`
        : rulesHtml(c)}
      </section>
      <section>
        <h3>${icon('users', 18)} ${t('Giocatori ({n})', { n: ps.length })}</h3>
        <ul class="players">${ps.map((p) => `
          <li class="${p.online ? '' : 'off'}">
            <span class="dot" style="--c:${p.color}"></span>
            <span class="pname"><b>${esc(p.name)}${p.id === net.me ? ` ${t('(tu)')}` : ''}${p.id === r.dirId ? ` · ${t('regista')}` : ''}</b>
              <span class="mchips">${p.online ? chips(p, r) : `<span class="mini">${t('disconnesso')}</span>`}</span></span>
            ${c.game === 'laser' ? `<span class="num" title="${t('Numero del marker')}">${p.marker}</span>` : ''}
            ${c.mode === 'squadre' ? `<button class="team t${p.team}" data-team="${p.id}" ${isDir ? '' : 'disabled'}>${teamShort(p.team)}</button>` : ''}
          </li>`).join('') || `<li class="note">${t('Ancora nessuno. Fai entrare gli altri con il codice.')}</li>`}</ul>
        ${iPlay ? `
          <div class="mine-box">
            ${c.game === 'laser' ? `<label class="field inline">${t('Il mio marker')}
              <select data-marker>${Array.from({ length: MAX_MARKER }, (_, i) => `<option ${i + 1 === me!.marker ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>` : ''}
            <div class="swatches" role="radiogroup" aria-label="${t('Il mio colore')}">${COLORS.map((col, i) => {
              const taken = r.players.some((o) => o !== me && o.color === col)
              return `<button class="sw ${col === me!.color ? 'on' : ''}" data-pcolor="${col}" style="--c:${col}" role="radio" aria-checked="${col === me!.color}" aria-label="${taken ? t('Colore {n}, già preso', { n: i + 1 }) : t('Colore {n}', { n: i + 1 })}" ${taken ? 'disabled' : ''}></button>`
            }).join('')}</div>
            <button class="btn ${me!.ready.gun ? '' : 'primary'}" data-ready>${me!.ready.gun ? t('Fucile non pronto') : `${icon('target', 20)}${t('Ho il fucile pronto')}`}</button>
          </div>
          ${me && !me.ready.cal && me.ready.gun ? `<p class="note">${t('Il mirino non è calibrato: fallo da Prepara il fucile per colpire meglio.')}</p>` : ''}` : ''}
        ${isDir ? `
          <p class="note" data-rest></p>
          <div class="cta-bar">
            <button class="big primary go" data-start ${allReady && !resting ? '' : 'disabled'}>${icon('zap', 30)}${t('Via!')}</button>
            ${!allReady ? `<button class="btn" data-force ${resting || !ps.length ? 'disabled' : ''}>${t('Parti lo stesso')}</button>` : ''}
          </div>` : `<p class="note">${t('Aspetta che il regista faccia partire il gioco.')}</p><p class="note" data-rest></p>`}
      </section>
    </div>
  `)
  on('[data-leave]', () => confirm(t('Esci dalla partita?')) && leave())
  on('[data-cfg]', (el) => net.send({ t: 'config', config: { [el.dataset.cfg!]: JSON.parse(el.dataset.v!) } }))
  on('[data-team]', (el) => net.send({ t: 'team', id: el.dataset.team! }))
  on('[data-start]', () => net.send({ t: 'start' }))
  on('[data-force]', () => confirm(t('Non sono tutti pronti. Partire lo stesso?')) && net.send({ t: 'start' }))
  app.querySelector<HTMLInputElement>('[data-vol]')?.addEventListener('change', (e) => net.send({ t: 'volume', v: Number((e.target as HTMLInputElement).value) }))
  app.querySelector<HTMLSelectElement>('[data-marker]')?.addEventListener('change', (e) => {
    settings.marker = Number((e.target as HTMLSelectElement).value)
    saveSettings()
    net.send({ t: 'marker', marker: settings.marker })
  })
  on('[data-pcolor]', (el) => {
    settings.color = el.dataset.pcolor!
    saveSettings()
    net.send({ t: 'color', color: settings.color })
  })
  on('[data-ready]', async () => {
    if (me!.ready.gun) return net.send({ t: 'ready', ready: { ...me!.ready, gun: false } })
    // controlli dentro il tocco: su iPhone permessi di sensori e fotocamera vanno chiesti da un gesto
    const m = await startSensors()
    let cam = false
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      s.getTracks().forEach((t) => t.stop())
      cam = true
    } catch {}
    if (!cam) alert(t('La fotocamera non si apre. Controlla il permesso nelle impostazioni del browser.'))
    net.send({ t: 'ready', ready: { gun: true, cam, sens: m !== 'spenti' && m !== 'negato', gyro: m === 'giroscopio' || m === 'bussola', cal: !!(settings.offX || settings.offY) } })
  })
}

// Partita in corso ma questo telefono è uscito: si può rientrare.
function inGame(r: Room, rejoin: () => void) {
  render(`
    <header class="bar"><h2>${t('Partita in corso')}</h2></header>
    <p class="note">${MODES[r.config.mode]}. ${t('Rientra quando vuoi: il tuo punteggio è salvo.')}</p>
    <div class="row"><button class="big primary" data-rejoin>${icon('enter', 30)}${t('Rientra in partita')}</button></div>`)
  // dopo aver ricaricato la pagina i sensori sono spenti: si riaccendono qui, dentro il tocco
  on('[data-rejoin]', async () => (await startSensors(), rejoin()))
}

function results(r: Room, s: Standing[], toLobby: () => void) {
  const sfida = r.config.game !== 'laser'
  const teams = r.config.mode === 'squadre' ? teamScores(s) : null
  const win = teams ? (teams[0] === teams[1] ? -1 : teams[0] > teams[1] ? 0 : 1) : -1
  render(`
    <header class="bar"><h2>${t('Fine partita!')}</h2></header>
    ${teams ? `<div class="teams-score">${[0, 1].map((k) => `<div class="ts t${k} ${win === k ? 'win' : ''}"><small>${teamName(k)}</small><b>${teams[k]}</b>${win === k ? `<span>${icon('crown', 18)} ${t('Vince!')}</span>` : ''}</div>`).join('')}</div>${win < 0 ? `<p class="badge">${t('Pareggio!')}</p>` : ''}` : ''}
    <table class="rec"><tr><th></th><th>${t('Nome')}</th><th>${t('Punti')}</th>${sfida ? `<th>${t('Precisione')}</th><th>${t('Serie migliore')}</th>` : `<th>${t('Colpi')}</th><th>${t('Mandati fuori')}</th><th>${t('Precisione')}</th>`}</tr>
    ${s.map((p, i) => `<tr><td>${i + 1}</td><td><span class="dot" style="--c:${p.color}"></span> ${esc(p.name)}</td><td>${p.score}</td>${
      sfida ? `<td>${Math.round(p.acc * 100)}%</td><td>${p.best}</td>` : `<td>${p.hits}</td><td>${p.elims}</td><td>${Math.round(p.acc * 100)}%</td>`}</tr>`).join('')}</table>
    <div class="row"><button class="big primary" data-lobby>${icon('users', 30)}${t('Torna alla lobby')}</button></div>`)
  on('[data-lobby]', toLobby)
}

// Plancia del regista che non gioca: elenco, punteggi live, comandi.
function board(net: Net) {
  const r = net.room!
  if (!app.querySelector('[data-board]')) {
    render(`
      <header class="bar"><h2>${t('Plancia del regista')}</h2><b class="board-time" data-btime></b></header>
      <div data-board></div>
      <div class="row">
        <button class="big primary" data-bpause></button>
        <button class="big" data-bstop>${icon('stop', 30)}${t('Termina')}</button>
      </div>
      <label class="field">${t('Volume per tutti')} <input type="range" min="0" max="1" step="0.1" value="${r.volume}" data-bvol></label>`)
    on('[data-bpause]', () => net.send({ t: 'pause', on: !net.room!.pausedAt }))
    on('[data-bstop]', () => confirm(t('Terminare la partita per tutti?')) && net.send({ t: 'stop' }))
    app.querySelector<HTMLInputElement>('[data-bvol]')!.addEventListener('change', (e) => net.send({ t: 'volume', v: Number((e.target as HTMLInputElement).value) }))
  }
  updateBoard(net)
}

function updateBoard(net: Net) {
  const r = net.room!
  const box = app.querySelector('[data-board]')
  if (!box) return
  const now = net.serverNow()
  const left = r.startAt > now ? t('Parte tra {n}', { n: Math.ceil((r.startAt - now) / 1000) }) : fmt(remaining(r, now) / 1000)
  app.querySelector('[data-btime]')!.textContent = left
  const b = app.querySelector('[data-bpause]')!
  b.innerHTML = r.pausedAt ? `${icon('play', 30)}${t('Riprendi')}` : `${icon('pause', 30)}${t('Pausa per tutti')}`
  const ps = [...participants(r)].sort((a, b) => b.score - a.score)
  const sfida = r.config.game !== 'laser'
  const teams = r.config.mode === 'squadre' ? teamScores(ps.map((p) => ({ ...p, acc: 0, best: p.best }))) : null
  box.innerHTML = `${teams ? `<div class="teams-score">${[0, 1].map((k) => `<div class="ts t${k}"><small>${teamName(k)}</small><b>${teams[k]}</b></div>`).join('')}</div>` : ''}
    <ul class="players">${ps.map((p) => {
      const st = status(p, now)
      const life = p.life <= 0 && now >= p.outUntil ? r.config.life : p.life
      const info = sfida
        ? `<span class="mini">${t('precisione {n}%', { n: p.shots ? Math.round((p.hits / p.shots) * 100) : 0 })}</span>${p.online ? '' : `<span class="mini">${t('disconnesso')}</span>`}`
        : `<span class="mini ${st === 'in gioco' ? 'ok' : st === 'fuori' ? 'warn' : ''}">${p.online ? t(st) : t('disconnesso')}</span><span class="hearts">${icon('heart', 14).repeat(Math.max(0, life))}</span>`
      return `<li class="${p.online ? '' : 'off'}"><span class="dot" style="--c:${p.color}"></span>
        <span class="pname"><b>${esc(p.name)}</b><span class="mchips">${info}</span></span>
        <b class="pscore">${p.score}</b></li>`
    }).join('')}</ul>`
}
