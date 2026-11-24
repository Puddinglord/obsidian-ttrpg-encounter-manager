// Mapping files: how to read another tool's JSON (or YAML), written as data
// instead of code. A mapping says how to recognise the file, where its records
// are, and which of its fields go into which of ours, through a short fixed
// list of transforms. There are no expressions and nothing is evaluated: a
// mapping is a file a stranger may hand you, so it can only move and tidy
// text. The same engine runs the mappings Ember Vault ships and the ones
// people drop in <content folder>/Importers/.
// Pure: no Obsidian imports.

import { emptyBundle, BundleEntry, BundleNote, BundleSource, ImportBundle, NOTE_KINDS } from './bundle';
import type { Importer, ImportInput } from './importer';
import { extOf, inputText } from './importer';
import { htmlToText } from '../html-text';
import { parseYamlLite } from '../yaml-lite';

export const MAPPING_FORMAT = 'ember-vault-mapping';
export const MAPPING_VERSION = 1;

/** How one of our fields is filled. Text is a path ("hit_points", "stats.hp | hp"). */
export type FieldMap = string | FieldRule;

export interface FieldRule {
	/** Where the value is, from the record: "a.b", "a[0]", "a[*]", "$" for the record itself; "a | b" for the first that's there. */
	path?: string;
	/** A fixed value. */
	value?: unknown;
	/** Text with {path} slots filled from the record ({$} is the value at `path`). */
	template?: string;
	/** What to make of it. */
	as?: Transform;
	/** A lookup: the value (lower case) to ours. "*" catches the rest. */
	map?: Record<string, unknown>;
	/** Lists: joined with this into text. */
	join?: string;
	/** Text: split on this into a list. */
	split?: string;
	/** A list's first item only. */
	first?: boolean;
	/** For a list of objects: how each item's fields are filled, from the item. */
	each?: Record<string, FieldMap>;
	/** For an object: its fields, from the same record. */
	fields?: Record<string, FieldMap>;
	/** When there's nothing there. */
	default?: unknown;
}

export const TRANSFORMS = ['text', 'html', 'string', 'number', 'integer', 'boolean', 'lower', 'upper', 'dice', 'list'] as const;
export type Transform = typeof TRANSFORMS[number];

/** One set of records in the file: where they are, what they become, and their fields. */
export interface RecordMap {
	/** Where the records are, from the top of the file ("results[*]", "data[*]"); "$" (the default) is the file itself, or each item when it's a list. */
	each?: string;
	/** Only records where this path has a value (and, with `equals`, that value). */
	when?: { path: string; equals?: unknown };
	/** "content" (the default: a game's monster, spell…) or "note" (an NPC, a place…). */
	into?: 'content' | 'note';
	/** The content kind ("monster"), or the note kind ("npc"), as text; or a rule ({ "path": … }), to read it from the record. */
	kind: FieldMap;
	fields: Record<string, FieldMap>;
	/** Where each record came from: name, url, license, id, as rules (often templates: "nexus:monster:{id}"). */
	importedFrom?: Partial<Record<keyof BundleSource, FieldMap>>;
	/** Notes only: the NPC card (look, wants, voice, secret) and the note's text. */
	card?: Record<string, FieldMap>;
	body?: FieldMap;
}

export interface Mapping extends Partial<RecordMap> {
	format: typeof MAPPING_FORMAT;
	version: number;
	id: string;
	label: string;
	/** The game the content is for ("nimble", "5e"). Needed for content. */
	system?: string;
	edition?: string;
	/** How to recognise the file: paths every record has (`all`), paths at least one of which it has (`any`), file extensions. */
	detect: { all?: string[]; any?: string[]; files?: string[]; score?: number };
	/** Links it fetches: a pattern, and the address of the data ("{url}" is the link). */
	links?: { match: string; data: string }[];
	/** The licence its content comes under, shown before it's imported. */
	license?: string;
	/** Several sets of records (a site's monsters and its spells); else the mapping's own `each`, `kind` and `fields`. */
	records?: RecordMap[];
}

type Json = unknown;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const present = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);

// ----------------------------------------------------------------------------
// Paths

