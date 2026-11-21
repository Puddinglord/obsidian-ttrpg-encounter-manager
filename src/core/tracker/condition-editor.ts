// Putting a condition on a combatant, in any game's tracker. One popover (a
// bottom sheet on phones):
//
// - The picker: search the game's conditions and your own, pick how long
//   (until removed, or a few rounds), tap one: done. Its preset timing comes
//   with it (5e's Burning deals 1d4 Fire at the start of each turn). Type a
//   name nobody has and it becomes a new condition of your own.
// - The details: how long it lasts (until removed, N rounds, until a save
//   ends it), when it counts down (the start or end of a turn, its own or the
//   creature that caused it), and what it does each turn: damage, a save, a
//   reminder. Opened for a new condition, a long press on one in the picker,
//   or a tap on a chip (then every change applies as it's made).
//
// The tracker gives the game's words (its abilities, damage types) and does
// the applying; the timing itself is core's (effects.ts).

import { setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { applyLook } from '../look';
import { evIcon, EvIconName } from '../icons';
import { pill } from '../pill';
import { closePopover, isPopoverOpenFor, openPopover } from '../popover';
import { onLongPress } from '../touch';
import type { AppliedCondition, ConditionDef, ConditionTiming, EffectTrigger, TurnBoundary } from '../types';
import { cleanTiming, customDef, describeTrigger, EffectWords, presetTiming, timingOf, untilSaved } from './effects';

export interface ConditionEditorOptions {
	/** The game, for its look ('dnd5e', 'nimble'). */
	system: string;
	/** Who it's going on. */
	bearer: { id: string; label: string };
	/** The game's conditions, then your own (settings.customConditions). */
	defs: readonly ConditionDef[];
	/** The names of your own, so they can be updated. */
	customNames?: readonly string[];
	/** What the bearer has now. */
	applied: readonly AppliedCondition[];
	/** Everyone else in the fight, for "counts down on whose turn". */
	others: readonly { id: string; label: string }[];
	/** Whose turn it is now: the likely cause of a new condition. */
	currentTurnId?: string;
	/** The game's abilities for saves, as it names them ("Wisdom", "WIL"). */
	abilities: readonly string[];
	/** Damage types to suggest ("Fire"). */
	damageTypes?: readonly string[];
	words?: EffectWords;
	/** A condition with a number (Exhaustion 2, Empowered X): its label, and whether the picker asks for it first. */
	value?: { label: string; ask?: boolean };
	/** Durations offered in the picker. */
	quick?: readonly [string, number | undefined][];
	/** Options drawn before the conditions (5e's Concentrating), filtered by the search. */
	extra?: (grid: HTMLElement, close: () => void, query: string) => void;
	/** Classes for the popover (a game's own). */
	cls?: string;
	/** The search box's placeholder. */
	placeholder?: string;
	sideOf?: HTMLElement | null;
	placement?: 'side' | 'below';
	width?: number;
	add(name: string, o: { timing?: ConditionTiming; value?: number; sourceId?: string }): void;
	/** Change one already on the bearer. */
	update(name: string, o: { timing: ConditionTiming; value?: number; sourceId?: string }): void;
	remove(name: string): void;
	/** Keep a condition of your own, with its timing as the default (settings.customConditions). */
	saveCustom?(def: { name: string; timing: ConditionTiming }): void;
}

const QUICK: readonly [string, number | undefined][] = [['Until removed', undefined], ['1 rd', 1], ['2', 2], ['3', 3], ['10', 10]];

/** An icon for a condition in the picker (the study's: what it does at a glance); a tag for any other. */
const CONDITION_ICONS: [RegExp, EvIconName][] = [
	[/blind|invisib|frighten|dazzl/i, 'eye'], [/charm|daz|stun|confus/i, 'sparkle'], [/burn|smolder|fire|ablaze/i, 'flame'],
	[/grappl|grab/i, 'hand'], [/restrain|paraly|petrif|held|bound/i, 'lock'], [/prone|hamper|slow/i, 'footprints'],
	[/poison|sick/i, 'poison'], [/bleed/i, 'drop'], [/unconscious|asleep|sleep/i, 'moon'], [/exhaust|fatigu/i, 'bed'],
	[/taunt|mark|target/i, 'target'], [/concentrat/i, 'concentration'], [/deaf|silenc/i, 'x'], [/incapacit/i, 'x'],
	[/weaken|vulnerab/i, 'heart-crack'], [/empower|haste|bless|raging|rage/i, 'zap'], [/dying|dead/i, 'skull'],
];
export function conditionIcon(name: string): string {
	return evIcon(CONDITION_ICONS.find(([re]) => re.test(name))?.[1] ?? 'tag');
}

/** A condition's rules in one line, for the picker: the first sentence, without markup. */
export function firstLine(text: string): string {
	// Past the books' preambles ("While you have the Blinded condition, you experience the following effects."),
	// run-in labels ("**Can't See.**") and a list's bullet (SRD 5.1 lists its rules), to what it does.
	const body = text.replace(/^\s*while you have the [^.:]*?condition[^.:]*[.:]\s*/i, '').replace(/\*\*[^*]{1,40}\*\*\s*/, '').replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, '');
	const plain = body.replace(/\*\*|__|[*_]/g, '').replace(/\s+/g, ' ').trim();
	const m = /^(.{1,140}?[.;])(\s|$)/.exec(plain);
	return (m ? m[1] : plain).replace(/[.;]$/, '');
}

