// Finds the grid printed on a map image: cell size and one cell centre, in the
// image's pixels, using the same conventions as grid-def.ts. Pure: no Obsidian,
// no DOM. It's a generator so the UI can run it in idle slices; `detectGrid`
// runs it straight through.
//
// Method:
//  1. Box-downscale to at most `maxSide` on the long side (an integer factor,
//     so mapping back is exact).
//  2. Measure thin-line energy per pixel, across x (vertical lines) and across
//     y (horizontal or slanted lines) separately. This is a ridge measure (the
//     pixel darker, or lighter, than both neighbours 1–3 px away) rather than
//     raw gradient: grid lines are thin, while the things that fool a gradient
//     (dungeon walls, coastlines, shading) are edges between two areas, and
//     score nothing. Square-rooted, so bold art can't drown out a fine grid.
//  3. Project it onto the axes. A grid turns these profiles into combs.
//  4. Find each comb's period by folding the profile at every candidate period
//     and comparing the tallest tooth with whatever stands more than a quarter
//     period from it. Multiples of the true period always have another tooth
//     there, and fractions of it fold in empty space, so the true period wins.
//     The scan is fine enough that the comb can't drift half a pixel between
//     steps; with a hint it only covers ±10% of the hinted size.
//  5. The offset is the centroid of the folded comb's tallest tooth.
//  6. Hexes are worked as pointy-top (flat-top images are transposed). Their
//     vertical edges repeat every w/2 across. Down, rows show only as broad
//     bands every 0.75h, so for a precise h the slanted edges are sheared flat
//     into a comb every h/2. The leftover ambiguity (which of three rows is
//     centred where) is settled by scoring each candidate on the image.
//  7. The same score (line energy on the predicted cell edges against energy
//     off them, sampled cell by cell) polishes the offset and size by a
//     fraction of a pixel, and gives the confidence.

/** Luminance 0..1, row-major. */
export interface GrayImage { data: Float32Array; width: number; height: number }
export type DetectKind = 'square' | 'hex' | 'hex-flat';
/** A cell size and a cell centre, in input pixels (from the user boxing 3×3 cells). */
export interface DetectHint { w: number; h?: number; x: number; y: number }
/** Cell bounding-box size and one cell centre in input pixels; confidence 0..1. */
export interface DetectResult { w: number; h: number; x: number; y: number; confidence: number }
export interface DetectOptions { kind: DetectKind; hint?: DetectHint; maxSide?: number }

/**
 * At or above this the UI says "Good match"; below it, "Rough guess". Real
 * grids score 0.7–1 (the busy Quicksilver Vaults dungeon 0.73), while images
 * with no grid score under 0.45 or return null. See `confidenceOf`.
 */
export const GOOD_MATCH = 0.6;

const SQRT3 = Math.sqrt(3);
/** Rows processed between yields in the per-pixel passes. */
const ROWS_PER_YIELD = 64;
/** Cells sampled when scoring a candidate grid. */
const MAX_SCORED_CELLS = 2500;
/** Ridge widths (px either side) tried: lines up to about 5 px wide after downscaling. */
const REACH = 3;

interface Lines {
	img: GrayImage;
	/** Vertical-line energy summed down each column, and along each row. */
	colV: Float64Array;
	rowV: Float64Array;
	/** Horizontal or slanted line energy summed along each row. */
	rowH: Float64Array;
	/** Hexes only: slanted-line energy per pixel, + for lines running down to the right, − for up. */
	slant?: Float32Array;
}

/** A grid in working pixels: square, or pointy-top hex. */
interface Geo { hex: boolean; w: number; h: number; ox: number; oy: number }

export function detectGrid(img: GrayImage, opts: DetectOptions): DetectResult | null {
	const it = detectGridSteps(img, opts);
	for (;;) {
		const step = it.next();
		if (step.done) return step.value;
	}
}

