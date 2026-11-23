// The one stat block renderer, used by note code blocks, the bestiary, the
// tracker's viewer and hover previews.

import { App, setIcon } from 'obsidian';
import { NimbleMonster } from './types';
import { parseMovement } from './parser';
import { appendRichText, DICE_RE, execWithLead, RichTextOptions } from '../../core/markdown';
import { wireWikiLinks } from '../../core/wiki-links';
import { armorGlyph, heartGlyph, parseSaves, saveTriangle } from './book-glyphs';
import { formatLevel, monsterRole, monsterSaves, scaledHp } from './rules';
import { applyLook } from '../../core/look';
import { damageIcon, evIcon } from '../../core/icons';
import { NIMBLE_STORE_URL } from './bestiary';

/** 'attack' dice follow Nimble attack rules; 'effect' dice (saves, abilities, phases) are plain sums. */
export type { DiceKind } from '../../core/dice-attack';
import type { DiceKind } from '../../core/dice-attack';
import { pill } from '../../core/pill';
export type DiceHandler = (el: HTMLElement, expression: string, label: string, kind: DiceKind) => void;

export interface StatblockAction {
	label: string;
	icon?: string;
	title?: string;
	cls?: string;
	onClick: (ev: MouseEvent) => void;
	/** A chevron beside the button that opens more choices. */
	menu?: (ev: MouseEvent) => void;
}

export interface RenderOptions {
	app: App;
	sourcePath: string;
	/** Visual context. 'block' is a note code block. */
	variant: 'block' | 'inline' | 'hover';
	compact?: boolean;
	/** When set, an "Add to Encounter" button is shown. */
	onAdd?: (ev: MouseEvent) => void;
	/** Extra buttons in a footer bar (hover cards, bestiary). */
	actions?: StatblockAction[];
	/** When set, dice expressions become clickable. */
	onDice?: DiceHandler;
	/** Condition names to mark up in rules text, and what to do with them. */
	keywords?: RegExp;
	onKeyword?: (el: HTMLElement, word: string) => void;
	/** Rules words for fields (Senses, Languages, Immune…): every term, where `keywords` is only running-text ones. */
	fieldKeywords?: RegExp;
	/** Party size for per-hero HP. */
	partySize?: number;
	/** Hide flavour text and tactics (tight spaces). */
	brief?: boolean;
	/**
	 * Player view: what the heroes could know about it (name, size, kind,
	 * where it lives, its lore) and none of the numbers.
	 */
	lore?: boolean;
	/** Lore cards: every book the creature is printed in ("Monsters & More p.149"), as pills. */
	sources?: string[];
}

