import type { Diff, Theme } from './targets.ts'

// Campo visivo orizzontale di partenza per modello, da rifinire con la calibrazione.
export const MODELS: Record<string, [string, number]> = {
  iphone17pro: ['iPhone 17 Pro', 64],
  iphone14pro: ['iPhone 14 Pro', 64],
  redmia5: ['Redmi A5', 66],
  altro: ['Altro telefono', 63],
}

export const COLORS = ['#ff5a5f', '#ff9f1c', '#ffd23f', '#2ec27e', '#3d8bfd', '#a66cff', '#ff6fb5', '#00b8c4']

const DEFAULTS = {
  name: '',
  color: '#3d8bfd',
  model: 'altro',
  fov: 63,
  offX: 0, // calibrazione del mirino in px CSS
  offY: 0,
  tol: 0.2, // tolleranza del colpo, frazione del raggio
  volume: 0.8,
  debug: false,
  drift: -1, // scarto del test del giro completo in gradi, -1 se non fatto
  theme: 'palloncini' as Theme,
  diff: 'facile' as Diff,
  duration: 60, // 0 = allenamento
  gunH: 1.2, // altezza del fucile da terra in metri, per il pavimento virtuale degli zombi
  z3d: false, // zombi disegnati in 3D
}
export type Settings = typeof DEFAULTS

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {}
}

export const settings: Settings = { ...DEFAULTS, ...read('lt:settings', {}) }
export const saveSettings = () => write('lt:settings', settings)

export type Rec = { name: string; score: number; acc: number; streak: number; date: number }

export function insertRecord(list: Rec[], r: Rec): [Rec[], number] {
  const l = [...list, r].sort((a, b) => b.score - a.score || b.acc - a.acc).slice(0, 10)
  return [l, l.indexOf(r)]
}

export const recordKey = (diff: Diff, duration: number, zombi = false) => `lt:rec:${zombi ? 'zombi' : 'tiro'}:${diff}:${duration}`
export const loadRecords = (key: string): Rec[] => read(key, [])

// Restituisce la posizione in classifica (0 = primo) oppure -1.
export function saveRecord(key: string, r: Rec): number {
  const [l, i] = insertRecord(loadRecords(key), r)
  if (i >= 0) write(key, l)
  return i
}
