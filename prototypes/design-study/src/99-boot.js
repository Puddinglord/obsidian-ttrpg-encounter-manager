/* ---------- Boot ---------- */
const PAGES = [
	['overview', 'Overview', () => overviewPage()],
	['shared', 'Shared building blocks', () => sharedPage()],
	['5e', '5e', () => gamePage(DEFS['5e'])],
	['nimble', 'Nimble', () => gamePage(DEFS.nimble)],
	['coc', 'Call of Cthulhu', () => gamePage(DEFS.coc)],
	['dh', 'Daggerheart', () => gamePage(DEFS.dh)],
	['pf', 'Pathfinder 2e', () => gamePage(DEFS.pf)],
	['lineup', 'Side by side', () => lineupPage()],
	['appendix', 'Appendix', () => appendixPage()],
];
function show(full) {
	let [id, sub] = (full || '').split('/');
	if (!PAGES.find(p => p[0] === id)) id = 'overview';
	const page = document.getElementById('p-' + id);
	if (page && page.querySelector('.subtabs')) {
		if (!sub || !page.querySelector(`.subpage[data-sub="${sub}"]`)) sub = 'tracker';
		for (const d of page.querySelectorAll('.subpage')) d.classList.toggle('on', d.dataset.sub === sub);
		for (const b of page.querySelectorAll('.subtabs button')) b.setAttribute('aria-selected', String(b.dataset.sub === sub));
	}
	for (const s of document.querySelectorAll('section.page')) s.classList.toggle('on', s.id === 'p-' + id);
	for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-selected', String(b.dataset.p === id));
	window.scrollTo(0, 0);
}
function build() {
	const main = document.getElementById('main');
	main.textContent = '';
	for (const [id, , make] of PAGES) {
		let p;
		try { p = make(); } catch (e) { console.error(id, e); p = h('section.page', h('pre', String(e.stack))); }
		p.id = 'p-' + id; p.classList.add('page');
		main.append(p);
	}
	show(location.hash.slice(1));
}
const tabs = document.getElementById('tabs');
for (const [id, label] of PAGES) tabs.append(h('button', { 'data-p': id, onclick: () => { location.hash = id; } }, label));
window.addEventListener('hashchange', () => show(location.hash.slice(1)));
for (const b of document.querySelectorAll('#theme button')) b.addEventListener('click', () => {
	document.documentElement.dataset.theme = b.dataset.t;
	for (const x of document.querySelectorAll('#theme button')) x.setAttribute('aria-pressed', String(x === b));
	build();
});
for (const b of document.querySelectorAll('#iconset button')) {
	b.setAttribute('aria-pressed', String(b.dataset.i === ICON_SET));
	b.addEventListener('click', () => {
		ICON_SET = b.dataset.i;
		try { localStorage.setItem('ev-icon-set', ICON_SET); } catch (e) { /* file:// may refuse */ }
		for (const x of document.querySelectorAll('#iconset button')) x.setAttribute('aria-pressed', String(x === b));
		const y = window.scrollY; build(); window.scrollTo(0, y);
	});
}
build();
let rz; let lastW = window.innerWidth;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; const y = window.scrollY; build(); window.scrollTo(0, y); } }, 250); });
