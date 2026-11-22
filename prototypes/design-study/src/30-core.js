'use strict';
/* ============================================================================
   Core: element builder, icons, and the shared components every game draws.
   ========================================================================== */

function h(tag, a, ...kids) {
	const [t, ...cls] = tag.split('.');
	const el = document.createElement(t || 'div');
	if (cls.length) el.className = cls.join(' ');
	if (a && (typeof a !== 'object' || a instanceof Node || Array.isArray(a))) { kids.unshift(a); a = null; }
	if (a) for (const [k, v] of Object.entries(a)) {
		if (v === undefined || v === null || v === false) continue;
		if (k === 'class') el.className += (el.className ? ' ' : '') + v;
		else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
		else if (k === 'text') el.textContent = v;
		else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
		else el.setAttribute(k, v === true ? '' : v);
	}
	add(el, kids);
	return el;
}
function add(el, kids) {
	for (const k of kids.flat(Infinity)) {
		if (k === null || k === undefined || k === false) continue;
		el.append(k instanceof Node ? k : document.createTextNode(String(k)));
	}
	return el;
}
const svgNS = 'http://www.w3.org/2000/svg';

/* Lucide-style line icons (24 grid). Stroke width is a game token. */
const ICONS = {
	'chevron-left': '<path d="m15 18-6-6 6-6"/>',
	'chevron-right': '<path d="m9 18 6-6-6-6"/>',
	'chevron-down': '<path d="m6 9 6 6 6-6"/>',
	'next': '<path d="M5 5.5v13a.5.5 0 0 0 .78.42l9.6-6.5a.5.5 0 0 0 0-.84l-9.6-6.5A.5.5 0 0 0 5 5.5Z"/><path d="M19 5v14"/>',
	'undo': '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
	'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
	'minus': '<path d="M5 12h14"/>',
	'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
	'more': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
	'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
	'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
	'heart-crack': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="m12 13-1-1 2-2-3-3 2-2"/>',
	'swords': '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4"/><path d="m7 17-3 3"/><path d="m3 19 2 2"/>',
	'dice': '<rect width="18" height="18" x="3" y="3" rx="3"/><path d="M8 8h.01"/><path d="M16 8h.01"/><path d="M12 12h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/>',
	'flame': '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
	'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
	'hourglass': '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
	'target': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
	'skull': '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>',
	'check': '<path d="M20 6 9 17l-5-5"/>',
	'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	'search': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
	'grip': '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
	'crosshair': '<circle cx="12" cy="12" r="9"/><path d="M21 12h-4"/><path d="M7 12H3"/><path d="M12 7V3"/><path d="M12 21v-4"/>',
	'crown': '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
	'castle': '<path d="M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2Z"/><path d="M18 11V4H6v7"/><path d="M15 22v-4a3 3 0 0 0-6 0v4"/><path d="M22 11V9"/><path d="M2 11V9"/><path d="M6 4V2"/><path d="M18 4V2"/><path d="M10 4V2"/><path d="M14 4V2"/>',
	'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
	'zap': '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
	'droplet': '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
	'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
	'sparkle': '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
	'timer': '<path d="M10 2h4"/><path d="m12 14 3-3"/><circle cx="12" cy="14" r="8"/>',
	'reaction': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
	'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
	'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
	'book': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
	'delete': '<path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/>',
	'play': '<path d="M6 4.5v15a.5.5 0 0 0 .77.42l11.5-7.5a.5.5 0 0 0 0-.84L6.77 4.08A.5.5 0 0 0 6 4.5Z"/>',
	'list': '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
	'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
	'tag': '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
	'panel': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
	'wand': '<path d="m3 21 9-9"/><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M17.8 6.2 19 5"/><path d="M12.2 6.2 11 5"/>',
	'gun': '<path d="M3 7h15v4h-6.5l-1.6 7H5.6l1.3-7H4a1 1 0 0 1-1-1z"/><path d="M18 8h3"/><path d="M11.5 11v2.2a.8.8 0 0 1-.8.8H9.6"/>',
	'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
	'footprints': '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/>',
	'hand': '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
	'lock': '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
	'feather': '<path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/>',
	'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
	'activity': '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
	'bandage': '<path d="M10 10.01h.01"/><path d="M10 14.01h.01"/><path d="M14 10.01h.01"/><path d="M14 14.01h.01"/><path d="M18 6v12"/><path d="M6 6v12"/><rect x="2" y="6" width="20" height="12" rx="2"/>',
	'sliders': '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
	'bed': '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
};

/** An icon by name. With the page's icon set on Phosphor (the default), ICON() draws it (29-icons.js);
    on Lucide it draws the line icons above, as the plugin does today. */
