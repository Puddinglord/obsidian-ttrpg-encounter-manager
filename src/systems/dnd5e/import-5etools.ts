// Two 5e formats many tools share, read into an import bundle:
// - 5etools homebrew JSON ({ "monster": […], "spell": […], "item": […] }), the
//   format most 5e homebrew tools write. Its {@tag …} markup becomes our text:
//   {@hit 5} is +5, {@damage 2d6} is 2d6, {@condition prone} is prone.
// - Open5e's API (v2 creatures), by link or file. Each creature says which
//   book it's from and who published it.
// Ember Vault never fetches 5etools: it only reads a file you bring.
// Pure: no Obsidian imports.

import { emptyBundle, BundleEntry, ImportBundle } from '../../core/import/bundle';
import type { Importer } from '../../core/import/importer';
import { inputJson } from '../../core/import/importer';
import { htmlToText } from '../../core/html-text';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\s*[+-]?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : undefined);
const objs = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 0.25 → "1/4". */
export function crText(v: unknown): string | undefined {
	const n = typeof v === 'number' ? v : undefined;
	if (n === undefined) return str(v);
	return ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' } as Record<number, string>)[n] ?? String(n);
}

const ABILITY = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABILITY_LONG: Record<string, string> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

// ----------------------------------------------------------------------------
// 5etools

