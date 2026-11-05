// ```box blocks: render the styled box, and let the GM restyle it by clicking
// its icon (icon library, colour, style, font). Changes preview live and are
// written back to the fence line when the editor closes.

import { MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownRenderer, Notice, setIcon, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import {
	BOX_COLORS, BOX_FONTS, BOX_ICONS, BOX_PRESETS, BOX_STYLES, boxColor, boxFence, BoxOptions, parseBoxFence, resolveBox,
} from './box-def';
import { closePopover, openPopover } from './popover';

export function registerBoxBlock(plugin: NimbleStatblocksPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('box', (source, el, ctx) => {
		ctx.addChild(new BoxBlock(plugin, el, source, ctx));
	});
}

class BoxBlock extends MarkdownRenderChild {
	/** The editor reopens on the tab you used last. */
	static lastTab = 'look';
	private opts: BoxOptions = { type: 'note' };
	private saved = '';
	private folded = false;
	private box!: HTMLElement;

	constructor(private plugin: NimbleStatblocksPlugin, el: HTMLElement, private source: string, private ctx: MarkdownPostProcessorContext) {
		super(el);
	}

	onload(): void {
		const fence = this.fenceLine();
		if (fence) this.opts = parseBoxFence(fence);
		else void this.findFenceLater();
		this.saved = boxFence(this.opts);
		this.folded = !!this.opts.collapsed;
		this.render();
	}

	/** The ```box … line above this block, when Obsidian can tell us where we are. */
	private fenceLine(): string | null {
		const info = this.ctx.getSectionInfo(this.containerEl);
		if (!info) return null;
		return info.text.split('\n')[info.lineStart] ?? null;
	}

	/** Embeds and hover previews don't get section info: find our fence in the file instead. */
	private async findFenceLater(): Promise<void> {
		const f = this.plugin.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
		if (!(f instanceof TFile)) return;
		const text = await this.plugin.app.vault.cachedRead(f);
		const lines = text.split('\n');
		const body = this.source.replace(/\n$/, '');
		for (let i = 0; i < lines.length; i++) {
			if (!/^\s*(`{3,}|~{3,})\s*box\b/i.test(lines[i])) continue;
			const end = lines.findIndex((l, j) => j > i && /^\s*(`{3,}|~{3,})\s*$/.test(l));
			if (end > i && lines.slice(i + 1, end).join('\n') === body) {
				this.opts = parseBoxFence(lines[i]);
				this.saved = boxFence(this.opts);
				this.folded = !!this.opts.collapsed;
				this.render();
				return;
			}
		}
	}

	private render(): void {
		const el = this.containerEl;
		el.empty();
		const r = resolveBox(this.opts);
		const box = el.createDiv({ cls: `nimble-box box-${r.type} box-style-${r.style} box-font-${r.font}` });
		this.box = box;
		box.style.setProperty('--box-color', boxColor(r.color));
		box.toggleClass('is-bold', r.bold);
		box.toggleClass('is-italic', r.italic);
		box.toggleClass('is-folded', this.folded);

		const head = box.createDiv({ cls: 'nimble-box-head' });
		const icon = head.createEl('button', { cls: 'nimble-box-icon', attr: { 'aria-label': 'Style', title: 'Style' } });
		setIcon(icon, r.icon);
		icon.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.openEditor(icon); });
		const title = head.createDiv({ cls: 'nimble-box-title', text: r.title, attr: { role: 'button', tabindex: '0', 'aria-expanded': String(!this.folded) } });
		const toggle = () => { this.folded = !this.folded; box.toggleClass('is-folded', this.folded); title.setAttr('aria-expanded', String(!this.folded)); };
		title.addEventListener('click', toggle);
		title.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
		const chev = head.createSpan({ cls: 'nimble-box-chevron', attr: { 'aria-hidden': 'true' } });
		setIcon(chev, 'chevron-down');
		chev.addEventListener('click', toggle);

		const body = box.createDiv({ cls: 'nimble-box-body markdown-rendered' });
		if (this.source.trim()) void MarkdownRenderer.render(this.plugin.app, this.source, body, this.ctx.sourcePath, this);
		else body.createDiv({ cls: 'nimble-box-empty', text: 'Empty' });
	}

	/** Restyle without re-rendering the body (keeps scroll and links intact). */
	private restyle(): void {
		const r = resolveBox(this.opts);
		const box = this.box;
		box.className = `nimble-box box-${r.type} box-style-${r.style} box-font-${r.font}`;
		box.style.setProperty('--box-color', boxColor(r.color));
		box.toggleClass('is-bold', r.bold);
		box.toggleClass('is-italic', r.italic);
		box.toggleClass('is-folded', this.folded);
		const icon = box.querySelector<HTMLElement>('.nimble-box-icon');
		if (icon) { icon.empty(); setIcon(icon, r.icon); }
		box.querySelector('.nimble-box-title')?.setText(r.title);
	}

	private openEditor(anchor: HTMLElement): void {
		const canSave = !!this.ctx.getSectionInfo(this.containerEl);
		openPopover(anchor, (pop) => {
			pop.addClass('nimble-box-editor');
			const r = () => resolveBox(this.opts);
			const set = (patch: Partial<BoxOptions>) => { this.opts = { ...this.opts, ...patch }; this.restyle(); refresh(); };

			// Header: the icon as it looks now, and the title, edited in place.
			const head = pop.createDiv({ cls: 'bxe-head' });
			const badge = head.createDiv({ cls: 'bxe-badge' });
			const title = head.createEl('input', { type: 'text', cls: 'bxe-title', attr: { 'aria-label': 'Box title', spellcheck: 'false' } });
			title.value = r().title;
			title.addEventListener('input', () => set({ title: title.value }));
			title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closePopover(); } });

			// Tabs
			const tabs = pop.createDiv({ cls: 'bxe-tabs', attr: { role: 'tablist' } });
			const pages = pop.createDiv({ cls: 'bxe-pages' });
			const TABS = [['type', 'Type'], ['icon', 'Icon'], ['look', 'Look']] as const;
			const pageEls: Record<string, HTMLElement> = {};
			const show = (id: string) => {
				BoxBlock.lastTab = id;
				tabs.querySelectorAll<HTMLElement>('.bxe-tab').forEach(t => { const on = t.dataset.tab === id; t.toggleClass('is-active', on); t.setAttr('aria-selected', String(on)); });
				for (const [k, el] of Object.entries(pageEls)) el.toggle(k === id);
				if (id === 'icon') window.setTimeout(() => search.focus(), 0);
			};
			for (const [id, label] of TABS) {
				const t = tabs.createEl('button', { cls: 'bxe-tab', text: label, attr: { role: 'tab', 'data-tab': id } });
				t.addEventListener('click', () => show(id));
				pageEls[id] = pages.createDiv({ cls: `bxe-page bxe-page-${id}`, attr: { role: 'tabpanel' } });
			}

			// Type: a calm two-column list.
			const typeList = pageEls.type.createDiv({ cls: 'bxe-types' });
			for (const [id, p] of Object.entries(BOX_PRESETS)) {
				const b = typeList.createEl('button', { cls: 'bxe-type', attr: { 'data-type': id, title: p.desc } });
				b.style.setProperty('--box-color', boxColor(p.color));
				setIcon(b.createSpan({ cls: 'bxe-type-icon' }), p.icon);
				b.createSpan({ cls: 'bxe-type-label', text: p.label });
				b.addEventListener('click', () => {
					// A new type brings its own look. A custom title stays.
					const keepTitle = this.opts.title !== undefined && this.opts.title !== (BOX_PRESETS[this.opts.type]?.title ?? '');
					set({ type: id, icon: undefined, color: undefined, style: undefined, font: undefined, italic: undefined, title: keepTitle ? this.opts.title : undefined });
					title.value = r().title;
				});
			}

			// Icon: search, then one grid.
			const search = pageEls.icon.createEl('input', { type: 'search', cls: 'bxe-search', attr: { placeholder: 'Search icons', 'aria-label': 'Search icons' } });
			const grid = pageEls.icon.createDiv({ cls: 'bxe-icons' });
			const all = [...new Set(BOX_ICONS.flatMap(g => g.icons))];
			const words = (name: string) => `${name} ${BOX_ICONS.filter(g => g.icons.includes(name)).map(g => g.group).join(' ')}`.toLowerCase();
			const drawIcons = () => {
				grid.empty();
				const q = search.value.trim().toLowerCase();
				const list = q ? all.filter(n => words(n).includes(q)) : all;
				// Any Lucide icon by exact name, too.
				if (q && !list.includes(q)) { const probe = createDiv(); setIcon(probe, q); if (probe.querySelector('svg')) list.unshift(q); }
				for (const name of list) {
					const b = grid.createEl('button', { cls: 'bxe-icon', attr: { 'aria-label': name, title: name, 'data-icon': name } });
					setIcon(b, name);
					b.addEventListener('click', () => set({ icon: name }));
				}
				if (!list.length) grid.createDiv({ cls: 'bxe-none', text: 'No icons match. Try a Lucide icon name.' });
				refresh();
			};
			search.addEventListener('input', drawIcons);

			// Look: colour, style, text.
			const look = pageEls.look;
			const section = (label: string) => { const s = look.createDiv({ cls: 'bxe-section' }); s.createDiv({ cls: 'bxe-label', text: label }); return s; };
			const colourRow = section('Colour').createDiv({ cls: 'bxe-swatches' });
			for (const name of ['violet', 'blue', 'teal', 'green', 'gold', 'amber', 'red', 'pink', 'sepia', 'gray']) {
				const s = colourRow.createEl('button', { cls: 'bxe-swatch', attr: { 'aria-label': name, title: name, 'data-color': name } });
				s.style.setProperty('--sw', BOX_COLORS[name]);
				s.addEventListener('click', () => set({ color: name }));
			}
			const customWrap = colourRow.createEl('label', { cls: 'bxe-swatch bxe-swatch-custom', attr: { title: 'Custom colour', 'aria-label': 'Custom colour' } });
			setIcon(customWrap.createSpan(), 'pipette');
			const custom = customWrap.createEl('input', { type: 'color' });
			custom.addEventListener('input', () => set({ color: custom.value }));

			const styleGrid = section('Style').createDiv({ cls: 'bxe-styles' });
			for (const st of BOX_STYLES) {
				const b = styleGrid.createEl('button', { cls: 'bxe-style', attr: { 'data-style': st.id } });
				b.createDiv({ cls: `bxe-style-swatch box-style-${st.id}` });
				b.createDiv({ cls: 'bxe-style-label', text: st.label });
				b.addEventListener('click', () => set({ style: st.id }));
			}

			const textRow = section('Text').createDiv({ cls: 'bxe-text' });
			const fonts = textRow.createDiv({ cls: 'bxe-fonts' });
			for (const f of BOX_FONTS) {
				const b = fonts.createEl('button', { cls: `bxe-font box-font-${f.id}`, text: f.id === 'hand' ? 'Hand' : 'Aa', attr: { 'data-font': f.id, title: f.label, 'aria-label': f.label } });
				b.addEventListener('click', () => set({ font: f.id }));
			}
			const bold = textRow.createEl('button', { cls: 'bxe-toggle', attr: { 'aria-label': 'Bold', title: 'Bold' } });
			setIcon(bold, 'bold');
			bold.addEventListener('click', () => set({ bold: !this.opts.bold }));
			const italic = textRow.createEl('button', { cls: 'bxe-toggle', attr: { 'aria-label': 'Italic', title: 'Italic' } });
			setIcon(italic, 'italic');
			italic.addEventListener('click', () => set({ italic: !r().italic }));

			const foldRow = look.createEl('label', { cls: 'bxe-fold' });
			foldRow.createSpan({ text: 'Start folded' });
			const fold = foldRow.createEl('input', { type: 'checkbox', cls: 'bxe-switch' });
			fold.addEventListener('change', () => { this.opts.collapsed = fold.checked; });

			const foot = pop.createDiv({ cls: 'bxe-foot' });
			const reset = foot.createEl('button', { cls: 'bxe-reset', text: 'Reset to default' });
			reset.addEventListener('click', () => { set({ icon: undefined, color: undefined, style: undefined, font: undefined, bold: undefined, italic: undefined, title: undefined }); title.value = r().title; });
			if (!canSave) foot.createSpan({ cls: 'bxe-note', text: 'Open the note to save changes' });

			const refresh = () => {
				const cur = r();
				pop.style.setProperty('--box-color', boxColor(cur.color));
				badge.empty();
				setIcon(badge, cur.icon);
				pop.querySelectorAll<HTMLElement>('[data-type]').forEach(b => b.toggleClass('is-active', b.dataset.type === cur.type));
				pop.querySelectorAll<HTMLElement>('[data-color]').forEach(b => b.toggleClass('is-active', boxColor(b.dataset.color!) === boxColor(cur.color)));
				customWrap.toggleClass('is-active', !Object.values(BOX_COLORS).includes(boxColor(cur.color)));
				pop.querySelectorAll<HTMLElement>('[data-style]').forEach(b => b.toggleClass('is-active', b.dataset.style === cur.style));
				pop.querySelectorAll<HTMLElement>('[data-font]').forEach(b => b.toggleClass('is-active', b.dataset.font === cur.font));
				pop.querySelectorAll<HTMLElement>('[data-icon]').forEach(b => b.toggleClass('is-active', b.dataset.icon === cur.icon));
				bold.toggleClass('is-active', cur.bold);
				italic.toggleClass('is-active', cur.italic);
				fold.checked = !!this.opts.collapsed;
				custom.value = boxColor(cur.color);
			};
			drawIcons();
			show(BoxBlock.lastTab);
		}, { width: 304, onClose: () => void this.save(canSave) });
	}

	/** Write the new fence line back into the note (once, when the editor closes). */
	private async save(canSave: boolean): Promise<void> {
		const next = boxFence(this.opts);
		if (next === this.saved || !canSave) return;
		const info = this.ctx.getSectionInfo(this.containerEl);
		const file = this.plugin.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
		if (!info || !(file instanceof TFile)) return;
		const oldLine = info.text.split('\n')[info.lineStart];
		const fence = /^\s*(`{3,}|~{3,})/.exec(oldLine)?.[1] ?? '```';
		const indent = /^\s*/.exec(oldLine)?.[0] ?? '';
		let ok = false;
		await this.plugin.app.vault.process(file, (text) => {
			const lines = text.split('\n');
			// Only touch the line if it's still our fence.
			if (!/^\s*(`{3,}|~{3,})\s*box\b/i.test(lines[info.lineStart] ?? '')) return text;
			lines[info.lineStart] = indent + boxFence(this.opts, fence);
			ok = true;
			return lines.join('\n');
		});
		if (ok) this.saved = next;
		else new Notice('Couldn\'t save the box style: the note changed. Try again.');
	}
}
