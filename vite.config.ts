import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const isUserSiteRepo = repoName.endsWith('.github.io');
const basePath = process.env.GITHUB_ACTIONS === 'true'
  ? (isUserSiteRepo ? '/' : `/${repoName}/`)
  : '/';

export default defineConfig({
  base: basePath,
  server: {
    host: true,
    allowedHosts: true
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Sailing',
        short_name: 'Sailing',
        description: 'PWA для тренера парусного спорта',
        lang: 'ru',
        dir: 'ltr',
        theme_color: '#0B1A2B',
        background_color: '#0B1A2B',
        display: 'standalone',
        orientation: 'any',
        start_url: basePath,
        scope: basePath,
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}']
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: []
  }
});
