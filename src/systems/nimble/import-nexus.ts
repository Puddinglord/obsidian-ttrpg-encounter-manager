// Nimble Nexus (nimble.nexus), the community's library of Nimble monsters and
// items, read into an import bundle. Its public API answers in JSON:API: one
// resource or a list under "data", a collection's monsters and items under
// "included". Slate (nimble-screen) exports the same format. Nimbrew is the
// one-monster JSON both of them also export.
// Field by field: a monster's movement list becomes speed / fly / swim…, its
// saves ({ str: 1, all: 2 }) become "STR+ ALL++", Solo is legendary, actions
// keep their reach or range, and "@monster:<id>" in text becomes a link.
// Pure: no Obsidian imports.

import { emptyBundle, BundleEntry, ImportBundle } from '../../core/import/bundle';
import type { Importer } from '../../core/import/importer';
import { inputJson } from '../../core/import/importer';

export const NEXUS = 'Nimble Nexus';
export const NEXUS_SITE = 'https://nimble.nexus';
export const NEXUS_LICENSE = 'Community content from Nimble Nexus, published under the Nimble 3rd Party Creator License. Each entry belongs to its creator.';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const objs = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);

/** 0.5 → "1/2"; "1/4" stays; 3 → "3". */
function levelText(v: unknown): string | undefined {
	const n = num(v);
	if (n === undefined) return str(v);
	const frac: Record<string, string> = { '0.125': '1/8', '0.25': '1/4', '0.5': '1/2' };
	if (frac[String(n)]) return frac[String(n)];
	if (Math.abs(n - 1 / 3) < 0.01) return '1/3';
	return String(n);
}

/** { str: 1, dex: -1, all: 2 } → "STR+ DEX- ALL++". */
export function savesText(v: unknown): string | undefined {
	if (!isObj(v)) return str(v);
	const order = ['str', 'dex', 'int', 'wil', 'all'];
	const parts = Object.entries(v)
		.map(([k, x]) => [k.toLowerCase(), num(x) ?? 0] as const)
		.filter(([, n]) => n !== 0)
		.sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99))
		.map(([k, n]) => `${k.toUpperCase()}${(n > 0 ? '+' : '-').repeat(Math.min(3, Math.abs(Math.round(n))))}`);
	return parts.length ? parts.join(' ') : undefined;
}

/** Nexus's own links in text ("@monster:<id>") as the name, when the import has it (a stat block's text shows no links). */
export function nexusRefs(text: string, names: ReadonlyMap<string, string>): string {
	return text.replace(/@(monster|item)s?:([a-z0-9]{10,})/gi, (_m, kind: string, id: string) => names.get(id) ?? (kind.toLowerCase() === 'item' ? 'an item' : 'a monster'));
}

/** An action's text with its reach or range in front, when the text doesn't already say it. */
function actionText(a: Obj, names: ReadonlyMap<string, string>): string {
	let text = (str(a.description) ?? str(a.plainDescription) ?? '').replace(/\s+\n/g, '\n');
	const t = isObj(a.target) ? a.target : {};
	const reach = num(t.reach);
	const range = num(t.range);
	if (range !== undefined && !/\brange\b/i.test(text)) text = `(Range ${range}) ${text}`;
	else if (reach !== undefined && !/\breach\b/i.test(text)) text = `(Reach ${reach}) ${text}`;
	const roll = isObj(a.damage) ? str(a.damage.roll) : undefined;
	if (roll && !text.includes(roll.replace(/\s+/g, ''))) text = `${roll}. ${text}`;
	return nexusRefs(text.trim(), names);
}

