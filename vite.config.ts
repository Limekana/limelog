import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // v1.17 (limecore#12): console.log/info/debug land in Android logcat, which
  // other tools on the device can read. Production builds drop them; warn and
  // error stay for diagnosis. Vite sets NODE_ENV to production for a build.
  esbuild: process.env.NODE_ENV === 'production'
    ? { pure: ['console.log', 'console.info', 'console.debug'], drop: ['debugger'] }
    : undefined,
})
