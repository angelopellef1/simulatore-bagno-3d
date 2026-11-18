import { defineConfig } from 'vite';

const mediaProxies = {
  '/tecnomat-media': {
    target: 'https://www.tecnomat.it/pub/media/catalog/product',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/tecnomat-media/, ''),
  },
  '/baucer-media': {
    target: 'https://www.progettobaucer.it',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/baucer-media/, ''),
  },
  '/armonie-media': {
    target: 'https://www.armonieceramiche.com',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/armonie-media/, ''),
  },
};

export default defineConfig({
  server: {
    proxy: mediaProxies,
  },
  preview: {
    proxy: mediaProxies,
  },
});