/** A path's steps: "a.b[0].c[*]" → a, b, 0, c, *. */
function steps(path: string): (string | number)[] {
	const out: (string | number)[] = [];
	for (const part of path.trim().replace(/^\$\.?/, '').split('.')) {
		if (!part) continue;
		const m = /^([^[\]]*)((?:\[(?:\d+|\*)\])*)$/.exec(part);
		if (!m) { out.push(part); continue; }
		if (m[1]) out.push(m[1]);
		for (const b of m[2].matchAll(/\[(\d+|\*)\]/g)) out.push(b[1] === '*' ? '*' : Number(b[1]));
	}
	return out;
}

/** Every value at a path ("[*]" fans out). */
function walk(data: Json, path: string): Json[] {
	let cur: Json[] = [data];
	for (const s of steps(path)) {
		const next: Json[] = [];
		for (const c of cur) {
			if (s === '*') { if (Array.isArray(c)) next.push(...(c as Json[])); else if (isObj(c)) next.push(...Object.values(c)); }
			else if (typeof s === 'number') { if (Array.isArray(c) && s < c.length) next.push(c[s]); }
			else if (isObj(c) && s in c) next.push(c[s]);
		}
		cur = next;
	}
	return cur;
}

/** The value at a path: "a | b" is the first with a value; a fan-out ("[*]") gives a list. */
export function getPath(data: Json, path: string): Json {
	for (const alt of path.split('|').map(p => p.trim()).filter(Boolean)) {
		if (alt === '$') { if (present(data)) return data; continue; }
		const found = walk(data, alt);
		const fans = /\[\*\]/.test(alt);
		const v = fans ? found : found[0];
		if (present(v)) return v;
	}
	return undefined;
}

// ----------------------------------------------------------------------------
// Values

/** Text with {path} slots. {$} is `self`. A slot with nothing there is left empty; the result is trimmed of the separators around it. */
export function fillTemplate(t: string, record: Json, self?: Json): string {
	const out = t.replace(/\{([^{}]+)\}/g, (_m, p: string) => {
		const v = p.trim() === '$' ? self : getPath(record, p);
		return Array.isArray(v) ? v.map(textOf).filter(Boolean).join(', ') : textOf(v);
	});
	return out.replace(/\(\s*\)|\[\s*\]/g, '').replace(/\s{2,}/g, ' ').replace(/^[\s,;·-]+|[\s,;·-]+$/g, '').trim();
}

const textOf = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

function transform(v: Json, as: Transform): Json {
	if (Array.isArray(v) && as !== 'list') return v.map(x => transform(x, as)).filter(present);
	switch (as) {
		case 'text': case 'string': { const t = textOf(v).replace(/\r\n?/g, '\n').trim(); return t || undefined; }
		case 'html': { const t = htmlToText(textOf(v)); return t || undefined; }
		case 'lower': return textOf(v).toLowerCase() || undefined;
		case 'upper': return textOf(v).toUpperCase() || undefined;
		case 'number': case 'integer': {
			const n = typeof v === 'number' ? v : Number(/[+-]?\d+(?:\.\d+)?/.exec(textOf(v))?.[0] ?? NaN);
			if (!Number.isFinite(n)) return undefined;
			return as === 'integer' ? Math.round(n) : n;
		}
		case 'boolean': return typeof v === 'boolean' ? v : /^(true|yes|1)$/i.test(textOf(v).trim()) ? true : /^(false|no|0)$/i.test(textOf(v).trim()) ? false : undefined;
		case 'dice': return /\d*d\d+(?:\s*[+-]\s*\d+)?/i.exec(textOf(v))?.[0].replace(/\s+/g, '') ?? undefined;
		case 'list': return Array.isArray(v) ? v : present(v) ? [v] : undefined;
	}
}

