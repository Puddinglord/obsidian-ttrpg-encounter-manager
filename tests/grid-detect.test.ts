import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { cellAt, cellCorners, centreOf, type GridSpec } from '../src/grid-def';
import { detectGrid, detectGridSteps, DetectHint, DetectResult, GOOD_MATCH, GrayImage } from '../src/grid-detect';
import { decodePng, toGray } from './png';

type Kind = 'square' | 'hex' | 'hex-flat';
/** A grid in pixels: cell size and one cell centre. */
interface Truth { kind: Kind; w: number; h?: number; x: number; y: number }

// ----------------------------------------------------------------------------
// Synthetic maps

function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Soft value noise plus a few blobs: something like paper or terrain under the grid. */
function background(W: number, H: number, seed: number, base = 0.65): GrayImage {
	const rand = rng(seed);
	const data = new Float32Array(W * H).fill(base);
	for (const [cell, amp] of [[97, 0.12], [31, 0.05]] as const) {
		const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
		const lattice = Array.from({ length: gw * gh }, () => rand() - 0.5);
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const fx = x / cell, fy = y / cell;
				const ix = Math.floor(fx), iy = Math.floor(fy);
				const sx = (fx - ix) ** 2 * (3 - 2 * (fx - ix)), sy = (fy - iy) ** 2 * (3 - 2 * (fy - iy));
				const v = (a: number, b: number) => lattice[(iy + b) * gw + ix + a];
				const top = v(0, 0) + (v(1, 0) - v(0, 0)) * sx;
				const bot = v(0, 1) + (v(1, 1) - v(0, 1)) * sx;
				data[y * W + x] += amp * 2 * (top + (bot - top) * sy);
			}
		}
	}
	for (let b = 0; b < 8; b++) {
		const cx = rand() * W, cy = rand() * H, r = 30 + rand() * 120, a = (rand() - 0.5) * 0.25;
		for (let y = Math.max(0, Math.floor(cy - 3 * r)); y < Math.min(H, cy + 3 * r); y++) {
			for (let x = Math.max(0, Math.floor(cx - 3 * r)); x < Math.min(W, cx + 3 * r); x++) {
				data[y * W + x] += a * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
			}
		}
	}
	return { data, width: W, height: H };
}

function addNoise(img: GrayImage, sigma: number, seed: number): void {
	const rand = rng(seed);
	for (let i = 0; i < img.data.length; i++) {
		const g = Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
		img.data[i] += sigma * g;
	}
}

function specOf(t: Truth, W: number, H: number): GridSpec {
	return { kind: t.kind, cell: { w: (t.w / W) * 100, h: t.h ? (t.h / W) * 100 : undefined }, offset: { x: (t.x / W) * 100, y: (t.y / H) * 100 } };
}

/**
 * Draws the grid with grid-def's own cell outlines, antialiased, `thickness`
 * px wide, darkening the image by `darkness` on the line. `mask` limits it to
 * some places (rooms).
 */
function drawGrid(img: GrayImage, t: Truth, thickness: number, darkness: number, mask?: (x: number, y: number) => boolean): void {
	const { width: W, height: H } = img;
	const spec = specOf(t, W, H);
	const aspect = W / H;
	const cells = new Map<string, { q: number; r: number }>();
	const step = t.w / 3;
	for (let y = -t.w * 2; y < H + t.w * 2; y += step) {
		for (let x = -t.w * 2; x < W + t.w * 2; x += step) {
			const c = cellAt(spec, aspect, { x: (x / W) * 100, y: (y / H) * 100 });
			cells.set(`${c.q},${c.r}`, c);
		}
	}
	const cover = new Float32Array(W * H);
	const pad = thickness / 2 + 1;
	for (const c of cells.values()) {
		const pts = cellCorners(spec, aspect, c).map(p => ({ x: (p.x / 100) * W, y: (p.y / 100) * H }));
		for (let i = 0; i < pts.length; i++) {
			const a = pts[i], b = pts[(i + 1) % pts.length];
			const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
			for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y) - pad)); y <= Math.min(H - 1, Math.ceil(Math.max(a.y, b.y) + pad)); y++) {
				for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x) - pad)); x <= Math.min(W - 1, Math.ceil(Math.max(a.x, b.x) + pad)); x++) {
					const px = x + 0.5, py = y + 0.5;
					const u = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
					const dist = Math.hypot(px - a.x - u * dx, py - a.y - u * dy);
					const cov = Math.max(0, Math.min(1, thickness / 2 + 0.5 - dist));
					if (cov > cover[y * W + x]) cover[y * W + x] = cov;
				}
			}
		}
	}
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const i = y * W + x;
			if (cover[i] > 0 && (!mask || mask(x, y))) img.data[i] *= 1 - darkness * cover[i];
		}
	}
}

