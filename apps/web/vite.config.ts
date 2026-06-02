import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The repo keeps a single .env at the monorepo root (the API loads it via
  // --env-file=../../.env). Point Vite there too so VITE_* vars — e.g.
  // VITE_POSTHOG_KEY — are picked up; otherwise Vite would only read apps/web/.env.
  envDir: '../../',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
