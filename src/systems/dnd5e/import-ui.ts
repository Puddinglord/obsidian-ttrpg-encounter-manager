// Import a D&D Beyond character… and Import a Fantasy Statblocks creature…:
// paste the text or choose the file, see what will come across (and what
// won't), then make the notes. A character also brings its class, subclass,
// species, background, feats, spells and items into the compendium: a
// checklist (import-content-ui.ts) under the character, ticked for what's new.
// Ember Vault never connects to D&D Beyond: the link box only shows the
// address of the character's data, for your browser.

import { Modal, normalizePath, Notice, setIcon, TFile } from 'obsidian';
import { homeFolder } from '../../core/builder/frame';
import { dialogFoot, gameDialog } from '../../core/dialog';
import { evIcon } from '../../core/icons';
import { ddbCharacterOf, ddbJsonUrl, DdbImport, importDdbCharacter } from './import-ddb';
import { renameInFrontmatter } from './import-ddb-content';
import { DdbContentChoice, wroteText } from './import-content-ui';
import { FsImport, importFantasyStatblocks } from './import-fstatblocks';
import { createCharacterNote5e } from './new-character';
import { STATBLOCK_LANG, toStatblockSource5e } from './parser';
import type { Dnd5eRuntime } from './runtime';

type Kind = 'ddb' | 'fs';

export class Import5eModal extends Modal {
	private text = '';
	private result: { ddb?: DdbImport; content?: DdbContentChoice; fs?: FsImport[]; error?: string } = {};
	private reportEl!: HTMLElement;
	private importBtn!: HTMLButtonElement;
	private shrink: (read: boolean) => void = () => {};

	constructor(private rt: Dnd5eRuntime, private kind: Kind) {
		super(rt.plugin.app);
	}

	onOpen(): void {
		const ddb = this.kind === 'ddb';
		gameDialog(this, 'dnd5e', { cls: 'nimble-import-content dnd5e-import' });
		this.titleEl.setText(ddb ? 'Import a D&D Beyond character' : 'Import a Fantasy Statblocks creature');
		const el = this.contentEl;
		if (ddb) {
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
		} else {
			el.createEl('p', { cls: 'nimble-import-lead', text: 'Paste a statblock block (from ```statblock to the closing ```), or choose a .json file of creatures.' });
		}
		const input = el.createDiv({ cls: 'nimble-import-pick' }).createEl('input', { type: 'file', attr: { accept: ddb ? '.json,.txt,.html,application/json' : '.json,.md,.yaml,.yml,.txt', 'aria-label': 'Choose a file' } });
		input.addEventListener('change', () => {
			const f = input.files?.[0];
			if (f) void f.text().then(t => { area.value = t; this.set(t); });
		});
		const area = el.createEl('textarea', { cls: 'nimble-import-text', attr: { rows: '8', placeholder: ddb ? 'Or paste the character\'s data here' : 'Or paste the creature here', spellcheck: 'false' } });
		area.addEventListener('input', () => this.set(area.value));
		// Once a character is read, its data steps back so what it brings is in view.
		this.shrink = (read) => { area.rows = read ? 3 : 8; };
		this.reportEl = el.createDiv({ cls: 'nimble-import-report' });
		this.importBtn = dialogFoot(el, { cancel: () => this.close(), main: { text: 'Import', icon: evIcon(ddb ? 'user-plus' : 'skull'), onClick: () => void this.import() } }).main;
		this.importBtn.disabled = true;
	}

	private set(text: string): void {
		this.text = text;
		this.result = {};
		if (text.trim()) {
			try {
				const edition = this.rt.edition(this.rt.plugin.campaigns.active?.home.path);
				if (this.kind === 'ddb') {
					const character = ddbCharacterOf(text);
					const ddb = this.result.ddb = importDdbCharacter(character);
					// What the character brings into the compendium, checked against the SRD for the rules it uses.
					this.result.content = new DdbContentChoice(this.rt, character, ddb.edition);
				} else this.result.fs = importFantasyStatblocks(text, { edition });
				if (this.result.fs && !this.result.fs.length) this.result.error = 'No creatures found in that.';
			} catch (e) {
				this.result.error = e instanceof Error ? e.message : String(e);
			}
		}
		this.shrink(!!this.result.ddb);
		this.report();
	}