export function* detectGridSteps(img: GrayImage, opts: DetectOptions): Generator<void, DetectResult | null, void> {
	if (img.width < 24 || img.height < 24) return null;
	const k = Math.max(1, Math.ceil(Math.max(img.width, img.height) / (opts.maxSide ?? 2048)));
	let work = yield* downscale(img, k);
	// Flat-top hexes are pointy-top hexes on their side.
	const flat = opts.kind === 'hex-flat';
	if (flat) work = yield* transpose(work);
	const lines = yield* lineEnergy(work, opts.kind !== 'square');

	// The hint, in working pixels and the pointy-top frame.
	let hint: DetectHint | undefined;
	if (opts.hint && opts.hint.w > 0) {
		const hh = opts.hint.h && opts.hint.h > 0 ? opts.hint.h : regular(opts.kind, opts.hint.w);
		hint = flat
			? { w: hh / k, h: opts.hint.w / k, x: opts.hint.y / k, y: opts.hint.x / k }
			: { w: opts.hint.w / k, h: hh / k, x: opts.hint.x / k, y: opts.hint.y / k };
	}

	const found = opts.kind === 'square' ? yield* findSquare(lines, hint) : yield* findHex(lines, hint);
	if (!found) return null;
	const geo = yield* refine(work, found);
	// A grid repeats: a handful of huge "cells" lined up with a few strong lines is more likely a coincidence.
	const repeats = Math.min(work.width / geo.w, work.height / (geo.hex ? 0.75 * geo.h : geo.h));
	const confidence = confidenceOf(yield* scoreGrid(work, geo), repeats);
	if (confidence <= 0) return null;

	const c = normalise(geo, hint);
	return flat
		? { w: c.h * k, h: c.w * k, x: c.oy * k, y: c.ox * k, confidence }
		: { w: c.w * k, h: c.h * k, x: c.ox * k, y: c.oy * k, confidence };
}

function regular(kind: DetectKind, w: number): number {
	return kind === 'hex' ? (2 * w) / SQRT3 : kind === 'hex-flat' ? (w * SQRT3) / 2 : w;
}

// ----------------------------------------------------------------------------
// Pixels

function* downscale(img: GrayImage, k: number): Generator<void, GrayImage, void> {
	if (k === 1) return img;
	const width = Math.floor(img.width / k);
	const height = Math.floor(img.height / k);
	const out = new Float32Array(width * height);
	const inv = 1 / (k * k);
	for (let y = 0; y < height; y++) {
		for (let dy = 0; dy < k; dy++) {
			const src = (y * k + dy) * img.width;
			const dst = y * width;
			for (let x = 0; x < width; x++) {
				let s = 0;
				for (let dx = 0; dx < k; dx++) s += img.data[src + x * k + dx];
				out[dst + x] += s * inv;
			}
		}
		if (y % ROWS_PER_YIELD === ROWS_PER_YIELD - 1) yield;
	}
	return { data: out, width, height };
}

function* transpose(img: GrayImage): Generator<void, GrayImage, void> {
	const out = new Float32Array(img.data.length);
	for (let y = 0; y < img.height; y++) {
		for (let x = 0; x < img.width; x++) out[x * img.height + y] = img.data[y * img.width + x];
		if (y % ROWS_PER_YIELD === 0) yield;
	}
	return { data: out, width: img.height, height: img.width };
}

/** How much c stands out from both a and b, dark or light; 0 for a plain edge. */
function ridge(a: number, c: number, b: number): number {
	return Math.max(0, Math.min(a - c, b - c), Math.min(c - a, c - b));
}

