// The one stat block renderer, used by note code blocks, the tracker's viewer
// and hover previews.

import { App } from 'obsidian';
import { NimbleMonster } from './types';
import { parseMovement } from './parser';
import { appendRichText, DICE_RE } from './markdown';
import { appendIcon, IconName } from './icons';

/** 'attack' dice follow Nimble attack rules; 'effect' dice (saves, abilities, phases) are plain sums. */
export type DiceKind = 'attack' | 'effect';
export type DiceHandler = (el: HTMLElement, expression: string, label: string, kind: DiceKind) => void;

export interface RenderOptions {
	app: App;
	sourcePath: string;
	/** Visual context. 'block' is a note code block. */
	variant: 'block' | 'inline' | 'hover';
	compact?: boolean;
	/** When set, an "Add to Encounter" button is shown. */
	onAdd?: (ev: MouseEvent) => void;
	/** When set, dice expressions become clickable. */
	onDice?: DiceHandler;
}

export function renderStatblock(container: HTMLElement, monster: NimbleMonster, opts: RenderOptions): HTMLElement {
	const block = container.createDiv({ cls: 'nimble-statblock' });
	if (opts.variant !== 'block') block.addClass('inline');
	if (opts.variant === 'hover') block.addClass('hover-preview');
	if (opts.compact) block.addClass('is-compact');
	const isSolo = monster.monsterType === 'solo';
	if (isSolo) block.addClass('solo-monster');
	block.setAttr('data-monster', monster.name);

	if (isSolo) renderSolo(block, monster, opts);
	else renderRegular(block, monster, opts);

	if (monster.description) {
		block.createEl('hr');
		const p = block.createEl('p', { cls: 'monster-description' });
		appendRichText(p, monster.description);
	}

	wireWikiLinks(block, opts.app, opts.sourcePath);

	if (opts.onAdd) {
		block.createEl('hr');
		const btn = block.createEl('button', { text: '+ Add to Encounter', cls: 'add-btn' });
		btn.setAttr('aria-label', `Add ${monster.name} to encounter (Shift-click to add 2)`);
		btn.addEventListener('click', (ev) => opts.onAdd?.(ev));
	}
	return block;
}

// ----------------------------------------------------------------------------

function badge(parent: HTMLElement, cls: string, icon: IconName, value: string, title: string): void {
	const el = parent.createSpan({ cls: `stat-badge ${cls}` });
	el.setAttr('title', title);
	el.setAttr('aria-label', title);
	appendIcon(el, icon);
	el.createSpan({ cls: 'badge-value', text: value });
}

const ARMOR_LABEL = { none: 'No armor', medium: 'Medium armor', heavy: 'Heavy armor' } as const;

function coreBadges(parent: HTMLElement, monster: NimbleMonster, withMovement: boolean): void {
	badge(parent, 'hp-badge', 'heart', String(monster.hp), `${monster.hp} HP`);
	if (monster.armor !== 'none') {
		badge(parent, 'armor-badge', 'shield', monster.armor === 'medium' ? 'M' : 'H', ARMOR_LABEL[monster.armor]);
	}
	if (withMovement) {
		const movement = parseMovement(monster.movement);
		if (movement.display) badge(parent, 'move-badge', 'arrow', movement.display, `Speed ${monster.movement}`);
	}
	const saves: string[] = [];
	if (monster.str) saves.push(`STR${monster.str}`);
	if (monster.dex) saves.push(`DEX${monster.dex}`);
	if (monster.will) saves.push(`WIL${monster.will}`);
	if (saves.length) badge(parent, 'saves-badge', 'star', saves.join(' '), `Saves: ${saves.join(', ')}`);
}

function abilitiesBox(block: HTMLElement, monster: NimbleMonster, boxCls: string, itemCls: string, opts: RenderOptions): void {
	if (!monster.abilities?.length) return;
	const box = block.createDiv({ cls: boxCls });
	for (const ab of monster.abilities) {
		const item = box.createDiv({ cls: itemCls });
		item.createEl('strong', { cls: 'ability-name', text: `${ab.name}${ab.isLegendary ? ' (L)' : ''}.` });
		item.appendText(' ');
		appendRichText(item, ab.description, diceOpts(opts, monster.name, ab.name));
	}
}

