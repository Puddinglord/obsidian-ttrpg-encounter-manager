// The Ember Vault import bundle: what every importer turns its format into, and
// what other tools and AIs can write directly. One game's content entries (the
// content-pack shape, checked by spec.ts), NPC, location and quest notes, and
// maps with pins, each able to say where it came from so a second import of
// the same thing updates rather than duplicates. The JSON Schema published
// with the docs is written from here, so they can't drift.
// Pure: no Obsidian imports.

import { checkEntry, KindSpec } from '../content/spec';

export const BUNDLE_FORMAT = 'ember-vault-bundle';
export const BUNDLE_VERSION = 1;

/** Where a record (or the whole bundle) came from. `id` is what a later import of the same thing matches on. */
export interface BundleSource {
	name?: string;
	url?: string;
	license?: string;
	id?: string;
	retrieved?: string;
}

/** A content entry: a content pack's entry for the bundle's game, plus where it came from. */
export interface BundleEntry {
	kind: string;
	name: string;
	/** Where it came from; as text, the kind's own "source" field (a 5e monster's book). */
	source?: BundleSource | string;
	/** The game it was written for, when it was converted to this one ("5e"). */
	converted?: string;
	[field: string]: unknown;
}

export const NOTE_KINDS = ['npc', 'location', 'quest', 'note'] as const;
export type BundleNoteKind = typeof NOTE_KINDS[number];

export interface BundleNote {
	kind: BundleNoteKind;
	name: string;
	/** Properties: the shared ones for the kind (role, faction…) and the game's (level, hp…). */
	fields?: Record<string, unknown>;
	/** An NPC's card: look, wants, voice, secret. */
	card?: Record<string, string>;
	/** Markdown under the note's own sections. */
	body?: string;
	source?: BundleSource;
}

export interface BundlePin {
	/** Percent of the image's width and height, from the top left. */
	x: number;
	y: number;
	label: string;
	/** What's here: becomes the pin's section in the map's key (or its own note). */
	text?: string;
	/** A note to link instead: its name. */
	note?: string;
	kind?: string;
}

export interface BundleMap {
	name: string;
	/** The picture: a file in `files`, or one the user picks alongside. */
	image?: { file: string };
	/** Columns × rows, "30x20". */
	grid?: string;
	pins?: BundlePin[];
	/** Markdown at the top of the map's note (a dungeon's story). */
	body?: string;
	source?: BundleSource;
}

/** A file the bundle carries: base64 in JSON; `bytes` only in memory (an adapter's decoded image). */
export interface BundleFile {
	name: string;
	data?: string;
	bytes?: Uint8Array;
}

export interface ImportBundle {
	format: typeof BUNDLE_FORMAT;
	version: number;
	/** The game the content is for (any alias the registry knows). Notes and maps alone need none. */
	system?: string;
	edition?: string;
	source?: BundleSource;
	content?: BundleEntry[];
	notes?: BundleNote[];
	maps?: BundleMap[];
	files?: BundleFile[];
	/** Reserved for whole campaigns (#30): chapters and scenes. Not read yet. */
	campaign?: unknown;
}

/** A new, empty bundle. */
export const emptyBundle = (o: Partial<ImportBundle> = {}): ImportBundle => ({ format: BUNDLE_FORMAT, version: BUNDLE_VERSION, ...o });

// ----------------------------------------------------------------------------
// Checking

export type RecordType = 'content' | 'note' | 'map';

/** One record, checked: what it is, the value to write when it can be used, and what's wrong. */
export interface CheckedRecord {
	type: RecordType;
	/** The content kind ("monster"), or the note kind ("npc"), or "map". */
	kind: string;
	name: string;
	/** "content 3 (Mire Hag)": where it is in the bundle, for messages. */
	at: string;
	/** The entry's checked fields (content), the note, or the map. Undefined when it can't be used. */
	value?: Record<string, unknown>;
	source?: BundleSource;
	converted?: string;
	errors: string[];
	warnings: string[];
}

