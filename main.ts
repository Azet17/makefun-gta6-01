// Neon Tide — Palmera Bay. Entry program for make.fun gta6-01.
// Copies game/ and screenshots/ into the output directory and writes
// /output/dossier.json with buildDossier from vendor/makefun-game.ts.
// Node 22, standard library only. Never deletes the output directory:
// the grader mounts it, so files are only added or overwritten.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

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
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Neon Tide entry written to ${outDir} (${dossier.length} byte dossier)`);
