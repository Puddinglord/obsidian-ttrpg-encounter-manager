// Cards for the shared note kinds, drawn with what the campaign's game system
// adds (core/note-kinds.ts). The NPC card (npc-card.ts) calls `drawSystemExtras`
// under its own facts. Other kinds have no card of their own: a system that
// draws one (`card` on its location, quest or map) gets a ```nimble-note block
// in new notes, which this file renders. With no system card the block shows
// the system's stats, or nothing.

import { MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import type EmberVaultPlugin from '../../main';
import { noteKind } from './campaign-model';
import { fieldsKey, NoteKindExtension, noteStats, SHARED_NOTE_KINDS, SharedNoteKind } from './note-kinds';

/** The system's stats ("AC 15 · HP 22") and its own drawing, for a note of `kind`. */
export function drawSystemExtras(plugin: EmberVaultPlugin, el: HTMLElement, ext: NoteKindExtension | undefined, path: string, fm: Record<string, unknown>): void {
	if (!ext) return;
	const player = plugin.playerView(path);
	const stats = noteStats(ext.fields, fm, player);
	if (stats.length) {
		const row = el.createDiv({ cls: 'nimble-note-stats' });
		for (const s of stats) {
			const chip = row.createSpan({ cls: 'nimble-note-stat' });
			chip.dataset.field = s.key;
			chip.createSpan({ cls: 'nimble-note-stat-label', text: s.label });
			chip.createSpan({ cls: 'nimble-note-stat-value', text: s.value });
		}
	}
	ext.card?.(el, { path, fm, player });
}

/** The extension for a note's kind in its campaign's system. */
export function extensionFor(plugin: EmberVaultPlugin, path: string, kind: string): NoteKindExtension | undefined {
	if (!(SHARED_NOTE_KINDS as readonly string[]).includes(kind)) return undefined;
	return plugin.system(path).noteKinds?.[kind as SharedNoteKind];
}

/** What a card depends on, so it redraws when any of it changes: the system, and its fields' values. */
export function extrasKey(plugin: EmberVaultPlugin, path: string, kind: string, fm: Record<string, unknown>): string {
	const ext = extensionFor(plugin, path, kind);
	return `${plugin.system(path).id}|${plugin.playerView(path)}|${fieldsKey(ext?.fields, fm)}`;
}

export function registerNoteCard(plugin: EmberVaultPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('nimble-note', (_source, el, ctx) => {
		ctx.addChild(new NoteCard(plugin, el, ctx));
	});
}

class NoteCard extends MarkdownRenderChild {
	private key = '';

	constructor(private plugin: EmberVaultPlugin, el: HTMLElement, private ctx: MarkdownPostProcessorContext) {
		super(el);
	}

	onload(): void {
		this.render();
		// Properties and the campaign's system change without the block's text changing.
		this.registerEvent(this.plugin.app.metadataCache.on('changed', (f) => { if (f.path === this.ctx.sourcePath) this.refresh(); }));
		this.registerEvent(this.plugin.campaigns.on('changed', () => this.refresh()));
	}

	private fm(): Record<string, unknown> {
		const f = this.plugin.app.vault.getFileByPath(this.ctx.sourcePath);
		return (f && this.plugin.app.metadataCache.getFileCache(f)?.frontmatter) || {};
	}

	private refresh(): void {
		const fm = this.fm();
		if (extrasKey(this.plugin, this.ctx.sourcePath, noteKind(fm), fm) !== this.key) this.render();
	}

	private render(): void {
		const el = this.containerEl;
		el.empty();
		const path = this.ctx.sourcePath;
		const fm = this.fm();
		const kind = noteKind(fm);
		this.key = extrasKey(this.plugin, path, kind, fm);
		const card = el.createDiv({ cls: `nimble-note-card kind-${kind}` });
		drawSystemExtras(this.plugin, card, extensionFor(this.plugin, path, kind), path, fm);
		if (!card.childElementCount) card.remove();
	}
}
