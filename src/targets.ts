import { D } from './math.ts'

export type Diff = 'facile' | 'media' | 'difficile'
export type Kind = 'normale' | 'veloce' | 'dorato' | 'amico'
export type Theme = 'palloncini' | 'stelle' | 'mostri' | 'lattine' | 'zombi'

export type Target = {
  id: number
  kind: Kind
  az: number // radianti, relativo alla direzione zero
  el: number
  born: number // secondi di gioco
  life: number
  r: number // raggio in metri
  dist: number // metri
  vaz: number // rad/s, solo per i veloci
  tint: number
  hitAt?: number
  // zombi: partono a d0 metri e camminano verso il giocatore a v m/s; life = tempo per arrivare
  d0?: number
  v?: number
  caught?: boolean
  // piattelli: salgono con velocità vel (rad/s) e ricadono
  vel?: number
  launched?: boolean
}

// r: raggio del bersaglio, life: secondi prima che voli via, every: secondi tra un bersaglio e l'altro,
// speed: velocità dei veloci, spread: gradi totali intorno al giocatore a fine partita.
export const DIFF = {
  facile: { r: 0.4, life: 6, every: 2, speed: 0.1, spread: 200 },
  media: { r: 0.3, life: 4.5, every: 1.5, speed: 0.18, spread: 300 },
  difficile: { r: 0.22, life: 3.4, every: 1, speed: 0.28, spread: 360 },
}

export const POINTS: Record<Kind, number> = { normale: 1, veloce: 2, dorato: 5, amico: -2 }

export function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const azAt = (t: Target, now: number) => t.az + t.vaz * (now - t.born)

// Sequenza completa decisa solo dal seme: nel multiplayer ogni telefono genera la stessa.
export function schedule(seed: number, diff: Diff, duration: number, sizeMul = 1): Target[] {
  const d = DIFF[diff]
  const rnd = mulberry32(seed)
  const out: Target[] = []
  for (let t = 1.5, id = 0; t < duration - 1; t += d.every * (0.75 + rnd() * 0.5), id++) {
    // per il primo 15% della partita i 90 gradi davanti, poi sempre più di lato e dietro
    const half = (45 + Math.max(0, (t / duration - 0.15) / 0.85) * (d.spread / 2 - 45)) * D
    const roll = rnd()
    const kind: Kind = roll < 0.06 ? 'dorato' : roll < 0.16 ? 'amico' : roll < 0.36 ? 'veloce' : 'normale'
    let az = 0, el = 0
    for (let k = 0; k < 6; k++) {
      az = (rnd() * 2 - 1) * half
      el = (-15 + rnd() * 50) * D
      const clash = out.some((o) => o.born + o.life > t && Math.hypot((azAt(o, t) - az) * Math.cos(el), o.el - el) < 16 * D)
      if (!clash) break
    }
    out.push({
      id, kind, az, el, born: t,
      life: kind === 'dorato' ? d.life * 0.55 : d.life,
      r: d.r * sizeMul * (kind === 'dorato' ? 0.8 : 1),
      dist: 3 + rnd() * 2,
      vaz: kind === 'veloce' ? d.speed * (rnd() < 0.5 ? -1 : 1) : 0,
      tint: Math.floor(rnd() * 4),
    })
  }
  return out
}

// Allenamento: bersagli fermi e normali davanti al giocatore, finché non li colpisci.
export function trainingTarget(id: number, now: number, sizeMul = 1): Target {
  return {
    id, kind: 'normale', born: now, life: Infinity,
    az: (Math.random() * 2 - 1) * 40 * D, el: (-5 + Math.random() * 30) * D,
    r: DIFF.facile.r * sizeMul, dist: 3 + Math.random() * 2, vaz: 0, tint: id % 4,
  }
}

// Zombi buffi: camminano sul pavimento virtuale verso il giocatore.
export const ZOMBIE = { height: 1.5, hitY: 0.85, hitR: 0.5, reach: 1.8 } // metri; più vicino di 1,8 m riempirebbero lo schermo
export const ZDIFF = {
  facile: { every: 2.6, v: 0.3, spread: 200 },
  media: { every: 1.9, v: 0.45, spread: 300 },
  difficile: { every: 1.4, v: 0.6, spread: 360 },
}

export const zDist = (t: Target, now: number) => Math.max(ZOMBIE.reach, t.d0! - t.v! * (now - t.born))

