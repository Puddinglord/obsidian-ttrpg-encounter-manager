// What a 5e character can do on a turn, grouped the way the 2024 sheet and
// D&D Beyond group it: Actions (weapons, damaging cantrips), Bonus Actions and
// Reactions (spells cast that way), and Limited use (features with uses that a
// rest brings back). Each row carries what its buttons need: a to-hit bonus or
// a save DC, the damage dice and type, the slot it spends. Pure: no Obsidian imports.

import { Sheet5e, usesSpent } from './character';
import type { ClassResource5e, Spell5e } from './compendium';
import type { Dnd5eEdition } from './editions';
import type { AbilityKey } from './types';

export type ActionGroup5e = 'action' | 'bonus' | 'reaction' | 'limited';
export const ACTION_GROUPS: readonly { id: ActionGroup5e; label: string }[] = [
	{ id: 'action', label: 'Actions' }, { id: 'bonus', label: 'Bonus Actions' }, { id: 'reaction', label: 'Reactions' }, { id: 'limited', label: 'Limited use' },
];

export interface SheetAction5e {
	group: ActionGroup5e;
	kind: 'weapon' | 'spell' | 'resource';
	name: string;
	/** Range and notes: "Finesse, Light, Thrown · 20/60 ft", "Cantrip · 120 ft". */
	note: string;
	/** An attack roll's bonus. */
	hit?: number;
	/** Or a save the target makes. */
	save?: { dc: number; ability: AbilityKey };
	/** "2d10", "1d4+2" (a roll expression), and its type ("fire"). */
	damage?: string;
	damageType?: string;
	/** A spell of level 1+: casting it spends a slot of this level or higher. */
	slotLevel?: number;
	spell?: Spell5e;
	resource?: Resource5e;
}

/** A feature with uses that a rest brings back: Rage, Channel Divinity, Arcane Recovery. */
export interface Resource5e {
	name: string;
	max: number;
	used: number;
	/** What brings them all back. */
	per: 'short' | 'long';
	/** A short rest brings back one (2024's Rage, Channel Divinity, Second Wind, Wild Shape). */
	shortOne?: boolean;
}

const ABILITY_WORD: Record<string, AbilityKey> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
export const ABILITY_SHORT: Record<AbilityKey, string> = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };

/** "1d4+2" → "1d4 + 2", "1d6-1" → "1d6 − 1": dice as the book prints them. */
export function formatDice(expr: string): string {
	return expr.replace(/\s+/g, '').replace(/([+\-−])/g, (m) => ` ${m === '-' ? '−' : m} `).trim();
}

/** "120 feet" → "120 ft", "Self (15-foot cone)" stays. */
function shortRange(range: string): string {
	return range.replace(/(\d+)\s*feet\b/gi, '$1 ft').replace(/(\d+)\s*foot\b/gi, '$1-ft').replace(/(\d+)\s*miles?\b/gi, '$1 mi');
}

/** "Action", "1 bonus action", "Reaction, which you take…" → the group a spell is cast in (undefined: longer). */
export function castGroup(castingTime: string): Exclude<ActionGroup5e, 'limited'> | undefined {
	const t = castingTime.toLowerCase();
	if (/bonus action/.test(t)) return 'bonus';
	if (/reaction/.test(t)) return 'reaction';
	if (/^\s*(1\s+)?action\b/.test(t)) return 'action';
	return undefined;
}

