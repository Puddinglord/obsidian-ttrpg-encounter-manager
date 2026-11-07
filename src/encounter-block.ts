// ```nimble-encounter blocks: a prepared encounter in a note, with live
// difficulty against the party and one click to run it in the tracker.

import { resumeSavedFight, savedFightsFor } from './saved-fight';
import { debounce, MarkdownPostProcessorContext, MarkdownRenderChild, Notice, setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { EncounterDef, encounterBlockSource, parseEncounterBlock } from './encounter-def';
import { budgetPhrase, monsterRole, rateEncounter, shiftLabel, shiftMonster, SHIFT_DAMAGE, SHIFT_HP } from './rules';
import { createInlineRef } from './inline-ref';
import { BuilderModal } from './builder-modal';
import { EncounterTemplate } from './encounters';
import { renderBalance } from './balance-ui';
import { closePopover, isPopoverOpenFor, openPopover } from './popover';
import { confirmAction } from './touch';

export function partyLevels(plugin: NimbleStatblocksPlugin): number[] {
	const party = plugin.settings.party;
	if (party.length) return party.map(p => p.level || 1);
	// No heroes entered yet: the campaign's starting level and hero count.
	const d = plugin.campaigns?.defaults() ?? { level: 1, heroes: plugin.settings.defaultPartySize || 4 };
	return Array.from({ length: d.heroes }, () => d.level);
}

export function ratingChip(parent: HTMLElement, label: string, pct: number): HTMLElement {
	return parent.createSpan({ cls: `nimble-difficulty diff-${label.toLowerCase().replace(/\s+/g, '-')}`, text: `${label} · ${Math.round(pct * 100)}%` });
}

/** Resolve a definition against the index: what can be run, and what's unknown. */
export function resolveDef(plugin: NimbleStatblocksPlugin, def: EncounterDef) {
	const found: EncounterTemplate['monsters'] = [];
	const missing: string[] = [];
	for (const m of def.monsters) {
		const e = plugin.index.get(m.name);
		if (e) found.push({ monster: shiftMonster(e.monster, m.shift ?? 0), count: m.count, sourceFile: e.filePath || undefined });
		else missing.push(m.name);
	}
	return { found, missing };
}

export async function runEncounter(plugin: NimbleStatblocksPlugin, def: EncounterDef, sourcePath?: string): Promise<void> {
	const { found, missing } = resolveDef(plugin, def);
	if (!found.length) { new Notice('None of these monsters are in the bestiary or your notes yet.'); return; }
	const active = plugin.encounters.active;
	if (!plugin.settings.multipleEncounters && active && active.creatures.some(c => c.side !== 'hero') && active.phase !== 'setup') {
		if (!await confirmAction(plugin.app, `Replace "${active.name}"?`, `The tracker is mid-fight. Load "${def.name}" instead?`, 'Replace', true)) return;
	}
	plugin.encounters.loadTemplate({ name: def.name, monsters: found, withParty: def.party && plugin.settings.party.length > 0 }, sourcePath);
	await plugin.activateEncounterView(false);
	await plugin.showTracker();
	new Notice(`${def.name} is in the tracker${missing.length ? `. Not found: ${missing.join(', ')}` : ''}`);
}

export function registerEncounterBlock(plugin: NimbleStatblocksPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('nimble-encounter', (source, el, ctx) => {
		ctx.addChild(new EncounterBlockChild(plugin, el, parseEncounterBlock(source), ctx));
	});
}

/**
 * Re-renders when what it depends on changes: monsters (the vault index fills
 * in after startup), the campaign (its level and party) and the party itself.
 */
class EncounterBlockChild extends MarkdownRenderChild {
	constructor(private plugin: NimbleStatblocksPlugin, el: HTMLElement, private def: EncounterDef, private ctx: MarkdownPostProcessorContext) {
		super(el);
	}

	onload(): void {
		this.render();
		const again = debounce(() => this.render(), 150, true);
		this.registerEvent(this.plugin.index.on('changed', again));
		this.registerEvent(this.plugin.campaigns.on('changed', again));
		this.registerEvent(this.plugin.encounters.on('changed', again));
	}

	private render(): void {
		// Don't yank the block out from under an open count editor or balance popover.
		if (this.containerEl.querySelector('.encounter-count:focus, .nimble-difficulty:focus')) return;
		this.containerEl.empty();
		renderEncounterBlock(this.plugin, this.containerEl, this.def, this.ctx);
	}
}

/** Rewrite a code block's body in its note. */
function writeBack(plugin: NimbleStatblocksPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext, next: EncounterDef): void {
	const info = ctx.getSectionInfo(el);
	const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
	if (!info || !file) { new Notice('Could not find this block in the note to update it.'); return; }
	void plugin.app.vault.process(file, (text) => {
		const lines = text.split('\n');
		lines.splice(info.lineStart + 1, info.lineEnd - info.lineStart - 1, ...encounterBlockSource(next).split('\n'));
		return lines.join('\n');
	});
}

function partyText(plugin: NimbleStatblocksPlugin, levels: number[]): string {
	const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
	return plugin.settings.party.length
		? `${levels.length} heroes, level ${avg.toFixed(levels.every(l => l === levels[0]) ? 0 : 1)}`
		: `${levels.length} level-${levels[0] ?? 1} heroes (no party set)`;
}

function renderEncounterBlock(plugin: NimbleStatblocksPlugin, el: HTMLElement, def: EncounterDef, ctx: MarkdownPostProcessorContext): void {
	const save = (next: EncounterDef) => writeBack(plugin, el, ctx, next);
	const card = el.createDiv({ cls: 'nimble-encounter-block' });
	const head = card.createDiv({ cls: 'encounter-block-head' });
	setIcon(head.createSpan({ cls: 'encounter-block-icon' }), 'swords');
	head.createSpan({ cls: 'encounter-block-name', text: def.name });

	const { found, missing } = resolveDef(plugin, def);
	const levels = partyLevels(plugin);
	const rating = rateEncounter(found.map(f => ({ monster: f.monster, count: f.count })), levels);
	if (found.length) {
		const chip = head.createEl('button', {
			cls: `nimble-difficulty diff-${rating.label.toLowerCase().replace(/\s+/g, '-')} is-button`,
			attr: { 'aria-label': 'Balance', title: 'Balance' },
		});
		chip.createSpan({ text: `${rating.label} · ${Math.round(rating.pct * 100)}%` });
		setIcon(chip.createSpan({ cls: 'diff-chevron' }), 'sliders-horizontal');
		chip.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (isPopoverOpenFor(chip)) { closePopover(); return; }
			openPopover(chip, (pop, close) => renderBalance(pop, plugin, def, (next) => { close(); save(next); }), { width: 340, cls: 'balance-popover' });
		});
	}

	const list = card.createDiv({ cls: 'encounter-block-monsters' });
	def.monsters.forEach((m, i) => {
		const entry = plugin.index.get(m.name);
		const chip = list.createDiv({ cls: `encounter-chip role-${entry ? monsterRole(entry.monster) : 'unknown'}` });
		// The count is a button: click it to change how many, make them tougher or weaker, or remove them.
		const count = chip.createEl('button', { cls: 'encounter-count', attr: { 'aria-label': `${m.count} ${m.name}${m.shift ? `, ${shiftLabel(m.shift)} level` : ''}` } });
		count.createSpan({ cls: 'encounter-count-n', text: `${m.count}×` });
		if (m.shift) count.createSpan({ cls: `encounter-shift ${m.shift > 0 ? 'is-up' : 'is-down'}`, text: shiftLabel(m.shift) });
		count.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (isPopoverOpenFor(count)) { closePopover(); return; }
			const minion = entry ? monsterRole(entry.monster) === 'minion' : false;
			const draft = { count: m.count, shift: m.shift ?? 0 };
			openPopover(count, (pop) => {
				pop.addClass('encounter-count-editor');
				pop.createDiv({ cls: 'popover-title', text: m.name });
				const row = pop.createDiv({ cls: 'ece-row' });
				row.createSpan({ cls: 'ece-label', text: 'How many' });
				const stepper = row.createDiv({ cls: 'ece-stepper' });
				const minus = stepper.createEl('button', { cls: 'ece-step', attr: { 'aria-label': 'One fewer' } });
				setIcon(minus, 'minus');
				const n = stepper.createSpan({ cls: 'ece-n' });
				const plus = stepper.createEl('button', { cls: 'ece-step', attr: { 'aria-label': 'One more' } });
				setIcon(plus, 'plus');
				const lvl = pop.createDiv({ cls: 'ece-row' });
				lvl.createSpan({ cls: 'ece-label', text: 'Level' });
				const seg = lvl.createDiv({ cls: 'ece-shift' });
				const hint = pop.createDiv({ cls: 'ece-hint' });
				const opts: [number, string][] = [[-1, 'Weaker'], [0, 'As written'], [1, 'Tougher']];
				const buttons = opts.map(([v, label]) => {
					const b = seg.createEl('button', { cls: 'ece-shift-btn', text: label, attr: { 'data-shift': String(v) } });
					b.disabled = minion && v !== 0;
					b.addEventListener('click', () => { draft.shift = v; refresh(); });
					return b;
				});
				const remove = pop.createEl('button', { cls: 'ece-remove', text: `Remove ${m.name}` });
				remove.addEventListener('click', () => { draft.count = 0; closePopover(); });
				minus.addEventListener('click', () => { draft.count = Math.max(1, draft.count - 1); refresh(); });
				plus.addEventListener('click', () => { draft.count += 1; refresh(); });
				const refresh = () => {
					n.setText(String(draft.count));
					minus.disabled = draft.count <= 1;
					buttons.forEach(b => b.toggleClass('is-active', Number(b.dataset.shift) === draft.shift));
					hint.setText(minion ? 'Minions don\'t scale by level.'
						: draft.shift > 0 ? `+1 level: ${Math.round((SHIFT_HP - 1) * 100)}% more HP and +${SHIFT_DAMAGE} damage on every hit.`
							: draft.shift < 0 ? `−1 level: ${Math.round((1 - 1 / SHIFT_HP) * 100)}% less HP and −${SHIFT_DAMAGE} damage on every hit.`
								: 'Its stat block as written.');
					count.querySelector('.encounter-count-n')?.setText(`${draft.count}×`);
				};
				refresh();
			}, {
				width: 284,
				// Saved once, when the editor closes, so you can click + a few times.
				onClose: () => {
					if (draft.count === m.count && draft.shift === (m.shift ?? 0)) return;
					const next: EncounterDef = { ...def, monsters: def.monsters.map(x => ({ ...x })) };
					if (draft.count <= 0) next.monsters.splice(i, 1);
					else next.monsters[i] = { ...next.monsters[i], count: draft.count, shift: draft.shift || undefined };
					save(next);
				},
			});
		});
		chip.appendChild(createInlineRef(plugin, m.name, ctx.sourcePath));
	});
	if (!def.monsters.length) list.createDiv({ cls: 'encounter-block-empty', text: 'No monsters yet.' });

	const meta = card.createDiv({ cls: 'encounter-block-meta' });
	if (found.length) meta.createSpan({ text: `${rating.value.toFixed(1)} of ${budgetPhrase(rating.budget)} · ` });
	const party = meta.createEl('a', { cls: 'encounter-party-link', text: partyText(plugin, levels), attr: { href: '#' } });
	party.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); plugin.openParty(); });
	for (const w of rating.warnings) card.createDiv({ cls: 'encounter-block-warning', text: w });
	if (missing.length) card.createDiv({ cls: 'encounter-block-warning', text: `Not found: ${missing.join(', ')}` });
	if (def.notes) card.createDiv({ cls: 'encounter-block-notes', text: def.notes });

	const bar = card.createDiv({ cls: 'encounter-block-actions' });
	const btn = (text: string, icon: string, cls: string, onClick: () => void, title?: string) => {
		const b = bar.createEl('button', { cls, attr: { 'aria-label': title || text } });
		setIcon(b.createSpan(), icon);
		b.createSpan({ text });
		b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
		return b;
	};
	btn('Run', 'play', 'mod-cta', () => void runEncounter(plugin, def, ctx.sourcePath), 'Load this encounter into the tracker');
	btn('Add to current', 'plus', '', () => void (async () => {
		for (const f of found) plugin.encounters.add(f.monster, f.sourceFile, f.count);
		await plugin.showTracker();
		new Notice(`Added ${def.name}'s monsters to the current encounter`);
	})(), 'Add these monsters to the encounter already in the tracker');
	btn('Edit', 'pencil', '', () => new BuilderModal(plugin, def, save).open(), 'Edit monsters with the encounter builder');
	// A fight saved from this block can be picked up where it stopped.
	const saved = savedFightsFor(plugin.app, ctx.sourcePath, def.name)[0];
	if (saved) {
		const b = btn(`Resume round ${saved.round}`, 'history', 'encounter-resume', () => void resumeSavedFight(plugin, saved.file), `Saved ${saved.saved.replace('T', ' ')}`);
		b.addClass('mod-warning');
	}
}
