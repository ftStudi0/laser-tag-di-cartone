import type { ClientMsg, Ev, Room, ServerMsg } from './rules.ts'

// Chiave casuale del telefono: serve solo a riprendere il proprio posto se cade la connessione.
export function deviceKey() {
  let k = ''
  try {
    k = localStorage.getItem('lt:key') || ''
    if (!k) localStorage.setItem('lt:key', (k = crypto.randomUUID()))
  } catch {}
  return k || 'k' + Math.random()
}

export async function createRoom(): Promise<string> {
  const r = await fetch('/api/room', { method: 'POST', body: JSON.stringify({ key: deviceKey() }) })
  if (!r.ok) throw new Error('server')
  return (await r.json()).code
}

export type Net = ReturnType<typeof connect>

// Connessione alla stanza con riconnessione automatica e stima dell'orologio del server.
export function connect(code: string, hello: () => Omit<Extract<ClientMsg, { t: 'hello' }>, 't' | 'key'>) {
  const net = {
    room: null as Room | null,
    me: '',
    offset: 0, // ora del server = Date.now() + offset
    online: false,
    error: '',
    onState: (_r: Room, _ev?: Ev) => {},
    onStatus: () => {},
    serverNow: () => Date.now() + net.offset,
    send(m: ClientMsg) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m))
    },
    close() {
      closed = true
      ws?.close()
    },
  }
  let ws: WebSocket | null = null
  let closed = false
  let retry = 500
  let best = Infinity

  // tanti ping all'ingresso: vale quello con il viaggio più breve, che è il più preciso
  function sync() {
    for (let i = 0; i < 8; i++) setTimeout(() => net.send({ t: 'ping', c: Date.now() }), i * 120)
  }

  function open() {
    const sock = (ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${code}`))
    ws.onopen = () => {
      retry = 500
      net.online = true
      net.send({ t: 'hello', key: deviceKey(), ...hello() })
      sync()
      net.onStatus()
    }
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data) as ServerMsg
      if (m.t === 'pong') {
        const now = Date.now()
        const rtt = now - m.c
        if (rtt <= best) {
          best = rtt
          net.offset = m.s - (m.c + rtt / 2)
        }
      } else if (m.t === 'error') {
        net.error = m.msg
        closed = true
        net.onStatus()
      } else {
        net.room = m.room
        net.me = m.you
        net.onState(m.room, m.ev)
      }
    }
    ws.onclose = () => {
      if (sock !== ws) return // un socket vecchio, già sostituito
      net.online = false
      net.onStatus()
      if (closed) return
      setTimeout(open, retry)
      retry = Math.min(retry * 2, 4000)
      best = Infinity // dopo una riconnessione si rifà la stima
    }
  }
  open()
  // tornando in primo piano (iPhone chiude i socket in background) si riconnette subito
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !closed && ws?.readyState !== WebSocket.OPEN && ws?.readyState !== WebSocket.CONNECTING) open()
  })
  return net
}
