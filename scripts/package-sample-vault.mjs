// Builds Ember-Vault-Sample-Adventure.zip from sample-vault/: the vault plus the
// freshly built plugin in .obsidian/plugins/<id>/, enabled, so it opens ready
// to play. Run after `npm run build`. Used by the release workflow.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'sample-vault');
const OUT = join(ROOT, 'Ember-Vault-Sample-Adventure.zip');
const NAME = 'Ember Vault Sample Vault';

if (!existsSync(SRC)) { console.log('No sample-vault/ folder; skipping.'); process.exit(0); }
for (const f of ['main.js', 'manifest.json', 'styles.css']) {
	if (!existsSync(join(ROOT, f))) { console.error(`${f} missing: run npm run build first`); process.exit(1); }
}

const { id } = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'nimble-sample-'));
const vault = join(work, NAME);
cpSync(SRC, vault, { recursive: true });

const obsidian = join(vault, '.obsidian');
const plugin = join(obsidian, 'plugins', id);
mkdirSync(plugin, { recursive: true });
for (const f of ['main.js', 'manifest.json', 'styles.css']) cpSync(join(ROOT, f), join(plugin, f));
writeFileSync(join(obsidian, 'community-plugins.json'), JSON.stringify([id], null, 2));

rmSync(OUT, { force: true });
execFileSync('zip', ['-rqX', OUT, NAME, '-x', '*.DS_Store'], { cwd: work });
rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${OUT}`);
