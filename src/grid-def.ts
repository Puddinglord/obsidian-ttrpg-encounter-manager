// Grid maths for maps: which cell a point is in, where a cell's centre is, and
// how many cells apart two cells are. Pure: no Obsidian imports.
//
// Everything a map stores is in % of the image, so it survives the image being
// swapped for a bigger copy. Cells are sized in % of the image *width* (both
// across and down), so they need the image's aspect ratio (width / height) to
// land on the right pixels. Internally points are converted to "width units":
//
//   u = x            (x is % of the width)
//   v = y / aspect   (y is % of the height, turned into % of the width)
//
// which makes the plane isotropic: a square cell is w × w in (u, v).
//
// Hexes use axial coordinates (q, r). `hex` is pointy-top: rows of hexes, the
// cell's width is flat side to flat side and its height point to point.
// `hex-flat` is flat-top: columns of hexes, width point to point, height flat
// side to flat side. A regular hex has h = 2w/√3 (pointy) or h = w·√3/2 (flat);
// a different `h` stretches it.

import type { GridKind, Point } from './map-def';

export interface GridSpec {
	kind: GridKind;
	/** Cell size in % of the image width. Missing: DEFAULT_CELL. */
	cell?: { w: number; h?: number };
	/** One cell's centre, in % of the image. Missing: the top-left cell sits in the corner. */
	offset?: Point;
	/** The old `grid: 30x20`: columns × rows across the whole image (used when `cell` isn't set). */
	cols?: number;
	rows?: number;
}

/** A cell: column and row for squares, axial q and r for hexes. */
export interface Cell { q: number; r: number }

/** How diagonal steps count on a square grid. */
export type SquareMetric = 'chebyshev' | 'manhattan' | 'alternate';

/** The cell width used when a grid has a kind but no size yet, in % of the width. */
export const DEFAULT_CELL = 5;

const SQRT3 = Math.sqrt(3);

/** The grid resolved into width units. */
export interface Geometry {
	kind: Exclude<GridKind, 'none'>;
	/** Cell bounding box in width units. */
	w: number;
	h: number;
	/** A cell centre in width units. */
	ou: number;
	ov: number;
	aspect: number;
}

/** A regular cell's height for a width (both % of the image width). */
export function regularHeight(kind: GridKind, w: number): number {
	return kind === 'hex' ? (2 * w) / SQRT3 : kind === 'hex-flat' ? (w * SQRT3) / 2 : w;
}

/** The cell's size in % of the image width, filling in the defaults. */
export function cellSize(spec: GridSpec, aspect: number): { w: number; h: number } {
	if (!spec.cell && spec.cols && spec.rows) return { w: 100 / spec.cols, h: 100 / spec.rows / aspect };
	const w = spec.cell?.w && spec.cell.w > 0 ? spec.cell.w : DEFAULT_CELL;
	const h = spec.cell?.h && spec.cell.h > 0 ? spec.cell.h : regularHeight(spec.kind, w);
	return { w, h };
}

/** The grid in width units, or null for `none`. */
export function geometry(spec: GridSpec, aspect: number): Geometry | null {
	if (spec.kind === 'none' || !(aspect > 0)) return null;
	const { w, h } = cellSize(spec, aspect);
	// No offset: the top-left cell sits in the corner of the image.
	const ou = spec.offset ? spec.offset.x : w / 2;
	const ov = spec.offset ? spec.offset.y / aspect : h / 2;
	return { kind: spec.kind, w, h, ou, ov, aspect };
}

/** The offset that puts a cell's centre at the corner-most spot, so the stored offset stays small and readable. */
export function normaliseOffset(spec: GridSpec, aspect: number): Point | undefined {
	const g = geometry(spec, aspect);
	if (!g) return spec.offset;
	// Squares repeat every cell; pointy hexes every cell across and every two rows down; flat hexes the other way round.
	const pu = g.kind === 'hex-flat' ? 1.5 * g.w : g.w;
	const pv = g.kind === 'hex' ? 1.5 * g.h : g.h;
	const mod = (a: number, m: number) => ((a % m) + m) % m;
	return { x: mod(g.ou, pu), y: mod(g.ov, pv) * aspect };
}

