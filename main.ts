// Solar Coast — make.fun entry point (Node 22, stdlib only).
//
// This file assembles the final submission: it copies the game/ directory and
// screenshots/ into the output folder, then writes dossier.json using the
// vendored make.fun library. The game itself is a three.js open-world that
// runs with zero network calls — every asset lives under game/.
//
// Usage:
//   MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
//
// Serve locally for testing:
//   node serve.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Scorer gate parameters — must stay within the bounds the grader enforces.
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
