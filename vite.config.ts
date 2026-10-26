import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const base =
    process.env.VITE_BASE_PATH ||
    (mode === 'capacitor' ? './' : '/ai-studio/edo/');

  return {
    base,
    plugins: [react()],
    server: {
      host: true,
      port: 5173
    },
    preview: {
      host: true,
      port: 4173
    }
  };
});