/** A Nexus monster's attributes as a Nimble content-pack monster. */
export function nexusMonster(id: string, a: Obj, names: ReadonlyMap<string, string> = new Map()): BundleEntry | null {
	const name = str(a.name);
	if (!name) return null;
	const sub = str(a.subtype)?.toLowerCase();
	const role = sub === 'legendary' || a.legendary === true ? 'legendary' : sub === 'minion' || a.minion === true ? 'minion' : 'regular';
	const out: BundleEntry = { kind: 'monster', name, role };
	const level = levelText(a.level);
	if (level) out.level = level;
	const size = str(a.size)?.toLowerCase();
	if (size) out.size = size.charAt(0).toUpperCase() + size.slice(1);
	const type = str(a.kind) ?? objs(a.creatureKinds).map(k => str(k.name)).find(Boolean);
	if (type) out.type = type;
	const armor = str(a.armor)?.toLowerCase();
	if (armor === 'medium' || armor === 'heavy') out.armor = armor;
	const perHero = num(a.hpPerHero);
	const hp = num(a.hp);
	if (role === 'legendary' && perHero) out.hpPerHero = Math.round(perHero);
	else if (hp && hp > 0) out.hp = Math.round(hp);
	for (const m of objs(a.movement)) {
		const speed = num(m.speed);
		if (speed === undefined) continue;
		const mode = str(m.mode)?.toLowerCase();
		if (!mode || mode === 'walk') out.speed = speed;
		else if (['fly', 'swim', 'climb', 'burrow'].includes(mode)) out[mode] = speed;
	}
	const saves = savesText(a.saves);
	if (saves) out.saves = saves;
	const traits = objs(a.abilities).map(x => ({ name: str(x.name) ?? '', text: nexusRefs(str(x.description) ?? '', names) })).filter(x => x.name && x.text);
	if (traits.length) out.traits = traits;
	const named = objs(a.actions).filter(x => str(x.name));
	const actions = objs(a.actions).map((x, i) => ({ name: str(x.name)?.replace(/[.:]\s*$/, '') ?? (named.length ? `Action ${i + 1}` : 'Attack'), text: actionText(x, names) })).filter(x => x.text);
	if (actions.length) out.actions = actions;
	const intro = str(a.actionsInstructions);
	if (intro && actions.length > 1) out.actionsIntro = intro;
	else if (intro && actions.length === 1 && actions[0].name === 'Attack') actions[0].name = intro;
	const bloodied = isObj(a.bloodied) ? str(a.bloodied.description) : str(a.bloodied);
	if (bloodied) out.bloodied = nexusRefs(bloodied, names);
	const last = isObj(a.lastStand) ? str(a.lastStand.description) : str(a.lastStand);
	if (last) out.lastStand = nexusRefs(last, names);
	const flavor = str(a.description);
	if (flavor) out.flavor = nexusRefs(flavor, names);
	out.importedFrom = { name: NEXUS, id: `nexus:monster:${id}`, url: `${NEXUS_SITE}/monsters/${id}` };
	return out;
}

const CATEGORY: [RegExp, string][] = [
	[/\b(weapon|sword|blade|axe|bow|crossbow|dagger|mace|hammer|spear|staff|whip|club|flail|glaive|halberd|lance|maul|pike|rapier|scimitar|sickle|sling)\b/i, 'weapon'],
	[/\b(shield|buckler)\b/i, 'shield'],
	[/\b(armou?r|mail|plate|helm|helmet|gauntlets?|bracers)\b/i, 'armor'],
	[/\b(potion|elixir|scroll|consumable|food|oil|poison|draught|tonic|ammunition|bomb)\b/i, 'consumable'],
	[/\b(wand|rod)\b/i, 'magic'],
];

/** A Nexus item's attributes as a Nimble content-pack item. */
export function nexusItem(id: string, a: Obj, names: ReadonlyMap<string, string> = new Map()): BundleEntry | null {
	const name = str(a.name);
	if (!name) return null;
	const kind = str(a.kind);
	const rarity = str(a.rarity)?.replace(/_/g, ' ').toLowerCase();
	const category = (kind && CATEGORY.find(([re]) => re.test(kind))?.[1]) ?? (rarity ? 'magic' : 'gear');
	const text = [str(a.description), str(a.moreInfo) ? `**For the GM:** ${str(a.moreInfo)}` : undefined].filter(Boolean).join('\n\n');
	return {
		kind: 'item', name, category,
		...(kind ? { subcategory: kind } : {}),
		...(rarity ? { rarity } : {}),
		text: nexusRefs(text, names) || '—',
		importedFrom: { name: NEXUS, id: `nexus:item:${id}`, url: `${NEXUS_SITE}/items/${id}` },
	};
}