function icon(name, size = 16, sw) {
	if (ICON_SET === 'phosphor' && hasICON(name)) return ICON(name, size);
	return lucideIcon(name, size, sw);
}
/** Obsidian's own chrome (ribbon, tabs, crumbs): always Lucide, as Obsidian draws it. */
function obIcon(name, size = 16, sw = 1.75) { return lucideIcon(name, size, sw); }
/* Lucide for the names ICON() added (ISC, lucide-static 1.76), so the Lucide comparison draws every icon. */
Object.assign(ICONS, {
	'first-aid': '<path d="M4 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4a1 1 0 0 1 1 1v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a1 1 0 0 1 1-1h4a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-4a1 1 0 0 1-1-1V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4a1 1 0 0 1-1 1z"/>',
	'save': ICONS.shield + '<path d="m9 12 2 2 4-4"/>',
	'temp': ICONS.shield + '<path d="M9 12h6"/><path d="M12 9v6"/>',
	'concentration': '<path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 01-3-4 4.17 4.17 0 01-3 4"/><path d="M17.707 6.294A3 3 0 1012 5a3 3 0 10-5.707 1.294"/><path d="M17.996 5.125a4 4 0 012.526 5.77"/><path d="M18 18a4 4 0 002-7.465"/><path d="M19.967 17.482a4 4 0 11-7.967.517 4 4 0 11-7.967-.517"/><path d="M6 18a4 4 0 01-2-7.465"/><path d="M6.004 5.125a4 4 0 00-2.526 5.77"/>',
	'poison': '<path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094"/><path d="M8.5 2h7"/>',
	'attack': '<path d="m11 19-6-6"/><path d="m5 21-2-2"/><path d="m8 16-4 4"/><path d="M9.5 17.5 20.414 6.586A2 2 0 0021 5.172V3h-2.172a2 2 0 00-1.414.586L6.5 14.5"/>',
	'edit': '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
});
const LUCIDE_ALIAS = { 'drop': 'droplet', 'damage': 'droplet', 'heal': 'first-aid', 'tag-bold': 'tag', 'condition': 'tag', 'book-bold': 'book', 'statblock': 'book', 'roll': 'dice', 'spell': 'wand', 'order': 'list', 'heartbeat': 'activity', 'users-three': 'users' };
function lucideIcon(name, size = 16, sw) {
	if (!ICONS[name] && LUCIDE_ALIAS[name]) name = LUCIDE_ALIAS[name];
	if (!ICONS[name] && typeof hasICON === 'function' && hasICON(name)) return ICON(name, size); // in-world glyphs and anything only ICON draws
	const s = document.createElementNS(svgNS, 'svg');
	s.dataset.icon = name;
	s.setAttribute('viewBox', '0 0 24 24');
	s.setAttribute('width', size); s.setAttribute('height', size);
	s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
	s.setAttribute('stroke-width', sw || 'var(--g-icon-sw, 1.75)');
	s.style.strokeWidth = sw || 'var(--g-icon-sw, 1.75)';
	s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
	s.setAttribute('aria-hidden', 'true');
	s.setAttribute('class', 'ev-i is-line');
	s.innerHTML = ICONS[name] || '';
	return s;
}
/** A raw SVG from markup (our own drawings: shields, glyphs). */
function svg(markup, w, hgt, cls) {
	const s = document.createElementNS(svgNS, 'svg');
	s.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
	s.setAttribute('width', w); s.setAttribute('height', hgt);
	if (cls) s.setAttribute('class', cls);
	s.setAttribute('aria-hidden', 'true');
	s.innerHTML = markup;
	return s;
}

/* ---------- Shared components ---------- */

/** Button. kind: primary | quiet | icon. */
function btn({ icon: ic, text, sub, kind = '', size = '', title, cls = '', onclick } = {}) {
	if (typeof text === 'string') text = shortLabel(text);
	if (ICON_SET === 'phosphor' && typeof text === 'string') {
		if (/^Damage\b/.test(text) && (!ic || ic === 'minus')) ic = 'damage';
		else if (/^Heal\b/.test(text) && (!ic || ic === 'plus')) ic = 'heal';
		else if (ic === 'tag') ic = 'tag-bold';
		else if (ic === 'book') ic = 'book-bold';
	}
	const classes = ['ev-btn'];
	for (const k of kind.split(' ').filter(Boolean)) classes.push('is-' + k);
	if (size) classes.push('is-' + size);
	if (cls) classes.push(cls);
	return h('button.' + classes.join('.'), { title, 'aria-label': title, onclick },
		ic ? icon(ic, size === 'sm' ? 16 : 18) : null,
		text ? h('span', text) : null,
		sub ? h('span.ev-btn-sub', sub) : null);
}

