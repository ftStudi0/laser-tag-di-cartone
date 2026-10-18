import './style.css'
import { setVolume, unlockAudio } from './audio.ts'
import { fmt, playSolo, type Result } from './game.ts'
import { calibrateAim, calibrateFov, compassTest, triggerTest } from './prepare.ts'
import { mode, MODE_TEXT, startSensors } from './sensors.ts'
import { COLORS, loadRecords, MODELS, recordKey, saveSettings, settings } from './settings.ts'
import type { Diff, Theme } from './targets.ts'
import { drawTarget, THEMES } from './themes.ts'

const app = document.getElementById('app')!
const DIFFS: Record<Diff, string> = { facile: 'Facile', media: 'Media', difficile: 'Difficile' }
const DURATIONS: [number, string][] = [[60, '60 secondi'], [90, '90 secondi'], [120, '2 minuti'], [0, 'Allenamento']]
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// Primo tocco ovunque: sblocca l'audio (iPhone lo vuole da un gesto).
addEventListener('pointerdown', unlockAudio, { capture: true })
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

function render(html: string) {
  app.innerHTML = html
  app.scrollTop = 0
  scrollTo(0, 0)
}

const on = (sel: string, fn: (el: HTMLElement) => void) =>
  app.querySelectorAll<HTMLElement>(sel).forEach((el) => el.addEventListener('click', () => fn(el)))

// Su Android: schermo intero e orizzontale. Su iPhone non c'è, serve la PWA.
function goFullscreen() {
  const d = document.documentElement
  if (document.fullscreenElement || !d.requestFullscreen) return
  d.requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as any)?.lock?.('landscape'))
    .catch(() => {})
}

