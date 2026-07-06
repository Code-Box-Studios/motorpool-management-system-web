import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// tsc does not copy non-TS assets; mirror src/assets into dist/assets so the
// built server (node dist/…) can read the RF model at runtime.
const src = fileURLToPath(new URL('../src/assets', import.meta.url));
const dest = fileURLToPath(new URL('../dist/assets', import.meta.url));
if (existsSync(src)) {
  cpSync(src, dest, { recursive: true });
  console.log(`copied assets → ${dest}`);
}
