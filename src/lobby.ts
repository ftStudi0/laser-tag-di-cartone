import qrcode from 'qrcode-generator'
import { setVolume } from './audio.ts'
import { fmt, playSolo } from './game.ts'
import { icon } from './icons.ts'
import { playLaser, shooterColor } from './lasertag.ts'
import { connect, createRoom, type Net } from './net.ts'
import { isReady, REFS, remaining, SHARED_SIZE, markerTaken as taken, MAX_MARKER, participants, status, teamScores, TEAMS, type Config, type Player, type Room, type Standing } from './rules.ts'
import type { Theme } from './targets.ts'
import { THEMES } from './themes.ts'
import { mode, sensors, startSensors } from './sensors.ts'
import { saveSettings, settings } from './settings.ts'
import { app, esc, goFullscreen, on, render } from './ui.ts'

const MODES = { ffa: 'Tutti contro tutti', squadre: 'Due squadre' }
const GAMES = { laser: 'Laser tag', sfida: 'Sfida a bersagli', condivisi: 'Bersagli condivisi' }
const DIFFS = { facile: 'Facile', media: 'Media', difficile: 'Difficile' }
// i numeri doppi contano solo nel laser tag, dove il marker è il bersaglio
const markerTaken = (r: Room, p: Player) => r.config.game === 'laser' && taken(r, p)
const summary = (c: Config) => `${GAMES[c.game]}: ${MODES[c.mode]}, ` + (c.game !== 'laser' ? `${THEMES[c.theme]}, ${DIFFS[c.diff]}, ` : '') + fmt(c.duration)
let back: () => void = () => {}

// Crea partita: questo telefono diventa il regista.
export async function createGame(onBack: () => void) {
  back = onBack
  render('<p class="note center">Creo la partita...</p>')
  try {
    enter(await createRoom())
  } catch {
    alert('Non riesco a creare la partita. Serve la connessione a internet.')
    back()
  }
}

