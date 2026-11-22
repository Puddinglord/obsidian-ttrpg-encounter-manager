/* ============================================================================
   Game pages get sub-tabs: Tracker · Character sheet · NPC · Stat block ·
   Design system. Hash: #5e/sheet. Built for an iPad: big targets, sticky.
   ========================================================================== */
const SUBS = [['tracker', 'Tracker'], ['sheet', 'Character sheet'], ['npc', 'NPC'], ['block', 'Stat block'], ['campaign', 'Campaign notes'], ['compendium', 'Compendium'], ['tools', 'Builders & dialogs'], ['ds', 'Design system']];

/** A surface page: research board, then the mocks. */
function surfacePage(def, s) {
	if (!s) return [h('p.kicker', 'Coming in this pass.')];
	return [
		h('h2.sec', { style: { marginTop: '8px' } }, s.title),
		h('p.lede', { style: { fontSize: '17px' } }, s.lede),
		s.research ? [h('h3.sub', 'Research board'), h('p.kicker', s.researchNote || 'From the official sheets and books (the user’s own PDFs, paraphrased with page references) and what the plugin draws today.'), researchBoard(s.research)] : null,
		s.notes ? [h('h3.sub', 'How it works'), h('ul.prose', s.notes.map(t => h('li', htmlSpan(t))))] : null,
		(s.shots || []).map(m => mainShot(def, m)),
	];
}

gamePage = (orig => def => {
	const page = orig(def);
	const kids = [...page.children];
	const head = kids.slice(0, 3);
	const dsAt = kids.findIndex(k => k.matches && k.matches('h2.sec') && k.textContent === 'Design system');
	const tracker = kids.slice(3, dsAt < 0 ? undefined : dsAt);
	const ds = dsAt < 0 ? [] : kids.slice(dsAt);
	page.textContent = '';
	add(page, head);
	const nav = h('nav.subtabs', SUBS.map(([k, label]) => h('button', { 'data-sub': k, onclick: () => { location.hash = `${def.id}/${k}`; } }, label)));
	page.append(nav);
	const sp = (k, els) => { const d = h('div.subpage', { 'data-sub': k }); add(d, els); page.append(d); };
	sp('tracker', tracker);
	sp('sheet', surfacePage(def, def.sheet));
	sp('npc', surfacePage(def, def.npc));
	sp('block', surfacePage(def, def.block));
	sp('campaign', surfacePage(def, def.campaign));
	sp('compendium', surfacePage(def, def.compendium));
	sp('tools', surfacePage(def, def.tools));
	sp('ds', ds);
	return page;
})(gamePage);
