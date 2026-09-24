import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:1234',
        configure(proxy) {
          const forwardClientHost = (proxyRequest: import('node:http').ClientRequest, request: import('node:http').IncomingMessage) => {
            if (request.headers.host) proxyRequest.setHeader('x-forwarded-host', request.headers.host)
          }
          proxy.on('proxyReq', forwardClientHost)
        },
      },
      '/yjs': {
        target: 'ws://localhost:1234',
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
