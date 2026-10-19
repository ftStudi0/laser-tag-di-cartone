// Zombi 3D fatti con forme semplici (niente modelli da scaricare). Caricato solo se si sceglie il 3D.
// La logica del gioco (posizioni, colpi) resta in game.ts: qui si disegna e basta.
import * as THREE from 'three'
import type { Quat, View } from './math.ts'
import type { Kind } from './targets.ts'
import { GOLD, ZPANTS, ZSHIRT, ZSKIN } from './themes.ts'

export type Z3 = { id: number; x: number; z: number; kind: Kind; tint: number; speed: number; pop: number } // pop: 0 vivo, fino a 1 sparito

type Zombie = { g: THREE.Group; legs: THREE.Object3D[]; arms: THREE.Object3D[]; mats: THREE.Material[]; geos: THREE.BufferGeometry[] }

function build(kind: Kind, tint: number): Zombie {
  const g = new THREE.Group()
  const mats: THREE.Material[] = []
  const geos: THREE.BufferGeometry[] = []
  const mat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, ...extra })
    mats.push(m)
    return m
  }
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
    geos.push(geo)
    const o = new THREE.Mesh(geo, m)
    o.position.set(x, y, z)
    parent.add(o)
    return o
  }
  const pivot = (x: number, y: number) => {
    const p = new THREE.Object3D()
    p.position.set(x, y, 0)
    g.add(p)
    return p
  }
  const skin = mat(ZSKIN[tint % 4])
  const shirt = mat(kind === 'dorato' ? GOLD : ZSHIRT[tint % 4])
  const pants = mat(ZPANTS)
  const dark = mat('#2b2340')
  const white = mat('#ffffff')

  const legs = [-1, 1].map((s) => {
    const p = pivot(s * 0.11, 0.62)
    mesh(new THREE.BoxGeometry(0.17, 0.58, 0.19), pants, 0, -0.29, 0, p)
    mesh(new THREE.BoxGeometry(0.19, 0.08, 0.26), dark, 0, -0.58, 0.03, p)
    return p
  })
  mesh(new THREE.BoxGeometry(0.48, 0.5, 0.28), shirt, 0, 0.86, 0)
  mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), white, 0.1, 0.8, 0.15)
  const arms = [-1, 1].map((s) => {
    const p = pivot(s * 0.31, 1.06)
    mesh(new THREE.BoxGeometry(0.13, 0.52, 0.13), skin, 0, -0.26, 0, p)
    p.rotation.x = -1.35 // braccia in avanti
    return p
  })
  mesh(new THREE.SphereGeometry(0.25, 20, 14), skin, 0, 1.34, 0)
  // occhi storti e sorriso con dentino
  mesh(new THREE.SphereGeometry(0.075, 12, 8), white, -0.09, 1.38, 0.2)
  mesh(new THREE.SphereGeometry(0.055, 12, 8), white, 0.1, 1.37, 0.21)
  mesh(new THREE.SphereGeometry(0.035, 10, 6), dark, -0.09, 1.38, 0.27)
  mesh(new THREE.SphereGeometry(0.027, 10, 6), dark, 0.1, 1.36, 0.265)
  mesh(new THREE.BoxGeometry(0.14, 0.025, 0.02), dark, 0, 1.25, 0.235)
  mesh(new THREE.BoxGeometry(0.035, 0.035, 0.02), white, -0.03, 1.23, 0.24)
  if (kind === 'veloce') mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.06, 20, 1, true), mat('#ff5a5f', { side: THREE.DoubleSide }), 0, 1.45, 0)
  if (kind === 'dorato') mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.12, 6), mat(GOLD, { emissive: '#664400' }), 0, 1.62, 0)
  const shadow = mesh(new THREE.CircleGeometry(0.32, 20), mat('#000000', { transparent: true, opacity: 0.22, depthWrite: false }), 0, 0.01, 0)
  shadow.rotation.x = -Math.PI / 2
  return { g, legs, arms, mats, geos }
}

export function createZombies3D(stage: HTMLElement, before: Element) {
  const canvas = document.createElement('canvas')
  canvas.className = 'gl'
  stage.insertBefore(canvas, before)
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: devicePixelRatio < 2.5 })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)) // ponytail: 1.5 fisso, scendere a 1 sui telefoni lenti
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a8fb0', 2.4))
  const sun = new THREE.DirectionalLight('#ffffff', 1.4)
  sun.position.set(1, 3, 2)
  scene.add(sun)
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60)
  const live = new Map<number, Zombie>()
  let w = 0, h = 0

  function remove(id: number) {
    const z = live.get(id)!
    scene.remove(z.g)
    z.geos.forEach((g) => g.dispose())
    z.mats.forEach((m) => m.dispose())
    live.delete(id)
  }

  return {
    render(items: Z3[], q: Quat, view: View, sw: number, sh: number, eyeH: number, t: number) {
      if (sw !== w || sh !== h) {
        w = sw
        h = sh
        renderer.setSize(w, h, false)
      }
      // stessa proiezione del resto del gioco: focale f, centro dello schermo
      camera.fov = (2 * Math.atan(h / 2 / view.f) * 180) / Math.PI
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      camera.position.set(0, eyeH, 0)
      camera.quaternion.set(q[0], q[1], q[2], q[3])
      const seen = new Set<number>()
      for (const it of items) {
        seen.add(it.id)
        let z = live.get(it.id)
        if (!z) {
          z = build(it.kind, it.tint)
          live.set(it.id, z)
          scene.add(z.g)
        }
        const ph = t * 6 * it.speed
        z.g.position.set(it.x, Math.abs(Math.sin(ph)) * 0.03, it.z)
        z.g.lookAt(0, z.g.position.y, 0) // guarda verso il giocatore
        z.g.rotateZ(Math.sin(ph / 2) * 0.06) // dondola
        z.legs.forEach((l, i) => (l.rotation.x = Math.sin(ph + i * Math.PI) * 0.5))
        z.arms.forEach((a, i) => (a.rotation.x = -1.35 + Math.sin(ph + i * Math.PI) * 0.12))
        if (it.pop > 0) {
          z.g.scale.setScalar(Math.max(0.01, 1 - it.pop))
          z.g.rotateY(it.pop * 6)
        } else z.g.scale.setScalar(1)
      }
      for (const id of [...live.keys()]) if (!seen.has(id)) remove(id)
      renderer.render(scene, camera)
    },
    dispose() {
      for (const id of [...live.keys()]) remove(id)
      renderer.dispose()
      canvas.remove()
    },
  }
}
