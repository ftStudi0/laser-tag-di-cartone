import '@fontsource-variable/baloo-2'
import './style.css'
import { setVolume, unlockAudio } from './audio.ts'
import { bandit, loadDuelArcade, loadDuelRecord, playDuel, type DuelResult } from './duel.ts'
import { drawClay, drawDuck, fmt, playSolo, type Result } from './game.ts'
import { icon } from './icons.ts'
import { createGame, joinScreen } from './lobby.ts'
import { aimTest, calibrateAim, calibrateFov, compassTest, triggerTest } from './prepare.ts'
import { printScreen } from './print.ts'
import gunPdf from '../docs/laser-tag-fucile-template.pdf?url'
import gun3d from '../docs/fucile-3d.html?url'
import { mode, MODE_TEXT, startSensors } from './sensors.ts'
import { COLORS, loadRecords, MODELS, recordKey, saveSettings, settings, type RecGame } from './settings.ts'
import { ARCADE, BOOTH, type Diff, type Theme } from './targets.ts'
import { drawTarget, THEMES } from './themes.ts'
import { app, esc, goFullscreen, on, render } from './ui.ts'

const DIFFS: Record<Diff, string> = { facile: 'Facile', media: 'Media', difficile: 'Difficile' }
const DURATIONS: [number, string][] = [[60, '1 min'], [90, '1½ min'], [120, '2 min'], [0, 'Allenamento']]
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true

// Ogni tocco: sblocca o riprende l'audio. iPhone lo vuole da un gesto vero (touchend o click) e lo sospende quando apre la fotocamera.
for (const ev of ['pointerdown', 'touchend', 'click']) addEventListener(ev, unlockAudio, { capture: true })
// Niente zoom, niente menu contestuale, niente selezione.
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('contextmenu', (e) => e.preventDefault())

if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')

let battery = false
;(navigator as any).getBattery?.().then((b: any) => {
  const check = () => {
    battery = b.level < 0.15 && !b.charging
    document.querySelector('[data-battery]')?.toggleAttribute('hidden', !battery)
  }
  b.addEventListener('levelchange', check)
  b.addEventListener('chargingchange', check)
  check()
})

