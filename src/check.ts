// Controllo della logica pura: npm run check
import assert from 'node:assert/strict'
import { D, deviceQuat, dirFrom, forward, fovFromFocal, inPoly, project, qRot, solveFocal, viewFor, yawOf } from './math.ts'
import { DEFAULT_CONFIG, OUT_MS, resetForRound, SAFE_MS, shoot, standings, type Player, type Room } from './rules.ts'
import { insertRecord } from './settings.ts'
import { schedule, zDist, ZOMBIE, zombieSchedule } from './targets.ts'

const near = (a: number, b: number, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`)

// telefono in orizzontale, in piedi, nei due versi: la camera guarda all'orizzonte e il cielo resta in alto
for (const [gamma, angle] of [[-90, 90], [90, 270]]) {
  const q = deviceQuat(30, 0, gamma, angle)
  near(forward(q)[1], 0)
  near(qRot(q, [0, 1, 0])[1], 1)
}

// una direzione davanti alla camera finisce al centro dello schermo; ruotando l'alpha si sposta di lato
const q = deviceQuat(0, 90, 0, 0)
const v = viewFor(852, 393, 1280, 720, 63)
const p = project(q, dirFrom(yawOf(forward(q)), 0), v)!
near(p.x, 426)
near(p.y, 196.5)
const side = project(deviceQuat(10, 90, 0, 0), dirFrom(0, 0), v)!
near(side.x, 426 + v.f * Math.tan(10 * D), 1e-3)
assert.equal(project(q, dirFrom(Math.PI, 0), v), null)

// la misura del campo visivo ritrova la focale usata per generare i punti
const f = solveFocal(426, 426 - v.f * Math.tan(20 * D), 426, 20 * D)
near(f, v.f, 1e-3)
near(fovFromFocal(f, 852, 393, 1280, 720), 63, 1e-6)

// la sequenza dei bersagli dipende solo dal seme e rispetta i limiti
const a = schedule(42, 'media', 90), b = schedule(42, 'media', 90)
assert.deepEqual(a, b)
assert.notDeepEqual(a, schedule(43, 'media', 90))
for (const t of a) {
  assert.ok(t.el >= -15 * D && t.el <= 35 * D)
  assert.ok(t.dist >= 3 && t.dist <= 5)
  assert.ok(t.born + t.life <= 90 + 6)
}
assert.ok(a.filter((t) => t.born < 10).every((t) => Math.abs(t.az) <= 50 * D), 'i primi bersagli stanno davanti')
assert.ok(schedule(1, 'difficile', 120).some((t) => Math.abs(t.az) > 150 * D), 'alla fine anche dietro')

// zombi: stessa sequenza dallo stesso seme, partono lontano e arrivano alla distanza minima a fine vita
const zs = zombieSchedule(7, 'media', 60)
assert.deepEqual(zs, zombieSchedule(7, 'media', 60))
for (const z of zs) {
  assert.ok(z.d0! >= 5.5 && zDist(z, z.born) === z.d0)
  near(zDist(z, z.born + z.life), ZOMBIE.reach)
  assert.notEqual(z.kind, 'amico')
}

// classifica: i 10 migliori, ordinati
let list = Array.from({ length: 10 }, (_, i) => ({ name: 'a', score: (i + 1) * 10, acc: 0.5, streak: 1, date: 0 }))
let [l, rank] = insertRecord(list, { name: 'b', score: 5, acc: 1, streak: 1, date: 0 })
assert.equal(rank, -1)
assert.equal(l.length, 10)
;[list, rank] = insertRecord(list, { name: 'b', score: 105, acc: 1, streak: 1, date: 0 })
assert.equal(rank, 0)
assert.equal(list[9].score, 20)

// colpo dentro il marker allargato del 20%
const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]
assert.ok(inPoly(sq, 5, 5) && !inPoly(sq, 11, 5) && inPoly(sq, 10.9, 5, 0.2) && !inPoly(sq, 11.2, 5, 0.2))

// regole del laser tag, applicate dal server
const mk = (id: string, marker: number, team: 0 | 1): Player => {
  const p = { id, name: id, color: '#000', marker, team, ready: { cam: true, sens: true, cal: true, gun: true }, online: true } as Player
  resetForRound(p, DEFAULT_CONFIG)
  return p
}
const lt: Room = {
  code: 'ABCD', phase: 'gioco', dirId: 'a', config: { ...DEFAULT_CONFIG }, players: [mk('a', 1, 0), mk('b', 2, 1), mk('c', 3, 0)],
  startAt: 0, pausedAt: 0, pausedMs: 0, restUntil: 0, volume: 1, results: null,
}
const [pa, pb, pc] = lt.players
let now = 1000
assert.equal(shoot(lt, pa, 2, now)?.hit, pb)
assert.equal(shoot(lt, pa, 2, now + 100), null) // troppo presto: cadenza
for (let i = 1; i < 5; i++) shoot(lt, pa, 2, (now += 300))
assert.equal(pb.life, 0)
assert.equal(pa.score, 5 + 3) // 5 colpi, più 3 per averlo mandato fuori gioco
assert.equal(shoot(lt, pa, 2, (now += 300))?.hit, null) // fuori gioco: non si colpisce
assert.equal(shoot(lt, pb, 1, now + 50), null) // e non spara
now += OUT_MS
assert.equal(shoot(lt, pa, 2, (now += 10))?.hit, null) // scudo dopo il rientro
assert.equal(pb.life, DEFAULT_CONFIG.life)
now += SAFE_MS
assert.equal(shoot(lt, pa, 2, now)?.hit, pb)
assert.equal(pa.ammo, 10 - 8) // 8 spari validi su 10 colpi
assert.equal(shoot(lt, pa, 99, (now += 300))?.hit, null) // marker di nessuno
shoot(lt, pa, null, (now += 300)) // decimo colpo
assert.equal(shoot(lt, pa, 99, (now += 300)), null) // colpi finiti
lt.config.mode = 'squadre'
pc.ammo = 10
assert.equal(shoot(lt, pc, 1, (now += 300))?.hit, null) // niente fuoco amico
assert.equal(standings(lt)[0].id, 'a')
lt.pausedAt = now
assert.equal(shoot(lt, pc, 2, (now += 300)), null) // in pausa non si spara

console.log('ok')
