import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // P2-1: react 코어(모든 화면 공용, 거의 안 바뀜)와 maplibre-gl(지도 전용, 무겁고
        // 이미 lazy 라우트에서만 쓰임)만 분리한다. 그 외 의존성까지 잘게 쪼개면 요청 수만
        // 늘고 캐시 이득은 적어 나머지는 각자 쓰는 라우트 청크에 자연히 묶이게 둔다.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('maplibre-gl')) return 'vendor-map';
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true, // 모바일에서 LAN으로 접속 가능
    // hmr: {
    //   clientPort: 18090,
    //   host: '0.0.0.0',
    //   protocol: 'ws',
    // },
    allowedHosts: true,
    watch: {
      usePolling: true,
    },
  },
})
