import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  // The ledger WASM bindings (transitively pulled in via
  // @midnight-ntwrk/midnight-js-protocol/ledger) use ESM `import ... from
  // '*.wasm'`, which esbuild/Vite's default dev transform doesn't support.
  plugins: [react(), wasm(), topLevelAwait()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      // Without this, Vite externalizes bare `events` imports to an empty
      // stub for browser builds; @midnight-ntwrk/midnight-js-level-private-
      // state-provider pulls in abstract-level, whose AbstractLevel class
      // extends Node's EventEmitter at module load time, so an empty stub
      // crashes immediately with "Class extends value undefined".
      events: 'events',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  server: {
    port: 5173,
  },
});
