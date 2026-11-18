// Inline references like `nimble:Goblin` or `5e:Goblin`: inline code that a
// game system turns into a pill. Core finds them (Reading view and Live
// Preview) and hands each to the system whose prefix it has; the system draws
// the pill, its hover card and what a click does.

import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { editorInfoField, editorLivePreviewField, setIcon } from 'obsidian';

export interface RefPillOptions {
	/** Extra classes on the pill: `is-compendium kind-spell`, `role-minion`… (they pick its tint). */
	cls?: string;
	/** An icon segment before the name (a compendium entry's kind). */
	icon?: { name: string; label?: string };
	/** A short segment before the name (a monster's level or CR). */
	badge?: { text: string; title?: string };
	name: string;
	/** Attributes on the name link (aria-label, title). */
	nameAttr?: Record<string, string>;
	/** A reference that names nothing: dashed, the name in grey and a "?" after it. */
	unknown?: { title: string; label?: string };
}

/**
 * The pill for an inline reference, the same in every game: [icon or badge | name], or
 * [name | ?] for one that names nothing. Each segment is full height with its text or
 * icon centred (styles.css, "INLINE MONSTER REFERENCES"). Returns the pill and its name
 * (a link when found): wire clicks and the hover card to the name, and append any
 * trailing segment (Nimble's + button) to the pill.
 */
export function refPill(o: RefPillOptions): { el: HTMLElement; name: HTMLElement } {
	const el = createSpan({ cls: ['nimble-inline-ref', ...(o.cls ?? '').split(' ').filter(Boolean)] });
	if (o.unknown) {
		el.addClass('nimble-inline-unresolved');
		const name = el.createSpan({ text: o.name, cls: 'nimble-inline-name unresolved' });
		const q = el.createSpan({ text: '?', cls: 'nimble-inline-unknown', attr: { title: o.unknown.title } });
		if (o.unknown.label) q.setAttr('aria-label', o.unknown.label);
		return { el, name };
	}
	el.addClass('nimble-inline-found');
	if (o.icon) {
		const icon = el.createSpan({ cls: 'nimble-inline-kind', attr: { 'aria-hidden': 'true', ...(o.icon.label ? { title: o.icon.label } : {}) } });
		setIcon(icon, o.icon.name);
	}
	if (o.badge) el.createSpan({ cls: 'nimble-inline-level', text: o.badge.text, attr: o.badge.title ? { title: o.badge.title } : {} });
	const name = el.createEl('a', { text: o.name, cls: 'nimble-inline-name', attr: { href: '#', role: 'link', ...o.nameAttr } });
	return { el, name };
}

export interface InlineRefProvider {
	/** "nimble", "dnd5e". */
	readonly id: string;
	/** The reference in this inline code (`nimble:Goblin` → "Goblin"), or null when it isn't this provider's. */
	parse(code: string): string | null;
	/** The pill for a reference. */
	create(ref: string, sourcePath: string): HTMLElement;
	/** Found references handle their own clicks in the editor; unresolved ones let the click place the cursor (to fix a typo). */
	resolves(ref: string, sourcePath: string): boolean;
	/** Redraw this provider's pills on screen (in `root`, or everywhere), e.g. after its index changed. */
	refresh?(root?: ParentNode): void;
}

export class InlineRefs {
	private readonly providers: InlineRefProvider[] = [];

	add(provider: InlineRefProvider): void {
		this.providers.push(provider);
	}

	/** Which provider claims this inline code, and the reference in it. */
	match(code: string): { provider: InlineRefProvider; ref: string } | null {
		for (const provider of this.providers) {
			const ref = provider.parse(code);
			if (ref) return { provider, ref };
		}
		return null;
	}

	/** Reading view: replace inline code that is a reference with its pill (code blocks are left alone). */
	process(el: HTMLElement, sourcePath: string): void {
		el.querySelectorAll('code').forEach((codeEl) => {
			if (codeEl.closest('pre')) return;
			const m = this.match(codeEl.textContent || '');
			if (m) codeEl.replaceWith(m.provider.create(m.ref, sourcePath));
		});
	}

	refresh(root?: ParentNode): void {
		for (const p of this.providers) p.refresh?.(root);
	}
}

class RefWidget extends WidgetType {
	constructor(private provider: InlineRefProvider, readonly ref: string, readonly sourcePath: string, readonly version: number, private onDestroy?: (dom: HTMLElement) => void) {
		super();
	}

	eq(other: RefWidget): boolean {
		return other.provider === this.provider && other.ref === this.ref && other.sourcePath === this.sourcePath && other.version === this.version;
	}

	toDOM(): HTMLElement {
		const el = this.provider.create(this.ref, this.sourcePath);
		// Marks the pills CodeMirror redraws itself, so a provider's refresh() leaves them alone.
		el.dataset.nimbleCm = '1';
		return el;
	}

	destroy(dom: HTMLElement): void {
		this.onDestroy?.(dom);
	}

	ignoreEvent(): boolean {
		return this.provider.resolves(this.ref, this.sourcePath);
	}
}

/**
 * Live Preview: draw references as pills, with the raw text back while the
 * cursor is inside one so it stays editable. `version` changes when what a
 * reference resolves to may have changed (an index rebuilt), which redraws them.
 */
export function inlineRefsLivePreview(refs: InlineRefs, opts: { version: () => number; onDestroy?: (dom: HTMLElement) => void }) {
	return ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		version: number;

		constructor(view: EditorView) {
			this.version = opts.version();
			this.decorations = this.build(view);
		}

		update(u: ViewUpdate) {
			const livePreviewChanged = u.startState.field(editorLivePreviewField, false) !== u.state.field(editorLivePreviewField, false);
			const treeChanged = syntaxTree(u.startState) !== syntaxTree(u.state);
			const v = opts.version();
			if (u.docChanged || u.viewportChanged || u.selectionSet || livePreviewChanged || treeChanged || this.version !== v) {
				this.version = v;
				this.decorations = this.build(u.view);
			}
		}

		build(view: EditorView): DecorationSet {
			const builder = new RangeSetBuilder<Decoration>();
			if (!view.state.field(editorLivePreviewField, false)) return builder.finish();
			const sourcePath = view.state.field(editorInfoField, false)?.file?.path ?? '';
			const doc = view.state.doc;
			const selection = view.state.selection;
			let lastEnd = -1;

			for (const { from, to } of view.visibleRanges) {
				syntaxTree(view.state).iterate({
					from, to,
					enter: (node) => {
						const type = node.type.name;
						if (!type.includes('inline-code') || type.includes('formatting')) return;
						const m = refs.match(doc.sliceString(node.from, node.to));
						if (!m) return;

						// Include the surrounding backticks in the replaced range.
						let start = node.from;
						let end = node.to;
						while (start > 0 && doc.sliceString(start - 1, start) === '`') start--;
						while (end < doc.length && doc.sliceString(end, end + 1) === '`') end++;

						if (start < lastEnd) return;
						if (selection.ranges.some(r => r.from <= end && r.to >= start)) return;

						lastEnd = end;
						builder.add(start, end, Decoration.replace({
							widget: new RefWidget(m.provider, m.ref, sourcePath, this.version, opts.onDestroy),
						}));
					},
				});
			}
			return builder.finish();
		}
	}, { decorations: v => v.decorations });
}
