import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

function localZxingWasmPlugin() {
  return {
    name: 'use-local-zxing-wasm',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/zxing-wasm/dist/es/share.js')) {
        return null
      }

      const cdnFallback = /`https:\/\/fastly\.jsdelivr\.net\/npm\/zxing-wasm@[^/]+\/dist\/\$\{n\[1\]\}\/\$\{e\}`/g
      const transformed = code.replace(cdnFallback, '`/vendor/${e}`')

      if (transformed === code) {
        throw new Error('zxing-wasm CDN yedeği yerel dosyaya yönlendirilemedi')
      }

      return { code: transformed, map: null }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [localZxingWasmPlugin(), react(), basicSsl()],
  worker: {
    plugins: () => [localZxingWasmPlugin()],
  },
  server: {
    host: true,
    proxy: {
      "/api": "http://localhost:5704",
    },
  },
})