export interface CheckedBundle {
	/** Why nothing can be read at all (not a bundle, an unknown game). */
	error?: string;
	/** The game's id, resolved. */
	system?: string;
	edition?: string;
	source?: BundleSource;
	records: CheckedRecord[];
	/** Things about the whole bundle worth saying (a part not read yet). */
	warnings: string[];
	files: BundleFile[];
}

/** What checking needs to know about games: an id or alias to the game, and its kinds and editions. */
export interface BundleGames {
	resolve(system: string): { id: string; kinds: readonly KindSpec[]; editions?: readonly string[] } | undefined;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);

/** A source as written, kept to its text fields. */
export function readSource(v: unknown): BundleSource | undefined {
	if (!isObj(v)) return typeof v === 'string' && v.trim() ? { name: v.trim() } : undefined;
	const out: BundleSource = {};
	for (const k of ['name', 'url', 'license', 'id', 'retrieved'] as const) { const s = str(v[k]); if (s) out[k] = s; }
	return Object.keys(out).length ? out : undefined;
}

/** A file name with no folders, no ".." and nothing a vault path can't hold; null when nothing's left. */
export function safeAssetName(name: string): string | null {
	const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
	const clean = base.replace(/[:*?"<>|#^[\]]/g, '').replace(/^\.+/, '').trim();
	return clean && clean !== '.' && clean !== '..' ? clean : null;
}

/** "Mire Hag" from an entry, or "" (said as missing). */
const nameOf = (v: Record<string, unknown>) => str(v.name) ?? '';

function checkContent(raw: unknown, i: number, kinds: ReadonlyMap<string, KindSpec> | undefined, gameName: string | undefined): CheckedRecord {
	const at = (name: string) => `content ${i + 1}${name ? ` (${name})` : ''}`;
	if (!isObj(raw)) return { type: 'content', kind: '', name: '', at: at(''), errors: ['should be an object with "kind" and "name"'], warnings: [] };
	const name = nameOf(raw);
	const kindName = str(raw.kind)?.toLowerCase() ?? '';
	// "source" as an object is where the entry came from; as text it's the entry's own field (a 5e monster's book).
	const base = { type: 'content' as const, kind: kindName, name, at: at(name), source: isObj(raw.source) ? readSource(raw.source) : undefined, converted: str(raw.converted) };
	if (!kinds) return { ...base, errors: ['the bundle says no "system", so content can\'t be read'], warnings: [] };
	const kind = kinds.get(kindName);
	if (!kind) return { ...base, errors: [kindName ? `${gameName ?? 'This game'} has no "${kindName}" kind (it has ${[...kinds.keys()].join(', ')})` : '"kind" is missing'], warnings: [] };
	const { kind: _k, converted: _c, ...fields } = raw;
	if (isObj(fields.source) || !kind.fields.source) delete fields.source;
	const checked = checkEntry(kind, fields);
	const errors = [...checked.errors];
	if (!name) errors.unshift('"name" is missing');
	return { ...base, value: errors.length ? undefined : checked.value, errors, warnings: checked.warnings };
}

function checkNote(raw: unknown, i: number): CheckedRecord {
	const at = (name: string) => `note ${i + 1}${name ? ` (${name})` : ''}`;
	if (!isObj(raw)) return { type: 'note', kind: '', name: '', at: at(''), errors: ['should be an object with "kind" and "name"'], warnings: [] };
	const name = nameOf(raw);
	const kind = str(raw.kind)?.toLowerCase() ?? '';
	const base = { type: 'note' as const, kind, name, at: at(name), source: readSource(raw.source) };
	const errors: string[] = [];
	const warnings: string[] = [];
	if (!name) errors.push('"name" is missing');
	if (!(NOTE_KINDS as readonly string[]).includes(kind)) errors.push(`"kind" should be one of: ${NOTE_KINDS.join(', ')}${kind ? ` (it says "${kind}")` : ''}`);
	if (raw.fields !== undefined && !isObj(raw.fields)) errors.push('"fields" should be an object of properties');
	if (raw.card !== undefined && !isObj(raw.card)) errors.push('"card" should be an object (look, wants, voice, secret)');
	if (raw.body !== undefined && typeof raw.body !== 'string') errors.push('"body" should be text');
	const card: Record<string, string> | undefined = isObj(raw.card)
		? Object.fromEntries(Object.entries(raw.card).map(([k, v]): [string, string] => [k, str(v) ?? '']).filter(([, v]) => v))
		: undefined;
	for (const k of Object.keys(raw)) if (!['kind', 'name', 'fields', 'card', 'body', 'source'].includes(k)) warnings.push(`"${k}" isn't a field here, so it was left out`);
	const value: Record<string, unknown> = { kind, name, ...(isObj(raw.fields) ? { fields: raw.fields } : {}), ...(card && Object.keys(card).length ? { card } : {}), ...(typeof raw.body === 'string' ? { body: raw.body } : {}) };
	return { ...base, value: errors.length ? undefined : value, errors, warnings };
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

function checkMap(raw: unknown, i: number, files: ReadonlySet<string>): CheckedRecord {
	const at = (name: string) => `map ${i + 1}${name ? ` (${name})` : ''}`;
	if (!isObj(raw)) return { type: 'map', kind: 'map', name: '', at: at(''), errors: ['should be an object with "name"'], warnings: [] };
	const name = nameOf(raw);
	const base = { type: 'map' as const, kind: 'map', name, at: at(name), source: readSource(raw.source) };
	const errors: string[] = [];
	const warnings: string[] = [];
	if (!name) errors.push('"name" is missing');
	let image: { file: string } | undefined;
	if (raw.image !== undefined) {
		const file = isObj(raw.image) ? str(raw.image.file) : str(raw.image);
		const safe = file ? safeAssetName(file) : null;
		if (!safe) errors.push('"image" should be { "file": "<name of a picture>" }');
		else {
			image = { file: safe };
			if (!files.has(safe.toLowerCase())) warnings.push(`its picture, ${safe}, isn't in the bundle: choose it with the bundle, or the map is made without it`);
		}
	}
	let grid: string | undefined;
	if (raw.grid !== undefined) {
		const g = /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(str(raw.grid) ?? '');
		if (g) grid = `${g[1]}x${g[2]}`; else warnings.push('"grid" should be columns x rows, like "30x20", so it was left out');
	}
	const pins: BundlePin[] = [];
	if (raw.pins !== undefined && !Array.isArray(raw.pins)) errors.push('"pins" should be a list');
	(Array.isArray(raw.pins) ? raw.pins : []).forEach((p, j) => {
		const x = isObj(p) ? num(p.x) : undefined;
		const y = isObj(p) ? num(p.y) : undefined;
		const label = isObj(p) ? str(p.label) : undefined;
		if (!isObj(p) || x === undefined || y === undefined || !label) { warnings.push(`pin ${j + 1} needs "x", "y" (percent) and "label", so it was left out`); return; }
		const clamp = (n: number) => Math.max(0, Math.min(100, n));
		if (x !== clamp(x) || y !== clamp(y)) warnings.push(`pin ${j + 1} (${label}) is off the map, so it was moved to its edge`);
		pins.push({ x: clamp(x), y: clamp(y), label, ...(str(p.text) ? { text: str(p.text) } : {}), ...(str(p.note) ? { note: str(p.note) } : {}), ...(str(p.kind) ? { kind: str(p.kind) } : {}) });
	});
	const value: Record<string, unknown> = { name, ...(image ? { image } : {}), ...(grid ? { grid } : {}), pins, ...(typeof raw.body === 'string' ? { body: raw.body } : {}) };
	return { ...base, value: errors.length ? undefined : value, errors, warnings };
}

/** A bundle (parsed JSON, or the object an adapter made) checked record by record, with reasons a person can act on. */
export function checkBundle(raw: unknown, games: BundleGames): CheckedBundle {
	const out: CheckedBundle = { records: [], warnings: [], files: [] };
	if (!isObj(raw)) return { ...out, error: 'This isn\'t an Ember Vault bundle: it should be a JSON object.' };
	if (raw.format !== BUNDLE_FORMAT) return { ...out, error: `This isn't an Ember Vault bundle: "format" should be "${BUNDLE_FORMAT}".` };
	const version = num(raw.version);
	if (version !== undefined && version > BUNDLE_VERSION) out.warnings.push(`It's a version ${version} bundle; this version of Ember Vault reads version ${BUNDLE_VERSION}, so newer parts may be left out.`);
	out.source = readSource(raw.source);
	let kinds: Map<string, KindSpec> | undefined;
	let gameName: string | undefined;
	const sys = str(raw.system);
	if (sys) {
		const game = games.resolve(sys);
		if (!game) return { ...out, error: `Ember Vault doesn't know the game "${sys}".` };
		out.system = game.id;
		gameName = sys;
		kinds = new Map(game.kinds.map(k => [k.kind, k]));
		const ed = str(raw.edition);
		if (ed && game.editions && !game.editions.includes(ed)) out.warnings.push(`"edition" should be one of: ${game.editions.join(', ')}, so it was left out.`);
		else if (ed) out.edition = ed;
	}
	for (const f of Array.isArray(raw.files) ? raw.files : []) {
		const name = isObj(f) ? str(f.name) : undefined;
		const safe = name ? safeAssetName(name) : null;
		if (!isObj(f) || !safe) { out.warnings.push('A file with no usable name was left out.'); continue; }
		const bytes = f.bytes instanceof Uint8Array ? f.bytes : undefined;
		const data = typeof f.data === 'string' ? f.data : undefined;
		if (!bytes && !data) { out.warnings.push(`The file ${safe} has no "data", so it was left out.`); continue; }
		out.files.push({ name: safe, ...(data ? { data } : {}), ...(bytes ? { bytes } : {}) });
	}
	const fileNames = new Set(out.files.map(f => f.name.toLowerCase()));
	const list = (k: string) => {
		if (raw[k] === undefined) return [];
		if (!Array.isArray(raw[k])) { out.warnings.push(`"${k}" should be a list, so it was left out.`); return []; }
		return raw[k] as unknown[];
	};
	list('content').forEach((e, i) => out.records.push(checkContent(e, i, kinds, gameName)));
	list('notes').forEach((n, i) => out.records.push(checkNote(n, i)));
	list('maps').forEach((m, i) => out.records.push(checkMap(m, i, fileNames)));
	if (raw.campaign !== undefined) out.warnings.push('Its "campaign" part (chapters and scenes) isn\'t read by this version yet, so it was left out.');
	for (const k of Object.keys(raw)) if (!['$schema', 'format', 'version', 'system', 'edition', 'source', 'content', 'notes', 'maps', 'files', 'campaign'].includes(k)) out.warnings.push(`"${k}" isn't part of a bundle, so it was left out.`);
	return out;
}

/** "3 monsters, 2 NPCs and a map": what a bundle's usable records are. */
export function bundleSummary(records: readonly CheckedRecord[]): string {
	const counts = new Map<string, number>();
	for (const r of records) if (r.value) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
	const word = (kind: string, n: number) => {
		const one = kind === 'npc' ? 'NPC' : kind;
		if (n === 1) return `${/^[aeiou]/i.test(one) || one === 'NPC' ? 'an' : 'a'} ${one}`;
		const many = one === 'NPC' ? 'NPCs' : /(s|x|ch|sh)$/.test(one) ? `${one}es` : /[^aeiou]y$/.test(one) ? `${one.slice(0, -1)}ies` : `${one}s`;
		return `${n} ${many}`;
	};
	const parts = [...counts].map(([k, n]) => word(k, n));
	if (!parts.length) return 'Nothing that can be used';
	return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// ----------------------------------------------------------------------------
// JSON Schema (draft 2020-12), for editors, tools and AIs

type Json = Record<string, unknown>;

const sourceSchema: Json = {
	type: 'object',
	description: 'Where it came from. "id" is what a later import of the same thing matches on, so it updates rather than duplicates.',
	properties: { name: { type: 'string' }, url: { type: 'string' }, license: { type: 'string' }, id: { type: 'string' }, retrieved: { type: 'string', description: 'A date: 2026-11-23.' } },
	additionalProperties: false,
};

/**
 * The bundle's schema. `games`: each game's id, its kinds and editions; the content entries are checked against
 * the game the bundle names (its pack schema's entries, plus "source" and "converted").
 */
export function bundleSchema(games: { id: string; /** Other names a bundle may use for it. */ aliases?: readonly string[]; kinds: readonly KindSpec[]; packSchema: Json; editions?: readonly string[] }[]): Json {
	const entriesOf = (pack: Json) => ((pack.properties as Json).entries as Json).items as Json;
	const withMeta = (items: Json): Json => ({
		oneOf: (items.oneOf as Json[]).map(k => ({ ...k, properties: { ...(k.properties as Json), source: { $ref: '#/$defs/source' }, converted: { type: 'string', description: 'The game it was written for, when it was converted to this one.' } } })),
	});
	return {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		title: 'Ember Vault import bundle',
		description: 'Content, notes and maps for Ember Vault to import, from another tool or an AI. Import it with Import… in Obsidian.',
		type: 'object',
		required: ['format', 'version'],
		properties: {
			$schema: { type: 'string' },
			format: { const: BUNDLE_FORMAT },
			version: { const: BUNDLE_VERSION },
			system: { type: 'string', description: 'The game the content is for: "nimble", "5e". Needed when there is content.' },
			edition: { type: 'string', description: 'The rules the content is written for, when the game has editions (5e: "2024", "2014").' },
			source: { $ref: '#/$defs/source' },
			content: { type: 'array', description: 'Content entries for the game: the same entries a content pack holds.', items: { type: 'object', required: ['kind', 'name'] } },
			notes: {
				type: 'array',
				items: {
					type: 'object',
					required: ['kind', 'name'],
					properties: {
						kind: { enum: [...NOTE_KINDS] },
						name: { type: 'string' },
						fields: { type: 'object', description: 'The note\'s properties: role, faction, location… and the game\'s own (Nimble: level, armor, hp, statblock).' },
						card: { type: 'object', description: 'An NPC\'s card.', properties: { look: { type: 'string' }, wants: { type: 'string' }, voice: { type: 'string' }, secret: { type: 'string' } }, additionalProperties: { type: 'string' } },
						body: { type: 'string', description: 'Markdown for the note.' },
						source: { $ref: '#/$defs/source' },
					},
					additionalProperties: false,
				},
			},
			maps: {
				type: 'array',
				items: {
					type: 'object',
					required: ['name'],
					properties: {
						name: { type: 'string' },
						image: { type: 'object', required: ['file'], properties: { file: { type: 'string', description: 'A file in "files", or one chosen with the bundle.' } } },
						grid: { type: 'string', pattern: '^\\d+x\\d+$', description: 'Columns x rows: "30x20".' },
						pins: {
							type: 'array',
							items: {
								type: 'object',
								required: ['x', 'y', 'label'],
								properties: {
									x: { type: 'number', minimum: 0, maximum: 100, description: 'Percent of the width, from the left.' },
									y: { type: 'number', minimum: 0, maximum: 100, description: 'Percent of the height, from the top.' },
									label: { type: 'string' },
									text: { type: 'string', description: 'What\'s here: written in the map note\'s key, under the label.' },
									note: { type: 'string', description: 'A note to link instead: its name.' },
									kind: { type: 'string', description: 'place, area, encounter, npc, treasure, danger, note or secret.' },
								},
							},
						},
						body: { type: 'string', description: 'Markdown at the top of the map\'s note.' },
						source: { $ref: '#/$defs/source' },
					},
				},
			},
			files: { type: 'array', items: { type: 'object', required: ['name', 'data'], properties: { name: { type: 'string' }, data: { type: 'string', contentEncoding: 'base64' } } } },
			campaign: { description: 'Reserved for whole campaigns (chapters and scenes). Not read yet.' },
		},
		allOf: games.map(g => ({
			if: { properties: { system: { enum: [g.id, ...(g.aliases ?? [])] } }, required: ['system'] },
			then: { properties: { content: { type: 'array', items: withMeta(entriesOf(g.packSchema)) }, ...(g.editions ? { edition: { enum: [...g.editions] } } : {}) } },
		})),
		$defs: { source: sourceSchema },
	};
}