export function renderStatblock(container: HTMLElement, monster: NimbleMonster, opts: RenderOptions): HTMLElement {
	if (opts.lore) return renderLoreCard(container, monster, opts);
	const role = monsterRole(monster);
	const block = container.createDiv({ cls: 'nimble-statblock' });
	applyLook(block, 'nimble');
	if (opts.variant !== 'block') block.addClass('inline');
	if (opts.variant === 'hover') block.addClass('hover-preview');
	// Hover cards are the same block a size down (the study's hover card).
	if (opts.compact || opts.variant === 'hover') block.addClass('is-compact');
	block.addClass(`role-${role}`);
	if (role === 'legendary') block.addClass('solo-monster');
	block.setAttr('data-monster', monster.name);

	header(block, monster, opts);
	defenses(block, monster, opts);
	abilities(block, monster, opts);
	// Legendary monsters: the after-each-hero actions beside Bloodied and Last Stand (stacked when narrow).
	const body = block.createDiv({ cls: 'monster-body' });
	actions(body, monster, opts);
	phases(body, monster, opts);
	if (!body.childElementCount) body.remove();
	else if (role === 'legendary' && body.childElementCount > 1) body.addClass('is-split');

	if (!opts.brief && monster.description) {
		appendRichText(block.createEl('p', { cls: 'monster-description' }), monster.description, textOpts(opts, monster.name, ''));
	}
	// Easier/Harder are prep notes: in full stat blocks and the bestiary, not the hover card.
	if (!opts.brief && opts.variant !== 'hover' && (monster.tactics?.easier || monster.tactics?.harder)) {
		const t = block.createDiv({ cls: 'monster-tactics' });
		const row = (label: string, icon: string, text?: string) => {
			if (!text) return;
			const r = t.createDiv({ cls: 'tactic-row' });
			const l = r.createSpan({ cls: 'tactic-label', attr: { title: label } });
			setIcon(l, icon);
			l.createSpan({ text: label });
			appendRichText(r.createSpan({ cls: 'tactic-text' }), text, textOpts(opts, monster.name, ''));
		};
		row('Easier', 'chevron-down', monster.tactics?.easier);
		row('Harder', 'chevron-up', monster.tactics?.harder);
	}

	if (monster.source || monster.bundledId) {
		const src = block.createDiv({ cls: 'monster-source' });
		if (monster.source) src.createSpan({ text: monster.source });
		if (monster.bundledId) {
			src.createSpan({ text: ' · Nimble TTRPG © Nimble Co. · ' });
			src.createEl('a', { text: 'Get the books', href: NIMBLE_STORE_URL, cls: 'external-link', attr: { target: '_blank', rel: 'noopener' } });
		}
	}

	wireWikiLinks(block, opts.app, opts.sourcePath);

	if (opts.onAdd) {
		const btn = pill(block, { tag: 'button', cls: 'add-btn', icon: evIcon('plus'), text: 'Add to encounter', attr: { 'aria-label': `Add ${monster.name}` } });
		btn.addEventListener('click', (ev) => opts.onAdd?.(ev));
	}
	renderActionBar(block, opts.actions);
	return block;
}

/** The buttons under a stat block or a lore card (Add, Bestiary, Open notes…), with an optional ▾ menu each. */
function renderActionBar(block: HTMLElement, actions: StatblockAction[] | undefined): void {
	if (!actions?.length) return;
	const bar = block.createDiv({ cls: 'statblock-actions' });
	for (const a of actions) {
		const host = a.menu ? bar.createDiv({ cls: `statblock-split ${a.cls || ''}` }) : bar;
		const b = pill(host, { tag: 'button', cls: `statblock-action ${a.cls || ''}`, icon: a.icon, text: a.label, attr: { 'aria-label': a.title || a.label } });
		b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); a.onClick(ev); });
		if (a.menu) {
			const more = host.createEl('button', { cls: `statblock-action statblock-action-more ${a.cls || ''}`, attr: { 'aria-label': `More ways to ${a.label.toLowerCase()}` } });
			setIcon(more, 'chevron-down');
			more.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); a.menu!(ev); });
		}
	}
}

/** The player's view of a monster: a lore card with no stats. */
export function renderLoreCard(container: HTMLElement, m: NimbleMonster, opts: RenderOptions): HTMLElement {
	const block = container.createDiv({ cls: 'nimble-statblock nimble-lore-card' });
	applyLook(block, 'nimble');
	if (opts.variant !== 'block') block.addClass('inline');
	if (opts.variant === 'hover') block.addClass('hover-preview');
	block.setAttr('data-monster', m.name);
	const top = block.createDiv({ cls: 'monster-header' });
	top.createDiv({ cls: 'monster-name', text: m.name });
	const what = [m.size && m.size !== 'Medium' ? m.size : '', m.type ?? '', monsterRole(m) === 'legendary' ? (m.roleLabel ?? 'Legendary') : ''].filter(Boolean).join(' · ');
	if (what) top.createDiv({ cls: 'monster-meta', text: what });
	const tags = [m.group, m.habitat].filter((t): t is string => !!t);
	if (tags.length) {
		const row = block.createDiv({ cls: 'lore-tags' });
		for (const t of tags) row.createSpan({ cls: 'lore-tag', text: t });
	}
	if (m.description) appendRichText(block.createEl('p', { cls: 'monster-description' }), m.description, textOpts({ ...opts, onDice: undefined }, m.name, ''));
	else block.createEl('p', { cls: 'lore-empty', text: 'Nothing in the books about this one. Whatever you learn goes in your notes.' });
	const sources = opts.sources?.length ? opts.sources : m.source ? [m.source] : [];
	if (sources.length || m.bundledId) {
		const src = block.createDiv({ cls: 'monster-source lore-sources' });
		for (const x of sources) src.createSpan({ cls: 'lore-tag lore-source', text: x });
		if (m.bundledId) {
			const credit = src.createSpan({ cls: 'lore-credit', text: 'Nimble TTRPG © Nimble Co. · ' });
			credit.createEl('a', { text: 'Get the books', href: NIMBLE_STORE_URL, cls: 'external-link', attr: { target: '_blank', rel: 'noopener' } });
		}
	}
	wireWikiLinks(block, opts.app, opts.sourcePath);
	renderActionBar(block, opts.actions);
	return block;
}

