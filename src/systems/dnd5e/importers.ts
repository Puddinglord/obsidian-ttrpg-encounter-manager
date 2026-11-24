// 5e's importers, for Import… (core/import/dialog.ts):
// - Fantasy Statblocks: a ```statblock block, or a bestiary export, as monsters
//   in an import bundle (core plans and writes them like any other).
// - D&D Beyond: a character's JSON. It draws its own review: the character, and
//   what it brings into the compendium as a checklist (import-content-ui.ts).
//   Import makes the character note (unless that's unticked) and the content.
// Ember Vault never connects to D&D Beyond: the hint only shows the address of
// the character's data, for your browser.

import { setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { emptyBundle } from '../../core/import/bundle';
import type { CustomReview, Importer, ImportInput } from '../../core/import/importer';
import { inputText } from '../../core/import/importer';
import { evIcon } from '../../core/icons';
import { asEdition } from './editions';
import { ddbCharacterOf, ddbJsonUrl, importDdbCharacter } from './import-ddb';
import { renameInFrontmatter } from './import-ddb-content';
import { DdbContentChoice, wroteText } from './import-content-ui';
import { importFantasyStatblocks } from './import-fstatblocks';
import { createCharacterNote5e } from './new-character';
import { toStatblockSource5e } from './parser';
import type { Dnd5eRuntime } from './runtime';

const FS_KEYS = ['stats', 'hit_dice', 'cr', 'ac', 'hp', 'actions', 'traits', 'saves', 'skillsaves'];

export const fantasyStatblocksImporter: Importer = {
	id: 'fantasy-statblocks',
	label: 'Fantasy Statblocks',
	system: 'dnd5e',
	detect(input: ImportInput) {
		const text = inputText(input)?.trim();
		if (!text) return 0;
		if (/^\s*(`{3,}|~{3,})\s*statblock\b/m.test(text)) return 0.95;
		// A bestiary export, or the block's body by itself: named creatures with a stat block's keys.
		try {
			const creatures = importFantasyStatblocks(text);
			const keys = (c: { monster: object }) => Object.keys(c.monster).length;
			return creatures.length && creatures.every(c => keys(c) > 0) && FS_KEYS.filter(k => new RegExp(`(^|[\\s{,"])${k}["']?\\s*:`, 'm').test(text)).length >= 3 ? 0.6 : 0;
		} catch {
			return 0;
		}
	},
	read(input, ctx) {
		const plugin = ctx.plugin as EmberVaultPlugin;
		const edition = asEdition(plugin.edition(ctx.sourcePath));
		let list;
		try { list = importFantasyStatblocks(inputText(input) ?? '', { edition }); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
		if (!list.length) return { error: 'No creatures found in that.' };
		return {
			bundle: emptyBundle({
				system: 'dnd5e', edition, source: { name: 'Fantasy Statblocks' },
				content: list.map(c => ({ kind: 'monster', name: c.name, statblock: toStatblockSource5e(c.monster), ...(c.source ? { source: c.source } : {}) })),
			}),
			notes: list.flatMap(c => c.notes.map(n => (list.length > 1 ? `${c.name}: ${n}` : n))),
		};
	},
};

/** The link box: a character's page link to the address of its data. */
function ddbHint(el: HTMLElement): void {
	el.createEl('p', { cls: 'nimble-import-lead', text: 'Paste your character\'s link to get the address of its data. Open it in your browser, then copy everything it shows and paste it below. The character has to be public.' });
	const link = el.createEl('input', { type: 'text', cls: 'dnd5e-import-link', attr: { placeholder: 'https://www.dndbeyond.com/characters/123456789', 'aria-label': 'Character link', spellcheck: 'false' } });
	const out = el.createDiv({ cls: 'dnd5e-import-url' });
	link.addEventListener('input', () => {
		out.empty();
		const url = ddbJsonUrl(link.value);
		if (!link.value.trim()) return;
		if (!url) { out.setText('That doesn\'t look like a D&D Beyond character link.'); return; }
		const a = out.createEl('a', { text: 'Open the character\'s data', href: url, cls: 'external-link', attr: { target: '_blank', rel: 'noopener' } });
		a.setAttr('aria-label', url);
		out.createSpan({ cls: 'dnd5e-import-url-text', text: url });
	});
}

export const ddbImporter: Importer = {
		id: 'ddb-character',
		label: 'a D&D Beyond character',
		system: 'dnd5e',
		hint: ddbHint,
		detect(input) {
			const text = inputText(input)?.trim();
			if (!text || !/^[[{]/.test(text)) return 0;
			try { ddbCharacterOf(text); return 0.9; } catch (e) { return e instanceof Error && /D&D Beyond didn’t share/.test(e.message) ? 0.9 : 0; }
		},
		read(input, ctx) {
			const rt = (ctx.plugin as EmberVaultPlugin).runtime<Dnd5eRuntime>('dnd5e');
			if (!rt) return { error: '5e isn\'t loaded.' };
			let character: Record<string, unknown>;
			let ddb: ReturnType<typeof importDdbCharacter>;
			try {
				character = ddbCharacterOf(inputText(input) ?? '');
				ddb = importDdbCharacter(character);
			} catch (e) {
				return { error: e instanceof Error ? e.message : String(e) };
			}
			return { custom: ddbReview(rt, character, ddb) };
		},
};

function ddbReview(rt: Dnd5eRuntime, character: Record<string, unknown>, ddb: ReturnType<typeof importDdbCharacter>): CustomReview {
	// What the character brings into the compendium, checked against the SRD for the rules it uses.
	const content = new DdbContentChoice(rt, character, ddb.edition);
	// A character already in the party (an import again, for what it gained): only its content, unless asked.
	const c = rt.plugin.campaigns.active;
	const party = c ? `${c.folder}/Party` : '';
	const there = !!rt.plugin.app.vault.getFileByPath(`${party ? `${party}/` : ''}${ddb.name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim()}.md`);
	let makeNote = !there;
	return {
		action: 'Import',
		render(el, changed) {
			const head = el.createDiv({ cls: 'nimble-pack-head' });
			setIcon(head.createSpan({ cls: 'nimble-pack-icon' }), evIcon('user'));
			const t = head.createDiv();
			const fm = ddb.frontmatter;
			const word = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
			t.createDiv({ cls: 'nimble-pack-name', text: ddb.name });
			t.createDiv({ cls: 'nimble-pack-summary', text: [`Level ${word(fm.level)} ${word(fm.class)}`.trim(), word(fm.species ?? fm.race), `${ddb.edition} rules`].filter(Boolean).join(' · ') });
			const toggle = el.createEl('label', { cls: 'ev-import-toggle' });
			const box = toggle.createEl('input', { type: 'checkbox', attr: { 'data-k': 'character-note' } });
			box.checked = makeNote;
			box.addEventListener('change', () => { makeNote = box.checked; changed(); });
			toggle.createSpan({ text: there ? `Make another character note (${ddb.name} is already in the party)` : 'Make a character note in the party' });
			if (ddb.notes.length) {
				const n = el.createDiv({ cls: 'nimble-pack-notes is-warning' });
				n.createDiv({ cls: 'nimble-pack-notes-title', text: 'Worth a look' });
				for (const x of ddb.notes.slice(0, 40)) n.createDiv({ cls: 'nimble-pack-note', text: x });
			}
			if (!content.plan.length && !makeNote) el.createDiv({ cls: 'dnd5e-ddb-none', text: 'Nothing to add: D&D Beyond gave only names for this character.' });
			content.render(el, changed);
		},
		chosen: () => (makeNote ? 1 : 0) + content.chosen().length,
		async add() {
			const plugin = rt.plugin;
			// The content first, so the sheet finds the class when it opens; then the character, by the names the vault has.
			const wrote = await content.write();
			const said = wroteText(wrote);
			if (!makeNote) return said ? `${said.charAt(0).toUpperCase()}${said.slice(1)}.` : 'Nothing to add.';
			renameInFrontmatter(ddb.frontmatter, content.inVault());
			const f = await createCharacterNote5e(rt, ddb.frontmatter, ddb.name, party);
			await plugin.app.workspace.getLeaf(false).openFile(f);
			return `Imported ${ddb.name}${said ? `, and ${said}` : ''}.`;
		},
	};
}
