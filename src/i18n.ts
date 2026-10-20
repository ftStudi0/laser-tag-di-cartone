import game from './en/game.ts'
import lobby from './en/lobby.ts'
import main from './en/main.ts'
import misc from './en/misc.ts'
import { settings } from './settings.ts'

// Le chiavi sono i testi italiani: in italiano t() li restituisce così come sono, in inglese li cerca qui.
export const EN: Record<string, string> = { ...main, ...lobby, ...game, ...misc }

export type Lang = 'it' | 'en'
// 'auto': italiano se il telefono è in italiano, altrimenti inglese
export const lang: Lang = settings.lang === 'auto' ? (/^it\b/i.test(globalThis.navigator?.language ?? 'it') ? 'it' : 'en') : settings.lang

// t('Hai {n} colpi', { n: 3 }): i segnaposto {nome} valgono in tutte e due le lingue
export function t(it: string, vars?: Record<string, string | number>): string {
  const s = lang === 'en' ? (EN[it] ?? it) : it
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s
}
