import type { Diff, Theme } from './targets.ts'

// Regole del laser tag e tipi della stanza, usati sia dal server (Durable Object) sia dai telefoni.
// Tutti i tempi sono in millisecondi dell'orologio del server.

export type Team = 0 | 1
export type Ready = { cam: boolean; sens: boolean; gyro: boolean; cal: boolean; gun: boolean } // gyro: sa quando ti giri (serve ai bersagli)
export type Player = {
  id: string
  name: string
  color: string
  marker: number // numero stampato sul foglio, da 1
  team: Team
  ready: Ready
  online: boolean
  life: number
  ammo: number
  lastShot: number
  outUntil: number // fuori gioco fino a
  safeUntil: number // invulnerabile fino a
  score: number
  hits: number
  elims: number
  outs: number
  shots: number
  best: number // serie migliore, nella Sfida a bersagli
}
export type Game = 'laser' | 'sfida'
export type Config = {
  game: Game
  mode: 'ffa' | 'squadre'
  duration: number
  life: number
  ammo: number // 0 = infinite
  plays: boolean
  theme: Theme // Sfida a bersagli
  diff: Diff
}
export type Standing = { id: string; name: string; color: string; team: Team; score: number; hits: number; elims: number; outs: number; acc: number; best: number }
export type Room = {
  code: string
  phase: 'lobby' | 'gioco'
  dirId: string
  config: Config
  players: Player[]
  startAt: number // inizio del round dopo il conto alla rovescia
  pausedAt: number // 0 se non in pausa
  pausedMs: number
  restUntil: number // pausa obbligatoria tra un round e l'altro
  volume: number
  results: Standing[] | null
  seed: number // sequenza dei bersagli della Sfida, uguale per tutti
}
export type Ev = { k: 'hit'; by: string; to: string; out: boolean } | { k: 'fine' }

// Messaggi dal telefono al server.
export type ClientMsg =
  | { t: 'hello'; key: string; name: string; color: string; marker: number }
  | { t: 'ping'; c: number }
  | { t: 'ready'; ready: Ready }
  | { t: 'marker'; marker: number }
  | { t: 'config'; config: Partial<Config> }
  | { t: 'team'; id: string }
  | { t: 'start' }
  | { t: 'pause'; on: boolean }
  | { t: 'stop' }
  | { t: 'volume'; v: number }
  | { t: 'shot'; marker: number | null }
  | { t: 'reload' }
  | { t: 'score'; score: number; shots: number; good: number; best: number }
// Messaggi dal server al telefono.
export type ServerMsg =
  | { t: 'state'; room: Room; you: string; ev?: Ev }
  | { t: 'pong'; c: number; s: number }
  | { t: 'error'; msg: string }

export const OUT_MS = 8000
export const SAFE_MS = 3000
export const RATE_MS = 300
export const COUNTDOWN_MS = 3000
export const REST_MS = 60_000
export const MAX_MARKER = 12
export const TEAMS = [
  { name: 'Squadra Arancio', color: '#ff9f1c' },
  { name: 'Squadra Blu', color: '#3d8bfd' },
]
export const DEFAULT_CONFIG: Config = { game: 'laser', mode: 'ffa', duration: 180, life: 5, ammo: 10, plays: true, theme: 'palloncini', diff: 'facile' }
export const DURATIONS: Record<Game, number[]> = { laser: [120, 180, 300], sfida: [60, 90, 120] }

export const endAt = (r: Room) => r.startAt + r.config.duration * 1000 + r.pausedMs
// Tempo che resta, fermo durante la pausa.
export const remaining = (r: Room, now: number) => Math.max(0, Math.min(r.config.duration * 1000, endAt(r) - Math.max(r.startAt, r.pausedAt || now)))
export const participants = (r: Room) => r.players.filter((p) => r.config.plays || p.id !== r.dirId)
export const isReady = (p: Player, c: Config) => p.ready.cam && (c.game === 'sfida' ? p.ready.gyro : p.ready.sens) && p.ready.cal && p.ready.gun
export const markerTaken = (r: Room, p: Player) => participants(r).some((o) => o !== p && o.marker === p.marker)
export const running = (r: Room, now: number) => r.phase === 'gioco' && !r.pausedAt && now >= r.startAt && now < endAt(r)

export type Status = 'in gioco' | 'fuori' | 'protetto'
export function status(p: Player, now: number): Status {
  return now < p.outUntil ? 'fuori' : now < p.safeUntil ? 'protetto' : 'in gioco'
}

// Finito il tempo fuori gioco si rientra con la vita piena.
export function settle(p: Player, cfg: Config, now: number) {
  if (p.life <= 0 && now >= p.outUntil) p.life = cfg.life
}

export function resetForRound(p: Player, cfg: Config) {
  Object.assign(p, { life: cfg.life, ammo: cfg.ammo, lastShot: 0, outUntil: 0, safeUntil: 0, score: 0, hits: 0, elims: 0, outs: 0, shots: 0, best: 0 })
}

// Applica uno sparo. Restituisce null se lo sparo non vale (fuori gioco, cadenza, munizioni).
export function shoot(r: Room, shooter: Player, marker: number | null, now: number): { hit: Player | null; out: boolean } | null {
  const c = r.config
  if (c.game !== 'laser') return null
  settle(shooter, c, now)
  if (!running(r, now) || status(shooter, now) !== 'in gioco') return null
  if (now - shooter.lastShot < RATE_MS - 60) return null // un po' di margine per il ritardo della rete
  if (c.ammo && shooter.ammo <= 0) return null
  shooter.lastShot = now
  shooter.shots++
  if (c.ammo) shooter.ammo--
  const t = marker == null ? undefined : participants(r).find((p) => p.marker === marker && p !== shooter)
  if (!t) return { hit: null, out: false }
  settle(t, c, now)
  if (status(t, now) !== 'in gioco') return { hit: null, out: false }
  if (c.mode === 'squadre' && t.team === shooter.team) return { hit: null, out: false } // niente fuoco amico
  t.life--
  shooter.hits++
  shooter.score++
  const out = t.life <= 0
  if (out) {
    t.outUntil = now + OUT_MS
    t.safeUntil = now + OUT_MS + SAFE_MS
    t.outs++
    t.ammo = c.ammo
    shooter.elims++
    shooter.score += 3
  }
  return { hit: t, out }
}

export function standings(r: Room): Standing[] {
  return participants(r)
    .map((p) => ({ id: p.id, name: p.name, color: p.color, team: p.team, score: p.score, hits: p.hits, elims: p.elims, outs: p.outs, acc: p.shots ? p.hits / p.shots : 0, best: p.best }))
    .sort((a, b) => b.score - a.score || b.acc - a.acc)
}

export function teamScores(s: Standing[]): [number, number] {
  return [0, 1].map((t) => s.filter((p) => p.team === t).reduce((n, p) => n + p.score, 0)) as [number, number]
}
