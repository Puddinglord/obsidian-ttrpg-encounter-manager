// Upgrade check: a vault used with a released version, then opened by this build. Everyone's data has to come
// through: the plugin's saved settings (party, fights, roll log, campaigns, preferences), every note unchanged, and
// everything still drawing without an error.
//
//   node e2e/upgrade.mjs           the latest release on GitHub
//   node e2e/upgrade.mjs 1.6.1     a given release
//
// The vault is that release's own sample vault plus its e2e fixtures (both from its git tag). Phase 1 installs the
// release's main.js, manifest.json and styles.css (gh release download) and uses it the way a table would: a party
// from the sheets, a fight in progress with hurt monsters and conditions, rolls, a changed setting, a hero's HP
// edited, campaigns switched. Phase 2 opens that vault with this build (npm run build first) and compares.
// Both run hidden, like the rest of e2e. Exits 1 if anything was lost or broke.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { launchObsidian, ROOT } from './harness.mjs';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const version = process.argv[2] || run('gh', ['release', 'view', '--json', 'tagName', '-q', '.tagName']);
const work = join(tmpdir(), `ev-upgrade-${version}`);
rmSync(work, { recursive: true, force: true });
const pluginDir = join(work, 'plugin'), src = join(work, 'src'), vault = join(work, 'vault');
mkdirSync(pluginDir, { recursive: true }); mkdirSync(src, { recursive: true });

console.log(`Upgrade from ${version} to this build`);
run('gh', ['release', 'download', version, '-p', 'main.js', '-p', 'manifest.json', '-p', 'styles.css', '-D', pluginDir, '--clobber']);
try { run('git', ['fetch', '-q', 'origin', 'tag', version]); } catch { /* the tag may already be here */ }
run('git', ['archive', '-o', join(work, 'src.tar'), version, 'sample-vault', 'e2e/fixtures/vault']);
run('tar', ['-x', '-f', join(work, 'src.tar'), '-C', src]);
cpSync(join(src, 'sample-vault'), vault, { recursive: true });
for (const f of readdirSync(join(src, 'e2e/fixtures/vault'))) if (f !== '.obsidian') cpSync(join(src, 'e2e/fixtures/vault', f), join(vault, f), { recursive: true });

/** The notes both phases open, and what each draws: its text and any error box in it. */
const SHOWN = ['Campaigns/The Old Quarter/Party/Brakka.md', 'Bestiary/Goblin Boss.md', 'Hand-written Bear.md', 'Encounters.md', 'Campaigns/The Old Quarter/The Old Quarter.md', 'Edge Cases.md', 'Characters/Thorga Ironbrow.md'];
async function shown(o, path) {
	await o.eval(async (app, _p, path) => { const f = app.vault.getAbstractFileByPath(path); if (f) await app.workspace.getLeaf(false).openFile(f, { state: { mode: 'preview' } }); }, path);
	await o.page.waitForTimeout(900);
	return o.page.evaluate(() => {
		const v = document.querySelector('.workspace-leaf.mod-active .markdown-reading-view');
		return { text: v?.innerText ?? '', errors: [...(v?.querySelectorAll('.nimble-error, .ev-error, .callout[data-callout="error"]') ?? [])].map(e => e.textContent.trim().slice(0, 100)) };
	});
}

/** Every note's text, by path (the .obsidian folder aside). */
function notes(root) {
	const out = {};
	const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (f === '.obsidian' || f === '.trash') continue; if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.md')) out[relative(root, p)] = createHash('sha1').update(readFileSync(p)).digest('hex'); } };
	walk(root);
	return out;
}

const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`  ${ok ? '✓' : '✗'} ${what}`); };