function home() {
  const m = mode()
  render(`
    <header class="top">
      <h1>Laser tag <span>di cartone</span></h1>
      <div class="me">
        <input data-name maxlength="12" placeholder="Il tuo nome" value="${esc(settings.name)}" autocomplete="off" />
        <div class="swatches">${COLORS.map((c) => `<button class="sw ${c === settings.color ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="colore"></button>`).join('')}</div>
      </div>
    </header>
    <div class="grid">
      <button class="big primary" data-go="solo"><span class="ico">🎯</span>Gioca da sola/o</button>
      <button class="big" disabled><span class="ico">📣</span>Crea partita<small>in arrivo</small></button>
      <button class="big" disabled><span class="ico">🔑</span>Entra in partita<small>in arrivo</small></button>
      <button class="big" data-go="prepare"><span class="ico">🔧</span>Prepara il fucile</button>
      <button class="big" disabled><span class="ico">🖨️</span>Stampa i marker<small>in arrivo</small></button>
      <button class="big" data-go="records"><span class="ico">🏆</span>Record</button>
    </div>
    <div class="chips">
      <span class="chip ${m === 'giroscopio' || m === 'bussola' ? 'ok' : ''}">${MODE_TEXT[m]}</span>
      ${m === 'spenti' || m === 'negato' ? '<button class="btn small primary" data-sensors>Attiva sensori</button>' : ''}
      <span class="chip warn" data-battery ${battery ? '' : 'hidden'}>Batteria sotto il 15%</span>
      <button class="btn small" data-go="settings">⚙️ Impostazioni</button>
    </div>
    ${isIOS && !standalone ? '<p class="hint">Per giocare a schermo intero: tocca Condividi e poi <b>Aggiungi alla schermata Home</b>, e apri il gioco da lì.</p>' : ''}
    <p class="safety">Si gioca camminando, non correndo. Prima di iniziare, libera la stanza dagli ostacoli.</p>
  `)
  const name = app.querySelector<HTMLInputElement>('[data-name]')!
  name.addEventListener('input', () => {
    settings.name = name.value.trim()
    saveSettings()
  })
  on('[data-color]', (el) => {
    settings.color = el.dataset.color!
    saveSettings()
    app.querySelectorAll('.sw').forEach((s) => s.classList.toggle('on', s === el))
  })
  on('[data-sensors]', async () => {
    const r = await startSensors()
    if (r === 'negato') alert('Permesso negato. Per riattivarlo chiudi e riapri il gioco, poi tocca di nuovo Attiva sensori.')
    home()
  })
  on('[data-go]', (el) => SCREENS[el.dataset.go!]())
}

function soloSetup() {
  render(`
    <header class="bar"><button class="btn small" data-back>‹ Menu</button><h2>Tiro al bersaglio</h2></header>
    <h3>Tema</h3>
    <div class="row">${(Object.keys(THEMES) as Theme[])
      .map((t) => `<button class="card ${t === settings.theme ? 'on' : ''}" data-theme="${t}"><canvas width="120" height="90"></canvas>${THEMES[t]}</button>`)
      .join('')}</div>
    <h3>Difficoltà</h3>
    <div class="seg">${(Object.keys(DIFFS) as Diff[]).map((d) => `<button class="${d === settings.diff ? 'on' : ''}" data-diff="${d}">${DIFFS[d]}</button>`).join('')}</div>
    <p class="note">In Facile i colpi sono infiniti. In Media e Difficile ne hai 10: per ricaricare alza il fucile verso il soffitto.</p>
    <h3>Durata</h3>
    <div class="seg">${DURATIONS.map(([s, l]) => `<button class="${s === settings.duration ? 'on' : ''}" data-dur="${s}">${l}</button>`).join('')}</div>
    <div class="legend">
      <span>Colpisci i bersagli: <b>1 punto</b></span><span>Con le ali: <b>2 punti</b></span><span>Dorati: <b>5 punti</b></span><span>Gattino col cuore: <b>non colpirlo!</b></span>
    </div>
    <button class="big primary go" data-start>Via!</button>
  `)
  app.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((b) => {
    const c = b.querySelector('canvas')!.getContext('2d')!
    drawTarget(c, b.dataset.theme as Theme, 'normale', 1, 40, 45, 26, 0)
    drawTarget(c, b.dataset.theme as Theme, 'dorato', 0, 88, 48, 18, 0.5)
  })
  const pick = (sel: string, key: 'theme' | 'diff' | 'duration', parse: (v: string) => any) =>
    on(sel, (el) => {
      ;(settings as any)[key] = parse(el.dataset[sel.slice(6, -1)]!)
      saveSettings()
      el.parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el))
    })
  pick('[data-theme]', 'theme', String)
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
    playSolo({ theme: settings.theme, diff: settings.diff, duration: settings.duration }, (r) => {
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

function results(r: Result) {
  const acc = r.shots ? Math.round((r.good / r.shots) * 100) : 0
  render(`
    <header class="bar"><h2>Fine partita!</h2></header>
    <div class="score-big">${r.score}<small>punti</small></div>
    ${r.rank === 0 ? '<p class="badge">Nuovo record! 🏆</p>' : r.rank > 0 ? `<p class="badge">Sei al ${r.rank + 1}° posto in classifica</p>` : ''}
    <div class="stats"><span>Precisione <b>${acc}%</b></span><span>Serie migliore <b>${r.best}</b></span><span>Colpi <b>${r.shots}</b></span></div>
    <h3>Classifica: ${DIFFS[r.diff]}, ${fmt(r.duration)}</h3>
    ${recordTable(recordKey(r.diff, r.duration), r.rank)}
    <div class="row"><button class="big primary" data-again>Gioca ancora</button><button class="big" data-home>Menu</button></div>
  `)
  on('[data-again]', soloSetup)
  on('[data-home]', home)
}

function records(diff: Diff = settings.diff, dur = settings.duration || 60) {
  render(`
    <header class="bar"><button class="btn small" data-back>‹ Menu</button><h2>Record</h2></header>
    <div class="seg">${(Object.keys(DIFFS) as Diff[]).map((d) => `<button class="${d === diff ? 'on' : ''}" data-diff="${d}">${DIFFS[d]}</button>`).join('')}</div>
    <div class="seg">${DURATIONS.filter(([s]) => s).map(([s, l]) => `<button class="${s === dur ? 'on' : ''}" data-dur="${s}">${l}</button>`).join('')}</div>
    ${recordTable(recordKey(diff, dur))}
  `)
  on('[data-back]', home)
  on('[data-diff]', (el) => records(el.dataset.diff as Diff, dur))
  on('[data-dur]', (el) => records(diff, Number(el.dataset.dur)))
}

function prepare() {
  const m = mode()
  render(`
    <header class="bar"><button class="btn small" data-back>‹ Menu</button><h2>Prepara il fucile</h2></header>
    <div class="chips">
      <span class="chip ${m === 'giroscopio' ? 'ok' : m === 'bussola' ? '' : 'warn'}">${MODE_TEXT[m]}</span>
      ${m === 'spenti' || m === 'negato' ? '<button class="btn small primary" data-sensors>Attiva sensori</button>' : ''}
    </div>
    ${m === 'nessuno' ? '<p class="note">Questo telefono non sa quando ti giri: per i giochi a bersagli servirà la modalità Bersagli sui muri. Il laser tag funzionerà normalmente.</p>' : ''}
    ${m === 'bussola' ? '<p class="note">Senza giroscopio uso la bussola: è più lenta e i bersagli sono più grandi. Fai la prova del giro completo.</p>' : ''}
    <label class="field">Telefono
      <select data-model>${Object.entries(MODELS).map(([k, [l]]) => `<option value="${k}" ${k === settings.model ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </label>
    <div class="steps">
      <button class="step" data-t="trigger"><b>1. Prova del grilletto</b><small>Il tampone deve toccare il riquadro in basso al centro.</small></button>
      <button class="step" data-t="aim"><b>2. Calibra il mirino</b><small>${settings.offX || settings.offY ? `Fatto (${Math.round(settings.offX)}, ${Math.round(settings.offY)})` : 'Da fare, con il telefono nel fucile'}</small></button>
      <button class="step" data-t="fov"><b>3. Campo visivo</b><small>${settings.fov.toFixed(1)} gradi. Serve perché i bersagli non scivolino.</small></button>
      <button class="step" data-t="compass"><b>4. Prova del giro completo</b><small>${settings.drift < 0 ? 'Da fare' : `Ultimo scarto: ${settings.drift.toFixed(0)} gradi ${settings.drift <= 15 ? '(bene)' : '(troppo)'}`}</small></button>
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
  const TOOLS: Record<string, (done: () => void) => void> = { trigger: triggerTest, aim: calibrateAim, fov: calibrateFov, compass: compassTest }
  on('[data-t]', async (el) => {
    goFullscreen()
    if (el.dataset.t !== 'trigger' && el.dataset.t !== 'aim') await startSensors()
    app.hidden = true
    TOOLS[el.dataset.t!](() => {
      app.hidden = false
      prepare()
    })
  })
}

function settingsScreen() {
  render(`
    <header class="bar"><button class="btn small" data-back>‹ Menu</button><h2>Impostazioni</h2></header>
    <label class="field">Volume <input type="range" min="0" max="1" step="0.05" value="${settings.volume}" data-vol></label>
    <label class="field">Tolleranza del colpo: <b data-tolv>${Math.round(settings.tol * 100)}%</b>
      <input type="range" min="0" max="0.6" step="0.05" value="${settings.tol}" data-tol></label>
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

const SCREENS: Record<string, () => void> = { solo: soloSetup, prepare, records: () => records(), settings: settingsScreen }

home()