/**
 * Keep a condition of your own (settings.customConditions, offered in every
 * game's trackers, the "/" menu and Omnisearch), with its timing as the default.
 * One by that name already: its timing is updated, its description kept unless
 * it was written from the timing.
 */
export function keepCustomCondition(plugin: EmberVaultPlugin, d: { name: string; timing: ConditionTiming }, words: EffectWords = {}): void {
	const list = plugin.settings.customConditions;
	const made = customDef(d.name, d.timing, words);
	const i = list.findIndex(c => sameName(c.name, d.name));
	if (i === -1) list.push(made);
	else {
		const old = list[i];
		const generated = old.description === customDef(old.name, old.timing ?? {}, words).description;
		list[i] = { ...old, description: generated ? made.description : old.description, ...(made.timing ? { timing: made.timing } : {}) };
		if (!made.timing) delete list[i].timing;
	}
	void plugin.saveSettings();
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The "+" on a combatant: pick a condition (two taps), or make one. */
export function openConditionPicker(anchor: HTMLElement, o: ConditionEditorOptions): void {
	if (isPopoverOpenFor(anchor, 'condition-picker')) { closePopover(); return; }
	let rounds: number | undefined;
	openPopover(anchor, (el, close) => {
		el.addClass('condition-picker');
		el.addClass('ev-cond-pop');
		if (o.cls) el.addClasses(o.cls.split(/\s+/).filter(Boolean));
		applyLook(el, o.system);
		el.setAttr('role', 'dialog');
		el.createDiv({ cls: 'popover-title', text: o.bearer.label });
		const box = el.createDiv({ cls: 'condition-search-box' });
		setIcon(box.createSpan({ cls: 'condition-search-icon', attr: { 'aria-hidden': 'true' } }), evIcon('search'));
		const search = box.createEl('input', { type: 'search', cls: 'condition-search', attr: { placeholder: o.placeholder ?? 'Condition, or a new one…', 'aria-label': 'Find or name a condition' } });
		const dur = el.createDiv({ cls: 'popover-row' });
		dur.createSpan({ cls: 'popover-label', text: 'Lasts' });
		const seg = dur.createDiv({ cls: 'nimble-segmented' });
		for (const [text, r] of o.quick ?? QUICK) {
			const b = seg.createEl('button', { text });
			if (r === rounds) b.addClass('is-active');
			b.onclick = () => { rounds = r; seg.querySelectorAll('button').forEach(n => n.removeClass('is-active')); b.addClass('is-active'); search.focus(); };
		}
		const grid = el.createDiv({ cls: 'condition-grid' });
		const valueRow = el.createDiv({ cls: 'popover-row condition-value-row' });
		valueRow.hide();
		// How long, under the list (the study's timing rows): set it, then tap a condition.
		el.appendChild(dur);

		const apply = (def: ConditionDef, value?: number) => {
			const preset = presetTiming(def);
			const timing: ConditionTiming = { ...preset, ...(rounds !== undefined ? { rounds } : {}) };
			o.add(def.name, { timing: Object.keys(timing).length ? timing : undefined, value, sourceId: o.currentTurnId });
			close();
		};
		const details = (name: string, def?: ConditionDef) => {
			const timing: ConditionTiming = { ...presetTiming(def), ...(rounds !== undefined ? { rounds } : {}) };
			drawDetails(el, o, { name, def, timing, isNew: true }, close);
		};
		const draw = () => {
			grid.empty();
			valueRow.hide();
			const q = search.value.trim().toLowerCase();
			o.extra?.(grid, close, q);
			const list = o.defs.filter(d => !d.auto && (!q || d.name.toLowerCase().includes(q)));
			for (const def of list) {
				const has = o.applied.some(x => sameName(x.name, def.name));
				const timed = !!presetTiming(def);
				const b = grid.createEl('button', {
					cls: `condition-option${has ? ' is-applied' : ''}${def.minor ? ' is-minor' : ''}${timed ? ' has-effects' : ''}`,
					attr: { 'aria-pressed': String(has), 'aria-label': def.name },
				});
				// The study's row: what it is at a glance, its name, what it does in one line, a check when it's on.
				setIcon(b.createSpan({ cls: 'condition-option-icon', attr: { 'aria-hidden': 'true' } }), conditionIcon(def.name));
				const text = b.createSpan({ cls: 'condition-option-text' });
				text.createEl('b', { cls: 'condition-option-name', text: def.name });
				if (def.description) text.createEl('small', { text: firstLine(def.description) });
				if (timed) setIcon(b.createSpan({ cls: 'ev-cond-mark', attr: { 'aria-hidden': 'true' } }), evIcon('zap'));
				if (has) setIcon(b.createSpan({ cls: 'condition-option-check', attr: { 'aria-hidden': 'true' } }), evIcon('check'));
				b.onclick = () => {
					if (has) { o.remove(def.name); close(); return; }
					if (def.hasValue && o.value?.ask) {
						valueRow.empty();
						valueRow.show();
						valueRow.createSpan({ cls: 'popover-label', text: `${def.name} ${o.value.label}` });
						const s2 = valueRow.createDiv({ cls: 'nimble-segmented' });
						for (const v of [1, 2, 3, 4, 5, 6]) s2.createEl('button', { text: String(v) }).onclick = () => apply(def, v);
						return;
					}
					apply(def, def.hasValue ? 1 : undefined);
				};
				// Long press or right-click: set its timing and effects before it goes on.
				if (!has) onLongPress(b, (e) => { e.preventDefault(); details(def.name, def); });
			}
			const typed = search.value.trim();
			if (typed && !o.defs.some(d => sameName(d.name, typed))) {
				const b = pill(grid, { tag: 'button', icon: 'plus', text: `New: ${typed}`, cls: 'ev-cond-new' });
				b.onclick = () => details(typed);
			}
			if (!grid.childElementCount) grid.createDiv({ cls: 'picker-empty', text: 'No match' });
		};
		search.addEventListener('input', draw);
		search.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter') return;
			e.preventDefault();
			(grid.querySelector<HTMLButtonElement>('button.condition-option:not(.is-applied)') ?? grid.querySelector<HTMLButtonElement>('button.ev-cond-new'))?.click();
		});
		draw();
		window.setTimeout(() => search.focus(), 0);
	}, { width: o.width ?? 320, sideOf: o.sideOf, placement: o.placement ?? 'side', cls: 'condition-picker' });
}

