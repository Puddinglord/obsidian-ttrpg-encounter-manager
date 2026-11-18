// How 5e's character wizards look: the sheet in brief beside every step (the
// hero's name, the numbers that matter as tiles, six ability tiles, saves,
// skills, spells and features as chips), the level up's summary, and the
// ability scores step (point buy's budget, each score's card). The rules are
// in character-draft.ts; this only draws.

import { BuilderUI, numberInput, statTiles } from '../../core/builder/frame';
import { applyLook } from '../../core/look';
import { pill } from '../../core/pill';
import { Sheet5e, pbForLevel } from './character';
import { bonuses, Character5eDraft, finalScores, LevelUp5eDraft, POINT_COST, pointsSpent } from './character-draft';
import { formatMod } from './rules';
import { ABILITIES, ABILITY_NAME, AbilityKey } from './types';

const short = (a: AbilityKey) => a.toUpperCase();
let ids = 0;
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** A spell level's heading, as the edition's book writes it. */
export function spellLevelLabel(level: number, edition: string): string {
	if (level === 0) return 'Cantrips';
	return edition === '2014' ? `${ordinal(level)} level` : `Level ${level}`;
}

/** The card a summary is drawn on: a page of the book. */
function page(el: HTMLElement): HTMLElement {
	const card = el.createDiv({ cls: 'dnd5e-card dnd5e-wizard-summary' });
	applyLook(card, 'dnd5e');
	return card;
}

function head(card: HTMLElement, name: string, line: string): void {
	const h = card.createDiv({ cls: 'dnd5e-card-head dnd5e-brief-top' });
	const t = h.createDiv({ cls: 'dnd5e-brief-titles' });
	t.createDiv({ cls: 'dnd5e-card-name', text: name });
	if (line) t.createDiv({ cls: 'dnd5e-card-line', text: line });
}

/** A titled part of the summary, empty parts left out. */
function part(card: HTMLElement, title: string, note?: string): HTMLElement {
	const sec = card.createDiv({ cls: 'dnd5e-brief-part' });
	const h = sec.createDiv({ cls: 'dnd5e-brief-head' });
	h.createSpan({ cls: 'dnd5e-brief-title', text: title });
	if (note) h.createSpan({ cls: 'dnd5e-brief-note', text: note });
	return sec.createDiv({ cls: 'dnd5e-brief-chips' });
}

/** A chip: a name and, set apart, its number. */
function chip(parent: HTMLElement, text: string, o: { bonus?: string; on?: boolean; title?: string; icon?: string; cls?: string } = {}): HTMLElement {
	const c = pill(parent, { text, icon: o.icon, cls: `dnd5e-brief-chip${o.on ? ' is-on' : ''}${o.cls ? ` ${o.cls}` : ''}`, title: o.title });
	if (o.bonus) c.createSpan({ cls: 'dnd5e-brief-bonus', text: o.bonus });
	return c;
}

