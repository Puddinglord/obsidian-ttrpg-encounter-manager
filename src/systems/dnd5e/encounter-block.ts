// A ```nimble-encounter block in a 5e campaign: its monsters with CR and XP,
// the difficulty against the party (the edition's rules), and Run / Add to
// fight. Players see who was fought, not the numbers.

import { MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import { pill } from '../../core/pill';
import type { EncounterDef } from '../../core/encounter-def';
import { addHero, addMonster } from './combat';
import type { Dnd5eRuntime } from './runtime';
import { rateEncounter5e, xpOf } from './rules';

export class Dnd5eEncounterBlock extends MarkdownRenderChild {
	constructor(private rt: Dnd5eRuntime, el: HTMLElement, private def: EncounterDef, private ctx: MarkdownPostProcessorContext) {
		super(el);
	}

	onload(): void {
		const plugin = this.rt.plugin;
		// Monsters fill in once the index is built; campaigns change levels and parties.
		this.registerEvent(this.rt.index.vault.on('changed', () => this.render()));
		this.registerEvent(plugin.campaigns.on('changed', () => this.render()));
		this.render();
	}

	private render(): void {
		const el = this.containerEl;
		el.empty();
		const path = this.ctx.sourcePath;
		const card = el.createDiv({ cls: 'nimble-encounter-block dnd5e-encounter' });
		const head = card.createDiv({ cls: 'dnd5e-encounter-head' });
		head.createDiv({ cls: 'dnd5e-encounter-name', text: this.def.name });
		const player = this.rt.plugin.playerView(path);
		const groups = this.def.monsters.map(m => ({ m, entry: this.rt.get(m.name, path) }));
		const known = groups.filter(g => g.entry).map(g => ({ monster: g.entry!.monster, count: g.m.count }));

		if (!player) {
			const levels = this.rt.partyLevels();
			const edition = this.rt.edition(path);
			const r = rateEncounter5e(known, levels, edition);
			const chip = head.createSpan({ cls: `nimble-difficulty diff-${r.label.toLowerCase()}`, text: `${r.label} · ${Math.round(r.pct * 100)}%` });
			chip.setAttr('title', [
				`${r.xp.toLocaleString('en-US')} XP${r.multiplier !== 1 ? ` × ${r.multiplier} = ${r.adjusted.toLocaleString('en-US')}` : ''}`,
				`Party: ${levels.length} hero${levels.length === 1 ? '' : 'es'}, level ${[...new Set(levels)].join('/')}`,
				...r.thresholds.map(t => `${t.label}: ${t.xp.toLocaleString('en-US')} XP`),
				edition === '2014' ? '2014 rules (DMG thresholds and multipliers)' : '2024 rules (XP budget per character)',
			].join('\n'));
		}

		const list = card.createDiv({ cls: 'dnd5e-encounter-monsters' });
		for (const { m, entry } of groups) {
			const row = list.createDiv({ cls: 'dnd5e-encounter-row' });
			row.createSpan({ cls: 'dnd5e-encounter-count', text: `${m.count}×` });
			row.appendChild(this.rt.createRef(m.name, path));
			if (entry && !player) row.createSpan({ cls: 'dnd5e-encounter-xp', text: `${(xpOf(entry.monster) * m.count).toLocaleString('en-US')} XP` });
		}
		if (this.def.notes) card.createDiv({ cls: 'dnd5e-encounter-notes', text: this.def.notes });
		if (player) return;

		const bar = card.createDiv({ cls: 'dnd5e-encounter-actions' });
		const button = (label: string, icon: string, run: () => void, cta = false) => {
			const b = pill(bar, { tag: 'button', cls: cta ? 'mod-cta' : '', icon, text: label });
			b.onclick = run;
		};
		const missing = groups.filter(g => !g.entry).map(g => g.m.name);
		if (missing.length) card.createDiv({ cls: 'dnd5e-encounter-missing', text: `Not found: ${missing.join(', ')}` });
		button('Run', 'play', () => void this.run(true), true);
		button('Add to fight', 'plus', () => void this.run(false));
	}

	private run(fresh: boolean): Promise<void> {
		return runEncounter5e(this.rt, this.def, this.ctx.sourcePath, fresh);
	}
}

/** Run: a new fight with these monsters (and the party, if the block asks). Add: into the current one. */
export async function runEncounter5e(rt: Dnd5eRuntime, def: EncounterDef, path: string | undefined, fresh: boolean): Promise<void> {
	const store = rt.fights;
	if (fresh) store.reset(def.name, rt.edition(path), path);
	store.change(f => {
		for (const { m, entry } of def.monsters.map(m => ({ m, entry: rt.get(m.name, path) }))) {
			if (entry) addMonster(f, entry.monster, m.count, { sourceFile: entry.filePath || undefined });
		}
		if (fresh && def.party) for (const h of rt.plugin.settings.party) addHero(f, { name: h.name, maxHp: h.maxHp, ac: h.defense });
	});
	await rt.openTracker();
}
