import { defineConfig } from 'vitest/config';

// Pure CSV validation only. This configuration never loads or resets a database.
export default defineConfig({
  test: { include: ['src/modules/organization/csv-validation.test.ts'] }
});
