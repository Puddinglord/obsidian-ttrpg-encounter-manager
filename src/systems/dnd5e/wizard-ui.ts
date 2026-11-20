// How 5e's character wizards look: the sheet in brief beside every step (the
// hero on an oxblood banner, the numbers that matter, six ability plaques with
// their saves, skills, spells, features, proficiencies and equipment), the
// level up's summary, and the steps' own controls: point buy's budget, the
// ability cards (swap the array or your rolls between them, or step a score),
// grouped choices with their own limits, the increases for the levels a
// character starts past, and starting equipment as cards to pick from. The
// rules are in character-draft.ts; this only draws.

import { BuilderUI, numberInput, segmented, statTiles } from '../../core/builder/frame';
import { evIcon } from '../../core/icons';
import { applyLook } from '../../core/look';
import { pill } from '../../core/pill';
import { Sheet5e, pbForLevel } from './character';
import {
	bonuses, Character5eDraft, EquipGroup5e, finalScores, Increase5e, LevelUp5eDraft, POINT_COST, pointsSpent, rollScores, startScores, swapScores,
} from './character-draft';
import { formatMod } from './rules';
import { corners, profMark } from './sheet-parts';
import { ABILITIES, ABILITY_NAME, AbilityKey } from './types';

const short = (a: AbilityKey) => a.toUpperCase();
let ids = 0;
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** A spell level's heading, as the edition's book writes it. */
export function spellLevelLabel(level: number, edition: string): string {
	if (level === 0) return 'Cantrips';
	return edition === '2014' ? `${ordinal(level)} level` : `Level ${level}`;
}

/** The card a summary is drawn on: a page of the book under the sheet's oxblood banner. */
function page(el: HTMLElement): HTMLElement {
	const card = el.createDiv({ cls: 'dnd5e-card dnd5e-wizard-summary' });
	applyLook(card, 'dnd5e');
	return card;
}

