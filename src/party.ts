// The party editor: one component used by the settings tab and the quick
// "Edit party" modal (opened from /party, the tracker menu and encounter blocks).

import { App, Modal, Notice, setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { uid } from './types';

export function renderPartyEditor(container: HTMLElement, plugin: NimbleStatblocksPlugin, rerender: () => void): void {
	const party = plugin.settings.party;
	const save = async () => {
		await plugin.saveSettings();
		plugin.encounters.trigger('changed');
		plugin.rerenderNotes();
	};
	const table = container.createDiv({ cls: 'nimble-party-table', attr: { role: 'table', 'aria-label': 'Party' } });
	const head = table.createDiv({ cls: 'nimble-party-head', attr: { role: 'row' } });
	for (const [text, title] of [['Name', ''], ['Class', ''], ['Lvl', 'Level'], ['HP', 'Max HP'], ['DEF', 'Defense'], ['Wounds', 'Max Wounds (default 6)'], ['', '']]) {
		head.createDiv({ text, attr: { role: 'columnheader', title } });
	}
	party.forEach((hero, i) => {
		const row = table.createDiv({ cls: 'nimble-party-row', attr: { role: 'row' } });
		// Each input sits in a label so narrow screens can show it as a card with field names.
		const field = (short: string, key: string) => {
			const f = row.createEl('label', { cls: `nimble-party-field field-${key}` });
			f.createSpan({ cls: 'nimble-party-field-label', text: short });
			return f;
		};
		const text = (value: string, placeholder: string, label: string, set: (v: string) => void) => {
			const input = field(placeholder, label).createEl('input', { type: 'text', value, attr: { placeholder, 'aria-label': `${hero.name} ${label}` } });
			input.addEventListener('change', async () => { set(input.value.trim()); await save(); });
		};
		const num = (value: number | undefined, placeholder: string, label: string, set: (n: number | undefined) => void) => {
			const short = ({ level: 'Lvl', 'max HP': 'HP', Defense: 'DEF', 'max Wounds': 'Wounds' } as Record<string, string>)[label] ?? label;
			const input = field(short, label.replace(/\s+/g, '-').toLowerCase()).createEl('input', { type: 'number', cls: 'nimble-party-num', value: value !== undefined ? String(value) : '', attr: { placeholder, 'aria-label': `${hero.name} ${label}`, min: '0', inputmode: 'numeric' } });
			input.addEventListener('change', async () => { const n = parseInt(input.value, 10); set(Number.isFinite(n) ? n : undefined); await save(); });
		};
		text(hero.name, 'Name', 'name', v => { hero.name = v || 'Hero'; });
		text(hero.className || '', 'Class', 'class', v => { hero.className = v || undefined; });
		num(hero.level, '1', 'level', n => { hero.level = Math.max(1, n ?? 1); });
		num(hero.maxHp, '0', 'max HP', n => { hero.maxHp = Math.max(0, n ?? 0); });
		num(hero.defense, '–', 'Defense', n => { hero.defense = n; });
		num(hero.maxWounds, '6', 'max Wounds', n => { hero.maxWounds = n; });
		const del = row.createEl('button', { cls: 'clickable-icon nimble-party-del', attr: { 'aria-label': `Remove ${hero.name}` } });
		setIcon(del, 'trash-2');
		del.addEventListener('click', async () => { party.splice(i, 1); await save(); rerender(); });
	});
	if (!party.length) table.createDiv({ cls: 'nimble-party-empty', text: 'No heroes yet.' });

	const actions = container.createDiv({ cls: 'nimble-party-actions' });
	const btn = (label: string, icon: string, cta: boolean, onClick: () => Promise<void>, title?: string) => {
		const b = actions.createEl('button', { cls: cta ? 'mod-cta' : '', attr: { 'aria-label': title || label } });
		setIcon(b.createSpan(), icon);
		b.createSpan({ text: label });
		b.addEventListener('click', () => void onClick());
		return b;
	};
	btn('Add hero', 'user-plus', true, async () => {
		party.push({ id: uid(), name: `Hero ${party.length + 1}`, level: party[0]?.level ?? 1, maxHp: 12, maxWounds: 6 });
		await save();
		rerender();
	});
	if (party.length) {
		btn('Level up', 'trending-up', false, async () => {
			for (const h of party) h.level += 1;
			await save();
			rerender();
			new Notice(`Party is now level ${party.map(h => h.level).join('/')}. Remember to add their new max HP.`);
		}, 'Raise every hero one level');
	}
}

export class PartyModal extends Modal {
	constructor(app: App, private plugin: NimbleStatblocksPlugin) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-party-modal');
		const c = this.plugin.campaigns?.active;
		this.titleEl.setText(c ? `Party · ${c.name}` : 'Party');
		this.draw();
	}

	private draw(): void {
		const c = this.contentEl;
		c.empty();
		renderPartyEditor(c, this.plugin, () => this.draw());
	}

	onClose(): void { this.contentEl.empty(); }
}
