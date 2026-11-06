// The one stat block renderer, used by note code blocks, the bestiary, the
// tracker's viewer and hover previews.

import { App, setIcon } from 'obsidian';
import { NimbleMonster } from './types';
import { parseMovement } from './parser';
import { appendRichText, DICE_RE, execWithLead, RichTextOptions } from './markdown';
import { appendIcon, IconName } from './icons';
import { armorLabel, formatLevel, monsterRole, monsterSaves, scaledHp } from './rules';
import { NIMBLE_STORE_URL } from './bestiary';

/** 'attack' dice follow Nimble attack rules; 'effect' dice (saves, abilities, phases) are plain sums. */
export type DiceKind = 'attack' | 'effect';
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
	/** Party size for per-hero HP. */
	partySize?: number;
	/** Hide flavour text and tactics (tight spaces). */
	brief?: boolean;
}

export function renderStatblock(container: HTMLElement, monster: NimbleMonster, opts: RenderOptions): HTMLElement {
	const role = monsterRole(monster);
	const block = container.createDiv({ cls: 'nimble-statblock' });
	if (opts.variant !== 'block') block.addClass('inline');
	if (opts.variant === 'hover') block.addClass('hover-preview');
	if (opts.compact) block.addClass('is-compact');
	block.addClass(`role-${role}`);
	if (role === 'legendary') block.addClass('solo-monster');
	block.setAttr('data-monster', monster.name);

	header(block, monster, opts);
	defenses(block, monster, opts);
	abilities(block, monster, opts);
	actions(block, monster, opts);
	phases(block, monster, opts);

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
		const btn = block.createEl('button', { text: '+ Add to Encounter', cls: 'add-btn' });
		btn.setAttr('aria-label', `Add ${monster.name}`);
		btn.addEventListener('click', (ev) => opts.onAdd?.(ev));
	}
	if (opts.actions?.length) {
		const bar = block.createDiv({ cls: 'statblock-actions' });
		for (const a of opts.actions) {
			const host = a.menu ? bar.createDiv({ cls: `statblock-split ${a.cls || ''}` }) : bar;
			const b = host.createEl('button', { cls: `statblock-action ${a.cls || ''}`, attr: { 'aria-label': a.title || a.label } });
			if (a.icon) setIcon(b.createSpan({ cls: 'statblock-action-icon' }), a.icon);
			b.createSpan({ text: a.label });
			b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); a.onClick(ev); });
			if (a.menu) {
				const more = host.createEl('button', { cls: `statblock-action statblock-action-more ${a.cls || ''}`, attr: { 'aria-label': `More ways to ${a.label.toLowerCase()}` } });
				setIcon(more, 'chevron-down');
				more.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); a.menu!(ev); });
			}
		}
	}
	return block;
}

// ----------------------------------------------------------------------------

function badge(parent: HTMLElement, cls: string, icon: IconName, value: string, title: string): void {
	const el = parent.createSpan({ cls: `stat-badge ${cls}` });
	el.setAttr('aria-label', title);
	appendIcon(el, icon);
	el.createSpan({ cls: 'badge-value', text: value });
}

function textOpts(opts: RenderOptions, monsterName: string, what: string, kind: DiceKind = 'effect'): RichTextOptions {
	const out: RichTextOptions = {};
	if (opts.onDice) {
		const label = what ? `${monsterName}: ${what}` : monsterName;
		out.onDice = (el: HTMLElement, expr: string) => opts.onDice?.(el, expr, label, kind);
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
	const line: string[] = [];
	const lvl = formatLevel(m.level);
	if (lvl) line.push(`Lvl ${lvl}`);
	if (role === 'legendary') line.push(m.roleLabel || 'Legendary');
	if (role === 'minion') line.push('Minion');
	if (m.size && m.size.toLowerCase() !== 'medium') line.push(m.size);
	if (m.type) line.push(m.type);
	if (m.cr && !lvl) line.push(`CR ${m.cr}`);
	if (line.length) top.createDiv({ cls: 'monster-kicker', text: line.join(' · ') });
	top.createEl(role === 'legendary' ? 'h2' : 'div', { cls: 'monster-name', text: m.name });

	const badges = block.createDiv({ cls: 'monster-badges' });
	if (role === 'minion') {
		badge(badges, 'hp-badge minion-badge', 'heart', 'Minion', 'Minion');
	} else if (m.hpPerHero) {
		const size = opts.partySize ?? 4;
		badge(badges, 'hp-badge', 'heart', `${m.hpPerHero}/hero`, `${scaledHp(m, size)} HP for ${size} heroes`);
	} else {
		badge(badges, 'hp-badge', 'heart', String(m.hp), `${m.hp} HP`);
	}
	if (m.armor !== 'none') {
		badge(badges, 'armor-badge', 'shield', m.armor === 'medium' ? 'M' : 'H', armorLabel(m.armor));
	}
	const movement = parseMovement(m.movement);
	if (movement.display) badge(badges, 'move-badge', 'arrow', movement.display, `Speed ${m.movement}`);
	const saves = monsterSaves(m);
	if (saves) badge(badges, 'saves-badge', 'star', saves.replace(/-/g, '−'), `Saves: ${saves}`);
}

function defenses(block: HTMLElement, m: NimbleMonster, opts: RenderOptions): void {
	const rows: [string, string | undefined][] = [
		['Resistant', m.resistances?.join(', ')],
		['Vulnerable', m.vulnerabilities?.join(', ')],
		['Immune', m.immunities?.join(', ')],
		['Senses', m.senses],
		['Languages', m.languages],
	];
	const shown = rows.filter(([, v]) => v);
	if (!shown.length) return;
	const box = block.createDiv({ cls: 'monster-defenses' });
	for (const [label, value] of shown) {
		const p = box.createEl('p');
		p.createEl('strong', { text: `${label}:` });
		p.appendText(' ');
		appendRichText(p, value!, textOpts(opts, m.name, label));
	}
}

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
}

