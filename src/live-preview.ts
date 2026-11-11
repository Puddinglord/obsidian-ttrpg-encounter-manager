// Renders `nimble:Name` inline references inside the editor in Live Preview,
// the same way Reading view does. The raw text comes back while the cursor is
// inside the reference, so it stays editable.

import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { editorInfoField, editorLivePreviewField } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { createInlineRef, parseInlineRef } from './inline-ref';

class InlineRefWidget extends WidgetType {
	constructor(private plugin: NimbleStatblocksPlugin, readonly name: string, readonly sourcePath: string, readonly version: number) {
		super();
	}

	eq(other: InlineRefWidget): boolean {
		return other.name === this.name && other.sourcePath === this.sourcePath && other.version === this.version;
	}

	toDOM(): HTMLElement {
		const el = createInlineRef(this.plugin, this.name, this.sourcePath);
		// Marks the chips CodeMirror redraws itself, so refreshInlineRefs leaves them alone.
		el.dataset.nimbleCm = '1';
		return el;
	}

	destroy(dom: HTMLElement): void {
		// Don't strand a hover preview whose reference just got re-rendered.
		if (this.plugin.hover.isAnchoredIn(dom)) this.plugin.hover.hide();
	}

	ignoreEvent(): boolean {
		// Found refs handle their own clicks (open, preview, add). Unresolved ones
		// let the editor take the click so the cursor lands there to fix a typo.
		return !!this.plugin.index.get(this.name);
	}
}

export function inlineRefLivePreview(plugin: NimbleStatblocksPlugin) {
	return ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		version: number;

		constructor(view: EditorView) {
			this.version = plugin.indexVersion;
			this.decorations = this.build(view);
		}

		update(u: ViewUpdate) {
			const livePreviewChanged = u.startState.field(editorLivePreviewField, false) !== u.state.field(editorLivePreviewField, false);
			const treeChanged = syntaxTree(u.startState) !== syntaxTree(u.state);
			if (u.docChanged || u.viewportChanged || u.selectionSet || livePreviewChanged || treeChanged || this.version !== plugin.indexVersion) {
				this.version = plugin.indexVersion;
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
						const name = parseInlineRef(doc.sliceString(node.from, node.to));
						if (!name) return;

						// Include the surrounding backticks in the replaced range.
						let start = node.from;
						let end = node.to;
						while (start > 0 && doc.sliceString(start - 1, start) === '`') start--;
						while (end < doc.length && doc.sliceString(end, end + 1) === '`') end++;

						if (start < lastEnd) return;
						const cursorInside = selection.ranges.some(r => r.from <= end && r.to >= start);
						if (cursorInside) return;

						lastEnd = end;
						builder.add(start, end, Decoration.replace({
							widget: new InlineRefWidget(plugin, name, sourcePath, this.version),
						}));
					},
				});
			}
			return builder.finish();
		}
	}, { decorations: v => v.decorations });
}
