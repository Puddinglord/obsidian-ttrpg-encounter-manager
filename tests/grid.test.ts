import { describe, expect, it } from 'vitest';
import { cellAt, cellCorners, cellsAlong, cellSize, cellWord, centreOf, distance, geometry, GridSpec, normaliseOffset, patternTile, regularHeight, snapToCell } from '../src/grid-def';
import type { GridKind } from '../src/map-def';

const KINDS: Exclude<GridKind, 'none'>[] = ['square', 'hex', 'hex-flat'];
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('grid sizing', () => {
	it('fills in a regular cell height', () => {
		expect(cellSize({ kind: 'square', cell: { w: 4 } }, 1.5)).toEqual({ w: 4, h: 4 });
		expect(cellSize({ kind: 'hex', cell: { w: 4 } }, 1.5).h).toBeCloseTo(4.6188, 4);
		expect(cellSize({ kind: 'hex-flat', cell: { w: 4 } }, 1.5).h).toBeCloseTo(3.4641, 4);
		expect(cellSize({ kind: 'hex', cell: { w: 4, h: 5 } }, 1.5)).toEqual({ w: 4, h: 5 });
		expect(regularHeight('square', 3)).toBe(3);
	});

	it('reads the old columns × rows', () => {
		// 30x20 on a 1500×1000 image: 50 px cells, 3.333% of the width each way.
		const s = cellSize({ kind: 'square', cols: 30, rows: 20 }, 1.5);
		expect(s.w).toBeCloseTo(100 / 30, 9);
		expect(s.h).toBeCloseTo(100 / 30, 9);
		const g = { kind: 'square' as const, cols: 30, rows: 20 };
		// The last cell's centre sits half a cell in from the bottom-right corner.
		const c = centreOf(g, 1.5, { q: 29, r: 19 });
		expect(c.x).toBeCloseTo(100 - 50 / 30, 9);
		expect(c.y).toBeCloseTo(100 - 50 / 20, 9);
	});

	it('has no geometry without a grid', () => {
		expect(geometry({ kind: 'none' }, 1)).toBeNull();
		expect(patternTile({ kind: 'none' }, 100, 100)).toBeNull();
	});
});

