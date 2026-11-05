// NPCs in reading view. Links to NPC notes become person chips, and plain
// mentions of an NPC's name (or aliases) in the same campaign are linked as you
// read, without changing the file. Hover shows Obsidian's page preview.

import { MarkdownPostProcessorContext, setIcon, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import type { NpcInfo } from './campaigns';
import { isTouch } from './touch';

/** Where mentions must never be linked. */
const SKIP = 'a, code, pre, h1, h2, h3, h4, h5, h6, .frontmatter, .metadata-container, .nimble-inline-ref, .nimble-statblock, .nimble-map, .nimble-box-head, .encounter-chip, .nimble-npc-mention, .internal-embed';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class NpcLinker {
	private cache = new Map<string, { re: RegExp | null; byName: Map<string, NpcInfo> }>();

	constructor(private plugin: NimbleStatblocksPlugin) {
		// Notes opened before the NPC list was built (at startup) re-render once it changes.
		let key = '';
		plugin.registerEvent(plugin.campaigns.on('changed', () => {
			this.cache.clear();
			const next = plugin.campaigns.npcs.map(n => `${n.path}|${n.aliases.join(',')}|${n.campaign ?? ''}`).sort().join('\n');
			if (next !== key) { const first = key === '' && !next; key = next; if (!first) plugin.rerenderNotes(); }
		}));
		plugin.registerMarkdownPostProcessor((el, ctx) => this.process(el, ctx));
	}

	/** NPCs a note can mention: its own campaign's, plus any outside a campaign. */
	private matcher(sourcePath: string) {
		const camp = this.plugin.campaigns.of(sourcePath)?.folder ?? '';
		const hit = this.cache.get(camp);
		if (hit) return hit;
		const npcs = this.plugin.campaigns.npcs.filter(n => !camp || !n.campaign || n.campaign === camp);
		const byName = new Map<string, NpcInfo>();
		for (const n of npcs) {
			for (const name of [n.name, ...n.aliases]) {
				// Very short aliases ("Al") would light up half the page.
				if (name.length >= 3 && !byName.has(name)) byName.set(name, n);
			}
		}
		const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escape);
		const re = names.length ? new RegExp(`(^|[^\\p{L}\\p{N}_])(${names.join('|')})(?![\\p{L}\\p{N}_])`, 'gu') : null;
		const entry = { re, byName };
		this.cache.set(camp, entry);
		return entry;
	}

	private process(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		const store = this.plugin.campaigns;
		if (!store?.npcs.length) return;
		const npcPaths = new Set(store.npcs.map(n => n.path));

		// 1. Explicit links to NPC notes → chips.
		el.querySelectorAll<HTMLAnchorElement>('a.internal-link').forEach(a => {
			// Already handled, or one of our own mention links (box bodies get processed twice).
			if (a.hasClass('nimble-npc-link') || a.hasClass('nimble-npc-mention')) return;
			const target = (a.dataset.href ?? a.getAttr('href') ?? '').split('#')[0];
			const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(target, ctx.sourcePath);
			if (!dest || !npcPaths.has(dest.path)) return;
			a.addClass('nimble-npc-link');
			const npc = store.npcs.find(n => n.path === dest.path);
			if (npc) this.tapToPreview(a, npc, ctx.sourcePath);
			setIcon(a.createSpan({ cls: 'nimble-npc-icon', prepend: true }), 'user-round');
		});

		// 2. Plain mentions → light links.
		if (!this.plugin.settings.autoLinkNpcs) return;
		const { re, byName } = this.matcher(ctx.sourcePath);
		if (!re) return;
		const walker = el.doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
			acceptNode: (n) => ((n.parentElement?.closest(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
		});
		const nodes: Text[] = [];
		for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
		for (const node of nodes) {
			const text = node.nodeValue ?? '';
			re.lastIndex = 0;
			if (!re.test(text)) continue;
			re.lastIndex = 0;
			const frag = createFragment();
			let last = 0;
			for (let m = re.exec(text); m; m = re.exec(text)) {
				// m[1] is the boundary character before the name (no lookbehind: old iOS lacks it).
				const name = m[2], start = m.index + m[1].length;
				const npc = byName.get(name);
				if (!npc || npc.path === ctx.sourcePath) continue; // a note doesn't link to itself
				frag.append(text.slice(last, start));
				frag.append(this.mention(name, npc, ctx.sourcePath));
				last = start + name.length;
			}
			if (!last) continue;
			frag.append(text.slice(last));
			node.replaceWith(frag);
		}
	}

	/**
	 * Touch screens have no hover: the first tap shows the NPC's note in the
	 * preview card (a sheet on phones), the second tap opens the note.
	 */
	private tapToPreview(a: HTMLElement, npc: NpcInfo, sourcePath: string): void {
		a.addEventListener('click', (e) => {
			if (!isTouch() || !this.plugin.settings.mobileTapToPreview) return;
			if (a.dataset.previewShowing === 'true') { this.plugin.hover.hide(); return; } // let the link open
			const file = this.plugin.app.vault.getFileByPath(npc.path);
			if (!file) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			this.plugin.hover.showNote(a, file, sourcePath, npc.role);
		}, true);
	}

	private mention(text: string, npc: NpcInfo, sourcePath: string): HTMLElement {
		const a = createEl('a', {
			cls: 'internal-link nimble-npc-mention',
			text,
			href: npc.path,
			attr: { 'data-href': npc.path, target: '_blank', rel: 'noopener' },
		});
		this.tapToPreview(a, npc, sourcePath);
		a.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			void this.plugin.app.workspace.openLinkText(npc.path, sourcePath, e.metaKey || e.ctrlKey);
		});
		a.addEventListener('mouseover', (e) => {
			this.plugin.app.workspace.trigger('hover-link', { event: e, source: 'preview', hoverParent: a, targetEl: a, linktext: npc.path, sourcePath });
		});
		return a;
	}
}

export function isNpcFile(plugin: NimbleStatblocksPlugin, f: TFile | null): boolean {
	return !!f && plugin.campaigns.npcs.some(n => n.path === f.path);
}