function* lineEnergy(img: GrayImage, hex: boolean): Generator<void, Lines, void> {
	const { width: W, height: H, data: I } = img;
	// Smoothed along the line direction, which keeps lines and calms noise.
	const sv = new Float32Array(W * H);
	const sh = new Float32Array(W * H);
	for (let y = 1; y < H - 1; y++) {
		for (let x = 1; x < W - 1; x++) {
			const i = y * W + x;
			sv[i] = (I[i - W] + I[i] + I[i + W]) / 3;
			sh[i] = (I[i - 1] + I[i] + I[i + 1]) / 3;
		}
		if (y % ROWS_PER_YIELD === 0) yield;
	}
	const colV = new Float64Array(W);
	const rowV = new Float64Array(H);
	const rowH = new Float64Array(H);
	const slant = hex ? new Float32Array(W * H) : undefined;
	const R = REACH;
	for (let y = R + 1; y < H - R - 1; y++) {
		for (let x = R + 1; x < W - R - 1; x++) {
			const i = y * W + x;
			let rv = 0, rh = 0;
			for (let d = 1; d <= R; d++) {
				rv = Math.max(rv, ridge(sv[i - d], sv[i], sv[i + d]));
				rh = Math.max(rh, ridge(sh[i - d * W], sh[i], sh[i + d * W]));
			}
			if (rv > rh) {
				const v = Math.sqrt(rv - rh);
				colV[x] += v;
				rowV[y] += v;
			} else if (rh > rv) {
				const v = Math.sqrt(rh - rv);
				rowH[y] += v;
				if (slant) {
					// Which diagonal the line runs along: a line running down to the
					// right stands out across the (−1, +1) diagonal.
					let ra = 0, rd = 0;
					for (let d = 1; d <= 2; d++) {
						ra = Math.max(ra, ridge(I[i - d * (W - 1)], I[i], I[i + d * (W - 1)]));
						rd = Math.max(rd, ridge(I[i - d * (W + 1)], I[i], I[i + d * (W + 1)]));
					}
					slant[i] = ra > rd ? v : -v;
				}
			}
		}
		if (y % ROWS_PER_YIELD === 0) yield;
	}
	return { img, colV, rowV, rowH, slant };
}

// ----------------------------------------------------------------------------
// Periods in 1-D profiles

interface Period { p: number; phase: number; c: number }

function centred(P: ArrayLike<number>): Float64Array {
	const out = new Float64Array(P.length);
	let m = 0;
	for (let i = 0; i < P.length; i++) m += P[i];
	m /= P.length || 1;
	for (let i = 0; i < P.length; i++) out[i] = P[i] - m;
	return out;
}

/** The profile folded into one period: bin b holds the mean at phase b/nb of the period. */
function fold(p: Float64Array, period: number, nb: number): Float64Array {
	const sum = new Float64Array(nb);
	const cnt = new Float64Array(nb);
	const inv = 1 / period;
	for (let i = 0; i < p.length; i++) {
		let t = (i + 0.5) * inv;
		t = (t - Math.floor(t)) * nb;
		const b0 = Math.floor(t);
		const f = t - b0;
		const b1 = b0 + 1 === nb ? 0 : b0 + 1;
		sum[b0] += p[i] * (1 - f); cnt[b0] += 1 - f;
		sum[b1] += p[i] * f; cnt[b1] += f;
	}
	for (let b = 0; b < nb; b++) sum[b] = cnt[b] > 0 ? sum[b] / cnt[b] : 0;
	return sum;
}

function bins(period: number): number {
	return Math.max(8, 2 * Math.ceil(Math.min(period, 96) / 2));
}

/**
 * How comb-like the profile is at this period: the tallest tooth of the fold
 * against the strongest phase more than a quarter period away from it.
 */
function foldContrast(p: Float64Array, period: number): number {
	const nb = bins(period);
	const m = fold(p, period, nb);
	const s = new Float64Array(nb);
	let top = 0;
	for (let b = 0; b < nb; b++) {
		s[b] = (m[(b + nb - 1) % nb] + 2 * m[b] + m[(b + 1) % nb]) / 4;
		if (s[b] > s[top]) top = b;
	}
	let off = -Infinity;
	for (let j = 0; j < nb; j++) {
		const d = Math.abs(j - top);
		if (Math.min(d, nb - d) > nb / 4) off = Math.max(off, s[j]);
	}
	return s[top] - off;
}

