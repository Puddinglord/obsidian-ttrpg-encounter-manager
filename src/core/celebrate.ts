// A burst of confetti on a canvas, in the user's accent colour, for when a hero
// levels up. A couple of seconds, then it stops on its own (or when the
// returned function is called). Nothing runs for reduced motion.

interface Particle {
	x: number; y: number; vx: number; vy: number;
	life: number; max: number; color: string; size: number;
	kind: 'confetti';
	angle?: number; spin?: number; wobble?: number;
}

/** The accent colour and lighter/darker/complementary shades of it, as concrete rgb() strings a canvas can use. */
export function accentPalette(host: HTMLElement): string[] {
	const probe = host.createSpan({ cls: 'lu-color-probe' });
	const mixes = [
		'var(--interactive-accent)',
		'color-mix(in srgb, var(--interactive-accent) 55%, #fff)',
		'color-mix(in srgb, var(--interactive-accent) 25%, #fff)',
		'color-mix(in srgb, var(--interactive-accent) 70%, #000)',
		'color-mix(in srgb, var(--interactive-accent) 60%, #ffd23f)',
		'#ffd23f',
		'color-mix(in srgb, var(--interactive-accent) 45%, #ff5fa2)',
	];
	const out = mixes.map(c => {
		probe.setCssProps({ '--lu-probe': c });
		return getComputedStyle(probe).color;
	});
	probe.remove();
	return out.filter(Boolean);
}

export function reducedMotion(): boolean {
	return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * One burst of confetti from a point (behind the level bubble), in the accent
 * colours: about a hundred paper pieces fly out, flutter and fall away in a
 * couple of seconds. Cheap to draw: no glow, no trails. Returns a stop function.
 */
export function confettiBurst(canvas: HTMLCanvasElement, colors: string[], o: { x: number; y: number; delayMs?: number }): () => void {
	const ctx = canvas.getContext('2d');
	if (!ctx || reducedMotion() || !colors.length) return () => undefined;
	const dpr = Math.min(2, window.devicePixelRatio || 1);
	const w = canvas.clientWidth;
	const h = canvas.clientHeight;
	canvas.width = Math.round(w * dpr);
	canvas.height = Math.round(h * dpr);
	ctx.scale(dpr, dpr);
	const rand = (a: number, b: number) => a + Math.random() * (b - a);
	const parts: Particle[] = [];
	for (let i = 0; i < 110; i++) {
		const a = rand(0, Math.PI * 2);
		const v = rand(4, 11);
		parts.push({ kind: 'confetti', x: o.x + Math.cos(a) * 20, y: o.y + Math.sin(a) * 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: 0, max: rand(90, 140), color: colors[i % colors.length], size: rand(7, 12), angle: rand(0, Math.PI), spin: rand(-0.25, 0.25), wobble: rand(0, Math.PI * 2) });
	}
	let raf = 0;
	const frame = () => {
		ctx.clearRect(0, 0, w, h);
		for (let i = parts.length - 1; i >= 0; i--) {
			const p = parts[i];
			p.life++;
			p.vx *= 0.95;
			p.vy = p.vy * 0.95 + 0.28;
			p.wobble = (p.wobble ?? 0) + 0.14;
			p.x += p.vx;
			p.y += p.vy;
			p.angle = (p.angle ?? 0) + (p.spin ?? 0);
			ctx.globalAlpha = p.life > p.max - 30 ? Math.max(0, (p.max - p.life) / 30) : 1;
			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.angle);
			ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.wobble)));
			ctx.fillStyle = p.color;
			ctx.fillRect(-p.size / 2, -p.size / 3, p.size, (p.size * 2) / 3);
			ctx.restore();
			if (p.life > p.max || p.y > h + 30) parts.splice(i, 1);
		}
		ctx.globalAlpha = 1;
		if (parts.length) raf = window.requestAnimationFrame(frame);
	};
	const timer = window.setTimeout(() => { raf = window.requestAnimationFrame(frame); }, o.delayMs ?? 0);
	return () => { window.clearTimeout(timer); window.cancelAnimationFrame(raf); ctx.clearRect(0, 0, w, h); };
}
