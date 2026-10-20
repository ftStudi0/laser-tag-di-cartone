# Cardboard Laser Tag

**English** · [Italiano](README.it.md)

Augmented reality shooting games to play at home. Your phone goes into a handmade cardboard blaster: the camera looks at the room, the crosshair sits in the middle of the screen, and the trigger is a cardboard lever that touches the screen.

It is a web app: nothing to install from an app store and no accounts. It speaks English and Italian, picks the phone's language on its own, and you can switch in Settings. It was made for two girls aged 9 and 10: an adult builds the blasters and acts as the host.

![Laser tag: tagging a friend wearing her marker](docs/img/demo.gif)

The [full video](docs/video/demo.mp4) (70 seconds) shows the menu, a laser tag game between two phones, flying ducks, the fairground stall and the Wild West duel. It was recorded on a computer with the app in Italian, using a drawn room and a cardboard friend instead of the camera.

![The game menu](docs/img/menu.png)

## What you can play

**On your own**, even offline:

- **Targets all around**: balloons, stars, little monsters, cans or silly zombies pop up around the room, in front, to the sides and behind you. Don't hit the kitten with the heart.
- **Fairground stall**: three rows of moving targets, 20 shots and a prize at the end.
- **Clay shooting**: clays fly in an arc from one side to the other; hit them before they fall.
- **Flying ducks**: like Duck Hunt, ducks pop out of the grass and zigzag through the air. If they get away, the dog laughs at you.
- **Wild West duel**: when the bell rings, the bandit Big Mustache appears. Hit him before the BANG flag pops out of his toy revolver. On Hard, Mrs. Rosie walks by too: don't hit her.
- **Arcade**, for every game: you only lose a shot when you miss, and you keep going while you have shots left.

**In a group**, with one phone as the host:

- **Laser tag**: tag each other by aiming at the markers printed on chest and back. Free for all or in teams, with hearts, "out of the game" and coming back in.
- **Target challenge**: the same sequence of targets for everyone, with a live leaderboard.
- **Shared targets**: the same targets in the same spot of the room for everyone; whoever hits first gets the point.

The host creates the game, shows a 4-letter code and a QR code, picks the game and starts everyone together. The host can play too, or just referee, for example from a parent's phone. Games last 3, 5 or 10 minutes.

![Choosing a game](docs/img/gioca-da-sola.png)

## Build the blaster

You can also download the blaster plans from the app, on the **Set up your blaster** screen.

| File | What's inside |
|---|---|
| [`docs/cardboard-blaster-template.pdf`](docs/cardboard-blaster-template.pdf) | The parts to print on A4 at 100% and trace onto cardboard, plus the assembly steps ([in Italian](docs/laser-tag-fucile-template.pdf)) |
| [`docs/fucile-3d.html`](docs/fucile-3d.html) | Interactive 3D model, opens in the browser |
| [`docs/MATERIALS.md`](docs/MATERIALS.md) | Materials for three blasters |
| [`docs/BLASTER.md`](docs/BLASTER.md) | What about the blaster matters to the game |

The blaster holds phones up to 175 x 82 x 13 mm with the case on. An adult uses the craft knife and the hot glue.

## Privacy and safety

- Camera images never leave the phone: markers are recognized on the phone itself, in a Web Worker.
- The server only receives game events, such as "marker 3 was hit". There are no accounts and nothing is kept after the game. A room deletes itself 30 minutes after it is left empty.
- High scores of the solo games stay on the phone.
- Walk, don't run: the game reminds you if it feels bumps. The language is non-violent: "hit" and "out of the game", nothing else.

## Phones

Tested on iPhone 17 Pro, iPhone 14 Pro, Xiaomi Redmi A5 (compass, no gyroscope) and Samsung Galaxy A02s as the host. The target games need a phone that knows when you turn (a gyroscope, or at least a compass). Laser tag only uses the camera and works on all of them.

## Try it on your computer

You need Node 22 or newer.

```sh
npm install
npm run dev        # local HTTPS server, reachable from your Wi-Fi too
npm run check      # logic checks (orientation, targets, high scores, laser tag rules, translations)
```

`npm run dev` also runs the game server locally (Worker and Durable Object, through the Cloudflare plugin for Vite).

Camera and sensors only work over HTTPS. To open the game on a phone:

1. **HTTPS tunnel (recommended)**: install `cloudflared` once (`brew install cloudflared`), then with `npm run dev` running:
   ```sh
   cloudflared tunnel --url https://localhost:5173 --no-tls-verify
   ```
   Open the `https://...trycloudflare.com` address it prints on the phone. No account needed.
2. **Same Wi-Fi network**: open the `Network` address printed by `npm run dev` and accept the certificate warning.

On iPhone, add it to the Home Screen (Share, then Add to Home Screen) to play full screen.

## Publish it for free on Cloudflare

You need a free Cloudflare account.

```sh
npx wrangler login   # once
npm run deploy       # build and publish
```

The game goes to `https://laser-tag-cartone.<your-subdomain>.workers.dev`. The Durable Object uses SQLite storage, the only kind available on the free plan. Publishing a new version disconnects whoever is playing at that moment.

## How it's made

- **Frontend**: Vite and TypeScript with no framework, Three.js for the 3D zombies, js-aruco2 for the markers, a PWA that also works offline. Texts go through `t()` in `src/i18n.ts`: the Italian text is the key and the English lives in `src/en/`.
- **Server**: a Cloudflare Worker with one Durable Object per game, WebSockets with hibernation. The laser tag rules live in `src/rules.ts`, shared by phone and server, and the server always has the last word.
- **No database** and no accounts.

| Path | What's inside |
|---|---|
| `src/` | The game: menus, games, sensors, marker recognition, lobby |
| `worker/` | The game server |
| `scripts/template-en/` | Turns the Italian blaster template into the English one |
| `docs/PROMPT.md` | The full spec the project started from (in Italian) |
| `CLAUDE.md` | Instructions for Claude Code |

The game was written with [Claude Code](https://claude.com/claude-code), starting from `docs/PROMPT.md` and going one milestone at a time, testing every step on real phones.

## License

- The game **code** is [MIT](LICENSE): reuse it freely, crediting the source.
- The **blaster and documents** in `docs/` (PDF template, 3D model, materials and guides) are [CC BY-NC-SA 4.0](docs/LICENSE.md): you can build, modify and share it crediting the project, but not sell it.
