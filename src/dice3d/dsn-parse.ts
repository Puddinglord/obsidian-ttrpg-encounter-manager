// Reading Dice So Nice dice sets and exports. Pure: text and JSON in, plain
// data out. A set's script is never run: we read the object literals passed to
// dice3d.addSystem / addDicePreset / addColorset as data, and skip anything
// that isn't plain data.

import { cleanStyle, DiceStyle, Finish, FontId } from './styles';

// ---------------------------------------------------------------------------
// A small reader for JavaScript object/array literals (keys may be bare,
// strings may use ' " or `, trailing commas and comments are fine).

class Unsupported extends Error {}

function readLiteral(src: string, start: number): { value: unknown; end: number } {
	let i = start;
	const ws = () => {
		for (;;) {
			while (i < src.length && /\s/.test(src[i])) i++;
			if (src.startsWith('//', i)) { while (i < src.length && src[i] !== '\n') i++; continue; }
			if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
			return;
		}
	};
	const str = (): string => {
		const q = src[i++];
		let out = '';
		while (i < src.length && src[i] !== q) {
			if (q === '`' && src.startsWith('${', i)) throw new Unsupported('template');
			if (src[i] === '\\') {
				const n = src[i + 1];
				out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
				i += 2;
				continue;
			}
			out += src[i++];
		}
		i++;
		return out;
	};
	const value = (): unknown => {
		ws();
		const c = src[i];
		if (c === '{') {
			i++;
			const obj: Record<string, unknown> = {};
			for (;;) {
				ws();
				if (src[i] === '}') { i++; return obj; }
				let key: string;
				if (src[i] === '"' || src[i] === '\'' || src[i] === '`') key = str();
				else {
					const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 200));
					if (!m) throw new Unsupported('key');
					key = m[0];
					i += key.length;
				}
				ws();
				if (src[i] !== ':') throw new Unsupported('shorthand');
				i++;
				obj[key] = value();
				ws();
				if (src[i] === ',') i++;
			}
		}
		if (c === '[') {
			i++;
			const arr: unknown[] = [];
			for (;;) {
				ws();
				if (src[i] === ']') { i++; return arr; }
				arr.push(value());
				ws();
				if (src[i] === ',') i++;
			}
		}
		if (c === '"' || c === '\'' || c === '`') return str();
		const m = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i, i + 40));
		if (m) { i += m[0].length; return Number(m[0]); }
		for (const [word, v] of [['true', true], ['false', false], ['null', null], ['undefined', undefined]] as const) {
			if (src.startsWith(word, i) && !/[\w$]/.test(src[i + word.length] ?? '')) { i += word.length; return v; }
		}
		throw new Unsupported(`value at ${i}`);
	};
	const v = value();
	return { value: v, end: i };
}