function attackLabel(raw: string): string {
	const plain = raw.replace(/[*_]/g, '');
	const m = DICE_RE.exec(plain);
	const before = (m ? plain.slice(0, m.index) : plain).replace(/[\s.:,(-]+$/, '').trim();
	return before;
}

function diceOpts(opts: RenderOptions, monsterName: string, what: string, kind: DiceKind = 'effect') {
	if (!opts.onDice) return {};
	const label = what ? `${monsterName}: ${what}` : monsterName;
	return { onDice: (el: HTMLElement, expr: string) => opts.onDice?.(el, expr, label, kind) };
}

/** Attack lines that call for a save (breath weapons etc.) can't miss or crit. */
export function attackDiceKind(raw: string): DiceKind {
	return /\bsaves?\b/i.test(raw) ? 'effect' : 'attack';
}

function actions(section: HTMLElement, monster: NimbleMonster, listCls: string, opts: RenderOptions): void {
	if (monster.multiattack) {
		appendRichText(section.createEl('p', { cls: 'multiattack' }), monster.multiattack, diceOpts(opts, monster.name, ''));
	}
	const list = section.createEl('ul', { cls: listCls });
	for (const atk of monster.attacks || []) {
		appendRichText(list.createEl('li'), atk.raw, diceOpts(opts, monster.name, attackLabel(atk.raw), attackDiceKind(atk.raw)));
	}
}

function renderSolo(block: HTMLElement, monster: NimbleMonster, opts: RenderOptions): void {
	const headerRow = block.createDiv({ cls: 'solo-header-row' });
	const left = headerRow.createDiv({ cls: 'solo-header-left' });
	const parts: string[] = [];
	if (monster.level) parts.push(`Level ${monster.level}`);
	parts.push('Solo');
	if (monster.size) parts.push(monster.size);
	if (monster.type) parts.push(monster.type);
	left.createSpan({ text: parts.join(' '), cls: 'solo-level-type' });

	const right = headerRow.createDiv({ cls: 'solo-header-right' });
	coreBadges(right, monster, true);
	right.querySelectorAll('.stat-badge').forEach(b => b.addClass('solo-stat-badge'));

	block.createEl('h2', { text: monster.name, cls: 'monster-name solo-name' });

	defensesAndSenses(block, monster);
	abilitiesBox(block, monster, 'solo-abilities-box', 'solo-ability-item', opts);
	block.createEl('hr');

	if (monster.attacks?.length || monster.multiattack) {
		const section = block.createDiv({ cls: 'solo-actions-section' });
		const header = section.createEl('p', { cls: 'solo-action-header' });
		header.createEl('strong', { text: 'ACTIONS:' });
		header.appendText(' ');
		appendRichText(header, monster.actionText || "After each hero's turn, choose one:");
		actions(section, monster, 'solo-actions-list', opts);
	}

	if (monster.bloodied) {
		const s = block.createDiv({ cls: 'solo-phase-section bloodied-section' });
		s.createEl('strong', { cls: 'phase-label', text: 'BLOODIED:' });
		s.appendText(' ');
		appendRichText(s, monster.bloodied, diceOpts(opts, monster.name, 'Bloodied'));
	}
	if (monster.lastStand) {
		const s = block.createDiv({ cls: 'solo-phase-section laststand-section' });
		s.createEl('strong', { cls: 'phase-label', text: 'LAST STAND:' });
		s.appendText(' ');
		appendRichText(s, monster.lastStand, diceOpts(opts, monster.name, 'Last Stand'));
	}
	if (monster.legendaryResistances) {
		const s = block.createDiv({ cls: 'solo-phase-section' });
		s.createEl('strong', { text: `Legendary Resistances (${monster.legendaryResistances}/Day).` });
		s.appendText(' Can choose to succeed on a failed save.');
	}
}

function defensesAndSenses(block: HTMLElement, monster: NimbleMonster): void {
	const line = (parent: HTMLElement, label: string, text: string) => {
		const p = parent.createEl('p');
		p.createEl('strong', { text: `${label}:` });
		p.appendText(' ');
		appendRichText(p, text);
	};
	if (monster.resistances?.length || monster.immunities?.length) {
		const d = block.createDiv({ cls: 'monster-defenses' });
		if (monster.resistances?.length) line(d, 'Resistances', monster.resistances.join(', '));
		if (monster.immunities?.length) line(d, 'Immunities', monster.immunities.join(', '));
	}
	if (monster.senses || monster.languages) {
		const s = block.createDiv({ cls: 'monster-senses' });
		if (monster.senses) line(s, 'Senses', monster.senses);
		if (monster.languages) line(s, 'Languages', monster.languages);
	}
}

function renderRegular(block: HTMLElement, monster: NimbleMonster, opts: RenderOptions): void {
	const headerRow = block.createDiv({ cls: 'monster-header-row' });
	const left = headerRow.createDiv({ cls: 'monster-header-left' });
	left.createSpan({ text: monster.name, cls: 'monster-name-inline' });

	const info: string[] = [];
	if (monster.type) info.push(monster.type);
	if (monster.cr) info.push(`CR ${monster.cr}`);
	if (info.length) left.createSpan({ text: info.join(', '), cls: 'monster-info-inline' });

	// Order: Level, Size, HP, Armor, Movement, Saves
	const right = headerRow.createDiv({ cls: 'monster-header-right' });
	if (monster.level) badge(right, 'level-badge', 'skull', String(monster.level), `Level ${monster.level}`);
	if (monster.size && monster.size.toLowerCase() !== 'medium') {
		badge(right, 'size-badge', 'size', monster.size.toUpperCase(), `Size: ${monster.size}`);
	}
	coreBadges(right, monster, true);

	defensesAndSenses(block, monster);
	abilitiesBox(block, monster, 'monster-abilities-box', 'ability-item', opts);

	if (monster.attacks?.length || monster.multiattack) {
		if (!monster.abilities?.length) block.createEl('hr');
		const section = block.createDiv({ cls: 'monster-actions-section' });
		actions(section, monster, 'actions-list', opts);
	}
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
			app.workspace.openLinkText(target, sourcePath, newLeaf);
		});
		anchor.addEventListener('auxclick', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.button === 1) app.workspace.openLinkText(target, sourcePath, true);
		});
		anchor.addEventListener('mouseover', (event) => {
			app.workspace.trigger('hover-link', {
				event,
				source: 'nimble-statblocks',
				hoverParent: container,
				targetEl: anchor,
				linktext: target,
				sourcePath,
			});
		});
	});
}
