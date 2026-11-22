// What a D&D Beyond character brings into the compendium, as a checklist: the
// new entries (ticked), earlier imports that gain levels (ticked), and one line
// each for what the SRD, an earlier import or your own notes already have. The
// import dialog shows it under the character; Import content… shows it alone
// (`importDdbContent`, the contract's `importFrom`). Ticked entries are written
// as blocks in the content folder, one note each, tagged Imported.

import { normalizePath, setIcon, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { fence } from '../../core/builder/frame';
import { safeFileName } from '../../core/content/blocks';
import type { ContentImport } from '../../core/content/import-modal';
import { contentFolderFor } from '../../core/content/new-entry';
import { evIcon } from '../../core/icons';
import { applyLook } from '../../core/look';
import { pill } from '../../core/pill';
import { compendium5e, KIND5E } from './compendium';
import type { Dnd5eEdition } from './editions';
import { ddbCharacterOf, importDdbCharacter } from './import-ddb';
import { ddbBlock, ddbContent, DdbContentKind, DdbHave, DdbPlanItem, maxLevel, planDdbContent, replaceBlock } from './import-ddb-content';
import type { Dnd5eRuntime } from './runtime';

const key = (s: string) => s.toLowerCase().replace(/\s*[([]legacy[)\]]\s*$/i, '').replace(/[^a-z0-9]/g, '');
const WORD: Record<DdbContentKind, [string, string]> = {
	class: ['class', 'classes'], subclass: ['subclass', 'subclasses'], species: ['species', 'species'], background: ['background', 'backgrounds'],
	feat: ['feat', 'feats'], spell: ['spell', 'spells'], item: ['item', 'items'], equipment: ['item', 'items'],
};
const count = (n: number, kind: DdbContentKind) => `${n} ${WORD[kind][n === 1 ? 0 : 1]}`;
const strip = <T extends Record<string, unknown>>(v: T): Record<string, unknown> => { const { imported: _i, ddbId: _d, ...rest } = v; return rest; };

/** The SRD's entries (no source: not a pack's, not yours) and your own, for planning an import. */
export function have5e(rt: Dnd5eRuntime, edition: Dnd5eEdition): DdbHave {
	const c = compendium5e(edition);
	const srdOnly = <T extends { name: string; source?: string }>(list: T[]) => list.filter(x => !x.source);
	const byKind: Record<DdbContentKind, { name: string }[]> = {
		class: srdOnly(c.classes),
		subclass: srdOnly(c.classes).flatMap(x => srdOnly(x.subclasses)),
		// A 2014 subrace ("Hill Dwarf") is the SRD's too.
		species: srdOnly(c.species).flatMap(s => [s, ...s.subspecies]),
		background: srdOnly(c.backgrounds), feat: srdOnly(c.feats), spell: srdOnly(c.spells), item: srdOnly(c.items), equipment: srdOnly(c.equipment),
	};
	const plugin = rt.plugin;
	const kinds = new Set<string>(['class', 'subclass', 'species', 'background', 'feat', 'spell', 'item', 'equipment']);
	const asKind = (k: string) => (kinds.has(k) ? k as DdbContentKind : null);
	const mine: DdbHave['mine'] = [];
	for (const e of plugin.content.entriesOf('dnd5e')) { const k = asKind(e.kind); if (k && e.file) mine.push({ kind: k, name: e.name, value: e.value, file: e.file }); }
	for (const e of rt.homebrew.spells.every()) mine.push({ kind: 'spell', name: e.name, value: { ...e.item }, file: e.filePath });
	for (const e of rt.homebrew.items.every()) mine.push({ kind: e.item.item ? 'item' : 'equipment', name: e.name, value: { ...(e.item.item ?? e.item.equipment) }, file: e.filePath });
	// A content pack's entry by that name is yours too (never updated from here).
	for (const p of plugin.content.all()) {
		if (p.error || p.system !== 'dnd5e') continue;
		for (const e of p.entries) { const k = asKind(e.kind); if (k) mine.push({ kind: k, name: e.name, value: strip(e.value), file: '' }); }
	}
	return {
		srd: (kind, name) => byKind[kind].find(x => key(x.name) === key(name)),
		mine,
	};
}

/** The checklist for one character's content: drawn, chosen, written. */
export class DdbContentChoice {
	readonly plan: DdbPlanItem[];
	private picked: Set<DdbPlanItem>;

	constructor(private rt: Dnd5eRuntime, character: Record<string, unknown>, readonly edition: Dnd5eEdition) {
		this.plan = planDdbContent(ddbContent(character, edition), have5e(rt, edition));
		this.picked = new Set(this.plan.filter(p => p.on));
	}

	/** Entries that can be written: new ones and earlier imports that gain something. */
	get offered(): DdbPlanItem[] {
		return this.plan.filter(p => p.status === 'new' || p.status === 'update');
	}

	chosen(): DdbPlanItem[] {
		return this.offered.filter(p => this.picked.has(p));
	}

	/** What will be in the vault under its own name: what's chosen, and earlier imports (for the character note's names). */
	inVault(): DdbPlanItem[] {
		return this.plan.filter(p => this.picked.has(p) || p.status === 'same' || p.status === 'update');
	}

	/** "Hollowblade (class, levels 1–7 seen), Order of the Quiet Lantern (subclass), 2 feats: 2 already in the SRD". */
	summary(): string {
		const parts: string[] = [];
		const of = (kinds: DdbContentKind[]) => this.plan.filter(p => kinds.includes(p.entry.kind));
		for (const p of of(['class'])) {
			const seen = p.entry.seen ?? 20;
			parts.push(`${p.entry.name} (class${seen < 20 ? `, levels 1–${seen} seen` : ''})`);
		}
		for (const p of of(['subclass', 'species', 'background'])) parts.push(`${p.entry.name} (${p.entry.kind})`);
		for (const kinds of [['feat'], ['spell'], ['item', 'equipment']] as DdbContentKind[][]) {
			const n = of(kinds).length;
			if (n) parts.push(count(n, kinds[0]));
		}
		const srd = this.plan.filter(p => p.status === 'srd').length;
		return `${parts.join(', ')}${srd ? `: ${srd} already in the SRD` : ''}`;
	}

	/** The checklist, then a line each for what's already here, and a word on levels D&D Beyond didn't give. */
	render(el: HTMLElement, changed: () => void): void {
		// A character D&D Beyond gave no definitions for brings nothing.
		if (!this.plan.length) return;
		// 5e's look, in the import dialog and in Import content… alike.
		const box = el.createDiv({ cls: 'dnd5e-ddb-content' });
		applyLook(box, 'dnd5e');
		const head = box.createDiv({ cls: 'dnd5e-ddb-head' });
		head.createDiv({ cls: 'dnd5e-ddb-title', text: 'For your compendium' });
		head.createDiv({ cls: 'dnd5e-ddb-summary', text: this.summary() });
		const offered = this.offered;
		if (offered.length) {
			const list = box.createDiv({ cls: 'dnd5e-ddb-list' });
			for (const p of offered) {
				const row = list.createEl('label', { cls: 'dnd5e-ddb-row' });
				const check = row.createEl('input', { type: 'checkbox', attr: { 'data-kind': p.entry.kind, 'data-name': p.name } });
				check.checked = this.picked.has(p);
				check.addEventListener('change', () => {
					if (check.checked) this.picked.add(p); else this.picked.delete(p);
					changed();
				});
				setIcon(row.createSpan({ cls: 'dnd5e-ddb-icon' }), KIND5E[p.entry.kind].glyph);
				const name = row.createSpan({ cls: 'dnd5e-ddb-name' });
				name.createSpan({ text: p.name });
				name.createSpan({ cls: 'dnd5e-ddb-kind', text: p.entry.kind === 'item' ? 'Magic item' : KIND5E[p.entry.kind].label });
				// An earlier import says what it gains; a new one needs no tag.
				if (p.status === 'update') pill(row, { tag: 'span', cls: 'dnd5e-ddb-tag', icon: evIcon('arrow-up'), text: p.what ?? 'More' });
			}
		} else {
			box.createDiv({ cls: 'dnd5e-ddb-none', text: 'Nothing new: your compendium has all of it.' });
		}
		const names = (status: DdbPlanItem['status']) => this.plan.filter(p => p.status === status).map(p => p.name);
		for (const [status, label] of [['srd', 'Already in the SRD'], ['same', 'Already imported'], ['yours', 'Already yours']] as const) {
			const list = names(status);
			if (!list.length) continue;
			const line = box.createDiv({ cls: `dnd5e-ddb-skip is-${status}` });
			line.createSpan({ cls: 'dnd5e-ddb-skip-label', text: `${label}: ` });
			line.createSpan({ text: list.join(', ') });
		}
		// A class only carries its features up to the levels D&D Beyond gave.
		for (const p of this.plan.filter(x => x.entry.kind === 'class' && (x.status === 'new' || x.status === 'update' || x.status === 'same'))) {
			const top = maxLevel(p.value);
			if (top >= 20) continue;
			const note = box.createDiv({ cls: 'dnd5e-ddb-levels' });
			setIcon(note.createSpan({ cls: 'dnd5e-ddb-levels-icon' }), evIcon('warning'));
			note.createSpan({ text: `D&D Beyond only gave ${p.name}'s features up to level ${top}. Import the character again after they level up to add the rest.` });
		}
	}

	/** Write what's chosen: a note each in the content folder, or the earlier import's block brought up to date. */
	async write(): Promise<{ added: number; updated: number; files: TFile[] }> {
		const plugin = this.rt.plugin;
		const app = plugin.app;
		const out = { added: 0, updated: 0, files: [] as TFile[] };
		for (const p of this.chosen()) {
			const { lang, body } = ddbBlock(p.entry.kind, p.value, this.edition);
			const fenced = fence(lang, body);
			const old = p.status === 'update' && p.file ? app.vault.getFileByPath(p.file) : null;
			if (old) {
				let done = false;
				await app.vault.process(old, text => {
					const next = replaceBlock(text, lang, { ddbId: p.entry.ddbId, name: p.name }, fenced);
					done = next !== null;
					return next ?? text;
				});
				if (done) { out.updated++; out.files.push(old); continue; }
			}
			const folder = contentFolderFor(plugin, 'dnd5e', p.entry.kind);
			if (!app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
			const path = plugin.campaigns.available(normalizePath(`${folder}/${safeFileName(p.name)}.md`));
			out.files.push(await app.vault.create(path, `${fenced}\n`));
			out.added++;
		}
		return out;
	}
}

/** "Added 6 entries to your compendium; 1 brought up to date." */
export function wroteText(r: { added: number; updated: number }): string {
	const parts = [r.added ? `added ${r.added} ${r.added === 1 ? 'entry' : 'entries'} to your compendium` : '', r.updated ? `brought ${r.updated} up to date` : ''].filter(Boolean);
	return parts.join('; ');
}

/** Import content…'s reading of a D&D Beyond character's JSON: its content alone, no character note. */
export function importDdbContent(plugin: EmberVaultPlugin, text: string): ContentImport | null {
	let character: Record<string, unknown>;
	let edition: Dnd5eEdition;
	try {
		character = ddbCharacterOf(text);
		edition = importDdbCharacter(character).edition;
	} catch (e) {
		// Not a character at all: Import content reads it as a pack. A character D&D Beyond wouldn't share: say so.
		const said = e instanceof Error ? e.message : '';
		if (!/D&D Beyond didn’t share/.test(said)) return null;
		return { render: (el) => { el.createDiv({ cls: 'nimble-pack-head is-error' }).createDiv({ cls: 'nimble-pack-summary', text: said }); }, chosen: () => 0, add: () => Promise.resolve('') };
	}
	const rt = plugin.runtime<Dnd5eRuntime>('dnd5e');
	if (!rt) return null;
	const choice = new DdbContentChoice(rt, character, edition);
	const name = typeof character.name === 'string' && character.name.trim() ? character.name.trim() : 'This character';
	return {
		render(el, changed) {
			const head = el.createDiv({ cls: 'nimble-pack-head' });
			setIcon(head.createSpan({ cls: 'nimble-pack-icon' }), 'user-round');
			const t = head.createDiv();
			t.createDiv({ cls: 'nimble-pack-name', text: `${name}'s content` });
			t.createDiv({ cls: 'nimble-pack-summary', text: `A D&D Beyond character, ${edition} rules. Only its content is added here.` });
			if (!choice.plan.length) el.createDiv({ cls: 'dnd5e-ddb-none', text: 'Nothing to add: D&D Beyond gave only names for this character.' });
			choice.render(el, changed);
		},
		chosen: () => choice.chosen().length,
		async add() {
			const r = await choice.write();
			const said = wroteText(r);
			return said ? `${said.charAt(0).toUpperCase()}${said.slice(1)}.` : 'Nothing to add.';
		},
	};
}
