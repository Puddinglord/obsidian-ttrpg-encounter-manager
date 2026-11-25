// What Import… shows for a record, drawn the way the vault will show it:
// content through the game's own block (the same fenced block the note will
// hold, rendered by the block's processor), NPCs as their card, places and
// quests as the campaign card, maps as the picture with every pin on it.
// Plus the Changes view for an update and the Source view of the file.
// Never innerHTML: text goes in as text, Markdown through MarkdownRenderer.

import { Component, MarkdownRenderer, setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { fence } from '../builder/frame';
import { blockLang } from '../content/blocks';
import { drawCampaignCard } from '../campaign-cards';
import { evIcon } from '../icons';
import { applyLook } from '../look';
import { toYaml } from '../yaml-lite';
import type { BundlePin, CheckedRecord } from './bundle';
import { changedFields } from './facts';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);

export interface PreviewContext {
	plugin: EmberVaultPlugin;
	/** The game the record is for. */
	system?: string;
	edition?: string;
	/** The note Import… was opened from: links and blocks resolve from it. */
	sourcePath: string;
	/** Owns what the renderers load; the dialog unloads it on each redraw. */
	component: Component;
	/** A picture's address, by file name (blob URLs the dialog made). */
	picture(name: string): string | undefined;
}

/** The fenced block a content record will be written as; null when the game can't write it. */
export function blockFor(plugin: EmberVaultPlugin, system: string | undefined, r: CheckedRecord, edition?: string): string | null {
	const game = system ? plugin.systems.get(system) : undefined;
	if (!game || !r.value) return null;
	const w = game.content?.writeEntry?.(r.kind, r.value, edition)
		?? (game.content?.blocks?.kinds.includes(r.kind) ? { lang: blockLang(game.content.blocks.prefix, r.kind), body: toYaml(r.value) } : null);
	return w ? fence(w.lang, w.body) : null;
}

/** The record, drawn. */
export function drawPreview(el: HTMLElement, r: CheckedRecord, ctx: PreviewContext): void {
	const paper = el.createDiv({ cls: 'ev-import-paper' });
	if (ctx.system) applyLook(paper, ctx.system);
	if (!r.value) { paper.createDiv({ cls: 'ev-import-empty', text: 'Nothing to show: this one can\'t be imported as it is.' }); return; }
	try {
		if (r.type === 'map') drawMapPreview(paper, r.value, ctx);
		else if (r.type === 'note') drawNotePreview(paper, r, ctx);
		else drawContentPreview(paper, r, ctx);
	} catch (e) {
		console.error('Ember Vault: could not draw the preview', e);
		paper.empty();
		paper.createDiv({ cls: 'ev-import-empty', text: 'The preview couldn\'t be drawn. Source shows what will be written.' });
	}
}

function drawContentPreview(el: HTMLElement, r: CheckedRecord, ctx: PreviewContext): void {
	const block = blockFor(ctx.plugin, ctx.system, r, ctx.edition);
	const game = ctx.system ? ctx.plugin.systems.get(ctx.system) : undefined;
	if (block) {
		void MarkdownRenderer.render(ctx.plugin.app, block, el.createDiv({ cls: 'ev-import-block' }), ctx.sourcePath, ctx.component);
		return;
	}
	if (game?.content?.card) { game.content.card(el, { kind: r.kind, value: r.value! }, { plugin: ctx.plugin, sourcePath: ctx.sourcePath }); return; }
	el.createDiv({ cls: 'ev-import-empty', text: 'This game has no way to show it here. Source shows what will be written.' });
}

