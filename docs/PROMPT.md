# Prompt per Claude Code: Laser tag AR con fucile di cartone

## Obiettivo

Costruisci una web app di giochi di tiro in realtà aumentata per telefono. Ogni giocatore monta il proprio telefono su un fucile di cartone: la fotocamera posteriore inquadra la stanza, al centro c'è un mirino, e il grilletto è una leva di cartone con una striscia conduttiva che tocca lo schermo.

L'app ha un menu con più giochi:

1. **Tiro al bersaglio** (da soli): bersagli virtuali sparsi a 360° intorno al giocatore, sopra il video della fotocamera. Funziona senza rete.
2. **Sfida a bersagli** (multiplayer): ognuno spara ai propri bersagli virtuali, ma tutti ricevono la stessa sequenza nello stesso istante. Classifica live.
3. **Bersagli condivisi** (multiplayer): gli stessi bersagli virtuali per tutti, nella stessa direzione della stanza. Chi lo colpisce per primo lo prende e sparisce per tutti.
4. **Laser tag** (multiplayer): ogni giocatore porta sul petto (e sulla schiena) un foglio con un marker fiduciale. Se al momento dello sparo il marker di un avversario è sotto il mirino, è un colpo a segno. Tutti contro tutti o squadre.

Contesto d'uso: 2-4 giocatori, in casa, distanze da 1 a 5 metri, luce artificiale. Gioco in famiglia, non serve anti cheat. Prima della festa il gioco verrà provato soprattutto da soli, quindi il Tiro al bersaglio deve essere pronto e divertente per primo.

Telefoni: iPhone 17 Pro, iPhone 14 Pro e Xiaomi Redmi A5 montati sui fucili. Il Samsung Galaxy A02s fa da telefono regista (plancia, non montato su un fucile). Deve funzionare su Safari iOS e su Chrome Android.

### Xiaomi Redmi A5: fucile senza giroscopio, con bussola

Il Redmi A5 ha accelerometro e bussola ma niente giroscopio. Processore UNISOC T7250, 3 o 4 GB di RAM, Android 15 Go. Misure 172 x 78 x 8 mm.

- **Orientamento**: Chrome su Android può calcolare `deviceorientationabsolute` da accelerometro e bussola anche senza giroscopio. Funziona, ma è più lento a rispondere e tremolante, e la bussola in casa viene disturbata da metallo e casse.
- **Modalità "bussola"**: se il telefono manda orientamento assoluto ma non ha giroscopio (nessun `rotationRate` negli eventi `devicemotion`), usa un filtro di smussamento forte (per esempio filtro passa basso o One Euro) e bersagli più grandi. Nella schermata "Prepara il fucile" fai un test: il giocatore punta un oggetto, si gira di 360 gradi e torna sull'oggetto; se lo scarto supera 15 gradi, consiglia la modalità Bersagli sui muri.
- **Laser tag**: funziona normalmente.
- **Prestazioni**: stesso profilo leggero del Galaxy A02s.

### Samsung Galaxy A02s: telefono regista senza giroscopio

Il Galaxy A02s ha solo accelerometro (niente giroscopio, niente bussola), Snapdragon 450 e 3 GB di RAM. Conseguenze da gestire:

- **Rilevamento**: all'avvio verifica i sensori. Se in 1 secondo non arrivano eventi `deviceorientation` con `alpha` valido, il telefono è "senza giroscopio". Mostralo nella schermata "Prepara il fucile" e nello stato della lobby.
- **Cosa funziona comunque**: laser tag (usa solo la fotocamera) e ricarica alzando il fucile (l'inclinazione si ricava dalla gravità dell'accelerometro).
- **Cosa non funziona**: i bersagli virtuali sparsi intorno, perché senza giroscopio il telefono non sa quando ti giri. Per questo serve la modalità **Bersagli sui muri** (vedi Giochi a bersagli): su questo telefono i giochi a bersagli la usano in automatico.
- **Prestazioni**: su questo telefono riduci la risoluzione della fotocamera a 960x540, analizza i marker a 10-12 fps invece di 15, disattiva bagliori e particelle pesanti. Il resto del gioco deve restare fluido a 30 fps.
- **Misure**: 164 x 76 x 9 mm. Con la cover sta al limite del fucile (80 mm di altezza massima): meglio una cover sottile.

