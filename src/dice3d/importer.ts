// Importing dice: a Dice So Nice dice set (a Foundry module zip, or the link
// to its module.json, which is how The Rollsmith delivers them) or a Dice So
// Nice export file. Model and image files are kept in the plugin's folder; the
// set's scripts are read as data (see dsn-parse.ts) and never stored or run.

import { normalizePath, requestUrl } from 'obsidian';
import { unzipSync } from 'fflate';
import type NimbleStatblocksPlugin from '../../main';
import { parseDiceModule, parseDsnExport } from './dsn-parse';
import { cleanStyle, DiceStyle, ImportedSet } from './styles';

/** Files a dice set may keep: models and the images they use. Nothing executable. */
const KEEP = /\.(gltf|glb|bin|png|jpe?g|webp|ktx2|avif)$/i;
const MAX_BYTES = 80 * 1024 * 1024;

export interface ImportResult {
	/** Dice sets added (or updated). */
	sets: ImportedSet[];
	/** Styles added (or updated). */
	styles: DiceStyle[];
	/** Things worth telling the user (e.g. a look needs a set that isn't imported). */
	notes: string[];
	/** From an export: the look for all dice and per die size, to apply if the user wants. */
	apply?: { normal?: string; perDie: Partial<Record<number, string>> };
}

function setsDir(plugin: NimbleStatblocksPlugin): string {
	const base = plugin.manifest.dir ?? `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
	return normalizePath(`${base}/dice-sets`);
}

/** Folder for one imported set. */
export function setFolder(plugin: NimbleStatblocksPlugin, id: string): string {
	return normalizePath(`${setsDir(plugin)}/${id.replace(/[^\w.-]+/g, '-')}`);
}

/** A URL three.js can load for a file in an imported set. */
export function setFileUrl(plugin: NimbleStatblocksPlugin, set: ImportedSet, rel: string): string {
	return plugin.app.vault.adapter.getResourcePath(normalizePath(`${setFolder(plugin, set.id)}/${rel}`));
}

/** A safe relative path inside a set: no "..", no absolute paths. */
function safeRel(path: string): string | null {
	const parts = path.replace(/\\/g, '/').split('/').filter(p => p && p !== '.');
	if (parts.some(p => p === '..')) return null;
	return parts.join('/');
}

async function ensureDir(plugin: NimbleStatblocksPlugin, path: string): Promise<void> {
	const a = plugin.app.vault.adapter;
	const parts = path.split('/');
	for (let i = 1; i <= parts.length; i++) {
		const p = parts.slice(0, i).join('/');
		if (p && !(await a.exists(p))) await a.mkdir(p);
	}
}

/** Unpack a module zip and add its dice. */
export async function importZip(plugin: NimbleStatblocksPlugin, data: ArrayBuffer): Promise<ImportResult> {
	if (data.byteLength > MAX_BYTES) throw new Error('That file is too big for a dice set (over 80 MB).');
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(new Uint8Array(data));
	} catch {
		throw new Error('That isn\'t a zip file a dice set comes in.');
	}
	const names = Object.keys(files).filter(n => !n.endsWith('/') && !n.startsWith('__MACOSX/'));
	const manifestName = names.filter(n => /(^|\/)module\.json$/i.test(n)).sort((a, b) => a.split('/').length - b.split('/').length)[0];
	if (!manifestName) throw new Error('No module.json in that zip. Is it a Dice So Nice dice set?');
	const root = manifestName.slice(0, manifestName.length - 'module.json'.length);
	const decode = (b: Uint8Array) => new TextDecoder().decode(b);
	const manifest = JSON.parse(decode(files[manifestName])) as Record<string, unknown>;
	const list = (v: unknown): unknown[] => (Array.isArray(v) ? v as unknown[] : []);
	const scriptNames = [...list(manifest.scripts), ...list(manifest.esmodules)]
		.filter((s): s is string => typeof s === 'string');
	const scripts = (scriptNames.length ? scriptNames.map(s => `${root}${safeRel(s) ?? ''}`) : names.filter(n => n.startsWith(root) && /\.m?js$/i.test(n)))
		.filter(n => files[n]).map(n => decode(files[n]));
	const parsed = parseDiceModule(manifest, scripts);
	if (!parsed) throw new Error('That module doesn\'t add any dice we can use.');

	const folder = setFolder(plugin, parsed.id);
	const a = plugin.app.vault.adapter;
	if (await a.exists(folder)) await a.rmdir(folder, true);
	let kept = 0;
	for (const n of names) {
		if (!n.startsWith(root) || !KEEP.test(n)) continue;
		const rel = safeRel(n.slice(root.length));
		if (!rel) continue;
		const out = normalizePath(`${folder}/${rel}`);
		await ensureDir(plugin, out.slice(0, out.lastIndexOf('/')));
		const bytes = files[n];
		await a.writeBinary(out, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
		kept++;
	}
	// Only keep model dice whose files actually came with the set.
	const models: ImportedSet['models'] = {};
	for (const [sides, rel] of Object.entries(parsed.models)) {
		if (rel && await a.exists(normalizePath(`${folder}/${rel}`))) models[Number(sides)] = rel;
	}
	const set: ImportedSet = { id: parsed.id, name: parsed.name, author: parsed.author, version: parsed.version, models, added: Date.now() };
	const styles: DiceStyle[] = [...parsed.styles];
	if (Object.keys(models).length) {
		styles.unshift(cleanStyle({ id: `set:${set.id}`, name: set.name, model: set.id, body: ['#9aa0a6'], label: '#ffffff', finish: 'plastic' }));
	}
	const notes = kept ? [] : ['The set had no model or image files.'];
	save(plugin, [set], styles);
	return { sets: [set], styles, notes };
}

/** Import from a link: a module.json (The Rollsmith's download links) or a zip. */
export async function importUrl(plugin: NimbleStatblocksPlugin, url: string): Promise<ImportResult> {
	const u = url.trim();
	if (!/^https?:\/\//i.test(u)) throw new Error('Paste a link that starts with https://');
	const res = await requestUrl({ url: u, throw: false });
	if (res.status >= 400) throw new Error(`The link answered with an error (${res.status}).`);
	const type = (res.headers['content-type'] ?? '').toLowerCase();
	const bytes = res.arrayBuffer;
	const head = new Uint8Array(bytes.slice(0, 2));
	if (head[0] === 0x50 && head[1] === 0x4b) return importZip(plugin, bytes); // "PK": a zip
	let manifest: Record<string, unknown>;
	try {
		manifest = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
	} catch {
		throw new Error(type.includes('html') ? 'That link opens a web page, not a dice set. Use the module.json or zip link.' : 'That link isn\'t a dice set.');
	}
	if (manifest.appearance || manifest.saves) return importExport(plugin, manifest);
	const download = typeof manifest.download === 'string' ? manifest.download : '';
	if (!/^https?:\/\//i.test(download)) throw new Error('That module.json has no download link.');
	const zip = await requestUrl({ url: download, throw: false });
	if (zip.status >= 400) throw new Error(`The download answered with an error (${zip.status}).`);
	return importZip(plugin, zip.arrayBuffer);
}

/** Import a Dice So Nice export (Profiles & Data → Export). */
export function importExport(plugin: NimbleStatblocksPlugin, json: unknown): ImportResult {
	const known = plugin.settings.dice.sets.map(s => s.id);
	const parsed = parseDsnExport(json, known);
	const missing = parsed.systems.filter(s => !known.includes(s));
	const notes = missing.length ? [`Some looks use dice sets you haven't imported yet (${missing.join(', ')}). Import those sets, then this file again, to get their models.`] : [];
	save(plugin, [], parsed.styles);
	return { sets: [], styles: parsed.styles, notes, apply: { normal: parsed.main, perDie: parsed.perDie } };
}

