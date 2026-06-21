import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('react-dom') || id.includes('/react/')) return 'react'
          if (id.includes('deck.gl') || id.includes('@deck.gl')) return 'deck'
          if (id.includes('mapbox-gl') || id.includes('maplibre-gl') || id.includes('react-map-gl')) return 'mapbox'
          return undefined
        },
      },
    },
  },
})
