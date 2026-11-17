import { defineConfig } from 'vite';

const tecnomatMediaProxy = {
  target: 'https://www.tecnomat.it/pub/media/catalog/product',
  changeOrigin: true,
  secure: false,
  rewrite: (path) => path.replace(/^\/tecnomat-media/, ''),
};

export default defineConfig({
  server: {
    proxy: {
      '/tecnomat-media': tecnomatMediaProxy,
    },
  },
  preview: {
    proxy: {
      '/tecnomat-media': tecnomatMediaProxy,
    },
  },
});
