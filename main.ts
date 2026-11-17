// Neon Tide — Palmera Bay. The entry program for make.fun gta6-01.
//
// It copies game/ and screenshots/ from the repository into the output
// directory and writes /output/dossier.json with buildDossier from
// vendor/makefun-game.ts. Node 22, standard library only.
//
// The output directory is never deleted: the grader mounts it, so this
// program only adds or overwrites files inside it.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

// MAKEFUN_OUTPUT_DIR stands in for /output outside the grader.
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// The dossier limits from the kit's RULES.txt: source text cap, screenshot
// count and size, and the game/ file-count and byte caps.
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function copyTree(name: string): void {
  const src = join(process.cwd(), name);
  const dst = join(outDir, name);
  if (!existsSync(src)) throw new Error(`missing ${name}/ in the repository`);
  mkdirSync(dst, { recursive: true });
  // cpSync overwrites matching files and leaves the rest alone; it never
  // removes the destination directory itself.
  cpSync(src, dst, { recursive: true, force: true });
}

mkdirSync(outDir, { recursive: true });
copyTree('game');
copyTree('screenshots');

const dossier = buildDossier(outDir, DOSSIER_OPTIONS);
if (!dossier || dossier.length === 0) throw new Error('buildDossier returned an empty dossier');
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Neon Tide entry written to ${outDir} (${dossier.length} byte dossier)`);