/** The literal arguments of every `<obj>.<method>(…)` call in a script, in order. Calls with non-literal arguments are skipped. */
export function literalCalls(src: string, method: string): unknown[][] {
	const out: unknown[][] = [];
	const re = new RegExp(`\\.${method}\\s*\\(`, 'g');
	let m: RegExpExecArray | null;
	while ((m = re.exec(src))) {
		let i = m.index + m[0].length;
		const args: unknown[] = [];
		try {
			for (;;) {
				while (/\s/.test(src[i] ?? '')) i++;
				if (src[i] === ')') break;
				const r = readLiteral(src, i);
				args.push(r.value);
				i = r.end;
				while (/\s/.test(src[i] ?? '')) i++;
				if (src[i] === ',') i++;
			}
			out.push(args);
		} catch (e) {
			if (!(e instanceof Unsupported)) throw e;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Dice sets (a Foundry module that adds dice to Dice So Nice)

export interface ParsedSet {
	id: string;
	name: string;
	author?: string;
	version?: string;
	/** Model file for each die size, relative to the module's folder. */
	models: Partial<Record<number, string>>;
	/** Colour sets the module adds, as styles. */
	styles: DiceStyle[];
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** "modules/<id>/models/d20.gltf" → "models/d20.gltf". */
export function modulePath(path: string): string {
	return path.replace(/^\/?modules\/[^/]+\//, '').replace(/^\.?\//, '');
}

/** Read a module's manifest and scripts into a dice set. Returns null if it adds no dice we can use. */
export function parseDiceModule(manifest: unknown, scripts: string[]): ParsedSet | null {
	const m = obj(manifest);
	const id = text(m.id) ?? text(m.name);
	if (!id) return null;
	const authors = Array.isArray(m.authors) ? m.authors.map(a => text(obj(a).name)).filter(Boolean) : [];
	const models: Partial<Record<number, string>> = {};
	const styles: DiceStyle[] = [];
	let systemName: string | undefined;
	for (const src of scripts) {
		for (const [sys] of literalCalls(src, 'addSystem')) systemName ??= text(obj(sys).name);
		for (const [preset] of literalCalls(src, 'addDicePreset')) {
			const p = obj(preset);
			const type = text(p.type);
			const file = text(p.modelFile);
			const sides = type && /^d(\d+)$/.exec(type);
			if (!sides || !file) continue;
			const n = Number(sides[1]);
			models[n] ??= modulePath(file);
		}
		for (const [cs] of literalCalls(src, 'addColorset')) {
			const c = obj(cs);
			const s = colorsetStyle(c, `${id}:${text(c.name) ?? styles.length}`);
			if (s) styles.push(s);
		}
	}
	if (!Object.keys(models).length && !styles.length) return null;
	const title = text(m.title) ?? systemName ?? id;
	return {
		id,
		name: title.replace(/^The Rollsmith\s*-\s*/i, '').replace(/\s+Dice Set$/i, '').trim() || title,
		author: authors.join(', ') || undefined,
		version: text(m.version),
		models,
		styles,
	};
}

// ---------------------------------------------------------------------------
// Dice So Nice's own names → ours

const FINISH_FROM_DSN: Record<string, Finish> = {
	plastic: 'plastic', metal: 'metal', chrome: 'chrome', glass: 'glass', frosted: 'frosted', resin: 'resin', pristine: 'pristine',
	iridescent: 'iridescent', velvet: 'velvet', stone: 'stone', wood: 'wood',
};
const TEXTURE_FROM_DSN: Record<string, string> = {
	marble: 'marble', wood: 'wood', stone: 'stone', speckles: 'speckles', cloudy: 'clouds', cloudy_2: 'clouds', stars: 'stars', astral: 'stars',
	dragon: 'scales', lizard: 'scales', paper: 'paper', water: 'swirl', water_2: 'swirl', fire: 'clouds', ice: 'clouds', ice_2: 'clouds', tile: 'hex', radial: 'swirl',
};
const FINISH_FROM_TEXTURE: Record<string, Finish> = { glitter: 'glitter', glitter_2: 'glitter', lava: 'lava', hell: 'lava', fire: 'lava', ice: 'frost', ice_2: 'frost', astral: 'nebula', marble: 'plastic', metal: 'metal', wood: 'wood', stone: 'stone' };
const FONT_FROM_DSN = (f: unknown): FontId => {
	const s = typeof f === 'string' ? f.toLowerCase() : '';
	if (/mono|courier|consol/.test(s)) return 'mono';
	if (/georgia|times|serif|garamond|book/.test(s) && !/sans/.test(s)) return 'serif';
	if (/luminari|papyrus|fantasy|uncial|gothic|eagle|modesto/.test(s)) return 'blackletter';
	return 'inter';
};
const colour = (v: unknown): string | undefined => {
	const first: unknown = Array.isArray(v) ? (v as unknown[])[0] : v;
	if (typeof first !== 'string') return undefined;
	const s = first.trim().toLowerCase();
	if (/^#[0-9a-f]{3,8}$/.test(s)) return s;
	return { black: '#000000', white: '#ffffff', none: '' }[s];
};
const colours = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map(colour).filter((c): c is string => !!c);

function styleFrom(fields: { body: unknown; label: unknown; outline: unknown; edge: unknown; texture: unknown; material: unknown; font: unknown; fontScale?: unknown }, id: string, name: string, model?: string): DiceStyle {
	const tex = typeof fields.texture === 'string' ? fields.texture : Array.isArray(fields.texture) ? String(fields.texture[0] ?? '') : '';
	const mat = typeof fields.material === 'string' ? fields.material : 'auto';
	const finish = FINISH_FROM_DSN[mat] ?? FINISH_FROM_TEXTURE[tex] ?? 'plastic';
	const scale = typeof fields.fontScale === 'number' ? fields.fontScale : undefined;
	return cleanStyle({
		id, name, model,
		body: colours(fields.body),
		label: colour(fields.label),
		outline: colour(fields.outline),
		edge: colour(fields.edge),
		finish,
		texture: TEXTURE_FROM_DSN[tex] ?? 'none',
		blend: tex === 'stars' || tex === 'astral' ? 'screen' : 'multiply',
		font: FONT_FROM_DSN(fields.font),
		labelScale: scale && scale > 0 ? Math.max(0.6, Math.min(1.4, scale)) : 1,
	});
}

function colorsetStyle(c: Record<string, unknown>, id: string): DiceStyle | null {
	const name = text(c.description) ?? text(c.name);
	if (!name || !colours(c.background).length) return null;
	return styleFrom({ body: c.background, label: c.foreground, outline: c.outline, edge: c.edge, texture: c.texture, material: c.material, font: c.font, fontScale: c.fontScale }, id, name);
}

// ---------------------------------------------------------------------------
// A Dice So Nice export (Profiles & Data → Export): your appearance and saves

export interface ParsedExport {
	/** One style per look: your current dice, each die size you set apart, and each named save. */
	styles: DiceStyle[];
	/** Die sizes that had their own look in the current appearance, by style id. */
	perDie: Partial<Record<number, string>>;
	/** Style id of the current look for all dice. */
	main?: string;
	/** Dice So Nice systems the looks use (a dice set's id), so the matching import can be applied. */
	systems: string[];
}

function appearanceStyles(app: Record<string, unknown>, prefix: string, label: string, knownSets: string[], out: ParsedExport, current: boolean): void {
	const global = obj(app.global);
	const toStyle = (a: Record<string, unknown>, id: string, name: string) => {
		const system = text(a.system);
		if (system && system !== 'standard') out.systems.push(system);
		const model = system && knownSets.includes(system) ? system : undefined;
		return styleFrom({ body: a.diceColor, label: a.labelColor, outline: a.outlineColor, edge: a.edgeColor, texture: a.texture, material: a.material, font: a.font }, id, name, model);
	};
	if (Object.keys(global).length) {
		const s = toStyle(global, `${prefix}`, label);
		out.styles.push(s);
		if (current) out.main = s.id;
	}
	for (const [key, a] of Object.entries(app)) {
		const sides = /^d(\d+)$/.exec(key);
		if (!sides || key === 'global') continue;
		const merged = { ...global, ...obj(a) };
		if (JSON.stringify(merged) === JSON.stringify(global)) continue;
		const s = toStyle(merged, `${prefix}-${key}`, `${label} (${key})`);
		out.styles.push(s);
		if (current) out.perDie[Number(sides[1])] = s.id;
	}
}

/** Read a Dice So Nice export. Throws if it doesn't look like one. */
export function parseDsnExport(json: unknown, knownSets: string[] = []): ParsedExport {
	const root = obj(json);
	const appearance = obj(root.appearance);
	const saves = obj(root.saves);
	if (!Object.keys(appearance).length && !Object.keys(saves).length) throw new Error('This file has no Dice So Nice appearance in it.');
	const out: ParsedExport = { styles: [], perDie: {}, systems: [] };
	if (Object.keys(appearance).length) appearanceStyles(appearance, 'dsn-current', 'Dice So Nice', knownSets, out, true);
	for (const [name, save] of Object.entries(saves)) {
		const app = obj(obj(save).appearance);
		if (Object.keys(app).length) appearanceStyles(app, `dsn-save-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, knownSets, out, false);
	}
	out.systems = [...new Set(out.systems)];
	return out;
}
