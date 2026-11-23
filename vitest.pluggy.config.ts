import { defineConfig } from 'vitest/config'
import path from 'path'

// Suíte de integração da Pluggy em Postgres real e descartável.
// Isolada da suíte de integração legada (vitest.integration.config.ts).
// Exige PLUGGY_TEST_DATABASE_URL apontando para localhost (ver tests/pluggy-integration/helpers.ts).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/pluggy-integration/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})