/** A chip tapped: its rules, how long it lasts, what it does each turn; changes apply as they're made. */
export function openConditionDetails(anchor: HTMLElement, o: ConditionEditorOptions, applied: AppliedCondition): void {
	if (isPopoverOpenFor(anchor)) { closePopover(); return; }
	const def = o.defs.find(d => sameName(d.name, applied.name));
	openPopover(anchor, (el, close) => {
		el.addClass('ev-cond-pop');
		if (o.cls) el.addClasses(o.cls.split(/\s+/).filter(Boolean));
		applyLook(el, o.system);
		drawDetails(el, o, { name: applied.name, def, timing: timingOf(applied), value: applied.value, sourceId: applied.sourceId }, close);
	}, { width: o.width ?? 320, sideOf: o.sideOf, placement: o.placement ?? 'side' });
}

interface Draft {
	name: string;
	def?: ConditionDef;
	timing: ConditionTiming;
	value?: number;
	sourceId?: string;
	/** Not on the bearer yet: an Add button instead of changes applying as they're made. */
	isNew?: boolean;
}

type Lasts = 'removed' | 'rounds' | 'saved';

function drawDetails(el: HTMLElement, o: ConditionEditorOptions, d: Draft, close: () => void): void {
	const handle = el.querySelector('.sheet-handle');
	el.empty();
	if (handle) el.appendChild(handle);
	el.removeClass('condition-picker');
	el.addClass('condition-editor');
	el.setAttr('role', 'dialog');
	const t: ConditionTiming = { ...cleanTiming(d.timing) };
	t.triggers = (t.triggers ?? []).map(x => ({ ...x }));
	let sourceId = d.sourceId ?? (o.currentTurnId && o.currentTurnId !== o.bearer.id ? o.currentTurnId : o.others[0]?.id);
	let value = d.value;
	const isCustom = !d.def || (o.customNames ?? []).some(n => sameName(n, d.name));
	let keep = !d.def; // a new name is kept for next time, unless the GM says not to

	const timing = (): ConditionTiming => {
		const out: ConditionTiming = {};
		if (t.rounds !== undefined) out.rounds = t.rounds;
		if (t.ends === 'start') out.ends = 'start';
		if (t.whose === 'source') out.whose = 'source';
		const triggers = (t.triggers ?? []).filter(x => cleanTiming({ triggers: [x] }).triggers);
		if (triggers.length) out.triggers = triggers;
		return out;
	};
	const commit = () => {
		if (d.isNew) return;
		o.update(d.name, { timing: timing(), value, sourceId: t.whose === 'source' ? sourceId : undefined });
	};

	el.createDiv({ cls: 'popover-title', text: `${d.name}${value ? ` ${value}` : ''}` });
	if (d.def?.description) el.createDiv({ cls: 'popover-body ev-cond-desc', text: d.def.description.replace(/\*\*/g, '') });

	// How long it lasts.
	const lastsOf = (): Lasts => (t.rounds !== undefined ? 'rounds' : untilSaved(t) ? 'saved' : 'removed');
	const lastsRow = el.createDiv({ cls: 'popover-row ev-cond-lasts' });
	lastsRow.createSpan({ cls: 'popover-label', text: 'Lasts' });
	const lastsSeg = lastsRow.createDiv({ cls: 'nimble-segmented' });
	const roundsRow = el.createDiv({ cls: 'popover-row ev-cond-rounds' });
	const countRow = el.createDiv({ cls: 'popover-row ev-cond-count' });
	const drawLasts = () => {
		lastsSeg.empty();
		const now = lastsOf();
		for (const [k, text] of [['removed', 'Until removed'], ['rounds', 'Rounds'], ['saved', 'Until saved']] as [Lasts, string][]) {
			const b = lastsSeg.createEl('button', { text, attr: { 'aria-pressed': String(now === k) } });
			if (now === k) b.addClass('is-active');
			b.onclick = () => {
				if (k === 'rounds') t.rounds = t.rounds ?? 1;
				else delete t.rounds;
				if (k === 'saved' && !untilSaved(t)) {
					const save = t.triggers?.find(x => x.kind === 'save');
					if (save) save.endsOnSave = true;
					else t.triggers = [...(t.triggers ?? []), { kind: 'save', at: 'end', ability: o.abilities[0], endsOnSave: true }];
				}
				if (k === 'removed') for (const x of t.triggers ?? []) if (x.kind === 'save') delete x.endsOnSave;
				commit();
				redraw();
			};
		}
		roundsRow.empty();
		countRow.empty();
		roundsRow.toggle(now === 'rounds');
		countRow.toggle(now === 'rounds');
		if (now !== 'rounds') return;
		roundsRow.createSpan({ cls: 'popover-label', text: 'Rounds' });
		stepper(roundsRow, t.rounds ?? 1, 1, 99, (n) => { t.rounds = n; commit(); }, 'Rounds');
		countRow.createSpan({ cls: 'popover-label', text: 'Ends at' });
		segmented(countRow, [['start', 'Start'], ['end', 'End']], t.ends ?? 'end', (v) => { t.ends = v as TurnBoundary; if (v === 'end') delete t.ends; commit(); });
		if (o.others.length) {
			const sel = countRow.createEl('select', { cls: 'dropdown ev-cond-whose', attr: { 'aria-label': 'Whose turn' } });
			sel.createEl('option', { value: '', text: 'of its turn' });
			for (const x of o.others) sel.createEl('option', { value: x.id, text: `of ${x.label}'s turn` });
			sel.value = t.whose === 'source' && sourceId ? sourceId : '';
			sel.onchange = () => {
				if (sel.value) { t.whose = 'source'; sourceId = sel.value; } else { delete t.whose; }
				commit();
			};
		}
	};

	// A number, for conditions that take one.
	if (d.def?.hasValue) {
		const vrow = el.createDiv({ cls: 'popover-row' });
		vrow.createSpan({ cls: 'popover-label', text: o.value?.label ?? 'Level' });
		const seg = vrow.createDiv({ cls: 'nimble-segmented' });
		for (const v of [1, 2, 3, 4, 5, 6]) {
			const b = seg.createEl('button', { text: String(v) });
			if (value === v) b.addClass('is-active');
			b.onclick = () => {
				value = v;
				seg.querySelectorAll('button').forEach(n => n.removeClass('is-active'));
				b.addClass('is-active');
				el.querySelector('.popover-title')?.setText(`${d.name} ${v}`);
				commit();
			};
		}
	}

	// What it does each turn.
	el.createDiv({ cls: 'ev-cond-section', text: 'Each turn' });
	const list = el.createDiv({ cls: 'ev-cond-triggers' });
	const adders = el.createDiv({ cls: 'ev-cond-adders' });
	const add = (kind: EffectTrigger['kind'], icon: string, text: string) => {
		pill(adders, { tag: 'button', icon, text, cls: 'ev-cond-add-trigger' }).onclick = () => {
			const x: EffectTrigger = kind === 'damage' ? { kind, at: 'start', dice: '', damageType: '' }
				: kind === 'save' ? { kind, at: 'end', ability: o.abilities[0], endsOnSave: true }
				: { kind, at: 'start', text: '' };
			t.triggers = [...(t.triggers ?? []), x];
			drawTriggers();
			drawLasts();
			list.querySelector<HTMLInputElement>('.ev-trigger:last-child input')?.focus();
		};
	};
	add('damage', 'flame', 'Damage');
	add('save', 'dices', 'Save');
	add('reminder', 'bell', 'Reminder');

	const drawTriggers = () => {
		list.empty();
		for (const x of t.triggers ?? []) drawTrigger(list, o, x, () => { commit(); drawLasts(); }, () => {
			t.triggers = (t.triggers ?? []).filter(y => y !== x);
			commit();
			drawTriggers();
			drawLasts();
		});
	};
	const redraw = () => { drawLasts(); drawTriggers(); };
	redraw();

	// Keep it for next time (your own conditions), then Add, or Remove.
	const foot = el.createDiv({ cls: 'ev-cond-foot' });
	if (o.saveCustom && isCustom) {
		const lab = foot.createEl('label', { cls: 'ev-cond-keep' });
		const box = lab.createEl('input', { type: 'checkbox' });
		box.checked = keep;
		lab.appendText(d.def ? 'Update my condition' : 'Keep in my conditions');
		box.onchange = () => { keep = box.checked; };
	}
	const save = () => { if (keep) o.saveCustom?.({ name: d.name, timing: timing() }); };
	if (d.isNew) {
		const b = pill(foot, { tag: 'button', icon: 'check', text: 'Add', cls: 'mod-cta ev-cond-apply' });
		b.onclick = () => {
			save();
			o.add(d.name, { timing: timing(), value: value ?? (d.def?.hasValue ? 1 : undefined), sourceId: t.whose === 'source' ? sourceId : o.currentTurnId });
			close();
		};
	} else {
		if (o.saveCustom && isCustom) {
			const b = pill(foot, { tag: 'button', icon: 'check', text: 'Done', cls: 'ev-cond-apply' });
			b.onclick = () => { save(); close(); };
		}
		const rm = el.createEl('button', { cls: 'mod-warning popover-remove', text: `Remove ${d.name}` });
		rm.onclick = () => { o.remove(d.name); close(); };
	}
}

