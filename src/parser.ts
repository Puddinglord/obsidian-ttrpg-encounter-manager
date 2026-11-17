// Stat block parsing. Pure functions, no Obsidian imports.

import { ArmorType, MonsterRole, NimbleAbility, NimbleAttack, NimbleMonster } from './types';

const DEFAULT_HP = 10;

export function parseStatblock(content: string): NimbleMonster | null {
	return readStatblock(content).monster;
}

/**
 * Something in a hand-written stat block that couldn't be used as written, in
 * words for someone who writes notes, not code. `line` is the 0-based line in
 * the block; `fix`, when there's an obvious one, replaces lines start..end.
 */
export interface StatblockIssue {
	line: number;
	/** The line as written (trimmed). */
	text: string;
	/** The part of the line the message is about, to highlight. */
	mark?: string;
	message: string;
	hint?: string;
	fix?: { label: string; start: number; end: number; lines: string[] };
}

export interface StatblockReading {
	monster: NimbleMonster | null;
	issues: StatblockIssue[];
}

/** "**Last Stand**" → "laststand": how field names compare (case, spaces, dashes, underscores and bold don't matter). */
export function fieldKey(raw: string): string {
	return raw.replace(/^[\s*_]+|[\s*_]+$/g, '').toLowerCase().replace(/[\s_-]+/g, '');
}

/** Every field a line can start with ("hp: 20"), as fieldKey() writes it. */
const FIELDS = new Set([
	'name', 'type', 'size', 'level', 'lvl', 'armor', 'armour', 'ac', 'hp', 'hitpoints', 'health', 'hpperhero', 'role', 'kind', 'monstertype',
	'saves', 'save', 'str', 'dex', 'int', 'will', 'wil', 'miniondie', 'die', 'source', 'group', 'family', 'habitat', 'easier', 'harder',
	'movement', 'speed', 'move', 'cr', 'senses', 'languages', 'multiattack', 'description', 'desc', 'flavor', 'flavour', 'bloodied',
	'laststand', 'actiontext', 'actionsintro', 'resistances', 'resistance', 'immunities', 'immunity', 'vulnerabilities', 'vulnerability',
]);

/** List headings ("attacks:" on its own line), and the list each one fills. */
const LISTS: Record<string, 'attacks' | 'abilities' | 'resistances' | 'immunities' | 'vulnerabilities'> = {
	attacks: 'attacks', attack: 'attacks', actions: 'attacks', action: 'attacks', legendaryactions: 'attacks',
	abilities: 'abilities', ability: 'abilities', traits: 'abilities', trait: 'abilities', features: 'abilities', specialabilities: 'abilities',
	resistances: 'resistances', resistance: 'resistances', immunities: 'immunities', immunity: 'immunities',
	vulnerabilities: 'vulnerabilities', vulnerability: 'vulnerabilities',
};

/** How the guide writes each field, for "did you mean" (the fields people actually use). */
const FIELD_NAMES = ['name', 'level', 'role', 'size', 'type', 'hp', 'armor', 'movement', 'saves', 'actionText', 'attacks', 'abilities',
	'bloodied', 'lastStand', 'easier', 'harder', 'description', 'source', 'group', 'habitat', 'minion die', 'senses', 'languages',
	'resistances', 'immunities', 'vulnerabilities'];

