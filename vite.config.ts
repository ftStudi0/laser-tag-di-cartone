import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// HTTPS anche in sviluppo: fotocamera e sensori sul telefono lo richiedono.
export default defineConfig({
  plugins: [basicSsl()],
  server: { allowedHosts: ['.trycloudflare.com'] },
  build: { chunkSizeWarningLimit: 600 }, // Three.js (solo zombi 3D) sta in un file a parte da circa 530 kB
  optimizeDeps: { entries: ['index.html'] }, // non analizzare docs/fucile-3d.html
})
