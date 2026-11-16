// Grids on maps: the SVG grid layer, the Grid sizing panel, and reading the
// map's pixels for detection. The maths is in grid-def.ts and the detector in
// grid-detect.ts (both pure); this is the Obsidian side.

import { App, requestUrl, setIcon, TFile } from 'obsidian';
import { cellAt, cellSize, centreOf, geometry, GridSpec, normaliseOffset, patternTile, regularHeight } from './grid-def';
import { detectGridSteps, DetectHint, DetectResult, GOOD_MATCH, GrayImage } from './grid-detect';
import type { GridKind, MapDef, Point } from './map-def';
import { slideThumb } from './segmented';

/** The grid being set up in the panel: what Save writes. */
export interface GridDraft {
	kind: GridKind;
	cell: { w: number; h?: number };
	offset: Point;
	showGrid: boolean;
	scale: string;
}

/** The grid a map block describes, or null when it has none. */
export function gridOf(def: MapDef): GridSpec | null {
	if (!def.grid || def.grid.kind === 'none') return null;
	return { kind: def.grid.kind, cell: def.cell, offset: def.offset, cols: def.grid.cols, rows: def.grid.rows };
}

let gridIds = 0;

/**
 * Draw (or remove) the grid lines over the image: one SVG the size of the image
 * in pixels, filled with a <pattern> of one tile. Lines stay hairline at any zoom.
 */
export function drawGridLayer(stage: HTMLElement, before: Element | null, spec: GridSpec | null, iw: number, ih: number, draft: boolean): void {
	stage.querySelector(':scope > .nimble-map-gridlines')?.remove();
	if (!spec || spec.kind === 'none' || !iw || !ih) return;
	const tile = patternTile(spec, iw, ih);
	if (!tile) return;
	const svg = stage.createSvg('svg', { cls: ['nimble-map-gridlines', ...(draft ? ['is-draft'] : [])], attr: { viewBox: `0 0 ${iw} ${ih}`, width: iw, height: ih, 'aria-hidden': 'true' } });
	if (before?.parentElement === stage) stage.insertBefore(svg, before);
	const id = `nimble-map-grid-${++gridIds}`;
	const pattern = svg.createSvg('defs').createSvg('pattern', { attr: { id, patternUnits: 'userSpaceOnUse', x: tile.x, y: tile.y, width: tile.width, height: tile.height } });
	pattern.createSvg('path', { cls: 'nimble-map-gridline', attr: { d: tile.d } });
	svg.createSvg('rect', { attr: { x: 0, y: 0, width: iw, height: ih, fill: `url(#${id})` } });
}

/** The draft the panel starts from: the block's grid with every default filled in. */
export function draftFrom(def: MapDef, aspect: number): GridDraft {
	const kind = def.grid?.kind ?? 'none';
	const spec: GridSpec = { kind: kind === 'none' ? 'square' : kind, cell: def.cell, offset: def.offset, cols: def.grid?.cols, rows: def.grid?.rows };
	const size = cellSize(spec, aspect);
	const g = geometry(spec, aspect)!;
	const cell: { w: number; h?: number } = { w: size.w };
	if (Math.abs(size.h - regularHeight(spec.kind, size.w)) > size.w * 0.005) cell.h = size.h;
	return { kind, cell, offset: { x: g.ou, y: g.ov * aspect }, showGrid: def.showGrid !== false, scale: def.scale ?? '' };
}

export function specOf(d: GridDraft): GridSpec {
	return { kind: d.kind, cell: d.cell, offset: d.offset };
}

/** Write a finished draft into the block's definition. */
export function applyDraft(def: MapDef, d: GridDraft, aspect: number): void {
	def.grid = { kind: d.kind };
	if (d.kind !== 'none') {
		def.cell = { w: d.cell.w };
		if (d.cell.h && Math.abs(d.cell.h - regularHeight(d.kind, d.cell.w)) > d.cell.w * 0.005) def.cell.h = d.cell.h;
		def.offset = normaliseOffset(specOf(d), aspect);
	}
	if (d.showGrid) delete def.showGrid;
	else def.showGrid = false;
	const scale = d.scale.trim();
	if (scale) def.scale = scale;
	else delete def.scale;
}