Lavora per milestone (vedi in fondo) e fermati alla fine di ognuna per farmi testare sul telefono.

## Vincoli di piattaforma (iPhone Safari)

- Solo browser, nessuna app nativa. Deve girare su Safari iOS 16.4 o superiore, anche installata come PWA dalla schermata Home.
- HTTPS obbligatorio per fotocamera e sensori. In sviluppo usa un tunnel HTTPS o il certificato locale di Vite, e documenta come aprire l'app dal telefono.
- Fotocamera: `getUserMedia` con `facingMode: "environment"`, risoluzione richiesta 1280x720, elemento video con `playsinline` e `muted`.
- Sensori: `DeviceOrientationEvent.requestPermission()` va chiamato da un gesto utente. Prevedi un pulsante "Attiva sensori" nella schermata iniziale.
- Audio: Web Audio API, sbloccato al primo tap.
- Schermo sempre acceso: Screen Wake Lock API, con fallback silenzioso se non disponibile.
- Su iPhone la Fullscreen API non funziona sugli elementi: la modalità a schermo intero si ottiene installando la PWA (manifest con `display: standalone`, orientamento landscape). Mostra un invito a "Aggiungi a Home" se l'app non è in standalone.
- `navigator.vibrate` non esiste su iOS: il feedback è solo visivo e sonoro.
- Android (Chrome): i sensori non chiedono il permesso, la Fullscreen API funziona e `vibrate` esiste. Usali dove ci sono, ma il gioco deve essere identico senza.
- Orientamento: usa `deviceorientation` (su Android preferisci `deviceorientationabsolute` se disponibile) e converti in un quaternione della camera, con il telefono in orizzontale. Gestisci le due orientazioni landscape (fotocamera a destra o a sinistra) perché nel fucile il telefono può essere montato in entrambi i versi.

## Stack

- Frontend: Vite + TypeScript, senza framework pesanti (vanilla o Preact se serve per la UI di lobby).
- Riconoscimento marker: `js-aruco2` in un Web Worker. Prima di scegliere, verifica quali dizionari supporta la versione attuale: preferisci un dizionario con pochi bit e celle grandi (AprilTag 16h5 o 25h9, oppure ArUco 4x4) perché a distanza rende molto meglio di quelli da 36 bit. Ne servono almeno 8 ID.
- Multiplayer: Cloudflare Workers con un Durable Object per stanza, comunicazione via WebSocket. Frontend servito come static assets dallo stesso Worker. Tutto deve stare nel piano gratuito.
- Niente database persistente: lo stato vive nel Durable Object per la durata della partita.
- **Piano gratuito Cloudflare**: i Durable Objects devono essere del tipo con archivio SQLite. Nel file di configurazione di `wrangler` dichiara la classe nelle migrations con `new_sqlite_classes` (non `new_classes`), altrimenti il deploy sul piano gratuito viene rifiutato. Prima di scrivere la configurazione, verifica nella documentazione attuale di Cloudflare la sintassi e i limiti del piano gratuito.
- **WebSocket con ibernazione**: usa l'API WebSocket Hibernation dei Durable Objects (`this.ctx.acceptWebSocket()`, `webSocketMessage()`, `webSocketClose()`), non `ws.accept()` con listener. Così, quando nessuno manda messaggi (lobby ferma, tra una partita e l'altra), la stanza va in ibernazione e non consuma tempo di calcolo. Conseguenze da gestire:
  - lo stato in memoria si perde quando l'oggetto iberna: salva ciò che serve per riprendere (giocatori, regista, gioco scelto, punteggi) nello storage SQLite del Durable Object e ricaricalo al risveglio;
  - i dati di ogni connessione (ID giocatore, nome) vanno in `serializeAttachment()` sul WebSocket, così sopravvivono all'ibernazione;
  - per i timer di partita (fine round, scadenza bersagli) usa gli `alarm` del Durable Object, non `setTimeout`, che si perde con l'ibernazione;
  - per i ping di sincronizzazione degli orologi valuta `setWebSocketAutoResponse()`, che risponde senza svegliare l'oggetto.
