import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  rm,
  access
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { packageRuntime } from './package-runtime.mjs';

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'mms-package-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const source = join(base, 'source');
  const gateway = join(source, 'apps/gps-gateway');
  const shared = join(source, 'packages/shared');
  const json = async (path, value) => writeFile(path, JSON.stringify(value));
  for (const dir of [
    gateway + '/dist',
    shared + '/dist',
    source + '/node_modules/dotenv',
    source + '/node_modules/zod'
  ])
    await mkdir(dir, { recursive: true });
  const manifest = {
    name: '@mms/gps-gateway',
    version: '0.0.0',
    type: 'module',
    dependencies: {
      '@mms/shared': 'workspace:*',
      dotenv: '^1.0.0',
      zod: '^1.0.0'
    },
    devDependencies: { 'unrelated-development-tool': '*' }
  };
  await json(gateway + '/package.json', manifest);
  await json(shared + '/package.json', {
    name: '@mms/shared',
    version: '0.0.0',
    type: 'module',
    exports: { '.': { import: './dist/index.js' } },
    dependencies: { zod: '^1.0.0' }
  });
  await json(source + '/node_modules/dotenv/package.json', {
    name: 'dotenv',
    version: '1.2.3',
    type: 'module'
  });
  await json(source + '/node_modules/zod/package.json', {
    name: 'zod',
    version: '1.2.3',
    type: 'module',
    main: 'index.js'
  });
  await writeFile(
    source + '/node_modules/dotenv/config.js',
    'globalThis.environmentLoaded = true;'
  );
  await writeFile(
    source + '/node_modules/zod/index.js',
    'export const ready = true;'
  );
  await writeFile(shared + '/dist/index.js', "export { ready } from 'zod';");
  await writeFile(
    gateway + '/dist/main.js',
    "import 'dotenv/config.js'; import { ready } from '@mms/shared'; if (!ready || !globalThis.environmentLoaded) throw Error('Missing dependency'); console.log('Runtime is independent');"
  );
  await writeFile(gateway + '/.env', 'SECRET-MUST-NOT-BE-PACKAGED');
  await writeFile(shared + '/.env.local', 'SHARED-SECRET-MUST-NOT-BE-PACKAGED');
  return {
    base,
    source,
    gateway,
    shared,
    manifest,
    json,
    destination: join(base, 'runtime')
  };
}

test('portable runtime works after the source checkout disappears and excludes local secrets/dev tools', async (t) => {
  const f = await fixture(t);
  await packageRuntime(f.destination, f.source);
  await rename(f.source, f.source + '-removed');
  const output = execFileSync(
    process.execPath,
    [join(f.destination, 'dist/main.js')],
    { cwd: tmpdir(), encoding: 'utf8' }
  );
  assert.match(output, /Runtime is independent/);
  for (const path of [
    '.env',
    'node_modules/@mms/shared/.env.local',
    'node_modules/unrelated-development-tool'
  ])
    await assert.rejects(access(join(f.destination, path)));
  const manifest = JSON.parse(
    await readFile(join(f.destination, 'package.json'), 'utf8')
  );
  assert.equal(manifest.devDependencies, undefined);
  assert.deepEqual(manifest.dependencies, {
    '@mms/shared': '0.0.0',
    dotenv: '1.2.3',
    zod: '1.2.3'
  });
});

test('packaging CLI works with a 64 MiB heap without invoking a dependency resolver', async (t) => {
  const f = await fixture(t);
  const script = fileURLToPath(
    new URL('./package-runtime.mjs', import.meta.url)
  );
  const output = execFileSync(
    process.execPath,
    ['--max-old-space-size=64', script, f.destination, f.source],
    { encoding: 'utf8', env: { ...process.env, npm_config_offline: 'true' } }
  );
  assert.match(output, /3 production packages/);
  await access(join(f.destination, 'node_modules/@mms/shared/dist/index.js'));
});

test('unexpected runtime dependencies fail before creating an incomplete release', async (t) => {
  const f = await fixture(t);
  await f.json(f.gateway + '/package.json', {
    ...f.manifest,
    dependencies: { ...f.manifest.dependencies, unexpected: '^1.0.0' }
  });
  await assert.rejects(
    packageRuntime(f.destination, f.source),
    /runtime dependencies/
  );
  await assert.rejects(access(f.destination));
});

test('existing runtime files are never overwritten', async (t) => {
  const f = await fixture(t);
  await mkdir(f.destination);
  await writeFile(
    join(f.destination, '.env'),
    'preserve-current-configuration'
  );
  await assert.rejects(packageRuntime(f.destination, f.source), /EEXIST/);
  assert.equal(
    await readFile(join(f.destination, '.env'), 'utf8'),
    'preserve-current-configuration'
  );
});