/** Resize the cells while keeping the cell at `anchor` (% of the image) where it is. */
export function resizeAround(d: GridDraft, aspect: number, factor: number, anchor: Point): GridDraft {
	if (d.kind === 'none') return d;
	const spec = specOf(d);
	const c = cellAt(spec, aspect, anchor);
	const keep = centreOf(spec, aspect, c);
	const size = cellSize(spec, aspect);
	const cell: { w: number; h?: number } = { w: size.w * factor };
	if (d.cell.h) cell.h = size.h * factor;
	const zero = centreOf({ kind: d.kind, cell, offset: { x: 0, y: 0 } }, aspect, c);
	return { ...d, cell, offset: { x: keep.x - zero.x, y: keep.y - zero.y } };
}

/**
 * The grid a box dragged over 3 × 3 cells gives (box in % of the image):
 * squares 3 across and 3 down, pointy hexes 3 in a row, flat hexes 3 in a column.
 * Returns the draft's cell and offset, and the same as a detection hint in pixels.
 */
export function gridFromBox(kind: GridKind, box: { x: number; y: number; w: number; h: number }, iw: number, ih: number): { cell: { w: number; h?: number }; offset: Point; hint: DetectHint } {
	const bw = (box.w / 100) * iw; // pixels
	const bh = (box.h / 100) * ih;
	const x0 = (box.x / 100) * iw;
	const y0 = (box.y / 100) * ih;
	let w: number;
	let h: number;
	if (kind === 'hex') {
		w = bw / 3;
		// The row's height is one hex point to point; a box that's clearly off keeps the hex regular.
		h = bh > 0 && Math.abs(bh / regularHeight('hex', w) - 1) < 0.25 ? bh : regularHeight('hex', w);
	} else if (kind === 'hex-flat') {
		h = bh / 3;
		w = bw > 0 && Math.abs(bw / ((2 * h) / Math.sqrt(3)) - 1) < 0.25 ? bw : (2 * h) / Math.sqrt(3);
	} else {
		w = bw / 3;
		h = bh / 3;
	}
	const cx = kind === 'hex-flat' ? x0 + bw / 2 : x0 + w / 2;
	const cy = kind === 'hex' ? y0 + bh / 2 : y0 + h / 2;
	const cell: { w: number; h?: number } = { w: (w / iw) * 100 };
	const reg = regularHeight(kind, w);
	if (Math.abs(h - reg) > w * 0.02) cell.h = (h / iw) * 100;
	return { cell, offset: { x: (cx / iw) * 100, y: (cy / ih) * 100 }, hint: { w, h, x: cx, y: cy } };
}

/** A detection result (pixels of the image) as the draft's cell and offset. */
export function draftFromDetection(kind: GridKind, r: DetectResult, iw: number, ih: number): { cell: { w: number; h?: number }; offset: Point } {
	const cell: { w: number; h?: number } = { w: (r.w / iw) * 100 };
	if (Math.abs(r.h - regularHeight(kind, r.w)) > r.w * 0.01) cell.h = (r.h / iw) * 100;
	return { cell, offset: { x: (r.x / iw) * 100, y: (r.y / ih) * 100 } };
}

// ----------------------------------------------------------------------------
// Pixels

/**
 * The map image as grayscale, at most `maxSide` pixels on its long side.
 * Vault images are read as bytes and decoded with createImageBitmap: drawing the
 * app:// resource into a canvas would taint it and getImageData would throw.
 */
export async function readGray(app: App, image: string, sourcePath: string, maxSide = 2048): Promise<{ img: GrayImage; scale: number } | null> {
	let bytes: ArrayBuffer;
	if (/^https?:\/\//i.test(image)) {
		bytes = (await requestUrl({ url: image })).arrayBuffer;
	} else {
		const file = app.metadataCache.getFirstLinkpathDest(image, sourcePath);
		if (!(file instanceof TFile)) return null;
		bytes = await app.vault.readBinary(file);
	}
	const bmp = await createImageBitmap(new Blob([bytes]));
	try {
		const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
		const w = Math.max(1, Math.round(bmp.width * k));
		const h = Math.max(1, Math.round(bmp.height * k));
		const canvas = activeDocument.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(bmp, 0, 0, w, h);
		const rgba = ctx.getImageData(0, 0, w, h).data;
		const data = new Float32Array(w * h);
		for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
		return { img: { data, width: w, height: h }, scale: bmp.width / w };
	} finally {
		bmp.close();
	}
}

