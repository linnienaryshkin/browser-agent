import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mcpLampMiddleware } from './src/mcp-lamp-server'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'mcp-lamp-server',
      configureServer(server) {
        server.middlewares.use(mcpLampMiddleware());
      },
    },
  ],
  envPrefix: ['ANTHROPIC_'],
  server: {
    proxy: {
      /**
       * Proxying API requests to avoid CORS issues. The Anthropic API does not allow
       * cross-origin requests from the browser, so we set up a proxy in Vite's dev server.
       * This way, we can make requests to /api/anthropic/* and have them forwarded to
       * https://api.anthropic.com/* without CORS issues.
       */
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
      /**
       * Proxy for the remote open-meteo MCP server to avoid CORS issues.
       * Uses the public, keyless open-meteo MCP server at open-meteo.caseyjhand.com.
       */
      '/api/open-meteo.caseyjhand': {
        target: 'https://open-meteo.caseyjhand.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/open-meteo.caseyjhand/, '/mcp'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
    },
  },
})