// ----------------------------------------------------------------------------

function textOpts(opts: RenderOptions, monsterName: string, what: string, kind: DiceKind | ((el: HTMLElement) => DiceKind) = 'effect'): RichTextOptions {
	const out: RichTextOptions = {};
	if (opts.onDice) {
		const label = what ? `${monsterName}: ${what}` : monsterName;
		out.onDice = (el: HTMLElement, expr: string) => opts.onDice?.(el, expr, label, typeof kind === 'function' ? kind(el) : kind);
	}
	if (opts.keywords && opts.onKeyword) {
		out.keywords = opts.keywords;
		out.onKeyword = opts.onKeyword;
	}
	return out;
}

function header(block: HTMLElement, m: NimbleMonster, opts: RenderOptions): void {
	const role = monsterRole(m);
	const top = block.createDiv({ cls: 'monster-header' });
	const title = top.createDiv({ cls: 'monster-title' });
	const lvl = formatLevel(m.level);
	const size = m.size && m.size.toLowerCase() !== 'medium' ? m.size : '';
	const cr = m.cr && !lvl ? `CR ${m.cr}` : '';
	if (role === 'legendary') {
		// The GM's Guide: a kicker over the big name ("Level 7 Solo · Large · Dragon").
		const lead = [lvl ? `Level ${lvl}` : '', m.roleLabel || 'Legendary'].filter(Boolean).join(' ');
		title.createDiv({ cls: 'monster-kicker', text: [lead, size, m.type ?? '', cr].filter(Boolean).join(' · ') });
		title.createEl('h2', { cls: 'monster-name', text: m.name });
	} else {
		// Name and level inline, the level in small caps beside it ("Lvl 3, beast").
		title.createSpan({ cls: 'monster-name', text: m.name });
		const lead = [lvl ? `Lvl ${lvl}` : '', role === 'minion' ? 'Minion' : ''].filter(Boolean).join(' ');
		const kick = [lead, [size, m.type ?? ''].filter(Boolean).join(' '), cr].filter(Boolean).join(', ');
		if (kick) title.createSpan({ cls: 'monster-kicker', text: kick });
	}

	// Icons on the right, as the book sets them: HP in a red heart, the armor shield with its letter,
	// speed, saves as triangles. No armor (a dash on an outline shield) and speed 6 show too, so the GM
	// never has to remember the defaults.
	const badges = top.createDiv({ cls: 'monster-badges' });
	if (role !== 'minion') {
		const hp = badges.createSpan({ cls: 'stat-badge hp-badge' });
		heartGlyph(hp, 16);
		if (m.hpPerHero) {
			const party = opts.partySize ?? 4;
			hp.setAttr('aria-label', `${m.hpPerHero} HP per hero: ${scaledHp(m, party)} HP for ${party} heroes`);
			hp.createSpan({ cls: 'badge-value', text: `${m.hpPerHero}/hero` });
		} else {
			hp.setAttr('aria-label', `${m.hp} HP`);
			hp.createSpan({ cls: 'badge-value', text: String(m.hp) });
		}
	}
	armorGlyph(badges, m.armor, 'armor-badge');
	const speed = parseMovement(m.movement).display ?? '6';
	const sp = badges.createSpan({ cls: 'stat-badge move-badge', attr: { 'aria-label': `Speed ${m.movement?.trim() || '6'}` } });
	setIcon(sp.createSpan({ cls: 'badge-icon' }), evIcon('footprints'));
	sp.createSpan({ cls: 'badge-value', text: speed });
	const saves = monsterSaves(m);
	if (saves) {
		const sv = badges.createSpan({ cls: 'saves-badge', attr: { 'aria-label': `Saves: ${saves.replace(/-/g, '−')}` } });
		for (const s of parseSaves(saves)) {
			const one = sv.createSpan({ cls: 'save-mark' });
			one.createSpan({ cls: 'save-stat', text: s.stat });
			for (let i = 0; i < Math.abs(s.marks ?? 0); i++) saveTriangle(one, (s.marks ?? 0) < 0);
		}
	}
	if (!badges.childElementCount) badges.remove();
}

