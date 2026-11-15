// The ```nimble-map block format. Pure: no Obsidian imports.
//
//   image: [[Barlegento.jpg]]
//   grid: hex
//   cell: 2.15
//   offset: 0.4, 0.9
//   show-grid: no
//   scale: 6 miles
//   travel: 1 quarter
//   party: 41.2, 37.9
//   pins:
//   - 52, 30 | Balbom | [[Balbom]] | place
//   - 12, 70 | The Low Road | [[Low Road map]] | map
//   drawings:
//   - route | #ffffff | 3 | 61.2,38.1 62,40.3 63.4,44
//
// Every key but `image` is optional. Positions are percentages of the image
// (0–100), so they survive the image being swapped for a bigger or smaller copy.
//
// Saving is lossless: a line we don't understand (a key from a newer version, a
// section we don't know) is written back where it was, and a line whose value
// didn't change is written back exactly as the user typed it.

export const PIN_KINDS = ['place', 'area', 'encounter', 'npc', 'treasure', 'danger', 'note', 'secret', 'map'] as const;
export type PinKind = typeof PIN_KINDS[number];

export const GRID_KINDS = ['none', 'square', 'hex', 'hex-flat'] as const;
/** `hex` is pointy-top (rows of hexes), `hex-flat` is flat-top (columns of hexes). */
export type GridKind = typeof GRID_KINDS[number];

export interface Point { x: number; y: number }

export interface MapPin {
	x: number;
	y: number;
	label: string;
	/** Link text without brackets: "Part 1#Cave Mouth". */
	link?: string;
	kind: PinKind;
}

export interface MapGrid {
	kind: GridKind;
	/** The old `grid: 30x20`: columns × rows across the whole image. Only set for that form. */
	cols?: number;
	rows?: number;
}

export const DRAWING_KINDS = ['pen', 'route', 'text'] as const;
export type DrawingKind = typeof DRAWING_KINDS[number];

export interface MapDrawing {
	kind: DrawingKind;
	/** `#rrggbb`, or `accent` for the theme's accent colour. */
	colour: string;
	/** Stroke width (pen, route) or text size (text), 1–3 in the UI. */
	width: number;
	points: Point[];
	/** What a `text` drawing says. */
	text?: string;
}

export interface MapDef {
	/** Link text of the image without brackets, or a URL. */
	image: string;
	grid?: MapGrid;
	/** Cell size as a % of the image width: `w` across, `h` down (both in % of the width; `h` only for a stretched cell). */
	cell?: { w: number; h?: number };
	/** Where one cell's centre sits, in % of the image. */
	offset?: Point;
	/** False when the map has its own grid printed on it: snap and count, draw nothing. */
	showGrid?: boolean;
	/** What one cell is: "6 miles". */
	scale?: string;
	/** Time to cross one cell, in the campaign clock's units: "1 quarter". */
	travel?: string;
	/** The party marker. */
	party?: Point;
	pins: MapPin[];
	drawings: MapDrawing[];
}

const round = (n: number, places = 1) => { const f = 10 ** places; return Math.round(n * f) / f; };
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const NUM = String.raw`-?\d+(?:\.\d+)?`;

function stripLink(s: string): string {
	const t = s.trim();
	const wiki = t.match(/^!?\[\[([^\]]+)\]\]$/);
	if (wiki) return wiki[1].split('|')[0].trim();
	const md = t.match(/^!?\[[^\]]*\]\(([^)]+)\)$/);
	if (md) return md[1].trim();
	return t;
}

