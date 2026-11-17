// New 5e character: name, class, species (race in 2014), background, level and
// ability scores (the standard array, set out for the class), then a character
// note with a ```5e-sheet block.

import { Modal, normalizePath, Setting, stringifyYaml, TFile } from 'obsidian';
import type { NewCharacterRequest } from '../contract';
import { newCharacterFm, STANDARD_ARRAY } from './character';
import { compendium5e } from './compendium';
import type { Dnd5eEdition } from './editions';
import type { Dnd5eRuntime } from './runtime';
import { SHEET_LANG } from './sheet';
import { ABILITIES, ABILITY_NAME, AbilityKey } from './types';

const ABILITY_OF: Record<string, AbilityKey> = { STR: 'str', DEX: 'dex', CON: 'con', INT: 'int', WIS: 'wis', CHA: 'cha' };

/** The standard array for a class: its saving throw abilities first, Con next, the rest after. */
export function arrayFor(saves: string[]): Record<AbilityKey, number> {
	const order = [...saves.map(s => ABILITY_OF[s]).filter(Boolean), 'con' as AbilityKey];
	for (const a of ['dex', 'str', 'wis', 'int', 'cha'] as AbilityKey[]) if (!order.includes(a)) order.push(a);
	const unique = [...new Set(order)];
	return Object.fromEntries(unique.map((a, i) => [a, STANDARD_ARRAY[i]])) as Record<AbilityKey, number>;
}

/** Write a 5e character note. */
export async function createCharacterNote5e(rt: Dnd5eRuntime, fm: Record<string, unknown>, name: string, folder?: string): Promise<TFile> {
	const app = rt.plugin.app;
	const dir = folder ? normalizePath(folder) : '';
	if (dir && !app.vault.getFolderByPath(dir)) await app.vault.createFolder(dir);
	const safe = name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'New hero';
	const path = rt.plugin.campaigns.available(normalizePath(`${dir ? `${dir}/` : ''}${safe}.md`));
	return app.vault.create(path, `---\n${stringifyYaml(fm)}---\n\n\`\`\`${SHEET_LANG}\n\`\`\`\n\n## Notes\n`);
}

export class Dnd5eNewCharacterModal extends Modal {
	private name = '';
	private className: string;
	private species: string;
	private background: string;
	private level: number;
	private scores: Record<AbilityKey, number>;
	private edition: Dnd5eEdition;

	constructor(private rt: Dnd5eRuntime, private r: NewCharacterRequest) {
		super(rt.plugin.app);
		this.edition = rt.edition(r.folder ?? rt.plugin.campaigns.active?.home.path);
		const c = compendium5e(this.edition);
		this.className = c.classes[0]?.name ?? '';
		this.species = c.species[0]?.name ?? '';
		this.background = c.backgrounds[0]?.name ?? '';
		this.level = Math.max(1, r.level ?? 1);
		this.name = r.name ?? '';
		this.scores = arrayFor(c.classes[0]?.saves ?? []);
	}

	onOpen(): void {
		this.titleEl.setText(`New 5e character (${this.edition} rules)`);
		this.modalEl.addClass('dnd5e-new-character');
		this.draw();
	}

	private draw(): void {
		const el = this.contentEl;
		el.empty();
		const c = compendium5e(this.edition);
		new Setting(el).setName('Name').addText(t => { t.setValue(this.name).setPlaceholder('e.g. Ilse Vane').onChange(v => { this.name = v; }); window.setTimeout(() => t.inputEl.focus(), 0); });
		new Setting(el).setName('Class').addDropdown(d => {
			for (const k of c.classes) d.addOption(k.name, `${k.name} (d${k.hitDie})`);
			d.setValue(this.className).onChange(v => { this.className = v; this.scores = arrayFor(c.classes.find(k => k.name === v)?.saves ?? []); this.draw(); });
		});
		const speciesNames = c.species.flatMap(s => s.subspecies.length && this.edition === '2014' ? s.subspecies.map(x => x.name) : [s.name]);
		new Setting(el).setName(this.edition === '2014' ? 'Race' : 'Species').addDropdown(d => {
			for (const n of speciesNames) d.addOption(n, n);
			if (!speciesNames.includes(this.species)) this.species = speciesNames[0] ?? '';
			d.setValue(this.species).onChange(v => { this.species = v; });
		});
		new Setting(el).setName('Background').addDropdown(d => {
			for (const b of c.backgrounds) d.addOption(b.name, b.name);
			d.setValue(this.background).onChange(v => { this.background = v; });
		});
		new Setting(el).setName('Level').addText(t => { t.inputEl.type = 'number'; t.inputEl.min = '1'; t.inputEl.max = '20'; t.setValue(String(this.level)).onChange(v => { this.level = Math.max(1, Math.min(20, parseInt(v, 10) || 1)); }); });
		const scores = el.createDiv({ cls: 'dnd5e-new-scores' });
		scores.createDiv({ cls: 'setting-item-description', text: this.edition === '2014'
			? 'The standard array, set out for the class. Add your race’s bonuses.'
			: 'The standard array, set out for the class. Add your background’s +2 and +1 (or three +1s).' });
		const grid = scores.createDiv({ cls: 'dnd5e-new-score-grid' });
		for (const a of ABILITIES) {
			const cell = grid.createDiv({ cls: 'dnd5e-new-score' });
			cell.createDiv({ text: ABILITY_NAME[a] });
			const i = cell.createEl('input', { type: 'number', attr: { min: '1', max: '30', 'aria-label': ABILITY_NAME[a] } });
			i.value = String(this.scores[a]);
			i.onchange = () => { this.scores[a] = Math.max(1, Math.min(30, parseInt(i.value, 10) || 10)); };
		}
		new Setting(el)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Create character').setCta().onClick(() => void this.create()));
	}

	private async create(): Promise<void> {
		const name = this.name.trim() || 'New hero';
		this.close();
		const fm = newCharacterFm({ name, className: this.className, level: this.level, species: this.species, background: this.background, scores: this.scores, mine: this.r.mine, edition: this.edition });
		const folder = this.r.folder ?? (this.rt.plugin.campaigns.active ? undefined : '');
		const f = await createCharacterNote5e(this.rt, fm, name, folder ?? this.defaultFolder());
		if (this.r.onCreated) this.r.onCreated(f);
		else await this.rt.plugin.app.workspace.getLeaf(false).openFile(f);
	}

	/** The active campaign's Party folder, else the vault root. */
	private defaultFolder(): string {
		const c = this.rt.plugin.campaigns.active;
		return c ? `${c.folder}/Party` : '';
	}
}