function defenses(block: HTMLElement, m: NimbleMonster, opts: RenderOptions): void {
	const rows: [string, string | undefined, boolean][] = [
		['Resistant', m.resistances?.join(', '), true],
		['Vulnerable', m.vulnerabilities?.join(', '), true],
		['Immune', m.immunities?.join(', '), true],
		['Senses', m.senses, false],
		['Languages', m.languages, false],
	];
	const shown = rows.filter(([, v]) => v);
	if (!shown.length) return;
	const box = block.createDiv({ cls: 'monster-defenses' });
	for (const [label, value, damage] of shown) {
		const p = box.createEl('p');
		p.createEl('strong', { text: label });
		p.appendText(' ');
		const o = textOpts(opts, m.name, label);
		const write = (el: HTMLElement, text: string) => appendRichText(el, text, opts.fieldKeywords && o.onKeyword ? { ...o, keywords: opts.fieldKeywords } : o);
		if (!damage) { write(p, value!); continue; }
		// Damage types carry their icon (the word stays, to read and to search).
		value!.split(/\s*,\s*/).forEach((word, i) => {
			if (i) p.appendText(', ');
			const dmg = damageIcon(word);
			if (!dmg) { write(p, word); return; }
			const w = p.createSpan({ cls: 'monster-damage-type', attr: { 'aria-label': dmg.label } });
			setIcon(w.createSpan({ cls: 'monster-damage-icon' }), dmg.icon);
			write(w, word);
		});
	}
}

/** Passives, each on the book's khaki ribbon, which pokes out past the box. */
function abilities(block: HTMLElement, m: NimbleMonster, opts: RenderOptions): void {
	if (!m.abilities?.length) return;
	const box = block.createDiv({ cls: 'monster-abilities' });
	for (const ab of m.abilities) {
		const item = box.createDiv({ cls: 'ability-item' });
		if (ab.name) {
			item.createEl('strong', { cls: 'ability-name', text: `${ab.name.replace(/[.:]$/, '')}.` });
			item.appendText(' ');
		}
		appendRichText(item, ab.description, textOpts(opts, m.name, ab.name));
	}
	followRibbonHeights(box);
}

/**
 * A ribbon's points keep the book's angle at any height: each ribbon's height goes in `--nb-ribbon-h`, and the
 * CSS makes its pointed ends that much wider (see "Passives" in styles.css). Written a frame later, so a ribbon
 * that rewraps doesn't loop the observer.
 */
