import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/pushpilot/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/pushpilot/public': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/pushpilot/sdk': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/pushpilot/demo': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/pushpilot/uploads': { target: 'http://127.0.0.1:4000', changeOrigin: true }
    }
  }
})
