// ```nimble-map blocks: a GM's map with pins that link to notes (LegendKeeper
// style) and, optionally, the current encounter's combatants as tokens.
// It's a GM companion, not a virtual tabletop: nothing here is shown to players.

import { App, Component, DropdownComponent, FuzzyMatch, FuzzySuggestModal, MarkdownPostProcessorContext, MarkdownRenderChild, Menu, Modal, Notice, Setting, setIcon, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { distanceLabel, MapDef, mapBlockSource, MapDrawing, mapFencesIn, MapPin, parseAmount, parseMapBlock, PIN_KINDS, PinKind, Point, replaceMapBlock, simplifyStroke } from './map-def';
import { cellAt, cellsAlong, distance, snapToCell } from './grid-def';
import { DrawTool, drawDrawingsLayer, drawLiveLine, renderDrawBar } from './map-draw';
import { renderPartyFace, renderPartyRoster } from './map-party';
import { NamePrompt } from './campaign-modals';
import { renderClock } from './clock-ui';

/** The map tab's view type (map-view.ts registers it). */
export const MAP_VIEW_TYPE = 'nimble-map';
import { DEFAULT_GRID_OPACITY, EncounterCreature } from './types';
import { isDown, isHero, isMinionGroup } from './encounters';
import { monsterRole } from './rules';
import { confirmAction, isTouch, onLongPress } from './touch';
import { setWarningButton } from './compat';
import { closePopover, isPopoverOpenFor, openPopover } from './popover';
import { applyDraft, detectOnImage, draftFrom, drawGridLayer, GridDraft, gridOf, GridPanel, specOf } from './map-grid';

const PIN_ICON: Record<PinKind, string> = {
	place: 'map-pin', area: 'flag', encounter: 'swords', npc: 'user', treasure: 'gem', danger: 'skull', note: 'sticky-note', secret: 'eye-off', map: 'map',
};

type Mode = 'view' | 'add' | 'move' | 'grid' | 'party' | 'measure' | 'draw';

/** The drawing tool, colour and width: one choice for every map. */
const DRAW = { tool: 'pen' as DrawTool, colour: 'accent', width: 2 };
/** This visit's drawing history per map, for Undo (each entry is the drawings before a change). */
const DRAW_UNDO = new Map<string, MapDrawing[][]>();
const UNDO_DEPTH = 30;

/**
 * Where each map was looked at, by note and image. Saving rewrites the note and
 * Obsidian draws the block again from scratch; this puts the new one back where
 * the old one was, and a note you come back to (say with Back, after following a
 * map pin) opens on the same spot. The mode only carries over a quick re-render.
 */
interface ViewMemory { scale: number; tx: number; ty: number; height?: number; iw: number; showLabels: boolean; showDrawings: boolean }
const VIEWS = new Map<string, ViewMemory>();
/** The mode a map was in when it saved, for the copy Obsidian draws next. Taken once, and only soon after. */
/**
 * What a map was doing when Obsidian last drew it again (after a save, or when the
 * whole note re-renders, as it does when campaign links change): its mode, full
 * screen, and a grid being sized. Taken once by the next copy, and only soon after.
 */
interface CarriedState { mode: Mode; at: number; expanded: boolean; before: { scale: number; tx: number; ty: number } | null; draft: GridDraft | null; leaf: HTMLElement | null }
const SAVED_MODE = new Map<string, CarriedState>();
/** Every map on screen, so a new copy can take over from the one it replaces in the same view. */
const LIVE = new Set<MapBlock>();
const MODE_KEEP_MS = 3000;

/** A party move that crossed cells on a map with `travel:`, waiting for Advance or Not now (kept across the redraw a save causes). */
const PENDING_TRAVEL = new Map<string, { jump: string; text: string; label: string; at: number }>();
const TRAVEL_OFFER_MS = 120000;

/** What a map tab adds to a map: it fills the pane, has a Notes button, and keeps map pins in the tab. */
export interface MapHost {
	/** Fill the container instead of sizing the viewport to the map. */
	fill?: boolean;
	/** The Notes button: open or close a note beside the map. */
	notes?: { toggle: () => void; isOpen: () => boolean; pick: () => void };
	/** A pin to another map was clicked: true when the host opened it. */
	openMap?: (link: string, newLeaf: boolean) => boolean;
}

/**
 * Where a map is drawn: a tab's reading view and its Live Preview each draw their
 * own copy (one hidden), so a copy takes over only from the one in the same view.
 */
function hostOf(el: HTMLElement): HTMLElement | null {
	return el.closest<HTMLElement>('.markdown-reading-view, .markdown-source-view, .nimble-map-view');
}

export function registerMapBlock(plugin: NimbleStatblocksPlugin): void {
	// Opening a note (or switching tabs) is a fresh start: what a map was doing only carries over a redraw.
	plugin.registerEvent(plugin.app.workspace.on('file-open', () => SAVED_MODE.clear()));
	plugin.registerMarkdownCodeBlockProcessor('nimble-map', (source, el, ctx) => {
		ctx.addChild(new MapBlock(plugin, el, source, ctx));
	});
}

export class MapBlock extends MarkdownRenderChild {
	private scale = 1;
	private tx = 0;
	private ty = 0;
	private mode: Mode = 'view';
	private showTokens = false;
	private showLabels = true;
	private showDrawings = true;
	/** The SVG for lines being drawn right now (pen, route, measure, the party's path), and the chip that labels them. */
	private live!: SVGSVGElement;
	private partyLayer!: HTMLElement;
	private chip!: HTMLElement;
	/** Points of the route or measurement being made, and of the pen stroke being drawn. */
	private path: Point[] = [];
	private stroke: Point[] | null = null;
	private drawBarEl: HTMLElement | null = null;
	/** Full screen: the map fills its tab (everything under the tab's header) until toggled off. */
	private expanded = false;
	/** The view before going full screen, to go back to. */
	private beforeExpand: { scale: number; tx: number; ty: number } | null = null;
	/** What the last build registered (the clock chip's listener): unloaded on the next build. */
	private built: Component | null = null;
	private stage!: HTMLElement;
	private viewport!: HTMLElement;
	private img!: HTMLImageElement;
	private pinLayer!: HTMLElement;
	private tokenLayer!: HTMLElement;
	private tray!: HTMLElement;
	private fitted = false;
	private sized = false;
	/** The viewport height picked for a tall map, kept when the block redraws. */
	private height: number | null = null;
	/** The Grid panel, while it's open, and the draft it edits (kept when the block redraws). */
	private gridPanel: GridPanel | null = null;
	private gridPanelEl: HTMLElement | null = null;
	private gridDraft: GridDraft | null = null;
	/** "Fit to 3 × 3": dragging on the map draws a box instead of panning. */
	private onBox: ((box: { x: number; y: number; w: number; h: number }) => void) | null = null;
	/** After a double-tap zoom, the synthesized click can land on a pin that moved under the finger. */
	private quietUntil = 0;

	private def: MapDef;
	/** Add/Move controls were drawn (the block can be written back). */
	private editable = false;

	/** `source` is the block as it is in the note: what a save looks for, and what a failed save goes back to. */
	constructor(private plugin: NimbleStatblocksPlugin, el: HTMLElement, private source: string, private ctx: MarkdownPostProcessorContext, private host: MapHost = {}) {
		super(el);
		this.def = parseMapBlock(source);
		const saved = VIEWS.get(this.mapKey);
		if (saved) { this.showLabels = saved.showLabels; this.showDrawings = saved.showDrawings; }
	}

	/**
	 * Obsidian draws a note again after a save, and whenever the whole note re-renders.
	 * The new copy of this map takes over from the old one in the same tab (still on
	 * screen, or just unloaded): mode, full screen and a grid being sized. True when
	 * it took anything, so the toolbar is drawn again.
	 */
	private takeOver(): boolean {
		const leaf = hostOf(this.containerEl);
		let st: Omit<CarriedState, 'at' | 'leaf'> | null = null;
		const old = [...LIVE].find(m => m !== this && m.mapKey === this.mapKey && m.leafEl === leaf && m.wasMain);
		if (old) st = old.state();
		else {
			const saved = SAVED_MODE.get(this.mapKey);
			if (saved && saved.leaf === leaf && Date.now() - saved.at < MODE_KEEP_MS) st = saved;
		}
		SAVED_MODE.delete(this.mapKey);
		if (!st || (st.mode === 'view' && !st.expanded)) return false;
		this.mode = this.editable || st.mode === 'measure' ? st.mode : 'view';
		this.expanded = st.expanded && !this.host.fill;
		this.beforeExpand = st.before;
		this.gridDraft = st.draft;
		return true;
	}

	private state(): Omit<CarriedState, 'at' | 'leaf'> {
		return { mode: this.mode, expanded: this.expanded, before: this.beforeExpand, draft: this.mode === 'grid' ? this.gridPanel?.current ?? this.gridDraft : null };
	}

	/** The view this map is drawn in (a tab's reading view, its Live Preview, or a map tab), as last seen on the page. */
	private leafEl: HTMLElement | null = null;
	private tookOver = false;

	/** Hover previews and embeds are small copies: they neither restore nor overwrite the remembered view. */
	private get remembers(): boolean {
		// Once off the page there's nothing to look up: use what was seen while it was on it.
		if (!this.containerEl.isConnected) return this.wasMain;
		this.wasMain = !this.containerEl.closest('.hover-popover, .popover, .markdown-embed');
		this.leafEl = hostOf(this.containerEl);
		return this.wasMain;
	}
	/** This copy is the note's own map (not an embed or a preview), as last seen on the page. */
	private wasMain = false;

	/** Hand this map's mode, full screen and grid draft to the copy Obsidian draws next. */
	private carry(): void {
		if (this.remembers) SAVED_MODE.set(this.mapKey, { ...this.state(), at: Date.now(), leaf: this.leafEl });
	}

	onunload(): void {
		LIVE.delete(this);
		// Unloaded because the note is being drawn again (not closed): the next copy carries on.
		this.carry();
	}

	private remember(): void {
		if (!this.remembers || !this.fitted || !this.img?.naturalWidth) return;
		VIEWS.set(this.mapKey, { scale: this.scale, tx: this.tx, ty: this.ty, height: this.height ?? undefined, iw: this.img.naturalWidth, showLabels: this.showLabels, showDrawings: this.showDrawings });
	}

	/** Embeds and hover previews don't get section info, so pins can't be saved from there. */
	private canSave(): boolean { return !!this.ctx.getSectionInfo(this.containerEl); }

	private get app(): App { return this.plugin.app; }
	private get mapKey(): string { return `${this.ctx.sourcePath}::${this.def.image}`; }

	onload(): void {
		LIVE.add(this);
		// Obsidian's mobile layout turns two quick taps anywhere in reading view into "edit this note",
		// so tapping Zoom in twice, or double-tapping to zoom, flipped the note into editing. Taps on
		// the map are the map's: they don't reach the note.
		for (const type of ['pointerdown', 'pointerup'] as const) {
			this.registerDomEvent(this.containerEl, type, (e: PointerEvent) => { if (e.pointerType !== 'mouse') e.stopPropagation(); });
		}
		this.registerDomEvent(this.containerEl, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape' && this.expanded && !e.defaultPrevented && !(e.target as HTMLElement | null)?.closest?.('.nimble-map-viewport, input')) this.setExpanded(false);
		});
		this.build();
		// Section info can arrive just after the first render.
		if (!this.editable) {
			const t = window.setTimeout(() => { if (!this.editable && this.canSave()) this.build(); }, 400);
			this.register(() => window.clearTimeout(t));
		}
		this.registerEvent(this.plugin.encounters.on('changed', () => { if (this.showTokens) this.renderTokens(); }));
	}

	// ------------------------------------------------------------------------

	private build(): void {
		const root = this.containerEl;
		root.empty();
		root.addClass('nimble-map');

		const src = this.resolveImage();
		if (!src) {
			const err = root.createDiv({ cls: 'nimble-error' });
			err.createEl('strong', { text: 'Map image not found. ' });
			err.appendText(this.def.image ? `Couldn't find "${this.def.image}". Put the image in your vault and use image: [[file name]].` : 'Add a line like image: [[My map.png]] to this block.');
			return;
		}

		const bar = root.createDiv({ cls: 'nimble-map-toolbar' });
		const modeBtn = (mode: Mode, icon: string, label: string) => {
			const b = bar.createEl('button', { cls: `nimble-map-btn${this.mode === mode ? ' is-active' : ''}`, attr: { 'aria-label': label, 'aria-pressed': String(this.mode === mode) } });
			setIcon(b.createSpan(), icon);
			b.createSpan({ text: label });
			b.onclick = () => { this.mode = this.mode === mode ? 'view' : mode; this.build(); };
		};
		this.editable = this.canSave();
		if (this.editable) {
			modeBtn('add', 'map-pin', 'Add pin');
			modeBtn('move', 'move', 'Move pins');
			modeBtn('grid', 'grid', 'Grid');
			modeBtn('party', 'shield', 'Place party');
			modeBtn('draw', 'pencil', 'Draw');
		} else if (this.mode !== 'measure') this.mode = 'view';
		// Measuring needs a grid to count on, and nothing is saved, so it works in embeds too.
		if (gridOf(this.def)) modeBtn('measure', 'ruler', 'Measure');
		else if (this.mode === 'measure') this.mode = 'view';
		if (this.mode !== 'grid') { this.gridDraft = null; this.onBox = null; }
		if (this.mode !== 'measure' && !(this.mode === 'draw' && DRAW.tool === 'route')) this.path = [];
		// Tokens come from the GM's tracker, so a map in a campaign you play in doesn't offer them.
		if (this.plugin.playerView(this.ctx.sourcePath)) this.showTokens = false;
		else {
			const tokens = bar.createEl('button', { cls: `nimble-map-btn${this.showTokens ? ' is-active' : ''}`, attr: { 'aria-label': 'Show the current encounter as tokens', 'aria-pressed': String(this.showTokens) } });
			setIcon(tokens.createSpan(), 'swords');
			tokens.createSpan({ text: 'Encounter tokens' });
			tokens.onclick = () => { this.showTokens = !this.showTokens; this.build(); };
		}
		const labels = bar.createEl('button', { cls: `nimble-map-btn${this.showLabels ? ' is-active' : ''}`, attr: { 'aria-label': 'Show pin labels', 'aria-pressed': String(this.showLabels) } });
		setIcon(labels.createSpan(), 'tag');
		labels.onclick = () => { this.showLabels = !this.showLabels; this.root?.toggleClass('hide-labels', !this.showLabels); labels.toggleClass('is-active', this.showLabels); this.remember(); };
		const campaign = this.plugin.campaigns.of(this.ctx.sourcePath);
		if (campaign) {
			const on = this.plugin.settings.mapClock;
			const clock = bar.createEl('button', { cls: `nimble-map-btn nimble-map-icon-btn${on ? ' is-active' : ''}`, attr: { 'aria-label': 'Show the campaign clock', 'aria-pressed': String(on) } });
			setIcon(clock, 'calendar-clock');
			clock.onclick = () => { this.plugin.settings.mapClock = !on; void this.plugin.saveSettings(); this.build(); };
		}
		if (this.def.drawings.length || this.mode === 'draw') {
			const drawings = bar.createEl('button', { cls: `nimble-map-btn nimble-map-icon-btn${this.showDrawings ? ' is-active' : ''}`, attr: { 'aria-label': 'Show drawings', 'aria-pressed': String(this.showDrawings) } });
			setIcon(drawings, 'pen-line');
			drawings.onclick = () => { this.showDrawings = !this.showDrawings; drawings.toggleClass('is-active', this.showDrawings); drawings.setAttr('aria-pressed', String(this.showDrawings)); this.renderDrawings(); this.remember(); };
		}
		bar.createDiv({ cls: 'nimble-map-spacer' });
		const zoom = (icon: string, label: string, fn: () => void) => {
			const b = bar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
			setIcon(b, icon);
			b.onclick = fn;
		};
		if (this.host.notes) {
			const notes = bar.createEl('button', { cls: `nimble-map-btn${this.host.notes.isOpen() ? ' is-active' : ''}`, attr: { 'aria-label': 'Notes beside the map', 'aria-pressed': String(this.host.notes.isOpen()) } });
			setIcon(notes.createSpan(), 'panel-right');
			notes.createSpan({ text: 'Notes' });
			notes.onclick = () => { this.host.notes!.toggle(); };
			const pick = bar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Choose the note shown beside the map' } });
			setIcon(pick, 'chevron-down');
			pick.onclick = () => this.host.notes!.pick();
		} else if (!this.host.fill) {
			const tab = bar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Open in tab' } });
			setIcon(tab, 'square-arrow-out-up-right');
			tab.onclick = (e) => void this.openInTab(e.metaKey || e.ctrlKey);
		}
		zoom('zoom-out', 'Zoom out', () => this.zoomAt(1 / 1.3));
		zoom('zoom-in', 'Zoom in', () => this.zoomAt(1.3));
		zoom('maximize', 'Fit map', () => this.fit());
		if (!this.host.fill) zoom(this.expanded ? 'shrink' : 'expand', this.expanded ? 'Exit full screen' : 'Full screen', () => this.setExpanded(!this.expanded));

		const hint = this.modeHint();
		if (hint) root.createDiv({ cls: 'nimble-map-hint', text: hint });
		this.drawBarEl = this.mode === 'draw' ? root.createDiv() : null;
		this.renderDrawBar();
		this.gridPanel = null;
		this.gridPanelEl = this.mode === 'grid' ? root.createDiv() : null;
		if (this.gridPanelEl) this.registerDomEvent(this.gridPanelEl, 'keydown', (e: KeyboardEvent) => { this.gridPanel?.key(e); });
		root.style.setProperty('--nimble-map-grid-opacity', String(this.plugin.settings.mapGridOpacity ?? DEFAULT_GRID_OPACITY));

		const body = root.createDiv({ cls: 'nimble-map-body' });
		this.viewport = body.createDiv({ cls: `nimble-map-viewport mode-${this.mode}` });
		this.viewport.tabIndex = 0;
		if (this.height && !this.host.fill && !this.expanded) this.viewport.style.height = `${this.height}px`;
		root.toggleClass('is-filling', !!this.host.fill);
		if (this.built) this.removeChild(this.built);
		this.built = this.addChild(new Component());
		this.trackExpanded(this.built);
		if (campaign && this.plugin.settings.mapClock) {
			// The day tracker in the corner: the same clock as the Campaign panel's.
			const corner = this.viewport.createDiv({ cls: 'nimble-map-clock' });
			corner.addEventListener('pointerdown', (e) => e.stopPropagation());
			renderClock(corner, this.plugin, campaign, this.built, 'chip');
		}
		this.stage = this.viewport.createDiv({ cls: 'nimble-map-stage' });
		this.img = this.stage.createEl('img', { attr: { src, alt: this.def.image, draggable: 'false' } });
		this.live = this.stage.createSvg('svg', { cls: 'nimble-map-livelayer' });
		this.pinLayer = this.stage.createDiv({ cls: 'nimble-map-layer' });
		this.partyLayer = this.stage.createDiv({ cls: 'nimble-map-layer nimble-map-partylayer' });
		this.chip = this.partyLayer.createDiv({ cls: 'nimble-map-chip is-hidden', attr: { 'aria-live': 'polite' } });
		this.tokenLayer = this.stage.createDiv({ cls: 'nimble-map-layer nimble-map-tokens' });
		this.tray = body.createDiv({ cls: 'nimble-map-tray' });
		this.root?.toggleClass('hide-labels', !this.showLabels);

		this.img.onload = () => this.place();
		if (this.img.complete && this.img.naturalWidth) this.place();
		// Maps in collapsed callouts, hidden tabs or a rotating phone get their size late.
		const ro = new ResizeObserver(() => { if (!this.fitted) this.place(); });
		ro.observe(this.viewport);
		this.register(() => ro.disconnect());
		this.wirePanZoom();
		this.renderTravelBar();
		this.renderPins();
		this.renderTokens();
	}

	private get root(): HTMLElement | null { return this.containerEl; }

	private resolveImage(): string | null {
		const img = this.def.image;
		if (!img) return null;
		if (/^https?:\/\//i.test(img)) return img;
		const file = this.app.metadataCache.getFirstLinkpathDest(img, this.ctx.sourcePath);
		return file ? this.app.vault.getResourcePath(file) : null;
	}

	// ------------------------------------------------------------------------
	// Pan & zoom

	private apply(): void {
		this.stage.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
		this.root?.toggleClass('is-zoomed-out', this.scale * (this.img?.naturalWidth || 0) < 1600);
		// Pins and tokens keep a constant on-screen size.
		this.stage.style.setProperty('--nimble-map-inv', String(1 / this.scale));
		this.remember();
	}

	/** Size the stage to the image, then keep the current view, restore a remembered one, or fit. */
	private place(): void {
		const iw = this.img.naturalWidth;
		const ih = this.img.naturalHeight;
		// Not on the page yet (or hidden): the resize observer calls again once it has a size.
		if (!iw || !this.viewport.isConnected || !this.viewport.clientWidth) return;
		if (!this.tookOver) {
			this.tookOver = true;
			void this.remembers; // note which tab this is in
			if (this.takeOver()) { this.build(); return; }
		}
		if (!this.fitted && this.remembers) {
			const saved = VIEWS.get(this.mapKey);
			if (saved && saved.iw === iw) {
				this.scale = saved.scale;
				this.tx = saved.tx;
				this.ty = saved.ty;
				this.sized = true;
				if (saved.height && !this.host.fill && !this.expanded && !this.viewport.doc.body.hasClass('is-phone')) { this.height = saved.height; this.viewport.style.height = `${saved.height}px`; }
				this.fitted = true;
			}
		}
		if (!this.fitted) this.fit();
		else {
			this.stage.style.width = `${iw}px`;
			this.stage.style.height = `${ih}px`;
			this.apply();
		}
		this.renderGrid();
		this.live.setAttr('viewBox', `0 0 ${iw} ${ih}`);
		this.live.setAttr('width', iw);
		this.live.setAttr('height', ih);
		this.renderDrawings();
		this.renderParty();
		this.drawPath();
		if (this.gridPanelEl && !this.gridPanel) this.openGridPanel();
	}

	// ------------------------------------------------------------------------
	// Grid

	private get aspect(): number { return this.img.naturalWidth / this.img.naturalHeight; }

	/** The grid lines: the draft while the Grid panel is open, else the block's grid unless it's hidden. */
	private renderGrid(): void {
		if (!this.stage || !this.img?.naturalWidth) return;
		const draft = this.gridDraft;
		const spec = draft ? specOf(draft) : this.def.showGrid === false ? null : gridOf(this.def);
		drawGridLayer(this.stage, this.img.nextElementSibling, spec, this.img.naturalWidth, this.img.naturalHeight, !!draft);
	}

	private openGridPanel(): void {
		if (!this.gridPanelEl) return;
		this.gridDraft ??= draftFrom(this.def, this.aspect);
		const image = this.def.image;
		this.gridPanel = new GridPanel(this.gridPanelEl, this.gridDraft, {
			size: () => ({ w: this.img.naturalWidth, h: this.img.naturalHeight }),
			viewCentre: () => {
				const r = this.viewport.getBoundingClientRect();
				return this.toPercent(r.left + r.width / 2, r.top + r.height / 2);
			},
			preview: (d) => { this.gridDraft = d; this.renderGrid(); },
			boxMode: (fn) => {
				this.onBox = fn;
				this.viewport.toggleClass('is-boxing', !!fn);
				this.stage.querySelector('.nimble-map-fitbox')?.remove();
			},
			detect: (kind, hint) => detectOnImage(this.app, image, this.ctx.sourcePath, kind, hint),
			canDetect: true,
			save: (d) => {
				applyDraft(this.def, d, this.aspect);
				this.gridDraft = null;
				this.mode = 'view';
				this.build();
				void this.save();
			},
			cancel: () => { this.gridDraft = null; this.mode = 'view'; this.build(); },
		});
	}

	private fit(): void {
		const vw = this.viewport.clientWidth;
		const vh = this.viewport.clientHeight;
		const iw = this.img.naturalWidth;
		const ih = this.img.naturalHeight;
		if (!vw || !vh || !iw) return;
		// Tall maps get a taller viewport (once, on desktop) instead of a thumbnail in a letterbox.
		if (!this.sized && !this.host.fill && !this.expanded && !this.viewport.doc.body.hasClass('is-phone') && ih > 0) {
			this.sized = true;
			const want = Math.round(Math.max(360, Math.min(window.innerHeight * 0.8, vw * (ih / iw))));
			if (Math.abs(want - vh) > 40) { this.height = want; this.viewport.style.height = `${want}px`; this.fit(); return; }
		}
		this.stage.style.width = `${iw}px`;
		this.stage.style.height = `${ih}px`;
		this.scale = Math.min(vw / iw, vh / ih);
		this.tx = (vw - iw * this.scale) / 2;
		this.ty = (vh - ih * this.scale) / 2;
		this.fitted = true;
		this.apply();
	}

	/** Go full screen in the tab, or back into the note. Going in fits the map to the space; coming back restores the view. */
	private setExpanded(on: boolean): void {
		if (on === this.expanded || this.host.fill) return;
		if (on) this.beforeExpand = { scale: this.scale, tx: this.tx, ty: this.ty };
		this.expanded = on;
		const before = this.beforeExpand;
		this.build();
		// Once the new size has been laid out: fill it, or put the old view back.
		window.requestAnimationFrame(() => {
			if (!this.img?.naturalWidth) return;
			if (on) this.fit();
			else if (before) { this.scale = before.scale; this.tx = before.tx; this.ty = before.ty; this.apply(); }
			if (!on) this.beforeExpand = null;
			this.viewport.focus({ preventScroll: true });
		});
	}

	/**
	 * While full screen, the map is fixed over its tab's content area: follow that
	 * area as the window, sidebars or splits change it, and hide with the tab.
	 */
	private trackExpanded(owner: Component, tries = 0): void {
		const root = this.containerEl;
		root.toggleClass('is-expanded', this.expanded);
		if (!this.expanded) { root.removeClass('is-tab-hidden'); return; }
		// A block drawn again after a save isn't on the page yet: wait for it (while this build is still the current one).
		const pane = root.isConnected ? root.closest<HTMLElement>('.view-content') : null;
		if (!pane) {
			root.addClass('is-tab-hidden');
			if (tries < 100 && this.built === owner) window.setTimeout(() => { if (this.built === owner) this.trackExpanded(owner, tries + 1); }, 30);
			return;
		}
		const follow = () => {
			const r = pane.getBoundingClientRect();
			const hidden = !pane.isConnected || r.width < 2 || r.height < 2;
			root.toggleClass('is-tab-hidden', hidden);
			if (hidden) return;
			// An ancestor (a transform, contain: paint) can make "fixed" measure from somewhere other than the window:
			// put the map at 0,0, see where that lands, and offset from there.
			root.setCssProps({ '--map-full-x': '0px', '--map-full-y': '0px', '--map-full-w': `${r.width}px`, '--map-full-h': `${r.height}px` });
			const origin = root.getBoundingClientRect();
			root.setCssProps({ '--map-full-x': `${r.left - origin.left}px`, '--map-full-y': `${r.top - origin.top}px` });
		};
		follow();
		const ro = new ResizeObserver(() => { follow(); if (this.fitted) this.apply(); });
		ro.observe(pane);
		owner.register(() => ro.disconnect());
		owner.registerDomEvent(root.win, 'resize', follow);
		// A sidebar opening moves the pane without always resizing it in the same frame.
		owner.registerEvent(this.app.workspace.on('layout-change', () => window.requestAnimationFrame(follow)));
		owner.registerEvent(this.app.workspace.on('resize', follow));
	}

	private zoomAt(f: number, cx = this.viewport.clientWidth / 2, cy = this.viewport.clientHeight / 2): void {
		const next = Math.max(0.05, Math.min(8, this.scale * f));
		const k = next / this.scale;
		this.tx = cx - (cx - this.tx) * k;
		this.ty = cy - (cy - this.ty) * k;
		this.scale = next;
		this.apply();
	}

	/** Viewport pixel → percent of the image. */
	private toPercent(clientX: number, clientY: number): { x: number; y: number } {
		const r = this.viewport.getBoundingClientRect();
		const ix = (clientX - r.left - this.tx) / this.scale;
		const iy = (clientY - r.top - this.ty) / this.scale;
		return { x: Math.max(0, Math.min(100, (ix / this.img.naturalWidth) * 100)), y: Math.max(0, Math.min(100, (iy / this.img.naturalHeight) * 100)) };
	}

	private wirePanZoom(): void {
		const vp = this.viewport;
		this.registerDomEvent(vp, 'wheel', (e: WheelEvent) => {
			e.preventDefault();
			const r = vp.getBoundingClientRect();
			this.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
		}, { passive: false });

		// One finger (or a mouse) pans; two fingers pinch-zoom and pan together.
		const pts = new Map<number, { x: number; y: number }>();
		let pan: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;
		let pinch: { dist: number; ix: number; iy: number; scale: number } | null = null;
		let lastTap = { t: 0, x: 0, y: 0 };
		const local = (e: { clientX: number; clientY: number }) => { const r = vp.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
		const two = () => [...pts.values()].slice(0, 2);

		this.registerDomEvent(vp, 'pointerdown', (e: PointerEvent) => {
			// Pins in view mode don't stop this, so a pan or pinch can start on a pin (they're
			// dense on a phone). Capture waits for real movement so a still tap still clicks the pin.
			if (e.button !== 0) return;
			if (this.onBox && pts.size === 0 && e.isPrimary) { this.dragBox(e); return; }
			pts.set(e.pointerId, local(e));
			if (pts.size === 1 && this.penActive()) {
				// One finger (or the mouse) draws; a second finger turns it into a pinch.
				this.stroke = [this.toPercent(e.clientX, e.clientY)];
				try { vp.setPointerCapture(e.pointerId); } catch { /* already lifted */ }
				pan = null;
			} else if (pts.size === 1) {
				pan = { ...local(e), tx: this.tx, ty: this.ty, moved: false };
			} else if (pts.size === 2) {
				if (this.stroke) { this.stroke = null; this.drawPath(); }
				const [a, b] = two();
				const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, ix: (mid.x - this.tx) / this.scale, iy: (mid.y - this.ty) / this.scale, scale: this.scale };
				pan = null;
				for (const id of pts.keys()) { try { vp.setPointerCapture(id); } catch { /* already lifted */ } }
			}
		});
		this.registerDomEvent(vp, 'pointermove', (e: PointerEvent) => {
			if (!pts.has(e.pointerId)) {
				// Hovering: the rubber band from the last point of a route or measurement.
				if (this.path.length && e.pointerType === 'mouse') this.drawPath(this.toolPoint(e));
				return;
			}
			pts.set(e.pointerId, local(e));
			if (this.stroke && pts.size === 1) {
				this.stroke.push(this.toPercent(e.clientX, e.clientY));
				this.drawPath();
				return;
			}
			if (pinch && pts.size >= 2) {
				const [a, b] = two();
				const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				this.scale = Math.max(0.05, Math.min(8, pinch.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist)));
				this.tx = mid.x - pinch.ix * this.scale;
				this.ty = mid.y - pinch.iy * this.scale;
				this.apply();
			} else if (pan) {
				const p = local(e);
				const dx = p.x - pan.x;
				const dy = p.y - pan.y;
				if (!pan.moved && Math.abs(dx) + Math.abs(dy) > 4) {
					pan.moved = true;
					try { vp.setPointerCapture(e.pointerId); } catch { /* already lifted */ }
				}
				if (pan.moved) { this.tx = pan.tx + dx; this.ty = pan.ty + dy; this.apply(); }
			}
		});
		const end = (e: PointerEvent) => {
			if (!pts.has(e.pointerId)) return;
			pts.delete(e.pointerId);
			if (this.stroke) {
				const stroke = this.stroke;
				this.stroke = null;
				if (e.type === 'pointerup' && stroke.length > 1) this.addDrawing({ kind: 'pen', colour: DRAW.colour, width: DRAW.width, points: simplifyStroke(stroke, 0.15, this.aspect) });
				else this.drawPath();
				return;
			}
			if (pinch) {
				if (pts.size < 2) pinch = null;
				pan = null; // don't jump when one finger lifts
				return;
			}
			if (!pan) return;
			const wasTap = !pan.moved;
			pan = null;
			if (!wasTap || e.type === 'pointercancel') return;
			if ((e.target as HTMLElement).closest('.nimble-map-pin, .nimble-map-token')) return;
			if (this.mode === 'add') {
				const pos = this.toPercent(e.clientX, e.clientY);
				new PinModal(this.app, { ...pos, label: '', kind: 'place' }, (pin) => { this.def.pins.push(pin); void this.save(); }).open();
				return;
			}
			if (this.tap(e)) return;
			// Double-tap to zoom in (touch doesn't always fire dblclick).
			if (e.pointerType !== 'mouse') {
				const now = Date.now();
				if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
					const p = local(e);
					this.zoomAt(1.8, p.x, p.y);
					this.quietUntil = Date.now() + 450;
					lastTap = { t: 0, x: 0, y: 0 };
				} else lastTap = { t: now, x: e.clientX, y: e.clientY };
			}
		};
		this.registerDomEvent(vp, 'pointerup', end);
		this.registerDomEvent(vp, 'pointercancel', end);
		this.registerDomEvent(vp, 'keydown', (e: KeyboardEvent) => {
			if (this.mode === 'grid' && this.gridPanel?.key(e)) return;
			if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && this.undoDrawing()) { e.preventDefault(); return; }
			if (e.key === 'Enter' && this.path.length) { e.preventDefault(); this.finishPath(); return; }
			if (e.key === 'Escape' && this.path.length) { this.path = []; this.drawPath(); return; }
			if (e.key === 'Escape' && this.mode !== 'view') { this.gridDraft = null; this.mode = 'view'; this.build(); }
			else if (e.key === 'Escape' && this.expanded) this.setExpanded(false);
			else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey && !this.host.fill) this.setExpanded(!this.expanded);
			else if (e.key === '+' || e.key === '=') this.zoomAt(1.3);
			else if (e.key === '-') this.zoomAt(1 / 1.3);
			else if (e.key === '0') this.fit();
		});
		this.registerDomEvent(vp, 'dblclick', (e: MouseEvent) => {
			if (this.path.length) { this.finishPath(); return; }
			if (this.mode === 'draw' || (e.target as HTMLElement).closest('.nimble-map-pin, .nimble-map-token, .nimble-map-party')) return;
			const p = local(e);
			this.zoomAt(1.6, p.x, p.y);
		});
	}

	// ------------------------------------------------------------------------
	// Party, measuring and drawing

	private modeHint(): string {
		switch (this.mode) {
			case 'add': return 'Click to drop a pin';
			case 'move': return 'Drag pins to move them';
			case 'party': return gridOf(this.def) ? 'Click to place the party. It snaps to a cell; hold Alt to place it anywhere.' : 'Click to place the party';
			case 'measure': return 'Click to add points along the way; double-click or Enter to finish, Escape to clear';
			case 'draw':
				return DRAW.tool === 'pen' ? 'Drag to draw. Two fingers still pan and zoom.'
					: DRAW.tool === 'route' ? 'Click to add points; double-click or Enter to finish'
					: DRAW.tool === 'text' ? 'Click where the label goes'
					: 'Tap a drawing to delete it';
			default: return '';
		}
	}

	private renderDrawBar(): void {
		if (!this.drawBarEl) return;
		renderDrawBar(this.drawBarEl, { ...DRAW, canUndo: !!DRAW_UNDO.get(this.mapKey)?.length }, {
			tool: (t) => { DRAW.tool = t; this.path = []; this.build(); },
			colour: (c) => { DRAW.colour = c; this.renderDrawBar(); },
			width: (w) => { DRAW.width = w; this.renderDrawBar(); },
			undo: () => { this.undoDrawing(); },
		});
	}

	private penActive(): boolean { return this.mode === 'draw' && DRAW.tool === 'pen' && this.editable; }

	/** Where a click lands for the party and measuring: a cell centre on a grid (Alt for anywhere). */
	private toolPoint(e: { clientX: number; clientY: number; altKey?: boolean }): Point {
		const p = this.toPercent(e.clientX, e.clientY);
		const grid = gridOf(this.def);
		return grid && !e.altKey ? snapToCell(grid, this.aspect, p) : p;
	}

	private lastPathTap = { t: 0, x: 0, y: 0 };

	/** A tap on the map in a tool mode. True when it was handled. */
	private tap(e: PointerEvent): boolean {
		if (this.mode === 'party' && this.editable) {
			this.def.party = this.toolPoint(e);
			this.mode = 'view';
			this.build();
			void this.save();
			return true;
		}
		const routing = this.mode === 'draw' && DRAW.tool === 'route' && this.editable;
		if (this.mode === 'measure' || routing) {
			// A second tap in the same spot finishes, like a double-click (touch has no dblclick to rely on).
			const now = Date.now();
			const again = now - this.lastPathTap.t < 350 && Math.hypot(e.clientX - this.lastPathTap.x, e.clientY - this.lastPathTap.y) < 24;
			this.lastPathTap = { t: now, x: e.clientX, y: e.clientY };
			if (again && this.path.length > 1) { this.finishPath(); return true; }
			// A measurement that was finished starts again with the next click.
			if (this.mode === 'measure' && this.measured) { this.path = []; this.measured = false; }
			const p = this.mode === 'measure' ? this.toolPoint(e) : this.toPercent(e.clientX, e.clientY);
			this.path.push(p);
			this.drawPath();
			return true;
		}
		if (this.mode === 'draw' && DRAW.tool === 'text' && this.editable) {
			const at = this.toPercent(e.clientX, e.clientY);
			new NamePrompt(this.app, 'Label on the map', 'e.g. Here be wolves', '', 'Add', (text) => {
				const t = text.trim();
				if (t) this.addDrawing({ kind: 'text', colour: DRAW.colour, width: DRAW.width, points: [at], text: t });
			}).open();
			return true;
		}
		return false;
	}

	/** The measurement on screen is finished (kept until the next click starts a new one). */
	private measured = false;

	private finishPath(): void {
		// The clicks of a double-click add the same point twice.
		const pts = this.path.filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) > 0.05);
		if (this.mode === 'measure') {
			this.path = pts;
			this.measured = true;
			this.drawPath();
			return;
		}
		this.path = [];
		if (pts.length > 1) this.addDrawing({ kind: 'route', colour: DRAW.colour, width: DRAW.width, points: simplifyStroke(pts, 0.01, this.aspect) });
		else this.drawPath();
	}

	/** Draw the live line (pen stroke, route or measurement, plus the rubber band to `hover`) and its distance chip. */
	private drawPath(hover?: Point): void {
		if (!this.live || !this.img?.naturalWidth) return;
		const iw = this.img.naturalWidth;
		const ih = this.img.naturalHeight;
		if (this.stroke) { drawLiveLine(this.live, this.stroke, iw, ih, DRAW.colour, DRAW.width); this.showChip(null); return; }
		const pts = hover && !this.measured ? [...this.path, hover] : this.path;
		const measuring = this.mode === 'measure';
		drawLiveLine(this.live, pts, iw, ih, measuring ? 'accent' : DRAW.colour, measuring ? 2 : DRAW.width, measuring ? 'is-measure' : '');
		const grid = gridOf(this.def);
		if (grid && pts.length > 1) this.showChip(pts[pts.length - 1], distanceLabel(grid.kind, cellsAlong(grid, this.aspect, pts), this.def.scale));
		else this.showChip(null);
	}

	/** The small label for a distance, beside a point on the map (null hides it). */
	private showChip(at: Point | null, text = ''): void {
		if (!this.chip) return;
		this.chip.toggleClass('is-hidden', !at);
		if (!at) return;
		this.chip.style.left = `${at.x}%`;
		this.chip.style.top = `${at.y}%`;
		this.chip.setText(text);
	}

	private addDrawing(d: MapDrawing): void {
		this.pushUndo();
		this.def.drawings.push(d);
		this.showDrawings = true;
		this.drawPath();
		void this.save();
	}

	private pushUndo(): void {
		const stack = DRAW_UNDO.get(this.mapKey) ?? [];
		stack.push(this.def.drawings.map(d => ({ ...d, points: [...d.points] })));
		if (stack.length > UNDO_DEPTH) stack.shift();
		DRAW_UNDO.set(this.mapKey, stack);
	}

	/** Undo the last drawing change of this visit. False when there's nothing to undo. */
	private undoDrawing(): boolean {
		const stack = DRAW_UNDO.get(this.mapKey);
		const prev = stack?.pop();
		if (!prev || !this.editable) return false;
		this.def.drawings = prev;
		void this.save();
		return true;
	}

	private renderDrawings(): void {
		if (!this.stage || !this.img?.naturalWidth) return;
		const erasing = this.mode === 'draw' && DRAW.tool === 'eraser' && this.editable;
		drawDrawingsLayer(this.stage, this.live, this.showDrawings ? this.def.drawings : [], this.img.naturalWidth, this.img.naturalHeight, {
			grid: gridOf(this.def),
			scale: this.def.scale,
			onErase: erasing ? (i) => { this.pushUndo(); this.def.drawings.splice(i, 1); void this.save(); } : undefined,
		});
		this.renderDrawBar();
	}

	private get campaign() { return this.plugin.campaigns.of(this.ctx.sourcePath) ?? this.plugin.campaigns.active; }

	/** The party marker: drag it to travel (snapping to cells, Alt for anywhere); hover or tap for the roster. */
	private renderParty(): void {
		if (!this.partyLayer) return;
		this.partyLayer.querySelector('.nimble-map-party')?.remove();
		const at = this.def.party;
		if (!at) return;
		const el = this.partyLayer.createDiv({ cls: 'nimble-map-party', attr: { role: 'button', tabindex: '0' } });
		el.style.left = `${at.x}%`;
		el.style.top = `${at.y}%`;
		const inner = el.createDiv({ cls: 'nimble-map-party-inner' });
		renderPartyFace(inner, this.plugin, this.campaign);
		el.setAttr('aria-label', inner.getAttr('aria-label') ?? 'The party');

		const roster = () => {
			if (isPopoverOpenFor(el, 'nimble-map-party-pop')) return;
			openPopover(el, (pop) => renderPartyRoster(pop, this.plugin, this.campaign), { width: 280, cls: 'nimble-map-party-pop' });
		};
		let hoverTimer = 0;
		el.addEventListener('mouseenter', () => { hoverTimer = window.setTimeout(roster, 350); });
		el.addEventListener('mouseleave', () => window.clearTimeout(hoverTimer));
		el.addEventListener('keydown', (e) => { if (e.key === 'Enter') roster(); });
		if (this.editable) {
			onLongPress(el, (e) => {
				const menu = new Menu();
				menu.addItem(it => it.setTitle('Remove the party marker').setIcon('trash-2').onClick(() => { delete this.def.party; void this.save(); }));
				menu.showAtMouseEvent(e);
			});
		}

		// Dragging: the path from where the party was, and how far that is.
		let start: { x: number; y: number; at: Point } | null = null;
		let moved = false;
		let to: Point = at;
		el.addEventListener('pointerdown', (e) => {
			if (e.button !== 0) return;
			e.stopPropagation();
			if (!this.editable || this.mode === 'draw' || this.mode === 'grid') return;
			start = { x: e.clientX, y: e.clientY, at };
			moved = false;
			try { el.setPointerCapture(e.pointerId); } catch { /* already lifted */ }
		});
		el.addEventListener('pointermove', (e) => {
			if (!start) return;
			if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) { moved = true; window.clearTimeout(hoverTimer); closePopover(); el.addClass('is-dragging'); }
			if (!moved) return;
			to = this.toolPoint(e);
			el.style.left = `${to.x}%`;
			el.style.top = `${to.y}%`;
			drawLiveLine(this.live, [start.at, to], this.img.naturalWidth, this.img.naturalHeight, 'accent', 2, 'is-measure');
			const grid = gridOf(this.def);
			if (grid) this.showChip(to, distanceLabel(grid.kind, distance(grid, cellAt(grid, this.aspect, start.at), cellAt(grid, this.aspect, to)), this.def.scale));
		});
		const end = (e: PointerEvent) => {
			if (!start) return;
			const from = start.at;
			start = null;
			el.removeClass('is-dragging');
			if (!moved) {
				// A tap or click shows who's in the party.
				if (e.type === 'pointerup') roster();
				return;
			}
			drawLiveLine(this.live, [], 1, 1, 'accent', 2);
			this.showChip(null);
			if (e.type !== 'pointerup') { el.style.left = `${from.x}%`; el.style.top = `${from.y}%`; return; }
			this.def.party = to;
			const grid = gridOf(this.def);
			const cells = grid ? distance(grid, cellAt(grid, this.aspect, from), cellAt(grid, this.aspect, to)) : 0;
			void this.save();
			this.partyMoved(from, to, cells);
		};
		el.addEventListener('pointerup', end);
		el.addEventListener('pointercancel', end);
	}

	/** After the party has been dragged across `cells` cells (travel and the clock hook in here). */
	/**
	 * The party was dragged across `cells` cells. With `travel:` on the map and a
	 * campaign to keep time for, offer to move the clock on (or do it, with the
	 * setting on). Never silently: an automatic move still says so.
	 */
	private partyMoved(_from: Point, _to: Point, cells: number): void {
		const per = parseAmount(this.def.travel);
		const grid = gridOf(this.def);
		const c = this.campaign;
		if (!per || !grid || !cells || !c) return;
		const n = Math.round(per.n * cells * 100) / 100;
		const unit = per.unit || 'day';
		const words = `${n} ${n === 1 ? unit.replace(/s$/i, '') : /s$/i.test(unit) ? unit : `${unit}s`}`;
		const dist = distanceLabel(grid.kind, cells, this.def.scale);
		const offer = { jump: `${n} ${unit}`, text: `Advance the clock ${words}?`, label: `travelled ${dist}`, at: Date.now() };
		if (this.plugin.settings.travelAdvancesClock) { void this.advanceForTravel(offer, true); return; }
		PENDING_TRAVEL.set(this.mapKey, offer);
		this.renderTravelBar();
	}

	private async advanceForTravel(offer: { jump: string; text: string; label: string }, auto: boolean): Promise<void> {
		const c = this.campaign;
		PENDING_TRAVEL.delete(this.mapKey);
		this.renderTravelBar();
		if (!c) return;
		const ok = await this.plugin.clock.advance(c, offer.jump, `+${offer.jump}, ${offer.label}`);
		if (!ok) new Notice(`The campaign's calendar doesn't understand "${offer.jump}". Check the map's travel: line.`);
		else if (auto) new Notice(`The clock moved on ${offer.jump} (${offer.label}). Undo it from the clock's +.`);
	}

	/** The bar under the map offering to advance the clock after travel. */
	private renderTravelBar(): void {
		const root = this.containerEl;
		root.querySelector(':scope > .nimble-map-travelbar')?.remove();
		const offer = PENDING_TRAVEL.get(this.mapKey);
		if (!offer || Date.now() - offer.at > TRAVEL_OFFER_MS) { PENDING_TRAVEL.delete(this.mapKey); return; }
		const bar = root.createDiv({ cls: 'nimble-map-travelbar', attr: { role: 'status' } });
		setIcon(bar.createSpan({ cls: 'nimble-map-travelbar-icon' }), 'calendar-clock');
		const text = bar.createSpan({ cls: 'nimble-map-travelbar-text' });
		text.createEl('strong', { text: offer.text });
		text.appendText(` (${offer.label.replace(/^travelled /, '')})`);
		const go = bar.createEl('button', { cls: 'nimble-map-btn mod-cta', text: 'Advance' });
		go.onclick = () => void this.advanceForTravel(offer, false);
		const no = bar.createEl('button', { cls: 'nimble-map-btn', text: 'Not now' });
		no.onclick = () => { PENDING_TRAVEL.delete(this.mapKey); this.renderTravelBar(); };
	}

	/** Open a pin's link: a map pin in a map tab stays in the tab; anything else opens like a link. */
	private openPin(pin: MapPin, newLeaf: boolean): void {
		if (!pin.link) return;
		if (pin.kind === 'map' && this.host.openMap?.(pin.link, newLeaf)) return;
		void this.app.workspace.openLinkText(pin.link, this.ctx.sourcePath, newLeaf);
	}

	/** Open this block in a map tab (the same map, filling a pane, saving into this note). */
	private async openInTab(split: boolean): Promise<void> {
		const text = await this.app.vault.cachedRead(this.app.vault.getFileByPath(this.ctx.sourcePath)!);
		const want = mapFencesIn(text.split('\n')).findIndex(f => f.body === this.source.split(/\r?\n/).map(l => l.trim()).join('\n').replace(/\n+$/, ''));
		const leaf = this.app.workspace.getLeaf(split ? 'split' : 'tab');
		await leaf.setViewState({ type: MAP_VIEW_TYPE, state: { file: this.ctx.sourcePath, index: Math.max(0, want), image: this.def.image }, active: true });
	}

	/** Fit to 3 × 3: draw a box from where the pointer went down to where it comes up. */
	private dragBox(e: PointerEvent): void {
		const vp = this.viewport;
		const start = this.toPercent(e.clientX, e.clientY);
		const box = this.stage.querySelector<HTMLElement>('.nimble-map-fitbox') ?? this.stage.createDiv({ cls: 'nimble-map-fitbox' });
		const rect = (p: { x: number; y: number }) => ({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) });
		const draw = (r: { x: number; y: number; w: number; h: number }) => {
			box.style.left = `${r.x}%`;
			box.style.top = `${r.y}%`;
			box.style.width = `${r.w}%`;
			box.style.height = `${r.h}%`;
		};
		draw(rect(start));
		try { vp.setPointerCapture(e.pointerId); } catch { /* already lifted */ }
		const move = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) draw(rect(this.toPercent(ev.clientX, ev.clientY))); };
		const up = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			vp.removeEventListener('pointermove', move);
			vp.removeEventListener('pointerup', up);
			vp.removeEventListener('pointercancel', up);
			const r = rect(this.toPercent(ev.clientX, ev.clientY));
			const big = (r.w / 100) * this.img.naturalWidth > 12 && (r.h / 100) * this.img.naturalHeight > 6;
			if (ev.type === 'pointerup' && big && this.onBox) this.onBox(r);
			else box.remove();
		};
		vp.addEventListener('pointermove', move);
		vp.addEventListener('pointerup', up);
		vp.addEventListener('pointercancel', up);
	}

	// ------------------------------------------------------------------------
	// Pins

	private renderPins(): void {
		this.pinLayer.empty();
		this.def.pins.forEach((pin, i) => {
			const el = this.pinLayer.createDiv({ cls: `nimble-map-pin kind-${pin.kind}`, attr: { role: 'button', tabindex: '0', 'aria-label': pin.label } });
			el.style.left = `${pin.x}%`;
			el.style.top = `${pin.y}%`;
			const inner = el.createDiv({ cls: 'nimble-map-pin-inner' });
			setIcon(inner.createDiv({ cls: 'nimble-map-pin-icon' }), PIN_ICON[pin.kind]);
			// Zoomed out, labels shrink to their key ("N5") so a busy map stays readable.
			const lab = inner.createDiv({ cls: 'nimble-map-pin-label' });
			const key = /^([A-Za-z]{0,2}\d+[a-z]?)(?=[\s.:)\-–]|$)/.exec(pin.label.trim())?.[1];
			lab.createSpan({ cls: 'pin-label-full', text: pin.label });
			if (key) { lab.createSpan({ cls: 'pin-label-short', text: key }); el.addClass('has-key'); }
			if (!pin.link) el.addClass('is-unlinked');

			el.addEventListener('mouseover', (event) => {
				if (!pin.link || this.mode === 'move') return;
				this.app.workspace.trigger('hover-link', { event, source: 'nimble-gm', hoverParent: this, targetEl: el, linktext: pin.link, sourcePath: this.ctx.sourcePath });
			});
			el.addEventListener('click', (e) => {
				if (this.mode === 'move' || el.dataset.dragged || Date.now() < this.quietUntil) { delete el.dataset.dragged; return; }
				e.preventDefault();
				e.stopPropagation();
				// Touch has no hover preview, so a tap shows the pin's card first.
				if (isTouch()) this.pinCard(el, i);
				else if (pin.link) this.openPin(pin, e.metaKey || e.ctrlKey);
				else this.editPin(i);
			});
			el.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' && pin.link) this.openPin(pin, e.metaKey || e.ctrlKey);
				else if (e.key === 'Enter' || e.key === 'F2') this.editPin(i);
			});
			onLongPress(el, (e) => {
				if (this.mode === 'move') return;
				const menu = new Menu();
				if (pin.link) menu.addItem(it => it.setTitle('Open note').setIcon('file-symlink').onClick(() => void this.app.workspace.openLinkText(pin.link!, this.ctx.sourcePath, false)));
				if (this.canSave()) {
					menu.addItem(it => it.setTitle('Edit pin…').setIcon('pencil').onClick(() => this.editPin(i)));
					menu.addItem(it => it.setTitle('Delete pin').setIcon('trash-2').onClick(() => { this.def.pins.splice(i, 1); void this.save(); }));
				} else if (!pin.link) return;
				menu.showAtMouseEvent(e);
			});
			this.draggable(el, (x, y) => { pin.x = x; pin.y = y; void this.save(); }, () => this.mode === 'move');
		});
	}

	/** Touch: a small card for a pin (open, edit, delete) instead of a hover preview. */
	private pinCard(el: HTMLElement, i: number): void {
		const pin = this.def.pins[i];
		if (isPopoverOpenFor(el)) { closePopover(); return; }
		openPopover(el, (pop, close) => {
			pop.addClass('nimble-pin-card');
			pop.createDiv({ cls: 'popover-title', text: pin.label });
			if (pin.link) pop.createDiv({ cls: 'popover-body', text: pin.link.replace('#', ' › ') });
			const row = pop.createDiv({ cls: 'pin-card-actions' });
			if (pin.link) {
				const open = row.createEl('button', { cls: 'mod-cta', text: pin.kind === 'map' ? 'Open map' : 'Open note' });
				open.onclick = () => { close(); this.openPin(pin, false); };
			}
			if (!this.canSave()) return;
			const edit = row.createEl('button', { text: 'Edit' });
			edit.onclick = () => { close(); this.editPin(i); };
			const del = row.createEl('button', { cls: 'mod-warning', text: 'Delete' });
			del.onclick = async () => {
				close();
				if (await confirmAction(this.app, `Delete "${pin.label}"?`, 'The pin is removed from this map block.', 'Delete', true)) { this.def.pins.splice(i, 1); void this.save(); }
			};
		}, { width: 260 });
	}

	private editPin(i: number): void {
		const pin = this.def.pins[i];
		if (!pin || !this.canSave()) return;
		new PinModal(this.app, { ...pin }, (next) => { this.def.pins[i] = next; void this.save(); }, () => { this.def.pins.splice(i, 1); void this.save(); }).open();
	}

	/** Drag an element across the stage; `onDrop` gets percent coordinates. */
	private draggable(el: HTMLElement, onDrop: (x: number, y: number) => void, enabled: () => boolean): void {
		let start: { x: number; y: number } | null = null;
		let moved = false;
		el.addEventListener('pointerdown', (e) => {
			if (!enabled() || e.button !== 0) return;
			e.stopPropagation();
			start = { x: e.clientX, y: e.clientY };
			moved = false;
			el.setPointerCapture(e.pointerId);
			el.addClass('is-dragging');
		});
		el.addEventListener('pointermove', (e) => {
			if (!start) return;
			if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 3) moved = true;
			if (!moved) return;
			const p = this.toPercent(e.clientX, e.clientY);
			el.style.left = `${p.x}%`;
			el.style.top = `${p.y}%`;
		});
		el.addEventListener('pointerup', (e) => {
			if (!start) return;
			start = null;
			el.removeClass('is-dragging');
			if (moved) {
				el.dataset.dragged = '1';
				const p = this.toPercent(e.clientX, e.clientY);
				onDrop(p.x, p.y);
			}
		});
	}

	/** Write the pins back into the note's code block. */
	private async save(): Promise<void> {
		this.remember();
		this.carry();
		this.renderPins();
		this.renderDrawings();
		this.renderParty();
		const info = this.ctx.getSectionInfo(this.containerEl);
		const file = this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
		const next = mapBlockSource(this.def);
		let ok = false;
		if (info && file instanceof TFile) {
			try {
				await this.app.vault.process(file, (text) => {
					// In a callout or a list the section is the whole callout or list: only
					// this block's own lines are replaced, and only if its fence is still there.
					const out = replaceMapBlock(text, info.lineStart, info.lineEnd, this.source, next);
					if (out === null) return text;
					ok = true;
					this.source = next;
					return out;
				});
			} catch (e) {
				console.error('Ember Vault: map save failed', e);
			}
		}
		if (ok) return;
		new Notice('Could not save the map: block not found in the note.');
		// Back to what the note says, so no pin is left on screen that was never saved.
		this.def = parseMapBlock(this.source);
		this.renderPins();
		this.renderDrawings();
		this.renderParty();
	}

	// ------------------------------------------------------------------------
	// Encounter tokens (positions live in plugin data, not the note)

	private tokenPositions(): Record<string, { x: number; y: number }> {
		const all = (this.plugin.settings.mapTokens ||= {});
		return (all[this.mapKey] ||= {});
	}

	private renderTokens(): void {
		if (!this.tokenLayer) return;
		this.tokenLayer.empty();
		this.tray.empty();
		this.tray.toggle(this.showTokens);
		if (!this.showTokens) return;
		const enc = this.plugin.encounters.active;
		if (!enc || !enc.creatures.length) {
			this.tray.createDiv({ cls: 'nimble-map-tray-empty', text: 'No encounter running' });
			return;
		}
		const positions = this.tokenPositions();
		this.tray.createDiv({ cls: 'nimble-map-tray-title', text: `${enc.name}: drag onto the map` });
		for (const c of enc.creatures) {
			const pos = positions[c.id];
			if (pos) this.placeToken(c, pos);
			else this.trayToken(c);
		}
	}

	private tokenEl(parent: HTMLElement, c: EncounterCreature): HTMLElement {
		const role = isHero(c) ? 'hero' : monsterRole(c.monster);
		const el = parent.createDiv({ cls: `nimble-map-token role-${role}`, attr: { title: this.tokenTitle(c) } });
		if (c.done) el.addClass('is-done');
		if (isDown(c)) el.addClass('is-down');
		const initials = c.label.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+|-/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase();
		el.createSpan({ cls: 'nimble-map-token-text', text: isMinionGroup(c) ? `${c.alive}` : initials || '?' });
		if (!isHero(c)) this.plugin.hover.attach(el, { name: c.monster.name, filePath: c.sourceFile || '', monster: c.monster, bundled: !c.sourceFile && !!c.monster.bundledId });
		return el;
	}

	private tokenTitle(c: EncounterCreature): string {
		if (isMinionGroup(c)) return `${c.label}: ${c.alive}/${c.count} standing`;
		return `${c.label}: ${c.currentHp}/${c.maxHp} HP${c.conditions.length ? ` · ${c.conditions.map(x => x.name).join(', ')}` : ''}`;
	}

	private placeToken(c: EncounterCreature, pos: { x: number; y: number }): void {
		const el = this.tokenEl(this.tokenLayer, c);
		el.style.left = `${pos.x}%`;
		el.style.top = `${pos.y}%`;
		this.draggable(el, (x, y) => this.setTokenPos(c.id, { x, y }), () => true);
		onLongPress(el, (e) => {
			const menu = new Menu();
			menu.addItem(it => it.setTitle('Back to tray').setIcon('undo-2').onClick(() => this.setTokenPos(c.id, null)));
			menu.showAtMouseEvent(e);
		});
		el.addEventListener('click', (e) => {
			if (el.dataset.dragged) { delete el.dataset.dragged; return; }
			if (!isTouch()) return;
			e.stopPropagation();
			openPopover(el, (pop) => {
				pop.createDiv({ cls: 'popover-title', text: c.label });
				pop.createDiv({ cls: 'popover-body', text: this.tokenTitle(c) });
				const open = pop.createEl('button', { cls: 'mod-cta', text: 'Show tracker' });
				open.onclick = () => { closePopover(); void this.plugin.activateEncounterView(true); };
			}, { width: 240 });
		});
	}

	private trayToken(c: EncounterCreature): void {
		const el = this.tokenEl(this.tray, c);
		el.addClass('in-tray');
		el.createSpan({ cls: 'nimble-map-token-name', text: c.label });
		// Drag from the tray onto the map.
		el.addEventListener('pointerdown', (e) => {
			if (e.button !== 0) return;
			e.preventDefault();
			const doc = el.doc;
			const win = doc.defaultView ?? window;
			const ghost = doc.body.createDiv({ cls: 'nimble-map-token-ghost', text: c.label });
			// Keep the drag ours on touch, where the browser would otherwise scroll and cancel it.
			try { el.setPointerCapture(e.pointerId); } catch { /* already lifted */ }
			const move = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; } };
			const stop = () => {
				el.removeEventListener('pointermove', move);
				el.removeEventListener('pointerup', up);
				el.removeEventListener('pointercancel', cancel);
				win.removeEventListener('blur', stop);
				ghost.remove();
			};
			const cancel = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) stop(); };
			const up = (ev: PointerEvent) => {
				if (ev.pointerId !== e.pointerId) return;
				stop();
				const r = this.viewport.getBoundingClientRect();
				if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
					this.setTokenPos(c.id, this.toPercent(ev.clientX, ev.clientY));
				}
			};
			move(e);
			// The token has the pointer captured, so every move and the drop come to it (and the map
			// keeps touch pointer events to itself: see onload).
			el.addEventListener('pointermove', move);
			el.addEventListener('pointerup', up);
			el.addEventListener('pointercancel', cancel);
			win.addEventListener('blur', stop);
		});
	}

	private setTokenPos(id: string, pos: { x: number; y: number } | null): void {
		const positions = this.tokenPositions();
		if (pos) positions[id] = pos;
		else delete positions[id];
		void this.plugin.saveSettings();
		this.renderTokens();
	}
}