// ---------------------------------------------------------------------------
// 1. The release, used.
console.log(`\n1. ${version}: a party, a fight in progress, rolls, a setting, a hero's HP, campaigns switched`);
let before;
{
	const o = await launchObsidian({ vaultDir: vault, pluginFrom: pluginDir });
	try {
		await o.page.waitForTimeout(2500);
		await o.waitFor(() => o.eval((app, plugin) => !!plugin?.campaigns?.campaigns?.length), { what: 'the campaigns indexed' });
		await o.eval(async (app, plugin) => {
			await plugin.campaigns.setActive("Campaigns/Brakka's Journal");
			await plugin.campaigns.setActive('Campaigns/The Old Quarter');
			plugin.syncPartyFromSheets();
			const st = plugin.encounters;
			const enc = st.ensureActive();
			st.addParty(enc.id);
			st.add(plugin.index.get('Quicksilver Hound').monster, undefined, 3, enc.id);
			st.start(enc.id);
			const by = (label) => enc.creatures.find(c => c.label === label);
			st.setHp(enc.id, by('Quicksilver Hound-1').id, 9);
			st.setHp(enc.id, by('Quicksilver Hound-2').id, 0);
			st.addCondition(enc.id, by('Brakka').id, 'Dazed', { rounds: 2 });
			st.setDone(enc.id, by('Wren').id, true);
			st.setActions?.(enc.id, by('Brakka').id, 2);
			for (const [e, l] of [['1d20+3', 'Brakka · STR save'], ['2d6', 'Hound bite'], ['1d12+3', 'Battleaxe']]) plugin.rollDice(e, l, 'effect');
			plugin.settings.statblockStyle = 'compact';
			plugin.settings.dice3d = false;
			await plugin.saveSettings();
			const brakka = app.vault.getAbstractFileByPath('Campaigns/The Old Quarter/Party/Brakka.md');
			if (brakka) await app.fileManager.processFrontMatter(brakka, fm => { fm.hp = 15; });
		});
		await o.page.waitForTimeout(2000);
		// What the release draws for each note, errors and all (a fixture may hold a broken block on purpose).
		before = { drawn: {} };
		for (const path of SHOWN) if (existsSync(join(o.vault, path))) before.drawn[path] = await shown(o, path);
		await o.eval((app, plugin) => plugin.saveSettings());
		await o.page.waitForTimeout(800);
		cpSync(o.vault, vault, { recursive: true });
		Object.assign(before, { data: JSON.parse(readFileSync(join(vault, '.obsidian/plugins/nimble-gm/data.json'), 'utf8')), notes: notes(vault) });
		const enc = before.data.encounters?.find(e => e.id === before.data.activeEncounterId);
		console.log(`  saved: ${Object.keys(before.data).length} settings, ${before.data.party?.length ?? 0} heroes, a fight of ${enc?.creatures?.length ?? 0} in round ${enc?.round ?? '?'}, ${before.data.rollLog?.length ?? 0} rolls, ${Object.keys(before.notes).length} notes`);
		check(!!enc && enc.creatures.length >= 6, 'the release saved a fight in progress');
		check((before.data.rollLog?.length ?? 0) >= 3, 'the release saved its rolls');
	} finally { await o.close(); }
}

