// js-aruco2 è scritto come script classico: usa "this" come spazio globale e require() tra i suoi file.
// I bundler cambiano "this" in undefined, quindi i tre file si eseguono qui con un "this" tutto loro.
import aruco from 'js-aruco2/src/aruco.js?raw'
import cv from 'js-aruco2/src/cv.js?raw'
import dict16h5 from 'js-aruco2/src/dictionaries/apriltag_16h5.js?raw'

const lib: { AR?: any; CV?: any } = {}
for (const src of [cv, aruco, dict16h5]) new Function('require', src).call(lib, () => lib)
export const AR = lib.AR
// AprilTag 16h5: celle grandissime (6x6 col bordo), il meglio per leggere da lontano. 30 numeri diversi.
export const DICTIONARY = 'APRILTAG_16h5'
