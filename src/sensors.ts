import { deviceQuat, forward, pitchOf, qNlerp, yawOf, type Quat } from './math.ts'

// giroscopio: orientamento completo e reattivo. bussola: c'è l'orientamento ma non il giroscopio (Redmi A5).
// nessuno: manca l'orientamento orizzontale (Galaxy A02s). negato: permesso rifiutato su iPhone.
export type Mode = 'giroscopio' | 'bussola' | 'nessuno' | 'negato' | 'spenti'

export const sensors = {
  q: [0, 0, 0, 1] as Quat,
  yaw: 0,
  pitch: 0,
  hasAlpha: false,
  hasGyro: false,
  started: false,
  denied: false,
  onShake: () => {},
}

let absolute = false
let shakes: number[] = []

export function screenAngle(): number {
  const a = screen.orientation?.angle ?? (window as any).orientation ?? 0
  return ((a % 360) + 360) % 360
}

export function mode(): Mode {
  if (sensors.denied) return 'negato'
  if (!sensors.started) return 'spenti'
  if (!sensors.hasAlpha) return 'nessuno'
  return sensors.hasGyro ? 'giroscopio' : 'bussola'
}

function onOrient(e: DeviceOrientationEvent, isAbs: boolean) {
  if (!isAbs && absolute) return
  if (e.beta == null || e.gamma == null) return
  if (e.alpha != null) {
    sensors.hasAlpha = true
    if (isAbs) absolute = true
  }
  // senza alpha l'imbardata non vale, ma l'inclinazione (per la ricarica) sì
  const target = deviceQuat(e.alpha ?? 0, e.beta, e.gamma, screenAngle())
  // ponytail: filtro passa basso fisso per la bussola, One Euro se tremola ancora troppo
  sensors.q = mode() === 'bussola' ? qNlerp(sensors.q, target, 0.12) : target
  const f = forward(sensors.q)
  sensors.yaw = yawOf(f)
  sensors.pitch = pitchOf(f)
}

function onMotion(e: DeviceMotionEvent) {
  if (e.rotationRate?.alpha != null) sensors.hasGyro = true
  // scossoni ripetuti, tipici della corsa
  const a = e.acceleration
  const g = e.accelerationIncludingGravity
  const mag = a?.x != null ? Math.hypot(a.x, a.y ?? 0, a.z ?? 0) : g?.x != null ? Math.abs(Math.hypot(g.x, g.y ?? 0, g.z ?? 0) - 9.81) : 0
  const now = performance.now()
  if (mag > 14 && now - (shakes.at(-1) ?? 0) > 200) {
    shakes = [...shakes.filter((t) => now - t < 3000), now]
    if (shakes.length >= 4) {
      shakes = []
      sensors.onShake()
    }
  }
}

// Va chiamata dentro un gesto dell'utente (permesso su iPhone).
export async function startSensors(): Promise<Mode> {
  if (sensors.started) return mode()
  const DOE = (window as any).DeviceOrientationEvent
  const DME = (window as any).DeviceMotionEvent
  if (typeof DOE?.requestPermission === 'function') {
    try {
      const [r] = await Promise.all([DOE.requestPermission(), DME?.requestPermission?.()])
      if (r !== 'granted') {
        sensors.denied = true
        return mode()
      }
    } catch {
      return mode() // chiamata fuori da un gesto: si riprova al prossimo tocco
    }
  }
  sensors.denied = false
  sensors.started = true
  addEventListener('deviceorientationabsolute', (e) => onOrient(e as DeviceOrientationEvent, true))
  addEventListener('deviceorientation', (e) => onOrient(e, false))
  addEventListener('devicemotion', onMotion)
  await new Promise((r) => setTimeout(r, 1000))
  return mode()
}

export const MODE_TEXT: Record<Mode, string> = {
  giroscopio: 'Giroscopio attivo',
  bussola: 'Senza giroscopio: uso la bussola',
  nessuno: 'Senza giroscopio né bussola',
  negato: 'Sensori non permessi',
  spenti: 'Sensori da attivare',
}
