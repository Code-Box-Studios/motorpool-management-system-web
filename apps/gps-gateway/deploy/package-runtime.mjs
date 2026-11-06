import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

function checkDependencies(manifest, expected) {
  const actual = Object.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies
  }).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error(
      `Unexpected runtime dependencies in ${manifest.name}; update the portable packager before deploying.`
    );
  }
}

/** Copy the already-installed, lockfile-selected production packages. No resolution or network access. */
export async function packageRuntime(destination, sourceRoot = repository) {
  const gateway = join(sourceRoot, 'apps/gps-gateway');
  const shared = join(sourceRoot, 'packages/shared');
  const gatewayManifest = await readJson(join(gateway, 'package.json'));
  const sharedManifest = await readJson(join(shared, 'package.json'));
  checkDependencies(gatewayManifest, ['@mms/shared', 'dotenv', 'zod']);
  checkDependencies(sharedManifest, ['zod']);

  const requireGateway = createRequire(join(gateway, 'package.json'));
  const requireShared = createRequire(join(shared, 'package.json'));
  const packages = await Promise.all(
    ['dotenv', 'zod'].map(async (name) => {
      const file = requireGateway.resolve(`${name}/package.json`);
      const manifest = await readJson(file);
      checkDependencies(manifest, []);
      return { name, directory: dirname(file), version: manifest.version };
    })
  );
  const zodVersion = packages.find((pkg) => pkg.name === 'zod').version;
  const sharedZod = await readJson(requireShared.resolve('zod/package.json'));
  if (sharedZod.version !== zodVersion)
    throw new Error(
      'Gateway and shared Zod versions differ; update the portable packager before deploying.'
    );
  await access(join(gateway, 'dist/main.js'));
  await access(join(shared, 'dist/index.js'));

  // A live or partially prepared runtime must never be merged or overwritten.
  await mkdir(destination, { mode: 0o700 });
  const copy = (from, to) =>
    cp(from, to, {
      recursive: true,
      dereference: true,
      force: false,
      errorOnExist: true
    });
  await copy(join(gateway, 'dist'), join(destination, 'dist'));
  const sharedDestination = join(destination, 'node_modules/@mms/shared');
  await mkdir(sharedDestination, { recursive: true });
  await copy(join(shared, 'dist'), join(sharedDestination, 'dist'));
  const portableManifest = (manifest, dependencies) => {
    const { devDependencies, scripts, files, ...rest } = manifest;
    return { ...rest, dependencies };
  };
  const versions = Object.fromEntries(
    packages.map((pkg) => [pkg.name, pkg.version])
  );
  await writeFile(
    join(destination, 'package.json'),
    JSON.stringify(
      portableManifest(gatewayManifest, {
        '@mms/shared': sharedManifest.version,
        ...versions
      }),
      null,
      2
    ) + '\n'
  );
  await writeFile(
    join(sharedDestination, 'package.json'),
    JSON.stringify(
      portableManifest(sharedManifest, { zod: zodVersion }),
      null,
      2
    ) + '\n'
  );
  for (const pkg of packages)
    await copy(pkg.directory, join(destination, 'node_modules', pkg.name));
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  if (!process.argv[2])
    throw new Error(
      'Usage: node package-runtime.mjs <new-runtime-directory> [source-repository]'
    );
  await packageRuntime(
    resolve(process.argv[2]),
    process.argv[3] ? resolve(process.argv[3]) : repository
  );
  console.log(
    'Gateway runtime packaged using 3 production packages; no dependency resolution required.'
  );
}