describe('snapping and round trips', () => {
	for (const kind of KINDS) {
		for (const aspect of [1, 0.84, 1.77]) {
			const spec: GridSpec = { kind, cell: { w: 3.7 }, offset: { x: 1.3, y: 2.9 } };
			it(`${kind}, aspect ${aspect}: centre → cell → centre`, () => {
				for (let q = -3; q <= 12; q++) {
					for (let r = -3; r <= 12; r++) {
						const c = centreOf(spec, aspect, { q, r });
						expect(cellAt(spec, aspect, c)).toEqual({ q, r });
						expect(snapToCell(spec, aspect, c)).toEqual(c);
					}
				}
			});
			it(`${kind}, aspect ${aspect}: points near a centre snap to it, points inside the corners stay in the cell`, () => {
				const cell = { q: 4, r: 5 };
				const c = centreOf(spec, aspect, cell);
				for (const corner of cellCorners(spec, aspect, cell)) {
					// 95% of the way to each corner is still inside.
					const p = { x: c.x + (corner.x - c.x) * 0.95, y: c.y + (corner.y - c.y) * 0.95 };
					expect(cellAt(spec, aspect, p)).toEqual(cell);
					// 105% is in a neighbour.
					const out = { x: c.x + (corner.x - c.x) * 1.05, y: c.y + (corner.y - c.y) * 1.05 };
					expect(cellAt(spec, aspect, out)).not.toEqual(cell);
				}
			});
		}
	}

	it('the offset is a cell centre', () => {
		for (const kind of KINDS) {
			const spec: GridSpec = { kind, cell: { w: 5 }, offset: { x: 12, y: 40 } };
			expect(centreOf(spec, 1.2, { q: 0, r: 0 })).toEqual({ x: 12, y: 40 });
			expect(cellAt(spec, 1.2, { x: 12.4, y: 40.3 })).toEqual({ q: 0, r: 0 });
		}
	});

	it('square cells are square in pixels on a non-square image', () => {
		// 2000×1000 image, cells 5% of the width = 100 px: 10% of the height down.
		const spec: GridSpec = { kind: 'square', cell: { w: 5 }, offset: { x: 2.5, y: 5 } };
		expect(centreOf(spec, 2, { q: 1, r: 1 })).toEqual({ x: 7.5, y: 15 });
	});

	it('a stretched cell', () => {
		const spec: GridSpec = { kind: 'square', cell: { w: 2, h: 4 }, offset: { x: 1, y: 2 } };
		expect(centreOf(spec, 1, { q: 3, r: 3 })).toEqual({ x: 7, y: 14 });
		expect(cellAt(spec, 1, { x: 7.9, y: 15.9 })).toEqual({ q: 3, r: 3 });
		expect(cellAt(spec, 1, { x: 8.1, y: 15.9 })).toEqual({ q: 4, r: 3 });
	});

	it('neighbouring hexes are one cell width apart along a row (pointy) or column (flat)', () => {
		const pointy = { kind: 'hex' as const, cell: { w: 4 }, offset: { x: 10, y: 10 } };
		const a = centreOf(pointy, 1, { q: 0, r: 0 });
		const b = centreOf(pointy, 1, { q: 1, r: 0 });
		expect(b.x - a.x).toBeCloseTo(4, 9);
		expect(b.y).toBeCloseTo(a.y, 9);
		// The next row is 3/4 of a hex down and half a hex across.
		const c = centreOf(pointy, 1, { q: 0, r: 1 });
		expect(c.x - a.x).toBeCloseTo(2, 9);
		expect(c.y - a.y).toBeCloseTo(0.75 * regularHeight('hex', 4), 9);
		const flat = { kind: 'hex-flat' as const, cell: { w: 4 }, offset: { x: 10, y: 10 } };
		const d = centreOf(flat, 1, { q: 1, r: 0 });
		expect(d.x - 10).toBeCloseTo(3, 9);
		expect(centreOf(flat, 1, { q: 0, r: 1 }).y - 10).toBeCloseTo(regularHeight('hex-flat', 4), 9);
	});

	it('normalises an offset to the first repeat without moving the grid', () => {
		for (const kind of KINDS) {
			const spec: GridSpec = { kind, cell: { w: 3 }, offset: { x: 40.2, y: 61.7 } };
			const o = normaliseOffset(spec, 1.3)!;
			expect(o.x).toBeGreaterThanOrEqual(0);
			expect(o.x).toBeLessThan(4.5 + 1e-9);
			// The normalised offset is still a cell centre of the original grid.
			const c = cellAt(spec, 1.3, o);
			const back = centreOf(spec, 1.3, c);
			expect(close(back.x, o.x, 1e-9) && close(back.y, o.y, 1e-9)).toBe(true);
		}
	});
});

