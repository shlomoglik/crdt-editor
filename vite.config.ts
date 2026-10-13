import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = process.env.VITE_BACKEND_URL || 'http://localhost:1234'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: backend,
        configure(proxy) {
          const forwardClientHost = (proxyRequest: import('node:http').ClientRequest, request: import('node:http').IncomingMessage) => {
            if (request.headers.host) proxyRequest.setHeader('x-forwarded-host', request.headers.host)
          }
          proxy.on('proxyReq', forwardClientHost)
        },
      },
      '/yjs': {
        target: backend.replace(/^http/, 'ws'),
        ws: true,
        configure(proxy) {
          const forwardClientHost = (proxyRequest: import('node:http').ClientRequest, request: import('node:http').IncomingMessage) => {
            if (request.headers.host) proxyRequest.setHeader('x-forwarded-host', request.headers.host)
          }
          proxy.on('proxyReqWs', forwardClientHost)
        },
      },
    },
  },
})
