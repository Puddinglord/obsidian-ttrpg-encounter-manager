// Drawing on maps, kept small: pen, route, text and eraser, six colours and the
// theme accent, three widths, Undo, and a Show drawings toggle. Strokes are
// stored in the block (`drawings:`) as points in % of the image; this draws
// them and the bar that picks the tool. The party marker's and the measure
// tool's lines are drawn here too.

import { setIcon } from 'obsidian';
import { cellsAlong, GridSpec } from './grid-def';
import { distanceLabel, MapDrawing, Point } from './map-def';

export type DrawTool = 'pen' | 'route' | 'text' | 'eraser';

/** Six colours and the theme's accent. */
export const SWATCHES = ['#ffffff', '#1f1f1f', '#e03131', '#f08c00', '#2f9e44', '#1971c2', 'accent'] as const;
const SWATCH_NAMES: Record<string, string> = { '#ffffff': 'White', '#1f1f1f': 'Black', '#e03131': 'Red', '#f08c00': 'Orange', '#2f9e44': 'Green', '#1971c2': 'Blue', accent: 'Accent' };
/** Stroke widths on screen for widths 1–3, and text sizes. */
export const STROKE_PX = [0, 2.5, 4.5, 8];
export const TEXT_PX = [0, 13, 18, 26];

export const TOOLS: [DrawTool, string, string][] = [['pen', 'pencil', 'Pen'], ['route', 'route', 'Route'], ['text', 'type', 'Text'], ['eraser', 'eraser', 'Eraser']];

/** A drawing's colour as CSS. Colours come from the note, so only #hex or the accent ever reach the style. */
export function cssColour(c: string): string {
	return /^#[0-9a-f]{3,8}$/i.test(c) ? c : 'var(--interactive-accent)';
}

const toPx = (p: Point, iw: number, ih: number) => `${(p.x / 100) * iw},${(p.y / 100) * ih}`;

export interface DrawLayerOptions {
	/** Eraser: strokes take taps, and a tap deletes. */
	onErase?: (index: number) => void;
	grid?: GridSpec | null;
	scale?: string;
}

/** The block's drawings as one SVG over the image (under pins and the party). */
export function drawDrawingsLayer(stage: HTMLElement, before: Element | null, drawings: MapDrawing[], iw: number, ih: number, opts: DrawLayerOptions = {}): SVGSVGElement | null {
	stage.querySelector(':scope > .nimble-map-drawings')?.remove();
	if (!iw || !ih) return null;
	const svg = stage.createSvg('svg', { cls: ['nimble-map-drawings', ...(opts.onErase ? ['is-erasing'] : [])], attr: { viewBox: `0 0 ${iw} ${ih}`, width: iw, height: ih } });
	if (before?.parentElement === stage) stage.insertBefore(svg, before);
	drawings.forEach((d, i) => {
		const g = svg.createSvg('g', { cls: ['nimble-map-drawing', `kind-${d.kind}`], attr: { 'data-index': String(i) } });
		g.style.setProperty('--draw-colour', cssColour(d.colour));
		g.style.setProperty('--draw-width', `${STROKE_PX[d.width] ?? 4}px`);
		g.style.setProperty('--draw-size', `${TEXT_PX[d.width] ?? 18}px`);
		if (d.kind === 'text') {
			const [x, y] = toPx(d.points[0], iw, ih).split(',');
			g.createSvg('text', { cls: 'nimble-map-drawing-text', attr: { x, y } }).textContent = d.text ?? '';
		} else {
			const pts = d.points.map(p => toPx(p, iw, ih)).join(' ');
			// A wide invisible line under the stroke makes thin strokes easy to hit with the eraser.
			if (opts.onErase) g.createSvg('polyline', { cls: 'nimble-map-drawing-hit', attr: { points: pts } });
			g.createSvg('polyline', { cls: 'nimble-map-drawing-line', attr: { points: pts } });
			if (d.kind === 'route' && opts.grid && d.points.length > 1) {
				const last = d.points[d.points.length - 1];
				const [x, y] = toPx(last, iw, ih).split(',');
				const n = cellsAlong(opts.grid, iw / ih, d.points);
				g.createSvg('text', { cls: 'nimble-map-route-length', attr: { x, y } }).textContent = distanceLabel(opts.grid.kind, n, opts.scale);
			}
		}
		if (opts.onErase) {
			g.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
			g.addEventListener('click', (e) => { e.stopPropagation(); opts.onErase!(i); });
		}
	});
	return svg;
}

