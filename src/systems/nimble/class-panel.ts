// The class panel on the Nimble sheet: the class's scrollwork heading, then
// every class thing in one frame (class-panel-def.ts says what): the name on the
// left (its formula is the tooltip; a chevron opens the book's words), what you
// track in the middle (dice, a bar, a number, pips, a state, a target), buttons
// on the right. Held dice are buttons: tap one to change it, tap an empty slot to
// add one rolled at the table (core's face picker). Every change is a
// frontmatter edit through the sheet (character-def.ts).

import { Notice, setIcon, setTooltip } from 'obsidian';
import { cluster } from '../../core/cluster';
import { dieShape } from '../../core/die-shape';
import { renderFacePicker } from '../../core/face-picker';
import { evIcon } from '../../core/icons';
import { pill } from '../../core/pill';
import { renderPipRow } from '../../core/pip-row';
import { addCondition, adjustResource, CharacterSheet, Frontmatter, regainMana, removeCondition, Resource, setMana, setQuarry, setResource, setRolled, spendMana } from './character-def';
import { classPanelRows, isStateCondition, PanelRow } from './class-panel-def';
import { renderClassScroll } from './class-scroll';
import type { Compendium } from './compendium';
import { openManaCalculator } from './hp-pad';
import { heldFaces } from './resource-def';
import { renderMeter, VitalsMemory } from './vitals-ui';

/** What the panel needs from the sheet that draws it. */
export interface ClassPanelHost {
	sheet: CharacterSheet;
	comp: Compendium;
	/** The note's path: keeps pip rows' animation per note. */
	path: string;
	vitals: VitalsMemory;
	/** Kept across redraws: rows opened to their rules (by row key), and the held die being entered (its row and slot). */
	ui: { open: Set<string>; picking?: { key: string; slot: number } };
	mutate(fn: (fm: Frontmatter, s: CharacterSheet) => void): Promise<void>;
	render(): void;
	/** Roll `n` dice of a held pool in the app and set them aside. */
	gainDice(res: Resource, n: number): void;
	promptNumber(label: string, value: number, done: (n: number) => void): void;
	promptText(label: string, value: string, done: (v: string) => void): void;
}

/** The panel, or nothing for a hero whose class tracks nothing. */
export function renderClassPanel(parent: HTMLElement, h: ClassPanelHost): HTMLElement | null {
	const s = h.sheet;
	const rows = classPanelRows(s, h.comp.rules.magicRules);
	if (!rows.length) return null;
	const panel = parent.createEl('section', { cls: 'ns-class' });
	renderClassScroll(panel, s.className || 'Class', 'ns-class-head', s.cls?.motif);
	for (const r of rows) renderRow(panel, r, h);
	return panel;
}

/** A compact button, built as a pill so its icon and label share one centre line. */
function button(parent: HTMLElement, text: string, run: () => void, o: { icon?: string; title?: string; disabled?: boolean; cls?: string } = {}): HTMLElement {
	const b = pill(parent, { tag: 'button', cls: `ns-btn${o.cls ? ` ${o.cls}` : ''}`, icon: o.icon, text: text || undefined, title: o.title });
	b.setAttr('type', 'button');
	b.toggleAttribute('disabled', !!o.disabled);
	b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); run(); });
	return b;
}

/** "Fury Dice" → "Fury die". */
const oneDie = (name: string) => name.replace(/\s+dice$/i, ' die');

