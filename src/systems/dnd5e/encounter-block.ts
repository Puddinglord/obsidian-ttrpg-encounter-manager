// A ```nimble-encounter block in a 5e campaign: its monsters with CR and XP,
// the difficulty against the party (the edition's rules), and Run / Add to
// fight. Players see battle notes: who was fought and how it went, not the numbers.

import { MarkdownPostProcessorContext, MarkdownRenderChild, setIcon } from 'obsidian';
import { pill } from '../../core/pill';
import type { EncounterDef } from '../../core/encounter-def';
import { addHero, addMonster } from './combat';
import type { Dnd5eRuntime } from './runtime';
import { rateEncounter5e, xpOf } from './rules';
import { applyLook } from '../../core/look';
import { evIcon } from '../../core/icons';
import { appendRichText } from '../../core/markdown';
import { wireWikiLinks } from '../../core/wiki-links';
import { BattleEditOptions, battleEditButton, battleFacts, battleNotesText, outcomePill, writeEncounterBlock } from '../../core/battle-notes';
import { rankByName } from '../../core/spotlight-def';

/** The battle notes dialog in 5e's look, the monsters a note can see suggested as you type a foe. */
export const battleEdit5e = (rt: Dnd5eRuntime, path?: string): BattleEditOptions => ({
	system: 'dnd5e',
	suggest: (q) => rankByName(rt.index.all(rt.edition(path), path), q, e => [e.name], 20).map(e => e.name),
});

export class Dnd5eEncounterBlock extends MarkdownRenderChild {
	constructor(private rt: Dnd5eRuntime, el: HTMLElement, private def: EncounterDef, private ctx: MarkdownPostProcessorContext, private source: string) {
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
		// In a campaign you play in, the same block is your battle notes.
		if (this.rt.plugin.playerView(path)) { this.renderBattle(); return; }
		const card = el.createDiv({ cls: 'nimble-encounter-block dnd5e-encounter' });
		applyLook(card, 'dnd5e');
		const head = card.createDiv({ cls: 'dnd5e-encounter-head' });
		setIcon(head.createSpan({ cls: 'dnd5e-encounter-icon' }), evIcon('swords'));
		head.createDiv({ cls: 'dnd5e-encounter-name', text: this.def.name });
		// Monsters, and the campaign's NPCs with stats (as Add to fight on their card makes them).
		const groups = this.def.monsters.map(m => ({ m, fighter: this.rt.fighter(m, path) })).map(g => ({ ...g, entry: g.fighter?.entry }));
		const known = groups.filter(g => g.entry).map(g => ({ monster: g.entry!.monster, count: g.m.count }));
		const levels = this.rt.partyLevels();
		const edition = this.rt.edition(path);
		const r = rateEncounter5e(known, levels, edition);
		const party = `${levels.length} hero${levels.length === 1 ? '' : 'es'}, level ${[...new Set(levels)].join('/')}`;
		const xp = (n: number) => `${n.toLocaleString('en-US')} XP`;

		const chip = head.createSpan({ cls: `nimble-difficulty diff-${r.label.toLowerCase()}`, text: `${r.label} · ${Math.round(r.pct * 100)}%` });
		chip.setAttr('title', [
			`${xp(r.xp)}${r.multiplier !== 1 ? ` × ${r.multiplier} = ${r.adjusted.toLocaleString('en-US')}` : ''}`,
			`Party: ${party}`,
			...r.thresholds.map(t => `${t.label}: ${xp(t.xp)}`),
			edition === '2014' ? '2014 rules (DMG thresholds and multipliers)' : '2024 rules (XP budget per character)',
		].join('\n'));

		// The roster: how many, the monster (its reference, with CR), AC and HP, and the XP they're worth.
		const list = card.createDiv({ cls: 'dnd5e-encounter-monsters' });
		for (const { m, entry, fighter } of groups) {
			const row = list.createDiv({ cls: 'dnd5e-encounter-row' });
			row.createSpan({ cls: 'dnd5e-encounter-count', text: `${m.count}×` });
			// An NPC under their own name; their AC, HP and XP below are their own.
			row.appendChild(fighter?.npc ? this.rt.createNpcRef(fighter, path) : this.rt.createRef(m.name, path)).addClass('dnd5e-encounter-ref');
			if (entry) {
				const stats = row.createSpan({ cls: 'dnd5e-encounter-stats' });
				stats.createSpan({ text: `AC ${entry.monster.ac}` });
				stats.createSpan({ text: `HP ${entry.monster.hp}` });
				row.createSpan({ cls: 'dnd5e-encounter-xp', text: xp(xpOf(entry.monster) * m.count) });
			}
		}

		// The budget: the total, and where it sits against the party's thresholds.
		if (known.length) {
			const total = card.createDiv({ cls: 'dnd5e-encounter-total' });
			total.createSpan({ cls: 'dnd5e-encounter-party', text: party });
			total.createSpan({ cls: 'dnd5e-encounter-sum', text: r.multiplier !== 1 ? `${r.xp.toLocaleString('en-US')} × ${r.multiplier} = ${xp(r.adjusted)}` : xp(r.xp) });
			// The top threshold sits near the end; a fight past the scale fills it and says so.
			const top = r.thresholds[r.thresholds.length - 1]?.xp || 1;
			const scale = top * 1.2;
			const over = r.adjusted > scale;
			const meter = card.createDiv({ cls: `dnd5e-encounter-budget diff-${r.label.toLowerCase()}${over ? ' is-over' : ''}`, attr: { 'aria-hidden': 'true' } });
			meter.createDiv({ cls: 'dnd5e-encounter-budget-fill' }).setCssStyles({ width: `${Math.min(100, (100 * r.adjusted) / scale)}%` });
			for (const t of r.thresholds) {
				const tick = meter.createDiv({ cls: 'dnd5e-encounter-budget-tick' });
				tick.setCssStyles({ left: `${(100 * t.xp) / scale}%` });
				tick.createSpan({ cls: 'dnd5e-encounter-budget-label', text: t.label });
			}
		}
		if (this.def.notes) card.createDiv({ cls: 'dnd5e-encounter-notes', text: this.def.notes });

		const missing = groups.filter(g => !g.entry).map(g => g.m.name);
		if (missing.length) card.createDiv({ cls: 'dnd5e-encounter-missing', text: `Not found: ${missing.join(', ')}` });
		const bar = card.createDiv({ cls: 'dnd5e-encounter-actions' });
		const button = (label: string, icon: string, run: () => void, cta = false) => {
			const b = pill(bar, { tag: 'button', cls: cta ? 'mod-cta' : '', icon, text: label });
			b.onclick = run;
		};
		button('Run', evIcon('play'), () => void this.run(true), true);
		button('Add to fight', evIcon('plus'), () => void this.run(false));
	}

