import { play } from './audio.ts'
import { D, forward, fovFromFocal, project, solveFocal, wrap, type Vec3 } from './math.ts'
import { mode, sensors } from './sensors.ts'
import { saveSettings, settings } from './settings.ts'
import { aimPoint, beamFx, closeStage, ctx, drawCrosshair, drawFx, hud, openStage, say, size, sparkFx, videoSize, view } from './stage.ts'
import { onTrigger } from './trigger.ts'

// Strumento a schermo intero sopra la fotocamera: HUD, ciclo di disegno e grilletto.
async function tool(html: string, onFire: ((x: number, y: number) => void) | null, drawExtra: () => void, done: () => void) {
  hud.innerHTML = `<div class="hud-msg" hidden></div>${html}`
  let raf = 0
  let off = () => {}
  const close = () => {
    cancelAnimationFrame(raf)
    off()
    closeStage()
    done()
  }
  hud.querySelector('[data-a="annulla"]')?.addEventListener('click', close)
  try {
    await openStage()
  } catch {
    close()
    alert('Non riesco ad aprire la fotocamera. Controlla il permesso nelle impostazioni del browser.')
    return close
  }
  if (onFire) off = onTrigger(document.getElementById('stage')!, onFire)
  const frame = () => {
    raf = requestAnimationFrame(frame)
    ctx.clearRect(0, 0, size.w, size.h)
    drawExtra()
    drawFx()
  }
  raf = requestAnimationFrame(frame)
  return close
}

// Calibrazione del mirino: si guarda lungo la canna e si trascina il mirino sull'oggetto puntato.
export async function calibrateAim(done: () => void) {
  const start = { x: settings.offX, y: settings.offY }
  const close = await tool(
    `<div class="hud-panel left">
       <b>Calibra il mirino</b>
       <p>Metti il telefono nel fucile. Guarda lungo la canna e punta un oggetto a circa 3 metri.</p>
       <p>Poi trascina il dito sullo schermo per spostare il mirino sopra l'oggetto.</p>
       <p data-off></p>
     </div>
     <div class="hud-panel right">
       <button class="btn small primary" data-a="salva">Salva</button>
       <button class="btn small" data-a="azzera">Al centro</button>
       <button class="btn small" data-a="annulla">Annulla</button>
     </div>`,
    null,
    () => {
      const [x, y] = aimPoint()
      drawCrosshair(x, y, false, settings.color)
      hud.querySelector('[data-off]')!.textContent = `Spostamento: ${Math.round(settings.offX)}, ${Math.round(settings.offY)}`
    },
    done,
  )
  let last: [number, number] | null = null
  const stage = document.getElementById('stage')!
  const down = (e: PointerEvent) => {
    if ((e.target as Element).closest('button')) return
    last = [e.clientX, e.clientY]
  }
  const move = (e: PointerEvent) => {
    if (!last) return
    // metà della velocità del dito, per essere precisi
    settings.offX = Math.max(-size.w / 3, Math.min(size.w / 3, settings.offX + (e.clientX - last[0]) * 0.5))
    settings.offY = Math.max(-size.h / 3, Math.min(size.h / 3, settings.offY + (e.clientY - last[1]) * 0.5))
    last = [e.clientX, e.clientY]
  }
  const up = () => (last = null)
  stage.addEventListener('pointerdown', down)
  stage.addEventListener('pointermove', move)
  stage.addEventListener('pointerup', up)
  const cleanup = () => {
    stage.removeEventListener('pointerdown', down)
    stage.removeEventListener('pointermove', move)
    stage.removeEventListener('pointerup', up)
  }
  hud.querySelector('[data-a="azzera"]')!.addEventListener('click', () => {
    settings.offX = 0
    settings.offY = 0
  })
  hud.querySelector('[data-a="salva"]')!.addEventListener('click', () => {
    saveSettings()
    cleanup()
    close()
  })
  hud.querySelector('[data-a="annulla"]')!.addEventListener('click', () => {
    settings.offX = start.x
    settings.offY = start.y
    cleanup()
  })
}

