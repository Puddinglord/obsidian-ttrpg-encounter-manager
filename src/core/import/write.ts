// Writing an import's plan into the vault: content entries as the game's
// blocks (a monster as a monster note in the campaign's Monsters folder, the
// rest in the content folder), NPCs, places and quests from the campaign's
// starters with their properties filled in, and maps with their picture and
// pins. Every written thing says where it came from (`imported`, `importId`),
// which is how a later import finds it.

import { normalizePath, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { fence, homeFolder } from '../builder/frame';
import { blockLang, fencedBlocks, safeFileName } from '../content/blocks';
import { contentFolderFor } from '../content/new-entry';
import { mapBlockSource, MapPin, PIN_KINDS, PinKind } from '../map-def';
import { NPC_CARD_BLOCK } from '../npc-card-def';
import { toYaml } from '../yaml-lite';
import type { BundleFile, BundlePin, CheckedBundle, CheckedRecord } from './bundle';
import type { Have, PlanItem } from './plan';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);

const NOTE_KIND_OF: Record<string, CheckedRecord['type'] | undefined> = { monster: 'content', npc: 'note', location: 'note', quest: 'note', map: 'map' };

/** What the vault already has that an import could match: the game's content blocks, and every monster, NPC, place, quest and map note. */
export function vaultHave(plugin: EmberVaultPlugin, system: string | undefined): Have[] {
	const out: Have[] = [];
	if (system) {
		for (const e of plugin.content.entriesOf(system)) {
			if (!e.file) continue;
			out.push({ type: 'content', kind: e.kind, name: e.name, importId: str(e.value.importId), imported: !!str(e.value.imported), file: e.file, value: e.value });
		}
	}
	for (const f of plugin.app.vault.getMarkdownFiles()) {
		const fm = plugin.app.metadataCache.getFileCache(f)?.frontmatter;
		const kind = str(fm?.nimble)?.toLowerCase();
		const type = kind ? NOTE_KIND_OF[kind] : undefined;
		if (!fm || !kind || !type) continue;
		out.push({ type, kind, name: f.basename, importId: str(fm.importId), imported: !!str(fm.imported), file: f.path });
	}
	return out;
}

/** The import fields a written thing carries. */
function importFields(r: CheckedRecord, bundle: CheckedBundle): Record<string, string> {
	// The record's own source names it when it can; else the bundle's.
	const from = str(r.source?.name) ?? str(bundle.source?.name) ?? 'Import';
	return { imported: from, ...(r.source?.id ? { importId: r.source.id } : {}) };
}