/**
 * Where the comb's teeth sit (mod the period): the centroid of the tallest
 * tooth's upper half. Unlike the phase of the fundamental, art elsewhere in
 * the period (wall edges, shadows) can't pull it.
 */
function toothPhase(p: Float64Array, period: number): number {
	// About one bin per pixel: finer bins would mostly hold stray slivers of samples.
	const nb = Math.max(8, Math.round(period));
	const m = fold(p, period, nb);
	let top = 0;
	for (let b = 0; b < nb; b++) if (m[b] > m[top]) top = b;
	const median = Float64Array.from(m).sort()[nb >> 1];
	const floor = median + 0.5 * (m[top] - median);
	const win = Math.max(2, Math.round(nb / 8));
	let sw = 0, sx = 0;
	for (let d = -win; d <= win; d++) {
		const v = m[(top + d + nb) % nb] - floor;
		if (v > 0) { sw += v; sx += v * d; }
	}
	const x = ((top + (sw > 0 ? sx / sw : 0)) / nb) * period;
	return ((x % period) + period) % period;
}

/** The best period in [lo, hi], scanned so the comb drifts at most half a pixel across the profile per step. */
function* bestPeriod(p: Float64Array, lo: number, hi: number): Generator<void, Period | null, void> {
	const N = p.length;
	if (!(hi > lo)) return null;
	let best = lo, bestC = -Infinity, n = 0;
	for (let q = lo; q <= hi; q += Math.max(0.005, (0.5 * q) / N)) {
		const c = foldContrast(p, q);
		if (c > bestC) { bestC = c; best = q; }
		if (++n % 256 === 0) yield;
	}
	const step = Math.max(0.005, (0.5 * best) / N);
	for (let q = best - step; q <= best + step; q += step / 5) {
		const c = foldContrast(p, q);
		if (c > bestC) { bestC = c; best = q; }
	}
	return { p: best, phase: toothPhase(p, best), c: bestC };
}

/** The profile's period: within 10% of `expect` when there's a hint, else from `minP` to a third of the profile. */
function* findPeriod(P: ArrayLike<number>, minP: number, maxP: number, expect?: number): Generator<void, Period | null, void> {
	const p = centred(P);
	if (expect) return yield* bestPeriod(p, Math.max(2, expect * 0.9), expect * 1.1);
	return yield* bestPeriod(p, minP, Math.min(maxP, p.length / 3));
}

// ----------------------------------------------------------------------------
// Grids

function* findSquare(e: Lines, hint?: DetectHint): Generator<void, Geo | null, void> {
	const px = yield* findPeriod(e.colV, 6, e.img.width / 3, hint?.w);
	yield;
	const py = yield* findPeriod(e.rowH, 6, e.img.height / 3, hint?.h);
	if (!px || !py) return null;
	// The comb sits on the cell edges; the centre is half a cell on.
	return { hex: false, w: px.p, h: py.p, ox: px.phase + px.p / 2, oy: py.phase + py.p / 2 };
}