// ----------------------------------------------------------------------------

class PinModal extends Modal {
	constructor(app: App, private pin: MapPin, private onSave: (pin: MapPin) => void, private onDelete?: () => void) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.onDelete ? 'Edit pin' : 'New pin');
		const c = this.contentEl;
		let labelInput: HTMLInputElement | null = null;
		new Setting(c).setName('Label').addText(t => {
			labelInput = t.inputEl;
			t.setValue(this.pin.label).setPlaceholder('e.g. 3. Kennel').onChange(v => { this.pin.label = v; });
			t.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submit(); });
		});
		let linkInput: HTMLInputElement | null = null;
		let kindDropdown: DropdownComponent | null = null;
		new Setting(c).setName('Links to').setDesc('A note, a heading in one (Part 1#3. Kennel), or another map')
			.addText(t => {
				linkInput = t.inputEl;
				t.setValue(this.pin.link ?? '').setPlaceholder('Note name#Heading').onChange(v => { this.pin.link = v.replace(/^\[\[|\]\]$/g, '').trim() || undefined; });
			})
			.addButton(b => b.setButtonText('Pick…').onClick(async () => {
				const maps = await mapNotePaths(this.app);
				new NoteSuggest(this.app, maps, (item) => {
					this.pin.link = item.text;
					if (linkInput) linkInput.value = item.text;
					if (!this.pin.label && labelInput) { this.pin.label = item.text.split('#').pop()!.split('/').pop()!; labelInput.value = this.pin.label; }
					// A pin to a map note is a map pin: it drills down into that map.
					if (item.isMap) { this.pin.kind = 'map'; kindDropdown?.setValue('map'); }
				}).open();
			}));
		new Setting(c).setName('Kind').addDropdown(d => {
			kindDropdown = d;
			for (const k of PIN_KINDS) d.addOption(k, k[0].toUpperCase() + k.slice(1));
			d.setValue(this.pin.kind).onChange(v => { this.pin.kind = v as PinKind; });
		});
		const s = new Setting(c);
		if (this.onDelete) s.addButton(b => setWarningButton(b.setButtonText('Delete')).onClick(() => { this.onDelete!(); this.close(); }));
		s.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()));
		s.addButton(b => b.setButtonText('Save').setCta().onClick(() => this.submit()));
		window.setTimeout(() => labelInput?.focus(), 0);
	}

	private submit(): void {
		if (!this.pin.label.trim()) this.pin.label = this.pin.link?.split('#').pop() || 'Pin';
		this.onSave(this.pin);
		this.close();
	}

	onClose(): void { this.contentEl.empty(); }
}

