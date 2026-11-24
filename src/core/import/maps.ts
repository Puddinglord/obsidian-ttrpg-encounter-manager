// Maps from other tools, for Import…, in every game:
// - a picture (PNG, JPG, WebP, SVG…): a map note with it, no pins;
// - Universal VTT (.dd2vtt, .uvtt: Dungeondraft, Dungeon Scrawl, Dungeon
//   Alchemist…): its picture and its grid;
// - Watabou's One Page Dungeon JSON: a pin for each numbered note, with its
//   text in the map's key, and the title and story on the note;
// - donjon's dungeon JSON: a pin for each room, with what's in it.
// A dungeon's JSON chosen with its picture (crypt.json + crypt.png) uses the
// picture; without one, a plain map is drawn from the JSON's own rooms (an
// SVG), so the pins sit exactly where they belong.
// Pure: no Obsidian imports.

import { emptyBundle, BundleFile, BundleMap, BundlePin, ImportBundle } from './bundle';
import { baseName, extOf, IMAGE_EXTS, ImportFile, ImportInput, Importer, imagesOf, inputJson } from './importer';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);
const objs = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const round = (n: number) => Math.round(n * 10) / 10;
const pct = (v: number, of: number) => round(Math.max(0, Math.min(100, (v / of) * 100)));

/** "Sunken Crypt" from "sunken_crypt.json". */
export const titleFromFile = (name: string): string => baseName(name).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\w/, c => c.toUpperCase()) || 'Map';

/** The picture given with a dungeon's JSON: the one with its base name, else the only picture. */
export function pictureFor(input: ImportInput, jsonName?: string): ImportFile | undefined {
	const pics = imagesOf(input).filter(f => f.data);
	if (!pics.length) return undefined;
	const base = jsonName ? baseName(jsonName).toLowerCase() : '';
	return pics.find(p => baseName(p.name).toLowerCase() === base) ?? (pics.length === 1 ? pics[0] : undefined);
}

const enc = new TextEncoder();
const xml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** A plain map as SVG: open cells (or rooms) drawn on a grid, in ink on paper. */
function svgMap(w: number, h: number, cells: { x: number; y: number; w: number; h: number }[], extra = ''): Uint8Array {
	const S = 24;
	const rects = cells.map(c => `<rect x="${c.x * S}" y="${c.y * S}" width="${c.w * S}" height="${c.h * S}"/>`).join('');
	const grid: string[] = [];
	for (let x = 0; x <= w; x++) grid.push(`M${x * S} 0V${h * S}`);
	for (let y = 0; y <= h; y++) grid.push(`M0 ${y * S}H${w * S}`);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * S} ${h * S}" width="${w * S}" height="${h * S}">`
		+ `<rect width="100%" height="100%" fill="#3b3631"/>`
		+ `<g fill="#f4efe3" stroke="#2a2622" stroke-width="3">${rects}</g>`
		+ `<path d="${grid.join('')}" stroke="#2a2622" stroke-opacity="0.12" stroke-width="1" fill="none"/>`
		+ extra + '</svg>';
	return enc.encode(svg);
}

/** The bundle for one map: its picture (given, or drawn), pins, grid and text. */
function mapBundle(o: { name: string; source: string; picture?: ImportFile; drawn?: Uint8Array; drawnName: string; grid?: string; pins: BundlePin[]; body?: string; notes: string[] }): { bundle: ImportBundle; notes: string[] } {
	const files: BundleFile[] = [];
	let image: BundleMap['image'];
	if (o.picture?.data) { files.push({ name: o.picture.name.replace(/^.*[\\/]/, ''), bytes: o.picture.data }); image = { file: o.picture.name.replace(/^.*[\\/]/, '') }; }
	else if (o.drawn) { files.push({ name: o.drawnName, bytes: o.drawn }); image = { file: o.drawnName }; }
	const map: BundleMap = { name: o.name, ...(image ? { image } : {}), ...(o.grid ? { grid: o.grid } : {}), pins: o.pins, ...(o.body ? { body: o.body } : {}) };
	return { bundle: emptyBundle({ source: { name: o.source }, maps: [map], files }), notes: o.notes };
}

// ----------------------------------------------------------------------------
// Pictures

export const imageImporter: Importer = {
	id: 'image',
	label: 'A picture',
	detect: (input) => (input.files.length && input.files.every(f => IMAGE_EXTS.includes(extOf(f.name)) && f.data) ? 0.5 : 0),
	read: (input) => {
		const pics = imagesOf(input).filter(f => f.data);
		if (!pics.length) return { error: 'There\'s no picture here.' };
		return {
			bundle: emptyBundle({
				source: { name: pics.length === 1 ? pics[0].name.replace(/^.*[\\/]/, '') : 'Pictures' },
				maps: pics.map(p => ({ name: titleFromFile(p.name), image: { file: p.name.replace(/^.*[\\/]/, '') }, pins: [] })),
				files: pics.map(p => ({ name: p.name.replace(/^.*[\\/]/, ''), bytes: p.data })),
			}),
		};
	},
};