/** A note's text with the first ```lang block that says this import id (else this name) replaced by `fenced`; null when there's none. */
export function replaceImportedBlock(content: string, lang: string, find: { importId?: string; name: string }, fenced: string): string | null {
	const lines = content.split('\n');
	const blocks = fencedBlocks(content, new Set([lang]));
	const says = (body: string, k: string, v: string) => body.split('\n').some(l => {
		const m = new RegExp(`^${k}:\\s*(.*)$`, 'i').exec(l.trim());
		return !!m && m[1].replace(/^["']|["']$/g, '').trim().toLowerCase() === v.toLowerCase();
	});
	const b = (find.importId ? blocks.find(x => says(x.body, 'importId', find.importId!)) : undefined) ?? blocks.find(x => says(x.body, 'name', find.name));
	if (!b) return null;
	const end = b.line + (b.body ? b.body.split('\n').length : 0) + 1;
	return [...lines.slice(0, b.line), ...fenced.split('\n'), ...lines.slice(end + 1)].join('\n');
}

async function ensureFolder(plugin: EmberVaultPlugin, folder: string): Promise<void> {
	const app = plugin.app;
	if (!folder || app.vault.getFolderByPath(folder)) return;
	const parts = folder.split('/');
	for (let i = 1; i <= parts.length; i++) {
		const p = parts.slice(0, i).join('/');
		if (!app.vault.getFolderByPath(p)) await app.vault.createFolder(p);
	}
}

/** Base64 to bytes. */
export function base64Bytes(data: string): Uint8Array {
	const clean = data.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
	const bin = atob(clean);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** A frontmatter value as YAML, plainly: text quoted when it needs to be. */
const yamlValue = (v: string) => (/^[\w .,'()&-]+$/.test(v) && !/^(true|false|null|yes|no|~|-?\d)/i.test(v) ? v : JSON.stringify(v));

export interface WriteResult {
	added: number;
	updated: number;
	files: TFile[];
	/** Things that couldn't be written, said plainly. */
	failed: string[];
}

export interface WriteOptions {
	/** Pictures given alongside the bundle, by lower-case file name. */
	files?: ReadonlyMap<string, Uint8Array>;
}

/** Write what's ticked. Each thing is written on its own: one that fails is said, and the rest still go in. */
export async function writePlan(plugin: EmberVaultPlugin, bundle: CheckedBundle, items: readonly PlanItem[], o: WriteOptions = {}): Promise<WriteResult> {
	const out: WriteResult = { added: 0, updated: 0, files: [], failed: [] };
	const files = new Map<string, BundleFile | Uint8Array>();
	for (const f of bundle.files) files.set(f.name.toLowerCase(), f);
	for (const [k, v] of o.files ?? []) if (!files.has(k)) files.set(k, v);
	for (const item of items) {
		const r = item.record;
		try {
			let file: TFile | null = null;
			if (r.type === 'content') file = await writeContent(plugin, bundle, item);
			else if (r.type === 'note') file = await writeNote(plugin, bundle, r);
			else file = await writeMap(plugin, bundle, r, files);
			if (!file) { out.failed.push(`${r.name}: this game can't write a ${r.kind} as a note`); continue; }
			out.files.push(file);
			if (item.status === 'update') out.updated++; else out.added++;
		} catch (e) {
			console.error('Ember Vault: could not import', r.at, e);
			out.failed.push(`${r.name || r.at}: ${e instanceof Error ? e.message : 'couldn\'t be written'}`);
		}
	}
	return out;
}

async function writeContent(plugin: EmberVaultPlugin, bundle: CheckedBundle, item: PlanItem): Promise<TFile | null> {
	const r = item.record;
	const system = bundle.system;
	const game = system ? plugin.systems.get(system) : undefined;
	if (!game || !r.value) return null;
	const meta = importFields(r, bundle);
	const value = { ...r.value, ...meta, ...(r.converted ? { converted: r.converted } : {}) };
	const written = game.content?.writeEntry?.(r.kind, value, bundle.edition)
		?? (game.content?.blocks?.kinds.includes(r.kind) ? { lang: blockLang(game.content.blocks.prefix, r.kind), body: toBlockYaml(value) } : null);
	if (!written) return null;
	const fenced = fence(written.lang, written.body);
	const app = plugin.app;
	// An update: the earlier import's block, brought up to date in its own note.
	if (item.status === 'update' && item.file) {
		const old = app.vault.getFileByPath(item.file);
		if (old) {
			let done = false;
			await app.vault.process(old, text => {
				const next = replaceImportedBlock(text, written.lang, { importId: meta.importId, name: r.name }, fenced);
				done = next !== null;
				return next ?? text;
			});
			if (done) return old;
		}
	}
	if (r.kind === 'monster') {
		// A monster note, as Copy to vault writes one: the bestiary, the panel and links read it as a monster.
		const folder = normalizePath(homeFolder(plugin, 'Monsters', 'Bestiary'));
		await ensureFolder(plugin, folder);
		const path = plugin.campaigns.available(normalizePath(`${folder}/${safeFileName(r.name)}.md`));
		const props: Record<string, unknown> = { nimble: 'monster', ...(written.props ?? {}), ...meta, ...(r.converted ? { converted: r.converted } : {}) };
		const front = Object.entries(props).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}: ${typeof v === 'string' ? yamlValue(v) : JSON.stringify(v)}`).join('\n');
		return app.vault.create(path, `---\n${front}\n---\n\n${fenced}\n`);
	}
	const folder = contentFolderFor(plugin, system!, r.kind);
	await ensureFolder(plugin, folder);
	const path = plugin.campaigns.available(normalizePath(`${folder}/${safeFileName(r.name)}.md`));
	return app.vault.create(path, `${fenced}\n`);
}

/** An entry as a content block's YAML: name first, then the rest. */
function toBlockYaml(value: Record<string, unknown>): string {
	const { name, ...rest } = value;
	return toYaml({ name, ...rest });
}

const SECTION: Record<string, [string, string]> = { npc: ['NPCs', 'NPCs'], location: ['Locations', 'Locations'], quest: ['Quests', 'Quests'], note: ['Notes', 'Notes'] };

async function writeNote(plugin: EmberVaultPlugin, bundle: CheckedBundle, r: CheckedRecord): Promise<TFile> {
	const v = r.value!;
	const [sub, vaultFolder] = SECTION[r.kind] ?? SECTION.note;
	const folder = normalizePath(homeFolder(plugin, sub, vaultFolder));
	await ensureFolder(plugin, folder);
	const file = await plugin.campaigns.createStarter(folder, r.kind === 'note' ? 'note' : r.kind as 'npc' | 'location' | 'quest', r.name);
	const app = plugin.app;
	const card = isObj(v.card) ? v.card as Record<string, string> : undefined;
	const body = str(v.body);
	if (card || body) {
		await app.vault.process(file, text => {
			let next = text;
			if (card && next.includes(NPC_CARD_BLOCK)) {
				const lines = ['look', 'wants', 'voice', 'secret'].map(k => `${k}: ${(card[k] ?? '').replace(/\n+/g, ' ')}`);
				for (const [k, val] of Object.entries(card)) if (!['look', 'wants', 'voice', 'secret'].includes(k)) lines.push(`${k}: ${val.replace(/\n+/g, ' ')}`);
				next = next.replace(NPC_CARD_BLOCK, `\`\`\`nimble-npc\n${lines.join('\n')}\n\`\`\``);
			}
			if (body) next = `${next.replace(/\s*$/, '')}\n\n${body.trim()}\n`;
			return next;
		});
	}
	const fields = isObj(v.fields) ? v.fields : {};
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		for (const [k, val] of Object.entries(fields)) if (val !== undefined && val !== null && k !== 'nimble') fm[k] = val;
		Object.assign(fm, importFields(r, bundle));
	});
	return file;
}

