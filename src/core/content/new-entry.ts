// New on a compendium tab, for every game: make a class, a feat, an ancestry…
// A kind the game has a guided builder for opens it (core/builder: whatever
// the system registered with `registerKind`, not hidden); any other kind the
// game writes as a block gets a note in the content folder, under
// <content folder>/<game>/<the kind's plural>/<name>.md, holding a starter
// block, and the note opens.
//
// The seam for guided builders: register the kind (`registerKind('dnd5e',
// 'class', …)`) and New routes to it by itself; have its output go to
// `contentFolderFor(plugin, system, kind)` so what it makes joins the
// compendium like a typed block does.

import { MarkdownView, Menu, normalizePath, Notice, setIcon, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { builderFor, fence, openBuilder } from '../builder/frame';
import { NamePrompt } from '../campaign-modals';
import { gameIcon } from '../icons';
import { blockLang, contentNotePath, kindFolder, starterBody } from './blocks';
import type { KindSpec } from './spec';

/** A kind New can make for a game, and how. */
export interface Makeable { kind: KindSpec; how: 'builder' | 'block' }

/** The kinds among `kinds` that New can make for a system: by its builder, else as a block. */
export function makeable(plugin: EmberVaultPlugin, system: string, kinds: readonly string[]): Makeable[] {
	const c = plugin.systems.get(system)?.content;
	if (!c) return [];
	const out: Makeable[] = [];
	for (const k of kinds) {
		const kind = c.kinds.find(x => x.kind === k);
		if (!kind) continue;
		if (builderFor(system, k)) out.push({ kind, how: 'builder' });
		else if (c.blocks?.kinds.includes(k)) out.push({ kind, how: 'block' });
	}
	return out;
}

/** The folder a kind's new notes go in: <content folder>/<game>/<the kind's plural>. */
export function contentFolderFor(plugin: EmberVaultPlugin, system: string, kind: string): string {
	const c = plugin.systems.get(system)?.content;
	const spec = c?.kinds.find(x => x.kind === kind);
	const game = c?.blocks?.folder ?? plugin.systems.get(system)?.name ?? system;
	return normalizePath(`${plugin.content.folder()}/${game}/${spec ? kindFolder(spec) : kind}`);
}

/** "New class", "New class option". */
export const newLabel = (kind: KindSpec): string => `New ${kind.label.toLowerCase()}`;

/** The New button's label for a tab's kinds: "New class", "New class or subclass", "New…"; undefined where nothing can be made. */
export function newButtonLabel(plugin: EmberVaultPlugin, system: string, kinds: readonly string[]): string | undefined {
	const m = makeable(plugin, system, kinds);
	if (!m.length) return undefined;
	if (m.length === 1) return newLabel(m[0].kind);
	return m.length === 2 ? `${newLabel(m[0].kind)} or ${m[1].kind.label.toLowerCase()}` : 'New…';
}

/**
 * New: one kind goes straight to it; several (a tab with classes and subclasses) ask which, in a menu at the
 * button. Nothing to make: a notice.
 */
export function newContent(plugin: EmberVaultPlugin, system: string, kinds: readonly string[], ev?: MouseEvent, o: { seed?: unknown } = {}): void {
	const list = makeable(plugin, system, kinds);
	if (!list.length) { new Notice('Nothing to make here yet.'); return; }
	if (list.length === 1) { make(plugin, system, list[0], o.seed); return; }
	const menu = new Menu();
	for (const m of list) menu.addItem(i => i.setTitle(`${newLabel(m.kind)}${m.how === 'builder' ? '…' : ''}`).onClick(() => make(plugin, system, m, o.seed)));
	if (ev) menu.showAtMouseEvent(ev); else menu.showAtPosition({ x: window.innerWidth / 2, y: window.innerHeight / 3 });
}

/** `seed`: what the tab knows that a builder can start from (5e's compendium: the edition it shows). */
function make(plugin: EmberVaultPlugin, system: string, m: Makeable, seed?: unknown): void {
	if (m.how === 'builder') { openBuilder(plugin, { system, kind: m.kind.kind, seed, onCreated: (file) => { void openNew(plugin, file); } }); return; }
	new NamePrompt(plugin.app, newLabel(m.kind), m.kind.label, '', 'Create', (name) => { void createContentNote(plugin, system, m.kind, name); }, (el) => {
		const where = el.createDiv({ cls: 'ev-content-new-where' });
		setIcon(where.createSpan({ cls: 'ev-content-new-icon' }), gameIcon('folder'));
		where.createSpan({ text: contentFolderFor(plugin, system, m.kind.kind) });
	}).open();
}

/** Open a new entry's note: from the compendium (not a note), in a tab of its own, so the compendium stays. */
async function openNew(plugin: EmberVaultPlugin, file: TFile, mode?: 'source'): Promise<void> {
	const app = plugin.app;
	const leaf = app.workspace.getLeaf(app.workspace.getActiveViewOfType(MarkdownView) ? false : 'tab');
	await leaf.openFile(file, mode ? { state: { mode } } : undefined);
}

/** Write a note with a kind's starter block in the content folder, and open it. */
export async function createContentNote(plugin: EmberVaultPlugin, system: string, kind: KindSpec, name: string): Promise<TFile | null> {
	const blocks = plugin.systems.get(system)?.content?.blocks;
	if (!blocks) return null;
	const app = plugin.app;
	try {
		const path = plugin.campaigns.available(contentNotePath(plugin.content.folder(), blocks, kind, name));
		const folder = path.slice(0, path.lastIndexOf('/'));
		if (!app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
		const file = await app.vault.create(path, `${fence(blockLang(blocks.prefix, kind.kind), starterBody(kind, name.trim()))}\n`);
		await openNew(plugin, file, 'source');
		return file;
	} catch (e) {
		console.error('Ember Vault: could not create the note', e);
		new Notice('Couldn\'t create the note. Nothing was written.');
		return null;
	}
}