/** Run a generator a few milliseconds at a time, giving the app the rest, so a big map never freezes Obsidian. */
export async function runInChunks<T>(steps: Generator<void, T, void>, budgetMs = 12): Promise<T> {
	for (;;) {
		const t0 = performance.now();
		let r = steps.next();
		while (!r.done && performance.now() - t0 < budgetMs) r = steps.next();
		if (r.done) return r.value;
		await new Promise<void>(res => window.setTimeout(res, 0));
	}
}

/** Detect the grid printed on a map. Results are in the image's own pixels. */
export async function detectOnImage(app: App, image: string, sourcePath: string, kind: Exclude<GridKind, 'none'>, hint?: DetectHint): Promise<DetectResult | null> {
	const px = await readGray(app, image, sourcePath);
	if (!px) return null;
	const k = px.scale;
	const scaled = hint ? { w: hint.w / k, h: hint.h !== undefined ? hint.h / k : undefined, x: hint.x / k, y: hint.y / k } : undefined;
	const r = await runInChunks(detectGridSteps(px.img, { kind, hint: scaled }));
	return r ? { w: r.w * k, h: r.h * k, x: r.x * k, y: r.y * k, confidence: r.confidence } : null;
}

// ----------------------------------------------------------------------------
// The Grid panel

export interface GridPanelHost {
	/** The image's natural size in pixels. */
	size(): { w: number; h: number };
	/** The point at the middle of the viewport, in % of the image (resizing keeps that cell still). */
	viewCentre(): Point;
	/** Redraw the overlay for the draft. */
	preview(d: GridDraft): void;
	/** Start (or stop, with null) the "drag a box over 3 × 3 cells" mode. */
	boxMode(onBox: ((box: { x: number; y: number; w: number; h: number }) => void) | null): void;
	/** Detect on the map image; null when there's no grid to find or the image can't be read. */
	detect(kind: Exclude<GridKind, 'none'>, hint?: DetectHint): Promise<DetectResult | null>;
	/** Can this map's pixels be read at all? */
	canDetect: boolean;
	save(d: GridDraft): void;
	cancel(): void;
}

const KIND_LABELS: [GridKind, string][] = [['none', 'None'], ['square', 'Square'], ['hex', 'Hex'], ['hex-flat', 'Hex (flat)']];
const BOX_HINT: Record<GridKind, string> = {
	none: '',
	square: 'Drag a box around 3 × 3 squares of the map\'s own grid.',
	hex: 'Drag a box around 3 hexes in a row, point to point.',
	'hex-flat': 'Drag a box around 3 hexes in a column, point to point.',
};

/** The panel under the map's toolbar: type, Detect, Fit to 3 × 3, nudge, show grid, scale, Save/Cancel. */
export class GridPanel {
	private status: { text: string; cls?: string } = { text: '' };
	private boxing = false;
	private busy = false;

	constructor(private el: HTMLElement, private draft: GridDraft, private host: GridPanelHost) {
		el.addClass('nimble-map-gridpanel');
		this.render();
		host.preview(draft);
	}

	get current(): GridDraft { return this.draft; }

	private set(next: Partial<GridDraft>): void {
		this.draft = { ...this.draft, ...next };
		this.host.preview(this.draft);
	}