function followRibbonHeights(box: HTMLElement): void {
	if (typeof ResizeObserver === 'undefined') return;
	const ro = new ResizeObserver((entries) => {
		box.win.requestAnimationFrame(() => {
			for (const e of entries) {
				const el = e.target as HTMLElement;
				const h = `${Math.round(el.offsetHeight)}px`;
				if (el.style.getPropertyValue('--nb-ribbon-h') !== h) el.setCssProps({ '--nb-ribbon-h': h });
			}
		});
	});
	for (const item of Array.from(box.children)) ro.observe(item);
}

function attackLabel(raw: string): string {
	const plain = raw.replace(/[*_]/g, '');
	const m = execWithLead(DICE_RE, plain);
	const before = (m ? plain.slice(0, m.index) : plain).replace(/[\s.:,(-]+$/, '').trim();
	return before;
}

/** Where an attack's rider starts ("On a hit: …"). Dice after it are effects, not the attack. */
const RIDER_RE = /\bon (?:a )?(?:hit|crit|damage)\b/i;

/**
 * Attack lines that call for a save (breath weapons etc.) can't miss or crit.
 * A save in an on-hit rider ("On a hit: STR save or Slowed") or one made to
 * Interpose doesn't make the attack itself a save.
 */
export function attackDiceKind(raw: string): DiceKind {
	const head = raw.split(RIDER_RE)[0].replace(/\([^)]*\binterpose\b[^)]*\)/gi, '');
	return /\bsaves?\b|\bAoE\b/i.test(head) ? 'effect' : 'attack';
}

/** True when `el` comes after an on-hit rider in `line` (its dice are the rider's, e.g. "Slowed for 1d4 rounds"). */
export function inRider(el: HTMLElement, line: HTMLElement): boolean {
	let before = '';
	const walker = line.doc.createTreeWalker(line, NodeFilter.SHOW_TEXT);
	while (walker.nextNode()) {
		const n = walker.currentNode;
		if (el.contains(n) || el.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) break;
		before += n.textContent ?? '';
	}
	return RIDER_RE.test(before);
}

/** "Choose 1:" → "Choose 1"; with `lower`, "After each hero's turn, choose one:" → "after each hero's turn, choose one". */
export function actionIntro(text: string, lower: boolean): string {
	const t = text.trim().replace(/[:.]+$/, '');
	return lower && /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
}

function actions(parent: HTMLElement, m: NimbleMonster, opts: RenderOptions): void {
	if (!m.attacks?.length && !m.multiattack) return;
	const role = monsterRole(m);
	const section = parent.createDiv({ cls: 'monster-actions' });
	if (role === 'legendary') {
		// The book's words: "Actions: after each hero's turn, choose one", never "Legendary:".
		const head = section.createDiv({ cls: 'actions-intro' });
		head.createSpan({ cls: 'actions-head', text: 'Actions' });
		appendRichText(head.createSpan({ cls: 'actions-sub' }), actionIntro(m.actionText || "After each hero's turn, choose one:", true), textOpts(opts, m.name, ''));
	} else if (m.actionText) {
		const head = section.createDiv({ cls: 'actions-intro' });
		appendRichText(head.createSpan({ cls: 'actions-head' }), actionIntro(m.actionText, false), textOpts(opts, m.name, ''));
	}
	if (m.multiattack) appendRichText(section.createEl('p', { cls: 'multiattack' }), m.multiattack, textOpts(opts, m.name, ''));
	const list = section.createEl('ul', { cls: 'actions-list' });
	// "Choose 1": the actions are alternatives, with an "or" between them as the book prints it.
	if (role !== 'legendary' && /\bchoose\b/i.test(m.actionText ?? '') && (m.attacks?.length ?? 0) > 1) list.addClass('is-choice');
	for (const atk of m.attacks || []) {
		const li = list.createEl('li');
		const base: DiceKind = role === 'minion' ? 'effect' : attackDiceKind(atk.raw);
		const kind = (el: HTMLElement): DiceKind => base === 'attack' && inRider(el, li) ? 'effect' : base;
		appendRichText(li, atk.raw, textOpts(opts, m.name, attackLabel(atk.raw), kind));
		markDamageTypes(li);
	}
}