// ----------------------------------------------------------------------------
// Hex helpers (unit hexes: centre to corner = 1)

function cubeRound(q: number, r: number): Cell {
	const s = -q - r;
	let rq = Math.round(q);
	let rr = Math.round(r);
	const rs = Math.round(s);
	const dq = Math.abs(rq - q);
	const dr = Math.abs(rr - r);
	const ds = Math.abs(rs - s);
	if (dq > dr && dq > ds) rq = -rr - rs;
	else if (dr > ds) rr = -rq - rs;
	return { q: rq + 0, r: rr + 0 };
}

/** Width units → unit-hex space, where the hex is regular with corners at distance 1. */
function toUnit(g: Geometry, u: number, v: number): { X: number; Y: number } {
	const du = u - g.ou;
	const dv = v - g.ov;
	// Pointy: width √3, height 2. Flat: width 2, height √3.
	return g.kind === 'hex' ? { X: (du / g.w) * SQRT3, Y: (dv / g.h) * 2 } : { X: (du / g.w) * 2, Y: (dv / g.h) * SQRT3 };
}

function fromUnit(g: Geometry, X: number, Y: number): { u: number; v: number } {
	return g.kind === 'hex'
		? { u: g.ou + (X / SQRT3) * g.w, v: g.ov + (Y / 2) * g.h }
		: { u: g.ou + (X / 2) * g.w, v: g.ov + (Y / SQRT3) * g.h };
}

// ----------------------------------------------------------------------------
// Public maths

/** The cell a point (in % of the image) falls in. */
export function cellAt(spec: GridSpec, aspect: number, p: Point): Cell {
	const g = geometry(spec, aspect);
	if (!g) return { q: 0, r: 0 };
	const u = p.x;
	const v = p.y / aspect;
	if (g.kind === 'square') return { q: Math.round((u - g.ou) / g.w) + 0, r: Math.round((v - g.ov) / g.h) + 0 };
	const { X, Y } = toUnit(g, u, v);
	if (g.kind === 'hex') return cubeRound((SQRT3 / 3) * X - Y / 3, (2 / 3) * Y);
	return cubeRound((2 / 3) * X, -X / 3 + (SQRT3 / 3) * Y);
}

/** A cell's centre, in % of the image. */
export function centreOf(spec: GridSpec, aspect: number, c: Cell): Point {
	const g = geometry(spec, aspect);
	if (!g) return { x: 0, y: 0 };
	let u: number;
	let v: number;
	if (g.kind === 'square') { u = g.ou + c.q * g.w; v = g.ov + c.r * g.h; }
	else if (g.kind === 'hex') ({ u, v } = fromUnit(g, SQRT3 * (c.q + c.r / 2), 1.5 * c.r));
	else ({ u, v } = fromUnit(g, 1.5 * c.q, SQRT3 * (c.r + c.q / 2)));
	return { x: u, y: v * aspect };
}

/** The centre of the cell a point falls in. */
export function snapToCell(spec: GridSpec, aspect: number, p: Point): Point {
	return centreOf(spec, aspect, cellAt(spec, aspect, p));
}

/** How many cells apart two cells are. Squares count diagonals as one step by default (Chebyshev). */
export function distance(spec: Pick<GridSpec, 'kind'>, a: Cell, b: Cell, metric: SquareMetric = 'chebyshev'): number {
	const dq = b.q - a.q;
	const dr = b.r - a.r;
	if (spec.kind === 'hex' || spec.kind === 'hex-flat') return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
	const x = Math.abs(dq);
	const y = Math.abs(dr);
	if (metric === 'manhattan') return x + y;
	// Every second diagonal counts double (5-10-5).
	if (metric === 'alternate') return Math.max(x, y) + Math.floor(Math.min(x, y) / 2);
	return Math.max(x, y);
}

