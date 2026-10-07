import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const folder of ['js', 'scripts', 'tests']) {
  for (const name of await readdir(new URL(`../${folder}/`, import.meta.url))) {
    if (!name.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', `${root}${folder}/${name}`], { encoding: 'utf8' });
    if (result.status) throw new Error(result.stderr);
  }
}
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url)));
for (const icon of manifest.icons) await access(new URL(`../${icon.src}`, import.meta.url));
console.log('JavaScript syntax and manifest asset checks passed.');