/** A damage word right after its dice ("2d6 fire") gets the type's icon: the dice say how much, the icon what kind. */
const DAMAGE_AFTER_DICE = /(\d*d\d+(?:\s*[+−-]\s*\d+)?\)?\s+)(fire|cold|lightning|thunder|acid|poison|necrotic|radiant|psychic|force|piercing|slashing|bludgeoning)\b/gi;
const DAMAGE_WORD = /^(\s+)(fire|cold|lightning|thunder|acid|poison|necrotic|radiant|psychic|force|piercing|slashing|bludgeoning)\b/i;

export function markDamageTypes(el: HTMLElement): void {
	const doc = el.ownerDocument;
	const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	while (walker.nextNode()) nodes.push(walker.currentNode as Text);
	for (const n of nodes) {
		const text = n.textContent ?? '';
		// The dice are their own element when they roll ("[2d6] fire"), or plain text when they don't.
		const prev = n.previousSibling;
		const afterDice = prev?.nodeType === Node.ELEMENT_NODE && (prev as Element).classList.contains('nimble-dice') ? DAMAGE_WORD.exec(text) : null;
		const hits: { at: number; word: string }[] = [];
		if (afterDice) hits.push({ at: afterDice[1].length, word: afterDice[2] });
		for (const m of text.matchAll(DAMAGE_AFTER_DICE)) hits.push({ at: (m.index ?? 0) + m[1].length, word: m[2] });
		if (!hits.length) continue;
		const frag = createFragment();
		let pos = 0;
		for (const h of hits.sort((a, b) => a.at - b.at)) {
			const dmg = damageIcon(h.word);
			if (!dmg || h.at < pos) continue;
			frag.appendText(text.slice(pos, h.at));
			const wrap = frag.createSpan({ cls: 'monster-damage-type', attr: { 'aria-label': dmg.label } });
			setIcon(wrap.createSpan({ cls: 'monster-damage-icon' }), dmg.icon);
			wrap.appendText(text.slice(h.at, h.at + h.word.length));
			pos = h.at + h.word.length;
		}
		frag.appendText(text.slice(pos));
		n.replaceWith(frag);
	}
}

/** HP thresholds in a phase ("At 50 HP", "7 HP per hero", "90hp"), set in the book's red. */
const PHASE_HP = /\b\d+\s*(?:HP|hp)\b(?:\s+per\s+hero)?/g;

function markHp(el: HTMLElement): void {
	const doc = el.ownerDocument;
	const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	while (walker.nextNode()) nodes.push(walker.currentNode as Text);
	for (const n of nodes) {
		const text = n.textContent ?? '';
		const hits = [...text.matchAll(PHASE_HP)];
		if (!hits.length) continue;
		const frag = createFragment();
		let at = 0;
		for (const hit of hits) {
			const i = hit.index ?? 0;
			if (i > at) frag.appendText(text.slice(at, i));
			frag.createEl('em', { cls: 'phase-hp', text: hit[0] });
			at = i + hit[0].length;
		}
		if (at < text.length) frag.appendText(text.slice(at));
		n.replaceWith(frag);
	}
}

function phases(parent: HTMLElement, m: NimbleMonster, opts: RenderOptions): void {
	if (!m.bloodied && !m.lastStand) return;
	const box = parent.createDiv({ cls: 'monster-phases' });
	const phase = (label: string, cls: string, text?: string) => {
		if (!text) return;
		const s = box.createDiv({ cls: `phase-section ${cls}` });
		s.createEl('strong', { cls: 'phase-label', text: label });
		const body = s.createDiv({ cls: 'phase-text' });
		appendRichText(body, text, textOpts(opts, m.name, label));
		markHp(body);
	};
	phase('Bloodied', 'bloodied-section', m.bloodied);
	phase('Last Stand', 'laststand-section', m.lastStand);
}

// ----------------------------------------------------------------------------