function head(card: HTMLElement, name: string, line: string): void {
	const h = card.createDiv({ cls: 'dnd5e-brief-banner' });
	const t = h.createDiv({ cls: 'dnd5e-brief-titles' });
	t.createDiv({ cls: 'dnd5e-brief-name', text: name });
	if (line) t.createDiv({ cls: 'dnd5e-brief-line', text: line });
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

/** A row of chips under a small label. */
function row(box: HTMLElement, label: string, names: string[]): void {
	if (!names.length) return;
	const r = box.createDiv({ cls: 'dnd5e-brief-row' });
	r.createSpan({ cls: 'dnd5e-brief-row-label', text: label });
	for (const n of names) chip(r, n);
}

/** The sheet in brief: what the new character will have. */
export function sheetBrief(el: HTMLElement, s: Sheet5e, line: string, extra: { items?: { name: string; qty: number }[]; gold?: number } = {}): void {
	const card = page(el);
	head(card, s.name || 'New hero', line);

	statTiles(card, [
		{ label: 'HP', value: String(s.hpMax), sub: `${s.level}d${s.hitDie}`, lead: true },
		{ label: 'AC', value: String(s.ac), title: s.acFrom || undefined },
		{ label: 'Init', value: formatMod(s.initiative) },
		{ label: 'Speed', value: String(s.speed), sub: 'feet' },
		{ label: 'PB', value: formatMod(s.pb) },
	], 'dnd5e-brief-tiles');

	// Six plaques: the modifier large, the score in its lozenge, the save with its diamond.
	const grid = card.createDiv({ cls: 'dnd5e-brief-abilities' });
	for (const a of ABILITIES) {
		const save = s.saves[a];
		const c = grid.createDiv({ cls: `dnd5e-brief-ability${save.proficient ? ' is-prof' : ''}`, attr: { title: ABILITY_NAME[a] } });
		corners(c);
		c.createDiv({ cls: 'dnd5e-brief-ab-name', text: short(a) });
		c.createDiv({ cls: 'dnd5e-brief-ab-mod', text: formatMod(s.mods[a]) });
		c.createDiv({ cls: 'dnd5e-brief-ab-score', text: String(s.scores[a]) });
		const sv = c.createDiv({ cls: 'dnd5e-brief-ab-save' });
		profMark(sv, save.proficient ? 1 : 0);
		sv.createSpan({ cls: 'dnd5e-brief-ab-save-n', text: formatMod(save.bonus) });
	}

	const skills = s.skills.filter(x => x.proficient);
	if (skills.length) {
		const box = part(card, 'Skills', `Passive Perception ${s.passivePerception}`);
		for (const x of skills) {
			const c = chip(box, x.name, { bonus: formatMod(x.bonus), on: x.expertise, title: x.expertise ? 'Expertise' : undefined });
			profMark(c, x.expertise ? 2 : 1).addClass('dnd5e-brief-pm');
			c.prepend(c.lastChild!);
		}
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
		for (const lv of [...byLevel.keys()].sort((x, y) => x - y)) row(box, lv === 0 ? 'Cantrips' : spellLevelLabel(lv, s.edition), byLevel.get(lv)!);
	}

	const features = s.features.filter(f => f.source !== 'Yours');
	if (features.length) {
		const box = part(card, 'Features');
		const bySource = new Map<string, string[]>();
		for (const f of features) bySource.set(f.source, [...(bySource.get(f.source) ?? []), f.name]);
		for (const [source, names] of bySource) row(box, source === 'Feat' ? 'Feats' : source, names);
	}

	if (s.tools.length || s.languages.length || s.masteries.length) {
		const box = part(card, 'Proficiencies');
		row(box, 'Tools', s.tools);
		row(box, 'Languages', s.languages);
		row(box, 'Weapon mastery', s.masteries);
	}

	if (extra.items?.length || extra.gold) {
		const box = part(card, 'Equipment', extra.gold ? `${extra.gold} gp` : undefined);
		for (const i of extra.items ?? []) chip(box, i.qty > 1 ? `${i.qty} ${i.name}` : i.name);
	}
}

/** The level up in brief: what changes. */
export function levelUpBrief(el: HTMLElement, d: LevelUp5eDraft, o: { gained: string[]; hpGain: string; increase?: string; subclass?: string; nextIncrease?: number; slots?: string; picks?: string[] }): void {
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
		for (const g of o.gained) chip(box, g, { icon: evIcon('sparkle') });
	}
	if (o.slots) part(card, 'Spell slots').createSpan({ cls: 'dnd5e-brief-slots', text: o.slots });
	if (o.subclass !== undefined) chip(part(card, 'Subclass'), o.subclass || 'Not yet', { on: !!o.subclass, cls: o.subclass ? '' : 'is-faint' });
	if (o.increase) chip(part(card, d.asi === 'feat' ? 'Feat' : 'Increase'), o.increase, { on: true });
	if (o.picks?.length) {
		const box = part(card, 'Chosen');
		for (const n of o.picks) chip(box, n);
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

/** The roll: six scores (4d6, the lowest die dropped), set out for the class; Roll again replaces them. */
export function rollRow(parent: HTMLElement, d: Character5eDraft, ui: BuilderUI, assign: (values: number[]) => void): void {
	const box = parent.createDiv({ cls: 'dnd5e-roll-row' });
	const values = box.createDiv({ cls: 'dnd5e-roll-values' });
	const btn = pill(box, { tag: 'button', icon: evIcon('dice'), text: d.rolled?.length ? 'Roll again' : 'Roll 4d6', cls: 'dnd5e-roll-btn mod-cta' });
	btn.addEventListener('click', () => {
		d.rolled = rollScores();
		d.arranged = false;
		assign(d.rolled);
		ui.rebuild();
	});
	ui.live(() => {
		values.empty();
		for (const v of d.rolled ?? []) values.createSpan({ cls: 'dnd5e-roll-value', text: String(v) });
	});
}

/**
 * Six ability cards in the sheet's plaques: the score (a dropdown that swaps it with another ability for the standard
 * array and rolls, a stepper for point buy and your own), and what it comes to: the bonus, the final score and its modifier.
 */
export function abilityCards(parent: HTMLElement, d: Character5eDraft, ui: BuilderUI, settle: (d: Character5eDraft) => Character5eDraft): void {
	const grid = parent.createDiv({ cls: 'dnd5e-ab-cards' });
	const buy = d.method === 'pointbuy';
	const swaps = d.method === 'array' || d.method === 'roll';
	for (const a of ABILITIES) {
		const card = grid.createDiv({ cls: `dnd5e-ab-card is-${a}` });
		corners(card);
		const top = card.createDiv({ cls: 'dnd5e-ab-card-top' });
		const id = `dnd5e-ab-${a}-${++ids}`;
		top.createSpan({ cls: 'dnd5e-ab-card-name', text: ABILITY_NAME[a], attr: { id } });
		const cost = top.createSpan({ cls: 'dnd5e-ab-card-cost' });
		const control = card.createDiv({ cls: 'dnd5e-ab-card-control' });
		if (swaps) {
			const sel = control.createEl('select', { cls: 'dropdown dnd5e-ab-card-swap', attr: { 'aria-labelledby': id } });
			sel.dataset.field = ABILITY_NAME[a];
			ui.live(() => {
				settle(d);
				sel.empty();
				for (const b of ABILITIES) sel.createEl('option', { value: b, text: String(d[b] ?? 10) }).selected = b === a;
			});
			sel.addEventListener('change', () => { swapScores(d, a, sel.value as AbilityKey); ui.changed(); });
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
			const f = startScores(settle(d))[a];
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

// ----------------------------------------------------------------------------
// Choices in groups, each with its own limit (tools from three places, a class's options, equipment picks)

export interface ChipGroup { label: string; count: number; from: string[]; given?: string[]; meta?: (opt: string) => string; /** The chip's words, when they aren't the value ("Archery" for "Fighting Style: Archery"). */ name?: (opt: string) => string }

/** Chips under headings, all writing one list on the draft; each group stops at its own count. */
export function groupChips(parent: HTMLElement, d: Record<string, unknown>, key: string, groups: ChipGroup[], ui: BuilderUI): void {
	const list = () => (Array.isArray(d[key]) ? d[key] as string[] : (d[key] = [] as string[]));
	const box = parent.createDiv({ cls: 'eb-picks is-grouped', attr: { role: 'group' } });
	for (const g of groups) {
		const sec = box.createDiv({ cls: 'eb-pick-group' });
		const h = sec.createDiv({ cls: 'eb-pick-head' });
		h.createSpan({ cls: 'eb-pick-head-label', text: g.label });
		const count = h.createSpan({ cls: 'eb-pick-head-count' });
		const r = sec.createDiv({ cls: 'eb-pick-row' });
		for (const v of g.given ?? []) pill(r, { tag: 'span', icon: evIcon('check'), text: v, cls: 'eb-pick-given' }).dataset.fixed = v;
		const mine = () => list().filter(x => g.from.includes(x));
		for (const opt of g.from) {
			const b = pill(r, { tag: 'button', text: g.name?.(opt) ?? opt, cls: 'eb-pick', attr: { type: 'button', 'aria-pressed': 'false' } }) as HTMLButtonElement;
			b.dataset.value = opt;
			if (g.meta) b.createSpan({ cls: 'eb-pick-meta', text: g.meta(opt) });
			b.addEventListener('click', () => {
				const now = list();
				d[key] = now.includes(opt) ? now.filter(x => x !== opt) : [...now, opt];
				ui.changed();
			});
			ui.live(() => {
				const on = list().includes(opt);
				b.toggleClass('is-active', on);
				b.setAttr('aria-pressed', String(on));
				b.disabled = !on && mine().length >= g.count;
			});
		}
		ui.live(() => count.setText(`${mine().length} of ${g.count}`));
	}
}

// ----------------------------------------------------------------------------
// Increases for the levels a new character starts past

/** One card per Ability Score Improvement: +2 to one, +1 to two, or a feat. */
export function increaseCards(parent: HTMLElement, d: Character5eDraft, ui: BuilderUI, feats: (level: number) => string[]): void {
	const box = parent.createDiv({ cls: 'dnd5e-asi-list' });
	for (const inc of d.increases ?? []) {
		const card = box.createDiv({ cls: 'dnd5e-asi-card' });
		const top = card.createDiv({ cls: 'dnd5e-asi-top' });
		top.createSpan({ cls: 'dnd5e-asi-level', text: `Level ${inc.level}` });
		const what = top.createSpan({ cls: 'dnd5e-asi-what' });
		segmented<Increase5e['take']>(card, [{ value: 'plus2', label: '+2 to one' }, { value: 'plus1', label: '+1 to two' }, { value: 'feat', label: 'A feat' }], () => inc.take, v => { inc.take = v; ui.rebuild(); }, { label: `Level ${inc.level} increase`, ui, cls: 'is-compact', key: `asi-${inc.level}` });
		const fields = card.createDiv({ cls: 'dnd5e-asi-fields' });
		const select = (label: string, value: () => string, set: (v: string) => void, options: { value: string; label: string }[]) => {
			const sel = fields.createEl('select', { cls: 'dropdown eb-select', attr: { 'aria-label': `Level ${inc.level}: ${label}` } });
			sel.dataset.field = `${label} ${inc.level}`;
			for (const o of options) sel.createEl('option', { value: o.value, text: o.label }).selected = o.value === value();
			sel.addEventListener('change', () => { set(sel.value); ui.changed(); });
		};
		const abilities = ABILITIES.map(a => ({ value: a, label: ABILITY_NAME[a] }));
		if (inc.take !== 'feat') select('Ability', () => inc.a1, v => { inc.a1 = v; }, abilities);
		if (inc.take === 'plus1') select('And', () => inc.a2, v => { inc.a2 = v; }, abilities);
		if (inc.take === 'feat') select('Feat', () => inc.feat, v => { inc.feat = v; }, [{ value: '', label: 'Choose a feat' }, ...feats(inc.level).map(f => ({ value: f, label: f }))]);
		ui.live(() => {
			const before = startScores(d);
			const after = finalScores(d);
			const changed = ABILITIES.filter(a => after[a] !== before[a]);
			what.setText(inc.take === 'feat' ? inc.feat || '' : changed.map(a => `${short(a)} ${after[a]}`).join(' · '));
		});
	}
}

// ----------------------------------------------------------------------------
// Starting equipment: each choice as cards (A, B…), with any pick from a category under the card

/** What an option holds, in a line: "Chain Mail, Greatsword, 8 Javelin, 4 GP". */
function optionText(o: EquipGroup5e['options'][number]): string {
	return [...o.items.map(i => (i.qty > 1 ? `${i.qty} ${i.name}` : i.name)), ...o.picks.map(p => `${p.count > 1 ? `${p.count} ` : ''}${p.label.replace(/s$/, '')} of your choice`), ...(o.gold ? [`${o.gold} GP`] : [])].join(', ') || '—';
}

export function equipmentGroups(parent: HTMLElement, d: Character5eDraft, ui: BuilderUI, title: string, prefix: string, groups: EquipGroup5e[], given: { name: string; qty: number }[]): void {
	if (!groups.length && !given.length) return;
	const sec = parent.createDiv({ cls: 'dnd5e-eq' });
	sec.createDiv({ cls: 'dnd5e-eq-title', text: title });
	if (given.length) {
		const g = sec.createDiv({ cls: 'dnd5e-eq-given' });
		for (const i of given) pill(g, { tag: 'span', icon: evIcon('check'), text: i.qty > 1 ? `${i.qty} ${i.name}` : i.name, cls: 'eb-pick-given' });
	}
	groups.forEach((g, gi) => {
		const key = `${prefix}${gi}`;
		const wrap = sec.createDiv({ cls: 'dnd5e-eq-group', attr: { role: 'radiogroup', 'aria-label': g.label || title } });
		const current = () => g.options.find(o => o.label === d.equip?.[key]) ?? g.options[0];
		for (const o of g.options) {
			const card = wrap.createEl('button', { cls: 'dnd5e-eq-option', attr: { type: 'button', role: 'radio' } });
			card.dataset.option = `${key}:${o.label}`;
			if (g.options.length > 1) card.createSpan({ cls: 'dnd5e-eq-letter', text: o.label });
			card.createSpan({ cls: 'dnd5e-eq-text', text: optionText(o) });
			card.addEventListener('click', () => { d.equip = { ...d.equip, [key]: o.label }; ui.rebuild(); });
			ui.live(() => { const on = current() === o; card.toggleClass('is-active', on); card.setAttr('aria-checked', String(on)); });
		}
		const o = current();
		o?.picks.forEach((p, pi) => {
			const pk = `${key}.${o.label}.${pi}`;
			for (let n = 0; n < p.count; n++) {
				const sel = wrap.createEl('select', { cls: 'dropdown eb-select dnd5e-eq-pick', attr: { 'aria-label': p.label } });
				sel.dataset.field = `${p.label} ${gi + 1}.${n + 1}`;
				const now = d.equipPicks?.[pk] ?? [];
				for (const x of p.from) sel.createEl('option', { value: x, text: x }).selected = x === (now[n] ?? p.from[n] ?? p.from[0]);
				sel.addEventListener('change', () => {
					const list = [...(d.equipPicks?.[pk] ?? p.from.slice(0, p.count))];
					list[n] = sel.value;
					d.equipPicks = { ...d.equipPicks, [pk]: list };
					ui.changed();
				});
			}
		});
	});
}