/** The sheet in brief: what the new character will have. */
export function sheetBrief(el: HTMLElement, s: Sheet5e, line: string): void {
	const card = page(el);
	head(card, s.name || 'New hero', line);

	statTiles(card, [
		{ label: 'HP', value: String(s.hpMax), sub: `${s.level}d${s.hitDie}`, lead: true },
		{ label: 'AC', value: String(s.ac), title: s.acFrom || undefined },
		{ label: 'Init', value: formatMod(s.initiative) },
		{ label: 'Speed', value: String(s.speed), sub: 'feet' },
		{ label: 'PB', value: formatMod(s.pb) },
	], 'dnd5e-brief-tiles');

	// Six abilities: the modifier big, the score under it, the save beside (in red when proficient).
	const grid = card.createDiv({ cls: 'dnd5e-brief-abilities' });
	for (const a of ABILITIES) {
		const save = s.saves[a];
		const c = grid.createDiv({ cls: `dnd5e-brief-ability${save.proficient ? ' is-prof' : ''}`, attr: { title: ABILITY_NAME[a] } });
		c.createDiv({ cls: 'dnd5e-brief-ab-name', text: short(a) });
		c.createDiv({ cls: 'dnd5e-brief-ab-mod', text: formatMod(s.mods[a]) });
		c.createDiv({ cls: 'dnd5e-brief-ab-score', text: String(s.scores[a]) });
		const sv = c.createDiv({ cls: 'dnd5e-brief-ab-save' });
		sv.createSpan({ text: 'Save ' });
		sv.createSpan({ cls: 'dnd5e-brief-ab-save-n', text: formatMod(save.bonus) });
	}

	const skills = s.skills.filter(x => x.proficient);
	if (skills.length) {
		const box = part(card, 'Skills', `Passive Perception ${s.passivePerception}`);
		for (const x of skills) chip(box, x.name, { bonus: formatMod(x.bonus), on: x.expertise, title: x.expertise ? 'Expertise' : undefined });
	}

	if (s.spellcasting) {
		const sc = s.spellcasting;
		const box = part(card, 'Spells', `${ABILITY_NAME[sc.ability]} · Save DC ${sc.dc} · Attack ${formatMod(sc.attack)}`);
		if (!s.spells.length) box.createSpan({ cls: 'dnd5e-brief-empty', text: 'None picked yet' });
		const byLevel = new Map<number, string[]>();
		for (const sp of s.spells) {
			const lv = sp.spell?.level ?? 1;
			byLevel.set(lv, [...(byLevel.get(lv) ?? []), sp.name]);
		}
		for (const lv of [...byLevel.keys()].sort((x, y) => x - y)) {
			const row = box.createDiv({ cls: 'dnd5e-brief-row' });
			row.createSpan({ cls: 'dnd5e-brief-row-label', text: lv === 0 ? 'Cantrips' : spellLevelLabel(lv, s.edition) });
			for (const n of byLevel.get(lv)!) chip(row, n);
		}
	}

	const features = s.features.filter(f => f.source !== 'Yours');
	if (features.length) {
		const box = part(card, 'Features');
		const bySource = new Map<string, string[]>();
		for (const f of features) bySource.set(f.source, [...(bySource.get(f.source) ?? []), f.name]);
		for (const [source, names] of bySource) {
			const row = box.createDiv({ cls: 'dnd5e-brief-row' });
			row.createSpan({ cls: 'dnd5e-brief-row-label', text: source });
			for (const n of names) chip(row, n);
		}
	}
}

/** The level up in brief: what changes. */
export function levelUpBrief(el: HTMLElement, d: LevelUp5eDraft, o: { gained: string[]; hpGain: string; increase?: string; subclass?: string; nextIncrease?: number }): void {
	const card = page(el);
	head(card, d.name, `${d.className} · level ${d.level - 1} → ${d.level}`);
	const pb = pbForLevel(d.level), was = pbForLevel(d.level - 1);
	statTiles(card, [
		{ label: 'Level', value: String(d.level), lead: true },
		// A known gain shows the new maximum; a roll waits for the die (rolled on Finish).
		/^\+\d+$/.test(o.hpGain)
			? { label: 'HP', value: o.hpGain, sub: typeof d.hpMax === 'number' ? `max ${d.hpMax + Number(o.hpGain.slice(1))}` : undefined }
			: { label: 'HP', value: 'Roll', sub: o.hpGain },
		{ label: 'PB', value: formatMod(pb), sub: pb > was ? `was ${formatMod(was)}` : undefined },
	], 'dnd5e-brief-tiles');
	if (o.gained.length) {
		const box = part(card, `New at level ${d.level}`);
		for (const g of o.gained) chip(box, g, { icon: 'sparkles' });
	}
	if (o.subclass !== undefined) chip(part(card, 'Subclass'), o.subclass || 'Not yet', { on: !!o.subclass, cls: o.subclass ? '' : 'is-faint' });
	if (o.increase) chip(part(card, d.asi === 'feat' ? 'Feat' : 'Increase'), o.increase, { on: true });
	if (d.spells.length) {
		const box = part(card, 'New spells');
		for (const n of d.spells) chip(box, n);
	}
	if (o.nextIncrease) card.createDiv({ cls: 'dnd5e-brief-foot', text: `Next increase at level ${o.nextIncrease}` });
}