	render(): void {
		const el = this.el;
		el.empty();
		const d = this.draft;

		const typeRow = el.createDiv({ cls: 'nimble-map-gridpanel-row' });
		typeRow.createSpan({ cls: 'nimble-map-gridpanel-label', text: 'Type' });
		const seg = typeRow.createDiv({ cls: 'nimble-map-segs', attr: { role: 'radiogroup', 'aria-label': 'Grid type' } });
		KIND_LABELS.forEach(([kind, label]) => {
			const b = seg.createEl('button', { cls: `nimble-map-seg${d.kind === kind ? ' is-active' : ''}`, attr: { role: 'radio', 'aria-checked': String(d.kind === kind), 'data-kind': kind } });
			b.createSpan({ text: label });
			b.onclick = () => this.pickKind(kind);
		});
		slideThumb(seg, KIND_LABELS.findIndex(([k]) => k === d.kind), KIND_LABELS.length);
		if (d.kind === 'none') { this.footer(); return; }

		const find = el.createDiv({ cls: 'nimble-map-gridpanel-row' });
		if (this.host.canDetect) {
			const detect = find.createEl('button', { cls: 'nimble-map-btn mod-cta', attr: { 'aria-label': 'Detect the grid on the map' } });
			setIcon(detect.createSpan(), 'scan-search');
			detect.createSpan({ text: 'Detect' });
			detect.disabled = this.busy;
			detect.onclick = () => void this.detect();
		}
		const fit = find.createEl('button', { cls: `nimble-map-btn${this.boxing ? ' is-active' : ''}`, attr: { 'aria-label': 'Fit to 3 × 3 cells', 'aria-pressed': String(this.boxing) } });
		setIcon(fit.createSpan(), 'scan');
		fit.createSpan({ text: 'Fit to 3 × 3' });
		fit.disabled = this.busy;
		fit.onclick = () => this.toggleBox();
		const status = find.createSpan({ cls: `nimble-map-gridpanel-status ${this.status.cls ?? ''}`, text: this.boxing ? BOX_HINT[d.kind] : this.status.text });
		status.setAttr('aria-live', 'polite');

		const nudge = el.createDiv({ cls: 'nimble-map-gridpanel-row' });
		nudge.createSpan({ cls: 'nimble-map-gridpanel-label', text: 'Size' });
		const size = nudge.createDiv({ cls: 'nimble-map-stepper' });
		const step = (icon: string, label: string, f: number, fine: number) => {
			const b = size.createEl('button', { cls: 'nimble-map-btn nimble-map-icon-btn', attr: { 'aria-label': `${label} (Shift for a fine step)` } });
			setIcon(b, icon);
			b.onclick = (e) => this.resize(e.shiftKey ? fine : f);
		};
		step('minus', 'Smaller cells', 1 / 1.01, 1 / 1.001);
		size.createSpan({ cls: 'nimble-map-gridpanel-value', text: `${this.cellPx()} px` });
		step('plus', 'Bigger cells', 1.01, 1.001);
		nudge.createSpan({ cls: 'nimble-map-gridpanel-label', text: 'Move' });
		const move = nudge.createDiv({ cls: 'nimble-map-stepper' });
		for (const [icon, label, dx, dy] of [['arrow-left', 'left', -1, 0], ['arrow-up', 'up', 0, -1], ['arrow-down', 'down', 0, 1], ['arrow-right', 'right', 1, 0]] as const) {
			const b = move.createEl('button', { cls: 'nimble-map-btn nimble-map-icon-btn', attr: { 'aria-label': `Move the grid ${label} (arrow keys; Shift for a fine step)` } });
			setIcon(b, icon);
			b.onclick = (e) => this.nudge(dx, dy, e.shiftKey);
		}

		const opts = el.createDiv({ cls: 'nimble-map-gridpanel-row' });
		const show = opts.createEl('label', { cls: 'nimble-map-gridpanel-check' });
		const box = show.createEl('input', { attr: { type: 'checkbox' } });
		box.checked = d.showGrid;
		box.onchange = () => this.set({ showGrid: box.checked });
		show.createSpan({ text: 'Show grid' });
		show.setAttr('title', 'Turn off when the map has its own grid printed on it: the grid still snaps and counts.');
		const scale = opts.createEl('label', { cls: 'nimble-map-gridpanel-scale' });
		scale.createSpan({ text: 'One cell is' });
		const input = scale.createEl('input', { attr: { type: 'text', placeholder: '6 miles', 'aria-label': 'What one cell is', spellcheck: 'false' } });
		input.value = d.scale;
		input.oninput = () => { this.draft = { ...this.draft, scale: input.value }; };
		input.onkeydown = (e) => { if (e.key === 'Enter') this.host.save(this.draft); };
		this.footer();
	}

