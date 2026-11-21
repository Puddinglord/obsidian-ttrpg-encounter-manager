// What a content pack's entries may say, for every game system. A system
// describes each kind it accepts (a spell, a monster, a subclass) as fields;
// the same description checks a pack's entries (with reasons a person can act
// on) and writes the JSON Schema published with the docs, so they can't drift.
// Pure: no Obsidian imports.

interface Base { required?: boolean; description?: string }
export type FieldSpec =
	| Base & { type: 'string'; enum?: readonly string[]; example?: string }
	| Base & { type: 'number'; integer?: boolean; min?: number; max?: number }
	| Base & { type: 'boolean' }
	| Base & { type: 'strings' }
	| Base & { type: 'numbers'; length?: number }
	/** Names to numbers (skills: { "Stealth": 4 }). */
	| Base & { type: 'map' }
	| Base & { type: 'object'; fields: Record<string, FieldSpec> }
	| Base & { type: 'list'; of: Record<string, FieldSpec> };

/** A kind of entry a system takes in packs. */
export interface KindSpec {
	kind: string;
	label: string;
	description: string;
	fields: Record<string, FieldSpec>;
	/** Check the entry as a whole after its fields (a cross-field rule); reasons, or none. */
	check?: (value: Record<string, unknown>) => string[];
	/**
	 * What a new one starts as (New on a compendium tab writes it as a block, its name added): the fields a
	 * person fills in, with sensible empty values. Left out, it's made from the required fields.
	 */
	starter?: Record<string, unknown>;
}

/** `value` when the entry can be used; `partial` always: every field that checked out (a card can show those while the rest is fixed). */
export interface Checked { value?: Record<string, unknown>; partial: Record<string, unknown>; errors: string[]; warnings: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const quote = (k: string) => `"${k}"`;

/** One value against its spec: the value to keep (numbers from numeric text), or why not. */
function checkValue(spec: FieldSpec, v: unknown, where: string, errors: string[], warnings: string[]): unknown {
	switch (spec.type) {
		case 'string': {
			const t = typeof v === 'number' ? String(v) : v;
			if (typeof t !== 'string') { errors.push(`${where} should be text`); return undefined; }
			if (spec.enum && !spec.enum.some(e => e.toLowerCase() === t.toLowerCase())) { errors.push(`${where} should be one of: ${spec.enum.join(', ')} (it says "${t}")`); return undefined; }
			return spec.enum ? spec.enum.find(e => e.toLowerCase() === t.toLowerCase()) : t;
		}
		case 'number': {
			const n = typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v;
			if (typeof n !== 'number' || !Number.isFinite(n)) { errors.push(`${where} should be a number`); return undefined; }
			if (spec.integer && !Number.isInteger(n)) { errors.push(`${where} should be a whole number`); return undefined; }
			if (spec.min !== undefined && n < spec.min) { errors.push(`${where} should be at least ${spec.min}`); return undefined; }
			if (spec.max !== undefined && n > spec.max) { errors.push(`${where} should be at most ${spec.max}`); return undefined; }
			return n;
		}
		case 'boolean':
			if (typeof v !== 'boolean') { errors.push(`${where} should be true or false`); return undefined; }
			return v;
		case 'strings':
			if (typeof v === 'string') return v.split(',').map(x => x.trim()).filter(Boolean);
			if (!Array.isArray(v) || v.some(x => typeof x !== 'string' && typeof x !== 'number')) { errors.push(`${where} should be a list of text`); return undefined; }
			return v.map(String);
		case 'numbers': {
			if (!Array.isArray(v) || v.some(x => typeof x !== 'number')) { errors.push(`${where} should be a list of numbers`); return undefined; }
			if (spec.length !== undefined && v.length !== spec.length) { errors.push(`${where} should have ${spec.length} numbers (it has ${v.length})`); return undefined; }
			return v;
		}
		case 'map':
			if (!isObj(v) || Object.values(v).some(x => typeof x !== 'number')) { errors.push(`${where} should map names to numbers, like { "Stealth": 4 }`); return undefined; }
			return v;
		case 'object': {
			if (!isObj(v)) { errors.push(`${where} should be an object`); return undefined; }
			return checkFields(spec.fields, v, `${where} `, errors, warnings);
		}
		case 'list': {
			if (!Array.isArray(v)) { errors.push(`${where} should be a list`); return undefined; }
			return v.map((item, i) => {
				if (!isObj(item)) { errors.push(`${where} item ${i + 1} should be an object`); return undefined; }
				return checkFields(spec.of, item, `${where} item ${i + 1}: `, errors, warnings);
			}).filter(x => x !== undefined);
		}
	}
}

function checkFields(fields: Record<string, FieldSpec>, raw: Record<string, unknown>, prefix: string, errors: string[], warnings: string[]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, spec] of Object.entries(fields)) {
		const v = raw[key];
		if (v === undefined || v === null || v === '') {
			if (spec.required) errors.push(`${prefix}${quote(key)} is missing`);
			continue;
		}
		const kept = checkValue(spec, v, `${prefix}${quote(key)}`, errors, warnings);
		if (kept !== undefined) out[key] = kept;
	}
	for (const key of Object.keys(raw)) if (!(key in fields) && key !== 'kind') warnings.push(`${prefix}${quote(key)} isn't a field here, so it was left out`);
	return out;
}