function home() {
  const m = mode()
  const needSensors = m === 'spenti' || m === 'negato'
  render(`
    <header class="top">
      <h1>Laser tag <span>di cartone</span></h1>
      <nav class="top-nav">
        <button class="profile" data-profile style="--c:${settings.color}" aria-label="Cambia nome e colore"><i></i>${settings.name ? esc(settings.name) : '<em>Scrivi il tuo nome</em>'}</button>
        <button class="btn small" data-go="records">${icon('trophy', 20)}Record</button>
        <button class="btn small icon-only" data-go="settings" aria-label="Impostazioni">${icon('sliders', 20)}</button>
      </nav>
    </header>
    ${needSensors ? `<div class="alert">${icon('sensors', 26)}<span><b>Prima di tutto attiva i sensori</b><small>Servono al gioco per sapere dove punti il fucile.</small></span><button class="btn primary" data-sensors>Attiva sensori</button></div>` : ''}
    ${m === 'nessuno' ? '<div class="alert warn"><span><b>Questo telefono non sa quando ti giri</b><small>Funziona il laser tag; i giochi a bersagli no.</small></span></div>' : ''}
    <div class="home">
      <button class="big primary hero" data-go="solo">${icon('target', 40)}Gioca da sola/o<small>Bersagli, chiosco del luna park, piattelli, anatre e duello nel Far West</small></button>
      <section class="group">
        <h3>Con gli amici</h3>
        <div class="grid">
          <button class="big" data-go="create">${icon('megaphone', 30)}Crea partita<small>Fai da regista</small></button>
          <button class="big" data-go="join">${icon('enter', 30)}Entra in partita<small>Con il codice o il QR</small></button>
        </div>
      </section>
      <section class="group">
        <h3>Il fucile</h3>
        <div class="grid">
          <button class="big" data-go="prepare">${icon('wrench', 30)}Prepara il fucile<small>Costruzione e prove</small></button>
          <button class="big" data-go="print">${icon('printer', 30)}Stampa i marker<small>Per il laser tag</small></button>
        </div>
      </section>
    </div>
    <p class="safety">Si gioca camminando, non correndo. Prima di iniziare, libera la stanza dagli ostacoli.
      <span class="chip warn" data-battery ${battery ? '' : 'hidden'}>Batteria sotto il 15%</span></p>
    ${isIOS && !standalone ? '<p class="hint">Per giocare a schermo intero: tocca Condividi e poi <b>Aggiungi alla schermata Home</b>, e apri il gioco da lì.</p>' : ''}
    <dialog class="sheet-me" data-me>
      <form method="dialog">
        <h2>Chi gioca?</h2>
        <label class="lbl">Nome <input data-name maxlength="12" placeholder="Scrivilo qui" value="${esc(settings.name)}" autocomplete="off" /></label>
        <div class="lbl" role="radiogroup" aria-label="Il tuo colore">Colore
          <div class="swatches">${COLORS.map((c, i) => `<button type="button" class="sw ${c === settings.color ? 'on' : ''}" data-color="${c}" style="--c:${c}" role="radio" aria-checked="${c === settings.color}" aria-label="Colore ${i + 1}"></button>`).join('')}</div>
        </div>
        <button class="btn primary" value="ok">Fatto</button>
      </form>
    </dialog>
  `)
  const dlg = app.querySelector<HTMLDialogElement>('[data-me]')!
  on('[data-profile]', () => dlg.showModal())
  dlg.addEventListener('close', home)
  const name = app.querySelector<HTMLInputElement>('[data-name]')!
  name.addEventListener('input', () => {
    settings.name = name.value.trim()
    saveSettings()
  })
  on('[data-color]', (el) => {
    settings.color = el.dataset.color!
    saveSettings()
    app.querySelectorAll('.sw').forEach((s) => {
      s.classList.toggle('on', s === el)
      s.setAttribute('aria-checked', String(s === el))
    })
  })
  on('[data-sensors]', async () => {
    const r = await startSensors()
    if (r === 'negato') alert('Permesso negato. Per riattivarlo chiudi e riapri il gioco, poi tocca di nuovo Attiva sensori.')
    home()
  })
  on('[data-go]', (el) => SCREENS[el.dataset.go!]())
}

const SOLO = { intorno: 'Bersagli intorno', chiosco: 'Chiosco del luna park', piattello: 'Tiro al piattello', anatre: 'Anatre al volo', duello: 'Duello nel Far West' }
type Solo = keyof typeof SOLO
// ogni gioco ha il suo colore e il suo disegnino nella scelta
const SOLO_COLOR: Record<Solo, string> = { intorno: '#3d8bfd', chiosco: '#ff5a5f', piattello: '#ff8a3d', anatre: '#2ec27e', duello: '#a66cff' }
const SOLO_ART: Record<Solo, (c: CanvasRenderingContext2D) => void> = {
  intorno: (c) => { drawTarget(c, 'palloncini', 'normale', 1, 44, 40, 22, 0); drawTarget(c, 'stelle', 'dorato', 0, 82, 30, 14, 0) },
  chiosco: (c) => {
    for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#fff' : '#ff5a5f'; c.fillRect(10 + i * 20, 8, 20, 12) }
    drawTarget(c, 'lattine', 'normale', 0, 40, 48, 16, 0)
    drawTarget(c, 'lattine', 'dorato', 2, 80, 48, 16, 0)
  },
  piattello: (c) => { drawClay(c, 46, 44, 22, 0, 'normale'); drawClay(c, 92, 26, 13, 0.3, 'dorato') },
  anatre: (c) => drawDuck(c, 64, 40, 24, 0.12, 'normale', 1, false),
  duello: (c) => { c.translate(64, 72); bandit(c, 66, 'pronto', 0) },
}

