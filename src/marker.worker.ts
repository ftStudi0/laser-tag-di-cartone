// Riconoscimento dei marker in un Web Worker, così il gioco resta fluido. Riceve solo il ritaglio centrale.
import { AR, DICTIONARY } from './aruco.ts'

// al massimo 1 bit sbagliato: il dizionario ne distingue 5, così un numero non si scambia con un altro
const detector = new AR.Detector({ dictionaryName: DICTIONARY, maxHammingDistance: 2 })

self.onmessage = (e: MessageEvent<{ w: number; h: number; data: Uint8ClampedArray }>) => {
  const { w, h, data } = e.data
  const t0 = performance.now()
  const markers = detector.detect({ width: w, height: h, data }).map((m: any) => ({ id: m.id, c: m.corners.map((p: any) => [p.x, p.y]) }))
  self.postMessage({ markers, ms: performance.now() - t0 })
}
