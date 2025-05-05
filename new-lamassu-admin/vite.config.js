import { fileURLToPath } from 'url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import svgr from 'vite-plugin-svgr'
import fixReactVirtualized from 'esbuild-plugin-react-virtualized'

export default defineConfig({
  base: '/',
  build: {
    outDir: 'build'
  },
  server: {
    port: 3001,
    proxy: {
      '^/(graphql|operator-data|front-camera-photo|id-card-photo)': {
        target: 'https://localhost:8070/',
        changeOrigin: true,
        secure: false
      }
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [fixReactVirtualized]
    }
  },
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      src: fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
