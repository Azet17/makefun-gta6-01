// Neon Tide — Palmera Bay: the entrypoint (Node 22, stdlib only).
// Copies game/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with buildDossier from
// vendor/makefun-game.ts. Deterministic: the same repository always
// writes the same bytes, so the grader's two runs agree.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

function copyTree(name: string): void {
  const src = join(repoRoot, name);
  const dest = join(outputDir, name);
  if (!existsSync(src)) throw new Error(`main.ts: ${name}/ is missing from the repository`);
  cpSync(src, dest, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
// Start from an empty output directory so a stale file from an
// earlier run can never leak into the dossier.
for (const name of ['game', 'screenshots', 'dossier.json']) {
  const target = join(outputDir, name);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
copyTree('game');
copyTree('screenshots');

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
if (dossier.length === 0) throw new Error('main.ts: buildDossier wrote an empty dossier');
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Neon Tide — Palmera Bay: wrote ${outputDir}/dossier.json (${dossier.length} bytes)`);
