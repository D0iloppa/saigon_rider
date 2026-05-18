import { defineConfig } from 'vite'
import { resolve } from 'path'
import { copyFileSync } from 'fs'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        screens_v3_rpg: resolve(__dirname, 'screens_v3_rpg.html'),
        item_catalog: resolve(__dirname, 'saigon-rider-item-catalog.html'),
      },
    },
    assetsInlineLimit: 0,
  },
  publicDir: 'public',
})