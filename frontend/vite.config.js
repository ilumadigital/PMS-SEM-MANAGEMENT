import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: [
      'pms.sem-management.com'
    ],
    hmr: {
      host: 'pms.sem-management.com',
      protocol: 'wss',
      clientPort: 443
    }
  }
})