function drawNotePreview(el: HTMLElement, r: CheckedRecord, ctx: PreviewContext): void {
	const v = r.value!;
	const fields = isObj(v.fields) ? v.fields : {};
	const body = str(v.body) ?? '';
	const path = `${r.name}.md`;
	if (r.kind === 'location' || r.kind === 'quest') {
		drawCampaignCard(el, r.kind, { plugin: ctx.plugin, path, fm: { ...fields, title: r.name }, text: body, player: false, extras: () => {} });
		return;
	}
	if (r.kind === 'npc') {
		const wrap = el.createDiv({ cls: 'nimble-npc-wrap' });
		const card = wrap.createDiv({ cls: 'nimble-npc-card' });
		const head = card.createDiv({ cls: 'nimble-npc-head' });
		head.createDiv({ cls: 'nimble-npc-name', text: r.name });
		const role = str(fields.role);
		if (role) head.createDiv({ cls: 'nimble-npc-role', text: role });
		const facts = ['ancestry', 'pronouns', 'age', 'faction', 'location', 'status', 'attitude'].map(k => str(fields[k])).filter(Boolean);
		if (facts.length) head.createDiv({ cls: 'ev-import-facts', text: facts.join(' · ') });
		const ext = ctx.system ? ctx.plugin.systems.get(ctx.system)?.noteKinds?.npc : undefined;
		if (ext?.card && !ext.replace) {
			try { ext.card(head, { path, fm: fields, player: false }); } catch { /* the game's stats need a real note; the card stands without them */ }
		}
		const card_ = isObj(v.card) ? v.card : {};
		const keys = Object.keys(card_);
		if (keys.length) {
			const rows = card.createDiv({ cls: 'nimble-npc-fields' });
			for (const k of keys) {
				const row = rows.createDiv({ cls: 'nimble-npc-field' });
				row.createDiv({ cls: 'nimble-npc-label', text: k.charAt(0).toUpperCase() + k.slice(1) });
				void MarkdownRenderer.render(ctx.plugin.app, String(card_[k]), row.createDiv({ cls: 'nimble-npc-value' }), ctx.sourcePath, ctx.component);
			}
		} else card.addClass('is-brief');
	} else {
		el.createDiv({ cls: 'ev-import-note-title', text: r.name });
	}
	if (body) void MarkdownRenderer.render(ctx.plugin.app, body, el.createDiv({ cls: 'ev-import-body-text markdown-rendered' }), ctx.sourcePath, ctx.component);
}

/** A map: its picture with every pin where it will be, then the key. */
export function drawMapPreview(el: HTMLElement, v: Record<string, unknown>, ctx: PreviewContext): void {
	const pins = Array.isArray(v.pins) ? v.pins as BundlePin[] : [];
	const file = isObj(v.image) ? str(v.image.file) : undefined;
	const url = file ? ctx.picture(file) : undefined;
	const stage = el.createDiv({ cls: 'ev-import-map' });
	if (url) {
		const img = stage.createEl('img', { attr: { src: url, alt: file ?? '' } });
		img.draggable = false;
	} else {
		stage.addClass('is-missing');
		const missing = stage.createDiv({ cls: 'ev-import-map-missing' });
		setIcon(missing.createSpan({ cls: 'ev-import-map-missing-icon' }), evIcon('image'));
		missing.createDiv({ text: file ? `${file} is missing. Add it with + Add, or the map is made without a picture.` : 'No picture: the map is made without one, and you can add it later.' });
	}
	for (const p of pins) {
		const pin = stage.createDiv({ cls: 'ev-import-pin' });
		pin.style.setProperty('--x', `${p.x}%`);
		pin.style.setProperty('--y', `${p.y}%`);
		pin.createSpan({ cls: 'ev-import-pin-label', text: p.label });
	}
	const g = /^(\d+)x(\d+)$/.exec(str(v.grid) ?? '');
	if (g) stage.style.setProperty('--grid', `${g[1]} / ${g[2]}`);
	const keyed = pins.filter(p => p.text || p.note);
	if (str(v.body)) void MarkdownRenderer.render(ctx.plugin.app, str(v.body)!, el.createDiv({ cls: 'ev-import-body-text markdown-rendered' }), ctx.sourcePath, ctx.component);
	if (!keyed.length) return;
	const key = el.createDiv({ cls: 'ev-import-key' });
	for (const p of keyed) {
		const row = key.createDiv({ cls: 'ev-import-key-row' });
		row.createSpan({ cls: 'ev-import-key-label', text: p.label });
		const text = row.createDiv({ cls: 'ev-import-key-text' });
		if (p.note) text.createDiv({ cls: 'ev-import-key-note', text: `Links to ${p.note}` });
		if (p.text) void MarkdownRenderer.render(ctx.plugin.app, p.text, text.createDiv(), ctx.sourcePath, ctx.component);
	}
}

