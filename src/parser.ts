// Stat block parsing. Pure functions, no Obsidian imports.

import { ArmorType, NimbleAbility, NimbleAttack, NimbleMonster } from './types';

const DEFAULT_HP = 10;

export function parseStatblock(content: string): NimbleMonster | null {
	try {
		const monster: Partial<NimbleMonster> = {};
		const lines = content.split(/\r?\n/);

		let currentSection: string | null = null;
		let currentList: string[] = [];

		const flush = () => {
			if (currentSection && currentList.length > 0) {
				processSection(monster, currentSection, currentList);
			}
			currentList = [];
		};

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			// Section header (e.g., "abilities:" or "attacks:")
			if (/^[a-z]+:$/i.test(trimmed)) {
				flush();
				currentSection = trimmed.slice(0, -1).toLowerCase();
				continue;
			}

			// List item - check BEFORE key-value to handle "- Name: description" format
			if (trimmed.startsWith('-')) {
				currentList.push(trimmed.slice(1).trim());
				continue;
			}

			// Key: value
			const match = trimmed.match(/^([^:]+):\s*(.+)$/);
			if (match) {
				flush();
				currentSection = null;
				processKeyValue(monster, match[1].trim().toLowerCase(), match[2].trim());
			}
		}
		flush();

		if (!monster.name) return null;

		monster.armor = monster.armor || 'none';
		if (monster.hp === undefined) monster.hp = DEFAULT_HP;
		monster.movement = monster.movement || '6';

		return monster as NimbleMonster;
	} catch (e) {
		console.error('Nimble Statblocks: parse error', e);
		return null;
	}
}

function processKeyValue(monster: Partial<NimbleMonster>, key: string, value: string): void {
	switch (key) {
		case 'name': monster.name = value; break;
		case 'type': monster.type = value; break;
		case 'size': monster.size = value; break;
		case 'level': monster.level = value; break;
		case 'armor': case 'ac':
			monster.armor = normalizeArmor(value);
			break;
		case 'hp': case 'hitpoints': {
			const hp = parseInt(value, 10);
			monster.hp = isNaN(hp) || hp < 0 ? DEFAULT_HP : hp;
			break;
		}
		case 'movement': case 'speed': monster.movement = value; break;
		case 'str': monster.str = value; break;
		case 'dex': monster.dex = value; break;
		case 'will': monster.will = value; break;
		case 'cr': monster.cr = value; break;
		case 'senses': monster.senses = value; break;
		case 'languages': monster.languages = value; break;
		case 'multiattack': monster.multiattack = value; break;
		case 'monstertype':
			monster.monsterType = value.toLowerCase().includes('solo') ? 'solo' : 'regular';
			break;
		case 'legendaryresistances':
			monster.legendaryResistances = parseInt(value, 10) || 3;
			break;
		case 'description': case 'desc': monster.description = value; break;
		case 'bloodied': monster.bloodied = value; break;
		case 'laststand': monster.lastStand = value; break;
		case 'actiontext': monster.actionText = value; break;
	}
}

function processSection(monster: Partial<NimbleMonster>, section: string, items: string[]): void {
	switch (section) {
		case 'attacks': case 'actions':
			monster.attacks = items.map(parseAttack);
			break;
		case 'abilities': case 'traits':
			monster.abilities = items.map(parseAbility);
			break;
		case 'resistances':
			monster.resistances = items;
			break;
		case 'immunities':
			monster.immunities = items;
			break;
	}
}

function parseAttack(line: string): NimbleAttack {
	return { raw: line };
}

export function parseAbility(line: string): NimbleAbility {
	const ability: NimbleAbility = { name: 'Ability', description: '' };

	if (line.includes('(L)')) {
		ability.isLegendary = true;
		line = line.replace('(L)', '').replace(/\s{2,}/g, ' ').trim();
	}

	// "***Name.*** description" / "**Name:** description" style
	const emphasized = line.match(/^(\*{1,3}|_{1,3})(.+?)\1\s*[:.]?\s*(.*)$/);
	if (emphasized) {
		ability.name = emphasized[2].replace(/[.:]\s*$/, '').trim();
		ability.description = emphasized[3].trim();
		return ability;
	}

	// "Name: description" style. Only the name loses its markdown; the
	// description keeps it so bold/italic still render.
	const idx = line.indexOf(':');
	if (idx !== -1) {
		ability.name = line.slice(0, idx).replace(/\*+/g, '').trim();
		ability.description = line.slice(idx + 1).trim();
	} else {
		ability.name = line.replace(/\*+/g, '').trim();
	}
	return ability;
}

export function normalizeArmor(value: string): ArmorType {
	const v = value.toLowerCase().trim();
	if (v === 'n' || v === 'none' || v === 'l' || v === 'light') return 'none';
	if (v === 'm' || v === 'medium') return 'medium';
	if (v === 'h' || v === 'heavy') return 'heavy';

	const num = parseInt(v, 10);
	if (!isNaN(num)) {
		if (num <= 13) return 'none';
		if (num <= 17) return 'medium';
		return 'heavy';
	}
	return 'none';
}

// ----------------------------------------------------------------------------
// Movement
// ----------------------------------------------------------------------------

export interface MovementInfo {
	display: string | null;  // null means don't show badge
	type: string | null;
	speed: number | null;
}

export function parseMovement(movement: string | undefined): MovementInfo {
	if (!movement) return { display: null, type: null, speed: null };

	const trimmed = movement.trim().toLowerCase();
	const match = trimmed.match(/^([a-z]+)?\s*(\d+)?$/i);

	if (!match) {
		// Complex movement string ("8, fly 16"): show as-is
		return { display: movement.trim(), type: null, speed: null };
	}

	const type = match[1] ? match[1].toLowerCase() : null;
	const speed = match[2] ? parseInt(match[2], 10) : null;

	const isDefaultType = !type || type === 'walk';
	if (isDefaultType && (speed === 6 || speed === null)) {
		return { display: null, type: 'walk', speed: speed ?? 6 };
	}

	const parts: string[] = [];
	if (type && type !== 'walk') parts.push(type.toUpperCase());
	if (speed !== null) parts.push(speed.toString());

	return { display: parts.join(' '), type: type || 'walk', speed };
}

// ----------------------------------------------------------------------------
// Finding stat blocks in a whole note
// ----------------------------------------------------------------------------

/**
 * Returns the body of every ```nimble / ~~~nimble fenced block in a note.
 * Handles CRLF line endings, longer fences (````nimble), and blocks indented
 * under list items (spaces or tabs), which Obsidian still renders.
 */
export function extractNimbleBlocks(content: string): string[] {
	const lines = content.split(/\r?\n/);
	const blocks: string[] = [];
	let fence: { char: string; len: number } | null = null;
	let body: string[] = [];
	let isNimble = false;

	for (const line of lines) {
		if (!fence) {
			const open = line.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
			if (!open) continue;
			const info = open[2];
			// CommonMark: a backtick fence's info string can't contain backticks,
			// so a line like ```js``` is inline code, not a fence.
			if (open[1][0] === '`' && info.includes('`')) continue;
			fence = { char: open[1][0], len: open[1].length };
			isNimble = info.trim().split(/\s+/)[0].toLowerCase() === 'nimble';
			body = [];
			continue;
		}
		const close = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
		if (close && close[1][0] === fence.char && close[1].length >= fence.len) {
			if (isNimble) blocks.push(body.join('\n'));
			fence = null;
			continue;
		}
		body.push(line);
	}
	return blocks;
}