- **Pulizia**: a fine sessione (stanza vuota da 30 minuti) cancella lo storage della stanza con un alarm. Coerente con la regola privacy: nessun dato oltre la sessione.
- **Deploy**: Worker con static assets per il frontend e Durable Object nello stesso progetto, sottodominio gratuito `workers.dev` con HTTPS. Nel README metti i comandi per sviluppo locale (`wrangler dev`), tunnel HTTPS per provare dal telefono (`cloudflared tunnel --url`) e deploy (`wrangler deploy`).

## Riconoscimento dei marker

- Il mirino coincide con il centro dell'immagine della fotocamera.
- Non analizzare il frame intero ridimensionato: ritaglia la zona centrale (circa 640x480 dal frame 1280x720) a risoluzione nativa. Così un marker lontano ha il doppio dei pixel. Il colpo conta solo vicino al centro, quindi il resto del frame è inutile.
- Il worker analizza in continuo il ritaglio (obiettivo almeno 15 fps su iPhone recenti) e restituisce ID e poligono dei marker trovati.
- Mirino reattivo: quando un marker avversario è sotto il mirino, il mirino cambia stato (si chiude e si colora) prima ancora di sparare. È fondamentale per il feeling.
- Al momento dello sparo usa l'ultimo risultato se ha meno di 100 ms, altrimenti analizza subito il frame corrente.
- Colpo valido se il centro del mirino cade dentro il poligono del marker allargato del 20%. Rendi la tolleranza configurabile.
- Prevedi un offset di calibrazione del mirino (X/Y), regolabile da impostazioni e salvato in localStorage, per compensare la posizione della fotocamera sul fucile.

## Grilletto conduttivo

- Qualsiasi tocco sullo schermo, ovunque, conta come sparo (`pointerdown`), tranne sui pulsanti della HUD.
- Debounce di 150 ms per ignorare i rimbalzi della striscia di alluminio.
- Ignora i tocchi multipli simultanei come spari extra.
- Disabilita zoom, selezione testo, menu contestuale e gesti di sistema dove possibile (`touch-action: none`, `user-select: none`).
- Layout fisico del fucile (già progettato, vedi template PDF): il telefono è in orizzontale con lo schermo verso il giocatore. Il tampone del grilletto tocca lo schermo al **centro del bordo inferiore**, in una zona di circa 25 x 20 mm sopra il bordo. Il telefono sta in una scatola di cartone universale con spugna, quindi la sua posizione esatta varia di qualche mm da un telefono all'altro. Due labbri bassi coprono 6-10 mm del bordo inferiore ai lati (al centro restano liberi circa 40 mm per il tampone), e il labbro alto del coperchio copre circa 6 mm di tutto il bordo superiore.
- Quindi la HUD lascia libere tre zone: centro in basso (tocco grilletto, mai pulsanti lì), striscia bassa ai lati (10 mm) e tutta la striscia in alto (8 mm), coperte dal cartone. Metti vita e munizioni negli angoli in alto ma sotto quella striscia, punteggio e tempo ai lati a metà altezza. Tieni un margine interno di sicurezza di 12 mm su tutti i lati per qualsiasi elemento importante.
- La fotocamera non è sull'asse della canna: l'offset di calibrazione del mirino è necessario, prevedi una procedura guidata (punta un marker a 3 metri, sposta il mirino finché coincide, salva).

## Menu principale

Schermata iniziale con pulsanti grandi e chiari (adatti a bambine di 9-10 anni), tema chiaro:

- **Gioca da sola/o**: porta al Tiro al bersaglio.
- **Crea partita**: questo telefono diventa il **regista** (vedi sotto).
- **Entra in partita**: codice di 4 lettere o scansione del QR del regista.
- **Prepara il fucile**: calibrazione del mirino, Prova mirino, prova del grilletto (un tocco fa lampeggiare il punto toccato, per controllare che il tampone arrivi nel posto giusto).
- **Stampa i marker**: generatore del PDF dei marker.
- Nome del giocatore e colore preferito si scelgono una volta e restano salvati sul telefono (localStorage).

## Telefono regista

Un telefono crea la stanza e comanda la partita per tutti. Gli altri entrano e aspettano: non scelgono niente, partono quando parte il regista.