/** A heading's text a link can point at: no characters a link or heading would read as syntax. */
const headingText = (s: string) => s.replace(/[#|[\]^\\]/g, '').replace(/\s+/g, ' ').trim();

async function writeMap(plugin: EmberVaultPlugin, bundle: CheckedBundle, r: CheckedRecord, files: ReadonlyMap<string, BundleFile | Uint8Array>): Promise<TFile> {
	const v = r.value!;
	const app = plugin.app;
	const folder = normalizePath(homeFolder(plugin, 'Maps', 'Maps'));
	await ensureFolder(plugin, folder);
	// The note first, so the picture can go where the vault keeps a note's attachments.
	const file = await plugin.campaigns.createStarter(folder, 'map', r.name);
	let imageLink = '';
	const imageName = isObj(v.image) ? str(v.image.file) : undefined;
	const found = imageName ? files.get(imageName.toLowerCase()) : undefined;
	if (imageName && found) {
		const bytes = found instanceof Uint8Array ? found : found.bytes ?? (found.data ? base64Bytes(found.data) : undefined);
		if (bytes) {
			const path = await app.fileManager.getAvailablePathForAttachment(imageName, file.path);
			await ensureFolder(plugin, path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
			const img = await app.vault.createBinary(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
			imageLink = app.metadataCache.fileToLinktext(img, file.path, false);
		}
	}
	const pins = Array.isArray(v.pins) ? v.pins as BundlePin[] : [];
	const key: string[] = [];
	const used = new Set<string>();
	const mapPins: MapPin[] = pins.map(p => {
		const kind: PinKind = (PIN_KINDS as readonly string[]).includes(String(p.kind)) ? p.kind as PinKind : 'place';
		let link: string | undefined;
		if (p.note) link = p.note;
		else if (p.text) {
			let h = headingText(p.label) || 'Pin';
			for (let n = 2; used.has(h.toLowerCase()); n++) h = `${headingText(p.label)} (${n})`;
			used.add(h.toLowerCase());
			key.push(`### ${h}\n\n${p.text.trim()}`);
			link = `${file.basename}#${h}`;
		}
		return { x: p.x, y: p.y, label: p.label, kind, ...(link ? { link } : {}) };
	});
	const g = /^(\d+)x(\d+)$/.exec(str(v.grid) ?? '');
	const source = mapBlockSource({ image: imageLink, ...(g ? { grid: { cols: Number(g[1]), rows: Number(g[2]) } } : {}), pins: mapPins });
	const body = str(v.body);
	await app.vault.process(file, text => {
		const block = fencedBlocks(text, new Set(['nimble-map']))[0];
		let next = text;
		if (block) {
			const lines = text.split('\n');
			const end = block.line + (block.body ? block.body.split('\n').length : 0) + 1;
			next = [...lines.slice(0, block.line), ...fence('nimble-map', imageLink ? source : source.replace(/^image: \[\[\]\]/, 'image: ')).split('\n'), ...lines.slice(end + 1)].join('\n');
		}
		if (body) next = next.replace(/^\*What this map shows\. Click a pin to open its note\.\*$/m, body.trim());
		if (key.length) next = `${next.replace(/\s*$/, '')}\n\n## Key\n\n${key.join('\n\n')}\n`;
		return next;
	});
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => { Object.assign(fm, importFields(r, bundle)); });
	return file;
}
