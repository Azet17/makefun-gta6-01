// Neon Tide: Palmera Bay — the hand-in program (Node 22, stdlib only).
// It copies the static game and the screenshots beside this file into
// /output (or $MAKEFUN_OUTPUT_DIR outside the grader) and writes the
// dossier the judge reads, using the vendored make.fun library.
//
// Run it locally to check the bundle:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The dossier caps mirror the scorer's own limits (reference/gate.json):
// at most 4 screenshots of 256 KiB, at most 993 game files totalling
// 48 MiB, and a 160 KiB text budget for the source the judge reads.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Neon Tide handed in: game/ + screenshots/ copied to ${outDir}, dossier.json written.`);