/** A track drawn as a bar: HP, Sanity. */
function bar({ value, max, temp = 0, low = 0.5, cls = '' }) {
	const tot = Math.max(max, value + temp);
	const el = h('div.ev-bar' + (cls ? '.' + cls : ''), { role: 'meter', 'aria-valuenow': value, 'aria-valuemax': max });
	if (value <= 0) el.classList.add('is-zero');
	else if (value / max <= low) el.classList.add('is-low');
	el.append(h('i', { style: { width: (100 * Math.max(0, value) / tot) + '%' } }));
	if (temp) el.append(h('i.temp', { style: { width: (100 * temp / tot) + '%' } }));
	return el;
}

/** A track drawn as marked slots: Daggerheart HP and Stress, Nimble Wounds. */
function slots({ max, on, cls = '', style }) {
	return h('span.ev-slots' + (cls ? '.' + cls : ''), { role: 'meter', 'aria-valuenow': on, 'aria-valuemax': max, style },
		Array.from({ length: max }, (_, i) => h('i' + (i < on ? '.on' : ''))));
}

/** A resource: pips, filled = available. */
function pips({ max, on, cls = '', style }) {
	return h('span.ev-pips' + (cls ? '.' + cls : ''), { role: 'meter', 'aria-valuenow': on, 'aria-valuemax': max, style },
		Array.from({ length: max }, (_, i) => h('i' + (i < on ? '.on' : ''))));
}

/** A condition, shared everywhere: name, value, rounds left, what it does at a turn boundary. */
function chip(c, opts = {}) {
	const acts = c.trigger;
	const el = h('span.ev-chip' + (acts ? '.is-acts' : '') + (c.bad ? '.is-bad' : '') + (opts.cls ? '.' + opts.cls : ''),
		{ title: c.note || c.name },
		acts ? icon(acts === 'damage' ? 'flame' : acts === 'save' ? (ICON_SET === 'phosphor' ? 'save' : 'dice') : 'clock', 13) : null,
		c.icon ? icon(c.icon, 13) : null,
		h('span', opts.label ? opts.label(c) : c.name),
		c.value !== undefined ? h('span.v', String(c.value)) : null,
		c.rounds !== undefined ? h('span.t', { title: `${c.rounds} round${c.rounds === 1 ? '' : 's'} left` }, icon('hourglass', 11), String(c.rounds)) : null);
	return el;
}
function chips(list, opts = {}) {
	if (!list || !list.length) return null;
	return h('div.ev-chips', list.map(c => chip(c, opts)));
}

/** The 5e/PF shield with a number. Drawn, not an icon, so the number sits inside. */
function shieldNum(n, size = 30, cls = 'ev-shield') {
	const w = size, ht = Math.round(size * 1.12);
	const wrap = h('span.' + cls, { style: { width: w + 'px', height: ht + 'px' }, title: 'Armor Class' });
	wrap.append(svg(`<path d="M${w / 2} 1.5 C${w * 0.72} ${ht * 0.1} ${w * 0.86} ${ht * 0.13} ${w - 2} ${ht * 0.14} V${ht * 0.48} C${w - 2} ${ht * 0.78} ${w * 0.72} ${ht * 0.92} ${w / 2} ${ht - 1.5} C${w * 0.28} ${ht * 0.92} 2 ${ht * 0.78} 2 ${ht * 0.48} V${ht * 0.14} C${w * 0.14} ${ht * 0.13} ${w * 0.28} ${ht * 0.1} ${w / 2} 1.5Z" />`, w, ht));
	wrap.append(h('b.ev-num', String(n)));
	return wrap;
}

/* ---------- Frames ---------- */
function frame({ game, kind = 'sidebar', title, height, children, overlay, foot }) {
	const f = h('div.ev-frame' + (kind === 'wide' ? '.is-wide' : kind === 'phone' ? '.is-phone' : ''), { 'data-game': game });
	if (height) f.style.height = height + 'px';
	const view = h('div.ev-view.g-' + game);
	if (kind === 'phone') {
		f.classList.add('g-' + game); // phone chrome reads the game's tokens
		f.append(h('div.ev-phone-bar', { style: { fontFamily: 'var(--p-ui)' } }, h('span', '9:41'), h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, svg('<rect x="0" y="7" width="3" height="5" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/>', 18, 12, 'fillc'), svg('<rect x="0.5" y="0.5" width="22" height="11" rx="3" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="16" height="8" rx="1.6"/><rect x="23.5" y="4" width="1.5" height="4" rx=".7" opacity=".4"/>', 26, 12, 'fillc'))));
		f.append(h('div.ev-phone-nav', { style: { fontFamily: 'var(--p-ui)' } }, obIcon('chevron-left', 20), h('b', title || 'Encounter'), h('span', { style: { marginLeft: 'auto', display: 'flex' } }, obIcon('more', 20))));
		f.append(h('div.ev-home'));
	} else {
		f.append(h('div.ev-ob', ['link', 'list', 'tag', 'swords', 'panel'].map(n => h('span' + (n === 'swords' ? '.on' : ''), obIcon(n, 16)))));
	}
	const scroll = h('div.ev-scroll');
	add(scroll, [children]);
	view.append(scroll);
	if (foot) view.append(foot);
	if (overlay) { view.append(h('div.ev-scrim')); view.append(overlay); }
	f.append(view);
	return f;
}

