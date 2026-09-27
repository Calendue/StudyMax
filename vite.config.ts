import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vite doesn't read PORT on its own. Honouring it lets a second dev server run alongside one
  // already holding 5173 — nothing here needs a fixed port (the api/* routes are same-origin).
  // Plain `vite` has no api/* routes, so /api/features said "off" and hid transcript upload, awards
  // notes and the calls. Send them to the deployed site, as the native apps do (API_BASE in
  // src/platform.ts). ponytail: local api/ edits need `vercel dev` or a deploy to be seen.
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: { '/api': { target: 'https://study-max-theta.vercel.app', changeOrigin: true } },
  },
})
