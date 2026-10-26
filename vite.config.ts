import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  let defaultBase = '/Edo-Language-Studio/';
  if (mode === 'capacitor') {
    defaultBase = './';
  } else if (mode === 'getrodion') {
    defaultBase = '/ai-studio/edo/';
  }

  const base = process.env.VITE_BASE_PATH || defaultBase;

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