describe('distance', () => {
	it('squares count diagonals as one by default', () => {
		const sq = { kind: 'square' as const };
		expect(distance(sq, { q: 0, r: 0 }, { q: 3, r: 2 })).toBe(3);
		expect(distance(sq, { q: 0, r: 0 }, { q: 3, r: 2 }, 'manhattan')).toBe(5);
		expect(distance(sq, { q: 0, r: 0 }, { q: 3, r: 3 }, 'alternate')).toBe(4);
		expect(distance(sq, { q: 0, r: 0 }, { q: -2, r: 0 })).toBe(2);
	});

	it('pointy hexes', () => {
		const hex = { kind: 'hex' as const };
		expect(distance(hex, { q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3);
		expect(distance(hex, { q: 0, r: 0 }, { q: 0, r: 3 })).toBe(3);
		expect(distance(hex, { q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2);
		expect(distance(hex, { q: 0, r: 0 }, { q: 2, r: 2 })).toBe(4);
		// Every neighbour is one away.
		for (const [q, r] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) expect(distance(hex, { q: 5, r: 5 }, { q: 5 + q, r: 5 + r })).toBe(1);
	});

	it('flat hexes: walking straight down a column', () => {
		const spec: GridSpec = { kind: 'hex-flat', cell: { w: 4 }, offset: { x: 10, y: 10 } };
		const top = cellAt(spec, 1, { x: 10, y: 10 });
		const below = cellAt(spec, 1, { x: 10, y: 10 + 3 * regularHeight('hex-flat', 4) });
		expect(distance(spec, top, below)).toBe(3);
	});

	it('pointy hexes: walking straight across a row', () => {
		const spec: GridSpec = { kind: 'hex', cell: { w: 4 }, offset: { x: 10, y: 10 } };
		const a = cellAt(spec, 1, { x: 10, y: 10 });
		expect(distance(spec, a, cellAt(spec, 1, { x: 30, y: 10 }))).toBe(5);
	});

	it('a route sums its legs', () => {
		const spec: GridSpec = { kind: 'square', cell: { w: 10 }, offset: { x: 5, y: 5 } };
		expect(cellsAlong(spec, 1, [{ x: 5, y: 5 }, { x: 35, y: 5 }, { x: 35, y: 25 }])).toBe(5);
		expect(cellsAlong(spec, 1, [{ x: 5, y: 5 }])).toBe(0);
	});

	it('words', () => {
		expect(cellWord('hex', 3)).toBe('3 hexes');
		expect(cellWord('hex-flat', 1)).toBe('1 hex');
		expect(cellWord('square', 2)).toBe('2 squares');
	});
});

describe('pattern tiles', () => {
	it('a square tile is one cell with its top and left edges', () => {
		const t = patternTile({ kind: 'square', cell: { w: 10 }, offset: { x: 5, y: 10 } }, 1000, 500)!;
		expect(t).toEqual({ x: 0, y: 0, width: 100, height: 100, d: 'M0 100 L0 0 L100 0' });
	});

	it('hex tiles repeat every two rows (pointy) or two columns (flat), anchored on the offset cell', () => {
		const p = patternTile({ kind: 'hex', cell: { w: 10 }, offset: { x: 20, y: 20 } }, 1000, 1000)!;
		const h = regularHeight('hex', 10) * 10;
		expect(p.width).toBeCloseTo(100, 9);
		expect(p.height).toBeCloseTo(1.5 * h, 9);
		expect(p.x).toBeCloseTo(150, 9);
		expect(p.y).toBeCloseTo(200 - h / 2, 9);
		const f = patternTile({ kind: 'hex-flat', cell: { w: 10 }, offset: { x: 20, y: 20 } }, 1000, 1000)!;
		expect(f.width).toBeCloseTo(150, 9);
		expect(f.height).toBeCloseTo(regularHeight('hex-flat', 10) * 10, 9);
	});

	it('every edge of every hex lies on a tile line', () => {
		// Rebuild the lines of a 3×3 block of tiles and check each cell's corners join up along them.
		for (const kind of ['hex', 'hex-flat'] as const) {
			const spec: GridSpec = { kind, cell: { w: 10 }, offset: { x: 20, y: 20 } };
			const t = patternTile(spec, 1000, 1000)!;
			const segs: [number, number, number, number][] = [];
			for (const path of t.d.split('M').filter(Boolean)) {
				const pts = path.split('L').map(s => s.trim().split(' ').map(Number));
				for (let i = 1; i < pts.length; i++) {
					for (let ty = -2; ty <= 2; ty++) for (let tx = -2; tx <= 2; tx++) {
						const ox = t.x + tx * t.width;
						const oy = t.y + ty * t.height;
						segs.push([pts[i - 1][0] + ox, pts[i - 1][1] + oy, pts[i][0] + ox, pts[i][1] + oy]);
					}
				}
			}
			const has = (a: { x: number; y: number }, b: { x: number; y: number }) => segs.some(([x1, y1, x2, y2]) =>
				(close(x1, a.x, 0.01) && close(y1, a.y, 0.01) && close(x2, b.x, 0.01) && close(y2, b.y, 0.01)) ||
				(close(x1, b.x, 0.01) && close(y1, b.y, 0.01) && close(x2, a.x, 0.01) && close(y2, a.y, 0.01)));
			for (const cell of [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }]) {
				const corners = cellCorners(spec, 1, cell).map(p => ({ x: p.x * 10, y: p.y * 10 }));
				for (let i = 0; i < 6; i++) expect(has(corners[i], corners[(i + 1) % 6])).toBe(true);
			}
		}
	});
});
