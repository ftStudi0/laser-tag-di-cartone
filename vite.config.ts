import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// HTTPS anche in sviluppo: fotocamera e sensori sul telefono lo richiedono.
export default defineConfig({
  plugins: [basicSsl()],
  server: { allowedHosts: ['.trycloudflare.com'] },
})
