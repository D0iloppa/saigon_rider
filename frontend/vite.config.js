import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
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
});
