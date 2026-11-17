// Dialogs around the character sheet: making a new character and writing a
// custom ability. Levelling up is its own wizard (level-up.ts).

import { App, Modal, normalizePath, Notice, Setting, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../../../main';
import { bundledCompendium } from './compendium-data';
import { joinPath, safeName } from '../../core/campaign-model';
import { assignStats, fmtMod, Frontmatter, newCharacterFrontmatter, NewCharacterOptions, STAT_ARRAYS } from './character-def';

const SHEET_BODY = '```nimble-sheet\n```\n\n## Backstory\n\n\n## Notes\n\n';

/** Where new characters go: the active campaign's Party folder, else the vault root. */
export function defaultCharacterFolder(plugin: NimbleStatblocksPlugin): string {
	const c = plugin.campaigns?.active;
	return c ? normalizePath(`${c.folder}/Party`) : '';
}

/** Write a character note (frontmatter + sheet block + Backstory and Notes headings) and return it. */
export async function createCharacterNote(plugin: NimbleStatblocksPlugin, o: NewCharacterOptions, folder = defaultCharacterFolder(plugin)): Promise<TFile> {
	const app = plugin.app;
	const comp = bundledCompendium();
	const dir = folder ? normalizePath(folder) : '';
	if (dir && !app.vault.getFolderByPath(dir)) await app.vault.createFolder(dir);
	// Named the way every campaign note is (safeName), and never clashing with a note there, even by case.
	const path = plugin.campaigns.available(`${joinPath(dir, safeName(o.name.trim() || 'New hero'))}.md`);
	const file = await app.vault.create(path, SHEET_BODY);
	const data = newCharacterFrontmatter(o, comp);
	// The file name is the name; only write a title when they differ.
	if (data.title === file.basename) delete data.title;
	await app.fileManager.processFrontMatter(file, (fm: Frontmatter) => { Object.assign(fm, data); });
	return file;
}

// ----------------------------------------------------------------------------

export class NewCharacterModal extends Modal {
	private o: NewCharacterOptions = { name: '', array: 'Standard', mine: true };

	/** `initial` pre-fills the dialog: a party member is `{ mine: false }`, a name typed elsewhere carries over. */
	constructor(private plugin: NimbleStatblocksPlugin, private folder?: string, private onCreated?: (f: TFile) => void, initial: Partial<NewCharacterOptions> = {}) {
		super(plugin.app);
		Object.assign(this.o, initial);
	}

	onOpen(): void {
		const comp = bundledCompendium();
		this.modalEl.addClass('nimble-newchar-modal');
		this.titleEl.setText(this.o.mine ? 'New character' : 'New party member');
		const { contentEl } = this;
		const preview = createDiv({ cls: 'nimble-newchar-preview' });
		const draw = () => this.drawPreview(preview);

		new Setting(contentEl).setName('Name').addText(t => {
			t.setPlaceholder('Thorga Ironbrow').setValue(this.o.name).onChange(v => { this.o.name = v; });
			window.setTimeout(() => t.inputEl.focus(), 0);
			t.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') void this.create(); });
		});
		const pick = (name: string, options: string[], set: (v: string) => void) => new Setting(contentEl).setName(name).addDropdown(d => {
			d.addOption('', '—');
			for (const o of options) d.addOption(o, o);
			d.onChange(v => { set(v); draw(); });
		});
		pick('Ancestry', comp.ancestries.map(a => a.name), v => { this.o.ancestry = v || undefined; });
		pick('Class', comp.classes.map(c => `${c.name}${c.draft ? ' (draft)' : ''}`), v => { this.o.className = v.replace(/ \(draft\)$/, '') || undefined; });
		const arrays = comp.rules.statArrays?.length ? comp.rules.statArrays : STAT_ARRAYS;
		new Setting(contentEl).setName('Stats').setDesc('Highest to the class\'s key stats, lowest to its ▼ save.').addDropdown(d => {
			for (const a of arrays) d.addOption(a.name, `${a.name} (${a.values.map(v => fmtMod(v).replace('+0', '0')).join(', ')})`);
			d.setValue(this.o.array ?? 'Standard').onChange(v => { this.o.array = v; draw(); });
		});
		pick('Background', comp.backgrounds.map(b => b.name), v => { this.o.background = v || undefined; });
		new Setting(contentEl).setName('Level')
			.addText(t => {
				t.inputEl.type = 'number'; t.inputEl.min = '1'; t.inputEl.max = '20'; t.inputEl.inputMode = 'numeric';
				t.setValue(String(this.o.level ?? 1)).onChange(v => { this.o.level = Math.max(1, Math.min(20, parseInt(v, 10) || 1)); });
			});
		new Setting(contentEl).setName('Player').addText(t => t.setPlaceholder('Who plays them').onChange(v => { this.o.player = v.trim() || undefined; }));
		contentEl.appendChild(preview);
		draw();
		const where = this.folder ?? defaultCharacterFolder(this.plugin);
		new Setting(contentEl)
			.setDesc(`Saved in ${where || 'the vault root'}`)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Create').setCta().onClick(() => void this.create()));
	}

	private drawPreview(el: HTMLElement): void {
		const comp = bundledCompendium();
		el.empty();
		const cls = comp.classByName(this.o.className);
		const arrays = comp.rules.statArrays?.length ? comp.rules.statArrays : STAT_ARRAYS;
		const arr = arrays.find(a => a.name === this.o.array) ?? arrays[0];
		const stats = assignStats(arr.values, cls);
		const row = el.createDiv({ cls: 'nimble-newchar-stats' });
		for (const k of ['STR', 'DEX', 'INT', 'WIL'] as const) {
			const s = row.createDiv({ cls: `nimble-newchar-stat${cls?.saves?.adv === k ? ' is-adv' : cls?.saves?.dis === k ? ' is-dis' : ''}` });
			s.createDiv({ cls: 'nimble-newchar-stat-value', text: fmtMod(stats[k]).replace('+0', '0') });
			s.createDiv({ cls: 'nimble-newchar-stat-label', text: `${k}${cls?.saves?.adv === k ? ' ▲' : cls?.saves?.dis === k ? ' ▼' : ''}` });
		}
		if (cls) {
			el.createDiv({ cls: 'nimble-newchar-line', text: [`${cls.startingHp ?? 10} HP`, cls.hitDie ? `d${cls.hitDie} Hit Die` : '', cls.keyStats?.length ? `Key: ${cls.keyStats.join(', ')}` : ''].filter(Boolean).join(' · ') });
			if (cls.startingGear?.length) el.createDiv({ cls: 'nimble-newchar-line', text: `Gear: ${cls.startingGear.join(', ')}` });
			const mods = Object.entries(cls.skillMods ?? {}).filter(([, v]) => typeof v === 'number' && v !== 0);
			if (mods.length) el.createDiv({ cls: 'nimble-newchar-line', text: `Skills: ${mods.map(([k, v]) => `${fmtMod(v)} ${k}`).join(', ')}` });
		}
	}

	private async create(): Promise<void> {
		if (!this.o.name.trim()) { new Notice('Give your character a name first.'); return; }
		try {
			const file = await createCharacterNote(this.plugin, this.o, this.folder);
			this.close();
			if (this.onCreated) this.onCreated(file);
			else await this.app.workspace.getLeaf(false).openFile(file);
		} catch (e) {
			console.error('Nimble: could not create the character', e);
			new Notice('Couldn\'t create the character note.');
		}
	}

	onClose(): void { this.contentEl.empty(); }
}

// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------

export class CustomFeatureModal extends Modal {
	private name = '';
	private text = '';

	constructor(app: App, private done: (f: { name: string; text?: string }) => void) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText('Custom ability');
		new Setting(this.contentEl).setName('Name').addText(t => {
			t.setPlaceholder('Bear hug').onChange(v => { this.name = v; });
			window.setTimeout(() => t.inputEl.focus(), 0);
		});
		new Setting(this.contentEl).setName('What it does').addTextArea(t => {
			t.setPlaceholder('Rules text').onChange(v => { this.text = v; });
			t.inputEl.rows = 4;
		});
		new Setting(this.contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Add').setCta().onClick(() => {
				if (!this.name.trim()) { new Notice('Give it a name.'); return; }
				this.done({ name: this.name.trim(), text: this.text.trim() || undefined });
				this.close();
			}));
	}

	onClose(): void { this.contentEl.empty(); }
}