const isBullet = (t: string) => t.startsWith('-') || /^[*+]\s/.test(t);
/** A wrapped sentence's next line: starts lower case, with a digit, or a bracket. */
const continues = (t: string) => /^[a-z0-9([,;]/.test(t);

/**
 * Reads a ```nimble block. Forgiving first ("**Bloodied:**", "Last Stand:",
 * "Legendary actions:", a bare "actionText:" over the attacks, sentences that
 * wrap onto a second line all work); anything still left over is an issue.
 */
export function readStatblock(content: string): StatblockReading {
	const issues: StatblockIssue[] = [];
	try {
		const monster: Partial<NimbleMonster> = {};
		const lines = content.split(/\r?\n/);
		const seen = new Map<string, number>();

		/** The open heading: a list ("attacks:"), a sentence field written as a heading ("bloodied:"), or something unknown. */
		let section: { kind: 'list' | 'text' | 'unknown'; key: string; raw: string; line: number; items: { text: string; line: number }[] } | null = null;
		/** What a wrapped line joins onto: the last list item or sentence field, until a blank line. */
		let tail: { item?: { text: string; line: number }; field?: string; line: number } | null = null;
		const orphans: { text: string; line: number }[] = [];
		const values: Partial<Record<string, string>> = {};

		const setField = (key: string, value: string) => { values[key] = value; processKeyValue(monster, key, value); };
		const flush = () => {
			const s = section;
			section = null;
			if (!s) return;
			if (s.kind === 'list') {
				if (s.items.length) processSection(monster, LISTS[s.key], s.items.map(i => i.text));
			} else if (s.kind === 'text') {
				if (!s.items.length) return;
				// "actionText:" over a list: the list is the attacks it introduces.
				if (s.key === 'actiontext' || s.key === 'actionsintro') processSection(monster, 'attacks', s.items.map(i => i.text));
				else setField(s.key, [values[s.key], ...s.items.map(i => i.text)].filter(Boolean).join(' '));
			} else if (s.items.length) {
				const near = suggest(s.key);
				issues.push({
					line: s.line, text: s.raw, mark: s.raw.replace(/:\s*$/, ''),
					message: `The list under “${s.raw}” isn't shown: stat blocks show lists under attacks:, abilities:, resistances:, immunities: and vulnerabilities:.`,
					hint: near ? `Did you mean ${near}:?` : 'Put these under attacks: or abilities:.',
					fix: near ? { label: `Change to ${near}:`, start: s.line, end: s.line, lines: [`${near}:`] } : undefined,
				});
			}
		};
		const stray = (i: number, t: string) => {
			// "Join" only to the line right above: joining past another line that isn't shown would delete it.
			const prev = tail?.line === i - 1 ? tail : null;
			const first = t.match(/^([A-Za-z][A-Za-z ]*?)\s+(\S.*)$/);
			const key = first ? fieldKey(first[1]) : '';
			if (first && FIELDS.has(key) && !LISTS[key]) {
				issues.push({ line: i, text: t, mark: first[1], message: `“${first[1]}” needs a colon after it, so this line isn't shown.`, hint: `Write it as ${first[1]}: ${first[2]}`, fix: { label: 'Add the colon', start: i, end: i, lines: [`${first[1]}: ${first[2]}`] } });
				return;
			}
			issues.push({
				line: i, text: t,
				message: 'This line isn\'t shown. Lines start with a field and a colon (like hp: 20), or with a dash for an attack or ability (like - Bite 1d6).',
				hint: prev ? 'If it belongs to the line above, join the two: each attack or ability is one line.' : undefined,
				fix: prev ? { label: 'Join to the line above', start: prev.line, end: i, lines: [`${lines[prev.line].replace(/\s+$/, '')} ${t}`] } : undefined,
			});
		};

		for (let i = 0; i < lines.length; i++) {
			const t = lines[i].trim();
			if (!t) { tail = null; continue; }

			// "Choose one:" / "After each hero's turn, choose one:" on its own line inside attacks: introduces
			// them; the list stays open. Not an attack that ends "…or choose twice:" (a bullet, or dice).
			const open = section as { kind: string; key: string } | null;
			if (open?.kind === 'list' && LISTS[open.key] === 'attacks' && !isBullet(t) && !/\d*d\d+/i.test(t) && /^[^:]*\b(choose|pick|select)\b[^:]*:[*_]*$/i.test(t)) {
				if (!values.actiontext) setField('actiontext', t.replace(/[*_]/g, '').trim());
				tail = null;
				continue;
			}

			// A heading on its own line: "attacks:", "**Legendary Actions:**", "bloodied:".
			const head = t.match(/^([*_]*[A-Za-z][A-Za-z \t_-]*?[*_]*)\s*:[*_]*$/);
			if (head) {
				flush();
				const key = fieldKey(head[1]);
				const kind = LISTS[key] ? 'list' : FREE_TEXT.has(key) && key !== 'name' ? 'text' : 'unknown';
				section = { kind, key, raw: t, line: i, items: [] };
				tail = null;
				if (kind === 'unknown' && FIELDS.has(key)) issues.push({ line: i, text: t, mark: head[1], message: `“${head[1]}” has nothing after its colon.`, hint: `Put the value on the same line, like ${head[1]}: …` });
				continue;
			}

			// A list item. "*" and "+" bullets need the space ("**Bold.** text" is not a bullet).
			if (isBullet(t)) {
				const item = { text: t.slice(1).trim(), line: i };
				if (!item.text) continue;
				checkBold(issues, i, t);
				if (section) section.items.push(item);
				else orphans.push(item);
				tail = { item, line: i };
				continue;
			}

			// A sentence field written as a heading takes the next line as its value.
			const s = section;
			if (s?.kind === 'text' && !s.items.length && !values[s.key]) {
				checkBold(issues, i, t);
				const item = { text: t, line: i };
				s.items.push(item);
				tail = { item, line: i };
				continue;
			}

			const match = t.match(/^([^:]+):\s*(.+)$/);
			const key = match ? fieldKey(match[1]) : '';
			if (match && FIELDS.has(key)) {
				flush();
				// "**Bloodied:** text": the bold's closing stars land in front of the value.
				let value = match[2].trim();
				if (/[*_]/.test(match[1])) value = value.replace(/^[*_]{1,3}\s*/, '');
				if (FREE_TEXT.has(key)) checkBold(issues, i, value);
				const before = seen.get(key);
				if (before !== undefined && !LISTS[key]) issues.push({ line: i, text: t, mark: match[1].trim(), message: `There are two “${match[1].trim()}” lines. Only this one, the last, is used.` });
				seen.set(key, i);
				checkValue(issues, i, t, key, value);
				setField(key, value);
				tail = FREE_TEXT.has(key) && key !== 'name' ? { field: key, line: i } : null;
				continue;
			}

			// A sentence that wrapped onto the next line (not "movment: 8" or "level 2", which are fields gone wrong).
			const labelled = !!match && match[1].trim().split(/\s+/).length <= 3;
			if (tail && continues(t) && !labelled && !FIELDS.has(fieldKey(t.split(/\s+/)[0]))) {
				if (tail.item) tail.item.text = `${tail.item.text} ${t}`;
				else if (tail.field) setField(tail.field, `${values[tail.field]} ${t}`);
				tail.line = i;
				continue;
			}

			// Inside a list, "Bite: 1d6" without its dash is still an item.
			if (match && section?.kind === 'list') {
				const item = { text: t, line: i };
				checkBold(issues, i, t);
				section.items.push(item);
				tail = { item, line: i };
				continue;
			}

			if (match) {
				flush();
				const raw = match[1].trim();
				const near = raw.split(/\s+/).length <= 3 ? suggest(key) : undefined;
				const word = raw.split(/\s+/).length <= 3;
				issues.push({
					line: i, text: t, mark: raw,
					message: word ? `“${raw.replace(/[*_]/g, '')}” isn't a stat block field, so this line isn't shown.` : 'This line isn\'t shown: it doesn\'t start with a field the stat block knows.',
					hint: near ? `Did you mean ${near}?` : word ? 'To show it, make it an ability: put it under abilities: as “- Name: what it does”.' : undefined,
					fix: near ? { label: `Change to ${near}:`, start: i, end: i, lines: [`${near}: ${match[2].trim()}`] } : undefined,
				});
				tail = null;
				continue;
			}

			stray(i, t);
		}
		flush();

		if (orphans.length) {
			const n = orphans.length;
			const dice = orphans.some(o => /\d*d\d+/i.test(o.text));
			const heading = dice ? 'attacks' : 'abilities';
			issues.push({
				line: orphans[0].line, text: lines[orphans[0].line].trim(),
				message: n === 1 ? 'This list item isn\'t under a heading, so it isn\'t shown.' : `These ${n} list items aren't under a heading, so they aren't shown.`,
				hint: `Put ${heading}: on its own line above ${n === 1 ? 'it' : 'them'}.`,
				fix: { label: `Add ${heading}: above`, start: orphans[0].line, end: orphans[0].line, lines: [`${heading}:`, lines[orphans[0].line]] },
			});
		}
		issues.sort((a, b) => a.line - b.line);

		if (!monster.name) return { monster: null, issues };

		monster.armor = monster.armor || 'none';
		if (monster.hp === undefined) monster.hp = monster.hpPerHero ? monster.hpPerHero * 4 : DEFAULT_HP;
		monster.movement = monster.movement || '6';
		if (!monster.role && monster.monsterType === 'solo') monster.role = 'legendary';
		if (monster.tactics && !monster.tactics.easier && !monster.tactics.harder) delete monster.tactics;

		return { monster: monster as NimbleMonster, issues };
	} catch (e) {
		console.error('Ember Vault: parse error', e);
		return { monster: null, issues };
	}
}

/** The closest field name to a misspelling, if one is close enough to be what they meant. */
function suggest(key: string): string | undefined {
	if (!key) return undefined;
	let best: string | undefined;
	let bestD = Infinity;
	for (const name of FIELD_NAMES) {
		const d = editDistance(key, fieldKey(name));
		if (d < bestD) { bestD = d; best = name; }
	}
	const limit = key.length <= 4 ? 1 : key.length <= 7 ? 2 : 3;
	return bestD <= limit ? best : undefined;
}

function editDistance(a: string, b: string): number {
	const row = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		let prev = row[0];
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cur = row[j];
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
			prev = cur;
		}
	}
	return row[b.length];
}