/** Split on "|", but not inside [[wiki|links]]. */
function splitFields(s: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = '';
	for (let i = 0; i < s.length; i++) {
		if (s.startsWith('[[', i)) { depth++; cur += '[['; i++; continue; }
		if (s.startsWith(']]', i) && depth > 0) { depth--; cur += ']]'; i++; continue; }
		if (s[i] === '|' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
		cur += s[i];
	}
	out.push(cur.trim());
	return out;
}

function parsePoint(s: string): Point | null {
	const m = new RegExp(`^(${NUM})\\s*%?\\s*,\\s*(${NUM})\\s*%?$`).exec(s.trim());
	return m ? { x: clamp(Number(m[1])), y: clamp(Number(m[2])) } : null;
}

export function parsePinLine(line: string): MapPin | null {
	const body = line.trim().replace(/^[-*+]\s*/, '');
	const parts = splitFields(body);
	const at = parsePoint(parts[0] ?? '');
	if (!at) return null;
	const pin: MapPin = { ...at, label: parts[1] || 'Pin', kind: 'place' };
	for (const extra of parts.slice(2)) {
		if (!extra) continue;
		const lower = extra.toLowerCase();
		if ((PIN_KINDS as readonly string[]).includes(lower)) pin.kind = lower as PinKind;
		else pin.link = stripLink(extra);
	}
	return pin;
}

function pinLine(p: MapPin): string {
	const parts = [`${round(p.x)}, ${round(p.y)}`, p.label.replace(/\|/g, '/')];
	if (p.link) parts.push(`[[${p.link}]]`);
	if (p.kind !== 'place') parts.push(p.kind);
	return `- ${parts.join(' | ')}`;
}

/** `- route | #ffffff | 3 | 61.2,38.1 62,40.3` (a text drawing adds `| its text`). */
export function parseDrawingLine(line: string): MapDrawing | null {
	const parts = splitFields(line.trim().replace(/^[-*+]\s*/, ''));
	const kind = parts[0]?.toLowerCase() as DrawingKind;
	if (!(DRAWING_KINDS as readonly string[]).includes(kind)) return null;
	const colour = /^#[0-9a-f]{3,8}$/i.test(parts[1] ?? '') ? parts[1].toLowerCase() : 'accent';
	const width = Math.max(1, Math.min(3, Math.round(Number(parts[2]) || 2)));
	const points: Point[] = [];
	for (const pair of (parts[3] ?? '').split(/\s+/)) {
		const p = parsePoint(pair);
		if (p) points.push(p);
	}
	if (!points.length) return null;
	const d: MapDrawing = { kind, colour, width, points };
	if (kind === 'text') d.text = parts.slice(4).join(' / ') || 'Text';
	return d;
}

function drawingLine(d: MapDrawing): string {
	const pts = d.points.map(p => `${round(p.x)},${round(p.y)}`).join(' ');
	const parts = [d.kind, d.colour, String(d.width), pts];
	if (d.kind === 'text') parts.push((d.text ?? '').replace(/\|/g, '/'));
	return `- ${parts.join(' | ')}`;
}

/** "6 miles" → { n: 6, unit: "miles" }; "1 day" → { n: 1, unit: "day" }. Null without a number. */
export function parseAmount(s: string | undefined): { n: number; unit: string } | null {
	const m = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(.*?)\s*$/.exec(s ?? '');
	if (!m) return null;
	const n = Number(m[1]);
	return n > 0 ? { n, unit: m[2] } : null;
}

// ----------------------------------------------------------------------------
// Keys

const SCALARS = ['image', 'grid', 'cell', 'offset', 'show-grid', 'scale', 'travel', 'party'] as const;
const LISTS = ['pins', 'drawings'] as const;
type Scalar = typeof SCALARS[number];
type List = typeof LISTS[number];
type Key = Scalar | List;
/** The order keys are written in when the block doesn't already have them. */
const ORDER: Key[] = [...SCALARS, ...LISTS];
const ALIASES: Record<string, Key> = { map: 'image' };

function keyOf(name: string): Key | null {
	const k = name.trim().toLowerCase();
	return (ORDER as string[]).includes(k) ? k as Key : ALIASES[k] ?? null;
}

const fmtNum = (n: number, places: number) => String(round(n, places));

/** Read one key's value into the def. */
function readScalar(def: MapDef, key: Scalar, value: string): void {
	const v = value.trim();
	switch (key) {
		case 'image': def.image = stripLink(v); break;
		case 'grid': {
			const old = /^(\d+)\s*[x×,]\s*(\d+)$/i.exec(v);
			if (old) { def.grid = { kind: 'square', cols: Number(old[1]), rows: Number(old[2]) }; break; }
			const k = v.toLowerCase().replace(/[\s_]+/g, '-');
			const kind: GridKind | undefined = k === 'hex' || k === 'hex-pointy' || k === 'pointy-hex' ? 'hex'
				: k === 'hex-flat' || k === 'flat-hex' ? 'hex-flat'
				: k === 'square' || k === 'squares' ? 'square'
				: k === 'none' || k === 'no' || k === 'off' ? 'none' : undefined;
			if (kind) def.grid = { kind };
			else delete def.grid;
			break;
		}
		case 'cell': {
			const m = new RegExp(`^(${NUM})\\s*%?\\s*(?:[x×]\\s*(${NUM})\\s*%?)?$`, 'i').exec(v);
			const w = m ? Number(m[1]) : 0;
			if (w > 0) {
				def.cell = { w };
				const h = m?.[2] ? Number(m[2]) : 0;
				if (h > 0 && h !== w) def.cell.h = h;
			} else delete def.cell;
			break;
		}
		case 'offset': {
			const m = new RegExp(`^(${NUM})\\s*%?\\s*,\\s*(${NUM})\\s*%?$`).exec(v);
			if (m) def.offset = { x: Number(m[1]), y: Number(m[2]) };
			else delete def.offset;
			break;
		}
		case 'show-grid': {
			const off = /^(no|false|off|hide|hidden|0)$/i.test(v);
			if (off) def.showGrid = false;
			else if (/^(yes|true|on|show|1)$/i.test(v)) def.showGrid = true;
			else delete def.showGrid;
			break;
		}
		case 'scale': if (v) def.scale = v; else delete def.scale; break;
		case 'travel': if (v) def.travel = v; else delete def.travel; break;
		case 'party': { const p = parsePoint(v); if (p) def.party = p; else delete def.party; break; }
	}
}

/** One key's value as written, or null when it isn't set. */
function writeScalar(def: MapDef, key: Scalar): string | null {
	switch (key) {
		case 'image': return /^[a-z][a-z0-9+.-]*:\/\//i.test(def.image) ? def.image : `[[${def.image}]]`;
		case 'grid':
			if (!def.grid) return null;
			return def.grid.cols && def.grid.rows && def.grid.kind === 'square' ? `${def.grid.cols}x${def.grid.rows}` : def.grid.kind;
		case 'cell':
			if (!def.cell) return null;
			return def.cell.h && def.cell.h !== def.cell.w ? `${fmtNum(def.cell.w, 4)}x${fmtNum(def.cell.h, 4)}` : fmtNum(def.cell.w, 4);
		case 'offset': return def.offset ? `${fmtNum(def.offset.x, 3)}, ${fmtNum(def.offset.y, 3)}` : null;
		case 'show-grid': return def.showGrid === undefined ? null : def.showGrid ? 'yes' : 'no';
		case 'scale': return def.scale ?? null;
		case 'travel': return def.travel ?? null;
		case 'party': return def.party ? `${fmtNum(def.party.x, 2)}, ${fmtNum(def.party.y, 2)}` : null;
	}
}

/** The value a key holds, for telling whether it changed since it was read. */
function snapshot(def: MapDef, key: Scalar): string {
	switch (key) {
		case 'image': return def.image;
		case 'grid': return JSON.stringify(def.grid ?? null);
		case 'cell': return JSON.stringify(def.cell ?? null);
		case 'offset': return JSON.stringify(def.offset ?? null);
		case 'show-grid': return String(def.showGrid);
		case 'scale': return def.scale ?? '';
		case 'travel': return def.travel ?? '';
		case 'party': return JSON.stringify(def.party ?? null);
	}
}

// ----------------------------------------------------------------------------
// Layout: how the block was written, so saving keeps it

type Slot =
	| { key: Scalar; name: string; line: string; was: string }
	| { key: List; header: string; tail: string[] }
	| { raw: string };

/** Each parsed def's layout and each parsed pin/drawing's original line, kept off the objects themselves. */
const LAYOUT = new WeakMap<MapDef, Slot[]>();
const ITEM_LINE = new WeakMap<object, { line: string; was: string }>();

const HEADER = /^([a-z][\w-]*):\s*$/i;
const KV = /^([a-z][\w -]*?):\s*(.*)$/i;
const ITEM = /^[-*+]\s/;

export function parseMapBlock(source: string): MapDef {
	const def: MapDef = { image: '', pins: [], drawings: [] };
	const slots: Slot[] = [];
	/** The section the next list items belong to: a known list, an unknown one, or none. */
	let section: List | 'other' | null = null;
	let list: Extract<Slot, { tail: string[] }> | null = null;
	const raw = (line: string) => slots.push({ raw: line });

	for (const rawLine of source.split(/\r?\n/)) {
		const text = rawLine.replace(/\s+$/, '');
		const line = text.trim();
		if (!line) {
			// Blank lines inside a list are dropped (the list is written in one piece); elsewhere they're kept.
			if (section !== 'pins' && section !== 'drawings') raw(text);
			continue;
		}
		// Anything indented, or a list item, stays with an unknown section.
		if (section === 'other' && (/^\s/.test(text) || ITEM.test(line))) { raw(text); continue; }
		const header = HEADER.exec(line);
		if (header) {
			const key = keyOf(header[1]);
			if (key === 'pins' || key === 'drawings') {
				section = key;
				// A second "pins:" carries on the first list; its header line is kept where it was.
				const earlier = slots.find((s): s is Extract<Slot, { tail: string[] }> => 'tail' in s && s.key === key);
				if (earlier) { list = earlier; raw(text); continue; }
				list = { key, header: text, tail: [] };
				slots.push(list);
				continue;
			}
			list = null;
			if (key) { readSlot(def, slots, key, header[1], text, ''); section = null; continue; }
			section = 'other';
			raw(text);
			continue;
		}
		if (ITEM.test(line) && list) {
			const item = list.key === 'pins' ? parsePinLine(line) : parseDrawingLine(line);
			if (!item) { list.tail.push(text); continue; } // kept under its list, never read
			ITEM_LINE.set(item, { line: text, was: JSON.stringify(item) });
			if (list.key === 'pins') def.pins.push(item as MapPin);
			else def.drawings.push(item as MapDrawing);
			continue;
		}
		const kv = KV.exec(line);
		section = null;
		list = null;
		const key = kv ? keyOf(kv[1]) : null;
		if (kv && key && key !== 'pins' && key !== 'drawings') readSlot(def, slots, key, kv[1], text, kv[2]);
		else raw(text);
	}
	while (slots.length && 'raw' in slots[slots.length - 1] && !(slots[slots.length - 1] as { raw: string }).raw.trim()) slots.pop();
	LAYOUT.set(def, slots);
	return def;
}

function readSlot(def: MapDef, slots: Slot[], key: Scalar, name: string, line: string, value: string): void {
	// The same key twice: the last one counts, the earlier line is kept as it was.
	const prev = slots.findIndex(s => 'line' in s && s.key === key);
	if (prev >= 0) slots[prev] = { raw: (slots[prev] as { line: string }).line };
	readScalar(def, key, value);
	slots.push({ key, name: name.trim(), line, was: snapshot(def, key) });
}

export function mapBlockSource(def: MapDef): string {
	const slots: Slot[] = [...(LAYOUT.get(def) ?? [])];
	// Keys set since the block was read go where they'd be in a fresh block: before the first key that follows them.
	const has = (k: Key) => slots.some(s => 'key' in s && s.key === k);
	for (const key of ORDER) {
		if (has(key)) continue;
		const wanted = key === 'pins' || (key === 'drawings' ? def.drawings.length > 0 : writeScalar(def, key) !== null);
		if (!wanted) continue;
		const slot: Slot = key === 'pins' || key === 'drawings' ? { key, header: `${key}:`, tail: [] } : { key, name: key, line: '', was: '\u0000' };
		const after = ORDER.indexOf(key);
		const at = slots.findIndex(s => 'key' in s && ORDER.indexOf(s.key) > after);
		if (at < 0) slots.push(slot);
		else slots.splice(at, 0, slot);
	}
	const out: string[] = [];
	for (const s of slots) {
		if ('raw' in s) { out.push(s.raw); continue; }
		if ('tail' in s) {
			const items: (MapPin | MapDrawing)[] = s.key === 'pins' ? def.pins : def.drawings;
			if (s.key === 'drawings' && !items.length && !s.tail.length) continue;
			out.push(s.header);
			for (const it of items) {
				const orig = ITEM_LINE.get(it);
				out.push(orig && orig.was === JSON.stringify(it) ? orig.line : s.key === 'pins' ? pinLine(it as MapPin) : drawingLine(it as MapDrawing));
			}
			out.push(...s.tail);
			continue;
		}
		const value = writeScalar(def, s.key);
		if (value === null) continue;
		out.push(s.was === snapshot(def, s.key) ? s.line : `${s.name}: ${value}`);
	}
	return out.join('\n');
}

// ----------------------------------------------------------------------------
// Finding the block in the note, to write pins back.

export interface MapFence {
	/** Line of the opening fence. */
	open: number;
	/** Line of the closing fence. */
	close: number;
	/** What every line of the body starts with: "> " in a callout, indentation under a list item. */
	prefix: string;
}

const tidy = (s: string) => s.split(/\r?\n/).map(l => l.trim()).join('\n').replace(/\n+$/, '');

/**
 * The ```nimble-map fence inside lines `from..to` (inclusive). Obsidian reports
 * the whole callout or list for a block nested in one, so the fence has to be
 * looked for. With several maps in the range, the one whose body is `source` wins.
 */
export function findMapFence(lines: string[], from: number, to: number, source: string): MapFence | null {
	const found: (MapFence & { body: string })[] = [];
	const last = Math.min(to, lines.length - 1);
	for (let i = Math.max(0, from); i <= last; i++) {
		const m = /^((?:[ \t]*>)*[ \t]*)((?:[-*+]|\d+[.)])[ \t]+)?(`{3,}|~{3,})[ \t]*nimble-map\b/i.exec(lines[i]);
		if (!m) continue;
		// A fence on the list item's own line ("- ```nimble-map") continues at the item's indentation.
		const prefix = m[1] + ' '.repeat(m[2]?.length ?? 0);
		const bare = prefix.trimEnd();
		const strip = (l: string) => l.startsWith(prefix) ? l.slice(prefix.length) : l.startsWith(bare) ? l.slice(bare.length) : l;
		const closing = new RegExp(`^\\s*${m[3][0]}{${m[3].length},}\\s*$`);
		let close = -1;
		for (let j = i + 1; j <= last; j++) {
			if (closing.test(strip(lines[j]))) { close = j; break; }
		}
		if (close < 0) continue;
		found.push({ open: i, close, prefix, body: tidy(lines.slice(i + 1, close).map(strip).join('\n')) });
		i = close;
	}
	const want = tidy(source);
	const hit = found.find(f => f.body === want) ?? (found.length === 1 ? found[0] : null);
	return hit ? { open: hit.open, close: hit.close, prefix: hit.prefix } : null;
}

/**
 * The note's text with one map block's body replaced, keeping the fence lines
 * and the callout/list prefix. Null when the block can't be found: write nothing.
 */
export function replaceMapBlock(text: string, from: number, to: number, oldSource: string, newSource: string): string | null {
	const lines = text.split('\n');
	const fence = findMapFence(lines, from, to, oldSource);
	if (!fence) return null;
	const cr = lines[fence.open].endsWith('\r') ? '\r' : '';
	lines.splice(fence.open + 1, fence.close - fence.open - 1, ...newSource.split('\n').map(l => fence.prefix + l + cr));
	return lines.join('\n');
}
