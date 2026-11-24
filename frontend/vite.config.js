import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    root: path.resolve(import.meta.dirname, '..'),
    alias: Object.fromEntries(['react', 'react-dom', 'react-router-dom', '@testing-library/react'].map((name) => [name, path.resolve(import.meta.dirname, 'node_modules', name)])),
    include: ['tests/frontend/**/*.test.{js,jsx,ts,tsx}'],
    css: { include: /headings\.css/ },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to FastAPI during dev
      '/api': 'http://127.0.0.1:8000',
      '/ingest': 'http://127.0.0.1:8000',
      '/query': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/feedback': 'http://127.0.0.1:8000',
    }
  }
})