/** Is this Nexus's JSON:API answer (a monster, an item, a collection, or a list of them)? */
export function isNexus(j: unknown): boolean {
	if (!isObj(j)) return false;
	const data = Array.isArray(j.data) ? j.data : [j.data];
	return data.length > 0 && data.every(r => isObj(r) && ['monsters', 'items', 'collections'].includes(String(r.type)) && isObj(r.attributes));
}

/** A Nexus answer as a bundle of Nimble content, with anything worth a look. */
export function nexusBundle(j: Obj): { bundle: ImportBundle; notes: string[] } {
	const data = Array.isArray(j.data) ? objs(j.data) : isObj(j.data) ? [j.data] : [];
	const included = objs(j.included);
	const notes: string[] = [];
	const resources: Obj[] = [];
	for (const r of data) {
		if (r.type !== 'collections') { resources.push(r); continue; }
		const rel = isObj(r.relationships) ? r.relationships : {};
		const wanted = new Set(['monsters', 'items'].flatMap(k => (isObj(rel[k]) ? objs((rel[k]).data) : []).map(x => `${String(x.type)}:${String(x.id)}`)));
		const found = included.filter(x => wanted.size ? wanted.has(`${String(x.type)}:${String(x.id)}`) : ['monsters', 'items'].includes(String(x.type)));
		const a = isObj(r.attributes) ? r.attributes : {};
		const expected = (num(a.monsterCount) ?? 0) + (num(a.itemCount) ?? 0);
		if (!found.length && expected) notes.push(`The collection ${str(a.name) ?? ''} lists ${expected} entries, but they weren't in this file. Paste the collection's link instead, and Ember Vault fetches them.`.replace('  ', ' '));
		resources.push(...found);
	}
	const names = new Map<string, string>();
	for (const r of [...resources, ...included]) { const n = isObj(r.attributes) ? str(r.attributes.name) : undefined; const rid = str(r.id); if (n && rid) names.set(rid, n); }
	const content: BundleEntry[] = [];
	let nameless = 0;
	for (const r of resources) {
		const a = isObj(r.attributes) ? r.attributes : {};
		const id = str(r.id) ?? '';
		const e = r.type === 'monsters' ? nexusMonster(id, a, names) : r.type === 'items' ? nexusItem(id, a, names) : null;
		if (e) content.push(e); else nameless++;
	}
	if (nameless) notes.push(`${nameless === 1 ? 'An entry' : `${nameless} entries`} with no name ${nameless === 1 ? 'was' : 'were'} left out.`);
	return { bundle: emptyBundle({ system: 'nimble', source: { name: NEXUS, license: NEXUS_LICENSE, url: NEXUS_SITE }, content }), notes };
}

// ----------------------------------------------------------------------------
// Nimbrew: one monster, flattened (Nexus's and Slate's "Nimbrew" export)

/** Is this a Nimbrew monster? */
export function isNimbrew(j: unknown): j is Obj {
	return isObj(j) && typeof j.name === 'string' && typeof j.CR === 'string' && (Array.isArray(j.actions) || Array.isArray(j.passives));
}

/** "Level 1 Solo Small Elemental", "Level 1/2 Minion Medium Goblin". */
function readCr(cr: string): { level?: string; role?: string; size?: string; type?: string } {
	const m = /^\s*level\s+(\d+(?:\/\d+)?|\d*\.\d+)\s*(.*)$/i.exec(cr);
	let rest = m ? m[2] : cr;
	const out: { level?: string; role?: string; size?: string; type?: string } = {};
	if (m) out.level = levelText(m[1]);
	const take = (re: RegExp) => { const x = re.exec(rest); if (!x) return undefined; rest = rest.replace(re, ' ').trim(); return x[1]; };
	const role = take(/\b(solo|legendary|minion)\b/i)?.toLowerCase();
	if (role) out.role = role === 'minion' ? 'minion' : 'legendary';
	const size = take(/\b(tiny|small|medium|large|huge|gargantuan)\b/i);
	if (size) out.size = size.charAt(0).toUpperCase() + size.slice(1).toLowerCase();
	if (rest.trim()) out.type = rest.trim().replace(/\s+/g, ' ');
	return out;
}

