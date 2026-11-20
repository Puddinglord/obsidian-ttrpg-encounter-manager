/* ============================================================================
   Shared sheet parts: frames for a note, a hover card and the tracker's quick
   look; the portrait, the HP meter, roll buttons, rules words, the roll toast.
   Every game's character sheet, NPC card and stat block is built from these.
   ========================================================================== */

/** A portrait without art: initials on the game's tint. The real one is the note's `portrait` property. */
function portrait(name, size = 72, shape = 'round') {
	const ini = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
	return h('span.sh-portrait.' + shape, { style: { width: size + 'px', height: (shape === 'tall' ? Math.round(size * 1.3) : size) + 'px', fontSize: Math.round(size * 0.36) + 'px' } }, h('span', ini));
}
/** The shared HP meter: − / the bar with its number / + / the keypad. */
function meter({ value, max, temp = 0, label = 'Hit points', icon: ic = 'heart', low = 0.5, extra }) {
	const tot = Math.max(max, value + temp);
	const pct = 100 * Math.max(0, value) / tot, tpct = 100 * temp / tot;
	return h('div.sh-meter',
		h('div.sh-meter-h', h('span', icon(ic, 14, 2.2), label), temp ? h('span.sh-temp', `${temp} temp`) : null, extra || null),
		h('div.sh-meter-row',
			btn({ icon: 'minus', kind: 'icon', size: 'sm', title: 'Damage' }),
			h('div.sh-meter-bar' + (value / max <= low ? '.is-low' : ''), h('i', { style: { width: pct + '%' } }), temp ? h('i.t', { style: { left: pct + '%', width: tpct + '%' } }) : null,
				h('b.ev-num', `${value}`, h('small', ` / ${max}`), temp ? h('small', ` +${temp}`) : null)),
			btn({ icon: 'plus', kind: 'icon', size: 'sm', title: 'Heal' }),
			btn({ icon: 'keypad', kind: 'icon', size: 'sm', title: 'Keypad', cls: 'sh-pad' })));
}
/** A roll button: label and modifier; tap rolls through the plugin's dice (3D dice and the roll log). */
function rollBtn(label, mod, opts = {}) {
	const m = typeof mod === 'number' ? (mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`) : mod;
	// A button that already shows its dice ("1d4 + 2") needs no die icon: a d6 face beside a d4 roll says nothing.
	const showsDice = /\d*d\d+/i.test(String(m));
	return h('button.sh-roll' + (opts.cls ? '.' + opts.cls : ''), { title: `Roll ${label}` }, opts.noIcon || showsDice ? null : icon('dice', 13, 2), label ? h('span', label) : null, h('b.ev-num', m));
}
/** A damage roll: the dice, and the damage type as an icon (its word in the tooltip). One width per sheet (--sh-dmg-w). */
function dmgBtn(dice, type, opts = {}) {
	const ic = type ? dmgIcon(type, 15, opts.typeLabel) : null;
	return h('button.sh-roll.sh-dmg' + (opts.cls ? '.' + opts.cls : ''), { title: `Roll ${dice}${type ? ' ' + type : ''} damage` }, h('b.ev-num', dice), ic ? h('span.sh-dmg-t', ic) : null);
}
/** A rules word: dotted underline; tap opens its card (core's rule terms). */
function term(text) { return h('span.sh-term', text); }
/** Where a roll lands: a toast at the bottom of the note, with the dice and the total. */
function rollToast(label, dice, total, note) {
	return h('div.sh-toast', icon('dice', 16, 2), h('span', h('b', label), ' ', h('span.d', dice), ' = ', h('b.ev-num.big', String(total))), note ? h('small', note) : null);
}
function shSection(title, kids, opts = {}) {
	return h('section.sh-sec' + (opts.cls ? '.' + opts.cls : ''), title ? h('div.sh-sec-h', h('span', title), opts.right || null) : null, kids);
}

/* ---------- Frames ---------- */
function crumbs(path) { return h('div.dev-crumbs', obIcon('chevron-left', 15), obIcon('chevron-right', 15), h('span', path), h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '12px' } }, obIcon('book', 15), obIcon('more', 15))); }

/** A note open in Obsidian on a laptop, the sheet taking over the page. */
function noteWindow({ game, title, path, w = 1440, h: ht = 900, content, side }) {
	const view = h('div.ev-view.g-' + game + '.sh-note', h('div.sh-note-in', content));
	const body = h('div.dev-body', h('div.dev-ribbon', obIcons()), h('div.dev-main', crumbs(path), view));
	if (side) body.append(h('div.dev-side', h('div.ev-ob', ['link', 'list', 'tag', 'swords', 'panel'].map(n => h('span' + (n === 'swords' ? '.on' : ''), obIcon(n, 16)))), h('div.ev-view.g-' + game, h('div.ev-scroll', side))));
	return h('div.dev.is-window', { style: { width: w + 'px', height: ht + 'px' } },
		h('div.dev-bar', h('span.dev-lights', h('i'), h('i'), h('i')), h('span.dev-tab.on', obIcon('book', 13), title)), body);
}
function noteIpad({ game, title, landscape, content, overlay }) {
	const w = landscape ? 1180 : 820, ht = landscape ? 820 : 1180;
	const view = h('div.ev-view.g-' + game + '.sh-note', h('div.sh-note-in', content));
	if (overlay) { if (!overlay.classList.contains('sh-toast')) view.append(h('div.ev-scrim')); view.append(overlay); }
	return h('div.dev.is-ipad', { style: { width: w + 'px', height: ht + 'px' } },
		h('div.dev-status', h('span', '9:41'), h('span', '100%')), h('div.dev-mtop', obIcon('panel', 18), h('b', title), obIcon('more', 18)), h('div.dev-main', view));
}
function notePhone({ game, title, content, overlay }) {
	const f = frame({ game, kind: 'phone', title, children: h('div.sh-note.sh-note-phone', h('div.sh-note-in', content)), overlay });
	return f;
}
/** A hover card over a note: the stat block in a popover, as Obsidian’s page preview shows it. */
function hoverCard({ game, title, path, under, card, w = 1180, h: ht = 760 }) {
	const page = h('div.ev-view.g-' + game + '.sh-note', h('div.sh-note-in', { style: { maxWidth: '700px' } }, under));
	const pop = h('div.hc.g-' + game, h('div.hc-in', card));
	return h('div.dev.is-window', { style: { width: w + 'px', height: ht + 'px' } },
		h('div.dev-bar', h('span.dev-lights', h('i'), h('i'), h('i')), h('span.dev-tab.on', obIcon('book', 13), title)),
		h('div.dev-body', h('div.dev-ribbon', obIcons()), h('div.dev-main', { style: { position: 'relative' } }, crumbs(path), page, pop)));
}
/** Fake note text around a link, for hover-card shots. */
function proseWith(link, before, after) {
	return h('div.sh-prose', h('h1', before.title), h('p', before.text), h('p', before.text2, ' ', h('span.sh-link', link), ' ', after), h('p.dim', ' '));
}

mainShot = (orig => (def, m) => {
	if (!m.device || !m.device.startsWith('note-') && m.device !== 'hover' && m.device !== 'quick' && m.device !== 'pair') return orig(def, m);
	let dev, w;
	if (m.device === 'note-laptop') { w = 1440; dev = noteWindow({ game: def.id, title: m.title, path: m.path, h: m.height || 900, content: m.render(), side: m.side ? m.side() : null }); }
	else if (m.device === 'note-landscape') { w = 1180; dev = noteIpad({ game: def.id, title: m.title, landscape: true, content: m.render(), overlay: m.overlay ? m.overlay() : null }); }
	else if (m.device === 'note-portrait') { w = 820; dev = noteIpad({ game: def.id, title: m.title, landscape: false, content: m.render(), overlay: m.overlay ? m.overlay() : null }); }
	else if (m.device === 'note-phone') { w = 390; dev = notePhone({ game: def.id, title: m.title, content: m.render(), overlay: m.overlay ? m.overlay() : null }); }
	else if (m.device === 'hover') { w = 1180; dev = hoverCard({ game: def.id, title: m.title, path: m.path, under: m.under(), card: m.render(), h: m.height || 760 }); }
	else if (m.device === 'quick') { w = 360; const r = m.tracker(); dev = frame({ game: def.id, children: r.children, foot: r.foot, overlay: sheet(m.sheetTitle, m.render(), { cls: 'sh-ql' }), height: m.height || 820 }); }
	else if (m.device === 'pair') { return h('div.dev-wrap', h('div.sh-pair', m.items.map(it => h('div', it.el(), it.cap ? h('div.view-cap', h('b', it.cap), it.sub || null) : null))), h('div.dev-cap', h('b', m.cap), m.sub || null)); }
	for (const t of dev.querySelectorAll('.sh-note-in .sh-toast')) t.closest('.sh-note').append(t);
	return devShot(dev, w, m.cap, m.sub);
})(mainShot);