/** Cell size error (worst of w, h) and offset error, both as a fraction of the cell. */
function errors(res: DetectResult, t: Truth, W: number, H: number): { size: number; offset: number } {
	const spec = specOf(t, W, H);
	const aspect = W / H;
	const th = t.h ?? (t.kind === 'hex' ? (2 * t.w) / Math.sqrt(3) : t.kind === 'hex-flat' ? (t.w * Math.sqrt(3)) / 2 : t.w);
	const p = { x: (res.x / W) * 100, y: (res.y / H) * 100 };
	const c = centreOf(spec, aspect, cellAt(spec, aspect, p));
	const off = Math.hypot((c.x / 100) * W - res.x, (c.y / 100) * H - res.y);
	return { size: Math.max(Math.abs(res.w / t.w - 1), Math.abs(res.h / th - 1)), offset: off / Math.min(t.w, th) };
}

const report: string[] = [];

function expectGrid(name: string, img: GrayImage, t: Truth, hint?: DetectHint, sizeTol = 0.02, offTol = 0.03): DetectResult {
	const t0 = performance.now();
	const res = detectGrid(img, { kind: t.kind, hint });
	const ms = performance.now() - t0;
	expect(res, `${name}: found a grid`).not.toBeNull();
	if (!res) throw new Error('unreachable');
	const e = errors(res, t, img.width, img.height);
	report.push(`${name.padEnd(28)} size ${(e.size * 100).toFixed(2)}%  offset ${(e.offset * 100).toFixed(2)}% of a cell  conf ${res.confidence.toFixed(2)}  ${ms.toFixed(0)} ms`);
	expect(e.size, `${name}: cell size error`).toBeLessThan(sizeTol);
	expect(e.offset, `${name}: offset error`).toBeLessThan(offTol);
	return res;
}