/** For an update: each field that changes, what the vault has and what the import brings. */
export function drawChanges(el: HTMLElement, before: Record<string, unknown>, after: Record<string, unknown>): void {
	const changes = changedFields(before, after);
	el.createDiv({ cls: 'ev-import-note', text: changes.length ? `${changes.length} field${changes.length === 1 ? '' : 's'} change. The rest of the note stays as it is.` : 'Nothing in it changes.' });
	const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v, null, 1).replace(/\n\s*/g, ' '));
	const table = el.createDiv({ cls: 'ev-import-diff' });
	for (const c of changes) {
		const row = table.createDiv({ cls: 'ev-import-diff-row' });
		row.createDiv({ cls: 'ev-import-diff-key', text: c.key });
		const was = row.createDiv({ cls: 'ev-import-diff-was' });
		was.createSpan({ cls: 'ev-import-diff-word', text: 'Now' });
		was.createSpan({ text: show(c.before) });
		const will = row.createDiv({ cls: 'ev-import-diff-will' });
		will.createSpan({ cls: 'ev-import-diff-word', text: 'After' });
		will.createSpan({ text: show(c.after) });
	}
}

/** Text as code: numbered lines, a marked line, keys, strings and numbers tinted. Built from spans, never HTML. */
export function drawCode(el: HTMLElement, text: string, o: { mark?: number; max?: number } = {}): void {
	const code = el.createDiv({ cls: 'ev-import-code', attr: { tabindex: '0', role: 'region', 'aria-label': 'Source' } });
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const max = o.max ?? 3000;
	const shown = lines.slice(0, max);
	shown.forEach((line, i) => {
		const row = code.createDiv({ cls: `ev-import-code-line${o.mark === i + 1 ? ' is-marked' : ''}` });
		row.createSpan({ cls: 'ev-import-code-n', text: String(i + 1) });
		const t = row.createSpan({ cls: 'ev-import-code-t' });
		// "key": value, tinted by kind.
		const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\b\d+(?:\.\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)/g;
		let at = 0;
		for (const m of line.matchAll(re)) {
			if (m.index > at) t.appendText(line.slice(at, m.index));
			const cls = m[2] ? 'is-key' : m[1] ? 'is-str' : m[3] ? 'is-num' : 'is-lit';
			t.createSpan({ cls, text: m[1] ?? m[3] ?? m[4] });
			if (m[2]) t.appendText(m[2]);
			at = m.index + m[0].length;
		}
		if (at < line.length) t.appendText(line.slice(at));
	});
	if (lines.length > max) code.createDiv({ cls: 'ev-import-code-more', text: `and ${lines.length - max} more lines` });
	if (o.mark) window.setTimeout(() => code.querySelector('.is-marked')?.scrollIntoView({ block: 'center' }), 0);
}

/** Where JSON.parse stopped, as a 1-based line, from its message ("at position 812" or "line 14 column 3"). */
export function jsonErrorLine(text: string): { line?: number; message: string } {
	try { JSON.parse(text); return { message: '' }; } catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		const lc = /line (\d+)/i.exec(msg);
		if (lc) return { line: Number(lc[1]), message: msg };
		const pos = /position (\d+)/i.exec(msg);
		if (pos) return { line: text.slice(0, Number(pos[1])).split('\n').length, message: msg };
		return { message: msg };
	}
}