function* findHex(e: Lines, hint?: DetectHint): Generator<void, Geo | null, void> {
	const { width: W, height: H } = e.img;
	// Across: the vertical edges of both row parities, every w/2.
	const px = yield* findPeriod(e.colV, 4, W / 6, hint ? hint.w / 2 : undefined);
	if (!px) return null;
	const w = px.p * 2;
	yield;
	let h0 = hint?.h;
	if (!h0) {
		// A rough h from the bands: slanted lines minus vertical lines is a square wave every 0.75h.
		let sh = 0, sv = 0;
		for (let y = 0; y < H; y++) { sh += e.rowH[y]; sv += e.rowV[y]; }
		const beta = sv > 0 ? sh / sv : 0;
		const rows = new Float64Array(H);
		for (let y = 0; y < H; y++) rows[y] = e.rowH[y] - beta * e.rowV[y];
		const py = yield* findPeriod(rows, 6, H / 3);
		if (!py) return null;
		h0 = py.p / 0.75;
	}
	const pad = Math.ceil(h0);
	const sheared = yield* shearSlants(e, w, h0, px.phase, pad);
	const pz = yield* findPeriod(sheared, 3, sheared.length / 3, h0 / 2);
	if (!pz) return null;
	const h = pz.p * 2;
	// The teeth sit h/4 below the centres of the rows centred on x = px.phase
	// (mod w). Those rows repeat every 1.5h, so three placements are possible.
	const base = pz.phase - pad - h / 4;
	const scored: { g: Geo; s: number }[] = [];
	for (let k = 0; k < 3; k++) {
		const g: Geo = { hex: true, w, h, ox: px.phase, oy: base + k * (h / 2) };
		scored.push({ g, s: (yield* scoreGrid(e.img, g)).contrast });
	}
	scored.sort((a, b) => b.s - a.s);
	if (hint) {
		// The hint's box is centred on a cell: take the placement with a centre
		// nearest it, unless that one fits the image far worse.
		const near = scored
			.filter(c => c.s >= scored[0].s * 0.5)
			.sort((a, b) => nearestCentreDist(a.g, hint.x, hint.y) - nearestCentreDist(b.g, hint.x, hint.y));
		return near[0].g;
	}
	return scored[0].g;
}

/**
 * Slanted-line energy projected down a sheared y′: each pixel's y less where
 * it would sit along its zigzag, so every slanted edge lands on the same
 * y′ (mod h/2), h/4 below the centre of a row centred on x0. An error in the
 * rough h only blurs the teeth by a fraction of a pixel, as the shear never
 * moves anything more than h/2. Index i of the result is y′ = i + 0.5 − pad.
 */
function* shearSlants(e: Lines, w: number, h: number, x0: number, pad: number): Generator<void, Float64Array, void> {
	const { width: W, height: H } = e.img;
	const slant = e.slant;
	const out = new Float64Array(H + 2 * pad);
	if (!slant) return out;
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const v = slant[y * W + x];
			if (v === 0) continue;
			let t = (x + 0.5 - x0) / w + 0.5;
			t -= Math.floor(t);
			const yy = y + (v > 0 ? -1 : 1) * (h / 2) * t + pad;
			const j = Math.floor(yy);
			const f = yy - j;
			if (j >= 0 && j + 1 < out.length) {
				const a = Math.abs(v);
				out[j] += a * (1 - f);
				out[j + 1] += a * f;
			}
		}
		if (y % ROWS_PER_YIELD === 0) yield;
	}
	return out;
}

function centreOf(g: Geo, q: number, r: number): { x: number; y: number } {
	return g.hex
		? { x: g.ox + (q + r / 2) * g.w, y: g.oy + 0.75 * r * g.h }
		: { x: g.ox + q * g.w, y: g.oy + r * g.h };
}

/** The lattice index of the centre nearest a point. */
function nearestCell(g: Geo, x: number, y: number): { q: number; r: number } {
	const rowStep = g.hex ? 0.75 * g.h : g.h;
	const r0 = Math.round((y - g.oy) / rowStep);
	let best = { q: 0, r: r0 }, bd = Infinity;
	for (let r = r0 - 1; r <= r0 + 1; r++) {
		const q = Math.round((x - g.ox) / g.w - (g.hex ? r / 2 : 0));
		for (let qq = q - 1; qq <= q + 1; qq++) {
			const c = centreOf(g, qq, r);
			const d = (c.x - x) ** 2 + (c.y - y) ** 2;
			if (d < bd) { bd = d; best = { q: qq, r }; }
		}
	}
	return best;
}