/** A sheet that rises inside the panel (prompts, keypad, picker). */
function sheet(title, body, opts = {}) {
	return h('div.ev-sheet' + (opts.cls ? '.' + opts.cls : ''),
		h('div.ev-sheet-grip'),
		h('div.ev-sheet-head', h('h3', title), btn({ icon: 'x', kind: 'quiet icon', size: 'sm', title: 'Close' })),
		body);
}

/** The HP keypad, shared. mode: damage | heal | temp. */
function hpPad({ who, amount = '12', mode = 'damage', modes = ['Damage', 'Heal', 'Temp'], hint, extra, go }) {
	const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Crit', '0', 'del'];
	return h('div.ev-pad',
		h('div.ev-pad-read', h('span.who', who), h('span.amt.ev-num' + (mode === 'damage' ? '.is-dmg' : ''), (mode === 'damage' ? '−' : '+') + amount)),
		h('div.ev-pad-mode', modes.map((m, i) => h('span' + (i === 0 && mode === 'damage' || m.toLowerCase() === mode ? '.on' : ''), m))),
		extra || null,
		h('div.ev-pad-keys', keys.map(k => k === 'del' ? h('span.fn', icon('delete', 20)) : h('span' + (k === 'Crit' ? '.fn' : ''), k))),
		hint ? h('p.ev-pad-hint', hint) : null,
		h('div.ev-pad-go', btn({ text: 'Cancel' }), go || btn({ kind: 'primary', text: `Apply ${amount} damage` })));
}

/** A turn prompt card (core's effect prompts). */
function promptCard({ ic = 'dice', title, text, acts = [] }) {
	return h('div.ev-prompt',
		h('div.ev-prompt-head', icon(ic, 16), h('span', title)),
		text ? h('p', text) : null,
		acts.length ? h('div.ev-prompt-acts', toClusters(acts)) : null);
}

/** The condition picker body (core's openConditionPicker), with the timing editor open on one. */
function picker({ query = '', items, timing }) {
	return h('div',
		h('div.ev-search', icon('search', 16), query ? h('b', query) : h('span', 'Search conditions'), h('span.caret')),
		h('div.ev-pick-list', items.map(it => h('div.ev-pick' + (it.on ? '.is-on' : ''),
			h('span.ic', icon(it.icon || 'tag', 18)),
			h('span', h('b', it.name), it.text ? h('small', it.text) : null),
			it.on ? h('span', { style: { color: 'var(--g-accent-text)' } }, icon('check', 18)) : h('span'),
		))),
		timing ? h('div.ev-timing', timing.map(([label, ctl]) => h('div.ev-timing-row', h('span', label), ctl))) : null);
}
function stepper(n) { return h('span.ev-stepper', h('span', icon('minus', 14)), h('b', String(n)), h('span', icon('plus', 14))); }
function segs(list, on) { return h('span.ev-segs', list.map(s => h('span' + (s === on ? '.on' : ''), s))); }

/* ---------- Contrast (WCAG 2.x) ---------- */
function parseColor(s) {
	const m = s.match(/rgba?\(([^)]+)\)/);
	if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; }
	const c = s.match(/color\(srgb ([^)]+)\)/);
	if (c) { const p = c[1].split(/[ /]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] ?? 1 }; }
	return { r: 0, g: 0, b: 0, a: 1 };
}
function lum({ r, g, b }) {
	const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function blend(fg, bg) { const a = fg.a; return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 }; }
function hex({ r, g, b }) { return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
/** Read a token's colour as the browser resolves it (so color-mix and dark mode count). */
function tokenColor(scopeEl, name, prop = 'color') {
	const probe = h('span', { style: { [prop]: `var(${name})` } });
	scopeEl.append(probe);
	const c = parseColor(getComputedStyle(probe)[prop]);
	probe.remove();
	return c;
}