function attackLabel(raw: string): string {
	const plain = raw.replace(/[*_]/g, '');
	const m = execWithLead(DICE_RE, plain);
	const before = (m ? plain.slice(0, m.index) : plain).replace(/[\s.:,(-]+$/, '').trim();
	return before;
}

/** Attack lines that call for a save (breath weapons etc.) can't miss or crit. */
export function attackDiceKind(raw: string): DiceKind {
	return /\bsaves?\b|\bAoE\b/i.test(raw) ? 'effect' : 'attack';
}

function actions(block: HTMLElement, m: NimbleMonster, opts: RenderOptions): void {
	if (!m.attacks?.length && !m.multiattack) return;
	const role = monsterRole(m);
	const section = block.createDiv({ cls: 'monster-actions' });
	if (role === 'legendary' || m.actionText) {
		const head = section.createEl('p', { cls: 'actions-intro' });
		head.createEl('strong', { text: role === 'legendary' ? `${(m.roleLabel || 'Legendary').toUpperCase()}:` : 'ACTIONS:' });
		head.appendText(' ');
		appendRichText(head, m.actionText || "After each hero's turn, choose one:", textOpts(opts, m.name, ''));
	}
	if (m.multiattack) appendRichText(section.createEl('p', { cls: 'multiattack' }), m.multiattack, textOpts(opts, m.name, ''));
	const list = section.createEl('ul', { cls: 'actions-list' });
	for (const atk of m.attacks || []) {
		appendRichText(list.createEl('li'), atk.raw, textOpts(opts, m.name, attackLabel(atk.raw), role === 'minion' ? 'effect' : attackDiceKind(atk.raw)));
	}
}

function phases(block: HTMLElement, m: NimbleMonster, opts: RenderOptions): void {
	const phase = (label: string, cls: string, text?: string) => {
		if (!text) return;
		const s = block.createDiv({ cls: `phase-section ${cls}` });
		s.createEl('strong', { cls: 'phase-label', text: `${label}:` });
		s.appendText(' ');
		appendRichText(s, text, textOpts(opts, m.name, label === 'BLOODIED' ? 'Bloodied' : 'Last Stand'));
	};
	phase('BLOODIED', 'bloodied-section', m.bloodied);
	phase('LAST STAND', 'laststand-section', m.lastStand);
}

// ----------------------------------------------------------------------------

export function wireWikiLinks(container: HTMLElement, app: App, sourcePath: string): void {
	container.querySelectorAll<HTMLAnchorElement>('a.nimble-wikilink').forEach((anchor) => {
		const target = anchor.dataset.link || anchor.textContent || '';
		const linkpath = target.split('#')[0];
		const resolved = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
		anchor.dataset.href = target;
		// Never put raw link text in href: [[javascript:...]] must not be followable.
		anchor.setAttr('href', resolved ? resolved.path : '#');
		if (!resolved) anchor.addClass('is-unresolved');

		anchor.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const newLeaf = e.metaKey || e.ctrlKey;
			void app.workspace.openLinkText(target, sourcePath, newLeaf);
		});
		anchor.addEventListener('auxclick', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.button === 1) void app.workspace.openLinkText(target, sourcePath, true);
		});
		anchor.addEventListener('mouseover', (event) => {
			app.workspace.trigger('hover-link', {
				event,
				source: 'nimble-gm',
				hoverParent: container,
				targetEl: anchor,
				linktext: target,
				sourcePath,
			});
		});
	});
}
