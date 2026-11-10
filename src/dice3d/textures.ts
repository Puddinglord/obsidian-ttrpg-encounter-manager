// Textures we draw ourselves on a canvas: speckles, marble veins, wood grain…
// No image files, so there's nothing to license. Patterns are mostly greys,
// blended onto the die's colour (multiply darkens, screen lightens), and also
// used as a bump map so the surface catches light.

type G = CanvasRenderingContext2D;

/** Small seeded random, so a die's texture doesn't flicker between redraws. */
function rng(seed: number): () => number {
	let s = (seed >>> 0) || 1;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

/** 2D value noise in [0, 1], smoothly interpolated over a lattice. */
function noise2(seed: number): (x: number, y: number) => number {
	const r = rng(seed);
	const N = 64;
	const grid = Array.from({ length: N * N }, () => r());
	const at = (x: number, y: number) => grid[((y % N + N) % N) * N + ((x % N + N) % N)];
	const fade = (t: number) => t * t * (3 - 2 * t);
	return (x, y) => {
		const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
		const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
		return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
	};
}

function fbm(n: (x: number, y: number) => number, x: number, y: number, octaves = 4): number {
	let v = 0, amp = 0.5, f = 1, norm = 0;
	for (let o = 0; o < octaves; o++) { v += amp * n(x * f, y * f); norm += amp; amp *= 0.5; f *= 2; }
	return v / norm;
}

/** Fill a square cell from per-pixel greys (0 black … 1 white). */
function pixels(g: G, x0: number, y0: number, size: number, fn: (u: number, v: number) => number): void {
	const img = g.createImageData(size, size);
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
		const k = Math.max(0, Math.min(255, Math.round(fn(x / size, y / size) * 255)));
		const o = (y * size + x) * 4;
		img.data[o] = img.data[o + 1] = img.data[o + 2] = k;
		img.data[o + 3] = 255;
	}
	g.putImageData(img, x0, y0);
}

/** Draw texture `id` into a size×size cell at (x0, y0). Returns false for 'none' or unknown ids. */
export function drawTexture(g: G, id: string, x0: number, y0: number, size: number, seed: number): boolean {
	const n = noise2(seed * 7919 + 13);
	const r = rng(seed * 104729 + 7);
	switch (id) {
		case 'speckles': {
			g.fillStyle = '#ffffff';
			g.fillRect(x0, y0, size, size);
			for (let i = 0; i < size * 1.6; i++) {
				const s = 0.6 + r() * 2.2;
				g.fillStyle = `rgba(0,0,0,${0.35 + r() * 0.5})`;
				g.beginPath();
				g.arc(x0 + r() * size, y0 + r() * size, s, 0, Math.PI * 2);
				g.fill();
			}
			return true;
		}
		case 'marble':
			pixels(g, x0, y0, size, (u, v) => {
				const t = Math.abs(Math.sin((u * 3 + v * 2 + fbm(n, u * 4, v * 4, 5) * 5) * Math.PI));
				return 0.55 + 0.45 * Math.pow(t, 0.25);
			});
			return true;
		case 'wood':
			pixels(g, x0, y0, size, (u, v) => {
				const ring = (v * 14 + fbm(n, u * 2, v * 6, 4) * 6) % 1;
				return 0.62 + 0.3 * Math.pow(Math.sin(ring * Math.PI), 3) + (n(u * 60, v * 4) - 0.5) * 0.12;
			});
			return true;
		case 'stone':
			pixels(g, x0, y0, size, (u, v) => 0.45 + 0.55 * fbm(n, u * 8, v * 8, 5) + (r() - 0.5) * 0.12);
			return true;
		case 'clouds':
			pixels(g, x0, y0, size, (u, v) => 0.5 + 0.5 * fbm(n, u * 3, v * 3, 5));
			return true;
		case 'swirl':
			pixels(g, x0, y0, size, (u, v) => {
				const dx = u - 0.5, dy = v - 0.5;
				const a = Math.atan2(dy, dx) + Math.hypot(dx, dy) * 9 + fbm(n, u * 3, v * 3) * 3;
				return 0.55 + 0.45 * Math.sin(a * 3);
			});
			return true;
		case 'paper':
			pixels(g, x0, y0, size, (u, v) => 0.82 + 0.18 * fbm(n, u * 10, v * 10, 4) - (Math.hypot(u - 0.5, v - 0.5) > 0.42 ? 0.08 : 0));
			return true;
		case 'stars': {
			g.fillStyle = '#000000';
			g.fillRect(x0, y0, size, size);
			for (let i = 0; i < size * 0.5; i++) {
				const s = r() < 0.08 ? 1.6 + r() * 1.6 : 0.4 + r() * 0.9;
				g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`;
				g.beginPath();
				g.arc(x0 + r() * size, y0 + r() * size, s, 0, Math.PI * 2);
				g.fill();
			}
			return true;
		}
		case 'scales': {
			g.fillStyle = '#ffffff';
			g.fillRect(x0, y0, size, size);
			const s = size / 7;
			for (let row = -1; row < 9; row++) for (let col = -1; col < 9; col++) {
				const cx = x0 + col * s + (row % 2 ? s / 2 : 0), cy = y0 + row * s * 0.7;
				const grad = g.createRadialGradient(cx, cy - s * 0.2, s * 0.1, cx, cy, s * 0.62);
				grad.addColorStop(0, 'rgba(255,255,255,1)');
				grad.addColorStop(1, 'rgba(70,70,70,1)');
				g.fillStyle = grad;
				g.beginPath();
				g.arc(cx, cy, s * 0.6, 0, Math.PI);
				g.fill();
			}
			return true;
		}
		case 'hex': {
			g.fillStyle = '#ffffff';
			g.fillRect(x0, y0, size, size);
			g.strokeStyle = 'rgba(0,0,0,0.55)';
			g.lineWidth = Math.max(1, size / 70);
			const s = size / 6;
			for (let row = -1; row < 8; row++) for (let col = -1; col < 8; col++) {
				const cx = x0 + col * s * 1.5, cy = y0 + row * s * 1.732 + (col % 2 ? s * 0.866 : 0);
				g.beginPath();
				for (let k = 0; k < 6; k++) { const a = (Math.PI / 3) * k; g.lineTo(cx + Math.cos(a) * s * 0.95, cy + Math.sin(a) * s * 0.95); }
				g.closePath();
				g.stroke();
			}
			return true;
		}
		default:
			return false;
	}
}
