// Ember Vault landing page: reveal-on-scroll, drifting embers, the torch gate
// over the live demo, and the torchlit feature walkthrough.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Fade sections in as they scroll into view.
const io = new IntersectionObserver((entries) => {
	for (const e of entries) {
		if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
	}
}, { rootMargin: '0px 0px -10% 0px' });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));


// ---------------------------------------------------------------------------
// A warm glow follows the pointer around the hero.
const hero = document.querySelector('.hero');
const light = document.querySelector('.torchlight');
if (hero && light && !reduceMotion && window.matchMedia('(hover: hover)').matches) {
	let pending = false, mx = 0, my = 0;
	hero.addEventListener('pointermove', (e) => {
		const r = hero.getBoundingClientRect();
		mx = e.clientX - r.left; my = e.clientY - r.top;
		if (pending) return;
		pending = true;
		requestAnimationFrame(() => {
			light.style.setProperty('--mx', `${mx}px`);
			light.style.setProperty('--my', `${my}px`);
			pending = false;
		});
	});
}

// ---------------------------------------------------------------------------
// The site gate: light the torch and its light opens up the whole page.
const gate = document.getElementById('site-gate');
const root = document.documentElement;
function openGate(instant) {
	if (!gate || !root.classList.contains('gate-on')) return;
	try { sessionStorage.setItem('ev-lit', '1'); } catch { /* private mode */ }
	const done = () => { root.classList.remove('gate-on'); gate.remove(); document.querySelector('.hero h1')?.setAttribute('tabindex', '-1'); };
	if (instant || reduceMotion) { gate.classList.add('is-opening'); setTimeout(done, reduceMotion ? 300 : 0); return; }
	gate.classList.add('is-lighting');
	setTimeout(() => {
		gate.classList.add('is-opening');
		setTimeout(done, 1650);
	}, 700);
}
if (gate && root.classList.contains('gate-on')) {
	gate.querySelector('.gate-torch')?.addEventListener('click', () => openGate(false));
	gate.querySelector('.gate-skip')?.addEventListener('click', () => openGate(true));
	gate.querySelector('.gate-torch')?.focus({ preventScroll: true });
	gate.addEventListener('keydown', (e) => { if (e.key === 'Escape') openGate(true); });
	if (!reduceMotion) embers(gate);
}

// ---------------------------------------------------------------------------
// Safety net: if the intro script never loads, "Skip the intro" still lets you in.
document.querySelector('.gate-skip')?.addEventListener('click', () => {
	setTimeout(() => {
		if (!document.documentElement.classList.contains('gate-on')) return;
		try { sessionStorage.setItem('ev-intro', '1'); } catch { /* private mode */ }
		document.documentElement.classList.remove('gate-on');
		document.getElementById('site-gate')?.remove();
	}, 900);
});

// ---------------------------------------------------------------------------
// The nav is clear over the hero and turns to glass once you scroll.
const nav = document.querySelector('.nav');
const onNavScroll = () => nav?.classList.toggle('is-scrolled', window.scrollY > 12);
window.addEventListener('scroll', onNavScroll, { passive: true });
onNavScroll();

// ---------------------------------------------------------------------------
// The torchlit vault: each step brightens as it nears the middle of the screen.
const steps = [...document.querySelectorAll('.vault .step')];
if (steps.length) {
	let queued = false;
	const update = () => {
		queued = false;
		const mid = window.innerHeight * 0.5;
		const reach = window.innerHeight * 0.55;
		for (const s of steps) {
			const r = s.getBoundingClientRect();
			const d = Math.abs(r.top + r.height / 2 - mid);
			const v = Math.max(0, Math.min(1, 1 - d / reach));
			s.style.setProperty('--lit', (v * v * (3 - 2 * v)).toFixed(3));
		}
	};
	const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onScroll);
	update();
}

// Tall bento tiles scroll through a long screenshot: how far depends on the image and the frame.
const scrollShots = () => document.querySelectorAll('.frame-scroll').forEach((f) => {
	const win = f.querySelector('.win'), img = f.querySelector('.win img'), bar = f.querySelector('.win-bar');
	if (!win || !img || !img.complete) return;
	const by = Math.max(0, img.getBoundingClientRect().height - (win.clientHeight - (bar ? bar.offsetHeight : 0)));
	f.style.setProperty('--scroll-by', `${Math.round(by)}px`);
});
document.querySelectorAll('.frame-scroll .win img').forEach((img) => img.addEventListener('load', scrollShots));
window.addEventListener('resize', scrollShots);
scrollShots();
