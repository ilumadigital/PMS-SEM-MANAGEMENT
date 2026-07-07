import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: [
      'pms.sem-management.com'
    ],
    // ΠΡΟΣΘΗΚΗ: Ρύθμιση για να μην σκάνε τα WebSockets πίσω από Nginx SSL
    hmr: {
      host: 'pms.sem-management.com',
      protocol: 'wss',
      clientPort: 443
    }
  }
})