/** A field's value from a record, by its rule. */
export function applyField(rule: FieldMap, record: Json): Json {
	if (typeof rule === 'string') return getPath(record, rule);
	let v: Json = rule.value !== undefined ? rule.value : rule.path !== undefined ? getPath(record, rule.path) : undefined;
	if (rule.fields) {
		const o: Record<string, unknown> = {};
		for (const [k, r] of Object.entries(rule.fields)) { const x = applyField(r, rule.path ? v : record); if (present(x)) o[k] = x; }
		v = Object.keys(o).length ? o : undefined;
	}
	if (rule.each) {
		const list = Array.isArray(v) ? v : present(v) ? [v] : [];
		const each = rule.each;
		v = list.map(item => {
			const o: Record<string, unknown> = {};
			for (const [k, r] of Object.entries(each)) { const x = applyField(r, item); if (present(x)) o[k] = x; }
			return o;
		}).filter(o => Object.keys(o).length);
	}
	if (rule.split && typeof v === 'string') v = v.split(rule.split).map(s => s.trim()).filter(Boolean);
	if (rule.first && Array.isArray(v)) v = v[0];
	if (rule.as) v = transform(v, rule.as);
	if (rule.map && present(v)) {
		const look = (x: unknown) => {
			const k = textOf(x).toLowerCase();
			const hit = Object.entries(rule.map!).find(([key]) => key.toLowerCase() === k);
			return hit ? hit[1] : rule.map!['*'] !== undefined ? rule.map!['*'] : x;
		};
		v = Array.isArray(v) ? v.map(look) : look(v);
	}
	if (rule.join !== undefined && Array.isArray(v)) v = v.map(textOf).filter(Boolean).join(rule.join);
	if (rule.template !== undefined) v = fillTemplate(rule.template, record, v) || undefined;
	return present(v) ? v : rule.default;
}

// ----------------------------------------------------------------------------
// Reading a mapping file

const FIELD_KEYS = new Set(['path', 'value', 'template', 'as', 'map', 'join', 'split', 'first', 'each', 'fields', 'default']);

/** A field rule's problems, by where it is ("fields.hp"). */
function checkRule(rule: unknown, at: string, errors: string[]): void {
	if (typeof rule === 'string') { if (!rule.trim()) errors.push(`${at} is an empty path`); return; }
	if (!isObj(rule)) { errors.push(`${at} should be a path or an object like { "path": "…" }`); return; }
	for (const k of Object.keys(rule)) if (!FIELD_KEYS.has(k)) errors.push(`${at} has "${k}", which isn't part of a field rule (${[...FIELD_KEYS].join(', ')})`);
	if (rule.path === undefined && rule.value === undefined && rule.template === undefined && rule.fields === undefined) errors.push(`${at} needs "path", "value", "template" or "fields"`);
	if (rule.as !== undefined && !(typeof rule.as === 'string' && (TRANSFORMS as readonly string[]).includes(rule.as))) errors.push(`${at}: "as" should be one of ${TRANSFORMS.join(', ')}`);
	if (rule.map !== undefined && !isObj(rule.map)) errors.push(`${at}: "map" should be an object`);
	for (const sub of ['each', 'fields'] as const) {
		if (rule[sub] === undefined) continue;
		if (!isObj(rule[sub])) { errors.push(`${at}: "${sub}" should be an object of fields`); continue; }
		for (const [k, r] of Object.entries(rule[sub])) checkRule(r, `${at}.${sub}.${k}`, errors);
	}
}

function checkRecordMap(r: unknown, at: string, errors: string[]): void {
	if (!isObj(r)) { errors.push(`${at} should be an object`); return; }
	if (r.into !== undefined && r.into !== 'content' && r.into !== 'note') errors.push(`${at}: "into" should be "content" or "note"`);
	if (r.kind === undefined) errors.push(`${at} needs "kind" (what each record becomes: "monster", "npc"…)`);
	else checkRule(r.kind, `${at}.kind`, errors);
	if (r.into === 'note' && typeof r.kind === 'string' && !(NOTE_KINDS as readonly string[]).includes(r.kind)) errors.push(`${at}: a note's "kind" should be one of ${NOTE_KINDS.join(', ')}`);
	if (!isObj(r.fields)) errors.push(`${at} needs "fields": ours, each from a path in the file`);
	else for (const [k, rule] of Object.entries(r.fields)) checkRule(rule, `${at}.fields.${k}`, errors);
	for (const part of ['importedFrom', 'card'] as const) {
		if (r[part] === undefined) continue;
		if (!isObj(r[part])) { errors.push(`${at}: "${part}" should be an object`); continue; }
		for (const [k, rule] of Object.entries(r[part])) checkRule(rule, `${at}.${part}.${k}`, errors);
	}
	if (r.body !== undefined) checkRule(r.body, `${at}.body`, errors);
	if (r.each !== undefined && typeof r.each !== 'string') errors.push(`${at}: "each" should be a path`);
	if (r.when !== undefined && (!isObj(r.when) || typeof r.when.path !== 'string')) errors.push(`${at}: "when" should be { "path": "…" } (and "equals")`);
}

