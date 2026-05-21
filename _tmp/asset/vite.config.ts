import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        profileCatalog: resolve(__dirname, 'saigon-rider-profile-catalog.html'),
        effectsCatalog: resolve(__dirname, 'saigon-rider-effects-catalog.html'),
        customCatalog: resolve(__dirname, 'saigon-rider-custom-catalog.html'),
        partsCatalog: resolve(__dirname, 'saigon-rider-parts-catalog.html'),
        socialCatalog: resolve(__dirname, 'saigon-rider-social-catalog.html'),
        bikesCatalog: resolve(__dirname, 'saigon-rider-bikes-catalog.html'),
        gearCatalog: resolve(__dirname, 'saigon-rider-gear-catalog.html'),
        parts2Catalog: resolve(__dirname, 'saigon-rider-parts2-catalog.html'),
        screensIndex: resolve(__dirname, 'screens_index.html'),
        screensV6Info: resolve(__dirname, 'screens_v6_info.html'),
      },
    },
  },
  assetsInclude: ['**/*.svg'],
});
