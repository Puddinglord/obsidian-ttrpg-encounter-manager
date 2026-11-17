// What a hand-written stat block couldn't use, shown quietly under it: one
// muted line that opens into plain-language notes, each pointing at the words
// it's about, with a Fix button when the fix is obvious. Only in notes (the
// person reading is the person who wrote it), never in the bestiary or hovers.

import { MarkdownPostProcessorContext, Notice, setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../../../main';
import { applyStatblockFix, StatblockIssue } from './parser';
import { replaceEncounterBlock } from '../../core/encounter-def';

/** Remembers which blocks were opened, so a re-render (typing in the note) keeps them open. */
const opened = new Set<string>();

export function renderStatblockIssues(plugin: NimbleStatblocksPlugin, el: HTMLElement, issues: StatblockIssue[], source: string, ctx: MarkdownPostProcessorContext): void {
	if (!issues.length) return;
	const key = `${ctx.sourcePath}\n${source}`;
	const box = el.createDiv({ cls: 'nimble-issues' });
	const lines = new Set(issues.map(i => i.line)).size;
	const toggle = box.createEl('button', { cls: 'nimble-issues-toggle', attr: { 'aria-expanded': 'false' } });
	setIcon(toggle.createSpan({ cls: 'nimble-issues-icon' }), 'info');
	toggle.createSpan({ cls: 'nimble-issues-summary', text: lines === 1 ? 'One line here isn\'t shown as written' : `${lines} lines here aren't shown as written` });
	const more = toggle.createSpan({ cls: 'nimble-issues-more' });
	const list = box.createDiv({ cls: 'nimble-issues-list' });
	const set = (open: boolean) => {
		box.toggleClass('is-open', open);
		toggle.setAttr('aria-expanded', String(open));
		list.toggleAttribute('hidden', !open);
		more.setText(open ? 'Hide' : 'Show');
		if (open) opened.add(key); else opened.delete(key);
	};
	toggle.addEventListener('click', () => set(!box.hasClass('is-open')));
	set(opened.has(key));

	const canWrite = !!ctx.getSectionInfo(el);
	for (const issue of issues) {
		const row = list.createDiv({ cls: 'nimble-issue' });
		quote(row.createEl('code', { cls: 'nimble-issue-line' }), issue.text, issue.mark);
		row.createDiv({ cls: 'nimble-issue-message', text: issue.message });
		if (issue.hint || (issue.fix && canWrite)) {
			const foot = row.createDiv({ cls: 'nimble-issue-foot' });
			if (issue.hint) foot.createSpan({ cls: 'nimble-issue-hint', text: issue.hint });
			if (issue.fix && canWrite) {
				const fix = issue.fix;
				const b = foot.createEl('button', { cls: 'nimble-issue-fix', text: fix.label });
				b.addEventListener('click', () => {
					b.disabled = true;
					const next = applyStatblockFix(source, fix);
					// The fixed block re-renders with the list still open.
					opened.add(`${ctx.sourcePath}\n${next}`);
					void writeFix(plugin, el, ctx, source, next);
				});
			}
		}
	}
}

/** The line, with the words the note is about highlighted. */
function quote(el: HTMLElement, text: string, mark?: string): void {
	const at = mark ? text.indexOf(mark) : -1;
	if (!mark || at < 0) { el.setText(text); return; }
	el.appendText(text.slice(0, at));
	el.createEl('mark', { text: mark });
	el.appendText(text.slice(at + mark.length));
}

async function writeFix(plugin: NimbleStatblocksPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string, next: string): Promise<void> {
	await rewriteBlock(plugin, el, ctx, source, next, 'nimble', 'fix it');
}

/**
 * Replace one code block's body in its note (found by its rendered source, so a
 * block in a callout or list is found too). Nothing is written if the note
 * changed since it was shown. Returns whether it was written.
 */
export async function rewriteBlock(plugin: NimbleStatblocksPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string, next: string, lang: string, what = 'save it'): Promise<boolean> {
	const info = ctx.getSectionInfo(el);
	const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
	if (!info || !file) { new Notice(`Couldn't find this block in the note to ${what}.`); return false; }
	let ok = false;
	try {
		await plugin.app.vault.process(file, (text) => {
			const out = replaceEncounterBlock(text, info.lineStart, info.lineEnd, source, next, lang);
			ok = out !== null;
			return out ?? text;
		});
	} catch (e) {
		console.error('Ember Vault: could not rewrite the block', e);
	}
	if (!ok) new Notice(`Couldn't ${what}: the note changed since this was shown. Nothing was written.`);
	return ok;
}
