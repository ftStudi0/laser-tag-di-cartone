// Server delle partite: un Durable Object per stanza, WebSocket con ibernazione.
// Al server arrivano solo eventi di gioco (marker colpito, stato): mai immagini della fotocamera.
import { DurableObject } from 'cloudflare:workers'
import type { Target } from '../src/targets.ts'
import {
  CALIBRATE_MS, claim, COUNTDOWN_MS, DEFAULT_CONFIG, DURATIONS, endAt, freeColor, MAX_MARKER, participants, REFS, resetForRound, REST_MS, running, sharedTargets, shoot, standings,
  type ClientMsg, type Config, type Ev, type Room as RoomState, type ServerMsg,
} from '../src/rules.ts'

type Env = { ROOMS: DurableObjectNamespace<Room> }
type Secret = { dirKey: string; keys: Record<string, string> } // le chiavi dei telefoni non vengono mai rimandate
type Conn = { id: string }

const LETTERS = 'ABCDEFGHJKMNPRSTUVWXYZ' // niente I, L, O, Q: si confondono
const CLEANUP_MS = 30 * 60_000

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)
    if (url.pathname === '/api/room' && req.method === 'POST') {
      const { key } = (await req.json()) as { key: string }
      for (let i = 0; i < 20; i++) {
        const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('')
        const r = await env.ROOMS.getByName(code).fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, key }) })
        if (r.ok) return Response.json({ code })
      }
      return new Response('nessun codice libero', { status: 503 })
    }
    const m = url.pathname.match(/^\/ws\/([A-Z]{4})$/)
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('serve un WebSocket', { status: 426 })
      return env.ROOMS.getByName(m[1]).fetch(req)
    }
    return new Response('Non trovato', { status: 404 })
  },
}