describe('grid detection on synthetic maps', () => {
	it('square grid, offset away from the corner', () => {
		const img = background(720, 540, 1);
		const t: Truth = { kind: 'square', w: 32, x: 13.3, y: 21.7 };
		drawGrid(img, t, 2, 0.6);
		const res = expectGrid('square', img, t);
		expect(res.confidence).toBeGreaterThanOrEqual(GOOD_MATCH);
	});

	it('pointy-top hex grid', () => {
		const img = background(760, 560, 2);
		const t: Truth = { kind: 'hex', w: 40, x: 17, y: 29 };
		drawGrid(img, t, 2, 0.6);
		const res = expectGrid('pointy hex', img, t);
		expect(res.confidence).toBeGreaterThanOrEqual(GOOD_MATCH);
	});

	it('flat-top hex grid', () => {
		const img = background(700, 620, 3);
		const t: Truth = { kind: 'hex-flat', w: 46, x: 31, y: 11 };
		drawGrid(img, t, 2, 0.6);
		const res = expectGrid('flat hex', img, t);
		expect(res.confidence).toBeGreaterThanOrEqual(GOOD_MATCH);
	});

	it('square grid under heavy noise', () => {
		const img = background(720, 540, 4);
		const t: Truth = { kind: 'square', w: 27.5, x: 5.2, y: 19.9 };
		drawGrid(img, t, 2, 0.5);
		addNoise(img, 0.12, 4);
		expectGrid('square, noisy', img, t);
	});

	it('hex grid under noise', () => {
		const img = background(720, 540, 5);
		const t: Truth = { kind: 'hex', w: 34, x: 101.5, y: 63.2 };
		drawGrid(img, t, 1.5, 0.5);
		addNoise(img, 0.1, 5);
		expectGrid('pointy hex, noisy', img, t);
	});

	it('faint, low-contrast square grid', () => {
		const img = background(800, 600, 6);
		const t: Truth = { kind: 'square', w: 36, x: 22.4, y: 7.6 };
		drawGrid(img, t, 1, 0.12);
		addNoise(img, 0.03, 6);
		expectGrid('square, faint', img, t);
	});

	it('faint flat hex grid', () => {
		const img = background(800, 600, 7);
		const t: Truth = { kind: 'hex-flat', w: 52, x: 12.3, y: 40.1 };
		drawGrid(img, t, 1, 0.15);
		addNoise(img, 0.03, 7);
		expectGrid('flat hex, faint', img, t);
	});

	it('stretched square cells (w ≠ h)', () => {
		const img = background(720, 600, 8);
		const t: Truth = { kind: 'square', w: 30, h: 38.5, x: 3.1, y: 33.3 };
		drawGrid(img, t, 2, 0.6);
		expectGrid('square, stretched', img, t);
	});

	it('stretched pointy hex', () => {
		const img = background(760, 620, 9);
		const t: Truth = { kind: 'hex', w: 36, h: 52, x: 70.7, y: 12.5 };
		drawGrid(img, t, 2, 0.6);
		expectGrid('pointy hex, stretched', img, t);
	});

	it('stretched flat hex', () => {
		const img = background(760, 620, 10);
		const t: Truth = { kind: 'hex-flat', w: 50, h: 36, x: 7.7, y: 22.5 };
		drawGrid(img, t, 2, 0.6);
		expectGrid('flat hex, stretched', img, t);
	});

	it('grid printed only in rooms, black between (dungeon)', () => {
		const W = 900, H = 700;
		const img = background(W, H, 11, 0.95);
		const rand = rng(11);
		const rooms: [number, number, number, number][] = [];
		const t: Truth = { kind: 'square', w: 24, x: 10.5, y: 17.25 };
		// Rooms snap to the grid, like a dungeon editor's.
		for (let i = 0; i < 7; i++) {
			const cx = t.x - t.w / 2 + t.w * Math.floor(rand() * 30), cy = t.y - t.w / 2 + t.w * Math.floor(rand() * 22);
			rooms.push([cx, cy, t.w * (3 + Math.floor(rand() * 6)), t.w * (3 + Math.floor(rand() * 5))]);
		}
		const inRoom = (x: number, y: number) => rooms.some(([rx, ry, rw, rh]) => x >= rx && y >= ry && x < rx + rw && y < ry + rh);
		drawGrid(img, t, 1.5, 0.35, inRoom);
		// Black rock with scratchy hatching outside the rooms.
		for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!inRoom(x, y)) img.data[y * W + x] = 0.05;
		for (let s = 0; s < 3000; s++) {
			const x0 = rand() * W, y0 = rand() * H, a = rand() * Math.PI, len = 6 + rand() * 14;
			for (let k = 0; k < len; k++) {
				const x = Math.floor(x0 + Math.cos(a) * k), y = Math.floor(y0 + Math.sin(a) * k);
				if (x >= 0 && y >= 0 && x < W && y < H && !inRoom(x, y)) img.data[y * W + x] = 0.45;
			}
		}
		expectGrid('dungeon rooms', img, t);
	});

	it('a hint rescues a faint grid under strong floorboards', () => {
		const W = 800, H = 600;
		const img = background(W, H, 12);
		// Floorboards: strong vertical seams every 13 px and staggered butt joints, not part of the grid.
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const seam = x % 13 < 1;
				const joint = (y + 37 * Math.floor(x / 13)) % 90 < 1;
				if (seam || joint) img.data[y * W + x] *= 0.45;
			}
		}
		const t: Truth = { kind: 'square', w: 41, x: 30.2, y: 12.8 };
		drawGrid(img, t, 1, 0.15);
		addNoise(img, 0.02, 12);
		// Left alone, the detector takes the boards for the grid.
		const blind = detectGrid(img, { kind: 'square' });
		const be = blind && errors(blind, t, W, H);
		report.push(`hint rescue, no hint: ${blind && be ? `w ${blind.w.toFixed(1)} h ${blind.h.toFixed(1)}, size err ${(be.size * 100).toFixed(0)}%, conf ${blind.confidence.toFixed(2)}` : 'null'}`);
		expect(!be || be.size > 0.1).toBe(true);
		// The user's box over 3×3 cells: a little off in size and centre.
		expectGrid('hint rescue, with hint', img, t, { w: 42.5, x: 30.2 + 41 * 4 + 6, y: 12.8 + 41 * 3 - 4 });
	});

	it('a hint picks the right hex placement and size', () => {
		const img = background(760, 560, 16);
		const t: Truth = { kind: 'hex', w: 44, x: 25.5, y: 31 };
		drawGrid(img, t, 1, 0.2);
		addNoise(img, 0.06, 16);
		// A centre four cells across and two rows down, boxed a little loosely.
		const c = { x: t.x + 44 * 5 + 5, y: t.y + 0.75 * ((2 * 44) / Math.sqrt(3)) * 2 - 6 };
		expectGrid('pointy hex, with hint', img, t, { w: 46, ...c });
	});

	it('a blank image has no grid', () => {
		const img = background(640, 480, 13);
		addNoise(img, 0.04, 13);
		for (const kind of ['square', 'hex', 'hex-flat'] as const) {
			const res = detectGrid(img, { kind });
			report.push(`blank (${kind}): ${res ? `conf ${res.confidence.toFixed(2)}` : 'null'}`);
			if (res) expect(res.confidence).toBeLessThan(GOOD_MATCH);
		}
	});

	it('yields while it works', () => {
		const img = background(800, 600, 14);
		drawGrid(img, { kind: 'square', w: 30, x: 15, y: 15 }, 2, 0.5);
		const it = detectGridSteps(img, { kind: 'square' });
		let yields = 0;
		let step = it.next();
		while (!step.done) { yields++; step = it.next(); }
		expect(yields).toBeGreaterThan(10);
		expect(step.value?.w).toBeCloseTo(30, 0);
	});

	it('downscales big images and maps back to input pixels', () => {
		const img = background(1200, 900, 15);
		const t: Truth = { kind: 'hex', w: 60, x: 41, y: 77 };
		drawGrid(img, t, 3, 0.5);
		const res = detectGrid(img, { kind: 'hex', maxSide: 500 });
		expect(res).not.toBeNull();
		const e = errors(res!, t, img.width, img.height);
		report.push(`downscaled ×3 hex            size ${(e.size * 100).toFixed(2)}%  offset ${(e.offset * 100).toFixed(2)}% of a cell`);
		expect(e.size).toBeLessThan(0.02);
		expect(e.offset).toBeLessThan(0.03);
	});
});

