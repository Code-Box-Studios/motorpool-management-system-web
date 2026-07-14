// Pulls one freely-licensed photo per record from Wikimedia Commons, writes it
// into UPLOADS_DIR, and points the DB row at it. Demo data only — uploads/ is
// gitignored, so nothing this writes is committed.
//
//   node scripts/seed-demo-images.mjs          # fill records that have no photo
//   node scripts/seed-demo-images.mjs --force  # re-fetch everything
//
// Commons throttles anonymous callers hard (HTTP 429) and asks for a real
// User-Agent, so requests are serialised with a delay and retried with backoff.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const UPLOADS = path.resolve(process.cwd(), process.env.UPLOADS_DIR ?? 'uploads');
const FORCE = process.argv.includes('--force');

const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const UA = 'MMS-demo-seed/1.0 (motorpool management system; local demo data)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, attempt = 0) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.ok) return res;
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(1500 * 2 ** attempt);
    return get(url, attempt + 1);
  }
  throw new Error(`HTTP ${res.status}`);
}

// Search Commons, trying each term until one yields a raster image.
async function findImage(queries) {
  for (const q of queries) {
    const url =
      `${COMMONS}?action=query&format=json&generator=search` +
      `&gsrnamespace=6&gsrlimit=10&gsrsearch=${encodeURIComponent(q)}` +
      `&prop=imageinfo&iiprop=url|mime&iiurlwidth=900`;
    let json;
    try {
      json = await (await get(url)).json();
    } catch {
      await sleep(800);
      continue;
    }
    for (const page of Object.values(json?.query?.pages ?? {})) {
      const src = page?.imageinfo?.[0]?.thumburl ?? page?.imageinfo?.[0]?.url;
      if (!src) continue;
      // Commons renders a PDF/DjVu page as a .jpg *thumbnail*, so the thumb URL
      // alone can't tell a photo from a scanned book page — the SOURCE file's
      // extension can. ("Hydraulic Jack" first resolved to a page of a Victorian
      // treatise on hydraulic machines.)
      if (!/\.(jpe?g|png)$/i.test(page.title ?? '')) continue;
      if (!/\.(jpe?g|png)$/i.test(src.split('?')[0])) continue;
      return { src, title: page.title };
    }
    await sleep(400);
  }
  return null;
}

async function download(src, domain, slug) {
  const buf = Buffer.from(await (await get(src)).arrayBuffer());
  const ext = /\.png$/i.test(src.split('?')[0]) ? '.png' : '.jpg';
  const dir = path.join(UPLOADS, domain);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${slug}${ext}`), buf);
  return `/uploads/${domain}/${slug}${ext}`;
}

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// A bare product name often lands on a logo or a spec table, so each record
// gets a few photo-ish phrasings to fall through.
const VEHICLES = {
  'Toyota Hiace': ['Toyota HiAce van', 'Toyota HiAce'],
  'Toyota Fortuner': ['Toyota Fortuner SUV', 'Toyota Fortuner'],
  'Mitsubishi L300': ['Mitsubishi L300 van', 'Mitsubishi Delica van'],
  'Isuzu Traviz': ['Isuzu Traviz truck', 'Isuzu light truck'],
  'Ford Ranger': ['Ford Ranger pickup truck', 'Ford Ranger'],
  'Nissan Urvan': ['Nissan Caravan van', 'Nissan NV350']
};
const TOOLS = {
  'Tire Inflator': ['air compressor tyre inflator', 'tire inflator', 'air pump car'],
  'Impact Driver': ['impact wrench', 'impact driver tool', 'cordless impact wrench'],
  Multimeter: ['digital multimeter', 'multimeter'],
  'Socket Set': ['socket wrench set', 'socket set tools', 'socket wrench'],
  'Torque Wrench': ['torque wrench', 'torque wrench tool'],
  'Hydraulic Jack': ['hydraulic floor jack', 'trolley jack', 'car jack']
};
const PARTS = {
  Coolant: ['engine coolant', 'antifreeze coolant bottle', 'coolant reservoir'],
  'Wiper Blades': ['wiper blade', 'windscreen wiper arm', 'windshield wiper'],
  Battery: ['car battery', 'automotive battery'],
  'Spark Plugs': ['spark plug', 'spark plugs'],
  'Fan Belt': ['serpentine belt', 'v-belt engine', 'fan belt'],
  'Engine Oil': ['motor oil bottle', 'engine oil can', 'motor oil'],
  'Brake Fluid': ['brake fluid', 'brake fluid bottle'],
  'Brake Pads': ['brake pad', 'disc brake pads'],
  'Air Filter': ['air filter car', 'automotive air filter'],
  'Oil Filter': ['oil filter', 'oil filter automotive']
};

async function seed(domain, rows, nameOf, queriesOf, slugOf, hasPhoto, save) {
  const stats = { ok: 0, skipped: 0, failed: 0 };
  for (const row of rows) {
    const name = nameOf(row);
    if (!FORCE && hasPhoto(row)) {
      stats.skipped++;
      continue;
    }
    try {
      const hit = await findImage(queriesOf(name));
      if (!hit) throw new Error('nothing on Commons');
      await save(row, await download(hit.src, domain, slugOf(row)));
      console.log(`  ${domain.padEnd(12)} ${name.padEnd(18)} <- ${hit.title}`);
      stats.ok++;
    } catch (e) {
      console.log(`  ${domain.padEnd(12)} ${name.padEnd(18)} FAILED (${e.message})`);
      stats.failed++;
    }
    await sleep(700);
  }
  return stats;
}

const totals = { ok: 0, skipped: 0, failed: 0 };
const add = (s) => {
  totals.ok += s.ok;
  totals.skipped += s.skipped;
  totals.failed += s.failed;
};

add(
  await seed(
    'vehicles',
    await prisma.vehicle.findMany(),
    (v) => `${v.make} ${v.model}`,
    (name) => VEHICLES[name] ?? [`${name} vehicle`],
    (v) => slugify(v.licensePlate),
    (v) => (v.images?.length ?? 0) > 0,
    (v, p) => prisma.vehicle.update({ where: { id: v.id }, data: { images: [p] } })
  )
);
add(
  await seed(
    'tools',
    await prisma.tool.findMany(),
    (t) => t.name,
    (name) => TOOLS[name] ?? [name],
    (t) => slugify(t.name),
    (t) => Boolean(t.image),
    (t, p) => prisma.tool.update({ where: { id: t.id }, data: { image: p } })
  )
);
add(
  await seed(
    'spare-parts',
    await prisma.sparePart.findMany(),
    (s) => s.name,
    (name) => PARTS[name] ?? [name],
    (s) => slugify(s.name),
    (s) => Boolean(s.image),
    (s, p) => prisma.sparePart.update({ where: { id: s.id }, data: { image: p } })
  )
);

console.log(
  `\n${totals.ok} seeded, ${totals.skipped} already had one, ${totals.failed} failed`
);
await prisma.$disconnect();
