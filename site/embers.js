// Embers for every [data-embers] element: the landing page, and the changelog's hero.
// Shared by index.html and the changelog pages (scripts/build-changelog.mjs).
(function () {
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Embers: sparks that rise from the bottom of each dark section, cooling from
// white-hot to deep red, swaying in the heat and leaving short trails. They only
// animate while their section is on screen and the tab is visible.
function embers(host) {
	const canvas = document.createElement('canvas');
	canvas.className = 'ember-canvas';
	canvas.setAttribute('aria-hidden', 'true');
	host.prepend(canvas);
	const ctx = canvas.getContext('2d');
	let w = 0, h = 0, parts = [], raf = 0, visible = false, t = 0;
	// data-embers="3" makes embers climb about three times as far (less drag, slower cooling): the hero is tall
	// and its copy sits far above its bottom edge.
	const rise = Math.max(1, Number(host.dataset.embers) || 1);
	const drag = 1 - 0.003 / rise;

	const spawn = (anywhere) => {
		const spark = Math.random() < 0.12;
		return {
			x: Math.random() * w,
			y: anywhere ? Math.random() * h : h + Math.random() * 30,
			vx: (Math.random() - 0.5) * 0.4,
			vy: -(spark ? 1.6 + Math.random() * 1.6 : 0.35 + Math.random() * 0.9) * Math.sqrt(rise),
			r: spark ? 0.6 + Math.random() * 0.5 : 0.6 + Math.random() * 1.6,
			heat: spark ? 0.9 + Math.random() * 0.1 : 0.45 + Math.random() * 0.4,
			cool: (spark ? 0.006 + Math.random() * 0.006 : 0.0015 + Math.random() * 0.0025) / (rise > 1 ? rise * 1.6 : 1),
			seed: Math.random() * 1000,
		};
	};
	// Colour by temperature: white-yellow when hot, orange, then a dull red as it cools.
	const color = (heat, a) => {
		const r = Math.round(200 + 55 * Math.min(1, heat * 1.6));
		const g = Math.round(40 + 170 * Math.pow(Math.max(0, heat), 1.4));
		const b = Math.round(10 + 150 * Math.max(0, heat - 0.85) / 0.15);
		return `rgba(${r},${g},${b},${a})`;
	};
	const resize = () => {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		w = host.clientWidth; h = host.clientHeight;
		canvas.width = w * dpr; canvas.height = h * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const count = Math.min(55 + 20 * (rise - 1), Math.round((w * h) / 26000));
		parts = Array.from({ length: count }, () => spawn(true));
	};
	const frame = () => {
		t += 1;
		ctx.clearRect(0, 0, w, h);
		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';
		for (const p of parts) {
			// Rising heat: gentle turbulence that varies with height and time.
			p.vx += Math.sin((p.y + p.seed) * 0.012 + t * 0.02) * 0.012 + (Math.random() - 0.5) * 0.02;
			p.vx *= 0.985;
			p.vy *= drag;
			p.x += p.vx; p.y += p.vy;
			p.heat -= p.cool;
			const flick = 0.8 + 0.2 * Math.sin(t * 0.25 + p.seed);
			const a = Math.max(0, Math.min(1, p.heat * 1.25)) * flick * (p.y > h * 0.35 ? 1 : 0.4 + 0.6 * (p.y / (h * 0.35)));
			if (a > 0.01) {
				// Trail
				ctx.strokeStyle = color(p.heat * 0.85, a * 0.35);
				ctx.lineWidth = p.r * 0.7;
				ctx.beginPath();
				ctx.moveTo(p.x, p.y);
				ctx.lineTo(p.x - p.vx * 4, p.y - p.vy * 4);
				ctx.stroke();
				// Glow
				const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4.5);
				g.addColorStop(0, color(p.heat, a));
				g.addColorStop(0.25, color(p.heat * 0.8, a * 0.45));
				g.addColorStop(1, color(p.heat * 0.6, 0));
				ctx.fillStyle = g;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.r * 4.5, 0, Math.PI * 2);
				ctx.fill();
			}
			if (p.heat <= 0 || p.y < -30 || p.x < -30 || p.x > w + 30) Object.assign(p, spawn(false));
		}
		raf = requestAnimationFrame(frame);
	};
	const run = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };
	const stop = () => { cancelAnimationFrame(raf); raf = 0; };
	resize();
	new ResizeObserver(resize).observe(host);
	new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? run() : stop(); }).observe(host);
	document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()));
}
if (!reduceMotion) document.querySelectorAll('[data-embers]').forEach(embers);
})();