	private footer(): void {
		const row = this.el.createDiv({ cls: 'nimble-map-gridpanel-row nimble-map-gridpanel-actions' });
		const cancel = row.createEl('button', { cls: 'nimble-map-btn', text: 'Cancel' });
		cancel.onclick = () => this.host.cancel();
		const save = row.createEl('button', { cls: 'nimble-map-btn mod-cta', text: 'Save' });
		save.onclick = () => this.host.save(this.draft);
	}

	private cellPx(): number {
		const { w } = this.host.size();
		return Math.round((this.draft.cell.w / 100) * w * 10) / 10;
	}

	private pickKind(kind: GridKind): void {
		if (kind === this.draft.kind) return;
		const was = this.draft.kind;
		// Switching between square and hex keeps the size; a stretched cell goes back to regular.
		this.set({ kind, cell: { w: this.draft.cell.w } });
		this.status = { text: '' };
		if (this.boxing) this.toggleBox();
		this.render();
		const seg = this.el.querySelector<HTMLElement>('.nimble-map-segs');
		if (seg) slideThumb(seg, KIND_LABELS.findIndex(([k]) => k === kind), KIND_LABELS.length, KIND_LABELS.findIndex(([k]) => k === was));
	}

	resize(factor: number): void {
		const { w, h } = this.host.size();
		this.set(resizeAround(this.draft, w / h, factor, this.host.viewCentre()));
		this.render();
	}

	/** Move the grid: a twentieth of a cell, or one image pixel with Shift. */
	nudge(dx: number, dy: number, fine: boolean): void {
		const { w, h } = this.host.size();
		const cellPx = (this.draft.cell.w / 100) * w;
		const stepPx = fine ? 1 : Math.max(1, cellPx / 20);
		this.set({ offset: { x: this.draft.offset.x + (dx * stepPx / w) * 100, y: this.draft.offset.y + (dy * stepPx / h) * 100 } });
	}

	/** Arrow keys move the grid while the panel is open (not while typing in the scale field). */
	key(e: KeyboardEvent): boolean {
		if (this.draft.kind === 'none' || (e.target as HTMLElement | null)?.matches?.('input[type="text"]')) return false;
		const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
		const d = dir[e.key];
		if (!d) return false;
		e.preventDefault();
		this.nudge(d[0], d[1], e.shiftKey);
		return true;
	}

	private toggleBox(): void {
		this.boxing = !this.boxing;
		this.host.boxMode(this.boxing ? (box) => void this.fromBox(box) : null);
		this.render();
	}

	private async fromBox(box: { x: number; y: number; w: number; h: number }): Promise<void> {
		const kind = this.draft.kind;
		if (kind === 'none') return;
		this.boxing = false;
		this.host.boxMode(null);
		const { w, h } = this.host.size();
		const got = gridFromBox(kind, box, w, h);
		this.set({ cell: got.cell, offset: got.offset });
		if (!this.host.canDetect) { this.status = { text: 'Set from your box. Nudge to fine-tune.' }; this.render(); return; }
		// Refine within ±10% of the box's size.
		await this.detect(got.hint);
	}

	async detect(hint?: DetectHint): Promise<void> {
		const kind = this.draft.kind;
		if (kind === 'none' || this.busy) return;
		this.busy = true;
		this.status = { text: 'Looking for the grid…' };
		this.render();
		let r: DetectResult | null = null;
		try {
			r = await this.host.detect(kind, hint);
		} catch (e) {
			console.error('Ember Vault: grid detection failed', e);
		}
		this.busy = false;
		const { w, h } = this.host.size();
		if (r && (!hint || Math.abs(r.w / hint.w - 1) <= 0.1)) {
			this.set(draftFromDetection(kind, r, w, h));
			this.status = r.confidence >= GOOD_MATCH ? { text: 'Good match', cls: 'is-good' } : { text: 'Rough guess — adjust below', cls: 'is-rough' };
		} else {
			this.status = hint ? { text: 'Set from your box. Nudge to fine-tune.' } : { text: 'No grid found. Try Fit to 3 × 3.', cls: 'is-rough' };
		}
		this.render();
	}
}