function soloSetup() {
  const g = settings.solo
  const a = settings.arcade
  const themes = (Object.keys(THEMES) as Theme[]).filter((t) => g !== 'chiosco' || t !== 'zombi')
  if (g === 'chiosco' && settings.theme === 'zombi') settings.theme = 'palloncini'
  render(`
    <header class="bar"><button class="btn small" data-back>${icon('back', 20)}Menu</button><h2>Gioca da sola/o</h2></header>
    <div class="games">${(Object.keys(SOLO) as Solo[]).map((k) => `<button class="game ${k === g ? 'on' : ''}" data-solo="${k}" style="--g:${SOLO_COLOR[k]}" aria-pressed="${k === g}"><canvas width="256" height="160" aria-hidden="true"></canvas>${SOLO[k]}</button>`).join('')}</div>
    <h3>Modalità</h3>
    <div class="seg"><button class="${a ? '' : 'on'}" data-arcade="0">Normale</button><button class="${a ? 'on' : ''}" data-arcade="1">Arcade</button></div>
    ${a ? `<p class="note">${g === 'duello' ? 'Si va avanti finché non sbagli: ogni duello vinto è un punto, e Baffone diventa sempre più svelto.' : `Hai ${ARCADE.shots} colpi e ne perdi uno solo quando sbagli. Si gioca finché ti restano colpi.`}</p>` : ''}
    ${g === 'duello' ? `
    <p class="note">Punta il fucile davanti a te. Al suono della campana spunta il bandito Baffone: colpiscilo prima che dalla sua rivoltella giocattolo esca la bandierina BANG!
      Se spari prima della campana perdi il round. ${a ? '' : 'Vince chi arriva prima a 3.'} In Difficile passa anche la signora Rosina: lei non si colpisce!</p>
    <h3>Difficoltà</h3>
    <div class="seg">${(Object.keys(DIFFS) as Diff[]).map((d) => `<button class="${d === settings.diff ? 'on' : ''}" data-diff="${d}">${DIFFS[d]}</button>`).join('')}</div>` : `
    ${g === 'anatre' ? `
    <p class="note">Le anatre escono dall'erba e volano a zig zag: colpiscile prima che scappino in alto, se no il cane se la ride${a ? '' : '. Una partita dura un minuto'}.
      Quella blu è più veloce e vale 2 punti, quella dorata 5.</p>
    <h3>Difficoltà</h3>
    <div class="seg">${(Object.keys(DIFFS) as Diff[]).map((d) => `<button class="${d === settings.diff ? 'on' : ''}" data-diff="${d}">${DIFFS[d]}</button>`).join('')}</div>` : g === 'piattello' ? `
    <p class="note">I piattelli partono da destra e da sinistra e volano ad arco davanti a te: colpiscili prima che ricadano${a ? '' : '. Una partita dura un minuto'}.
      Quello dorato vale 5 punti${settings.diff !== 'facile' ? ', e a volte ne partono due insieme' : ''}.</p>
    <h3>Difficoltà</h3>
    <div class="seg">${(Object.keys(DIFFS) as Diff[]).map((d) => `<button class="${d === settings.diff ? 'on' : ''}" data-diff="${d}">${DIFFS[d]}</button>`).join('')}</div>` : `
    ${g === 'chiosco' ? `<p class="note">Come al luna park: davanti a te scorrono tre file di bersagli${a ? '' : `. Hai ${BOOTH.shots} colpi e un minuto`}, alla fine vinci un premio.</p>` : ''}
    <h3>Tema</h3>
    <div class="row">${themes
      .map((t) => `<button class="card ${t === settings.theme ? 'on' : ''}" data-theme="${t}"><canvas width="240" height="150" aria-hidden="true"></canvas>${THEMES[t]}</button>`)
      .join('')}</div>
    <div class="two"><div>
    <h3>Difficoltà</h3>
    <div class="seg">${(Object.keys(DIFFS) as Diff[]).map((d) => `<button class="${d === settings.diff ? 'on' : ''}" data-diff="${d}">${DIFFS[d]}</button>`).join('')}</div>
    ${g === 'intorno' && !a ? `<h3>Colpi</h3>
    <div class="seg"><button class="${settings.heat ? '' : 'on'}" data-heat="0">Infiniti</button><button class="${settings.heat ? 'on' : ''}" data-heat="1">Il fucile si scalda</button></div>
    <p class="note">Se il fucile si scalda, dopo 10 colpi si ferma 2 secondi per raffreddarsi.</p>` : ''}
    </div><div>
    ${g === 'intorno' && !a ? `<h3>Durata</h3>
    <div class="seg">${DURATIONS.map(([s, l]) => `<button class="${s === settings.duration ? 'on' : ''}" data-dur="${s}">${l}</button>`).join('')}</div>` : ''}
    </div></div>
    <div class="zopts" ${settings.theme === 'zombi' ? '' : 'hidden'}>
      <h3>Zombi disegnati in</h3>
      <div class="seg"><button class="${settings.z3d ? '' : 'on'}" data-z3d="0">2D, più leggero</button><button class="${settings.z3d ? 'on' : ''}" data-z3d="1">3D</button></div>
    </div>
    <div class="legend" data-legend></div>`}`}
    <div class="cta-bar"><button class="big primary go" data-start>${icon('target', 30)}Via!</button></div>
  `)
  on('[data-arcade]', (el) => {
    settings.arcade = el.dataset.arcade === '1'
    saveSettings()
    soloSetup()
  })
  on('[data-solo]', (el) => {
    settings.solo = el.dataset.solo as Solo
    saveSettings()
    soloSetup()
  })
  app.querySelectorAll<HTMLButtonElement>('[data-solo]').forEach((b) => {
    const c = b.querySelector('canvas')!.getContext('2d')!
    c.scale(2, 2)
    SOLO_ART[b.dataset.solo as Solo](c)
  })
  app.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((b) => {
    const c = b.querySelector('canvas')!.getContext('2d')!
    c.scale(2, 2) // disegno nitido sugli schermi ad alta densità
    drawTarget(c, b.dataset.theme as Theme, 'normale', 1, 40, 38, 24, 0)
    drawTarget(c, b.dataset.theme as Theme, 'dorato', 0, 86, 40, 16, 0.5)
  })
  const pick = (sel: string, key: 'theme' | 'diff' | 'duration' | 'z3d' | 'heat', parse: (v: string) => any) =>
    on(sel, (el) => {
      ;(settings as any)[key] = parse(el.dataset[sel.slice(6, -1)]!)
      saveSettings()
      el.parentElement!.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', b === el)
        b.setAttribute('aria-pressed', String(b === el))
      })
    })
  const legend = () => {
    if (g === 'duello' || g === 'piattello' || g === 'anatre') return
    app.querySelector('[data-legend]')!.innerHTML =
      settings.theme === 'zombi'
        ? '<span>Gli zombi buffi vengono verso di te: colpiscili prima che ti arrivino vicino!</span><span>Zombi: <b>1 punto</b></span><span>Con la fascia rossa, più veloce: <b>2 punti</b></span><span>Con la corona: <b>5 punti</b></span>'
        : '<span>Bersaglio: <b>1 punto</b></span><span>Con le ali: <b>2 punti</b></span><span>Dorato: <b>5 punti</b></span><span>Gattino col cuore: <b>non colpirlo!</b></span>'
    app.querySelector<HTMLElement>('.zopts')!.hidden = settings.theme !== 'zombi'
  }
  legend()
  on('[data-theme]', legend)
  pick('[data-theme]', 'theme', String)
  pick('[data-z3d]', 'z3d', (v) => v === '1')
  pick('[data-heat]', 'heat', (v) => v === '1')
  pick('[data-diff]', 'diff', String)
  pick('[data-dur]', 'duration', Number)
  on('[data-back]', home)
  on('[data-start]', async () => {
    goFullscreen()
    const m = await startSensors()
    if (m === 'negato' || m === 'spenti') return alert('Servono i sensori di movimento. Tocca "Attiva sensori" nel menu.')
    if (m === 'nessuno')
      return alert('Questo telefono non ha il giroscopio, quindi non sa quando ti giri. I bersagli intorno non funzionano: arriverà la modalità Bersagli sui muri.')
    app.hidden = true
    if (g === 'duello')
      return playDuel(settings.diff, a, (r) => {
        app.hidden = false
        if (r) duelResults(r)
        else soloSetup()
      })
    playSolo({ theme: settings.theme, diff: settings.diff, duration: settings.duration, heat: settings.heat, booth: g === 'chiosco', clay: g === 'piattello', ducks: g === 'anatre', arcade: a }, (r) => {
      app.hidden = false
      if (r) results(r)
      else soloSetup()
    })
  })
}

