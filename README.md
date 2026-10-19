# Laser tag di cartone

Giochi di tiro in realtà aumentata da giocare in casa con il telefono montato su un fucile di cartone.

## Giochi

1. **Tiro al bersaglio**: da sole, bersagli virtuali intorno nella stanza. Funziona offline.
   - **Chiosco del luna park**: tre file di bersagli che scorrono davanti, 20 colpi e un premio alla fine.
   - **Duello nel Far West**: alla campana spunta il bandito Baffone, va colpito prima che spruzzi. Vince chi arriva a 3.
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

## Provare dal telefono

Serve Node 22 o superiore.

```sh
npm install
npm run dev        # server HTTPS con certificato locale, anche sulla rete Wi-Fi
npm run check      # controllo della logica (quaternioni, bersagli, record, regole del laser tag)
```

`npm run dev` fa girare in locale anche il server delle partite (Worker e Durable Object, tramite il plugin Cloudflare per Vite): non serve un altro comando come `wrangler dev`.

Fotocamera e sensori funzionano solo in HTTPS. Due modi per aprire l'app dal telefono:

1. **Tunnel HTTPS (consigliato, funziona sempre)**. Installa una volta `brew install cloudflared`, poi con `npm run dev` acceso:
   ```sh
   cloudflared tunnel --url https://localhost:5173 --no-tls-verify
   ```
   Apri sul telefono l'indirizzo `https://...trycloudflare.com` che compare. Non serve un account. Tutti i telefoni della partita aprono lo stesso indirizzo.
2. **Stessa rete Wi-Fi**: apri l'indirizzo `Network` stampato da `npm run dev` (per esempio `https://192.168.1.20:5173`) e accetta l'avviso sul certificato.

Per provare la PWA e il funzionamento senza rete usa la build: `npm run build && npm run preview`, poi lo stesso tunnel sulla porta 4173. Su iPhone: Condividi, Aggiungi alla schermata Home, e apri il gioco dall'icona (schermo intero e orizzontale).

## Pubblicare su Cloudflare (piano gratuito)

Una volta sola, accedi al tuo account Cloudflare:

```sh
npx wrangler login
```

Poi, ogni volta che vuoi aggiornare il gioco:

```sh
npm run deploy     # build e wrangler deploy
```

Il gioco va su `https://laser-tag-cartone.<tuo-sottodominio>.workers.dev`. Il Durable Object usa l'archivio SQLite (`new_sqlite_classes` in `wrangler.jsonc`), l'unico permesso nel piano gratuito. Attenzione: pubblicare una nuova versione scollega chi sta giocando in quel momento.

I tipi del Worker (`worker/worker-configuration.d.ts`) si rigenerano da soli a ogni build; a mano: `npm run types`.

## Partite in gruppo

- Il regista sceglie tra:
  - **Laser tag**;
  - **Sfida a bersagli**: stessi bersagli per tutti, ognuno spara ai suoi, classifica in diretta, anche a squadre;
  - **Bersagli condivisi**: all'inizio tutti puntano insieme un riferimento (la TV, la porta...), poi i bersagli sono nello stesso posto per tutti e chi colpisce prima lo prende.

  I due giochi a bersagli hanno bisogno del giroscopio.
- Per il laser tag stampa i marker da **Stampa i marker** (un foglio A4 per giocatore, due copie: petto e schiena). Stampa al 100%.
- Un telefono tocca **Crea partita** e diventa il regista: mostra il codice di 4 lettere e il QR. Può giocare anche lui o fare solo da arbitro (plancia con punteggi e comandi).
- Gli altri toccano **Entra in partita**, scrivono il codice (o inquadrano il QR), scelgono il numero del proprio marker e toccano **Ho il fucile pronto**.
- Al server arrivano solo eventi di gioco (numero del marker colpito, stato). Le immagini della fotocamera restano sul telefono. La stanza si cancella da sola 30 minuti dopo che è rimasta vuota.

## Come partire

1. Apri questa cartella con Claude Code.
2. Chiedi: "Leggi docs/PROMPT.md e inizia la milestone 1".
3. A fine milestone prova sul telefono quello che Claude Code ti indica.

Per pubblicare il gioco serve un account Cloudflare gratuito.

## Milestone

1. Tiro al bersaglio (nessun server)
2. Regista e Sfida a bersagli
3. Bersagli condivisi
4. Laser tag
5. Rifinitura, Bersagli sui muri, test su tutti i telefoni
