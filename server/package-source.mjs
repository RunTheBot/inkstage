import JSZip from 'jszip';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const zip = new JSZip();
const ignored = new Set(['node_modules', 'build', '.gradle', '.kotlin', 'local.properties']);
async function add(relative) {
  const full = path.join(root, relative);
  const info = await readdir(full, { withFileTypes: true });
  for (const entry of info) {
    if (ignored.has(entry.name)) continue;
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) await add(name);
    else zip.file(name, await readFile(path.join(full, entry.name)));
  }
}
for (const dir of ['src', 'server', 'shared', 'tests', 'public', 'android']) await add(dir);
for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'start.ps1', 'README.md', '.gitignore']) zip.file(file, await readFile(path.join(root, file)));
await writeFile(path.resolve(root, '../Inkstage-source.zip'), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('Source archive includes the Android client, excluding build caches and session data.');
