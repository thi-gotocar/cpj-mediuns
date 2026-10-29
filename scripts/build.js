// Build do frontend para a Vercel: copia frontend/ e shared/ para dist/.
// Não há compilação: o navegador carrega os módulos JS direto.

import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');

await rm(DIST, { recursive: true, force: true });
await cp(path.join(RAIZ, 'frontend'), DIST, { recursive: true });
await cp(path.join(RAIZ, 'shared'), path.join(DIST, 'shared'), { recursive: true });
console.log('Frontend pronto em dist/');
