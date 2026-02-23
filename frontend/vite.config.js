import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// DisputeAI - Vite Configuration
// Note: On Node.js v25, first startup takes ~60-90s for dep optimization
export default defineConfig({
  plugins: [
    react({
      // Use classic runtime to avoid automatic JSX transform issues on Node v25
      jsxRuntime: 'automatic'
    })
  ],
  optimizeDeps: {
    // Eagerly pre-bundle all known deps to minimize on-demand optimization
    include: [
      'react', 'react-dom', 'react-dom/client',
      'react-router-dom',
      'recharts',
      'lucide-react'
    ],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  server: {
    port: 3000,
    host: true, // Listen on all interfaces for mobile testing via LAN
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    },
    // Warm up frequently used files
    warmup: {
      clientFiles: [
        './src/main.jsx',
        './src/App.jsx',
        './src/pages/*.jsx',
        './src/components/*.jsx',
        './src/hooks/*.jsx',
        './src/utils/*.js'
      ]
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts']
        }
      }
    }
  }
});