/** What a spell's text says it does to a target: an attack roll or a save, and its damage (cantrips grown by level). */
export function spellEffect(spell: Spell5e, level: number): { attack: boolean; save?: AbilityKey; damage?: string; damageType?: string } {
	const text = spell.desc;
	const attack = /\b(make|makes) a (ranged|melee) spell attack/i.test(text) || /\bspell attack against/i.test(text);
	const sv = /\b(strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw/i.exec(text);
	const dmg = /(\d+)d(\d+)(?:\s*([+−-])\s*(\d+))?\s+(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage/i.exec(text);
	let damage: string | undefined;
	if (dmg) {
		let count = Number(dmg[1]);
		// Cantrips grow at levels 5, 11 and 17: "The damage increases by 1d10 when you reach levels 5 (2d10)…"
		const grow = spell.level === 0 ? /damage increases by (\d+)d\d+/i.exec(text) : null;
		if (grow) count += Number(grow[1]) * [5, 11, 17].filter(l => level >= l).length;
		damage = `${count}d${dmg[2]}${dmg[3] ? `${dmg[3] === '+' ? '+' : '-'}${dmg[4]}` : ''}`;
	}
	return { attack, save: sv ? ABILITY_WORD[sv[1].toLowerCase()] : undefined, damage, damageType: dmg?.[5].toLowerCase() };
}

/** Every row of the Actions tab, in group order. */
export function sheetActions5e(s: Sheet5e): SheetAction5e[] {
	const out: SheetAction5e[] = [];
	for (const a of s.attacks) {
		// "Finesse, light, thrown", as the book runs them together.
		const props = a.properties.filter(p => !/^monk$/i.test(p)).map((p, i) => (i ? p.toLowerCase() : p));
		const reach = a.range ? `${a.range} ft` : '5 ft';
		out.push({ group: 'action', kind: 'weapon', name: a.name, note: [props.join(', '), reach].filter(Boolean).join(' · '), hit: a.toHit, damage: a.damage, damageType: a.damageType || undefined });
	}
	const sc = s.spellcasting;
	for (const { name, spell } of s.spells) {
		if (!spell) continue;
		const group = castGroup(spell.castingTime);
		if (!group) continue;
		const fx = spellEffect(spell, s.level);
		// Leveled spells cast as an action stay on the Spells tab; cantrips that hurt, and anything quicker, come here.
		if (group === 'action' && (spell.level > 0 || (!fx.damage && !fx.attack && !fx.save))) continue;
		const row: SheetAction5e = {
			group, kind: 'spell', name, spell,
			note: [spell.level ? `Level ${spell.level}` : 'Cantrip', shortRange(spell.range)].filter(Boolean).join(' · '),
		};
		if (fx.attack && sc) row.hit = sc.attack;
		else if (fx.save && sc) { row.save = { dc: sc.dc, ability: fx.save }; row.note += ` · ${ABILITY_SHORT[fx.save]} save`; }
		if (fx.damage) { row.damage = fx.damage; row.damageType = fx.damageType; }
		if (spell.level > 0) row.slotLevel = spell.level;
		out.push(row);
	}
	for (const r of resources5e(s)) out.push({ group: 'limited', kind: 'resource', name: r.name, note: restNote(r), resource: r });
	const order = ACTION_GROUPS.map(g => g.id);
	return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

function restNote(r: Resource5e): string {
	if (r.shortOne) return 'One back on a Short Rest, all on a Long Rest';
	return r.per === 'short' ? 'Back on a Short or Long Rest' : 'Back on a Long Rest';
}

/** The lowest slot level at or above `level` with a slot left (undefined: none). */
export function slotFor(s: Sheet5e, level: number): number | undefined {
	return s.slots.find(x => x.level >= level && x.used < x.max)?.level;
}

// ----------------------------------------------------------------------------
// Limited-use features

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const USE_WORDS: Record<string, AbilityKey> = { ...ABILITY_WORD, str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha' };

/**
 * A count written as a formula: numbers, ability modifiers ("CHA", "Charisma modifier"), "PB" (or "proficiency
 * bonus") and "level", with + − × and /, which rounds down. Undefined when it can't be read.
 */
export function evalUses5e(formula: number | string | undefined, v: { mods: Record<AbilityKey, number>; pb: number; level: number }): number | undefined {
	if (typeof formula === 'number') return Number.isFinite(formula) ? Math.floor(formula) : undefined;
	if (typeof formula !== 'string' || !formula.trim()) return undefined;
	const text = formula.toLowerCase().replace(/proficiency bonus/g, 'pb').replace(/\b(?:your|modifier|mod|score|class|times|minimum of \w+)\b/g, ' ').replace(/[×x](?=\s*[\d(a-z])/g, '*').replace(/−/g, '-');
	const tokens = text.match(/\d+|[a-z]+|[-+*/()]/g) ?? [];
	let i = 0;
	const atom = (): number | undefined => {
		const t = tokens[i++];
		if (t === undefined) return undefined;
		if (t === '(') { const n = sum(); return tokens[i++] === ')' ? n : undefined; }
		if (t === '-') { const n = atom(); return n === undefined ? undefined : -n; }
		if (/^\d+$/.test(t)) return Number(t);
		if (t === 'pb') return v.pb;
		if (t === 'level' || t === 'lvl') return v.level;
		const ab = USE_WORDS[t];
		return ab ? v.mods[ab] : undefined;
	};
	const product = (): number | undefined => {
		let n = atom();
		while (n !== undefined && (tokens[i] === '*' || tokens[i] === '/')) {
			const op = tokens[i++];
			const m = atom();
			if (m === undefined) return undefined;
			n = op === '*' ? n * m : m ? Math.floor(n / m) : undefined;
		}
		return n;
	};
	const sum = (): number | undefined => {
		let n = product();
		while (n !== undefined && (tokens[i] === '+' || tokens[i] === '-')) {
			const op = tokens[i++];
			const m = product();
			if (m === undefined) return undefined;
			n = op === '+' ? n + m : n - m;
		}
		return n;
	};
	const n = sum();
	return n !== undefined && i === tokens.length ? n : undefined;
}

/**
 * The SRD's limited-use features its class tables don't count, as class data (what a pack's or your own class
 * writes as `resources`): used for the SRD's own classes only.
 */
const SRD_RESOURCES: Record<Dnd5eEdition, Record<string, ClassResource5e[]>> = {
	'2024': { Bard: [{ name: 'Bardic Inspiration', uses: 'CHA', min: 1, shortFrom: 5 }] },
	'2014': { Bard: [{ name: 'Bardic Inspiration', uses: 'CHA', min: 1, shortFrom: 5 }], Druid: [{ name: 'Wild Shape', uses: 2, level: 2, reset: 'short' }] },
};
const baseName = (n: string) => n.replace(/\s*\(\d+\s+uses?\)\s*$/i, '').trim();

/**
 * The class's limited-use features at this level: the counted ones from the
 * class table (Rage, Channel Divinity, Focus or Ki, Sorcery Points…) and any
 * feature whose text says it's once per rest (Arcane Recovery, Action Surge).
 */
export function resources5e(s: Sheet5e, spent: Record<string, number> = s.usesSpent): Resource5e[] {
	const cls = s.cls;
	if (!cls) return [];
	const row = cls.levels.find(l => l.level === s.level);
	const extra = row?.extra ?? {};
	const n = (k: string) => { const v = extra[k]; return typeof v === 'number' ? v : 0; };
	const is2024 = s.edition === '2024';
	const list: Omit<Resource5e, 'used'>[] = [];
	const add = (name: string, max: number, per: 'short' | 'long', shortOne = false) => { if (max > 0) list.push({ name, max, per, ...(shortOne ? { shortOne } : {}) }); };
	add('Rage', n('rage_count'), 'long', is2024);
	add('Channel Divinity', n('channel_divinity_charges'), is2024 ? 'long' : 'short', is2024);
	add('Wild Shape', n('wild_shape_uses'), 'long', true);
	add('Second Wind', n('second_wind_uses'), 'long', true);
	add('Focus Points', n('focus_points'), 'short');
	add('Ki', n('ki_points'), 'short');
	add('Sorcery Points', n('sorcery_points'), 'long');
	add('Action Surge', n('action_surges'), 'short');
	add('Indomitable', n('indomitable_uses'), 'long');
	const sub = cls.subclasses.find(x => key(x.name) === key(s.subclass));
	// The class's and subclass's own counted features (the SRD's classes: as data, by their name).
	const own = cls.resources ?? (cls.source ? undefined : SRD_RESOURCES[s.edition]?.[cls.name]) ?? [];
	for (const r of [...own, ...(sub?.resources ?? [])]) {
		if (!r?.name || (r.level ?? 1) > s.level) continue;
		const uses = evalUses5e(r.uses, { mods: s.mods, pb: s.pb, level: s.level });
		if (uses === undefined) continue;
		add(r.name, Math.max(r.min ?? 0, uses), r.shortFrom && s.level >= r.shortFrom ? 'short' : r.reset ?? 'long', !!r.shortOne);
	}
	const have = new Set(list.map(r => key(r.name)));
	// Any other class's own counted feature (a content pack's): a number in its table named <feature>_uses, back on the
	// rest the feature's words name ("…when you finish a Short or Long Rest"), else a long rest.
	for (const [k, v] of Object.entries(extra)) {
		if (!/_uses$/.test(k) || typeof v !== 'number') continue;
		const words = k.replace(/_uses$/, '').replace(/_/g, ' ');
		const f = [...cls.features, ...(sub?.features ?? [])].find(x => key(baseName(x.name)) === key(words));
		const name = f ? baseName(f.name) : words.replace(/\b\w/g, c => c.toUpperCase());
		if (have.has(key(name))) continue;
		add(name, v, /short (or long )?rest/i.test(f?.desc ?? '') ? 'short' : 'long');
		have.add(key(name));
	}
	// Once-per-rest features, from their own words.
	const once = /once you use this (feature|benefit)[^.]*until you finish a (short or long|long) rest|must finish a (short or long|long) rest before you can use it again|once per day when you finish a short rest/i;
	for (const f of [...cls.features, ...(sub?.features ?? [])]) {
		if (f.level > s.level) continue;
		const name = baseName(f.name);
		if (have.has(key(name))) continue;
		const m = once.exec(f.desc);
		if (!m) continue;
		const words = (m[2] ?? m[3] ?? '').toLowerCase();
		add(name, 1, words.startsWith('short') ? 'short' : 'long');
		have.add(key(name));
	}
	return list.map(r => ({ ...r, used: Math.min(r.max, spent[r.name] ?? 0) }));
}

/** Set how many uses are left (from a pip row). */
export function setUsesLeft(fm: Record<string, unknown>, r: Resource5e, left: number): void {
	const spent = usesSpent(fm);
	const used = r.max - Math.max(0, Math.min(r.max, Math.floor(left)));
	if (used) spent[r.name] = used; else delete spent[r.name];
	if (Object.keys(spent).length) fm.uses_spent = spent; else delete fm.uses_spent;
}

/** A rest brings uses back: a long rest all of them; a short rest the short-rest ones, and one of each "one back" kind. */
export function restoreUses(fm: Record<string, unknown>, s: Sheet5e, rest: 'short' | 'long'): void {
	if (rest === 'long') { delete fm.uses_spent; return; }
	const spent = usesSpent(fm);
	for (const r of resources5e(s, spent)) {
		if (!spent[r.name]) continue;
		if (r.per === 'short') delete spent[r.name];
		else if (r.shortOne) spent[r.name] = Math.max(0, spent[r.name] - 1) || 0;
		if (!spent[r.name]) delete spent[r.name];
	}
	if (Object.keys(spent).length) fm.uses_spent = spent; else delete fm.uses_spent;
}