// Campo visivo: punti un oggetto, ti giri finché arriva alla riga sul bordo, e dall'angolo misurato
// ricavo la lunghezza focale. Poi un puntino virtuale resta sull'oggetto e lo rifinisci con lo slider.
export async function calibrateFov(done: () => void) {
  let step = 0
  let yaw1 = 0
  let pin: Vec3 | null = null
  let fov = settings.fov
  const lineX = () => size.w * 0.12
  const text = [
    'Punta il mirino al centro di un oggetto lontano (almeno 3 metri) e premi il grilletto.',
    'Ora girati piano verso destra finché l\'oggetto arriva sulla riga gialla a sinistra. Fermati e premi il grilletto.',
    'Girati a destra e a sinistra: il puntino rosa deve restare sopra l\'oggetto. Se scivola, regola lo slider.',
  ]
  const close = await tool(
    `<div class="hud-panel left"><b>Campo visivo</b><p data-step></p><p data-fov></p></div>
     <div class="hud-panel right">
       <input type="range" min="40" max="90" step="0.5" data-slider hidden>
       <button class="btn small primary" data-a="salva" hidden>Salva</button>
       <button class="btn small" data-a="rifai">Rifai</button>
       <button class="btn small" data-a="annulla">Annulla</button>
     </div>`,
    () => {
      if (step === 0) {
        yaw1 = sensors.yaw
        pin = forward(sensors.q)
        step = 1
        play('beep')
      } else if (step === 1) {
        const theta = Math.abs(wrap(sensors.yaw - yaw1))
        const [ax] = aimPoint()
        const [vw, vh] = videoSize()
        const f = solveFocal(ax, lineX(), size.w / 2, theta)
        fov = Math.max(40, Math.min(90, fovFromFocal(f, size.w, size.h, vw, vh)))
        step = 2
        play('hit')
        slider.value = String(fov)
        slider.hidden = false
        saveBtn.hidden = false
      }
      render()
    },
    () => {
      const [ax, ay] = aimPoint()
      if (step === 1) {
        ctx.strokeStyle = '#ffd23f'
        ctx.lineWidth = 4
        ctx.setLineDash([12, 8])
        ctx.beginPath()
        ctx.moveTo(lineX(), 40)
        ctx.lineTo(lineX(), size.h - 40)
        ctx.stroke()
        ctx.setLineDash([])
      }
      if (step === 2 && pin) {
        const p = project(sensors.q, pin, view(fov))
        if (p) {
          ctx.fillStyle = '#ff6fb5'
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(p.x, p.y, 10, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      }
      drawCrosshair(ax, ay, false, settings.color)
    },
    done,
  )
  const slider = hud.querySelector<HTMLInputElement>('[data-slider]')!
  const saveBtn = hud.querySelector<HTMLElement>('[data-a="salva"]')!
  const render = () => {
    hud.querySelector('[data-step]')!.textContent = text[step]
    hud.querySelector('[data-fov]')!.textContent = `Campo visivo: ${fov.toFixed(1)} gradi`
  }
  render()
  if (mode() === 'nessuno') hud.querySelector('[data-step]')!.textContent = 'Questo telefono non sa quando ti giri: il campo visivo non serve.'
  slider.addEventListener('input', () => {
    fov = Number(slider.value)
    render()
  })
  hud.querySelector('[data-a="rifai"]')!.addEventListener('click', () => {
    step = 0
    slider.hidden = true
    saveBtn.hidden = true
    render()
  })
  saveBtn.addEventListener('click', () => {
    settings.fov = fov
    saveSettings()
    close()
  })
}

// Giro completo: punti un oggetto, ti giri di 360 gradi e torni lì. Misura quanto deriva l'orientamento.
export async function compassTest(done: () => void) {
  let step = 0
  let startYaw = 0, prevYaw = 0, turned = 0
  const close = await tool(
    `<div class="hud-panel left"><b>Prova del giro completo</b><p data-step>Punta un oggetto con il mirino e premi il grilletto.</p><p data-turn></p></div>
     <div class="hud-panel right">
       <button class="btn small primary" data-a="fatto" hidden>Fatto</button>
       <button class="btn small" data-a="annulla">Annulla</button>
     </div>`,
    () => {
      const stepEl = hud.querySelector('[data-step]')!
      if (step === 0) {
        startYaw = prevYaw = sensors.yaw
        turned = 0
        step = 1
        play('beep')
        stepEl.textContent = 'Girati piano di un giro completo, torna sullo stesso oggetto, fermati un attimo e premi il grilletto.'
      } else if (step === 1) {
        if (Math.abs(turned) < 300 * D) {
          play('click')
          say('Il giro non è completo, continua', 1500, 'warn')
          return
        }
        const err = Math.abs(wrap(sensors.yaw - startYaw)) / D
        settings.drift = err
        saveSettings()
        step = 2
        play(err <= 15 ? 'hit' : 'oops')
        stepEl.textContent =
          err <= 15
            ? `Scarto di ${err.toFixed(0)} gradi: va bene, puoi giocare con i bersagli intorno.`
            : `Scarto di ${err.toFixed(0)} gradi: troppo. Su questo telefono conviene la modalità Bersagli sui muri (arriva in una prossima versione).`
        hud.querySelector<HTMLElement>('[data-a="fatto"]')!.hidden = false
      }
    },
    () => {
      if (step === 1) {
        turned += wrap(sensors.yaw - prevYaw)
        prevYaw = sensors.yaw
        hud.querySelector('[data-turn]')!.textContent = `Giro: ${Math.min(360, Math.abs(turned / D)).toFixed(0)} gradi`
      }
      const [ax, ay] = aimPoint()
      drawCrosshair(ax, ay, false, settings.color)
    },
    done,
  )
  hud.querySelector('[data-a="fatto"]')!.addEventListener('click', () => close())
}

// Prova del grilletto: ogni tocco lampeggia nel punto toccato. Si vedono le zone coperte dal cartone.
export async function triggerTest(done: () => void) {
  let n = 0
  await tool(
    `<div class="zone zone-trigger">grilletto</div>
     <div class="zone zone-lip l"></div><div class="zone zone-lip r"></div>
     <div class="zone zone-hook">gancio</div>
     <div class="hud-panel left"><b>Prova del grilletto</b><p>Premi il grilletto del fucile: il punto toccato deve cadere nel riquadro tratteggiato.</p><p data-n>Tocchi: 0</p></div>
     <div class="hud-panel right"><button class="btn small" data-a="annulla">Fine</button></div>`,
    (x, y) => {
      n++
      const zone = hud.querySelector('.zone-trigger')!.getBoundingClientRect()
      const inside = x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom
      hud.querySelector('[data-n]')!.textContent = `Tocchi: ${n}. ${inside ? 'Nel posto giusto!' : 'Fuori dal riquadro'}`
      play(inside ? 'hit' : 'click')
      sparkFx(x, y)
      beamFx(settings.color)
      const dot = document.createElement('div')
      dot.className = 'tap-dot'
      dot.style.left = x + 'px'
      dot.style.top = y + 'px'
      hud.append(dot)
      setTimeout(() => dot.remove(), 900)
    },
    () => {},
    done,
  )
}
