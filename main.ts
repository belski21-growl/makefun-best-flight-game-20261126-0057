// Badai Garuda — flight-game entrypoint (Node 22, no arguments, exit 0).
//
// What this program does, in order:
//   1. Copies the playable game in game/ from the repository into the
//      output directory, recursively and unchanged.
//   2. Copies exactly four screenshots into <output>/screenshots — the
//      four the dossier cap allows. The other two shots in the repo
//      (5-debrief.jpg, 6-title.jpg) stay in the repository as evidence
//      and are deliberately NOT copied: the scorer refuses an output
//      screenshots/ holding more than the cap.
//   3. Writes <output>/dossier.json through the scorer's own
//      buildDossier, with the caps the scorer hands out. The caps are
//      the scorer's numbers, not ours — never tune them here.
//
// Directories come from the environment the grader sets:
// MAKEFUN_BOT_DIR (the repository root) and MAKEFUN_OUTPUT_DIR (the
// empty writable output directory). Both fall back to the entrypoint's
// own directory and to /output when unset.

import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDossier } from './vendor/makefun-game.ts';

// The four dossier screenshots, in dossier order. The first by name is
// the cover. Keep this list at exactly four: the screenshots cap is 4.
const DOSSIER_SHOTS = ['1-hero.jpg', '2-cockpit.jpg', '3-storm.jpg', '4-landing.jpg'];

// The scorer's caps, verbatim from its gate. Do not change these numbers.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const botDir = process.env.MAKEFUN_BOT_DIR ?? dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const gameSrc = join(botDir, 'game');
const gameDst = join(outDir, 'game');
const shotsSrc = join(botDir, 'screenshots');
const shotsDst = join(outDir, 'screenshots');

mkdirSync(outDir, { recursive: true });
mkdirSync(shotsDst, { recursive: true });

cpSync(gameSrc, gameDst, { recursive: true });

// Fail fast with a named shot instead of a bare ENOENT mid-copy: every
// dossier shot must exist in the repo before any of them is copied.
for (const shot of DOSSIER_SHOTS) {
  const src = join(shotsSrc, shot);
  if (!existsSync(src)) {
    throw new Error(`dossier screenshot missing from repo: screenshots/${shot}`);
  }
  copyFileSync(src, join(shotsDst, shot));
}

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, DOSSIER_CAPS));
