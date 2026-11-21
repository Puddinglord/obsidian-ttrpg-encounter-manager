/* ---------- Boot: this study's pages (the design study's boot is left out of the build) ---------- */
function gmShow(id) {
	if (!GM_PAGES.find(p => p[0] === id)) id = GM_PAGES[0][0];
	for (const s of document.querySelectorAll('section.page')) s.classList.toggle('on', s.id === 'p-' + id);
	for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-selected', String(b.dataset.p === id));
	window.scrollTo(0, 0);
}
function gmBuild() {
	const main = document.getElementById('main');
	main.textContent = '';
	for (const [id, , make] of GM_PAGES) {
		let p;
		try { p = make(); } catch (e) { console.error(id, e); p = h('section.page', h('pre', String(e.stack))); }
		p.id = 'p-' + id; p.classList.add('page');
		main.append(p);
	}
	gmShow(location.hash.slice(1));
}
{
	const tabs = document.getElementById('tabs');
	for (const [id, label] of GM_PAGES) tabs.append(h('button', { 'data-p': id, onclick: () => { location.hash = id; } }, label));
	window.addEventListener('hashchange', () => gmShow(location.hash.slice(1)));
	for (const b of document.querySelectorAll('#theme button')) b.addEventListener('click', () => {
		document.documentElement.dataset.theme = b.dataset.t;
		for (const x of document.querySelectorAll('#theme button')) x.setAttribute('aria-pressed', String(x === b));
		const y = window.scrollY; gmBuild(); window.scrollTo(0, y);
	});
	gmBuild();
}