function recordTable(key: string, highlight = -1) {
  const list = loadRecords(key)
  if (!list.length) return '<p class="note">Ancora nessun record. Gioca per entrare in classifica!</p>'
  return `<table class="rec"><tr><th></th><th>Nome</th><th>Punti</th><th>Precisione</th><th>Serie</th></tr>${list
    .map((r, i) => `<tr class="${i === highlight ? 'mine' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.score}</td><td>${Math.round(r.acc * 100)}%</td><td>${r.streak}</td></tr>`)
    .join('')}</table>`
}

// Il premio del chiosco, come al luna park: più punti, premio più grande.
function prize(r: Result) {
  const p = r.score >= 30 ? 'la coppa d\'oro' : r.score >= 18 ? 'l\'unicorno gigante' : r.score >= 8 ? 'l\'orsetto di peluche' : 'la caramella'
  return `Hai vinto ${p}!`
}

function duelResults(r: DuelResult) {
  render(`
    <header class="bar"><h2>${r.arcade ? 'Fine della corsa!' : r.won ? 'Hai vinto il duello!' : 'Ha vinto Baffone'}</h2></header>
    ${r.arcade
      ? `<div class="score-big">${r.me}<small>duelli vinti di fila</small></div>${r.newStreak ? `<p class="badge">${icon('trophy', 26)}Nuovo record Arcade!</p>` : `<p class="note">Record Arcade: ${r.streakRecord}</p>`}`
      : `<div class="score-big">${r.me} a ${r.bot}<small>round</small></div>`}
    ${r.best ? `<div class="stats"><span>Il più veloce <b>${r.best} ms</b></span>${r.record ? `<span>Record <b>${r.record} ms</b></span>` : ''}</div>` : ''}
    ${r.newSpeed ? `<p class="badge">${icon('trophy', 26)}Nuovo record di velocità!</p>` : ''}
    <div class="row"><button class="big primary" data-again>${icon('target', 30)}Un altro duello</button><button class="big" data-home>${icon('back', 30)}Menu</button></div>
  `)
  on('[data-again]', soloSetup)
  on('[data-home]', home)
}

function results(r: Result) {
  const acc = r.shots ? Math.round((r.good / r.shots) * 100) : 0
  render(`
    <header class="bar"><h2>Fine partita!</h2></header>
    <div class="score-big">${r.score}<small>punti</small></div>
    ${r.booth ? `<p class="badge">${icon('trophy', 26)}${prize(r)}</p>` : ''}
    ${r.rank === 0 ? `<p class="badge">${icon('trophy', 26)}Nuovo record!</p>` : r.rank > 0 ? `<p class="badge">Sei al ${r.rank + 1}° posto in classifica</p>` : ''}
    <div class="stats"><span>Precisione <b>${acc}%</b></span><span>Serie migliore <b>${r.best}</b></span><span>Colpi <b>${r.shots}</b></span></div>
    <div class="row"><button class="big primary" data-again>${icon('target', 30)}Gioca ancora</button><button class="big" data-home>${icon('back', 30)}Menu</button></div>
    <h3>Classifica: ${r.booth ? 'Chiosco, ' : r.clay ? 'Piattello, ' : r.ducks ? 'Anatre, ' : r.theme === 'zombi' ? 'Zombi, ' : ''}${DIFFS[r.diff]}${r.arcade ? ', Arcade' : r.booth || r.clay || r.ducks ? '' : `, ${fmt(r.duration)}`}</h3>
    ${recordTable(recordKey(r.diff, r.arcade ? 0 : r.duration, r.booth ? 'chiosco' : r.clay ? 'piattello' : r.ducks ? 'anatre' : r.theme === 'zombi' ? 'zombi' : 'tiro'), r.rank)}
  `)
  on('[data-again]', soloSetup)
  on('[data-home]', home)
}

const REC_GAMES: Record<RecGame, string> = { tiro: 'Bersagli', zombi: 'Zombi buffi', chiosco: 'Chiosco', piattello: 'Piattello', anatre: 'Anatre' }

function records(diff: Diff = settings.diff, dur = settings.arcade ? 0 : settings.duration || 60, game: RecGame = settings.theme === 'zombi' ? 'zombi' : 'tiro') {
  // la durata 0 nelle classifiche è l'Arcade
  const durs: [number, string][] = game === 'chiosco' || game === 'piattello' || game === 'anatre' ? [[60, '1 min'], [0, 'Arcade']] : [...DURATIONS.filter(([s]) => s), [0, 'Arcade']]
  const d = durs.some(([s]) => s === dur) ? dur : durs[0][0]
  render(`
    <header class="bar"><button class="btn small" data-back>${icon('back', 20)}Menu</button><h2>Record</h2></header>
    <div class="seg">${(Object.keys(REC_GAMES) as RecGame[]).map((k) => `<button class="${k === game ? 'on' : ''}" data-game="${k}">${REC_GAMES[k]}</button>`).join('')}</div>
    <div class="seg">${(Object.keys(DIFFS) as Diff[]).map((x) => `<button class="${x === diff ? 'on' : ''}" data-diff="${x}">${DIFFS[x]}</button>`).join('')}</div>
    <div class="seg">${durs.map(([s, l]) => `<button class="${s === d ? 'on' : ''}" data-dur="${s}">${l}</button>`).join('')}</div>
    ${recordTable(recordKey(diff, d, game))}
    <p class="note">Duello nel Far West, il più veloce: <b>${loadDuelRecord() ? `${loadDuelRecord()} ms` : 'ancora nessuno'}</b>. In Arcade, duelli vinti di fila: <b>${loadDuelArcade()}</b></p>
  `)
  on('[data-back]', home)
  on('[data-game]', (el) => records(diff, dur, el.dataset.game as RecGame))
  on('[data-diff]', (el) => records(el.dataset.diff as Diff, dur, game))
  on('[data-dur]', (el) => records(diff, Number(el.dataset.dur), game))
}

function prepare() {
  const m = mode()
  render(`
    <header class="bar"><button class="btn small" data-back>${icon('back', 20)}Menu</button><h2>Prepara il fucile</h2></header>
    <div class="chips">
      <span class="chip ${m === 'giroscopio' ? 'ok' : m === 'bussola' ? '' : 'warn'}">${MODE_TEXT[m]}</span>
      ${m === 'spenti' || m === 'negato' ? `<button class="btn small primary" data-sensors>${icon('sensors', 20)}Attiva sensori</button>` : ''}
    </div>
    ${m === 'nessuno' ? '<p class="note">Questo telefono non sa quando ti giri: per i giochi a bersagli servirà la modalità Bersagli sui muri. Il laser tag funzionerà normalmente.</p>' : ''}
    ${m === 'bussola' ? '<p class="note">Senza giroscopio uso la bussola: è più lenta e i bersagli sono più grandi. Fai la prova del giro completo.</p>' : ''}
    <div class="build">
      <div><b>Costruisci il fucile</b><small>Il progetto da stampare su A4 al 100%, con le parti da ritagliare e i passaggi di montaggio.</small></div>
      <a class="btn primary" href="${gunPdf}" download="fucile-di-cartone.pdf">${icon('printer', 20)}Scarica il PDF</a>
      <a class="btn" href="${gun3d}" target="_blank" rel="noopener">Modello 3D</a>
    </div>
    <label class="field">Telefono
      <select data-model>${Object.entries(MODELS).map(([k, [l]]) => `<option value="${k}" ${k === settings.model ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </label>
    <div class="steps">
      <button class="step" data-t="trigger"><b>1. Prova del grilletto</b><small>Il tampone deve toccare il riquadro in basso al centro.</small></button>
      <button class="step" data-t="aim"><b>2. Calibra il mirino</b><small>${settings.offX || settings.offY ? `Fatto (${Math.round(settings.offX)}, ${Math.round(settings.offY)})` : 'Da fare, con il telefono nel fucile'}</small></button>
      <button class="step" data-t="fov"><b>3. Campo visivo</b><small>${settings.fov.toFixed(1)} gradi. Serve perché i bersagli non scivolino.</small></button>
      <button class="step" data-t="compass"><b>4. Prova del giro completo</b><small>${settings.drift < 0 ? 'Da fare' : `Ultimo scarto: ${settings.drift.toFixed(0)} gradi ${settings.drift <= 15 ? '(bene)' : '(troppo)'}`}</small></button>
      <button class="step" data-t="aimtest"><b>5. Prova mirino (laser tag)</b><small>Riconosce i marker stampati e stima la distanza.</small></button>
    </div>
  `)
  on('[data-back]', home)
  on('[data-sensors]', async () => {
    await startSensors()
    prepare()
  })
  const sel = app.querySelector<HTMLSelectElement>('[data-model]')!
  sel.addEventListener('change', () => {
    settings.model = sel.value
    settings.fov = MODELS[sel.value][1]
    saveSettings()
    prepare()
  })
  const TOOLS: Record<string, (done: () => void) => void> = { trigger: triggerTest, aim: calibrateAim, fov: calibrateFov, compass: compassTest, aimtest: aimTest }
  on('[data-t]', async (el) => {
    goFullscreen()
    if (el.dataset.t === 'fov' || el.dataset.t === 'compass') await startSensors()
    app.hidden = true
    TOOLS[el.dataset.t!](() => {
      app.hidden = false
      prepare()
    })
  })
}

