import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 운영 기본값 보존: 환경변수 미지정 시 운영 서버로 프록시.
// docker-compose dev에서는 VITE_API_PROXY_TARGET=http://backend1:8003 주입.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://35.213.6.149:8003'
const wsTarget = apiTarget.replace(/^http/, 'ws')

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
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: wsTarget,
        ws: true,
      },
    }
  }
})