export function zombieSchedule(seed: number, diff: Diff, duration: number, sizeMul = 1): Target[] {
  const d = ZDIFF[diff]
  const rnd = mulberry32(seed)
  const out: Target[] = []
  for (let t = 1.5, id = 0; t < duration - 2; t += d.every * (0.75 + rnd() * 0.5), id++) {
    const half = (45 + Math.max(0, (t / duration - 0.15) / 0.85) * (d.spread / 2 - 45)) * D
    const roll = rnd()
    const kind: Kind = roll < 0.07 ? 'dorato' : roll < 0.3 ? 'veloce' : 'normale'
    const d0 = 5.5 + rnd() * 1.5
    const v = d.v * (kind === 'veloce' ? 1.6 : kind === 'dorato' ? 1.3 : 1)
    out.push({
      id, kind, az: (rnd() * 2 - 1) * half, el: 0, born: t, life: (d0 - ZOMBIE.reach) / v,
      r: ZOMBIE.hitR * sizeMul, dist: d0, vaz: 0, tint: Math.floor(rnd() * 4), d0, v,
    })
  }
  return out
}

// Chiosco del luna park: tre file di bersagli che scorrono davanti, a destra e a sinistra, sempre più veloci.
export const BOOTH = { half: 24 * D, rows: [-8 * D, 0, 8 * D], dist: 4, shots: 20, duration: 60 } // sta quasi tutto nello schermo
// Arcade: si perde un colpo solo quando si sbaglia, e si gioca finché ne restano.
export const ARCADE = { shots: 10, duration: 600 }
const BDIFF = { facile: { speed: 0.16, every: 0.9, r: 0.2 }, media: { speed: 0.24, every: 0.7, r: 0.16 }, difficile: { speed: 0.34, every: 0.55, r: 0.13 } }

export function boothSchedule(seed: number, diff: Diff, sizeMul = 1, duration = BOOTH.duration): Target[] {
  const d = BDIFF[diff]
  const rnd = mulberry32(seed)
  const out: Target[] = []
  for (let t = 1, id = 0; t < duration; t += d.every * (0.7 + rnd() * 0.6), id++) {
    const row = Math.floor(rnd() * 3)
    const dir = row % 2 ? -1 : 1 // le file vanno in versi alterni
    const roll = rnd()
    const kind: Kind = roll < 0.07 ? 'dorato' : roll < 0.17 ? 'amico' : roll < 0.37 ? 'veloce' : 'normale'
    const speed = d.speed * Math.min(2.2, 1 + (t / BOOTH.duration) * 0.6) * (kind === 'veloce' ? 1.6 : 1)
    out.push({
      id, kind, az: -dir * BOOTH.half, el: BOOTH.rows[row], born: t, life: (2 * BOOTH.half) / speed,
      r: d.r * sizeMul * (kind === 'dorato' ? 0.8 : 1), dist: BOOTH.dist, vaz: dir * speed, tint: Math.floor(rnd() * 4),
    })
  }
  return out
}

// Tiro al piattello: i piattelli partono da un lato, volano ad arco davanti a te e ricadono dall'altra parte.
export const CLAY = { g: 0.5, el0: -6 * D, dist: 7, duration: 60 } // g in rad/s², il piattello parte 6 gradi sotto l'orizzonte
const CDIFF = { facile: { speed: 0.32, every: 2.6, r: 0.26, double: 0 }, media: { speed: 0.42, every: 2.2, r: 0.21, double: 0.3 }, difficile: { speed: 0.52, every: 1.8, r: 0.17, double: 0.5 } }
export const clayEl = (t: Target, now: number) => {
  const dt = now - t.born
  return t.el + t.vel! * dt - (CLAY.g * dt * dt) / 2
}

export function claySchedule(seed: number, diff: Diff, sizeMul = 1, duration = CLAY.duration): Target[] {
  const d = CDIFF[diff]
  const rnd = mulberry32(seed)
  const out: Target[] = []
  for (let t = 1.5, id = 0; t < duration - 3; t += d.every * (0.8 + rnd() * 0.4)) {
    const n = rnd() < d.double ? 2 : 1 // la doppietta: due piattelli quasi insieme
    for (let k = 0; k < n; k++, id++) {
      const side = rnd() < 0.5 ? -1 : 1
      const roll = rnd()
      const kind: Kind = roll < 0.08 ? 'dorato' : roll < 0.3 ? 'veloce' : 'normale'
      const vel = 0.5 + rnd() * 0.25
      out.push({
        id, kind, az: side * (24 + rnd() * 10) * D, el: CLAY.el0, born: t + k * 0.4, life: (2 * vel) / CLAY.g,
        r: d.r * sizeMul * (kind === 'dorato' ? 0.85 : 1), dist: CLAY.dist,
        vaz: -side * d.speed * (kind === 'veloce' ? 1.4 : 1) * (0.85 + rnd() * 0.3), tint: 0, vel,
      })
    }
  }
  return out
}
