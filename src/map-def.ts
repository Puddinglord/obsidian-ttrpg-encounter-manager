// The ```nimble-map block format. Pure: no Obsidian imports.
//
//   image: [[Cragmaw Hideout.jpg]]
//   grid: 30x20
//   pins:
//   - 40, 78 | 1. Cave Mouth | [[Part 1#1. Cave Mouth]] | area
//   - 48, 84 | Goblin Blind | [[Part 1#2. Goblin Blind]] | encounter
//
// Pin positions are percentages of the image (0–100), so they survive the
// image being swapped for a bigger or smaller version.

export const PIN_KINDS = ['place', 'area', 'encounter', 'npc', 'treasure', 'danger', 'note', 'secret'] as const;
export type PinKind = typeof PIN_KINDS[number];

export interface MapPin {
	x: number;
	y: number;
	label: string;
	/** Link text without brackets: "Part 1#Cave Mouth". */
	link?: string;
	kind: PinKind;
}

export interface MapDef {
	/** Link text of the image without brackets, or a URL. */
	image: string;
	/** Optional grid (columns × rows) drawn over the image. */
	grid?: { cols: number; rows: number };
	pins: MapPin[];
}

const round = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(100, n));

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

export function parsePinLine(line: string): MapPin | null {
	const body = line.trim().replace(/^[-*+]\s*/, '');
	const parts = splitFields(body);
	const coords = parts[0]?.match(/^(-?\d+(?:\.\d+)?)\s*%?\s*,\s*(-?\d+(?:\.\d+)?)\s*%?$/);
	if (!coords) return null;
	const pin: MapPin = { x: clamp(Number(coords[1])), y: clamp(Number(coords[2])), label: parts[1] || 'Pin', kind: 'place' };
	for (const extra of parts.slice(2)) {
		if (!extra) continue;
		const lower = extra.toLowerCase();
		if ((PIN_KINDS as readonly string[]).includes(lower)) pin.kind = lower as PinKind;
		else pin.link = stripLink(extra);
	}
	return pin;
}

export function parseMapBlock(source: string): MapDef {
	const def: MapDef = { image: '', pins: [] };
	let section: string | null = null;
	for (const raw of source.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const header = line.match(/^([a-z]+):\s*$/i);
		if (header) { section = header[1].toLowerCase(); continue; }
		if (/^[-*+]\s/.test(line) && section === 'pins') {
			const pin = parsePinLine(line);
			if (pin) def.pins.push(pin);
			continue;
		}
		const kv = line.match(/^([^:]+):\s*(.*)$/);
		if (!kv) continue;
		section = null;
		const key = kv[1].trim().toLowerCase();
		const value = kv[2].trim();
		if (key === 'image' || key === 'map') def.image = stripLink(value);
		else if (key === 'grid') {
			const g = value.match(/^(\d+)\s*[x×,]\s*(\d+)$/i);
			if (g) def.grid = { cols: Number(g[1]), rows: Number(g[2]) };
		}
	}
	return def;
}

export function mapBlockSource(def: MapDef): string {
	const lines = [`image: [[${def.image}]]`];
	if (def.grid) lines.push(`grid: ${def.grid.cols}x${def.grid.rows}`);
	lines.push('pins:');
	for (const p of def.pins) {
		const parts = [`${round(p.x)}, ${round(p.y)}`, p.label.replace(/\|/g, '/')];
		if (p.link) parts.push(`[[${p.link}]]`);
		if (p.kind !== 'place') parts.push(p.kind);
		lines.push(`- ${parts.join(' | ')}`);
	}
	return lines.join('\n');
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