function nearestCentreDist(g: Geo, x: number, y: number): number {
	const { q, r } = nearestCell(g, x, y);
	const c = centreOf(g, q, r);
	return Math.hypot(c.x - x, c.y - y);
}

/** The centre nearest the hint, or else the one nearest the top-left corner. */
function normalise(g: Geo, hint?: DetectHint): Geo {
	const at = hint ? nearestCell(g, hint.x, hint.y) : nearestCell(g, g.w / 2, g.h / 2);
	const c = centreOf(g, at.q, at.r);
	return { ...g, ox: c.x, oy: c.y };
}

/**
 * Polishes a grid against the image, cell by cell: the offset (up to a pixel
 * each way), then each cell dimension (±0.4%, scaled about the image centre).
 * The profiles average over the whole image, so art that hugs the grid (a wall
 * drawn along one side of a line) can pull them by a fraction of a pixel; the
 * cell-by-cell score isn't fooled by that.
 */
function* refine(img: GrayImage, g: Geo): Generator<void, Geo, void> {
	const cx = img.width / 2, cy = img.height / 2;
	g = yield* nudge(img, t => ({ ...g, ox: g.ox + t }), 0.25);
	g = yield* nudge(img, t => ({ ...g, oy: g.oy + t }), 0.25);
	g = yield* nudge(img, t => ({ ...g, w: g.w * (1 + t), ox: cx + (g.ox - cx) * (1 + t) }), 0.001);
	g = yield* nudge(img, t => ({ ...g, h: g.h * (1 + t), oy: cy + (g.oy - cy) * (1 + t) }), 0.001);
	return g;
}

/** Scores `at(t)` for t in ±4 steps and moves to the centroid of the curve's upper half (thick lines give a flat top, where the argmax would wander). */
function* nudge(img: GrayImage, at: (t: number) => Geo, step: number): Generator<void, Geo, void> {
	const n = 4;
	const s: number[] = [];
	for (let i = -n; i <= n; i++) s.push((yield* scoreGrid(img, at(i * step))).contrast);
	const hi = Math.max(...s), lo = Math.min(...s);
	const floor = (hi + lo) / 2;
	let sw = 0, sx = 0;
	for (let i = 0; i < s.length; i++) {
		const v = s[i] - floor;
		if (v > 0) { sw += v; sx += v * (i - n) * step; }
	}
	return at(sw > 0 ? sx / sw : 0);
}

// ----------------------------------------------------------------------------
// Scoring a whole grid

interface Fit {
	/** (on − off) / (on + off) over every sampled cell. */
	contrast: number;
	/** Of the cells with any line energy, the share whose edges clearly beat their insides. */
	hits: number;
	/** Roughly how many cells in the whole image are such hits. */
	hitCells: number;
}

/**
 * Samples a grid's cells (up to MAX_SCORED_CELLS, spread over the image) and
 * measures line energy across each predicted edge against the same measure
 * halfway to the cell's centre and at the centre.
 */
