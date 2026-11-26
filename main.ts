// Merpati Kilat — entrypoint make.fun (Node 22, stdlib only, tanpa network).
// Tugas: salin game/ + screenshots/ dari repo ke direktori output, lalu tulis
// /output/dossier.json dengan buildDossier dari vendor/makefun-game.ts.
// Di luar grader, MAKEFUN_OUTPUT_DIR menggantikan /output.
// Erasable TypeScript only: tanpa enum, namespace, atau parameter properties.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const outDir: string = process.env.MAKEFUN_OUTPUT_DIR || '/output';
// Repo root = direktori yang memuat main.ts ini (import.meta.url menunjuk ke
// file ini, jadi '.' adalah root repo baik saat dijalankan dari repo maupun
// dari salinan grader).
const repoDir: string = new URL('.', import.meta.url).pathname;

function copyEntryDir(name: string): void {
  const src: string = join(repoDir, name);
  const dest: string = join(outDir, name);
  if (!existsSync(src)) {
    throw new Error('Direktori entry tidak ditemukan di repo: ' + src);
  }
  cpSync(src, dest, { recursive: true });
}

mkdirSync(outDir, { recursive: true });
copyEntryDir('game');
copyEntryDir('screenshots');

const dossier: string = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 4 * 1024 * 1024 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log('dossier.json ditulis: ' + join(outDir, 'dossier.json'));
