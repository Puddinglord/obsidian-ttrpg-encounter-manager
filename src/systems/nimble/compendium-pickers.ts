// The pre-filtered compendium dialogs the rest of the plugin opens: add
// monsters to the encounter, add a spell/item/feature to a character sheet,
// and insert a reference (or a whole stat block) into the note being edited.

import { Editor, EditorPosition } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { CompendiumHit, CompendiumKind } from './compendium';
import type { Entry, Segment } from './compendium-entries';
import { entryReference } from './compendium-browser';
import { openCompendiumModal } from './compendium-modal';
import { isHero } from './encounters';
import { toStatblockSource } from './parser';
import { nimble } from './runtime';

/** How many of this monster are in the current fight. */
function inFight(plugin: EmberVaultPlugin, e: Entry): number {
	const enc = nimble().encounters.active;
	if (!e.monster) return 0;
	return (enc?.creatures ?? []).filter(c => !isHero(c) && c.monster.name === e.monster!.monster.name).reduce((n, c) => n + (c.count ?? 1), 0);
}

/**
 * Add to the encounter: monsters (and companion stat blocks), "3 goblin" for
 * three, Shift+Enter for two, Cmd/Ctrl+Enter or the row's + to add and keep
 * going, so a whole fight can be built in one go.
 */
export function openAddMonsterPicker(plugin: EmberVaultPlugin, query = ''): void {
	const add = (e: Entry, n: number) => nimble().addToEncounter(e.monster!.monster, e.monster!.filePath || undefined, n);
	openCompendiumModal(plugin, {
		title: 'Add to the encounter',
		segment: 'adversaries',
		segments: ['adversaries', 'companions'],
		only: (e) => !!e.monster,
		counts: true,
		query,
		placeholder: 'Search adversaries… try 3 goblin, type:undead level:<4',
		pickLabel: 'Add and close',
		pick: (e, n) => void add(e, n),
		keep: { label: 'Add and keep open', run: (e, n) => void add(e, n) },
		rowButton: (e) => ({ icon: 'plus', label: `Add ${e.name}`, run: (ev) => void add(e, ev.shiftKey ? 2 : 1).then(() => {
			const row = (ev.target as HTMLElement).closest('.nimble-cmpx-row');
			row?.addClass('is-added');
			window.setTimeout(() => row?.removeClass('is-added'), 900);
			const badge = row?.querySelector('.nimble-cmpx-infight');
			const n = inFight(plugin, e);
			if (badge) badge.setText(n ? `${n} in fight` : '');
		}) }),
		decorate: (e, row) => {
			const n = inFight(plugin, e);
			row.querySelector('.nimble-cmpx-row-name')?.createSpan({ cls: 'nimble-cmpx-infight', text: n ? `${n} in fight` : '' });
		},
	});
}

const SEGMENT_OF: Record<CompendiumKind, Segment> = {
	item: 'items', spell: 'spells', feature: 'features', boon: 'features', class: 'classes', subclass: 'classes', ancestry: 'origins', background: 'origins',
};

export interface HitPick {
	kinds: CompendiumKind[];
	title: string;
	onPick: (hit: CompendiumHit) => void;
	/** Listed first, and an "is:suggested" filter (the class's own options, the caster's schools). */
	prefer?: (hit: CompendiumHit) => boolean;
	preferLabel?: string;
	/** Already on the sheet: tagged "Added", listed last. */
	isTaken?: (hit: CompendiumHit) => boolean;
	/** Offer "Add “what you typed”" when it isn't in the compendium. */
	allowCustom?: boolean;
}

/** Pick a compendium entry (the character sheet's Add buttons). Cmd/Ctrl+Enter adds and keeps the dialog open. */
export function pickFromCompendium(plugin: EmberVaultPlugin, p: HitPick): void {
	const kinds = new Set(p.kinds);
	const hitOf = (e: Entry) => e.hit!;
	const custom = (name: string): CompendiumHit => ({ kind: p.kinds[0] ?? 'item', name, detail: '', entry: {} });
	openCompendiumModal(plugin, {
		title: p.title,
		segment: SEGMENT_OF[p.kinds[0]] ?? 'all',
		only: (e) => !!e.hit && kinds.has(e.hit.kind),
		pickLabel: 'Add',
		pick: (e) => p.onPick(hitOf(e)),
		keep: { label: 'Add and keep open', run: (e) => p.onPick(hitOf(e)) },
		prefer: p.prefer ? { label: p.preferLabel ?? 'Suggested', test: (e) => !!e.hit && p.prefer!(e.hit) } : undefined,
		isTaken: p.isTaken ? (e) => !!e.hit && p.isTaken!(e.hit) : undefined,
		custom: p.allowCustom ? { label: (t) => `Add “${t}”`, run: (t) => p.onPick(custom(t)) } : undefined,
	});
}

export type InsertMode = 'reference' | 'statblock';

/**
 * From the editor (a slash command): pick an entry and write its reference
 * (or a monster's whole stat block) where the cursor was, then hand the
 * cursor back to the note so typing carries on.
 */
export function insertFromCompendium(plugin: EmberVaultPlugin, editor: Editor, at: EditorPosition, o: { segment: Segment; segments?: Segment[]; mode?: InsertMode; title: string; query?: string }): void {
	const mode = o.mode ?? 'reference';
	const write = (text: string, block: boolean) => {
		let pos = at;
		let out = text;
		if (block) {
			const line = editor.getLine(pos.line);
			const before = line.slice(0, pos.ch);
			if (before.trim()) out = `\n${out}`;
			out = `${out}\n`;
			if (line.slice(pos.ch).trim()) out = `${out}\n`;
		} else {
			const prev = editor.getLine(pos.line).slice(0, pos.ch);
			const next = editor.getLine(pos.line).slice(pos.ch);
			if (prev && !/\s$/.test(prev)) out = ` ${out}`;
			out = next.startsWith(' ') ? out : `${out} `;
		}
		editor.replaceRange(out, pos);
		const lines = out.split('\n');
		pos = { line: pos.line + lines.length - 1, ch: (lines.length === 1 ? pos.ch : 0) + lines[lines.length - 1].length };
		editor.setCursor(pos);
		at = pos;
	};
	const refocus = () => window.setTimeout(() => editor.focus(), 0);
	const insert = (e: Entry) => {
		if (mode === 'statblock' && e.monster) write(`\`\`\`nimble\n${toStatblockSource(e.monster.monster)}\n\`\`\``, true);
		else { const ref = entryReference(e); if (ref) write(ref, false); }
	};
	openCompendiumModal(plugin, {
		title: o.title,
		segment: o.segment,
		segments: o.segments,
		only: mode === 'statblock' ? (e) => !!e.monster : (e) => !!entryReference(e),
		query: o.query,
		pickLabel: mode === 'statblock' ? 'Insert stat block' : 'Insert',
		pick: (e) => { insert(e); refocus(); },
		keep: { label: 'Insert and keep open', run: (e) => insert(e) },
		onCancel: refocus,
	});
}