function settingsScreen() {
  render(`
    <header class="bar"><button class="btn small" data-back>${icon('back', 20)}Menu</button><h2>Impostazioni</h2></header>
    <label class="field">Volume <input type="range" min="0" max="1" step="0.05" value="${settings.volume}" data-vol></label>
    <label class="field"><span>Tolleranza del colpo: <b data-tolv>${Math.round(settings.tol * 100)}%</b></span>
      <input type="range" min="0" max="0.6" step="0.05" value="${settings.tol}" data-tol>
      <small class="note">Più è alta, più è facile colpire i bersagli.</small></label>
    <label class="field"><span>Altezza del fucile da terra: <b data-ghv>${settings.gunH.toFixed(1)} m</b></span>
      <input type="range" min="0.8" max="1.7" step="0.05" value="${settings.gunH}" data-gh>
      <small class="note">Serve agli zombi per camminare sul pavimento. Misura da terra al fucile quando lo tieni in mano.</small></label>
    <label class="check"><input type="checkbox" data-debug ${settings.debug ? 'checked' : ''}> Mostra i dati di diagnostica durante il gioco</label>
    <div class="row">
      <button class="btn" data-reset>Azzera la calibrazione</button>
    </div>
    <p class="note">Tutto resta su questo telefono. Le immagini della fotocamera non vengono mai inviate né salvate.</p>
  `)
  on('[data-back]', home)
  const vol = app.querySelector<HTMLInputElement>('[data-vol]')!
  vol.addEventListener('input', () => {
    settings.volume = Number(vol.value)
    setVolume(settings.volume)
    saveSettings()
  })
  const tol = app.querySelector<HTMLInputElement>('[data-tol]')!
  tol.addEventListener('input', () => {
    settings.tol = Number(tol.value)
    app.querySelector('[data-tolv]')!.textContent = `${Math.round(settings.tol * 100)}%`
    saveSettings()
  })
  const gh = app.querySelector<HTMLInputElement>('[data-gh]')!
  gh.addEventListener('input', () => {
    settings.gunH = Number(gh.value)
    app.querySelector('[data-ghv]')!.textContent = `${settings.gunH.toFixed(1)} m`
    saveSettings()
  })
  const dbg = app.querySelector<HTMLInputElement>('[data-debug]')!
  dbg.addEventListener('change', () => {
    settings.debug = dbg.checked
    saveSettings()
  })
  on('[data-reset]', () => {
    if (!confirm('Azzero mirino, campo visivo e prova del giro?')) return
    Object.assign(settings, { offX: 0, offY: 0, fov: MODELS[settings.model][1], drift: -1 })
    saveSettings()
    settingsScreen()
  })
}

const SCREENS: Record<string, () => void> = {
  solo: soloSetup, prepare, records: () => records(), settings: settingsScreen,
  create: () => createGame(home), join: () => joinScreen(home), print: () => printScreen(home),
}

// dal QR del regista (o ricaricando la pagina in una stanza) si entra direttamente
const room = new URLSearchParams(location.search).get('r')
if (room && /^[A-Z]{4}$/.test(room)) joinScreen(home, room)
else home()
