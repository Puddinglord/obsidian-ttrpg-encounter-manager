// The 5e stat block, in the layout of the rules it's written for: the 2014
// block (Armor Class, Hit Points, a row of six abilities, Challenge) or the
// 2024 one (AC and Initiative, abilities with MOD and SAVE, CR with XP and PB).
// Attack bonuses, saves, checks and damage dice roll when clicked.

import { App } from 'obsidian';
import { pill } from '../../core/pill';
import { appendRichText } from '../../core/markdown';
import { appendWithTerms, markTerm, TermContext } from '../../core/rule-term-ui';
import { wireWikiLinks } from '../../core/wiki-links';
import type { Dnd5eEdition } from './editions';
import { abilityMod, formatMod, initiativeOf, pbForCr, saveOf, xpOf } from './rules';
import { ABILITIES, AbilityKey, Dnd5eMonster, Feature5e } from './types';
import { applyLook } from '../../core/look';

export interface Statblock5eAction {
	label: string;
	icon?: string;
	cls?: string;
	onClick: (ev: MouseEvent) => void;
}

export interface Render5eOptions {
	app: App;
	sourcePath: string;
	variant: 'block' | 'hover' | 'inline';
	/** Layout; the monster's own edition wins, then this, then 2024. */
	edition?: Dnd5eEdition;
	/** Roll a dice expression ("1d20+4", "2d6+2"); `label` says what it's for. Unset: dice are plain text. */
	onRoll?: (expression: string, label: string) => void;
	/** Buttons under the block (hover cards). */
	actions?: Statblock5eAction[];
	/** Players: what the heroes could know (name, kind, lore), no numbers. */
	lore?: boolean;
	/** The game's rules words: labels, senses, languages, conditions… become clickable. */
	terms?: TermContext;
}

const LABEL: Record<AbilityKey, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

/** "+4 to hit" (2014) and "Attack Roll: +4" (2024). Group 1 or 2 is the bonus. */
const TO_HIT = /([+\-−]\s?\d+) to hit|Attack Roll:\s*([+\-−]\s?\d+)/;

const signedExpr = (mod: number) => (mod === 0 ? '1d20' : `1d20${mod > 0 ? '+' : '-'}${Math.abs(mod)}`);