/** One effect: what it is, its fields, start or end of turn, and ×. */
function drawTrigger(list: HTMLElement, o: ConditionEditorOptions, x: EffectTrigger, changed: () => void, remove: () => void): void {
	const row = list.createDiv({ cls: `ev-trigger is-${x.kind}` });
	const head = row.createDiv({ cls: 'ev-trigger-head' });
	setIcon(head.createSpan({ cls: 'ev-trigger-icon', attr: { 'aria-hidden': 'true' } }), x.kind === 'damage' ? 'flame' : x.kind === 'save' ? 'dices' : 'bell');
	const fields = head.createDiv({ cls: 'ev-trigger-fields' });
	const input = (cls: string, value: string, label: string, placeholder: string, set: (v: string) => void, type = 'text') => {
		const i = fields.createEl('input', { type, cls, value, attr: { 'aria-label': label, placeholder } });
		i.addEventListener('change', () => { set(i.value.trim()); changed(); });
		return i;
	};
	if (x.kind === 'damage') {
		input('ev-trigger-dice', x.dice ?? '', 'Damage dice', '1d4', v => { x.dice = v; });
		const type = input('ev-trigger-type', x.damageType ?? '', 'Damage type', 'Type', v => { x.damageType = v; });
		if (o.damageTypes?.length) {
			const id = `ev-dmg-types-${Math.random().toString(36).slice(2, 8)}`;
			const dl = fields.createEl('datalist', { attr: { id } });
			for (const d of o.damageTypes) dl.createEl('option', { value: d });
			type.setAttr('list', id);
		}
	} else if (x.kind === 'save') {
		const sel = fields.createEl('select', { cls: 'dropdown ev-trigger-ability', attr: { 'aria-label': 'Ability' } });
		for (const a of o.abilities) sel.createEl('option', { value: a, text: a });
		if (x.ability && !o.abilities.includes(x.ability)) sel.createEl('option', { value: x.ability, text: x.ability });
		sel.value = x.ability ?? o.abilities[0] ?? '';
		sel.onchange = () => { x.ability = sel.value; changed(); };
		input('ev-trigger-dc', x.dc !== undefined ? String(x.dc) : '', 'DC', 'DC', v => { const n = parseInt(v, 10); if (Number.isFinite(n)) x.dc = n; else delete x.dc; }, 'number');
	} else {
		input('ev-trigger-text', x.text ?? '', 'Reminder', "Can't take reactions", v => { x.text = v; });
	}
	const del = head.createEl('button', { cls: 'clickable-icon ev-trigger-remove', attr: { 'aria-label': `Remove: ${describeTrigger(x, o.words) || x.kind}` } });
	setIcon(del, 'x');
	del.onclick = remove;

	const when = row.createDiv({ cls: 'ev-trigger-when' });
	segmented(when, [['start', 'Start of turn'], ['end', 'End of turn']], x.at, (v) => { x.at = v as TurnBoundary; changed(); });
	if (x.kind === 'save') {
		const lab = when.createEl('label', { cls: 'ev-trigger-ends' });
		const box = lab.createEl('input', { type: 'checkbox' });
		box.checked = !!x.endsOnSave;
		lab.appendText('Success ends it');
		box.onchange = () => { if (box.checked) x.endsOnSave = true; else delete x.endsOnSave; changed(); };
	}
}