// ----------------------------------------------------------------------------
// Real maps

function loadGray(path: string): GrayImage {
	return toGray(decodePng(new Uint8Array(readFileSync(path))));
}

describe('grid detection on real maps', () => {
	it('Quicksilver Vaults (Dungeon Scrawl, grid only inside rooms)', () => {
		const img = loadGray('sample-vault/Campaigns/The Old Quarter/Assets/quicksilver-vaults-map.png');
		expect([img.width, img.height]).toEqual([1940, 2310]);
		// Measured by averaging luminance across strips inside rooms 7 and 4: the
		// grid lines are 2 px wide (luminance 0.33 on white) on pixel columns
		// 329–330, 399–400, 469–470, 539–540 and (room 4) 1449–1450 … 1659–1660,
		// and rows 1819–1820 … 2029–2030 and (room 4) 1259–1260 … 1539–1540.
		// Every gap is 70 px (16 cells = 1120 px across, 8 cells = 560 px down),
		// so lines sit at x = 330 + 70n, y = 1260 + 70n (pixel-edge coordinates)
		// and one cell centre is at (365, 1295).
		const t: Truth = { kind: 'square', w: 70, x: 365, y: 1295 };
		const res = expectGrid('quicksilver vaults', img, t);
		expect(res.confidence).toBeGreaterThanOrEqual(GOOD_MATCH);
	});

	it('the e2e hex fixture (scripts/make-hex-map.mjs)', () => {
		const img = loadGray('e2e/fixtures/vault/Maps/hex-world.png');
		// The truth printed at the top of scripts/make-hex-map.mjs.
		const t: Truth = { kind: 'hex', w: 64, x: 37, y: 41 };
		const res = expectGrid('hex-world fixture', img, t, undefined, 0.03, 0.03);
		expect(res.confidence).toBeGreaterThanOrEqual(GOOD_MATCH);
	});
});

// The numbers behind the tolerances, for whoever tunes the detector next:
//   GRID_REPORT=1 npx vitest run tests/grid-detect.test.ts --silent=false
afterAll(() => {
	if (process.env.GRID_REPORT) console.log(`\n${report.join('\n')}`);
});