// Entra in partita con il codice di 4 lettere (o dal link del QR).
export function joinScreen(onBack: () => void, code = '') {
  back = onBack
  render(`
    <header class="bar"><button class="btn small" data-back>${icon('back', 20)}Menu</button><h2>Entra in partita</h2></header>
    <div class="join">
      <label class="field">Il codice della partita
        <input class="code" data-code maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${esc(code)}">
      </label>
      <label class="field">Il tuo nome
        <input class="name" data-name maxlength="12" autocomplete="off" placeholder="Scrivilo qui" value="${esc(settings.name)}">
      </label>
      <button class="big primary" data-join>${icon('enter', 30)}Entra</button>
      <p class="note">Oppure inquadra il QR del regista con la fotocamera del telefono.</p>
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
  const net = connect(code, () => ({ name: settings.name || 'Senza nome', color: settings.color, marker: settings.marker }))
  let view: View = 'lobby'
  let lastPhase = ''
  render('<p class="note center">Mi collego alla partita...</p>')

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
    if (rest) rest.textContent = resting ? `Pausa tra i round, per far riposare i telefoni: ancora ${fmt((r.restUntil - net.serverNow()) / 1000)}` : ''
    if (wasResting && !resting) show() // riattiva il pulsante Via
    wasResting = resting
  }, 1000)

  net.onStatus = () => {
    if (net.error) {
      alert(net.error)
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
        alert('Questo telefono non sa quando ti giri, quindi non vede i bersagli intorno. Per lui arriverà la modalità Bersagli sui muri.')
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
  playSolo({ theme: c.theme, diff: c.diff, duration: c.duration }, done, {
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
      return [0, 1].map((t) => ({ name: TEAMS[t].name.replace('Squadra ', ''), score: tot[t], me: t === mine })).sort((a, b) => b.score - a.score)
    },
    color: c.mode === 'squadre' ? TEAMS[r.players.find((p) => p.id === net.me)?.team ?? 0].color : undefined,
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
  const ammo = c.diff !== 'facile'
  if (c.game === 'condivisi') return rulesBox([
    ['users', 'Prima del via', `Mettetevi vicini, puntate tutti ${c.ref} e premete il grilletto. Così i bersagli sono nello stesso posto per tutti.`],
    ['target', 'Si spara', 'Gli stessi bersagli per tutti: chi lo colpisce prima lo prende, e il bersaglio sparisce anche per gli altri.'],
    ['heart', 'Attenzione', c.theme === 'zombi' ? 'Gli zombi che arrivano vicino se ne vanno: colpiscili prima!' : 'Non colpire il gattino col cuore: toglie 2 punti.'],
    ['crown', 'Si vince', c.mode === 'squadre' ? 'Vince la squadra che prende più bersagli.' : 'Vince chi prende più punti. Se i bersagli scivolano, ricentra con il pulsante in alto.'],
  ])
  if (c.game === 'sfida') return rulesBox([
    ['target', 'Si spara', 'I bersagli compaiono intorno a te: girati, mira e tocca il grilletto. Tutti hanno gli stessi bersagli.'],
    ['up', 'Si ricarica', ammo ? 'Hai 10 colpi. Per ricaricare alza il fucile verso il soffitto o tieni premuto il grilletto 5 secondi.' : 'In Facile i colpi sono infiniti.'],
    ['heart', 'Attenzione', c.theme === 'zombi' ? 'Se uno zombi ti arriva vicino ti fa il solletico: un punto in meno.' : 'Non colpire il gattino col cuore: toglie 2 punti.'],
    ['crown', 'Si vince', c.mode === 'squadre' ? 'Vince la squadra che fa più punti: si sommano i punti di tutti.' : 'Vince chi ha più punti alla fine. La classifica si vede durante la sfida.'],
  ])
  return rulesBox([
    ['zap', 'Si spara', 'Metti il mirino sul foglio di un avversario e tocca il grilletto.'],
    ['up', 'Si ricarica', c.ammo ? `Hai ${c.ammo} colpi. Per ricaricare alza il fucile verso il soffitto o tieni premuto il grilletto 5 secondi.` : 'Colpi infiniti in questa partita.'],
    ['heart', 'Fuori gioco', `Hai ${c.life} cuori. Quando finiscono stai fuori 8 secondi, poi rientri con lo scudo.`],
    ['crown', 'Si vince', c.mode === 'squadre' ? 'Vince la squadra con più punti. Non si colpiscono i compagni.' : '1 punto per ogni colpo, 3 in più quando mandi qualcuno fuori gioco.'],
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
  const sens = r.config.game !== 'laser' ? c(p.ready.gyro, 'giroscopio') : c(p.ready.sens, 'sensori')
  return `${c(p.ready.gun, 'fucile')}${sens}${c(p.ready.cam, 'fotocamera')}${c(p.ready.cal, 'mirino')}${markerTaken(r, p) ? '<span class="mini warn">numero doppio</span>' : ''}`
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
    <header class="bar"><button class="btn small" data-leave>${icon('back', 20)}Esci</button><h2>${GAMES[c.game]}</h2>
      <span class="chip warn" data-net ${net.online ? 'hidden' : ''}>Riconnessione...</span></header>
    <div class="lobby">
      <section>
        <div class="code-box">${isDir ? `<div class="qr">${qrSvg(link)}</div>` : ''}<div><small>Codice della partita</small><b>${r.code}</b>${isDir ? '<small>Gli altri toccano Entra in partita e scrivono il codice, oppure inquadrano il QR.</small>' : `<small>${summary(c)}</small>`}</div></div>
        ${isDir ? `
          <h3>Gioco</h3>${seg('game', [['laser', GAMES.laser], ['sfida', GAMES.sfida], ['condivisi', GAMES.condivisi]])}
          <h3>Come si gioca</h3>${seg('mode', [['ffa', MODES.ffa], ['squadre', MODES.squadre]])}
          ${c.game === 'laser' ? `
          <h3>Durata</h3>${seg('duration', [[120, '2 min'], [180, '3 min'], [300, '5 min']])}
          <div class="two"><div><h3>Cuori</h3>${seg('life', [[3, '3'], [5, '5'], [7, '7']])}</div>
          <div><h3>Colpi</h3>${seg('ammo', [[10, '10, poi ricarica'], [0, 'Infiniti']])}</div></div>` : `
          <h3>Tema</h3>${seg('theme', (Object.keys(THEMES) as Theme[]).map((t) => [t, THEMES[t]]))}
          <div class="two"><div><h3>Difficoltà</h3>${seg('diff', Object.entries(DIFFS))}</div>
          <div><h3>Durata</h3>${seg('duration', [[60, '1 min'], [90, '1½ min'], [120, '2 min']])}</div></div>
          ${c.game === 'condivisi' ? `<h3>Cosa puntate tutti all'inizio</h3>${seg('ref', REFS.map((x) => [x, x[0].toUpperCase() + x.slice(1)]))}` : ''}`}
          <h3>Il regista</h3>${seg('plays', [[true, 'Gioco anche io'], [false, 'Faccio solo il regista']])}
          <label class="field">Volume per tutti <input type="range" min="0" max="1" step="0.1" value="${r.volume}" data-vol></label>`
        : rulesHtml(c)}
      </section>
      <section>
        <h3>${icon('users', 18)} Giocatori (${ps.length})</h3>
        <ul class="players">${ps.map((p) => `
          <li class="${p.online ? '' : 'off'}">
            <span class="dot" style="--c:${p.color}"></span>
            <span class="pname"><b>${esc(p.name)}${p.id === net.me ? ' (tu)' : ''}${p.id === r.dirId ? ' · regista' : ''}</b>
              <span class="mchips">${p.online ? chips(p, r) : '<span class="mini">disconnesso</span>'}</span></span>
            ${c.game === 'laser' ? `<span class="num" title="Numero del marker">${p.marker}</span>` : ''}
            ${c.mode === 'squadre' ? `<button class="team t${p.team}" data-team="${p.id}" ${isDir ? '' : 'disabled'}>${TEAMS[p.team].name.replace('Squadra ', '')}</button>` : ''}
          </li>`).join('') || '<li class="note">Ancora nessuno. Fai entrare gli altri con il codice.</li>'}</ul>
        ${iPlay ? `
          <div class="mine-box">
            ${c.game === 'laser' ? `<label class="field inline">Il mio marker
              <select data-marker>${Array.from({ length: MAX_MARKER }, (_, i) => `<option ${i + 1 === me!.marker ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>` : ''}
            <button class="btn ${me!.ready.gun ? '' : 'primary'}" data-ready>${me!.ready.gun ? 'Fucile non pronto' : `${icon('target', 20)}Ho il fucile pronto`}</button>
          </div>
          ${me && !me.ready.cal && me.ready.gun ? '<p class="note">Il mirino non è calibrato: fallo da Prepara il fucile per colpire meglio.</p>' : ''}` : ''}
        ${isDir ? `
          <p class="note" data-rest></p>
          <div class="cta-bar">
            <button class="big primary go" data-start ${allReady && !resting ? '' : 'disabled'}>${icon('zap', 30)}Via!</button>
            ${!allReady ? `<button class="btn" data-force ${resting || !ps.length ? 'disabled' : ''}>Parti lo stesso</button>` : ''}
          </div>` : '<p class="note">Aspetta che il regista faccia partire il gioco.</p><p class="note" data-rest></p>'}
      </section>
    </div>
  `)
  on('[data-leave]', () => confirm('Esci dalla partita?') && leave())
  on('[data-cfg]', (el) => net.send({ t: 'config', config: { [el.dataset.cfg!]: JSON.parse(el.dataset.v!) } }))
  on('[data-team]', (el) => net.send({ t: 'team', id: el.dataset.team! }))
  on('[data-start]', () => net.send({ t: 'start' }))
  on('[data-force]', () => confirm('Non sono tutti pronti. Partire lo stesso?') && net.send({ t: 'start' }))
  app.querySelector<HTMLInputElement>('[data-vol]')?.addEventListener('change', (e) => net.send({ t: 'volume', v: Number((e.target as HTMLInputElement).value) }))
  app.querySelector<HTMLSelectElement>('[data-marker]')?.addEventListener('change', (e) => {
    settings.marker = Number((e.target as HTMLSelectElement).value)
    saveSettings()
    net.send({ t: 'marker', marker: settings.marker })
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
    if (!cam) alert('La fotocamera non si apre. Controlla il permesso nelle impostazioni del browser.')
    net.send({ t: 'ready', ready: { gun: true, cam, sens: m !== 'spenti' && m !== 'negato', gyro: m === 'giroscopio' || m === 'bussola', cal: !!(settings.offX || settings.offY) } })
  })
}

// Partita in corso ma questo telefono è uscito: si può rientrare.
function inGame(r: Room, rejoin: () => void) {
  render(`
    <header class="bar"><h2>Partita in corso</h2></header>
    <p class="note">${MODES[r.config.mode]}. Rientra quando vuoi: il tuo punteggio è salvo.</p>
    <div class="row"><button class="big primary" data-rejoin>${icon('enter', 30)}Rientra in partita</button></div>`)
  // dopo aver ricaricato la pagina i sensori sono spenti: si riaccendono qui, dentro il tocco
  on('[data-rejoin]', async () => (await startSensors(), rejoin()))
}

function results(r: Room, s: Standing[], toLobby: () => void) {
  const sfida = r.config.game !== 'laser'
  const teams = r.config.mode === 'squadre' ? teamScores(s) : null
  const win = teams ? (teams[0] === teams[1] ? -1 : teams[0] > teams[1] ? 0 : 1) : -1
  render(`
    <header class="bar"><h2>Fine partita!</h2></header>
    ${teams ? `<div class="teams-score">${[0, 1].map((t) => `<div class="ts t${t} ${win === t ? 'win' : ''}"><small>${TEAMS[t].name}</small><b>${teams[t]}</b>${win === t ? `<span>${icon('crown', 18)} Vince!</span>` : ''}</div>`).join('')}</div>${win < 0 ? '<p class="badge">Pareggio!</p>' : ''}` : ''}
    <table class="rec"><tr><th></th><th>Nome</th><th>Punti</th>${sfida ? '<th>Precisione</th><th>Serie migliore</th>' : '<th>Colpi</th><th>Mandati fuori</th><th>Precisione</th>'}</tr>
    ${s.map((p, i) => `<tr><td>${i + 1}</td><td><span class="dot" style="--c:${p.color}"></span> ${esc(p.name)}</td><td>${p.score}</td>${
      sfida ? `<td>${Math.round(p.acc * 100)}%</td><td>${p.best}</td>` : `<td>${p.hits}</td><td>${p.elims}</td><td>${Math.round(p.acc * 100)}%</td>`}</tr>`).join('')}</table>
    <div class="row"><button class="big primary" data-lobby>${icon('users', 30)}Torna alla lobby</button></div>`)
  on('[data-lobby]', toLobby)
}

// Plancia del regista che non gioca: elenco, punteggi live, comandi.
function board(net: Net) {
  const r = net.room!
  if (!app.querySelector('[data-board]')) {
    render(`
      <header class="bar"><h2>Plancia del regista</h2><b class="board-time" data-btime></b></header>
      <div data-board></div>
      <div class="row">
        <button class="big primary" data-bpause></button>
        <button class="big" data-bstop>${icon('stop', 30)}Termina</button>
      </div>
      <label class="field">Volume per tutti <input type="range" min="0" max="1" step="0.1" value="${r.volume}" data-bvol></label>`)
    on('[data-bpause]', () => net.send({ t: 'pause', on: !net.room!.pausedAt }))
    on('[data-bstop]', () => confirm('Terminare la partita per tutti?') && net.send({ t: 'stop' }))
    app.querySelector<HTMLInputElement>('[data-bvol]')!.addEventListener('change', (e) => net.send({ t: 'volume', v: Number((e.target as HTMLInputElement).value) }))
  }
  updateBoard(net)
}

function updateBoard(net: Net) {
  const r = net.room!
  const box = app.querySelector('[data-board]')
  if (!box) return
  const now = net.serverNow()
  const left = r.startAt > now ? `Parte tra ${Math.ceil((r.startAt - now) / 1000)}` : fmt(remaining(r, now) / 1000)
  app.querySelector('[data-btime]')!.textContent = left
  const b = app.querySelector('[data-bpause]')!
  b.innerHTML = r.pausedAt ? `${icon('play', 30)}Riprendi` : `${icon('pause', 30)}Pausa per tutti`
  const ps = [...participants(r)].sort((a, b) => b.score - a.score)
  const sfida = r.config.game !== 'laser'
  const teams = r.config.mode === 'squadre' ? teamScores(ps.map((p) => ({ ...p, acc: 0, best: p.best }))) : null
  box.innerHTML = `${teams ? `<div class="teams-score">${[0, 1].map((t) => `<div class="ts t${t}"><small>${TEAMS[t].name}</small><b>${teams[t]}</b></div>`).join('')}</div>` : ''}
    <ul class="players">${ps.map((p) => {
      const st = status(p, now)
      const life = p.life <= 0 && now >= p.outUntil ? r.config.life : p.life
      const info = sfida
        ? `<span class="mini">precisione ${p.shots ? Math.round((p.hits / p.shots) * 100) : 0}%</span>${p.online ? '' : '<span class="mini">disconnesso</span>'}`
        : `<span class="mini ${st === 'in gioco' ? 'ok' : st === 'fuori' ? 'warn' : ''}">${p.online ? st : 'disconnesso'}</span><span class="hearts">${icon('heart', 14).repeat(Math.max(0, life))}</span>`
      return `<li class="${p.online ? '' : 'off'}"><span class="dot" style="--c:${p.color}"></span>
        <span class="pname"><b>${esc(p.name)}</b><span class="mchips">${info}</span></span>
        <b class="pscore">${p.score}</b></li>`
    }).join('')}</ul>`
}