	/**
	 * A player's battle notes on 5e's page: the name over its red rule with how it went, who you fought
	 * (a monster you can know about is its lore card; anything else as you wrote it), where, when and
	 * loot, the notes, and Edit. Core draws the parts every game shares (core/battle-notes.ts).
	 */
	private renderBattle(): void {
		const app = this.rt.plugin.app;
		const path = this.ctx.sourcePath;
		const def = this.def;
		const save = (next: EncounterDef) => void writeEncounterBlock(app, this.containerEl, this.ctx, this.source, next);
		const card = this.containerEl.createDiv({ cls: 'nimble-encounter-block dnd5e-encounter dnd5e-battle-notes ev-battle-notes' });
		applyLook(card, 'dnd5e');
		const head = card.createDiv({ cls: 'dnd5e-encounter-head' });
		setIcon(head.createSpan({ cls: 'dnd5e-encounter-icon' }), evIcon('swords'));
		head.createDiv({ cls: 'dnd5e-encounter-name', text: def.name });
		outcomePill(head, def, save);

		const list = card.createDiv({ cls: 'dnd5e-encounter-monsters' });
		for (const m of def.monsters) {
			const row = list.createDiv({ cls: 'dnd5e-encounter-row battle-foe' });
			row.createSpan({ cls: 'dnd5e-encounter-count', text: `${m.count}×` });
			if (this.rt.get(m.name, path)) row.appendChild(this.rt.createRef(m.name, path)).addClass('dnd5e-encounter-ref');
			else appendRichText(row.createSpan({ cls: 'battle-foe-name' }), m.written ?? m.name);
		}
		if (!def.monsters.length) list.createDiv({ cls: 'dnd5e-encounter-empty', text: 'No foes yet' });
		wireWikiLinks(list, app, path);

		battleFacts(card, app, def, path);
		battleNotesText(card, app, def, path, 'dnd5e-encounter-notes');
		const bar = card.createDiv({ cls: 'dnd5e-encounter-actions' });
		battleEditButton(bar, app, def, save, battleEdit5e(this.rt, path), '');
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
		for (const m of def.monsters) {
			const fighter = rt.fighter(m, path);
			if (!fighter) continue;
			const added = addMonster(f, fighter.entry.monster, m.count, { sourceFile: fighter.entry.filePath || undefined });
			// An NPC starts from what their note says is left, as from their card.
			if (fighter.hpNow !== undefined) for (const c of added) c.hp = fighter.hpNow;
		}
		if (fresh && def.party) for (const h of rt.plugin.settings.party) addHero(f, { name: h.name, maxHp: h.maxHp, ac: h.defense });
	});
	await rt.openTracker();
}
