import { cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const src = path.resolve(projectRoot, '..', 'site', 'dist', 'public');
const dst = path.resolve(projectRoot, 'public', '__marketing');

if (!existsSync(src)) {
  console.error(`[copy-marketing] source not found: ${src}`);
  console.error('[copy-marketing] run the marketing site build first');
  process.exit(1);
}

if (existsSync(dst)) {
  rmSync(dst, { recursive: true, force: true });
}

cpSync(src, dst, { recursive: true });
console.log(`[copy-marketing] copied ${src} -> ${dst}`);