function renderRow(panel: HTMLElement, r: PanelRow, h: ClassPanelHost): void {
	const open = h.ui.open.has(r.key);
	const row = panel.createDiv({ cls: `ns-feat is-${r.kind}${r.key === 'mana' ? ' is-mana' : ''}${open ? ' is-open' : ''}`, attr: { 'data-key': r.key } });

	// The name: a chevron opens the book's words; the formula is its tooltip.
	const tip = r.tip ? `${r.label}: ${r.tip}` : '';
	if (r.rules.length) {
		const name = row.createEl('button', { cls: 'ns-feat-name', attr: { 'aria-expanded': String(open) } });
		const b = name.createEl('b');
		const words = r.label.split(' ');
		const last = words.pop() ?? '';
		if (words.length) b.appendText(`${words.join(' ')} `);
		const nw = b.createSpan({ cls: 'ns-feat-nw', text: last });
		setIcon(nw.createSpan({ cls: 'ns-feat-chev' }), evIcon('chevron-down'));
		if (tip) setTooltip(name, tip, { delay: 350 });
		name.addEventListener('click', (e) => {
			e.preventDefault();
			const now = !row.hasClass('is-open');
			row.toggleClass('is-open', now);
			if (now) h.ui.open.add(r.key); else h.ui.open.delete(r.key);
			name.setAttr('aria-expanded', String(now));
		});
	} else {
		const name = row.createDiv({ cls: 'ns-feat-name' });
		name.createEl('b', { text: r.label });
		if (tip) setTooltip(name, tip, { delay: 350 });
	}

	const body = row.createDiv({ cls: 'ns-feat-o' });
	const acts = (): HTMLElement => cluster(row, { joined: true, cls: 'ns-feat-acts' });
	const s = h.sheet;

	switch (r.kind) {
		case 'pool': {
			renderMeter(body, {
				key: 'mana', cls: 'is-mana', icon: evIcon('sparkle'), label: 'Mana', cur: r.value, max: r.max,
				bar: 'ns-mana', minus: 'Spend 1 mana', plus: 'Regain 1 mana', calc: `Mana ${r.value} of ${r.max}. Spend, regain or set`,
				minusOff: r.value <= 0, plusOff: r.value >= r.max,
				icons: { minus: evIcon('minus'), plus: evIcon('plus'), calc: evIcon('keypad') }, twoTone: true,
				onCalc: (a) => openManaCalculator(a, { name: s.name, mana: r.value, max: r.max }, (cmd) => void h.mutate((fm, cur) => {
					if (cmd.kind === 'spend') spendMana(fm, cur, cmd.amount);
					else if (cmd.kind === 'regain') regainMana(fm, cur, cmd.amount);
					else setMana(fm, cur, cmd.amount);
				})),
				taps: {
					floor: -r.value,
					commit: (delta) => {
						if (!delta) { h.render(); return; }
						void h.mutate((fm, now) => { if (delta < 0) spendMana(fm, now, -delta); else regainMana(fm, now, delta); });
					},
				},
			}, h.vitals);
			break;
		}
		case 'dice': {
			const picking = h.ui.picking?.key === r.key ? h.ui.picking.slot : -1;
			const slots = Math.max(r.faces.length, r.max ?? r.faces.length + 1);
			for (let i = 0; i < slots; i++) {
				const held = i < r.faces.length;
				const face = held ? r.faces[i] : 0;
				const b = body.createEl('button', {
					cls: `ns-held-die is-d${r.sides}${held ? '' : ' is-empty'}${picking === i ? ' is-picking' : ''}`,
					attr: { type: 'button', 'aria-label': held ? `${oneDie(r.label)} ${face ? `showing ${face}` : 'not rolled'}: change it` : `Add a ${oneDie(r.label)} you rolled` },
				});
				dieShape(b, r.sides, { value: face || undefined, cls: held ? '' : 'is-empty' });
				if (!held) setIcon(b.createSpan({ cls: 'ns-held-plus' }), evIcon('plus'));
				b.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					h.ui.picking = picking === i ? undefined : { key: r.key, slot: held ? i : r.faces.length };
					h.render();
				});
			}
			const a = acts();
			button(a, r.roll === 1 ? 'Roll one' : 'Roll', () => h.gainDice(r.res, r.roll), {
				icon: evIcon('roll'), disabled: r.max !== undefined && r.faces.length >= r.max,
				title: r.roll === 1 ? `Roll a ${oneDie(r.label)} and set it aside` : `Roll ${r.label} up to ${r.max ?? ''}`.trim(),
			});
			button(a, 'Spend', () => void h.mutate((fm, cur) => {
				const now = cur.resources.find(x => x.name === r.res.name);
				setRolled(fm, r.res.name, heldFaces(now?.current ?? 0, now?.rolled).slice(0, -1));
			}), { disabled: !r.faces.length, title: `Spend a ${oneDie(r.label)}` });
			if (picking >= 0) {
				const changing = picking < r.faces.length;
				const write = (next: (faces: number[]) => number[]) => {
					h.ui.picking = undefined;
					void h.mutate((fm, cur) => {
						const now = cur.resources.find(x => x.name === r.res.name);
						setRolled(fm, r.res.name, next(heldFaces(now?.current ?? 0, now?.rolled)));
					});
				};
				renderFacePicker(row, {
					sides: r.sides, current: changing ? r.faces[picking] || undefined : undefined, cls: 'ns-feat-pick',
					label: changing ? `${oneDie(r.label)}: change it to` : `Add a ${oneDie(r.label)} you rolled`,
					pick: (f) => write(faces => { const out = faces.slice(); if (changing) out[picking] = f; else if (r.max === undefined || out.length < r.max) out.push(f); return out; }),
					remove: changing ? () => write(faces => faces.filter((_, k) => k !== picking)) : undefined,
				});
			}
			break;
		}
		case 'number': {
			const n = body.createEl('button', { cls: 'ns-feat-num', attr: { type: 'button', 'aria-label': `${r.label}: ${r.value} of ${r.max}. Set` } });
			n.createEl('b', { text: String(r.value) });
			n.createEl('small', { text: `of ${r.max}` });
			n.addEventListener('click', () => h.promptNumber(`${r.label} (0–${r.max})`, r.value, (v) => void h.mutate(fm => setResource(fm, r.res.name, Math.max(0, Math.min(r.max, Math.round(v)))))));
			const step = cluster(body, { joined: true, cls: 'ns-feat-step' });
			button(step, '', () => void h.mutate((fm, cur) => adjustResource(fm, cur, r.res.name, -1)), { icon: evIcon('minus'), title: `${r.label} −1`, disabled: r.value <= 0 });
			button(step, '', () => void h.mutate((fm, cur) => adjustResource(fm, cur, r.res.name, 1)), { icon: evIcon('plus'), title: `${r.label} +1`, disabled: r.value >= r.max });
			button(acts(), r.spend, () => h.promptNumber(`${r.spend} how much? (${r.value} left)`, Math.min(r.value, 5), (v) => {
				const amount = Math.max(0, Math.min(r.value, Math.round(v)));
				if (!amount) return;
				void h.mutate((fm, cur) => adjustResource(fm, cur, r.res.name, -amount)).then(() => new Notice(`${s.name}: ${r.label} −${amount} (${r.value - amount} left)`));
			}), { disabled: r.value <= 0 });
			break;
		}
		case 'uses': {
			renderPipRow(body, { name: r.label, count: r.left, max: r.max, cls: 'ns-uses', key: `${h.path}:${r.key}`, set: (n) => void h.mutate(fm => setResource(fm, r.res.name, n)) });
			body.createEl('small', { cls: 'ns-feat-count', text: `${r.left} of ${r.max}` });
			button(acts(), 'Use', () => void h.mutate((fm, cur) => adjustResource(fm, cur, r.res.name, -1)), { disabled: r.left <= 0, title: `Use ${r.label}` });
			break;
		}
		case 'charges': {
			const n = body.createSpan({ cls: 'ns-feat-num' });
			n.createEl('b', { text: String(r.value) });
			const a = acts();
			button(a, 'Gain', () => void h.mutate((fm, cur) => adjustResource(fm, cur, r.res.name, 1)), { title: `Gain one (${r.label})` });
			button(a, 'Spend', () => void h.mutate((fm, cur) => adjustResource(fm, cur, r.res.name, -1)), { disabled: r.value <= 0, title: `Spend one (${r.label})` });
			break;
		}
		case 'state': {
			pill(body, { cls: `ns-state${r.on ? ' is-on' : ''}`, icon: evIcon('flame'), text: r.on ? r.text : `Not ${r.text.toLowerCase()}` });
			const a = acts();
			if (r.on) {
				button(a, `End ${r.label.toLowerCase()}`, () => void h.mutate((fm, cur) => {
					for (const c of cur.conditions) if (isStateCondition(c, r)) removeCondition(fm, c);
					// The dice held while it lasts are lost when it ends (Fury Dice when your Rage ends).
					for (const res of cur.resources) if (r.dice.includes(res.name) && res.current) setRolled(fm, res.name, []);
				}));
			} else {
				button(a, r.label, () => {
					void h.mutate(fm => addCondition(fm, r.condition)).then(() => {
						for (const name of r.dice) {
							const d = h.sheet.resources.find(x => x.name === name);
							if (d && (d.max === undefined || d.current < d.max)) h.gainDice(d, 1);
						}
					});
				}, { title: `${r.label}: become ${r.text}${r.dice.length ? ` and roll ${r.dice.length === 1 ? `a ${r.dice[0].replace(/ice$/i, 'ie')}` : r.dice.join(' and ')}` : ''}` });
			}
			break;
		}
		case 'target': {
			const t = pill(body, { cls: `ns-state is-target${r.target ? ' is-on' : ''}`, icon: evIcon('target'), text: r.target || 'No quarry' });
			if (r.target) setTooltip(t, r.target, { delay: 350 });
			button(acts(), r.target ? 'Move mark' : 'Mark', () => h.promptText('Your Quarry', r.target, (v) => void h.mutate(fm => setQuarry(fm, v))));
			break;
		}
	}
	// Rows without buttons keep the grid's third column.
	if (!row.querySelector(':scope > .ns-feat-acts')) row.createSpan({ cls: 'ns-feat-acts is-none' });

	if (r.rules.length) {
		const box = row.createDiv({ cls: 'ns-feat-rule' });
		for (const x of r.rules) {
			const p = box.createEl('p');
			if (x.name !== r.label) p.createEl('b', { text: `${x.name}. ` });
			p.appendText(x.text);
		}
	}
}
