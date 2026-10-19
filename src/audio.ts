import { settings } from './settings.ts'

// Tutti i suoni sono sintetizzati una volta in un AudioBuffer (OfflineAudioContext), poi suonati senza latenza.
type Synth = (c: BaseAudioContext, out: AudioNode) => void

function tone(c: BaseAudioContext, out: AudioNode, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t0)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(out)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}

function noise(c: BaseAudioContext, out: AudioNode, t0: number, dur: number, vol: number, freq: number, q = 0.7) {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2
  const s = c.createBufferSource()
  const f = c.createBiquadFilter()
  const g = c.createGain()
  s.buffer = b
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  g.gain.value = vol
  s.connect(f).connect(g).connect(out)
  s.start(t0)
}

const SOUNDS: Record<string, [number, Synth]> = {
  pew: [0.2, (c, o) => { tone(c, o, 'triangle', 1500, 260, 0, 0.18, 0.35); tone(c, o, 'sine', 3000, 520, 0, 0.12, 0.08) }],
  hit: [0.5, (c, o) => { tone(c, o, 'sine', 1319, 1319, 0, 0.3, 0.3); tone(c, o, 'sine', 1976, 1976, 0.07, 0.35, 0.25) }],
  click: [0.06, (c, o) => noise(c, o, 0, 0.03, 0.8, 3000, 2)],
  reload: [0.4, (c, o) => { noise(c, o, 0, 0.03, 0.8, 2500, 2); noise(c, o, 0.1, 0.03, 0.8, 2500, 2); tone(c, o, 'sine', 300, 900, 0.12, 0.25, 0.2) }],
  beep: [0.15, (c, o) => tone(c, o, 'sine', 660, 660, 0, 0.12, 0.3)],
  go: [0.35, (c, o) => tone(c, o, 'sine', 990, 990, 0, 0.3, 0.35)],
  oops: [0.5, (c, o) => { tone(c, o, 'sine', 750, 380, 0, 0.42, 0.3); tone(c, o, 'triangle', 760, 390, 0, 0.42, 0.1) }],
  end: [0.9, (c, o) => [523, 659, 784, 1047].forEach((f, i) => tone(c, o, 'triangle', f, f, i * 0.12, i === 3 ? 0.5 : 0.18, 0.3))],
  pop_palloncini: [0.15, (c, o) => { noise(c, o, 0, 0.09, 1.6, 1200); tone(c, o, 'sine', 160, 60, 0, 0.08, 0.4) }],
  pop_stelle: [0.45, (c, o) => [1568, 2093, 2637].forEach((f, i) => tone(c, o, 'sine', f, f, i * 0.05, 0.22, 0.2))],
  pop_mostri: [0.4, (c, o) => { tone(c, o, 'sine', 180, 700, 0, 0.14, 0.35); tone(c, o, 'sine', 700, 300, 0.14, 0.22, 0.25) }],
  pop_zombi: [0.45, (c, o) => { tone(c, o, 'sine', 220, 140, 0, 0.18, 0.3); tone(c, o, 'triangle', 300, 900, 0.16, 0.2, 0.25); noise(c, o, 0.16, 0.06, 1, 2500) }],
  // chi viene colpito: suono ben riconoscibile, si sente nella stanza (boing che scende e risale, non stridente)
  colpito: [0.6, (c, o) => { tone(c, o, 'triangle', 880, 330, 0, 0.25, 0.5); tone(c, o, 'sine', 330, 660, 0.22, 0.3, 0.45); tone(c, o, 'sine', 1320, 1320, 0, 0.12, 0.15) }],
  fuori: [1, (c, o) => [784, 659, 523, 392].forEach((f, i) => tone(c, o, 'triangle', f, f * 0.97, i * 0.16, 0.22, 0.35))],
  rientro: [0.6, (c, o) => [523, 659, 784].forEach((f, i) => tone(c, o, 'sine', f, f, i * 0.09, 0.2, 0.3))],
  // duello: la campana del via e lo spruzzo della pistola ad acqua
  bell: [1.2, (c, o) => [1, 2.76, 5.4].forEach((m, i) => tone(c, o, 'sine', 880 * m, 880 * m, 0, 1.1 - i * 0.3, 0.3 / (i + 1)))],
  splash: [0.5, (c, o) => { noise(c, o, 0, 0.4, 1.4, 1800, 0.5); tone(c, o, 'sine', 500, 200, 0, 0.2, 0.15) }],
  pop_lattine: [0.4, (c, o) => { [523, 787, 1150].forEach((f) => tone(c, o, 'square', f, f * 0.98, 0, 0.3, 0.07)); noise(c, o, 0, 0.05, 1, 4000, 1) }],
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
const buffers: Record<string, AudioBuffer> = {}

// Al primo tocco: su iPhone l'audio parte solo da un gesto dell'utente.
export function unlockAudio() {
  if (ctx) {
    if (ctx.state !== 'running') ctx.resume()
    return
  }
  try {
    ;(navigator as any).audioSession && ((navigator as any).audioSession.type = 'playback') // suona anche col tasto silenzioso
    ctx = new AudioContext()
    master = ctx.createGain()
    master.connect(ctx.destination)
    setVolume(settings.volume)
    const sr = ctx.sampleRate
    for (const [name, [dur, synth]] of Object.entries(SOUNDS)) {
      const off = new OfflineAudioContext(1, Math.ceil(sr * dur), sr)
      synth(off, off.destination)
      off.startRendering().then((b) => (buffers[name] = b))
    }
  } catch {}
}

export const audioState = () => ctx?.state ?? 'spento'

export function setVolume(v: number) {
  if (master) master.gain.value = v
}

export function play(name: string, vol = 1, rate = 1) {
  const b = buffers[name]
  if (!ctx || !master || !b) return
  if (ctx.state !== 'running') ctx.resume()
  const s = ctx.createBufferSource()
  s.buffer = b
  s.playbackRate.value = rate // tono più alto o più basso, per esempio per squadra
  if (vol === 1) s.connect(master)
  else {
    const g = ctx.createGain()
    g.gain.value = vol
    s.connect(g).connect(master)
  }
  s.start()
}
