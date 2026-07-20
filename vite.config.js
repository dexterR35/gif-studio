import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxy = env.VITE_API_PROXY || 'http://127.0.0.1:8000'
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      // Cloudflare / ngrok quick tunnels (Host header is the public URL)
      allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.loca.lt'],
      proxy: { '/api': apiProxy },
      // Never watch Python venv / AI weights — they exhaust inotify (ENOSPC).
      watch: {
        ignored: [
          '**/.venv/**',
          '**/venv/**',
          '**/__pycache__/**',
          '**/models/**',
          '**/third_party/**',
          '**/.git/**',
          '**/.pytest_cache/**',
          '**/.ruff_cache/**',
        ],
      },
    },
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    worker: {
      format: 'es',
    },
    test: {
      environment: 'node',
      include: ['tests/js/**/*.test.js'],
    },
  }
})
