// main.ts — entrypoint "Merpati Kilat" (probe r4): Node 22, tanpa argumen, exit 0.
// Menyalin game/ + screenshots/ dari repo ke MAKEFUN_OUTPUT_DIR (di luar grader: /output)
// dan menulis /output/dossier.json dengan buildDossier dari vendor/makefun-game.ts.
// Game: static files offline (game/index.html + ES module three.js vendored lokal
// di game/vendor/three.module.min.js via import map — NOL network request).
// Ditulis fresh dari kontrak entrypoint game-design-r4.md.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Caps gate (reference/gate.json): hanya text_max_bytes membentuk bytes; yang lain
// menolak entry yang scorer akan tolak (lebih dari 4 screenshot atau satu di atas
// 256 KiB; game/ lebih dari 993 file atau 48 MiB, atau path di atas 1000 byte).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