/** An entry against its kind: the value to keep, or the reasons it can't be used. */
export function checkEntry(kind: KindSpec, raw: Record<string, unknown>): Checked {
	const errors: string[] = [];
	const warnings: string[] = [];
	const value = checkFields(kind.fields, raw, '', errors, warnings);
	if (!errors.length && kind.check) errors.push(...kind.check(value));
	return errors.length ? { partial: value, errors, warnings } : { value, partial: value, errors, warnings };
}

/** A value of a field's type that a person fills in: '' for text, the least a number may be, empty lists. */
function emptyOf(spec: FieldSpec): unknown {
	switch (spec.type) {
		case 'string': return spec.enum?.[0] ?? '';
		case 'number': return spec.min ?? 0;
		case 'boolean': return false;
		case 'strings': case 'numbers': return [];
		case 'map': return {};
		case 'object': return requiredOf(spec.fields);
		case 'list': return [requiredOf(spec.of)];
	}
}

function requiredOf(fields: Record<string, FieldSpec>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(fields).filter(([, f]) => f.required).map(([k, f]) => [k, emptyOf(f)]));
}

/** A new entry of a kind: its name, then its starter (or its required fields, empty). */
export function starterEntry(kind: KindSpec, name: string): Record<string, unknown> {
	const rest: Record<string, unknown> = { ...(kind.starter ?? requiredOf(kind.fields)) };
	delete rest.name;
	return { name, ...rest };
}

// ----------------------------------------------------------------------------
// JSON Schema (draft 2020-12), for editors and the docs

type Json = Record<string, unknown>;

function schemaOf(spec: FieldSpec): Json {
	const d = spec.description ? { description: spec.description } : {};
	switch (spec.type) {
		case 'string': return { type: ['string', 'number'], ...(spec.enum ? { enum: [...spec.enum] } : {}), ...(spec.example ? { examples: [spec.example] } : {}), ...d };
		case 'number': return { type: spec.integer ? 'integer' : 'number', ...(spec.min !== undefined ? { minimum: spec.min } : {}), ...(spec.max !== undefined ? { maximum: spec.max } : {}), ...d };
		case 'boolean': return { type: 'boolean', ...d };
		case 'strings': return { type: 'array', items: { type: 'string' }, ...d };
		case 'numbers': return { type: 'array', items: { type: 'number' }, ...(spec.length !== undefined ? { minItems: spec.length, maxItems: spec.length } : {}), ...d };
		case 'map': return { type: 'object', additionalProperties: { type: 'number' }, ...d };
		case 'object': return { ...objectSchema(spec.fields), ...d };
		case 'list': return { type: 'array', items: objectSchema(spec.of), ...d };
	}
}

function objectSchema(fields: Record<string, FieldSpec>, extra: Json = {}): Json {
	const properties: Json = { ...extra };
	for (const [k, f] of Object.entries(fields)) properties[k] = schemaOf(f);
	const required = Object.entries(fields).filter(([, f]) => f.required).map(([k]) => k);
	return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

/** The JSON Schema for a system's packs. */
export function packSchema(o: { system: string; /** The game as people write it ("Nimble"), when its id isn't. */ name?: string; title: string; editions?: readonly string[]; kinds: readonly KindSpec[] }): Json {
	return {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		title: o.title,
		description: `An Ember Vault content pack for ${o.name ?? o.system}. Put the file in your content folder (Ember Vault/Content by default), or use Import content.`,
		type: 'object',
		required: ['pack', 'system', 'entries'],
		properties: {
			pack: { type: 'string', description: 'The pack\'s name, as campaigns turn it on or off.' },
			system: { const: o.system },
			...(o.editions ? { edition: { enum: [...o.editions], description: 'Only for campaigns on these rules. Leave it out for both.' } } : {}),
			version: { type: 'number' },
			description: { type: 'string' },
			entries: {
				type: 'array',
				items: { oneOf: o.kinds.map(k => ({ ...objectSchema(k.fields, { kind: { const: k.kind } }), required: ['kind', ...((objectSchema(k.fields).required as string[] | undefined) ?? [])], title: k.label, description: k.description })) },
			},
		},
	};
}
