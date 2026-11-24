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
  '/florim-media': {
    target: 'https://florim-cdn.thron.com',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/florim-media/, ''),
  },
  '/mirage-media': {
    target: 'https://mirage-cdn.thron.com',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/mirage-media/, ''),
  },
  '/caesar-media': {
    target: 'https://www.caesar.it',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/caesar-media/, ''),
  },
  '/fap-media': {
    target: 'https://www.fapceramiche.com',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/fap-media/, ''),
  },
  '/bardelli-media': {
    target: 'https://cdn.shopify.com',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/bardelli-media/, ''),
  },
  '/serenissima-media': {
    target: 'https://www.serenissima.re.it',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/serenissima-media/, ''),
  },
  '/delconca-media': {
    target: 'https://www.delconca.com',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/delconca-media/, ''),
  },
  '/demaio-media': {
    target: 'https://francescodemaio.it',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/demaio-media/, ''),
  },
  '/fioranese-media': {
    target: 'https://www.fioranese.it',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/fioranese-media/, ''),
  },
  '/tecnolam-media': {
    target: 'https://technolam.it',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/tecnolam-media/, ''),
  },
  '/atlas-media': {
    target: 'https://storage.atlasplan.com',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/atlas-media/, ''),
  },
  '/iperceramica-media': {
    target: 'https://cdn.iperceramica.it',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/iperceramica-media/, ''),
  },
  '/deghi-media': {
    target: 'https://assets.deghi.it',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/deghi-media/, ''),
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