/** Import whatever file the user picked: a zip, a module.json-less JSON export, etc. */
export async function importFile(plugin: NimbleStatblocksPlugin, file: File): Promise<ImportResult> {
	const data = await file.arrayBuffer();
	const head = new Uint8Array(data.slice(0, 2));
	if (head[0] === 0x50 && head[1] === 0x4b) return importZip(plugin, data);
	let json: Record<string, unknown>;
	try {
		json = JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>;
	} catch {
		throw new Error('Pick a dice set zip or a Dice So Nice export (.json).');
	}
	if (typeof json.download === 'string' && !json.appearance) {
		const zip = await requestUrl({ url: json.download, throw: false });
		if (zip.status >= 400) throw new Error(`The download answered with an error (${zip.status}).`);
		return importZip(plugin, zip.arrayBuffer);
	}
	return importExport(plugin, json);
}

/** Add or replace sets and styles in settings (same id = updated). */
function save(plugin: NimbleStatblocksPlugin, sets: ImportedSet[], styles: DiceStyle[]): void {
	const d = plugin.settings.dice;
	for (const s of sets) d.sets = [...d.sets.filter(x => x.id !== s.id), s];
	for (const s of styles) d.styles = [...d.styles.filter(x => x.id !== s.id), s];
}

/** Remove an imported set: its files, and the style that uses its models (other styles fall back to colours). */
export async function removeSet(plugin: NimbleStatblocksPlugin, id: string): Promise<void> {
	const d = plugin.settings.dice;
	d.sets = d.sets.filter(s => s.id !== id);
	d.styles = d.styles.filter(s => s.id !== `set:${id}`).map(s => (s.model === id ? { ...s, model: undefined } : s));
	const folder = setFolder(plugin, id);
	if (await plugin.app.vault.adapter.exists(folder)) await plugin.app.vault.adapter.rmdir(folder, true);
	await plugin.saveSettings();
}