/** "**Paw 3d6": bold that opens and never closes shows its stars instead of bold. */
function checkBold(issues: StatblockIssue[], line: number, text: string): void {
	const stars = [...text.matchAll(/\*\*/g)];
	if (stars.length % 2 === 0) return;
	const at = stars[stars.length - 1].index ?? 0;
	const word = text.slice(at + 2).match(/^\s*([^\s*.:,]+(?:\s+[^\s*.:,\d][^\s*.:,]*)?)/)?.[1];
	const mark = word ? `**${word}` : '**';
	issues.push({
		line, text: text.trim(), mark,
		message: word ? `The bold here isn't closed: “**${word}” has ** in front but not after.` : 'This line has ** that isn\'t closed, so the stars show instead of bold.',
		hint: word ? `Add ** after it, like **${word}**.` : 'Bold text needs ** on both sides, like **Bite**.',
	});
}

/** Values that don't mean anything to Nimble, and what the stat block shows instead. */
function checkValue(issues: StatblockIssue[], line: number, text: string, key: string, value: string): void {
	const v = FREE_TEXT.has(key) ? value : value.replace(/(^|\s+)#\s.*$/, '').trim();
	const add = (message: string, hint: string) => issues.push({ line, text, mark: v, message, hint });
	if ((key === 'hp' || key === 'hitpoints' || key === 'health') && !/^\d+\s*(?:\/|per)\s*hero/i.test(v) && Number.isNaN(parseInt(v, 10))) {
		add(`“${v}” isn't a number, so it has ${DEFAULT_HP} HP for now.`, 'Write a number (hp: 25), or HP per hero for a solo monster (hp: 28/hero).');
	} else if ((key === 'armor' || key === 'armour' || key === 'ac') && !/^(none|n|no|-|m|medium|h|heavy)$/i.test(v)) {
		add(`“${v}” isn't one of Nimble's armor types, so it shows as no armor.`, 'Use none, medium (or M) or heavy (or H).');
	} else if ((key === 'role' || key === 'kind') && !normalizeRole(v)) {
		add(`“${v}” isn't a role, so it's a regular monster.`, 'Use regular, minion, solo or legendary.');
	} else if ((key === 'level' || key === 'lvl') && !/^(\d+(\s*\/\s*\d+)?|\d*\.\d+|[½¼⅓⅛]|\d*x)$/i.test(v)) {
		add(`“${v}” isn't a level, so encounter difficulty can't count this monster.`, 'Write a number like 3, or a fraction like 1/2.');
	}
}

/** Fields that hold a sentence or a name, where " # " may be part of the text. */
const FREE_TEXT = new Set(['name', 'description', 'desc', 'flavor', 'flavour', 'bloodied', 'laststand', 'actiontext', 'actionsintro', 'easier', 'harder', 'multiattack', 'senses', 'languages', 'source']);

/** "fire, cold" → ["fire", "cold"], for a defence list written on one line. */
const inlineList = (value: string) => value.split(/[,;]/).map(s => s.trim()).filter(Boolean);

function processKeyValue(monster: Partial<NimbleMonster>, key: string, value: string): void {
	// A trailing YAML-style comment ("armor: heavy   # none, medium or heavy") is not part of
	// the value. It needs a space on both sides, so #tags and [[Note#Heading]] are left alone.
	if (!FREE_TEXT.has(key)) {
		value = value.replace(/(^|\s+)#\s.*$/, '');
		if (!value) return;
	}
	switch (key) {
		case 'resistances': case 'resistance': monster.resistances = inlineList(value); break;
		case 'immunities': case 'immunity': monster.immunities = inlineList(value); break;
		case 'vulnerabilities': case 'vulnerability': monster.vulnerabilities = inlineList(value); break;
		case 'name': monster.name = value; break;
		case 'type': monster.type = value; break;
		case 'size': monster.size = value; break;
		case 'level': case 'lvl': monster.level = value; break;
		case 'armor': case 'armour': case 'ac':
			monster.armor = normalizeArmor(value);
			break;
		case 'hp': case 'hitpoints': case 'health': {
			const perHero = value.match(/^(\d+)\s*(?:\/|per)\s*hero/i);
			if (perHero) {
				monster.hpPerHero = parseInt(perHero[1], 10);
				break;
			}
			const hp = parseInt(value, 10);
			monster.hp = isNaN(hp) || hp < 0 ? DEFAULT_HP : hp;
			break;
		}
		case 'hpperhero': case 'hp per hero': {
			const n = parseInt(value, 10);
			if (n > 0) monster.hpPerHero = n;
			break;
		}
		case 'role': case 'kind': {
			const role = normalizeRole(value);
			if (role) {
				monster.role = role;
				if (role === 'legendary') monster.roleLabel = /solo/i.test(value) ? 'Solo' : 'Legendary';
			}
			break;
		}
		case 'saves': case 'save': monster.saves = value; break;
		case 'int': {
			// Legacy per-stat saves: fold INT into the saves string.
			monster.saves = [monster.saves, `INT${value}`].filter(Boolean).join(' ');
			break;
		}
		case 'miniondie': case 'minion die': case 'die': {
			const d = value.match(/d?\s*(\d+)/i);
			if (d) monster.minionDie = parseInt(d[1], 10);
			break;
		}
		case 'source': monster.source = value; break;
		case 'group': case 'family': monster.group = value; break;
		case 'habitat': monster.habitat = value; break;
		case 'easier': monster.tactics = { ...monster.tactics, easier: value }; break;
		case 'harder': monster.tactics = { ...monster.tactics, harder: value }; break;
		case 'movement': case 'speed': case 'move': monster.movement = value; break;
		case 'str': monster.str = value; break;
		case 'dex': monster.dex = value; break;
		case 'will': case 'wil': monster.will = value; break;
		case 'cr': monster.cr = value; break;
		case 'senses': monster.senses = value; break;
		case 'languages': monster.languages = value; break;
		case 'multiattack': monster.multiattack = value; break;
		case 'monstertype': {
			const role = normalizeRole(value);
			if (role) monster.role = role;
			if (role === 'legendary') monster.roleLabel = /solo/i.test(value) ? 'Solo' : 'Legendary';
			break;
		}
		case 'description': case 'desc': case 'flavor': case 'flavour': monster.description = value; break;
		case 'bloodied': monster.bloodied = value; break;
		case 'laststand': monster.lastStand = value; break;
		case 'actiontext': case 'actionsintro': monster.actionText = value; break;
	}
}

function processSection(monster: Partial<NimbleMonster>, section: string, items: string[]): void {
	switch (section) {
		// A second "attacks:" heading adds to the list rather than replacing it.
		case 'attacks': case 'actions':
			monster.attacks = [...monster.attacks ?? [], ...items.map(parseAttack)];
			break;
		case 'abilities': case 'traits':
			monster.abilities = [...monster.abilities ?? [], ...items.map(parseAbility)];
			break;
		case 'resistances':
			monster.resistances = [...monster.resistances ?? [], ...items];
			break;
		case 'immunities':
			monster.immunities = [...monster.immunities ?? [], ...items];
			break;
		case 'vulnerabilities':
			monster.vulnerabilities = [...monster.vulnerabilities ?? [], ...items];
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

/** Nimble monsters are unarmored, Medium (M) or Heavy (H). There is no armor class. */
export function normalizeArmor(value: string): ArmorType {
	const v = value.toLowerCase().trim();
	if (v === 'm' || v === 'medium') return 'medium';
	if (v === 'h' || v === 'heavy') return 'heavy';
	return 'none';
}

export function normalizeRole(value: string): MonsterRole | null {
	const v = value.toLowerCase();
	if (/solo|legendary|boss/.test(v)) return 'legendary';
	if (/minion/.test(v)) return 'minion';
	if (/regular|normal|standard/.test(v)) return 'regular';
	return null;
}

// ----------------------------------------------------------------------------
// Writing a monster back out as a ```nimble block (e.g. copying a bundled
// monster into the vault so the GM can edit it)
// ----------------------------------------------------------------------------

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();

export function toStatblockSource(m: NimbleMonster): string {
	const lines: string[] = [`name: ${m.name}`];
	const kv = (key: string, value: string | number | null | undefined) => {
		if (value === undefined || value === null || value === '') return;
		lines.push(`${key}: ${oneLine(String(value))}`);
	};
	kv('level', m.level);
	if (m.role && m.role !== 'regular') kv('role', m.role === 'legendary' ? (m.roleLabel || 'Legendary').toLowerCase() : m.role);
	kv('size', m.size);
	kv('type', m.type);
	if (m.armor !== 'none') kv('armor', m.armor);
	if (m.hpPerHero) kv('hp', `${m.hpPerHero}/hero`);
	else if (m.role !== 'minion') kv('hp', m.hp);
	kv('cr', m.cr);
	if (m.minionDie) kv('minion die', `d${m.minionDie}`);
	if (m.movement && m.movement !== '6') kv('movement', m.movement);
	kv('saves', m.saves);
	kv('senses', m.senses);
	kv('languages', m.languages);
	kv('multiattack', m.multiattack);
	kv('actionText', m.actionText);
	kv('bloodied', m.bloodied);
	kv('lastStand', m.lastStand);
	kv('description', m.description);
	kv('easier', m.tactics?.easier);
	kv('harder', m.tactics?.harder);
	kv('group', m.group);
	kv('habitat', m.habitat);
	kv('source', m.source);
	const list = (key: string, items: string[] | undefined) => {
		if (!items?.length) return;
		lines.push(`${key}:`);
		for (const item of items) lines.push(`- ${oneLine(item)}`);
	};
	list('abilities', m.abilities?.map(a => `${a.name}${a.isLegendary ? ' (L)' : ''}: ${a.description}`));
	list('attacks', m.attacks?.map(a => a.raw));
	list('resistances', m.resistances);
	list('immunities', m.immunities);
	list('vulnerabilities', m.vulnerabilities);
	return lines.join('\n');
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
 * Returns the body of every ```nimble / ~~~nimble fenced block in a note (or ```nimble-spell, … with `lang`).
 * Handles CRLF line endings, longer fences (````nimble), and blocks indented
 * under list items (spaces or tabs), which Obsidian still renders.
 */
export function extractNimbleBlocks(content: string, lang = 'nimble'): string[] {
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
			isNimble = info.trim().split(/\s+/)[0].toLowerCase() === lang;
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

/** The block's text with one issue's fix applied (lines fix.start..fix.end replaced). */
export function applyStatblockFix(source: string, fix: NonNullable<StatblockIssue['fix']>): string {
	const lines = source.split(/\r?\n/);
	lines.splice(fix.start, fix.end - fix.start + 1, ...fix.lines);
	return lines.join('\n');
}
