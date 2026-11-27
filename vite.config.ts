import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA, type ManifestOptions } from 'vite-plugin-pwa';

/**
 * Rutas que nunca deben servirse desde caché ni caer en el shell de la PWA.
 * Supabase (API y auth) vive en otro origen y tampoco se cachea porque no hay
 * `runtimeCaching`: el service worker solo precachea el shell de la app.
 */
export const RUTAS_SIN_CACHE = [
  /^\/api\//,
  /^\/auth\//,
  /^\/rest\/v1\//,
  /^\/functions\/v1\//,
];

/**
 * El manifiesto vive versionado en `public/manifest.webmanifest` (una sola
 * fuente de verdad, también testeable). VitePWA lo recibe como objeto para
 * inyectar el `<link rel="manifest">` en el build; `index.html` no lleva
 * enlaces manuales a assets servidos para que el verificador de enlaces del
 * repo no confunda rutas públicas con archivos fuente.
 */
function cargarManifiesto(): Partial<ManifestOptions> {
  try {
    const crudo = readFileSync(
      new URL('./public/manifest.webmanifest', import.meta.url),
      'utf8',
    );
    return JSON.parse(crudo) as Partial<ManifestOptions>;
  } catch (error) {
    throw new Error('No se pudo leer public/manifest.webmanifest', {
      cause: error,
    });
  }
}

const manifiesto = cargarManifiesto();

function inyectarIconosPwa(): Plugin {
  return {
    name: 'inyectar-iconos-pwa',
    transformIndexHtml() {
      return [
        {
          tag: 'link',
          attrs: { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icons/icon-192.png' },
          injectTo: 'head',
        },
        {
          tag: 'link',
          attrs: { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
          injectTo: 'head',
        },
        {
          tag: 'link',
          attrs: {
            rel: 'apple-touch-icon',
            sizes: '180x180',
            href: '/icons/apple-touch-icon.png',
          },
          injectTo: 'head',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    inyectarIconosPwa(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: manifiesto,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png', 'logos/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: RUTAS_SIN_CACHE,
        // Sin caché de respuestas de API ni de auth: solo shell offline.
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
