import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const { API_PROXY_TARGET = 'http://127.0.0.1:8080' } = loadEnv(mode, '.', 'API_PROXY_');

    return {
        plugins: [react()],
        server: {
            proxy: { '/api': API_PROXY_TARGET },
        },
    };
});