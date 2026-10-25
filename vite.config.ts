import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    watch: { ignored: ['**/.data/**'] },
    fs: { deny: ['**/.data/**', '.env', '.env.*', '*.{crt,pem}', '**/.git/**'] },
  },
});
