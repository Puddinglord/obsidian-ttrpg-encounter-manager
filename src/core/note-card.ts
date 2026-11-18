// Cards for the shared note kinds, drawn with what the campaign's game system
// adds (core/note-kinds.ts). The NPC card (npc-card.ts) calls `drawSystemExtras`
// under its own facts. Other kinds have no card of their own: a system that
// draws one (`card` on its location, quest or map) gets a ```nimble-note block
// in new notes, which this file renders. With no system card the block shows
// the system's stats, or nothing.

import { getAllTags, MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../main';
import { noteKind } from './campaign-model';
import { fieldsKey, NoteKindExtension, noteStats, SHARED_NOTE_KINDS, SharedNoteKind } from './note-kinds';
import { applyLook } from './look';

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
	// A note of a kind the campaign's game draws a card for, written without the block, still gets its card.
	cardWithoutBlock(plugin, 'nimble-note', (fm) => {
		const kind = noteKind(fm);
		return kind !== 'npc' && (SHARED_NOTE_KINDS as readonly string[]).includes(kind);
	}, (holder, ctx) => {
		ctx.addChild(new NoteCard(plugin, holder, ctx));
	});
}

/**
 * Draw a card at the top of a note's reading view when the note is the right kind (`is`) but
 * has no ```<fence> block of its own: notes written by hand or by another tool, or before the
 * block existed. The card goes in the properties' section, so it sits where the block would.
 */
export function cardWithoutBlock(
	plugin: EmberVaultPlugin, fence: string,
	is: (fm: Record<string, unknown>, tags: string[]) => boolean,
	draw: (holder: HTMLElement, ctx: MarkdownPostProcessorContext, file: TFile) => void,
): void {
	const opening = new RegExp(`^\\s*(\`{3,}|~{3,})\\s*${fence}\\s*$`, 'm');
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		if (!el.hasClass('mod-frontmatter')) return;
		const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
		if (!file) return;
		const cache = plugin.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter ?? (ctx.frontmatter as Record<string, unknown> | undefined) ?? {};
		if (!is(fm, (cache && getAllTags(cache)) ?? [])) return;
		const holder = el.createDiv({ cls: 'nimble-auto-card' });
		void plugin.app.vault.cachedRead(file).then((text) => {
			if (opening.test(text)) holder.remove();
			else draw(holder, ctx, file);
		});
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
		applyLook(card, this.plugin.system(path).id);
		drawSystemExtras(this.plugin, card, extensionFor(this.plugin, path, kind), path, fm);
		if (!card.childElementCount) card.remove();
	}
}
