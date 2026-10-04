import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
<<<<<<< HEAD

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
=======
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      // Patch BufferGeometryUtils to re-export the old mergeBufferGeometries name
      name: 'three-buffer-geometry-compat',
      enforce: 'pre' as const,
      transform(code: string, id: string) {
        if (id.startsWith('\0')) return null;
        if (id.includes('BufferGeometryUtils') && !code.includes('mergeBufferGeometries')) {
          return {
            code: code + '\nexport { mergeGeometries as mergeBufferGeometries };\n',
            map: null,
          };
        }
        return null;
      },
    },
  ],
  resolve: {
    alias: [
      {
        // Match ONLY the bare 'three' specifier, not 'three/examples/...' subpaths
        find: /^three$/,
        replacement: path.resolve(__dirname, 'src/three-compat.js'),
      },
    ],
  },
  optimizeDeps: {
    include: ['gsap'],
    exclude: ['@splinetool/loader'],
  },
>>>>>>> main
})