// ----------------------------------------------------------------------------
// Universal VTT

/** Base64 to bytes, without the DOM or Node. */
function base64(data: string): Uint8Array {
	const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	const clean = data.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
	const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
	let bits = 0, acc = 0, i = 0;
	for (const ch of clean) {
		acc = (acc << 6) | A.indexOf(ch);
		bits += 6;
		if (bits >= 8) { bits -= 8; out[i++] = (acc >> bits) & 0xff; }
	}
	return out.subarray(0, i);
}

/** What a picture's first bytes say it is. */
function pictureExt(b: Uint8Array): string {
	if (b[0] === 0x89 && b[1] === 0x50) return 'png';
	if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
	if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'webp';
	return 'png';
}

const isUvtt = (j: unknown): j is Obj => isObj(j) && isObj(j.resolution) && typeof j.image === 'string' && ('line_of_sight' in j || 'portals' in j || 'format' in j);

export const uvttImporter: Importer = {
	id: 'uvtt',
	label: 'Universal VTT',
	detect: (input) => {
		const f = input.files.find(x => x.text !== undefined);
		if (f && /^(dd2vtt|df2vtt|uvtt)$/.test(extOf(f.name))) return 0.95;
		return isUvtt(inputJson(input)) ? 0.9 : 0;
	},
	read: (input) => {
		const j = inputJson(input);
		if (!isUvtt(j)) return { error: 'This isn\'t a Universal VTT map.' };
		const file = input.files.find(x => x.text !== undefined)?.name ?? 'map.dd2vtt';
		const res = j.resolution as Obj;
		const size = isObj(res.map_size) ? res.map_size : {};
		const cols = num(size.x), rows = num(size.y);
		const bytes = base64(j.image as string);
		if (!bytes.length) return { error: 'The map has no picture in it.' };
		const name = titleFromFile(file);
		const pic = `${baseName(file).replace(/[^\w -]+/g, '').trim() || 'map'}.${pictureExt(bytes)}`;
		return mapBundle({
			name, source: 'Universal VTT', picture: { name: pic, data: bytes }, drawnName: pic,
			grid: cols && rows ? `${Math.round(cols)}x${Math.round(rows)}` : undefined, pins: [],
			notes: ['Universal VTT files hold walls and lights for a virtual tabletop, not labels, so the map has no pins yet.'],
		});
	},
};

// ----------------------------------------------------------------------------
// Watabou's One Page Dungeon

const isWatabou = (j: unknown): j is Obj => isObj(j) && Array.isArray(j.rects) && Array.isArray(j.notes) && (typeof j.title === 'string' || typeof j.story === 'string');

/** The dungeon's notes as pins, its rooms drawn when there's no picture. */
export function watabouBundle(j: Obj, input: ImportInput, file = 'dungeon.json'): { bundle: ImportBundle; notes: string[] } {
	const rects = objs(j.rects).map(r => ({ x: num(r.x) ?? 0, y: num(r.y) ?? 0, w: num(r.w) ?? 1, h: num(r.h) ?? 1 }));
	if (!rects.length) return { bundle: emptyBundle(), notes: ['The dungeon has no rooms.'] };
	// Watabou's grid can go negative: frame the rooms with a cell to spare.
	const minX = Math.min(...rects.map(r => r.x)) - 1, minY = Math.min(...rects.map(r => r.y)) - 1;
	const maxX = Math.max(...rects.map(r => r.x + r.w)) + 1, maxY = Math.max(...rects.map(r => r.y + r.h)) + 1;
	const W = maxX - minX, H = maxY - minY;
	const picture = pictureFor(input, file);
	const pins: BundlePin[] = objs(j.notes).map((n, i) => {
		const pos = isObj(n.pos) ? n.pos : {};
		return { x: pct((num(pos.x) ?? 0) - minX, W), y: pct((num(pos.y) ?? 0) - minY, H), label: str(n.ref) ?? String(i + 1), ...(str(n.text) ? { text: str(n.text) } : {}), kind: 'area' };
	});
	const title = str(j.title) ?? titleFromFile(file);
	const notes: string[] = [];
	if (picture) notes.push('The pins are placed on the dungeon\'s own layout. If Watabou framed your picture differently, use Move pins on the map to nudge them.');
	const doors = objs(j.doors).map(d => `<rect x="${((num(d.x) ?? 0) - minX + 0.3) * 24}" y="${((num(d.y) ?? 0) - minY + 0.3) * 24}" width="10" height="10" fill="#8a5a2b"/>`).join('');
	return mapBundle({
		name: title, source: 'Watabou', picture, drawnName: `${title.replace(/[^\w -]+/g, '').trim() || 'dungeon'}.svg`,
		drawn: picture ? undefined : svgMap(W, H, rects.map(r => ({ x: r.x - minX, y: r.y - minY, w: r.w, h: r.h })), doors),
		grid: picture ? undefined : `${W}x${H}`, pins, body: str(j.story), notes,
	});
}