/** The words the books set in italics inside an action: "Melee Attack Roll:", "Hit:", "Failure:"… */
const BOOK_ITALICS = /\b(?:(?:Melee or Ranged|Melee|Ranged) (?:Weapon |Spell )?Attack(?: Roll)?|(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw|Hit or Miss|Failure or Success|Hit|Miss|Failure|Success|Trigger|Response):/g;

/** Set the book's italic words in `el`'s own text (rolls and rules words keep their elements). */
export function italicizeBookWords(el: HTMLElement): void {
	const doc = el.ownerDocument;
	el.normalize(); // "Melee " and "Attack Roll: " can arrive as two text nodes
	const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	while (walker.nextNode()) {
		const n = walker.currentNode as Text;
		if (n.parentElement === el) nodes.push(n);
	}
	for (const n of nodes) {
		const text = n.textContent ?? '';
		const hits = [...text.matchAll(BOOK_ITALICS)];
		if (!hits.length) continue;
		const frag = createFragment();
		let at = 0;
		for (const h of hits) {
			const i = h.index ?? 0;
			if (i > at) frag.appendText(text.slice(at, i));
			frag.createEl('em', { cls: 'dnd5e-book-italic', text: h[0] });
			at = i + h[0].length;
		}
		if (at < text.length) frag.appendText(text.slice(at));
		n.replaceWith(frag);
	}
}

export function renderStatblock5e(el: HTMLElement, m: Dnd5eMonster, opts: Render5eOptions): HTMLElement {
	const edition = m.edition ?? opts.edition ?? '2024';
	const block = el.createDiv({ cls: `dnd5e-statblock ed-${edition} ${opts.variant}` });
	applyLook(block, 'dnd5e');
	block.dataset.sourcePath = opts.sourcePath;
	const roll = opts.onRoll;
	const terms = opts.terms;
	/** Text with rules words marked: every term in a field (Senses, Languages), only running-text ones in prose. */
	const marked = (parent: HTMLElement, text: string, prose = false) => {
		if (terms) appendWithTerms(parent, text, terms, { prose });
		else parent.appendText(text);
	};
	const mark = (el: HTMLElement, word: string) => { if (terms) markTerm(el, terms, word); return el; };

	/** A clickable roll (or plain text when rolling is off). */
	const rollable = (parent: HTMLElement, text: string, expression: string, label: string) => {
		const span = parent.createSpan({ cls: 'dnd5e-roll', text });
		if (!roll) return span;
		span.addClass('is-clickable');
		span.setAttr('role', 'button');
		span.setAttr('tabindex', '0');
		span.setAttr('aria-label', `Roll ${expression}`);
		const go = (e: Event) => { e.preventDefault(); e.stopPropagation(); roll(expression, label); };
		span.addEventListener('click', go);
		span.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
		return span;
	};

	/** Rules text: markdown, dice, and attack bonuses as d20 rolls. */
	const rich = (parent: HTMLElement, text: string, what: string) => {
		const onDice = roll ? (d: HTMLElement, expression: string) => {
			d.addClass('is-clickable');
			d.setAttr('role', 'button');
			d.setAttr('tabindex', '0');
			d.setAttr('aria-label', `Roll ${expression}`);
			const go = (e: Event) => { e.preventDefault(); e.stopPropagation(); roll(expression, `${m.name}: ${what}`); };
			d.addEventListener('click', go);
			d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
		} : undefined;
		const write = (t: string) => {
			if (terms) appendWithTerms(parent, t, terms, { onDice });
			else appendRichText(parent, t, { onDice });
		};
		let rest = text;
		for (let hit = TO_HIT.exec(rest); hit; hit = TO_HIT.exec(rest)) {
			write(rest.slice(0, hit.index));
			const bonus = Number((hit[1] ?? hit[2]).replace(/\s/g, '').replace('−', '-'));
			const whole = hit[0];
			const at = whole.indexOf(hit[1] ?? hit[2]);
			if (at > 0) parent.appendText(whole.slice(0, at));
			rollable(parent, (hit[1] ?? hit[2]).replace('-', '−'), signedExpr(bonus), `${m.name}: ${what} (attack)`);
			parent.appendText(whole.slice(at + (hit[1] ?? hit[2]).length));
			rest = rest.slice(hit.index + whole.length);
		}
		write(rest);
	};

	// Name and kind.
	const head = block.createDiv({ cls: 'dnd5e-head' });
	head.createDiv({ cls: 'dnd5e-name', text: m.name });
	const kind = [m.size, m.type].filter(Boolean).join(' ');
	const meta = [kind, m.alignment].filter(Boolean).join(', ');
	if (meta) head.createDiv({ cls: 'dnd5e-meta', text: meta });

	if (opts.lore) {
		if (m.description) rich(block.createDiv({ cls: 'dnd5e-lore' }), m.description, 'lore');
		else block.createDiv({ cls: 'dnd5e-lore is-empty', text: 'No lore written for this creature yet.' });
		wireWikiLinks(block, opts.app, opts.sourcePath);
		return block;
	}

	const rule = () => block.createDiv({ cls: 'dnd5e-rule', attr: { 'aria-hidden': 'true' } });
	const line = (parent: HTMLElement, label: string, fill: (v: HTMLElement) => void) => {
		const p = parent.createDiv({ cls: 'dnd5e-line' });
		mark(p.createSpan({ cls: 'dnd5e-label', text: label }), label);
		p.appendText(' ');
		fill(p.createSpan({ cls: 'dnd5e-value' }));
		return p;
	};
	const hpText = (v: HTMLElement) => {
		v.appendText(String(m.hp));
		if (m.hpFormula) {
			v.appendText(' (');
			rollable(v, m.hpFormula, m.hpFormula.replace(/\s/g, '').replace('−', '-'), `${m.name}: hit points`);
			v.appendText(')');
		}
	};
	const init = initiativeOf(m);

	rule();
	const core = block.createDiv({ cls: 'dnd5e-core' });
	if (edition === '2014') {
		line(core, 'Armor Class', v => v.setText(m.acNote ? `${m.ac} (${m.acNote})` : String(m.ac)));
		line(core, 'Hit Points', hpText);
		if (m.speed) line(core, 'Speed', v => marked(v, m.speed!));
	} else {
		// AC and Initiative share a line, each label kept with its value.
		const top = core.createDiv({ cls: 'dnd5e-line dnd5e-ac-init' });
		const ac = top.createSpan({ cls: 'dnd5e-pair' });
		mark(ac.createSpan({ cls: 'dnd5e-label', text: 'AC' }), 'AC');
		ac.appendText(' ');
		ac.createSpan({ cls: 'dnd5e-value', text: String(m.ac) });
		const ini = top.createSpan({ cls: 'dnd5e-pair' });
		mark(ini.createSpan({ cls: 'dnd5e-label dnd5e-init-label', text: 'Initiative' }), 'Initiative');
		ini.appendText(' ');
		const iv = ini.createSpan({ cls: 'dnd5e-value' });
		rollable(iv, formatMod(init), signedExpr(init), `${m.name}: initiative`);
		iv.appendText(` (${10 + init})`);
		line(core, 'HP', hpText);
		if (m.speed) line(core, 'Speed', v => marked(v, m.speed!));
	}

	// Abilities.
	rule();
	if (edition === '2014') {
		const grid = block.createDiv({ cls: 'dnd5e-ab24-wrap' }).createDiv({ cls: 'dnd5e-abilities' });
		ABILITIES.forEach((a, i) => {
			const cell = grid.createDiv({ cls: 'dnd5e-ability' });
			mark(cell.createDiv({ cls: 'dnd5e-ability-name' }).createSpan({ text: LABEL[a] }), LABEL[a]);
			const v = cell.createDiv({ cls: 'dnd5e-ability-score' });
			const mod = abilityMod(m.abilities[i]);
			v.appendText(`${m.abilities[i]} (`);
			rollable(v, formatMod(mod), signedExpr(mod), `${m.name}: ${LABEL[a]} check`);
			v.appendText(')');
		});
	} else {
		// One grid for the whole table (each cell a subgrid), so MOD and SAVE line up at any width.
		const table = block.createDiv({ cls: 'dnd5e-ab24-wrap' }).createDiv({ cls: 'dnd5e-abilities-2024' });
		for (let i = 0; i < 3; i++) {
			const h = table.createDiv({ cls: 'dnd5e-ab24 is-head', attr: { 'aria-hidden': 'true' } });
			for (const t of ['', '', 'Mod', 'Save']) h.createSpan({ text: t });
		}
		for (const group of [['str', 'dex', 'con'], ['int', 'wis', 'cha']] as AbilityKey[][]) {
			for (const a of group) {
				const i = ABILITIES.indexOf(a);
				const cell = table.createDiv({ cls: `dnd5e-ab24 ab-${a}` });
				mark(cell.createSpan({ cls: 'dnd5e-ab24-name', text: LABEL[a][0] + LABEL[a].slice(1).toLowerCase() }), LABEL[a]);
				cell.createSpan({ cls: 'dnd5e-ab24-score', text: String(m.abilities[i]) });
				const mod = abilityMod(m.abilities[i]);
				rollable(cell.createSpan({ cls: 'dnd5e-ab24-mod' }), formatMod(mod), signedExpr(mod), `${m.name}: ${LABEL[a]} check`);
				const save = saveOf(m, a);
				rollable(cell.createSpan({ cls: 'dnd5e-ab24-save' }), formatMod(save), signedExpr(save), `${m.name}: ${LABEL[a]} save`);
			}
		}
	}

	// Details.
	rule();
	const details = block.createDiv({ cls: 'dnd5e-details' });
	const bonusList = (v: HTMLElement, entries: [string, number][], what: string) => {
		entries.forEach(([name, n], i) => {
			if (i) v.appendText(', ');
			// A skill and its bonus wrap together, never apart.
			const pair = v.createSpan({ cls: 'dnd5e-bonus' });
			mark(pair.createSpan({ text: name }), name);
			pair.appendText(' ');
			rollable(pair, formatMod(n), signedExpr(n), `${m.name}: ${name}${what}`);
		});
	};
	if (edition === '2014') {
		const saves = Object.entries(m.saves ?? {}) as [AbilityKey, number][];
		if (saves.length) line(details, 'Saving Throws', v => bonusList(v, saves.map(([k, n]) => [LABEL[k][0] + LABEL[k].slice(1).toLowerCase(), n]), ' save'));
	}
	const skills = Object.entries(m.skills ?? {});
	if (skills.length) line(details, 'Skills', v => bonusList(v, skills, ''));
	const dmg = (label: string, xs?: string[]) => { if (xs?.length) line(details, label, v => marked(v, xs.join(xs.some(x => x.includes(',')) ? '; ' : ', '))); };
	if (edition === '2014') {
		dmg('Damage Vulnerabilities', m.vulnerabilities);
		dmg('Damage Resistances', m.resistances);
		dmg('Damage Immunities', m.immunities);
		dmg('Condition Immunities', m.conditionImmunities);
	} else {
		dmg('Vulnerabilities', m.vulnerabilities);
		dmg('Resistances', m.resistances);
		const imm = [m.immunities?.join(', '), m.conditionImmunities?.join(', ')].filter(Boolean);
		if (imm.length) line(details, 'Immunities', v => marked(v, imm.join('; ')));
		if (m.gear) line(details, 'Gear', v => v.setText(m.gear!));
	}
	if (m.senses) line(details, 'Senses', v => marked(v, m.senses!));
	line(details, 'Languages', v => marked(v, m.languages || '—'));
	const xp = xpOf(m);
	const pb = m.pb ?? pbForCr(m.cr);
	if (edition === '2014') {
		// The 2014 block ends its details at Challenge, as the SRD 5.1 prints it (no Proficiency Bonus line).
		line(details, 'Challenge', v => v.setText(`${m.cr} (${xp.toLocaleString('en-US')} XP)`));
	} else {
		const lair = m.xpLair ? `, or ${m.xpLair.toLocaleString('en-US')} in lair` : '';
		line(details, 'CR', v => marked(v, `${m.cr} (XP ${xp.toLocaleString('en-US')}${lair}; PB ${formatMod(pb)})`));
	}

	// Traits and actions.
	const section = (title: string | null, items: Feature5e[] | undefined, intro?: string) => {
		if (!items?.length) return;
		if (title) mark(block.createDiv({ cls: 'dnd5e-section' }).createSpan({ text: title }), title);
		else rule();
		if (intro) rich(block.createDiv({ cls: 'dnd5e-intro' }), intro, title ?? 'trait');
		for (const f of items) {
			const p = block.createDiv({ cls: 'dnd5e-feature' });
			p.createSpan({ cls: 'dnd5e-feature-name', text: `${f.name}.` });
			p.appendText(' ');
			const paras = f.desc.split('\n');
			paras.forEach((para, i) => {
				if (i) p.createEl('br');
				rich(p, para, f.name);
			});
			italicizeBookWords(p);
		}
	};
	section(edition === '2014' ? null : 'Traits', m.traits);
	section('Actions', m.actions);
	section('Bonus Actions', m.bonusActions);
	section('Reactions', m.reactions);
	section('Legendary Actions', m.legendaryActions, m.legendaryIntro);

	if (m.description && opts.variant === 'block') {
		const lore = block.createEl('details', { cls: 'dnd5e-description' });
		lore.createEl('summary', { text: 'Lore' });
		rich(lore.createDiv(), m.description, 'lore');
	}
	if (m.source) block.createDiv({ cls: 'dnd5e-source', text: m.source });

	if (opts.actions?.length) {
		const bar = block.createDiv({ cls: 'statblock-actions' });
		for (const a of opts.actions) {
			const b = pill(bar, { tag: 'button', cls: `statblock-action ${a.cls ?? ''}`, icon: a.icon, text: a.label });
			b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); a.onClick(e); });
		}
	}
	wireWikiLinks(block, opts.app, opts.sourcePath);
	return block;
}
