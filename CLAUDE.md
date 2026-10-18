# Laser tag di cartone

Web app di giochi di tiro in realtà aumentata per telefono, con fucili di cartone. Le giocatrici sono bambine di 9 e 10 anni.

## Da leggere prima di tutto

La specifica completa è in `docs/PROMPT.md`. È la fonte di verità: stack, giochi, regole, vincoli di piattaforma, milestone e criteri di accettazione. Se qualcosa qui sembra in conflitto con la specifica, vince la specifica e va segnalato.

## Come lavorare

- Lavora una milestone alla volta, nell'ordine di `docs/PROMPT.md`. A fine milestone fermati e scrivi: cosa hai fatto, cosa devo provare sul telefono, problemi aperti.
- Il fucile è già progettato (`docs/laser-tag-fucile-template.pdf`, modello 3D in `docs/fucile-3d.html`). Non riprogettarlo. La HUD deve rispettare le zone coperte dal cartone descritte nella specifica.
- Telefoni di prova: iPhone 17 Pro, iPhone 14 Pro, Redmi A5 (senza giroscopio, con bussola), Galaxy A02s come regista (senza giroscopio né bussola).

## Regole fisse

- Mai il trattino lungo (em dash) in nessun testo: UI, documentazione, commenti, messaggi di commit. Usa virgole, due punti, punti o parentesi.
- Tema chiaro di default nelle schermate di menu, lobby e impostazioni. Il tema scuro al massimo come opzione. Niente estetica nero con verde acido.
- Testi della UI in italiano, linguaggio non violento ("colpito", "fuori gioco", mai "morto" o "ucciso").
- Privacy: le immagini della fotocamera non lasciano mai il telefono. Nessun account, nessun dato oltre la sessione.
- Prima di usare un'API di Cloudflare o una libreria, verifica la documentazione attuale invece di andare a memoria.