/** A mapping file read and checked: the mapping, or what's wrong with it, said so the person who wrote it can fix it. */
export function readMapping(raw: unknown): { mapping?: Mapping; errors: string[] } {
	const errors: string[] = [];
	if (!isObj(raw)) return { errors: ['A mapping file is a JSON object.'] };
	if (raw.format !== MAPPING_FORMAT) return { errors: [`"format" should be "${MAPPING_FORMAT}".`] };
	if (typeof raw.version === 'number' && raw.version > MAPPING_VERSION) errors.push(`It's a version ${raw.version} mapping; this version of Ember Vault reads version ${MAPPING_VERSION}.`);
	if (typeof raw.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(raw.id)) errors.push('"id" should be a short name of letters, numbers, dots and dashes ("open5e-creature").');
	if (typeof raw.label !== 'string' || !raw.label.trim()) errors.push('"label" should say what people call the format ("Open5e").');
	if (!isObj(raw.detect)) errors.push('"detect" should say how to recognise the file: { "all": ["name", "hit_points"] }.');
	else {
		const d = raw.detect;
		for (const k of ['all', 'any', 'files'] as const) if (d[k] !== undefined && !(Array.isArray(d[k]) && (d[k] as unknown[]).every(x => typeof x === 'string'))) errors.push(`"detect.${k}" should be a list of text.`);
		if (!d.all && !d.any) errors.push('"detect" needs "all" or "any": paths a record of this kind has.');
		if (d.score !== undefined && (typeof d.score !== 'number' || d.score <= 0 || d.score > 1)) errors.push('"detect.score" should be a number above 0, up to 1.');
	}
	for (const [i, l] of (Array.isArray(raw.links) ? raw.links : []).entries()) {
		if (!isObj(l) || typeof l.match !== 'string' || typeof l.data !== 'string') { errors.push(`links ${i + 1} should be { "match": "<pattern>", "data": "<address>" }.`); continue; }
		try { new RegExp(l.match); } catch { errors.push(`links ${i + 1}: "match" isn't a pattern Ember Vault can read.`); }
		if (!/^https:\/\//.test(l.data.replace('{url}', 'https://x'))) errors.push(`links ${i + 1}: "data" should be an https address (or "{url}…").`);
	}
	if (raw.links !== undefined && !Array.isArray(raw.links)) errors.push('"links" should be a list.');
	const sets = Array.isArray(raw.records) ? raw.records : raw.records === undefined ? [raw] : null;
	if (!sets) errors.push('"records" should be a list.');
	else if (!sets.length) errors.push('"records" is empty.');
	else sets.forEach((r, i) => checkRecordMap(r, raw.records ? `records ${i + 1}` : 'the mapping', errors));
	if (raw.license !== undefined && typeof raw.license !== 'string') errors.push('"license" should be text.');
	const needsGame = (sets ?? []).some(r => isObj(r) && r.into !== 'note');
	if (needsGame && (typeof raw.system !== 'string' || !raw.system.trim())) errors.push('"system" should name the game its content is for ("nimble", "5e").');
	return errors.length ? { errors } : { mapping: raw as unknown as Mapping, errors };
}

// ----------------------------------------------------------------------------
// Running a mapping

const setsOf = (m: Mapping): RecordMap[] => m.records ?? [{ each: m.each, when: m.when, into: m.into, kind: m.kind!, fields: m.fields!, importedFrom: m.importedFrom, card: m.card, body: m.body }];

/** The records a set covers in the file. */
function recordsOf(data: Json, set: RecordMap): Json[] {
	const at = set.each ? getPath(data, set.each) : data;
	const list = Array.isArray(at) ? at : present(at) ? [at] : [];
	if (!set.when) return list;
	const w = set.when;
	return list.filter(r => {
		const v = getPath(r, w.path);
		return w.equals === undefined ? present(v) : textOf(v).toLowerCase() === textOf(w.equals).toLowerCase();
	});
}

function sourceOf(rules: RecordMap['importedFrom'], record: Json): BundleSource | undefined {
	if (!rules) return undefined;
	const out: BundleSource = {};
	for (const [k, r] of Object.entries(rules)) { const v = applyField(r, record); if (present(v)) out[k as keyof BundleSource] = textOf(v); }
	return Object.keys(out).length ? out : undefined;
}

/** The file's data: JSON, else YAML (a .yaml/.yml file, or text that isn't JSON). Undefined when it's neither. */
export function inputData(input: ImportInput): Json {
	const text = inputText(input)?.trim();
	if (!text) return undefined;
	if (/^[[{]/.test(text)) { try { return JSON.parse(text) as Json; } catch { return undefined; } }
	const file = input.files.find(f => f.text !== undefined);
	if (file && /^(ya?ml)$/.test(extOf(file.name))) return parseYamlLite(text);
	return undefined;
}

/** How sure the mapping is that this is its kind: every `all` path on the first record, and at least one `any`. */
export function detectMapping(m: Mapping, input: ImportInput): number {
	const exts = m.detect.files?.map(e => e.replace(/^\./, '').toLowerCase());
	const named = input.files.find(f => f.text !== undefined);
	if (exts?.length && named && !exts.includes(extOf(named.name))) return 0;
	const data = inputData(input);
	if (data === undefined) return 0;
	for (const set of setsOf(m)) {
		const first = recordsOf(data, set)[0];
		if (first === undefined) continue;
		const all = m.detect.all ?? [];
		const any = m.detect.any ?? [];
		if (all.every(p => present(getPath(first, p))) && (!any.length || any.some(p => present(getPath(first, p))))) return m.detect.score ?? 0.7;
	}
	return 0;
}

/** A mapping run over a file: the bundle, and what's worth a look (records with nothing in them, a kind it couldn't tell). */
export function runMapping(m: Mapping, data: Json, ctx: { url?: string } = {}): { bundle: ImportBundle; notes: string[] } {
	const content: BundleEntry[] = [];
	const notes: BundleNote[] = [];
	const said: string[] = [];
	for (const set of setsOf(m)) {
		for (const record of recordsOf(data, set)) {
			// "monster" as text is the kind itself; a rule reads it from the record.
			const kind = textOf(typeof set.kind === 'string' ? set.kind : applyField(set.kind, record)).toLowerCase();
			const fields: Record<string, unknown> = {};
			for (const [k, r] of Object.entries(set.fields)) { const v = applyField(r, record); if (present(v)) fields[k] = v; }
			const name = textOf(fields.name).trim();
			if (!kind || !name) { said.push(`A record with no ${!name ? 'name' : 'kind'} was left out.`); continue; }
			const from = sourceOf(set.importedFrom, record);
			if (set.into === 'note') {
				const card: Record<string, string> = {};
				for (const [k, r] of Object.entries(set.card ?? {})) { const v = textOf(applyField(r, record)); if (v) card[k] = v; }
				const body = set.body ? textOf(applyField(set.body, record)) : '';
				const { name: _n, ...rest } = fields;
				notes.push({ kind: kind as BundleNote['kind'], name, ...(Object.keys(rest).length ? { fields: rest } : {}), ...(Object.keys(card).length ? { card } : {}), ...(body ? { body } : {}), ...(from ? { importedFrom: from } : {}) });
			} else {
				content.push({ kind, ...fields, name, ...(from ? { importedFrom: from } : {}) });
			}
		}
	}
	const source: BundleSource = { name: m.label, ...(m.license ? { license: m.license } : {}), ...(ctx.url ? { url: ctx.url } : {}) };
	return { bundle: emptyBundle({ system: m.system, edition: m.edition, source, ...(content.length ? { content } : {}), ...(notes.length ? { notes } : {}) }), notes: said };
}

/** A mapping as an importer, for Import…. `from`: where it came from, for its id ("shipped", or the file's path). */
export function mappingImporter(m: Mapping): Importer {
	return {
		id: `mapping:${m.id}`,
		label: m.label,
		system: m.system,
		detect: (input) => detectMapping(m, input),
		read: (input) => {
			const data = inputData(input);
			if (data === undefined) return { error: 'This isn\'t JSON or YAML.' };
			const out = runMapping(m, data, { url: input.url });
			if (!out.bundle.content?.length && !out.bundle.notes?.length) return { error: `Nothing in this file reads as ${m.label}.` };
			return out;
		},
		links: (m.links ?? []).map(l => ({ match: new RegExp(l.match), dataUrl: (url: string) => l.data.replace('{url}', url) })),
	};
}

// ----------------------------------------------------------------------------
// JSON Schema, for people writing mappings

export function mappingSchema(): Record<string, unknown> {
	const rule = { $ref: '#/$defs/field' };
	const fields = { type: 'object', additionalProperties: rule };
	const recordProps = {
		each: { type: 'string', description: 'Where the records are, from the top of the file: "results[*]". Leave it out when the file is one record, or a list of them.' },
		when: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, equals: {} }, description: 'Only records where this path has a value (or equals this).' },
		into: { enum: ['content', 'note'], description: 'content (a monster, spell…; the default) or note (an NPC, a place…).' },
		kind: { ...rule, description: 'What each record becomes, as text: "monster", "spell", "npc"… Or { "path": … } to read it from the record.' },
		fields: { ...fields, description: 'Our fields (the game\'s content-pack fields, or a note\'s properties), each from the file.' },
		importedFrom: { type: 'object', properties: { name: rule, url: rule, license: rule, id: rule, retrieved: rule }, description: 'Where each record came from. "id" lets a later import update it.' },
		card: { ...fields, description: 'Notes: the NPC card (look, wants, voice, secret).' },
		body: { ...rule, description: 'Notes: the note\'s text.' },
	};
	return {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		title: 'Ember Vault mapping',
		description: 'How Ember Vault reads another tool\'s JSON or YAML. Put it in your content folder\'s Importers folder.',
		type: 'object',
		required: ['format', 'version', 'id', 'label', 'detect'],
		properties: {
			$schema: { type: 'string' },
			format: { const: MAPPING_FORMAT },
			version: { const: MAPPING_VERSION },
			id: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' },
			label: { type: 'string', description: 'What people call the format: "Open5e".' },
			system: { type: 'string', description: 'The game its content is for: "nimble", "5e".' },
			edition: { type: 'string' },
			detect: {
				type: 'object',
				properties: {
					all: { type: 'array', items: { type: 'string' }, description: 'Paths every record has.' },
					any: { type: 'array', items: { type: 'string' }, description: 'Paths a record has at least one of.' },
					files: { type: 'array', items: { type: 'string' }, description: 'File extensions: ".json".' },
					score: { type: 'number', exclusiveMinimum: 0, maximum: 1, description: 'How sure a match is (0.7 by default). Higher wins when two importers fit.' },
				},
			},
			links: { type: 'array', items: { type: 'object', required: ['match', 'data'], properties: { match: { type: 'string', description: 'A pattern for the links it reads.' }, data: { type: 'string', description: 'The https address of the data. "{url}" is the link.' } } } },
			license: { type: 'string', description: 'The licence its content comes under, shown before it\'s imported.' },
			records: { type: 'array', items: { type: 'object', required: ['kind', 'fields'], properties: recordProps }, description: 'Several sets of records; else this mapping\'s own each, kind and fields.' },
			...recordProps,
		},
		$defs: {
			field: {
				description: 'A path ("hit_points", "a.b[0]", "a[*]", "a | b"), or a rule.',
				oneOf: [
					{ type: 'string' },
					{
						type: 'object',
						properties: {
							path: { type: 'string' }, value: {}, template: { type: 'string', description: 'Text with {path} slots; {$} is the value at "path".' },
							as: { enum: [...TRANSFORMS] }, map: { type: 'object', description: 'The value (any case) to ours; "*" for the rest.' },
							join: { type: 'string' }, split: { type: 'string' }, first: { type: 'boolean' },
							each: fields, fields, default: {},
						},
						additionalProperties: false,
					},
				],
			},
		},
	};
}