// ---------------------------------------------------------------------------
// 2. This build, on the same vault.
console.log('\n2. This build on the same vault');
{
	const o = await launchObsidian({ vaultDir: vault });
	try {
		await o.page.waitForTimeout(3000);
		await o.waitFor(() => o.eval((app, plugin) => !!plugin?.campaigns?.campaigns?.length), { what: 'the campaigns indexed' });
		const now = await o.eval((app, plugin) => JSON.parse(JSON.stringify(plugin.settings)));
		const old = before.data;
		// Every setting the release saved is still there with the same value; this build only adds.
		const changed = Object.keys(old).filter(k => k !== 'spotlightOffered' && JSON.stringify(now[k]) !== JSON.stringify(old[k]));
		for (const k of changed) {
			const a = JSON.stringify(old[k]) ?? 'undefined', b = JSON.stringify(now[k]) ?? 'undefined';
			console.log(`    ${k}: ${a.length > 160 ? a.slice(0, 160) + '…' : a}\n      → ${b.length > 160 ? b.slice(0, 160) + '…' : b}`);
		}
		check(changed.length === 0, `every saved setting kept as it was${changed.length ? ` (changed: ${changed.join(', ')})` : ''}`);

		// The fight: everyone, their HP and conditions, whose turn, the round.
		const enc = now.encounters?.find(e => e.id === now.activeEncounterId);
		const oldEnc = old.encounters.find(e => e.id === old.activeEncounterId);
		const sig = (e) => e?.creatures.map(c => `${c.label} ${c.currentHp}/${c.maxHp} ${(c.conditions ?? []).map(x => `${x.name}${x.rounds ? `:${x.rounds}` : ''}`).join('+')}`).join(' | ');
		check(!!enc && sig(enc) === sig(oldEnc) && enc.round === oldEnc.round && enc.phase === oldEnc.phase, 'the fight in progress, as it was');

		// Each campaign keeps its own fight now (the release kept one for the vault): going to another campaign and back
		// brings this one back, party and all.
		await o.eval(async (app, plugin) => { await plugin.campaigns.setActive("Campaigns/Brakka's Journal"); await plugin.campaigns.setActive('Campaigns/The Old Quarter'); });
		await o.page.waitForTimeout(800);
		const back = await o.eval((app, plugin) => JSON.parse(JSON.stringify(plugin.settings)));
		const backEnc = back.encounters?.find(e => e.id === back.activeEncounterId);
		check(sig(backEnc) === sig(oldEnc) && JSON.stringify(back.party) === JSON.stringify(old.party), 'to another campaign and back: the same fight and party');

		// The tracker draws it.
		await o.eval(async (app, plugin) => { await plugin.openTracker?.(); });
		await o.page.waitForTimeout(1200);
		const rows = await o.page.locator('.nimble-encounter-tracker .creature-item, .nimble-encounter-tracker .creature-label').count();
		check(rows >= 6, `the tracker shows the fight (${rows} rows)`);

		// Notes: a hero's sheet with the HP the release wrote, stat blocks, an encounter block, the campaign home. Each
		// draws, with no error the release didn't show too.
		for (const path of Object.keys(before.drawn)) {
			const r = await shown(o, path), was = before.drawn[path];
			const fresh = r.errors.filter(e => !was.errors.includes(e));
			const hp = path.endsWith('Brakka.md') ? /\b15\b/.test(r.text) : true;
			check(r.text.length > 40 && !fresh.length && hp, `${path} draws${path.endsWith('Brakka.md') ? ', with the HP the release wrote' : ''}${was.errors.length ? ` (as before: ${was.errors.length} error box${was.errors.length === 1 ? '' : 'es'})` : ''}${fresh.length ? ` (new: ${fresh.join('; ')})` : ''}`);
		}

		// Nothing in the vault was rewritten by opening it.
		await o.page.waitForTimeout(2500);
		await o.eval((app, plugin) => plugin.saveSettings());
		await o.page.waitForTimeout(800);
		const after = notes(o.vault);
		const edited = Object.keys(before.notes).filter(p => after[p] !== before.notes[p]);
		check(edited.length === 0, `no note changed by opening the vault${edited.length ? ` (${edited.join(', ')})` : ''}`);
		const saved = JSON.parse(readFileSync(join(o.vault, '.obsidian/plugins/nimble-gm/data.json'), 'utf8'));
		const lost = Object.keys(old).filter(k => !(k in saved));
		check(lost.length === 0, `saved again, every setting is still in data.json${lost.length ? ` (lost: ${lost.join(', ')})` : ''}`);

		const errors = o.consoleErrors.filter(e => !/net::ERR_|favicon/.test(e));
		check(errors.length === 0, `no console errors${errors.length ? `:\n      ${errors.slice(0, 5).join('\n      ')}` : ''}`);
	} finally { await o.close(); }
}

console.log(problems.length ? `\n${problems.length} problem${problems.length === 1 ? '' : 's'} upgrading from ${version}` : `\nUpgrade from ${version}: everything came through`);
process.exit(problems.length ? 1 : 0);
