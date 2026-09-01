// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

/** Dev-only: deep links under /live/* load the live shell (mirrors GitHub Pages 404.html behavior). */
function salonLiveSpaFallback() {
  return {
    name: 'salon-live-spa-fallback',
    configureServer(/** @type {import('vite').ViteDevServer} */ server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? '';
        const q = raw.split('?');
        const pathOnly = q[0] ?? '';
        const search = q.length > 1 ? `?${q.slice(1).join('?')}` : '';
        if (
          pathOnly.startsWith('/live/') &&
          pathOnly !== '/live/' &&
          pathOnly !== '/live' &&
          !pathOnly.includes('.')
        ) {
          req.url = `/live/${search}`;
        }
        next();
      });
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: 'https://salon.castalia.institute',
  integrations: [react(), tailwind()],
  build: {
    assets: 'assets',
  },
  vite: {
    plugins: [salonLiveSpaFallback()],
    resolve: {
      dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
});