- **Regista che gioca o solo regista**: il regista può giocare anche lui, oppure fare solo da arbitro (tipico: il telefono del genitore, che non è montato su un fucile). Nel secondo caso il suo schermo è una plancia: elenco giocatori, punteggi live, comandi.
- **Scelta del gioco**: il regista sceglie tra Sfida a bersagli, Bersagli condivisi e Laser tag (tutti contro tutti o squadre), più durata, difficoltà ed eventuali squadre. Gli altri vedono sul loro schermo il gioco scelto e le regole in 4 icone.
- **Lobby**: mostra chi è entrato, con nome, colore, numero di marker e uno stato "pronto" (fucile montato, sensori attivi, fotocamera attiva, calibrazione fatta). Il pulsante "Via" si attiva quando tutti sono pronti, con un'opzione "parti lo stesso".
- **Partenza sincronizzata**: al "Via" del regista tutti i telefoni mostrano insieme un conto alla rovescia 3, 2, 1 e partono nello stesso istante. Sincronizza gli orologi con il server (scambio di ping all'ingresso e stima dell'offset), poi il server manda l'ora di inizio e ogni client parte a quell'ora. Scarto tollerato: meno di 100 ms tra i telefoni.
- **Comandi durante la partita**: pausa e ripresa per tutti, fine anticipata, volume generale.
- **Fine partita**: classifica su tutti i telefoni, poi tutti tornano nella lobby della stessa stanza. Il regista può scegliere un altro gioco e ripartire senza che nessuno debba rientrare.
- **QR**: il regista mostra un QR code con il link alla stanza per far entrare gli altri.
- **Riconnessione**: se un giocatore si disconnette, al rientro con lo stesso nome riprende il suo posto e il suo punteggio. Se cade il regista, la partita in corso continua fino alla fine e il regista, rientrando, riprende il controllo.
- Ogni giocatore ha un numero di marker (ID), legato al giocatore e non alla squadra, così si possono rifare le squadre senza ristampare.

## Giochi a bersagli

Valgono per Tiro al bersaglio, Sfida a bersagli e Bersagli condivisi. Non usano i marker: i bersagli sono oggetti 3D virtuali disegnati sopra il video.

### Base comune

- **Rendering**: Three.js (o un canvas 2D con proiezione fatta a mano, se basta) sopra il video della fotocamera. La camera virtuale segue l'orientamento del telefono letto dal giroscopio. Il campo visivo della camera virtuale deve corrispondere a quello reale della fotocamera, altrimenti i bersagli "scivolano" quando ti giri: prevedi un valore di FOV per modello, con una regolazione fine nella calibrazione.
- **Posizione dei bersagli**: su una sfera intorno al giocatore, a distanza virtuale di 3-5 metri, tra -15 e +35 gradi di altezza (niente bersagli sul pavimento o sopra la testa).
- **Direzione zero**: all'inizio di ogni partita il giocatore punta il fucile davanti a sé e preme il grilletto (o, nel multiplayer, lo fa al conto alla rovescia). Quella diventa la direzione 0. I bersagli compaiono prima nei 90 gradi davanti, poi sempre più di lato e dietro.
- **Colpo**: a segno se il centro del mirino cade dentro il cerchio del bersaglio proiettato sullo schermo, con una tolleranza configurabile. Stesso effetto sparo del laser tag (raggio, scintille, stelline).
- **Indicatori fuori schermo**: una freccia sul bordo indica dove si trova il bersaglio più vicino che non si vede.
- **Deriva del giroscopio**: su iPhone l'orientamento orizzontale deriva nel tempo. Prevedi un pulsante "ricentra" e, per i round lunghi, una ricentratura automatica dolce tra un'ondata e l'altra.
- **Temi** (scelta dal menu): palloncini, stelle, mostriciattoli buffi, lattine. Tutti disegnati in modo semplice e allegro, generati via codice o con asset liberi. Ogni tema ha il suo suono di "pop".
- **Tipi di bersaglio**: normale (1 punto), veloce che si sposta lentamente (2 punti), dorato raro (5 punti, dura poco), e "amico da non colpire" (per esempio un gattino: colpirlo toglie 2 punti). Ogni bersaglio ha una durata: se non lo colpisci in tempo vola via.
- **Difficoltà**: Facile, Media, Difficile. Cambiano dimensione dei bersagli, durata, velocità e quanto sono sparsi intorno.
- **Munizioni e ricarica**: le stesse regole del laser tag (ricarica alzando il fucile), disattivabili in Facile.

