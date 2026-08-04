import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode !== 'test' && basicSsl(),
    mode !== 'test' && VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      devOptions: {
        enabled: true
      },
      workbox: {
        navigateFallbackDenylist: [/^\/onesignal\//, /^\/OneSignalSDKWorker\.js$/],
      },
    })
  ].filter(Boolean),
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.js'],
    globals: true,
  },
}))
