import { cp, mkdir } from 'node:fs/promises';
for (const directory of ['wasm', 'cmaps', 'standard_fonts']) {
  const source = new URL(`../node_modules/pdfjs-dist/${directory}/`, import.meta.url);
  const target = new URL(`../public/pdfjs/${directory}/`, import.meta.url);
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true });
}
