// Quaternioni e proiezione. Convenzione come Three.js: Y in alto, la camera guarda verso -Z.
export type Quat = [number, number, number, number] // x, y, z, w
export type Vec3 = [number, number, number]
export type View = { f: number; cx: number; cy: number }

export const D = Math.PI / 180

export function qMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

export const qConj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]]

export function qRot(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q
  const [vx, vy, vz] = v
  const tx = 2 * (y * vz - z * vy)
  const ty = 2 * (z * vx - x * vz)
  const tz = 2 * (x * vy - y * vx)
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)]
}

// ponytail: nlerp invece di slerp, va bene per i passi piccoli del filtro
export function qNlerp(a: Quat, b: Quat, t: number): Quat {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1
  const q = a.map((v, i) => v + (b[i] * s - v) * t) as Quat
  const n = Math.hypot(...q)
  return q.map((v) => v / n) as Quat
}

// Da deviceorientation (gradi) al quaternione della camera posteriore, come DeviceOrientationControls di Three.js.
export function deviceQuat(alpha: number, beta: number, gamma: number, screenAngle: number): Quat {
  const x = beta * D, y = alpha * D, z = -gamma * D
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2)
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2)
  let q: Quat = [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ]
  q = qMul(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2])
  const o = (-screenAngle * D) / 2
  return qMul(q, [0, 0, Math.sin(o), Math.cos(o)])
}

export const forward = (q: Quat) => qRot(q, [0, 0, -1])
export const yawOf = (f: Vec3) => Math.atan2(-f[0], -f[2])
export const pitchOf = (f: Vec3) => Math.asin(Math.max(-1, Math.min(1, f[1])))
export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

// Direzione nel mondo da imbardata ed elevazione (radianti).
export function dirFrom(yaw: number, el: number): Vec3 {
  return [-Math.sin(yaw) * Math.cos(el), Math.sin(el), -Math.cos(yaw) * Math.cos(el)]
}

// Il video riempie lo schermo con object-fit: cover. fov è il campo visivo orizzontale del lato lungo del video.
export function viewFor(sw: number, sh: number, vw: number, vh: number, fovDeg: number): View {
  const scale = Math.max(sw / vw, sh / vh)
  return { f: (Math.max(vw, vh) * scale) / 2 / Math.tan((fovDeg * D) / 2), cx: sw / 2, cy: sh / 2 }
}

export function fovFromFocal(f: number, sw: number, sh: number, vw: number, vh: number): number {
  const scale = Math.max(sw / vw, sh / vh)
  return (2 * Math.atan((Math.max(vw, vh) * scale) / 2 / f)) / D
}

// Proietta una direzione del mondo sullo schermo. null se è dietro.
export function project(q: Quat, dir: Vec3, v: View) {
  const c = qRot(qConj(q), dir)
  if (c[2] > -0.05) return null
  return { x: v.cx + (v.f * c[0]) / -c[2], y: v.cy - (v.f * c[1]) / -c[2], depth: -c[2] }
}

// Direzione sullo schermo (anche per le cose dietro): serve per la freccia fuori schermo.
export function screenDir(q: Quat, dir: Vec3): [number, number] {
  const c = qRot(qConj(q), dir)
  return [c[0], -c[1]]
}

// Lunghezza focale tale che un oggetto passato da x1 a x2 corrisponda a una rotazione di theta radianti.
export function solveFocal(x1: number, x2: number, cx: number, theta: number): number {
  let lo = 30, hi = 30000
  for (let i = 0; i < 60; i++) {
    const f = (lo + hi) / 2
    const a = Math.atan((x1 - cx) / f) - Math.atan((x2 - cx) / f)
    if (a > theta) lo = f
    else hi = f
  }
  return (lo + hi) / 2
}

// Il punto (x, y) è dentro il poligono allargato di "grow" (0.2 = 20%) attorno al suo centro?
export function inPoly(pts: [number, number][], x: number, y: number, grow = 0): boolean {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
  const q = pts.map(([px, py]) => [cx + (px - cx) * (1 + grow), cy + (py - cy) * (1 + grow)])
  let inside = false
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, yi] = q[i], [xj, yj] = q[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