### Modalità Bersagli sui muri (ancoraggio con marker)

Alternativa al giroscopio, obbligatoria per i telefoni senza giroscopio e selezionabile da tutti:

- Si stampano 6-8 **marker da muro** (ID diversi da quelli dei giocatori, generati dalla pagina "Stampa i marker" con un'etichetta tipo "Muro 1"), e si attaccano con lo scotch di carta in giro per la stanza, ad altezza occhi.
- I bersagli compaiono agganciati ai marker: quando la fotocamera vede un marker da muro, il bersaglio è disegnato sopra o accanto a lui, scalato con la distanza. Quando il marker esce dall'inquadratura, compare la freccia verso il prossimo bersaglio attivo, in base all'ultimo marker visto.
- I bersagli "saltano" da un marker all'altro secondo la sequenza del gioco: il giocatore deve girarsi e cercare quello attivo.
- Nei **Bersagli condivisi** questa modalità è più precisa di quella a giroscopio perché tutti vedono lo stesso marker fisico: niente calibrazione comune e niente deriva. Rendila la scelta predefinita per i Bersagli condivisi quando almeno un telefono è senza giroscopio, e consigliala comunque al regista.

### 1. Tiro al bersaglio (da soli)

- Funziona completamente offline, senza server.
- Partita a tempo: 60, 90 o 120 secondi. Punteggio, precisione, serie migliore di colpi consecutivi.
- **Record**: classifica locale sul telefono per nome giocatore, con i 10 migliori risultati per gioco e difficoltà. Così le bambine possono allenarsi e battere il proprio record prima della festa.
- Modalità **Allenamento** senza tempo, con bersagli fermi, per prendere confidenza con il fucile.

### 2. Sfida a bersagli (multiplayer)

- Il regista sceglie tema, difficoltà e durata. Il server genera un seme casuale e l'ora di inizio, e li manda a tutti.
- Ogni telefono genera la stessa sequenza di bersagli dal seme (generatore pseudocasuale deterministico, per esempio mulberry32): stesse posizioni, stessi tempi, stessi tipi.
- I bersagli sono "personali": ognuno spara ai propri, nessuno ruba niente agli altri. Le posizioni sono relative alla direzione zero di ciascuno.
- Ogni colpo viene inviato al server, che aggiorna la classifica live mostrata in un angolo dello schermo e sulla plancia del regista.
- A fine partita: classifica con punti, precisione e serie migliore.

### 3. Bersagli condivisi (multiplayer)

- Prima del via, **calibrazione comune**: il regista sceglie un punto di riferimento nella stanza (per esempio la TV) e tutti, in piedi vicini, lo puntano e premono il grilletto. Quella diventa la direzione zero comune.
- Il server genera i bersagli e li manda a tutti con ID, posizione, tipo e durata. Tutti li vedono nella stessa direzione della stanza.
- Quando un giocatore colpisce un bersaglio, il client manda "colpito bersaglio X" con l'ora. Il server assegna il bersaglio al primo arrivato e notifica tutti: il bersaglio esplode nel colore di chi l'ha preso e sparisce anche dagli altri schermi.
- I giocatori sono in punti diversi della stanza, quindi le direzioni non coincidono perfettamente. Va bene così: con bersagli virtuali "lontani" lo scarto è piccolo. Usa bersagli più grandi che nella modalità da soli.
- Pulsante "ricalibra" tra un round e l'altro per correggere la deriva del giroscopio.

## Regole del laser tag

Valori di default, tutti configurabili dal regista:

- Durata round: 5 minuti.
- Vita: 5 punti. Ogni colpo ne toglie uno.
- Munizioni: 10 colpi. Ricarica alzando il fucile verso l'alto (beccheggio oltre 60 gradi per mezzo secondo, letto dal giroscopio). Durante la ricarica non si spara.
- Cadenza: massimo un colpo ogni 300 ms.
- Eliminazione: a vita zero il giocatore è fuori per 8 secondi, poi rientra con vita piena e 3 secondi di invulnerabilità. In questi stati non può sparare né essere colpito.
- Tutti contro tutti: un punto per colpo, tre per eliminazione.
- Squadre: due squadre, fuoco amico disattivato, punteggio di squadra.
- Il client che spara manda "ho colpito il marker X". Il server applica le regole (bersaglio vivo, non invulnerabile, non compagno di squadra, munizioni e cadenza rispettate) e notifica tutti.

## Feedback e HUD

- HUD sopra il video: vita, munizioni, punteggio, tempo rimanente, stato (ricarica, eliminato, invulnerabile).
- Chi colpisce: suono di impatto e hitmarker sul mirino.
- Chi viene colpito: flash ai bordi dello schermo nel colore di chi ha sparato, suono, e nome di chi ha sparato.
- Colpo a vuoto: suono di sparo normale.

### Effetto sparo (a ogni tocco del grilletto, colpito o no)

- **Dove arriva il colpo**: sempre esattamente al centro del mirino (con l'offset di calibrazione). È un laser: istantaneo, dritto, niente balistica né caduta. Il mirino è la promessa al giocatore, quindi effetto visivo e verifica del colpo usano lo stesso identico punto.
- **Raggio**: un fascio di luce animato che parte dal bordo inferiore dello schermo (dove "esce" la canna, leggermente spostato verso il lato opposto alla fotocamera) e converge sul mirino. Durata circa 120 ms, poi svanisce in 150 ms. Colore della squadra, o colore scelto dal giocatore nel tutti contro tutti. Disegnalo su un canvas sopra il video, con un leggero bagliore (gradiente, `globalCompositeOperation: "lighter"`).
- **Impatto a vuoto**: al punto del mirino un piccolo lampo e qualche scintilla che si allargano e spariscono in 250 ms.
- **Impatto a segno**: il marker colpito si illumina per un istante (contorno colorato sul poligono rilevato), scoppio di stelline o coriandoli, hitmarker sul mirino e un "+1" che sale e svanisce. Niente sangue né effetti di danno.
- **Suono**: uno "pew" sintetizzato, diverso per squadra (tono più alto o più basso), sempre al tocco. Al colpo a segno, un secondo suono di conferma (campanellino breve) sul telefono di chi spara.
- **Telefono di chi viene colpito**: suona un suono ben riconoscibile a volume più alto, così nella stanza tutti sentono che è stato preso. Flash ai bordi nel colore di chi ha sparato, e il nome di chi ha sparato.
- **Prestazioni**: l'effetto parte nello stesso frame del tocco, senza aspettare né il riconoscimento del marker né il server. L'esito (scintilla a vuoto o stelline a segno) si aggiunge appena arriva, entro circa 100 ms. Suoni precaricati come AudioBuffer, nessuna latenza percepibile.
- **Munizioni finite**: al tocco niente raggio, solo un "clic" a vuoto e la scritta "Ricarica! Alza il fucile".
- Fine round: classifica con colpi, eliminazioni e precisione.
- Suoni generati con Web Audio (sintetizzati), nessun file audio protetto da copyright.
- Testi della UI in italiano.

## Vincoli di design

- Nessun trattino lungo (em dash) in nessun testo dell'interfaccia o della documentazione. Usa virgole, due punti, punti o parentesi.
- Il tema scuro non deve essere il default nelle schermate di lobby e impostazioni. Durante il gioco la HUD sta sopra il video, quindi usa elementi leggibili su qualsiasi sfondo (testo con contorno o pannelli semitrasparenti chiari).
- Niente estetica "AI generica" con nero e verde acido.

## Stampabili

- Una pagina che genera un PDF stampabile per ogni giocatore: foglio A4 con marker grande circa 18 cm, bordo bianco attorno (almeno una cella di margine), nome del giocatore e numero sotto.
- Indica di stampare ogni marker in due copie (petto e schiena) e di non plastificarlo con finitura lucida, per evitare riflessi.

## Strumenti di diagnostica

- Pagina "Prova mirino" in single player: mostra in tempo reale i marker riconosciuti, ID, distanza stimata dalla dimensione in pixel, fps del worker. Serve per tarare la distanza massima in casa.
- Overlay di debug attivabile dalle impostazioni anche durante la partita.

## Guida per il fucile

Il fucile è già progettato in un PDF a parte (`laser-tag-fucile-template.pdf`, da mettere in `docs/`). Non riprogettarlo. Crea solo un breve `FUCILE.md` che rimanda al PDF e riassume i punti che toccano il software:

- Telefono in orizzontale, schermo verso il giocatore, fotocamera su un'estremità lasciata libera.
- Il grilletto è una leva con alluminio e spugna che tocca il centro del bordo inferiore dello schermo.
- Prima partita: fare la calibrazione del mirino per ogni telefono.

## Sicurezza

- Schermata iniziale con una riga di regole: si gioca camminando, non correndo, stanza libera da ostacoli.
- Avviso se la batteria scende sotto il 15% (se l'API è disponibile, altrimenti ignora).

## Giocatori bambini (9-10 anni)

Le giocatrici sono bambine di 9 e 10 anni, il regista di solito è un genitore. Questo ha la precedenza sui default sopra:

- **Privacy**: le immagini della fotocamera non lasciano mai il telefono. Nessuna registrazione, nessuno screenshot, nessun frame inviato al server. Al server arrivano solo eventi di gioco (ID marker colpito, stato). Nessun account, nessun dato salvato oltre la durata della partita: solo il nome scelto, che sparisce a fine sessione.
- **Pausa generale**: il regista può mettere in pausa tutti i telefoni con un pulsante sempre visibile. In pausa il video resta, ma la HUD mostra "Pausa" a tutto schermo e gli spari sono disattivati.
- **Round più brevi**: default 3 minuti, con pausa obbligatoria di almeno 1 minuto tra un round e l'altro (anche per non scaldare i telefoni).
- **Linguaggio e grafica non violenti**: niente sangue, teschi o parole come "morto" o "ucciso". Usa "colpito", "fuori gioco", "di nuovo in gioco". Il flash quando si viene colpiti usa il colore della squadra o un giallo brillante, non il rosso sangue.
- **Volume**: suoni brevi e non stridenti, volume generale regolabile dal regista.
- **Regole semplici**: una schermata di 4 icone che spiega come si spara, come si ricarica, quando si è fuori gioco, come si vince.
- **Promemoria movimento**: se il giroscopio rileva movimenti bruschi ripetuti (scossoni tipici della corsa), mostra per 2 secondi "Piano! Si cammina".

## Milestone

1. **Tiro al bersaglio**: menu principale, fotocamera, mirino, grilletto touch, effetto sparo e suoni, orientamento e bersagli 3D, calibrazione (mirino e FOV), temi, difficoltà, record locali, PWA installabile, wake lock. Nessun server. Deve essere già giocabile da soli.
2. **Regista e Sfida a bersagli**: Worker + Durable Object, crea ed entra in partita, QR, lobby con stato "pronto", sincronizzazione degli orologi e partenza sincronizzata, pausa generale, Sfida a bersagli con classifica live, plancia del regista, riconnessione.
3. **Bersagli condivisi**: calibrazione comune, bersagli generati dal server, assegnazione al primo che colpisce.
4. **Laser tag**: riconoscimento marker nel worker, Prova mirino, generatore PDF dei marker, regole, vita, munizioni, eliminazioni, tutti contro tutti e squadre, classifica.
5. **Rifinitura**: modalità Bersagli sui muri (richiede il riconoscimento marker della milestone 4), profilo prestazioni per telefoni lenti, test su tutti i telefoni, `FUCILE.md`, README con istruzioni di deploy su Cloudflare.

## Criteri di accettazione

- Nel Tiro al bersaglio, girandosi lentamente di 360 gradi i bersagli restano fermi nella stanza (scivolamento visibile inferiore a mezzo bersaglio).
- Al "Via" del regista, il conto alla rovescia parte su tutti i telefoni con meno di 100 ms di scarto.
- Nei Bersagli condivisi, un bersaglio colpito sparisce dagli altri telefoni entro 200 ms.
- Su iPhone, a 4 metri in una stanza illuminata normalmente, un marker da 18 cm viene riconosciuto in modo stabile.
- Il colpo viene registrato dal server entro 200 ms sulla stessa rete Wi-Fi.
- Il gioco regge un round di 5 minuti con 4 giocatori senza disconnessioni né cali di frame evidenti.
- Tutte le regole sono rispettate lato server: nessun colpo su compagni, eliminati o invulnerabili.

Alla fine di ogni milestone: elenca cosa hai fatto, cosa devo testare sul telefono e i problemi aperti.