/** A Nimbrew monster as a bundle. */
export function nimbrewBundle(j: Obj): { bundle: ImportBundle; notes: string[] } {
	const name = str(j.name);
	if (!name) return { bundle: emptyBundle({ system: 'nimble' }), notes: ['It has no name, so nothing was read.'] };
	const cr = readCr(str(j.CR) ?? '');
	const out: BundleEntry = { kind: 'monster', name, role: cr.role ?? 'regular' };
	if (cr.level) out.level = cr.level;
	if (cr.size) out.size = cr.size;
	if (cr.type) out.type = cr.type;
	const armor = str(j.armor)?.toLowerCase();
	if (armor && /^(m|medium)$/.test(armor)) out.armor = 'medium';
	else if (armor && /^(h|heavy)$/.test(armor)) out.armor = 'heavy';
	const hp = num(str(j.hp)?.replace(/[^\d.]/g, ''));
	if (hp) out.hp = Math.round(hp);
	const speed = str(j.speed);
	if (speed) out.movement = speed;
	const saves = str(j.saves);
	if (saves) out.saves = saves;
	const pairs = (list: unknown): { name: string; text: string }[] => objs(list).flatMap(x => {
		if (x.type === 'multi') return pairs(x.actions);
		return [{ name: str(x.name)?.replace(/[.:]\s*$/, '') ?? '', text: str(x.desc) ?? '' }];
	}).filter(x => x.name || x.text).map((x, i) => ({ name: x.name || `Action ${i + 1}`, text: x.text || x.name }));
	const traits = pairs(j.passives);
	if (traits.length) out.traits = traits;
	const actions = pairs(j.actions);
	if (actions.length) out.actions = actions;
	const multi = objs(j.actions).find(x => x.type === 'multi');
	if (multi && str(multi.name)) out.actionsIntro = str(multi.name);
	if (str(j.bloodied)) out.bloodied = str(j.bloodied);
	if (str(j.laststand) ?? str(j.lastStand)) out.lastStand = str(j.laststand) ?? str(j.lastStand);
	if (str(j.description)) out.flavor = str(j.description);
	return { bundle: emptyBundle({ system: 'nimble', source: { name: 'Nimbrew' }, content: [out] }), notes: [] };
}

// ----------------------------------------------------------------------------
// The importers

/** A Nexus id: 26 lower-case letters and digits, at the end of a page's address ("…/monsters/asuvius-7aft60…"). */
const PAGE = (kind: string) => new RegExp(`^https://nimble\\.nexus/${kind}/(?:[^/?#]*-)?([a-z0-9]{20,32})/?(?:[?#].*)?$`, 'i');
const idOf = (url: string, kind: string) => PAGE(kind).exec(url)?.[1] ?? '';

export const nexusImporter: Importer = {
	id: 'nimble-nexus',
	label: NEXUS,
	system: 'nimble',
	detect: (input) => (isNexus(inputJson(input)) ? 0.95 : 0),
	read: (input) => {
		const j = inputJson(input);
		if (!isNexus(j)) return { error: 'This isn\'t Nimble Nexus data.' };
		const out = nexusBundle(j as Obj);
		if (!out.bundle.content?.length) return { error: out.notes[0] ?? 'There\'s nothing in this to import.' };
		return out;
	},
	links: [
		{ match: PAGE('monsters'), dataUrl: (u) => `${NEXUS_SITE}/api/monsters/${idOf(u, 'monsters')}` },
		{ match: PAGE('items'), dataUrl: (u) => `${NEXUS_SITE}/api/items/${idOf(u, 'items')}` },
		{ match: PAGE('collections'), dataUrl: (u) => `${NEXUS_SITE}/api/collections/${idOf(u, 'collections')}?include=monsters,items` },
	],
};

export const nimbrewImporter: Importer = {
	id: 'nimbrew',
	label: 'Nimbrew',
	system: 'nimble',
	detect: (input) => (isNimbrew(inputJson(input)) ? 0.9 : 0),
	read: (input) => {
		const j = inputJson(input);
		return isNimbrew(j) ? nimbrewBundle(j) : { error: 'This isn\'t a Nimbrew monster.' };
	},
};
