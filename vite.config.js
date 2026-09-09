import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
plugins: [react()],
server: {
// Vercel Sandbox assigns a new preview hostname on each restart.
allowedHosts: true,
},
build: {
rollupOptions: {
output: {
manualChunks: {
'firebase-core': ['firebase/app'],
'firebase-auth': ['firebase/auth'],
'firebase-firestore': ['firebase/firestore'],
},
},
},
},
test: {
environment: 'jsdom',
setupFiles: './src/test/setup.js',
clearMocks: true,
restoreMocks: true,
pool: 'threads',
maxWorkers: 1,
},
});