/** A line being drawn right now (a pen stroke, a route, the measure tool): drawn live, not saved. */
export function drawLiveLine(svg: SVGSVGElement, points: Point[], iw: number, ih: number, colour: string, width: number, cls = ''): void {
	svg.querySelector('.nimble-map-live')?.remove();
	if (!points.length) return;
	const g = svg.createSvg('g', { cls: ['nimble-map-live', ...cls.split(/\s+/).filter(Boolean)] });
	g.style.setProperty('--draw-colour', cssColour(colour));
	g.style.setProperty('--draw-width', `${STROKE_PX[width] ?? 4}px`);
	g.createSvg('polyline', { cls: 'nimble-map-drawing-line', attr: { points: points.map(p => toPx(p, iw, ih)).join(' ') } });
	for (const p of points.slice(0, -1)) {
		const [cx, cy] = toPx(p, iw, ih).split(',');
		g.createSvg('circle', { cls: 'nimble-map-live-dot', attr: { cx, cy } });
	}
}

export interface DrawBarState {
	tool: DrawTool;
	colour: string;
	width: number;
	canUndo: boolean;
}

/** The bar under the toolbar in Draw mode: tools, colours, widths, Undo. */
export function renderDrawBar(el: HTMLElement, st: DrawBarState, on: { tool: (t: DrawTool) => void; colour: (c: string) => void; width: (w: number) => void; undo: () => void }): void {
	el.empty();
	el.addClass('nimble-map-drawbar');
	const tools = el.createDiv({ cls: 'nimble-map-drawbar-group', attr: { role: 'radiogroup', 'aria-label': 'Drawing tool' } });
	for (const [tool, icon, label] of TOOLS) {
		const b = tools.createEl('button', { cls: `nimble-map-btn${st.tool === tool ? ' is-active' : ''}`, attr: { role: 'radio', 'aria-checked': String(st.tool === tool), 'aria-label': label, 'data-tool': tool } });
		setIcon(b.createSpan(), icon);
		b.createSpan({ cls: 'nimble-map-btn-label', text: label });
		b.onclick = () => on.tool(tool);
	}
	const colours = el.createDiv({ cls: 'nimble-map-drawbar-group nimble-map-swatches', attr: { role: 'radiogroup', 'aria-label': 'Colour' } });
	for (const c of SWATCHES) {
		const b = colours.createEl('button', { cls: `nimble-map-swatch${st.colour === c ? ' is-active' : ''}`, attr: { role: 'radio', 'aria-checked': String(st.colour === c), 'aria-label': SWATCH_NAMES[c], 'data-colour': c } });
		b.style.setProperty('--swatch', cssColour(c));
		b.onclick = () => on.colour(c);
	}
	const widths = el.createDiv({ cls: 'nimble-map-drawbar-group', attr: { role: 'radiogroup', 'aria-label': 'Width' } });
	for (const w of [1, 2, 3]) {
		const b = widths.createEl('button', { cls: `nimble-map-width${st.width === w ? ' is-active' : ''}`, attr: { role: 'radio', 'aria-checked': String(st.width === w), 'aria-label': ['Thin', 'Medium', 'Thick'][w - 1] } });
		b.createSpan({ cls: 'nimble-map-width-line' }).style.setProperty('--w', `${STROKE_PX[w]}px`);
		b.onclick = () => on.width(w);
	}
	const undo = el.createEl('button', { cls: 'nimble-map-btn nimble-map-icon-btn', attr: { 'aria-label': 'Undo the last drawing (Cmd/Ctrl+Z)' } });
	setIcon(undo, 'undo-2');
	undo.disabled = !st.canUndo;
	undo.onclick = () => on.undo();
}