const SIZE: Record<string, string> = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };
const ALIGN: Record<string, string> = { L: 'lawful', N: 'neutral', C: 'chaotic', G: 'good', E: 'evil', U: 'unaligned', A: 'any alignment' };
const SCHOOL: Record<string, string> = { A: 'Abjuration', C: 'Conjuration', D: 'Divination', E: 'Enchantment', V: 'Evocation', I: 'Illusion', N: 'Necromancy', T: 'Transmutation' };
const ITEM_TYPE: Record<string, string> = { RG: 'Ring', RD: 'Rod', WD: 'Wand', P: 'Potion', SC: 'Scroll', M: 'Weapon', R: 'Weapon', A: 'Ammunition', LA: 'Armor', MA: 'Armor', HA: 'Armor', S: 'Shield', G: 'Adventuring gear', INS: 'Instrument', OTH: 'Wondrous item' };
const RARITY: Record<string, string> = { none: '', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', 'very rare': 'Very Rare', legendary: 'Legendary', artifact: 'Artifact', varies: 'Varies' };

/** 5etools' {@tag text|source|shown} markup as our text. */
export function untag(s: string): string {
	let out = s;
	// Inner tags first: repeat until none are left.
	for (let i = 0; i < 6 && /\{@/.test(out); i++) {
		out = out.replace(/\{@(\w+)\s*([^{}]*)\}/g, (_m, tag: string, body: string) => {
			const parts = body.split('|');
			const first = parts[0].trim();
			const shown = parts.length > 2 && parts[2].trim() ? parts[2].trim() : first;
			switch (tag.toLowerCase()) {
				case 'hit': return /^[+-]/.test(first) ? first : `+${first}`;
				case 'h': return 'Hit: ';
				case 'm': return 'Miss: ';
				case 'hom': return 'Hit or Miss: ';
				case 'dc': return `DC ${first}`;
				case 'atk': case 'atkr': {
					const k = first.split(',').map(x => x.trim());
					const roll = tag.toLowerCase() === 'atkr';
					const word = (x: string) => (x.startsWith('m') ? 'Melee' : 'Ranged') + (roll ? '' : x.endsWith('s') ? ' Spell' : ' Weapon');
					return `${k.map(word).join(' or ')} ${roll ? 'Attack Roll' : 'Attack'}: `;
				}
				case 'recharge': return `(Recharge ${first ? `${first}–6` : '6'})`;
				case 'b': case 'bold': return `**${first}**`;
				case 'i': case 'italic': return `*${first}*`;
				case 'actsave': return `${cap(ABILITY_LONG[first] ? first : ({ str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' } as Record<string, string>)[first] ?? first)} Saving Throw:`;
				case 'actsavefail': return 'Failure:';
				case 'actsavesuccess': return 'Success:';
				case 'actsavesuccessorfail': return 'Failure or Success:';
				case 'actresponse': return '';
				case 'actrigger': return 'Trigger:';
				case 'note': return first;
				default: return shown;
			}
		});
	}
	return out.replace(/\s+([,.;:])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}

/** 5etools' entries (text, lists, nested entries, tables) as our text. */
export function entriesText(v: unknown): string {
	if (typeof v === 'string') return untag(v);
	if (Array.isArray(v)) return v.map(entriesText).filter(Boolean).join('\n\n');
	if (!isObj(v)) return '';
	switch (v.type) {
		case 'list': return objs(v.items).length || Array.isArray(v.items) ? (v.items as unknown[]).map(x => `- ${entriesText(isObj(x) && x.type === 'item' ? (x.entries ?? x.entry ?? '') : x).replace(/\n+/g, ' ')}`).join('\n') : '';
		case 'item': return `${str(v.name) ? `**${untag(str(v.name)!)}** ` : ''}${entriesText(v.entries ?? v.entry)}`;
		case 'table': {
			const head = Array.isArray(v.colLabels) ? `| ${(v.colLabels as unknown[]).map(c => untag(String(c))).join(' | ')} |` : '';
			const rows = (Array.isArray(v.rows) ? v.rows : []).map(r => `| ${(Array.isArray(r) ? r : []).map(c => entriesText(c).replace(/\n+/g, ' ')).join(' | ')} |`);
			return [head, head ? `|${(v.colLabels as unknown[]).map(() => ' --- ').join('|')}|` : '', ...rows].filter(Boolean).join('\n');
		}
		default: {
			const name = str(v.name);
			const body = entriesText(v.entries ?? v.entry ?? v.items ?? '');
			return name ? `**${untag(name)}.** ${body}` : body;
		}
	}
}

/** A named block list ({ name, entries }[]) as features. */
const features = (v: unknown) => objs(v).map(x => ({ name: untag(str(x.name) ?? ''), desc: entriesText(x.entries ?? x.entry) })).filter(x => x.name && x.desc);

function speedText(v: unknown): string | undefined {
	if (typeof v === 'number') return `${v} ft.`;
	if (!isObj(v)) return str(v);
	const one = (k: string, x: unknown) => {
		const n = isObj(x) ? num(x.number) : num(x);
		if (n === undefined) return '';
		const cond = isObj(x) ? str(x.condition) : undefined;
		return `${k === 'walk' ? '' : `${k} `}${n} ft.${cond ? ` ${untag(cond)}` : ''}`;
	};
	const parts = ['walk', 'burrow', 'climb', 'fly', 'swim'].filter(k => v[k] !== undefined).map(k => one(k, v[k])).filter(Boolean);
	if (v.canHover === true && parts.some(p => p.startsWith('fly'))) parts[parts.findIndex(p => p.startsWith('fly'))] += ' (hover)';
	return parts.join(', ') || undefined;
}

function typeText(v: unknown): string | undefined {
	if (!isObj(v)) return str(v);
	const t = str(v.type) ?? (isObj(v.type) ? str((v.type).choose) : undefined);
	const tags = Array.isArray(v.tags) ? (v.tags as unknown[]).map(x => (isObj(x) ? str(x.tag) : str(x))).filter(Boolean) : [];
	return t ? `${t}${tags.length ? ` (${tags.join(', ')})` : ''}` : undefined;
}

const damageList = (v: unknown): string[] | undefined => {
	if (!Array.isArray(v)) return undefined;
	const out = v.flatMap(x => (typeof x === 'string' ? [x] : isObj(x) ? [...(Array.isArray(x.resist) ? x.resist : Array.isArray(x.immune) ? x.immune : Array.isArray(x.vulnerable) ? x.vulnerable : Array.isArray(x.conditionImmune) ? x.conditionImmune : []).map(String).map(s => `${s}${str(x.note) ? ` (${str(x.note)})` : ''}`)] : []));
	return out.length ? out.map(x => cap(untag(x))) : undefined;
};

const mods = (v: unknown, long = false): Record<string, number> | undefined => {
	if (!isObj(v)) return undefined;
	const out: Record<string, number> = {};
	for (const [k, x] of Object.entries(v)) {
		const n = num(typeof x === 'string' ? x.replace(/\s/g, '') : x);
		if (n === undefined) continue;
		const key = long ? k.split(/[_\s]/).map(cap).join(' ') : (ABILITY_LONG[k.toLowerCase()] ?? k.toLowerCase());
		out[key] = n;
	}
	return Object.keys(out).length ? out : undefined;
};

/** A 5etools monster as a 5e content-pack monster. */
export function toolsMonster(m: Obj, sourceName: string): BundleEntry | null {
	const name = str(m.name);
	if (!name || m._copy) return null;
	const out: BundleEntry = { kind: 'monster', name };
	const size = Array.isArray(m.size) ? (m.size as unknown[]).map(s => SIZE[String(s)] ?? String(s)).join(' or ') : SIZE[String(m.size)];
	if (size) out.size = size;
	const type = typeText(m.type);
	if (type) out.type = type;
	if (Array.isArray(m.alignment)) out.alignment = (m.alignment as unknown[]).map(a => (typeof a === 'string' ? ALIGN[a] ?? a : '')).filter(Boolean).join(' ');
	const ac: unknown = Array.isArray(m.ac) ? (m.ac as unknown[])[0] : m.ac;
	const acN = isObj(ac) ? num(ac.ac) : num(ac);
	if (acN !== undefined) out.ac = acN;
	if (isObj(ac) && Array.isArray(ac.from)) out.acNote = (ac.from as unknown[]).map(x => untag(String(x))).join(', ');
	if (isObj(m.hp)) { const hp = num(m.hp.average); if (hp) out.hp = hp; if (str(m.hp.formula)) out.hpFormula = str(m.hp.formula); }
	const speed = speedText(m.speed);
	if (speed) out.speed = speed;
	const scores = ABILITY.map(a => num(m[a]));
	if (scores.every(n => n !== undefined)) out.abilities = scores;
	const saves = mods(m.save);
	if (saves) out.saves = saves;
	const skills = mods(m.skill, true);
	if (skills) out.skills = skills;
	const res = damageList(m.resist); if (res) out.resistances = res;
	const imm = damageList(m.immune); if (imm) out.immunities = imm;
	const vul = damageList(m.vulnerable); if (vul) out.vulnerabilities = vul;
	const cim = damageList(m.conditionImmune); if (cim) out.conditionImmunities = cim;
	const senses = [...(Array.isArray(m.senses) ? (m.senses as unknown[]).map(x => untag(String(x))) : []), ...(num(m.passive) !== undefined ? [`passive Perception ${num(m.passive)}`] : [])];
	if (senses.length) out.senses = senses.join(', ');
	if (Array.isArray(m.languages)) out.languages = (m.languages as unknown[]).map(x => untag(String(x))).join(', ');
	const cr = isObj(m.cr) ? str(m.cr.cr) : str(m.cr);
	if (cr) out.cr = cr;
	for (const [from, to] of [['trait', 'traits'], ['action', 'actions'], ['bonus', 'bonusActions'], ['reaction', 'reactions'], ['legendary', 'legendaryActions']] as const) {
		const f = features(m[from]);
		if (f.length) out[to] = f;
	}
	if (Array.isArray(m.legendaryHeader)) out.legendaryIntro = entriesText(m.legendaryHeader);
	const book = str(m.source);
	out.from = { name: sourceName, id: `5etools:monster:${(book ?? '').toLowerCase()}:${name.toLowerCase()}` };
	return out;
}

function timeText(v: unknown): string | undefined {
	const t = objs(v)[0];
	if (!t) return undefined;
	const n = num(t.number) ?? 1;
	const unit = str(t.unit) ?? '';
	const word = unit === 'action' ? 'Action' : unit === 'bonus' ? 'Bonus Action' : unit === 'reaction' ? 'Reaction' : `${n} ${unit}${n === 1 ? '' : 's'}`;
	return n === 1 && ['action', 'bonus', 'reaction'].includes(unit) ? word : unit === 'action' ? `${n} Actions` : word;
}

function rangeText(v: unknown): string | undefined {
	if (!isObj(v)) return undefined;
	const d = isObj(v.distance) ? v.distance : {};
	const type = str(d.type);
	const amount = num(d.amount);
	if (type === 'self') return 'Self';
	if (type === 'touch') return 'Touch';
	if (type === 'sight') return 'Sight';
	if (type === 'unlimited') return 'Unlimited';
	const shape = str(v.type);
	const dist = amount !== undefined ? `${amount} ${type === 'miles' ? 'miles' : 'feet'}` : type;
	return shape && shape !== 'point' ? `Self (${dist} ${shape})` : dist;
}

function durationText(v: unknown): { text?: string; concentration?: boolean } {
	const d = objs(v)[0];
	if (!d) return {};
	if (d.type === 'instant') return { text: 'Instantaneous' };
	if (d.type === 'permanent') return { text: 'Until dispelled' };
	if (d.type === 'special') return { text: 'Special' };
	const t = isObj(d.duration) ? d.duration : {};
	const n = num(t.amount) ?? 1;
	const unit = str(t.type) ?? '';
	const base = `${n} ${unit}${n === 1 ? '' : 's'}`;
	return d.concentration ? { text: `Concentration, up to ${base}`, concentration: true } : { text: base };
}

/** A 5etools spell as a 5e content-pack spell. */
export function toolsSpell(s: Obj, sourceName: string): BundleEntry | null {
	const name = str(s.name);
	const level = num(s.level);
	if (!name || level === undefined || s._copy) return null;
	const c = isObj(s.components) ? s.components : {};
	const comps = [c.v ? 'V' : '', c.s ? 'S' : '', c.m ? `M (${typeof c.m === 'string' ? c.m : isObj(c.m) ? str(c.m.text) ?? '' : ''})`.replace(' ()', '') : ''].filter(Boolean).join(', ');
	const dur = durationText(s.duration);
	return {
		kind: 'spell', name, level,
		school: SCHOOL[String(s.school)] ?? str(s.school) ?? 'Evocation',
		castingTime: timeText(s.time) ?? 'Action', range: rangeText(s.range) ?? 'Self', components: comps || 'V', duration: dur.text ?? 'Instantaneous',
		desc: entriesText(s.entries) || '—',
		...(Array.isArray(s.entriesHigherLevel) ? { higherLevel: entriesText(objs(s.entriesHigherLevel).map(x => x.entries)) } : {}),
		...(dur.concentration ? { concentration: true } : {}),
		...(isObj(s.meta) && s.meta.ritual ? { ritual: true } : {}),
		from: { name: sourceName, id: `5etools:spell:${(str(s.source) ?? '').toLowerCase()}:${name.toLowerCase()}` },
	};
}

/** A 5etools magic item as a 5e content-pack item. */
export function toolsItem(i: Obj, sourceName: string): BundleEntry | null {
	const name = str(i.name);
	if (!name || i._copy) return null;
	const rarity = RARITY[(str(i.rarity) ?? '').toLowerCase()] ?? cap(str(i.rarity) ?? '');
	if (!rarity) return null;
	return {
		kind: 'item', name, rarity,
		type: i.wondrous === true ? 'Wondrous item' : ITEM_TYPE[(str(i.type) ?? '').split('|')[0]] ?? 'Wondrous item',
		desc: entriesText(i.entries) || '—',
		...(i.reqAttune ? { attunement: true } : {}),
		from: { name: sourceName, id: `5etools:item:${(str(i.source) ?? '').toLowerCase()}:${name.toLowerCase()}` },
	};
}

const isTools = (j: unknown): j is Obj => isObj(j) && (Array.isArray(j.monster) || Array.isArray(j.spell) || Array.isArray(j.item)) && (isObj(j._meta) || objs(j.monster ?? j.spell ?? j.item).some(x => 'source' in x));

export function toolsBundle(j: Obj): { bundle: ImportBundle; notes: string[] } {
	const meta = isObj(j._meta) ? j._meta : {};
	const src = objs(meta.sources)[0];
	const sourceName = (src && (str(src.full) ?? str(src.abbreviation))) ?? '5etools';
	const content: BundleEntry[] = [];
	const notes: string[] = [];
	let copies = 0, skipped = 0;
	for (const [list, read] of [[j.monster, toolsMonster], [j.spell, toolsSpell], [j.item, toolsItem]] as const) {
		for (const x of objs(list)) {
			if (x._copy) { copies++; continue; }
			const e = read(x, sourceName);
			if (e) content.push(e); else skipped++;
		}
	}
	if (copies) notes.push(`${copies} ${copies === 1 ? 'entry is a copy' : 'entries are copies'} of another book's entry ("_copy"), which this file doesn't hold, so ${copies === 1 ? 'it was' : 'they were'} left out.`);
	if (skipped) notes.push(`${skipped} ${skipped === 1 ? 'entry was' : 'entries were'} left out: no name, or not a magic item.`);
	const authors = Array.isArray(src?.authors) ? (src.authors as unknown[]).map(String).join(', ') : undefined;
	return { bundle: emptyBundle({ system: 'dnd5e', source: { name: sourceName, ...(authors ? { license: `By ${authors}` } : {}) }, content }), notes };
}

export const toolsImporter: Importer = {
	id: '5etools',
	label: '5etools homebrew',
	system: 'dnd5e',
	detect: (input) => (isTools(inputJson(input)) ? 0.85 : 0),
	read: (input) => {
		const j = inputJson(input);
		if (!isTools(j)) return { error: 'This isn\'t 5etools homebrew.' };
		const out = toolsBundle(j);
		return out.bundle.content?.length ? out : { error: out.notes[0] ?? 'There\'s nothing in this to import.' };
	},
};

// ----------------------------------------------------------------------------
// Open5e (API v2)

const isOpen5e = (c: unknown): c is Obj => isObj(c) && typeof c.key === 'string' && 'challenge_rating' in c && 'ability_scores' in c;

/** An Open5e creature as a 5e content-pack monster. */
export function open5eMonster(c: Obj): BundleEntry | null {
	const name = str(c.name);
	if (!name) return null;
	const named = (v: unknown) => (isObj(v) ? str(v.name) : str(v));
	const out: BundleEntry = { kind: 'monster', name };
	const size = named(c.size); if (size) out.size = size;
	const type = named(c.type); if (type) out.type = type.toLowerCase();
	const align = str(c.alignment); if (align) out.alignment = align;
	const ac = num(c.armor_class); if (ac !== undefined) out.ac = ac;
	const acNote = str(c.armor_detail); if (acNote) out.acNote = acNote;
	const hp = num(c.hit_points); if (hp) out.hp = hp;
	const hd = str(c.hit_dice); if (hd) out.hpFormula = hd;
	const sp = isObj(c.speed) ? c.speed : {};
	const unit = str(sp.unit) === 'feet' || !str(sp.unit) ? 'ft.' : str(sp.unit)!;
	const speed = ['walk', 'burrow', 'climb', 'fly', 'swim'].filter(k => (num(sp[k]) ?? 0) > 0).map(k => `${k === 'walk' ? '' : `${k} `}${num(sp[k])} ${unit}${k === 'fly' && sp.hover === true ? ' (hover)' : ''}`).join(', ');
	if (speed) out.speed = speed;
	const sc = isObj(c.ability_scores) ? c.ability_scores : {};
	const scores = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map(k => num(sc[k]));
	if (scores.every(n => n !== undefined)) out.abilities = scores;
	const saves = mods(c.saving_throws); if (saves) out.saves = saves;
	const skills = mods(c.skill_bonuses, true); if (skills) out.skills = skills;
	const ri = isObj(c.resistances_and_immunities) ? c.resistances_and_immunities : {};
	for (const [k, to] of [['damage_resistances', 'resistances'], ['damage_immunities', 'immunities'], ['damage_vulnerabilities', 'vulnerabilities'], ['condition_immunities', 'conditionImmunities']] as const) {
		const list = (Array.isArray(ri[k]) ? ri[k] as unknown[] : []).map(named).filter((x): x is string => !!x);
		const shown = str(ri[`${k}_display`]);
		if (shown) out[to] = shown.split(/;\s*|,\s*/).map(cap);
		else if (list.length) out[to] = list.map(cap);
	}
	const senses = [
		...(['darkvision', 'blindsight', 'tremorsense', 'truesight'] as const).filter(k => num(c[`${k}_range`])).map(k => `${cap(k)} ${num(c[`${k}_range`])} ft.`),
		...(num(c.passive_perception) !== undefined ? [`Passive Perception ${num(c.passive_perception)}`] : []),
	];
	if (senses.length) out.senses = senses.join(', ');
	const langs = isObj(c.languages) ? str(c.languages.as_string) : str(c.languages); if (langs) out.languages = langs;
	const cr = crText(c.challenge_rating); if (cr) out.cr = cr;
	const xp = num(c.experience_points); if (xp !== undefined) out.xp = xp;
	const init = num(c.initiative_bonus); if (init !== undefined) out.initiative = init;
	const traits = objs(c.traits).map(t => ({ name: str(t.name) ?? '', desc: htmlToText(str(t.desc) ?? '') })).filter(t => t.name && t.desc);
	if (traits.length) out.traits = traits;
	const limit = (a: Obj) => {
		const u = isObj(a.usage_limits) ? a.usage_limits : undefined;
		if (!u) return '';
		const p = num(u.param);
		return u.type === 'PER_DAY' ? ` (${p ?? 1}/Day)` : u.type === 'RECHARGE_ON_ROLL' ? ` (Recharge ${p && p < 6 ? `${p}–6` : '6'})` : u.type === 'RECHARGE_AFTER_REST' ? ' (Recharges after a Short or Long Rest)' : '';
	};
	const byType = (t: string) => objs(c.actions).filter(a => a.action_type === t).sort((a, b) => (num(a.order_in_statblock) ?? 0) - (num(b.order_in_statblock) ?? 0))
		.map(a => ({ name: `${str(a.name) ?? ''}${limit(a)}`, desc: htmlToText(str(a.desc) ?? '') })).filter(a => a.name && a.desc);
	for (const [t, to] of [['ACTION', 'actions'], ['BONUS_ACTION', 'bonusActions'], ['REACTION', 'reactions'], ['LEGENDARY_ACTION', 'legendaryActions']] as const) {
		const list = byType(t);
		if (list.length) out[to] = list;
	}
	const doc = isObj(c.document) ? c.document : {};
	const book = str(doc.name);
	if (book) out.source = book;
	return out;
}

export function open5eBundle(j: unknown): { bundle: ImportBundle; notes: string[] } {
	const list = isObj(j) && Array.isArray(j.results) ? objs(j.results) : isOpen5e(j) ? [j] : [];
	const content: BundleEntry[] = [];
	const books = new Set<string>();
	for (const c of list.filter(isOpen5e)) {
		const e = open5eMonster(c);
		if (!e) continue;
		const doc = isObj(c.document) ? c.document : {};
		const pub = isObj(doc.publisher) ? str(doc.publisher.name) : undefined;
		if (str(doc.name)) books.add(`${str(doc.name)}${pub ? ` (${pub})` : ''}`);
		// The book is the monster's own "source"; where it came from is "from".
		const key = str(c.key)!;
		content.push({ ...e, from: { name: 'Open5e', id: `open5e:${key}`, url: `https://open5e.com/monsters/${key}` } });
	}
	const notes: string[] = [];
	if (isObj(j) && typeof j.next === 'string' && j.next) notes.push('This is one page of results. Open5e has more after it.');
	return { bundle: emptyBundle({ system: 'dnd5e', source: { name: 'Open5e', license: [...books].join('; ') || undefined }, content }), notes };
}

export const open5eImporter: Importer = {
	id: 'open5e',
	label: 'Open5e',
	system: 'dnd5e',
	detect: (input) => {
		const j = inputJson(input);
		return isOpen5e(j) || (isObj(j) && Array.isArray(j.results) && objs(j.results).some(isOpen5e)) ? 0.9 : 0;
	},
	read: (input) => {
		const out = open5eBundle(inputJson(input));
		return out.bundle.content?.length ? out : { error: 'There are no creatures in this.' };
	},
	links: [
		{ match: /^https:\/\/api\.open5e\.com\/v2\/creatures\/[\w-]+\/?(\?.*)?$/i, dataUrl: (u) => u.replace(/\/?(\?.*)?$/, '/?format=json') },
		{ match: /^https:\/\/(?:www\.)?open5e\.com\/(?:monsters|creatures|bestiary)\/[\w-]+\/?$/i, dataUrl: (u) => `https://api.open5e.com/v2/creatures/${u.replace(/\/$/, '').split('/').pop()}/?format=json` },
	],
};
