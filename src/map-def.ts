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