function segmented(parent: HTMLElement, items: [string, string][], active: string, pick: (v: string) => void): HTMLElement {
	const seg = parent.createDiv({ cls: 'nimble-segmented' });
	for (const [v, text] of items) {
		const b = seg.createEl('button', { text, attr: { 'aria-pressed': String(v === active) } });
		if (v === active) b.addClass('is-active');
		b.onclick = () => {
			seg.querySelectorAll('button').forEach(n => { n.removeClass('is-active'); n.setAttr('aria-pressed', 'false'); });
			b.addClass('is-active');
			b.setAttr('aria-pressed', 'true');
			pick(v);
		};
	}
	return seg;
}

function stepper(parent: HTMLElement, start: number, min: number, max: number, set: (n: number) => void, label: string): void {
	let n = start;
	const box = parent.createDiv({ cls: 'ev-stepper' });
	const minus = box.createEl('button', { cls: 'ev-stepper-btn', attr: { 'aria-label': `Fewer ${label.toLowerCase()}` } });
	setIcon(minus, 'minus');
	const input = box.createEl('input', { type: 'number', cls: 'ev-stepper-value', value: String(n), attr: { 'aria-label': label, min: String(min), max: String(max), inputmode: 'numeric' } });
	const plus = box.createEl('button', { cls: 'ev-stepper-btn', attr: { 'aria-label': `More ${label.toLowerCase()}` } });
	setIcon(plus, 'plus');
	const to = (v: number) => {
		const next = Math.max(min, Math.min(max, Math.round(v)));
		if (!Number.isFinite(next) || next === n) { input.value = String(n); return; }
		n = next;
		input.value = String(n);
		set(n);
	};
	minus.onclick = () => to(n - 1);
	plus.onclick = () => to(n + 1);
	input.addEventListener('change', () => to(parseInt(input.value, 10)));
}
