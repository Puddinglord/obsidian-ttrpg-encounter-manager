// The landing page's opening scene: the GM narrates, you roll a d20 (always a
// natural 20, thrown with the plugin's own 3D dice), and the screen burns away
// to reveal the site. Shown once per browser session.

import './obsidian-shim';
import { dice3dSupported, roll3d } from '../src/dice3d';

const LINES = [
	'A sharp wind rushes down the corridor. Your torch slips from your fingers, and when it hits the stone, the flame dies.',
	'In the dark, the air grows thin. An unnatural cold settles over the vault.',
	'Roll to light it again.',
];

const root = activeDocument.documentElement;
const gate = activeDocument.getElementById('site-gate');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms));

/** Type a line out letter by letter. A click finishes it at once. */
function typeLine(el: HTMLElement, text: string): Promise<void> {
	return new Promise((resolve) => {
		if (reduceMotion) { el.textContent = text; resolve(); return; }
		let i = 0;
		let skip = false;
		const onSkip = () => { skip = true; };
		gate?.addEventListener('pointerdown', onSkip, { once: true });
		const tick = () => {
			if (skip) i = text.length;
			el.textContent = text.slice(0, i);
			if (i >= text.length) { gate?.removeEventListener('pointerdown', onSkip); resolve(); return; }
			const ch = text[i++];
			window.setTimeout(tick, ch === ',' ? 160 : ch === '.' ? 320 : 26 + Math.random() * 22);
		};
		tick();
	});
}

/** Burn the gate away from (ox, oy): a noisy edge of glowing embers eats outward. */
function burnAway(ox: number, oy: number): Promise<void> {
	return new Promise((resolve) => {
		const k = 2; // work at half the screen's resolution, then smooth it up
		const W = Math.ceil(window.innerWidth / k), H = Math.ceil(window.innerHeight / k);
		const canvas = createEl('canvas', { cls: 'gate-burn' });
		const view = canvas.getContext('2d')!;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
		const work = createEl('canvas');
		work.width = W; work.height = H;
		const wctx = work.getContext('2d')!;
		const img = wctx.createImageData(W, H);

		// Value noise, three octaves.
		const grid = (n: number) => { const g = new Float32Array((n + 1) * (n + 1)); for (let i = 0; i < g.length; i++) g[i] = Math.random(); return g; };
		const octaves = [6, 14, 32].map(n => ({ n, g: grid(n) }));
		const field = new Float32Array(W * H);
		const maxD = Math.hypot(Math.max(ox, window.innerWidth - ox), Math.max(oy, window.innerHeight - oy));
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				let v = 0, amp = 0.55, total = 0;
				for (const { n, g } of octaves) {
					const fx = (x / W) * n, fy = (y / H) * n;
					const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
					const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
					const a = g[iy * (n + 1) + ix], b = g[iy * (n + 1) + ix + 1];
					const c = g[(iy + 1) * (n + 1) + ix], d = g[(iy + 1) * (n + 1) + ix + 1];
					v += amp * (a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy);
					total += amp; amp *= 0.5;
				}
				const dist = Math.hypot(x * k - ox, y * k - oy) / maxD;
				field[y * W + x] = dist * 0.72 + (v / total) * 0.38;
			}
		}

		activeDocument.body.appendChild(canvas);
		gate?.classList.add('is-burning');
		const start = performance.now();
		const duration = 1700;
		const edge = 0.045, char = 0.05;
		const frame = (now: number) => {
			const p = Math.min(1, (now - start) / duration);
			const t = -0.05 + (p * p * (3 - 2 * p)) * 1.2;
			const data = img.data;
			for (let i = 0; i < field.length; i++) {
				const v = field[i];
				const o = i * 4;
				if (v < t - edge) { data[o + 3] = 0; continue; }
				if (v < t) {
					// The burning edge: white-hot at the front, cooling to red.
					const g = (v - (t - edge)) / edge;
					data[o] = 255; data[o + 1] = Math.round(60 + 170 * g); data[o + 2] = Math.round(20 + 90 * g * g); data[o + 3] = Math.round(255 * Math.pow(g, 0.7));
				} else if (v < t + char) {
					// Scorched rim just ahead of the flame.
					const c = (v - t) / char;
					data[o] = Math.round(70 - 60 * c); data[o + 1] = Math.round(26 - 18 * c); data[o + 2] = Math.round(10 + 3 * c); data[o + 3] = 255;
				} else {
					data[o] = 10; data[o + 1] = 8; data[o + 2] = 13; data[o + 3] = 255;
				}
			}
			wctx.putImageData(img, 0, 0);
			view.setTransform(1, 0, 0, 1, 0, 0);
			view.clearRect(0, 0, canvas.width, canvas.height);
			view.imageSmoothingEnabled = true;
			view.imageSmoothingQuality = 'high';
			view.drawImage(work, 0, 0, canvas.width, canvas.height);
			// A soft glow over the burning edge.
			view.globalCompositeOperation = 'lighter';
			view.filter = `blur(${8 * dpr}px)`;
			view.globalAlpha = 0.38;
			view.drawImage(work, 0, 0, canvas.width, canvas.height);
			view.filter = 'none'; view.globalAlpha = 1; view.globalCompositeOperation = 'source-over';
			if (p < 1) window.requestAnimationFrame(frame);
			else { canvas.remove(); resolve(); }
		};
		window.requestAnimationFrame(frame);
	});
}