	private report(): void {
		const el = this.reportEl;
		el.empty();
		const r = this.result;
		this.importBtn.disabled = !!r.error || (!r.ddb && !r.fs?.length);
		if (!this.text.trim()) return;
		const head = el.createDiv({ cls: `nimble-pack-head${r.error ? ' is-error' : ''}` });
		setIcon(head.createSpan({ cls: 'nimble-pack-icon' }), evIcon(r.error ? 'warning' : this.kind === 'ddb' ? 'user' : 'skull'));
		const t = head.createDiv();
		if (r.error) { t.createDiv({ cls: 'nimble-pack-summary', text: r.error }); return; }
		const notes: string[] = [];
		if (r.ddb) {
			const fm = r.ddb.frontmatter;
			t.createDiv({ cls: 'nimble-pack-name', text: r.ddb.name });
			const word = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
			t.createDiv({ cls: 'nimble-pack-summary', text: [`Level ${word(fm.level)} ${word(fm.class)}`.trim(), word(fm.species ?? fm.race), `${r.ddb.edition} rules`].filter(Boolean).join(' · ') });
			notes.push(...r.ddb.notes);
		} else if (r.fs) {
			t.createDiv({ cls: 'nimble-pack-name', text: r.fs.length === 1 ? r.fs[0].name : `${r.fs.length} creatures` });
			t.createDiv({ cls: 'nimble-pack-summary', text: r.fs.map(c => `${c.name} (CR ${c.monster.cr})`).slice(0, 12).join(', ') + (r.fs.length > 12 ? '…' : '') });
			for (const c of r.fs) notes.push(...c.notes.map(n => (r.fs!.length > 1 ? `${c.name}: ${n}` : n)));
		}
		if (notes.length) {
			const box = el.createDiv({ cls: 'nimble-pack-notes is-warning' });
			box.createDiv({ cls: 'nimble-pack-notes-title', text: 'Worth a look' });
			for (const n of notes.slice(0, 40)) box.createDiv({ cls: 'nimble-pack-note', text: n });
		}
		r.content?.render(el, () => {});
	}

	private async import(): Promise<void> {
		const r = this.result;
		const plugin = this.rt.plugin;
		try {
			if (r.ddb) {
				// The content first, so the sheet finds the class when it opens; then the character, by the names the vault has.
				const wrote = r.content ? await r.content.write() : { added: 0, updated: 0 };
				if (r.content) renameInFrontmatter(r.ddb.frontmatter, r.content.inVault());
				const c = plugin.campaigns.active;
				const f = await createCharacterNote5e(this.rt, r.ddb.frontmatter, r.ddb.name, c ? `${c.folder}/Party` : '');
				this.close();
				await plugin.app.workspace.getLeaf(false).openFile(f);
				const said = wroteText(wrote);
				new Notice(`Imported ${r.ddb.name}${said ? `, and ${said}` : ''}.`);
			} else if (r.fs?.length) {
				const files = await writeCreatures(this.rt, r.fs);
				this.close();
				if (files.length === 1) await plugin.app.workspace.getLeaf(false).openFile(files[0]);
				new Notice(files.length === 1 ? `Imported ${r.fs[0].name}.` : `Imported ${files.length} creatures into ${files[0].parent?.path ?? 'the vault'}.`);
			}
		} catch (e) {
			console.error('Ember Vault: import failed', e);
			new Notice(r.ddb ? 'Couldn\'t finish the import.' : 'Couldn\'t import it. Nothing was written.');
		}
	}
}

/** One note per creature, with its ```5e block, in the campaign's Monsters folder (else Bestiary). */
async function writeCreatures(rt: Dnd5eRuntime, list: FsImport[]): Promise<TFile[]> {
	const app = rt.plugin.app;
	const folder = normalizePath(homeFolder(rt.plugin, 'Monsters', 'Bestiary'));
	if (!app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
	const out: TFile[] = [];
	for (const c of list) {
		const safe = c.name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Creature';
		const path = rt.plugin.campaigns.available(`${folder}/${safe}.md`);
		const props = c.source ? `---\nsource: ${JSON.stringify(c.source)}\n---\n\n` : '';
		out.push(await app.vault.create(path, `${props}\`\`\`${STATBLOCK_LANG}\n${toStatblockSource5e(c.monster)}\n\`\`\`\n`));
	}
	return out;
}

export function registerImports5e(rt: Dnd5eRuntime): void {
	const plugin = rt.plugin;
	plugin.addCommand({ id: 'import-ddb-character', name: 'Import a D&D Beyond character…', icon: 'user-plus', callback: () => new Import5eModal(rt, 'ddb').open() });
	plugin.addCommand({ id: 'import-fantasy-statblocks', name: 'Import a Fantasy Statblocks creature…', icon: 'skull', callback: () => new Import5eModal(rt, 'fs').open() });
}
