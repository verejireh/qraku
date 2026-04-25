import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://35.213.6.149:8003',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://35.213.6.149:8003',
        ws: true,
      },
    }
  }
})