function finish(): void {
	try { sessionStorage.setItem('ev-intro', '1'); } catch { /* private mode */ }
	root.classList.remove('gate-on');
	gate?.remove();
}

async function play(): Promise<void> {
	if (!gate || !root.classList.contains('gate-on')) return;
	const linesEl = gate.querySelector<HTMLElement>('.gm-lines');
	const die = gate.querySelector<HTMLButtonElement>('.gate-d20');
	const result = gate.querySelector<HTMLElement>('.gm-result');
	const skip = gate.querySelector<HTMLButtonElement>('.gate-skip');
	let done = false;
	skip?.addEventListener('click', () => { if (done) return; done = true; gate.classList.add('is-leaving'); window.setTimeout(finish, reduceMotion ? 0 : 450); });
	gate.addEventListener('keydown', (e) => { if (e.key === 'Escape') skip?.click(); });

	await wait(reduceMotion ? 0 : 500);
	for (const line of LINES) {
		if (done) return;
		const p = createEl('p', { cls: 'gm-line' });
		linesEl?.appendChild(p);
		await typeLine(p, line);
		await wait(reduceMotion ? 0 : 450);
	}
	if (done || !die) return;
	die.hidden = false;
	window.requestAnimationFrame(() => die.classList.add('is-ready'));
	die.focus({ preventScroll: true });

	const roll = async (): Promise<void> => {
		if (done) return;
		done = true;
		die.classList.add('is-rolling');
		gate.classList.add('is-rolling');
		if (!reduceMotion && dice3dSupported()) {
			const thrown = roll3d([{ sides: 20, value: 20, role: 'primary' }], {
				primaryColor: '#ff6a1f', diceColor: '#ece6d8', explosionColor: '#ff3d2e',
				materials: { primary: 'lava' }, scale: 2.4,
			}).catch(() => undefined);
			await Promise.race([thrown, wait(activeDocument.hidden ? 300 : 6000)]);
		}
		if (result) { result.hidden = false; window.requestAnimationFrame(() => result.classList.add('is-shown')); }
		await wait(reduceMotion ? 300 : 1100);
		if (reduceMotion) { gate.classList.add('is-leaving'); await wait(300); finish(); return; }
		activeDocument.querySelector('.nimble-dice3d-overlay')?.classList.add('is-fading');
		await burnAway(window.innerWidth / 2, window.innerHeight / 2);
		finish();
	};
	die.addEventListener('click', () => { void roll(); }, { once: true });
}

void play();
