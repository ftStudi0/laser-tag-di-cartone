import { icon } from './icons.ts'
import { MARKER_M } from './markers.ts'
import { MAX_MARKER } from './rules.ts'
import { saveSettings, settings } from './settings.ts'
import { app, esc, on, render } from './ui.ts'

// Stampa i marker: un foglio A4 per giocatore, con il marker grande, il nome e il numero.
// Si stampa dal browser (anche "Salva come PDF"): niente librerie per i PDF.
export async function printScreen(back: () => void) {
  const names: string[] = (() => {
    try {
      return JSON.parse(localStorage.getItem('lt:printNames') || '[]')
    } catch {
      return []
    }
  })()
  if (settings.name && !names[settings.marker - 1]) names[settings.marker - 1] = settings.name
  render(`
    <header class="bar"><button class="btn small" data-back>${icon('back', 20)}Menu</button><h2>Stampa i marker</h2></header>
    <p class="note">Scrivi il nome accanto al numero di ogni giocatore. Ogni foglio va stampato <b>due volte</b>: uno sul petto e uno sulla schiena.
      Stampa al 100% (senza "adatta alla pagina") e non plastificarlo lucido, perché i riflessi confondono la fotocamera.</p>
    <div class="print-list">${Array.from({ length: 8 }, (_, i) => `
      <label class="print-row"><span class="num">${i + 1}</span>
        <input data-pn="${i}" maxlength="12" placeholder="Nome" value="${esc(names[i] ?? '')}" autocomplete="off">
        <span class="mine-tag ${settings.marker === i + 1 ? 'on' : ''}" data-mine="${i + 1}">${settings.marker === i + 1 ? 'il mio' : 'è il mio'}</span>
      </label>`).join('')}</div>
    <p class="note">Si stampano i numeri con un nome. Se non scrivi nessun nome, si stampano tutti e 8. Ci sono numeri fino a ${MAX_MARKER}.</p>
    <div class="cta-bar"><button class="big primary go" data-print>${icon('printer', 30)}Stampa</button></div>
  `)
  on('[data-back]', back)
  const inputs = [...app.querySelectorAll<HTMLInputElement>('[data-pn]')]
  inputs.forEach((el) =>
    el.addEventListener('input', () => {
      names[Number(el.dataset.pn)] = el.value.trim()
      try {
        localStorage.setItem('lt:printNames', JSON.stringify(names))
      } catch {}
    }),
  )
  on('[data-mine]', (el) => {
    settings.marker = Number(el.dataset.mine)
    saveSettings()
    printScreen(back)
  })
  on('[data-print]', async () => {
    const { AR, DICTIONARY } = await import('./aruco.ts')
    const dict = new AR.Dictionary(DICTIONARY)
    const list = inputs.map((el, i) => [i + 1, el.value.trim()] as const).filter(([, n]) => n)
    const sheets = (list.length ? list : Array.from({ length: 8 }, (_, i) => [i + 1, ''] as const))
      .map(([num, name]) => `
        <section class="sheet">
          <div class="mk">${dict.generateSVG(num - 1)}</div>
          <div class="sheet-num">${num}</div>
          <div class="sheet-name">${esc(name)}</div>
          <div class="sheet-note">Laser tag di cartone. Stampa due copie: petto e schiena. Quadrato nero di ${(MARKER_M * 100).toFixed(1).replace(".", ",")} cm.</div>
        </section>`)
      .join('')
    let el = document.getElementById('print')
    if (!el) {
      el = document.createElement('div')
      el.id = 'print'
      document.body.append(el)
    }
    el.innerHTML = sheets
    print()
  })
}
