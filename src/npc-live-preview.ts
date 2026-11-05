// NPCs in Live Preview: links to NPC notes look like person chips, and plain
// mentions of an NPC's name get a dotted underline with a hover preview
// (Cmd/Ctrl-click opens the note; a plain click still places the cursor).

import { syntaxTree } from '@codemirror/language';
import { Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { editorInfoField, editorLivePreviewField, setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import type { NpcInfo } from './campaigns';

class NpcIcon extends WidgetType {
	eq(): boolean { return true; }
	toDOM(): HTMLElement {
		const s = createSpan({ cls: 'nimble-npc-lp-icon' });
		setIcon(s, 'user-round');
		return s;
	}
	ignoreEvent(): boolean { return false; }
}
const ICON = new NpcIcon();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LINK = /\[\[([^\]|#^\n]+)(?:[#^][^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g;

/** Don't decorate inside code, frontmatter or other blocks. */
function skippable(view: EditorView, pos: number): boolean {
	const node = syntaxTree(view.state).resolveInner(pos, 1);
	for (let n: typeof node | null = node; n; n = n.parent) {
		if (/code|frontmatter|comment|math|hmd-codeblock|formatting-link-string|url/.test(n.type.name)) return true;
	}
	return false;
}

export function npcLivePreview(plugin: NimbleStatblocksPlugin) {
	const plug = ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		version = -1;

		constructor(view: EditorView) {
			this.decorations = this.build(view);
		}

		update(u: ViewUpdate) {
			const lp = u.startState.field(editorLivePreviewField, false) !== u.state.field(editorLivePreviewField, false);
			if (u.docChanged || u.viewportChanged || u.selectionSet || lp || this.version !== plugin.npcVersion) {
				this.decorations = this.build(u.view);
			}
		}

		build(view: EditorView): DecorationSet {
			this.version = plugin.npcVersion;
			const store = plugin.campaigns;
			if (!store?.npcs.length || !view.state.field(editorLivePreviewField, false)) return Decoration.none;
			const sourcePath = view.state.field(editorInfoField, false)?.file?.path ?? '';
			const camp = store.of(sourcePath)?.folder;
			const npcs = store.npcs.filter(n => !camp || !n.campaign || n.campaign === camp);
			const byPath = new Map(store.npcs.map(n => [n.path, n]));
			const byName = new Map<string, NpcInfo>();
			for (const n of npcs) for (const name of [n.name, ...n.aliases]) if (name.length >= 3 && !byName.has(name)) byName.set(name, n);
			const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escape);
			const mention = names.length ? new RegExp(`(?<![\\p{L}\\p{N}_\\[|])(${names.join('|')})(?![\\p{L}\\p{N}_\\]])`, 'gu') : null;
			const sel = view.state.selection.ranges;
			const touches = (a: number, b: number) => sel.some(r => r.from <= b && r.to >= a);
			const decos: Range<Decoration>[] = [];

			for (const { from, to } of view.visibleRanges) {
				const text = view.state.doc.sliceString(from, to);
				const links: [number, number][] = [];
				LINK.lastIndex = 0;
				for (let m = LINK.exec(text); m; m = LINK.exec(text)) {
					const a = from + m.index, b = a + m[0].length;
					links.push([a, b]);
					if (touches(a, b) || skippable(view, a + 2)) continue;
					const dest = plugin.app.metadataCache.getFirstLinkpathDest(m[1].trim(), sourcePath);
					const npc = dest && byPath.get(dest.path);
					if (!npc) continue;
					decos.push(Decoration.widget({ widget: ICON, side: 1 }).range(a));
					decos.push(Decoration.mark({ class: 'nimble-npc-lp-link' }).range(a, b));
				}
				if (!mention || !plugin.settings.autoLinkNpcs) continue;
				mention.lastIndex = 0;
				for (let m = mention.exec(text); m; m = mention.exec(text)) {
					const a = from + m.index, b = a + m[1].length;
					const npc = byName.get(m[1]);
					if (!npc || npc.path === sourcePath) continue;
					if (links.some(([x, y]) => a < y && b > x) || skippable(view, a)) continue;
					decos.push(Decoration.mark({ class: 'nimble-npc-lp-mention', attributes: { 'data-npc': npc.path } }).range(a, b));
				}
			}
			return Decoration.set(decos, true);
		}
	}, { decorations: v => v.decorations });

	const events = EditorView.domEventHandlers({
		mouseover(e, view) {
			const el = (e.target as HTMLElement).closest<HTMLElement>('[data-npc]');
			if (!el) return false;
			const sourcePath = view.state.field(editorInfoField, false)?.file?.path ?? '';
			plugin.app.workspace.trigger('hover-link', { event: e, source: 'editor', hoverParent: el, targetEl: el, linktext: el.dataset.npc, sourcePath });
			return false;
		},
		mousedown(e, view) {
			const el = (e.target as HTMLElement).closest<HTMLElement>('[data-npc]');
			if (!el || !(e.metaKey || e.ctrlKey)) return false;
			e.preventDefault();
			const sourcePath = view.state.field(editorInfoField, false)?.file?.path ?? '';
			void plugin.app.workspace.openLinkText(el.dataset.npc!, sourcePath, e.shiftKey);
			return true;
		},
	});
	return [plug, events];
}