// ----------------------------------------------------------------------------
// The ability scores step

/** Point buy's budget: 27 points, as a bar that fills, and what's left. */
export function pointBudget(parent: HTMLElement, d: Character5eDraft, ui: BuilderUI): void {
	const box = parent.createDiv({ cls: 'dnd5e-budget' });
	const top = box.createDiv({ cls: 'dnd5e-budget-top' });
	const left = top.createSpan({ cls: 'dnd5e-budget-left' });
	const spent = top.createSpan({ cls: 'dnd5e-budget-spent' });
	const bar = box.createDiv({ cls: 'dnd5e-budget-bar' });
	const fill = bar.createDiv({ cls: 'dnd5e-budget-fill' });
	ui.live(() => {
		const n = pointsSpent(d);
		box.toggleClass('is-over', n > 27);
		box.toggleClass('is-done', n === 27);
		left.setText(n > 27 ? `${n - 27} over` : `${27 - n} left`);
		spent.setText(`${Math.min(n, 99)} of 27 points`);
		fill.setCssProps({ '--fill': `${Math.min(100, (n / 27) * 100)}%` });
	});
}

/**
 * Six ability cards: the score (a stepper, except for the standard array, which is
 * set out for the class), and what it comes to: the bonus, the final score and its modifier.
 */
export function abilityCards(parent: HTMLElement, d: Character5eDraft, ui: BuilderUI, settle: (d: Character5eDraft) => Character5eDraft): void {
	const grid = parent.createDiv({ cls: 'dnd5e-ab-cards' });
	const buy = d.method === 'pointbuy';
	for (const a of ABILITIES) {
		const card = grid.createDiv({ cls: 'dnd5e-ab-card' });
		const top = card.createDiv({ cls: 'dnd5e-ab-card-top' });
		const id = `dnd5e-ab-${a}-${++ids}`;
		top.createSpan({ cls: 'dnd5e-ab-card-name', text: ABILITY_NAME[a], attr: { id } });
		const cost = top.createSpan({ cls: 'dnd5e-ab-card-cost' });
		const control = card.createDiv({ cls: 'dnd5e-ab-card-control' });
		if (d.method === 'array') {
			const v = control.createDiv({ cls: 'dnd5e-ab-card-base', attr: { 'aria-labelledby': id } });
			ui.live(() => v.setText(String(settle(d)[a] ?? 10)));
		} else {
			numberInput(control, {
				label: ABILITY_NAME[a], labelledBy: id, ui, min: buy ? 8 : 1, max: buy ? 15 : 20, placeholder: () => '10',
				get: () => (typeof d[a] === 'number' ? d[a] : undefined),
				set: v => { d[a] = v; },
			});
		}
		const result = card.createDiv({ cls: 'dnd5e-ab-card-result' });
		const plus = result.createSpan({ cls: 'dnd5e-ab-card-plus' });
		const final = result.createSpan({ cls: 'dnd5e-ab-card-final' });
		const mod = result.createSpan({ cls: 'dnd5e-ab-card-mod' });
		ui.live(() => {
			const f = finalScores(settle(d))[a];
			const b = bonuses(d)[a] ?? 0;
			plus.setText(b ? `+${b}` : '');
			plus.toggleClass('is-hidden', !b);
			final.setText(String(f));
			mod.setText(formatMod(Math.floor((f - 10) / 2)));
			card.toggleClass('has-bonus', !!b);
			cost.setText(buy ? `${POINT_COST[d[a] ?? 8] ?? '—'} pt${POINT_COST[d[a] ?? 8] === 1 ? '' : 's'}` : '');
		});
	}
}
