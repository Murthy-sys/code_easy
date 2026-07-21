import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server proxies /llm to the local model runtime so the browser never
// makes a cross-origin request (Ollama & friends are picky about CORS).
// Defaults to mlx_lm.server; point it elsewhere with
// VITE_LLM_TARGET=http://localhost:11434 npm run dev
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const target = env.VITE_LLM_TARGET || 'http://127.0.0.1:8080'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/llm': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/llm/, ''),
        },
        // Workspace sidecar (server/index.js) — filesystem + command execution.
        '/ws': {
          target: env.VITE_WORKSPACE_TARGET || 'http://127.0.0.1:8787',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ws/, ''),
        },
      },
    },
  }
})