/** Is this note a map: `nimble: map` in its frontmatter? (Notes that only hold a block are found by `mapNotePaths`.) */
export function isMapNoteByFrontmatter(app: App, file: TFile): boolean {
	const kind: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.nimble;
	return typeof kind === 'string' && kind.trim().toLowerCase() === 'map';
}

/** Paths of every map note: `nimble: map` in the frontmatter, or a ```nimble-map block in the text. */
export async function mapNotePaths(app: App): Promise<Set<string>> {
	const out = new Set<string>();
	await Promise.all(app.vault.getMarkdownFiles().map(async (f) => {
		if (isMapNoteByFrontmatter(app, f)) { out.add(f.path); return; }
		// Only notes with a code block can hold a map; read just those (cachedRead is cheap after the first time).
		if (!app.metadataCache.getFileCache(f)?.sections?.some(s => s.type === 'code')) return;
		if (/^[ \t>]*(?:[-*+][ \t]+)?(?:`{3,}|~{3,})[ \t]*nimble-map\b/m.test(await app.vault.cachedRead(f))) out.add(f.path);
	}));
	return out;
}

interface NoteItem { text: string; isMap: boolean }

/** Notes and their headings, to link a pin to. Map notes come first, with a map icon. */
class NoteSuggest extends FuzzySuggestModal<NoteItem> {
	constructor(app: App, private maps: Set<string>, private choose: (item: NoteItem) => void) {
		super(app);
		this.setPlaceholder('Link the pin to a note, a heading or a map…');
	}

	getItems(): NoteItem[] {
		const maps: NoteItem[] = [];
		const rest: NoteItem[] = [];
		for (const f of this.app.vault.getMarkdownFiles()) {
			const isMap = this.maps.has(f.path);
			(isMap ? maps : rest).push({ text: f.basename, isMap });
			for (const h of this.app.metadataCache.getFileCache(f)?.headings ?? []) rest.push({ text: `${f.basename}#${h.heading}`, isMap: false });
		}
		return [...maps, ...rest];
	}

	getSuggestions(query: string): FuzzyMatch<NoteItem>[] {
		// Matching map notes before everything else, best match first within each group.
		const all = super.getSuggestions(query);
		return [...all.filter(m => m.item.isMap), ...all.filter(m => !m.item.isMap)];
	}

	renderSuggestion(match: FuzzyMatch<NoteItem>, el: HTMLElement): void {
		el.addClass('nimble-note-suggest');
		if (match.item.isMap) setIcon(el.createSpan({ cls: 'nimble-note-suggest-icon' }), 'map');
		super.renderSuggestion(match, el.createSpan({ cls: 'nimble-note-suggest-text' }));
	}

	getItemText(item: NoteItem): string { return item.text; }
	onChooseItem(item: NoteItem): void { this.choose(item); }
}