function* scoreGrid(img: GrayImage, g: Geo): Generator<void, Fit, void> {
	const { width: W, height: H, data: I } = img;
	// Each cell's own edges (the rest belong to its neighbours), as corner offsets from its centre.
	let segs: number[][];
	if (g.hex) {
		const corner = (i: number) => {
			const a = (Math.PI / 180) * (60 * i - 90);
			return [(Math.cos(a) * g.w) / SQRT3, (Math.sin(a) * g.h) / 2];
		};
		segs = [[4, 5], [5, 0], [0, 1]].map(([a, b]) => [...corner(a), ...corner(b)]);
	} else {
		segs = [[-g.w / 2, -g.h / 2, -g.w / 2, g.h / 2], [-g.w / 2, -g.h / 2, g.w / 2, -g.h / 2]];
	}
	const rowStep = g.hex ? 0.75 * g.h : g.h;
	const rMin = Math.floor((-g.h - g.oy) / rowStep);
	const rMax = Math.ceil((H + g.h - g.oy) / rowStep);
	const stride = Math.max(1, Math.ceil(Math.sqrt(((rMax - rMin + 1) * (W / g.w + 4)) / MAX_SCORED_CELLS)));
	const m = REACH + 1;

	const at = (x: number, y: number) => {
		// Bilinear, pixel centres at +0.5.
		const fx = x - 0.5, fy = y - 0.5;
		const x0 = Math.floor(fx), y0 = Math.floor(fy);
		const tx = fx - x0, ty = fy - y0;
		const i = y0 * W + x0;
		return (I[i] * (1 - tx) + I[i + 1] * tx) * (1 - ty) + (I[i + W] * (1 - tx) + I[i + W + 1] * tx) * ty;
	};
	const across = (x: number, y: number, nx: number, ny: number) => {
		if (x < m || y < m || x > W - m || y > H - m) return -1;
		const c = at(x, y);
		let r = 0;
		for (let d = 1; d <= REACH; d++) r = Math.max(r, ridge(at(x - d * nx, y - d * ny), c, at(x + d * nx, y + d * ny)));
		return r;
	};

	let on = 0, off = 0, active = 0, hits = 0, rows = 0;
	for (let r = rMin; r <= rMax; r += stride) {
		const shift = g.hex ? r / 2 : 0;
		const qMin = Math.floor(-g.ox / g.w - shift) - 1;
		const qMax = Math.ceil((W - g.ox) / g.w - shift) + 1;
		for (let q = qMin; q <= qMax; q += stride) {
			const c = centreOf(g, q, r);
			let cellOn = 0, cellOff = 0;
			for (const [ax, ay, bx, by] of segs) {
				const len = Math.hypot(bx - ax, by - ay) || 1;
				const nx = (by - ay) / len, ny = -(bx - ax) / len;
				for (const t of [0.2, 0.4, 0.6, 0.8]) {
					const px = c.x + ax + (bx - ax) * t;
					const py = c.y + ay + (by - ay) * t;
					const e = across(px, py, nx, ny);
					const h1 = across((px + c.x) / 2, (py + c.y) / 2, nx, ny);
					const h2 = across(c.x, c.y, nx, ny);
					if (e < 0 || h1 < 0 || h2 < 0) continue;
					cellOn += e;
					cellOff += (h1 + h2) / 2;
				}
			}
			on += cellOn;
			off += cellOff;
			if (cellOn + cellOff > 0.02) {
				active++;
				if (cellOn > 2 * cellOff) hits++;
			}
		}
		if (++rows % 8 === 0) yield;
	}
	return {
		contrast: on + off > 0 ? (on - off) / (on + off) : 0,
		hits: active > 0 ? hits / active : 0,
		hitCells: hits * stride * stride,
	};
}

/**
 * Confidence from a fit, calibrated on tests/grid-detect.test.ts and the
 * sample vault's images. Clean grids give contrast ≈ 0.9 with nearly every
 * cell a hit (confidence 1); a dungeon whose grid shows only in the rooms
 * keeps a good contrast with fewer hits (Quicksilver Vaults: 0.73); blank or
 * noisy images usually give no result at all. Portraits and UI screenshots
 * can line a few huge "cells" up with a few strong lines (0.1–0.45), so a fit
 * also needs about 40 cells' worth of hits and 5 repeats each way to count
 * fully.
 */
function confidenceOf(f: Fit, repeats: number): number {
	const c = Math.max(0, Math.min(1, (f.contrast - 0.08) / 0.5));
	const h = Math.max(0, Math.min(1, (f.hits - 0.1) / 0.5));
	const n = Math.min(1, f.hitCells / 40) * Math.max(0, Math.min(1, (repeats - 2) / 3));
	return Math.round(Math.sqrt(c * h) * n * 100) / 100;
}
