// Draws the e2e hex map fixture: a pointy-top hex grid over made-up terrain.
//   node scripts/make-hex-map.mjs
// writes e2e/fixtures/vault/Maps/hex-world.png. Deterministic: the same bytes every run.
//
// The truth (what grid detection should find), in pixels:
//   image 1600 × 1200
//   kind  hex (pointy-top)
//   cell  w = 64 (4% of the width), h = 2w/√3 ≈ 73.90 (regular)
//   one cell centre at (37, 41)
//   lines about 2 px, darkening the terrain by 45%
// In a ```nimble-map block that's `grid: hex`, cell 4% wide, offset 2.3125%, 3.4167%.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zlibSync } from 'fflate';

export const WIDTH = 1600;
export const HEIGHT = 1200;
export const CELL_W = 64;
export const CELL_H = (2 * CELL_W) / Math.sqrt(3);
export const CENTRE = { x: 37, y: 41 };
const LINE = 2;
const DARKEN = 0.45;

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'e2e', 'fixtures', 'vault', 'Maps', 'hex-world.png');

function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// Terrain height: a few octaves of smooth value noise plus some soft hills and lakes.
const rand = rng(20261114);
const height = new Float32Array(WIDTH * HEIGHT);
for (const [cell, amp] of [[320, 0.5], [140, 0.25], [60, 0.12], [22, 0.06], [7, 0.03]]) {
	const gw = Math.ceil(WIDTH / cell) + 2, gh = Math.ceil(HEIGHT / cell) + 2;
	const lattice = Float32Array.from({ length: gw * gh }, () => rand() - 0.5);
	for (let y = 0; y < HEIGHT; y++) {
		const fy = y / cell, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
		for (let x = 0; x < WIDTH; x++) {
			const fx = x / cell, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
			const v = (a, b) => lattice[(iy + b) * gw + ix + a];
			const top = v(0, 0) + (v(1, 0) - v(0, 0)) * sx;
			const bot = v(0, 1) + (v(1, 1) - v(0, 1)) * sx;
			height[y * WIDTH + x] += amp * 2 * (top + (bot - top) * sy);
		}
	}
}
for (let b = 0; b < 14; b++) {
	const cx = rand() * WIDTH, cy = rand() * HEIGHT, r = 60 + rand() * 180, a = (rand() - 0.5) * 0.9;
	for (let y = Math.max(0, Math.floor(cy - 3 * r)); y < Math.min(HEIGHT, cy + 3 * r); y++) {
		for (let x = Math.max(0, Math.floor(cx - 3 * r)); x < Math.min(WIDTH, cx + 3 * r); x++) {
			height[y * WIDTH + x] += a * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
		}
	}
}

// Height to colour: water, sand, grass, forest, hills, rock.
const STOPS = [
	[-1.0, [38, 70, 120]], [-0.25, [64, 110, 160]], [-0.18, [205, 190, 140]], [-0.12, [130, 165, 90]],
	[0.15, [80, 130, 70]], [0.35, [130, 115, 80]], [0.55, [150, 145, 140]], [1.0, [235, 235, 235]],
];
function colour(h) {
	for (let i = 1; i < STOPS.length; i++) {
		const [h1, c1] = STOPS[i];
		if (h <= h1 || i === STOPS.length - 1) {
			const [h0, c0] = STOPS[i - 1];
			const t = Math.max(0, Math.min(1, (h - h0) / (h1 - h0)));
			return c0.map((v, k) => v + (c1[k] - v) * t);
		}
	}
	return STOPS[STOPS.length - 1][1];
}

const rgb = new Uint8Array(WIDTH * HEIGHT * 3);
for (let i = 0; i < WIDTH * HEIGHT; i++) {
	const c = colour(height[i]);
	// Colours in steps of 4: a touch of banding, like a painted map, and a much smaller PNG.
	for (let k = 0; k < 3; k++) rgb[i * 3 + k] = Math.max(0, Math.min(255, Math.round(c[k] / 4) * 4));
}

// The grid: the same pointy-top geometry as src/grid-def.ts (rows 0.75h apart, odd rows shifted w/2).
const cover = new Float32Array(WIDTH * HEIGHT);
const corner = (cx, cy, i) => {
	const a = (Math.PI / 180) * (60 * i - 90);
	return [cx + (Math.cos(a) * CELL_W) / Math.sqrt(3), cy + (Math.sin(a) * CELL_H) / 2];
};
const pad = LINE / 2 + 1;
for (let r = -2; r * 0.75 * CELL_H < HEIGHT + CELL_H; r++) {
	for (let q = -Math.ceil(r / 2) - 2; (q + r / 2) * CELL_W < WIDTH + CELL_W; q++) {
		const cx = CENTRE.x + (q + r / 2) * CELL_W, cy = CENTRE.y + 0.75 * r * CELL_H;
		for (let i = 0; i < 6; i++) {
			const [ax, ay] = corner(cx, cy, i), [bx, by] = corner(cx, cy, (i + 1) % 6);
			const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
			for (let y = Math.max(0, Math.floor(Math.min(ay, by) - pad)); y <= Math.min(HEIGHT - 1, Math.ceil(Math.max(ay, by) + pad)); y++) {
				for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - pad)); x <= Math.min(WIDTH - 1, Math.ceil(Math.max(ax, bx) + pad)); x++) {
					const px = x + 0.5, py = y + 0.5;
					const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
					const d = Math.hypot(px - ax - u * dx, py - ay - u * dy);
					const cov = Math.max(0, Math.min(1, LINE / 2 + 0.5 - d));
					if (cov > cover[y * WIDTH + x]) cover[y * WIDTH + x] = cov;
				}
			}
		}
	}
}
for (let i = 0; i < WIDTH * HEIGHT; i++) {
	const f = 1 - DARKEN * cover[i];
	for (let k = 0; k < 3; k++) rgb[i * 3 + k] = Math.round(rgb[i * 3 + k] * f);
}

// PNG: 8-bit RGB, the Sub filter on every row (smooth terrain compresses well), one IDAT.
const CRC = new Uint32Array(256).map((_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
function crc32(bytes) {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
	const out = new Uint8Array(12 + body.length);
	const dv = new DataView(out.buffer);
	dv.setUint32(0, body.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(body, 8);
	dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
	return out;
}
const raw = new Uint8Array((WIDTH * 3 + 1) * HEIGHT);
for (let y = 0; y < HEIGHT; y++) {
	const row = y * (WIDTH * 3 + 1);
	raw[row] = 1;
	for (let i = 0; i < WIDTH * 3; i++) raw[row + 1 + i] = (rgb[y * WIDTH * 3 + i] - (i >= 3 ? rgb[y * WIDTH * 3 + i - 3] : 0)) & 255;
}
const ihdr = new Uint8Array(13);
new DataView(ihdr.buffer).setUint32(0, WIDTH);
new DataView(ihdr.buffer).setUint32(4, HEIGHT);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // RGB
const png = Buffer.concat([
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
	chunk('IHDR', ihdr),
	chunk('IDAT', zlibSync(raw, { level: 9 })),
	chunk('IEND', new Uint8Array(0)),
]);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`Wrote ${OUT} (${png.length} bytes): hex ${CELL_W}×${CELL_H.toFixed(2)} px, centre (${CENTRE.x}, ${CENTRE.y})`);