/** Cells along a line through the points (each point's cell to the next): a route's length in cells. */
export function cellsAlong(spec: GridSpec, aspect: number, points: Point[], metric: SquareMetric = 'chebyshev'): number {
	let n = 0;
	for (let i = 1; i < points.length; i++) n += distance(spec, cellAt(spec, aspect, points[i - 1]), cellAt(spec, aspect, points[i]), metric);
	return n;
}

/** A cell's outline, in % of the image: 4 corners for a square, 6 for a hex. */
export function cellCorners(spec: GridSpec, aspect: number, c: Cell): Point[] {
	const g = geometry(spec, aspect);
	if (!g) return [];
	const centre = centreOf(spec, aspect, c);
	const cu = centre.x;
	const cv = centre.y / aspect;
	const pts: { u: number; v: number }[] = [];
	if (g.kind === 'square') {
		for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push({ u: cu + (a * g.w) / 2, v: cv + (b * g.h) / 2 });
	} else {
		for (let i = 0; i < 6; i++) {
			const ang = (Math.PI / 180) * (60 * i + (g.kind === 'hex' ? -90 : 0));
			pts.push({ u: cu + (Math.cos(ang) * g.w) / (g.kind === 'hex' ? SQRT3 : 2), v: cv + (Math.sin(ang) * g.h) / (g.kind === 'hex' ? 2 : SQRT3) });
		}
	}
	return pts.map(p => ({ x: p.u, y: p.v * aspect }));
}

/**
 * One repeating tile of grid lines, in image pixels, for an SVG <pattern>:
 * `x`/`y` place the tile, `width`/`height` are its size, `d` draws its lines.
 * Each edge is drawn once (no double lines where tiles meet).
 */
export function patternTile(spec: GridSpec, imgW: number, imgH: number): { x: number; y: number; width: number; height: number; d: string } | null {
	const g = geometry(spec, imgW / imgH);
	if (!g) return null;
	const px = imgW / 100; // width units → pixels
	const w = g.w * px;
	const h = g.h * px;
	const cx = g.ou * px;
	const cy = g.ov * px;
	const f = (n: number) => String(Math.round(n * 1000) / 1000);
	const M = (pts: [number, number][]) => `M${pts.map(([a, b]) => `${f(a)} ${f(b)}`).join(' L')}`;
	if (g.kind === 'square') {
		return { x: cx - w / 2, y: cy - h / 2, width: w, height: h, d: `${M([[0, h], [0, 0], [w, 0]])}` };
	}
	if (g.kind === 'hex') {
		const d = [
			M([[0, h / 4], [w / 2, 0], [w, h / 4]]),
			M([[0, h / 4], [0, (3 * h) / 4]]),
			M([[0, (3 * h) / 4], [w / 2, h], [w, (3 * h) / 4]]),
			M([[w / 2, h], [w / 2, 1.5 * h]]),
		].join(' ');
		return { x: cx - w / 2, y: cy - h / 2, width: w, height: 1.5 * h, d };
	}
	const d = [
		M([[w / 4, 0], [0, h / 2], [w / 4, h]]),
		M([[w / 4, 0], [(3 * w) / 4, 0]]),
		M([[(3 * w) / 4, 0], [w, h / 2], [(3 * w) / 4, h]]),
		M([[w, h / 2], [1.5 * w, h / 2]]),
	].join(' ');
	return { x: cx - w / 2, y: cy - h / 2, width: 1.5 * w, height: h, d };
}

/** "3 hexes", "1 square". */
export function cellWord(kind: GridKind, n: number): string {
	const one = kind === 'hex' || kind === 'hex-flat' ? 'hex' : 'square';
	return `${fmtCount(n)} ${n === 1 ? one : one === 'hex' ? 'hexes' : 'squares'}`;
}

function fmtCount(n: number): string {
	return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}