export const watabouImporter: Importer = {
	id: 'watabou-dungeon',
	label: 'Watabou One Page Dungeon',
	detect: (input) => (isWatabou(inputJson(input)) ? 0.9 : 0),
	read: (input) => {
		const j = inputJson(input);
		if (!isWatabou(j)) return { error: 'This isn\'t a One Page Dungeon.' };
		return watabouBundle(j, input, input.files.find(f => f.text !== undefined)?.name);
	},
};

// ----------------------------------------------------------------------------
// donjon

const isDonjon = (j: unknown): j is Obj => isObj(j) && Array.isArray(j.cells) && Array.isArray(j.rooms) && isObj(j.cell_bit);

/** What a donjon room holds, as lines. */
function roomText(r: Obj): string | undefined {
	const c = isObj(r.contents) ? r.contents : {};
	const lines: string[] = [];
	const summary = str(c.summary);
	if (summary) lines.push(summary);
	const d = isObj(c.detail) ? c.detail : {};
	const list = (k: string, label: string) => {
		const v = Array.isArray(d[k]) ? (d[k] as unknown[]).map(str).filter(Boolean) : str(d[k]) ? [str(d[k])] : [];
		if (v.length) lines.push(`**${label}:** ${v.join('; ')}`);
	};
	list('monster', 'Monsters');
	list('trap', 'Trap');
	list('hidden_treasure', 'Hidden treasure');
	list('room_features', 'Features');
	return lines.length ? lines.join('\n\n') : undefined;
}

export function donjonBundle(j: Obj, input: ImportInput, file = 'dungeon.json'): { bundle: ImportBundle; notes: string[] } {
	const cells = (j.cells as unknown[]).filter(Array.isArray) as unknown[][];
	const rows = cells.length, cols = Math.max(0, ...cells.map(r => r.length));
	if (!rows || !cols) return { bundle: emptyBundle(), notes: ['The dungeon has no cells.'] };
	const bits = j.cell_bit as Obj;
	const open = (num(bits.room) ?? 2) | (num(bits.corridor) ?? 4);
	const picture = pictureFor(input, file);
	const pins: BundlePin[] = objs(j.rooms).map(r => {
		const west = num(r.west) ?? num(r.col) ?? 0, east = num(r.east) ?? (west + (num(r.width) ?? 1) - 1);
		const north = num(r.north) ?? num(r.row) ?? 0, south = num(r.south) ?? (north + (num(r.height) ?? 1) - 1);
		const text = roomText(r);
		return { x: pct((west + east + 1) / 2, cols), y: pct((north + south + 1) / 2, rows), label: str(r.id) ?? '?', ...(text ? { text } : {}), kind: 'area' };
	});
	const settings = isObj(j.settings) ? j.settings : {};
	const name = str(settings.name) ?? titleFromFile(file);
	const open_: { x: number; y: number; w: number; h: number }[] = [];
	if (!picture) cells.forEach((row, y) => row.forEach((c, x) => { if (typeof c === 'number' && (c & open)) open_.push({ x, y, w: 1, h: 1 }); }));
	const notes: string[] = [];
	if (picture) notes.push('The pins are placed on the dungeon\'s grid. If your picture has a border, use Move pins on the map to nudge them.');
	const details = isObj(j.details) ? j.details : {};
	return mapBundle({
		name, source: 'donjon', picture, drawnName: `${name.replace(/[^\w -]+/g, '').trim() || 'dungeon'}.svg`,
		drawn: picture ? undefined : svgMap(cols, rows, open_), grid: picture ? undefined : `${cols}x${rows}`,
		pins, body: str(details.history), notes,
	});
}

export const donjonImporter: Importer = {
	id: 'donjon-dungeon',
	label: 'donjon dungeon',
	detect: (input) => (isDonjon(inputJson(input)) ? 0.95 : 0),
	read: (input) => {
		const j = inputJson(input);
		if (!isDonjon(j)) return { error: 'This isn\'t a donjon dungeon.' };
		return donjonBundle(j, input, input.files.find(f => f.text !== undefined)?.name);
	},
};

export const mapImporters = (): Importer[] => [uvttImporter, watabouImporter, donjonImporter, imageImporter];
