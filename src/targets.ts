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
}

// r: raggio del bersaglio, life: secondi prima che voli via, every: secondi tra un bersaglio e l'altro,
// speed: velocità dei veloci, spread: gradi totali intorno al giocatore a fine partita.
export const DIFF = {
  facile: { r: 0.4, life: 6, every: 2, speed: 0.1, spread: 200, ammo: false },
  media: { r: 0.3, life: 4.5, every: 1.5, speed: 0.18, spread: 300, ammo: true },
  difficile: { r: 0.22, life: 3.4, every: 1, speed: 0.28, spread: 360, ammo: true },
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
