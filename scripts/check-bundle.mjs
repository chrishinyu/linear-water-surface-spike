import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const assets = join(process.cwd(), 'dist', 'assets');
const names = await readdir(assets);
const javascript = names.filter((name) => name.endsWith('.js'));
const three = javascript.filter((name) => /^three-[\w-]+\.js$/.test(name));
if (three.length !== 1) {
  throw new Error(`Expected one isolated Three.js chunk, found ${three.length}.`);
}

const gzipBytes = async (name) => gzipSync(await readFile(join(assets, name))).length;
const sizes = await Promise.all(javascript.map(async (name) => ({ name, gzip: await gzipBytes(name) })));
const threeBytes = sizes.find(({ name }) => three.includes(name)).gzip;
const applicationBytes = sizes
  .filter(({ name }) => !three.includes(name))
  .reduce((sum, asset) => sum + asset.gzip, 0);
const limit = 150 * 1024;

for (const { name, gzip } of sizes) {
  console.log(`${name}: ${(gzip / 1024).toFixed(1)} KiB gzip`);
}
console.log(`Application plus non-Three.js JS: ${(applicationBytes / 1024).toFixed(1)} KiB gzip (limit 150 KiB)`);
console.log(`Three.js dependency: ${(threeBytes / 1024).toFixed(1)} KiB gzip, reported separately`);
console.log(`Total JS transfer: ${((applicationBytes + threeBytes) / 1024).toFixed(1)} KiB gzip`);
if (applicationBytes > limit) {
  throw new Error(`Application plus non-Three.js JavaScript exceeds the 150 KiB gzip budget.`);
}
