# Laser tag di cartone

Giochi di tiro in realtà aumentata da giocare in casa con il telefono montato su un fucile di cartone.

## Giochi

1. **Tiro al bersaglio**: da sole, bersagli virtuali intorno nella stanza. Funziona offline.
2. **Sfida a bersagli**: multiplayer, stessa sequenza di bersagli per tutte, classifica live.
3. **Bersagli condivisi**: multiplayer, gli stessi bersagli per tutte, chi colpisce per prima vince il punto.
4. **Laser tag**: ci si colpisce a vicenda mirando ai marker stampati sul petto e sulla schiena.

Un telefono fa da **regista**: crea la partita, sceglie il gioco e fa partire tutti insieme.

## Contenuto del repo

| Percorso | Cosa contiene |
|---|---|
| `docs/PROMPT.md` | Specifica completa da dare a Claude Code |
| `docs/laser-tag-fucile-template.pdf` | Template del fucile da stampare su A4 al 100% |
| `docs/fucile-3d.html` | Modello 3D interattivo del fucile, si apre nel browser |
| `docs/MATERIALI.md` | Lista dei materiali per costruire i fucili |
| `CLAUDE.md` | Istruzioni per Claude Code |

## Stack

- Frontend: Vite + TypeScript, Three.js, js-aruco2 in un Web Worker, PWA.
- Server: Cloudflare Workers + Durable Objects (piano gratuito), WebSocket con ibernazione.
- Nessun database, nessun account.

## Come partire

1. Apri questa cartella con Claude Code.
2. Chiedi: "Leggi docs/PROMPT.md e inizia la milestone 1".
3. A fine milestone prova sul telefono quello che Claude Code ti indica.

Per la milestone 2 serve un account Cloudflare gratuito.

## Milestone

1. Tiro al bersaglio (nessun server)
2. Regista e Sfida a bersagli
3. Bersagli condivisi
4. Laser tag
5. Rifinitura, Bersagli sui muri, test su tutti i telefoni
