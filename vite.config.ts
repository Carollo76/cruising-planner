import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Stamped into the bundle so the running build can be identified from the UI —
  // useful for telling a stale service-worker cache apart from a real bug.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' rather than 'autoUpdate': autoUpdate only looks for a new build at page
      // load, so a long-lived tab can sit on a stale bundle indefinitely with no way for
      // the user to tell. UpdatePrompt polls for new builds and offers a visible Reload,
      // which also avoids yanking the page out from under someone mid-form.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 10000, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/tiles\.openseamap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'seamark-tiles',
              expiration: { maxEntries: 10000, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.weather\.gov\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'noaa-weather',
              expiration: { maxEntries: 100, maxAgeSeconds: 6 * 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /^https:\/\/api\.tidesandcurrents\.noaa\.gov\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'noaa-tides',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      manifest: {
        name: 'Cruising Planner',
        short_name: 'CruisePlan',
        description: 'Offline-first sailing cruise planning and navigation companion',
        theme_color: '#1e3a5f',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