export class Room extends DurableObject<Env> {
  room: RoomState | undefined
  secret: Secret | undefined
  targets: { seed: number; list: Target[] } | null = null // ricalcolati dal seme, anche dopo l'ibernazione

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // dopo l'ibernazione lo stato in memoria è perso: si ricarica dall'archivio SQLite
    this.room = ctx.storage.kv.get('room')
    this.secret = ctx.storage.kv.get('secret')
  }

  async fetch(req: Request) {
    const url = new URL(req.url)
    if (url.pathname === '/init') {
      if (this.room) return new Response('occupata', { status: 409 })
      const { code, key } = (await req.json()) as { code: string; key: string }
      this.room = {
        code, phase: 'lobby', dirId: '', config: { ...DEFAULT_CONFIG }, players: [], startAt: 0, pausedAt: 0, pausedMs: 0, restUntil: 0, volume: 1, results: null, seed: 0, taken: {},
      }
      this.secret = { dirKey: key, keys: {} }
      this.save()
      await this.ctx.storage.setAlarm(Date.now() + CLEANUP_MS) // se nessuno entra, si cancella
      return new Response('ok')
    }
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    if (!this.room) {
      server.send(JSON.stringify({ t: 'error', msg: 'Partita non trovata. Controlla il codice.' } satisfies ServerMsg))
      server.close(4004, 'non trovata')
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  save() {
    this.ctx.storage.kv.put('room', this.room)
    this.ctx.storage.kv.put('secret', this.secret)
  }

  send(ws: WebSocket, m: ServerMsg) {
    try {
      ws.send(JSON.stringify(m))
    } catch {}
  }

  broadcast(ev?: Ev) {
    for (const ws of this.ctx.getWebSockets()) {
      const c = ws.deserializeAttachment() as Conn | null
      if (c) this.send(ws, { t: 'state', room: this.room!, you: c.id, ev })
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const r = this.room
    if (!r || typeof raw !== 'string') return
    let m: ClientMsg
    try {
      m = JSON.parse(raw)
    } catch {
      return
    }
    const now = Date.now()
    if (m.t === 'ping') return this.send(ws, { t: 'pong', c: m.c, s: now })
    if (m.t === 'hello') return this.hello(ws, m)

    const conn = ws.deserializeAttachment() as Conn | null
    const me = conn && r.players.find((p) => p.id === conn.id)
    if (!me) return
    const isDir = me.id === r.dirId
    let ev: Ev | undefined

    switch (m.t) {
      case 'ready':
        me.ready = m.ready
        break
      case 'marker':
        me.marker = clampMarker(m.marker)
        break
      case 'color':
        if (r.phase !== 'lobby' || freeColor(r, me, m.color) !== m.color) return // già preso da un altro
        me.color = m.color
        break
      case 'score':
        // Sfida a bersagli: ogni telefono conta i suoi colpi sui suoi bersagli (gioco in famiglia, niente anti trucchi)
        if (r.config.game === 'laser' || !running(r, now + 2000)) return
        me.shots = num(m.shots)
        me.best = num(m.best)
        if (r.config.game === 'condivisi') {
          this.save() // nei condivisi i punti li decide il server: qui solo spari e serie
          return
        }
        me.score = num(m.score)
        me.hits = Math.min(num(m.good), me.shots)
        break
      case 'claim': {
        // Bersagli condivisi: il primo messaggio che arriva vince il bersaglio
        if (!this.targets || this.targets.seed !== r.seed) this.targets = { seed: r.seed, list: sharedTargets(r) }
        const at = Math.max(now - 1000, Math.min(now, Number(m.at) || now))
        if (claim(r, me, this.targets.list, Number(m.id), at) === null) return
        break
      }
      case 'shot': {
        const score = me.score
        const res = shoot(r, me, m.marker, now)
        if (!res) return
        if (!res.hit && me.score === score) {
          this.save()
          return // uno sparo a vuoto non cambia niente per gli altri: nessun messaggio
        }
        if (res.hit) ev = { k: 'hit', by: me.id, to: res.hit.id, out: res.out } // altrimenti foglio di prova: si manda solo il punteggio
        break
      }
      case 'config':
        if (!isDir || r.phase !== 'lobby') return
        r.config = sanitize({ ...r.config, ...m.config }, r.config)
        participants(r).forEach((p) => resetForRound(p, r.config))
        break
      case 'team':
        if (!isDir) return
        r.players.forEach((p) => p.id === m.id && (p.team = p.team ? 0 : 1))
        break
      case 'start':
        if (!isDir || r.phase !== 'lobby' || now < r.restUntil || participants(r).length === 0) return
        r.phase = 'gioco'
        // mezzo secondo perché il messaggio arrivi a tutti prima del 3; nei condivisi prima si punta il riferimento
        r.startAt = now + (r.config.game === 'condivisi' ? CALIBRATE_MS : COUNTDOWN_MS + 500)
        r.taken = {}
        r.pausedAt = 0
        r.pausedMs = 0
        r.results = null
        r.seed = (Math.random() * 2 ** 32) >>> 0
        participants(r).forEach((p) => resetForRound(p, r.config))
        break
      case 'pause':
        if (!isDir || r.phase !== 'gioco') return
        if (m.on && !r.pausedAt) r.pausedAt = now
        if (!m.on && r.pausedAt) {
          r.pausedMs += now - Math.max(r.pausedAt, r.startAt)
          r.pausedAt = 0
        }
        break
      case 'stop':
        if (!isDir || r.phase !== 'gioco') return
        this.end(now)
        ev = { k: 'fine' }
        break
      case 'volume':
        if (!isDir) return
        r.volume = Math.max(0, Math.min(1, Number(m.v) || 0))
        break
    }
    this.save()
    await this.schedule()
    this.broadcast(ev)
  }

  hello(ws: WebSocket, m: Extract<ClientMsg, { t: 'hello' }>) {
    const r = this.room!
    const s = this.secret!
    const name = String(m.name || 'Senza nome').slice(0, 12)
    // si riprende il proprio posto con la stessa chiave del telefono, o con lo stesso nome
    let p = r.players.find((p) => s.keys[p.id] === m.key) ?? r.players.find((p) => !p.online && p.name.toLowerCase() === name.toLowerCase())
    if (!p) {
      if (r.players.length >= 8) return this.send(ws, { t: 'error', msg: 'La partita è piena.' })
      const t0 = r.players.filter((p) => p.team === 0).length
      p = {
        id: crypto.randomUUID().slice(0, 8), name, color: freeColor(r, null, m.color), marker: clampMarker(m.marker), team: t0 > r.players.length - t0 ? 1 : 0,
        ready: { cam: false, sens: false, gyro: false, cal: false, gun: false }, online: true,
        life: 0, ammo: 0, hotUntil: 0, lastShot: 0, outUntil: 0, safeUntil: 0, score: 0, hits: 0, elims: 0, outs: 0, shots: 0, best: 0,
      }
      resetForRound(p, r.config)
      r.players.push(p)
    }
    s.keys[p.id] = m.key
    if (m.key === s.dirKey) r.dirId = p.id // il regista che rientra riprende il controllo
    p.online = true
    if (r.phase === 'lobby') {
      p.name = name
      p.color = freeColor(r, p, m.color)
    }
    // un solo socket per giocatore: chiude quello vecchio se c'è
    for (const o of this.ctx.getWebSockets()) {
      if (o !== ws && (o.deserializeAttachment() as Conn | null)?.id === p.id) {
        o.serializeAttachment(null)
        o.close(4000, 'sostituita')
      }
    }
    ws.serializeAttachment({ id: p.id } satisfies Conn)
    this.save()
    this.broadcast()
    this.schedule()
  }

  async webSocketClose(ws: WebSocket) {
    this.left(ws)
  }

  async webSocketError(ws: WebSocket) {
    this.left(ws)
  }

  left(ws: WebSocket) {
    const c = ws.deserializeAttachment() as Conn | null
    ws.serializeAttachment(null)
    const r = this.room
    if (!r || !c) return
    const p = r.players.find((p) => p.id === c.id)
    if (p) p.online = false
    this.save()
    this.broadcast()
    this.schedule()
  }

  end(now: number) {
    const r = this.room!
    r.results = standings(r)
    r.phase = 'lobby'
    r.pausedAt = 0
    r.restUntil = now + REST_MS // pausa obbligatoria: i telefoni si riposano
    participants(r).forEach((p) => resetForRound(p, r.config))
  }

  // Un solo alarm: fine del round, oppure pulizia della stanza vuota da 30 minuti.
  async schedule() {
    const r = this.room
    if (!r) return
    const online = r.players.some((p) => p.online)
    const t = r.phase === 'gioco' && !r.pausedAt ? endAt(r) : online ? 0 : Date.now() + CLEANUP_MS
    if (t) await this.ctx.storage.setAlarm(t)
    else await this.ctx.storage.deleteAlarm()
  }

  async alarm() {
    const r = this.room
    if (!r) return this.ctx.storage.deleteAll()
    const now = Date.now()
    if (r.phase === 'gioco' && !r.pausedAt && now >= endAt(r) - 50) {
      this.end(now)
      this.save()
      this.broadcast({ k: 'fine' })
      return this.schedule()
    }
    if (!r.players.some((p) => p.online)) {
      // nessun dato oltre la sessione: si cancella tutto
      this.room = undefined
      this.secret = undefined
      await this.ctx.storage.deleteAll()
      return
    }
    await this.schedule()
  }
}

const num = (n: unknown) => Math.max(0, Math.min(10_000, Math.round(Number(n)) || 0))
const clampMarker = (n: number) => Math.max(1, Math.min(MAX_MARKER, Math.round(Number(n)) || 1))

function sanitize(c: Config, prev: Config): Config {
  const game = c.game === 'sfida' || c.game === 'condivisi' ? c.game : 'laser'
  const ds = DURATIONS[game]
  return {
    game,
    mode: c.mode === 'squadre' ? 'squadre' : 'ffa',
    duration: ds.includes(c.duration) ? c.duration : game === prev.game && ds.includes(prev.duration) ? prev.duration : ds[1],
    life: [3, 5, 7].includes(c.life) ? c.life : 5,
    ammo: [0, 10].includes(c.ammo) ? c.ammo : 10,
    plays: !!c.plays,
    theme: (['palloncini', 'stelle', 'mostri', 'lattine', 'zombi'] as const).find((t) => t === c.theme) ?? 'palloncini',
    diff: (['facile', 'media', 'difficile'] as const).find((d) => d === c.diff) ?? 'facile',
    ref: REFS.includes(c.ref) ? c.ref : REFS[0],
  }
}

