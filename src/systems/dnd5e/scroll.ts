// A class's name between two gold-leaf scrolls (the design study's 70d): a
// gold diamond, the oxblood taper (it stretches into the spare width), gold
// tendrils curling round the class's motif, an engraved rule and an oxblood
// diamond. The left side is drawn once and mirrored for the right. Under 440px
// the compact scroll (taper, diamond, motif) takes over. SRD classes only;
// every drawing is our own.

interface Shape {
	d: string;
	/** Engraved cuts: holes the paper shows through. */
	evenodd?: boolean;
	/** A line rather than a fill: its width. */
	stroke?: number;
	cls?: 'ox' | 'gd' | 'fil';
}
interface Group { transform?: string; shapes: Shape[] }

const dot = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const star4 = (cx: number, cy: number, r: number, w = 0.3) => {
	const k = r * w;
	return `M${cx} ${cy - r}C${cx + k * 0.35} ${cy - k} ${cx + k} ${cy - k * 0.35} ${cx + r} ${cy}C${cx + k} ${cy + k * 0.35} ${cx + k * 0.35} ${cy + k} ${cx} ${cy + r}`
		+ `C${cx - k * 0.35} ${cy + k} ${cx - k} ${cy + k * 0.35} ${cx - r} ${cy}C${cx - k} ${cy - k * 0.35} ${cx - k * 0.35} ${cy - k} ${cx} ${cy - r}Z`;
};
const sun = (cx: number, cy: number, n = 12) => {
	const v = (x: number) => x.toFixed(2);
	let d = dot(cx, cy, 4.4);
	for (let i = 0; i < n; i++) {
		const a = i * Math.PI * 2 / n - Math.PI / 2, r0 = 6, r1 = i % 2 ? 8.6 : 11.2, w = i % 2 ? 0.16 : 0.2;
		const p = (ang: number, r: number) => `${v(cx + r * Math.cos(ang))} ${v(cy + r * Math.sin(ang))}`;
		d += `M${p(a - w, r0)}L${p(a, r1)}L${p(a + w, r0)}Z`;
	}
	return d;
};

const sword = `M12 1.2l1.6 2.4V15h-3.2V3.6zM7.4 15h9.2v2H7.4zM11.1 17h1.8v3.9h-1.8z${dot(12, 21.9, 1.3)}`;

/** Each class's motif on a 24 × 24 grid: gold silhouettes with engraved cuts. */
const MOTIFS: Record<string, Group[]> = {
	// A horned helm with a T visor.
	Barbarian: [{ shapes: [
		{ d: 'M6 19.6v-6C6 8.6 8.6 5.4 12 5.4s6 3.2 6 8.2v6zM8.2 12.4h7.6V14h-2.9v3.8h-1.8V14H8.2z', evenodd: true },
		{ d: 'M6.6 11.2C3.2 10.6 1.4 7.6 1.8 3c1.4 3 2.8 4.6 5.6 5.2zM17.4 11.2c3.4-.6 5.2-3.6 4.8-8.2-1.4 3-2.8 4.6-5.6 5.2z' },
	] }],
	// A lute, its soundhole and bridge cut in.
	Bard: [{ transform: 'rotate(-38 12 12)', shapes: [
		{ d: 'M12 23c-4.4 0-6-3.4-5.6-6.4.4-3 2.8-5 4.7-5.8V3.4h1.8v7.4c1.9.8 4.3 2.8 4.7 5.8.4 3-1.2 6.4-5.6 6.4zM12 14.2a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 1 0 0-3.8zM10.2 20h3.6v1h-3.6z', evenodd: true },
		{ d: 'M10.4.8h3.2l-.4 3h-2.4z' },
	] }],
	// A sun disc with long and short rays: no one faith's symbol.
	Cleric: [{ shapes: [{ d: sun(12, 12) }] }],
	// An acorn between two oak leaves.
	Druid: [{ shapes: [
		{ d: 'M8.2 12.8h7.6c.4 4.2-1.4 7.8-3.8 9.8-2.4-2-4.2-5.6-3.8-9.8z' }, { d: 'M7 11.8C7 8.8 9.2 7 12 7s5 1.8 5 4.8z' },
		{ d: 'M11.5 7.4l.3-3.8h1l-.1 3.8z' }, { d: 'M6.6 7.8C3.8 8.8 1.2 7.2.6 3.8c3-.6 5.4.8 6 4zM17.4 7.8c2.8 1 5.4-.6 6-4-3-.6-5.4.8-6 4z' },
	] }],
	// Two longswords crossed.
	Fighter: [{ transform: 'rotate(42 12 12)', shapes: [{ d: sword }] }, { transform: 'rotate(-42 12 12)', shapes: [{ d: sword }] }],
	// An open hand, a ki spiral in the palm.
	Monk: [{ shapes: [
		{ d: 'M8.3 12V5.4M11 12V3.8M13.7 12V4.6M16.3 12V6.8M7.4 17.2 3.8 11.6', stroke: 2.2 },
		{ d: `M7.2 10.8h10.2v5.6c0 3.4-2.3 5.6-5.1 5.6s-5.1-2-5.1-4.6z${dot(12.3, 15.8, 2.1)}`, evenodd: true },
		{ d: dot(12.3, 15.8, 0.9) },
	] }],
	// A longsword held upright before a heater shield: the oath. Drawn bolder than the
	// study's first try so it reads at 22px: a broad blade and guard, a clear gap round them.
	Paladin: [{ shapes: [
		{ d: 'M3.6 5.2C6.6 5.3 9.4 4.6 12 3.2c2.6 1.4 5.4 2.1 8.4 2v6.4c0 5.2-3.4 8.6-8.4 10.8-5-2.2-8.4-5.6-8.4-10.8zM9.6 1.6h4.8v11.6h4.4v5.2h-4.4v5.2H9.6v-5.2H5.2v-5.2h4.4z', evenodd: true },
		{ d: 'M12 0.2l1.9 2.4v11.6h-3.8V2.6zM6.4 14.4h11.2v2.8H6.4zM11 17.2h2v3.6h-2z' },
		{ d: dot(12, 22.2, 1.5) },
	] }],
	// A longbow, strung, an arrow nocked.
	Ranger: [{ shapes: [
		{ d: 'M7.2 2C13.4 5.6 13.4 18.4 7.2 22', stroke: 2.5 }, { d: 'M7.2 2v20', stroke: 0.9 },
		{ d: 'M3 11.1h15.4v1.8H3zM17.8 9.4l5.6 2.6-5.6 2.6zM3.4 12 1 9.4h2.6L6 12l-2.4 2.6H1z' },
	] }],
	// A domino mask with its ties.
	Rogue: [{ shapes: [
		{ d: 'M1.8 9.4C5 7.4 9 7.8 12 9.6c3-1.8 7-2.2 10.2-.2.6 4-1.8 7.6-5.4 7.6-2.4 0-3.8-1.4-4.8-3-1 1.6-2.4 3-4.8 3-3.6 0-6-3.6-5.4-7.6zM5 12c1.2-1.5 3.8-1.6 5.2 0-1.4 1.5-4 1.5-5.2 0zM13.8 12c1.4-1.6 4-1.5 5.2 0-1.2 1.5-3.8 1.5-5.2 0z', evenodd: true },
		{ d: 'M2.2 10.4.4 14.6l1 .4 1.9-3.8zM21.8 10.4l1.8 4.2-1 .4-1.9-3.8z' },
	] }],
	// A flame with a second flame inside: magic in the blood.
	Sorcerer: [{ shapes: [{ d: 'M12 1.6c1 4 6.6 6.4 6.6 12.6 0 4.6-3 7.8-6.6 7.8s-6.6-3.2-6.6-7.4c0-3 1.7-5 3.1-6.2 0 2.2.8 3.6 2 4.2C9.9 8.6 10.9 5 12 1.6zM12 12c1.4 2 3.4 3.4 3.2 5.6-.2 1.8-1.6 2.8-3.2 2.8s-3-1-3-2.6c0-1.4.8-2.2 1.6-2.8.2 1 .7 1.6 1.3 1.8-.4-1.8-.3-3.4.1-4.8z', evenodd: true }] }],
	// The patron's eye, slit pupil, rays above and below.
	Warlock: [{ shapes: [
		{ d: 'M1.6 12C5 6.6 19 6.6 22.4 12 19 17.4 5 17.4 1.6 12zM12 7.9a4.1 4.1 0 1 0 0 8.2 4.1 4.1 0 1 0 0-8.2z', evenodd: true },
		{ d: 'M12 8.6c1.2 1.6 1.2 5.2 0 6.8-1.2-1.6-1.2-5.2 0-6.8z' },
		{ d: 'M12 1.4v3M6.2 2.6l1.4 2.6M17.8 2.6l-1.4 2.6M12 22.6v-3M6.2 21.4l1.4-2.6M17.8 21.4l-1.4-2.6', stroke: 1.5 },
	] }],
	// A pointed hat, a star cut in it and a star beside it.
	Wizard: [{ shapes: [
		{ d: `M13 1.6c-.6 4 1.6 9 4.6 13.6H6.4C9 11.6 10.4 6.6 13 1.6zM7.4 12.4h9.2l.8 1.4H6.6z${star4(12.6, 9.2, 1.9, 0.34)}`, evenodd: true },
		{ d: 'M1.8 17.8c0-1.8 4.6-2.8 10.2-2.8s10.2 1 10.2 2.8-4.6 2.8-10.2 2.8S1.8 19.6 1.8 17.8z' },
		{ d: star4(19.4, 5, 2.6, 0.34) },
	] }],
};
/** A class we have no drawing for (homebrew): a four-point star. */
const OTHER: Group[] = [{ shapes: [{ d: star4(12, 12, 9, 0.32) }] }];

export const SCROLL_CLASSES = Object.keys(MOTIFS);

/** The motif for a class name (SRD classes; anything else gets the star). */
export function classMotif(name: string): Group[] {
	const k = Object.keys(MOTIFS).find(c => c.toLowerCase() === name.trim().toLowerCase());
	return k ? MOTIFS[k] : OTHER;
}

const H = 28;
const ORN: Shape[] = [
	{ cls: 'ox', d: 'M-1 12.7 18 12.3l4 1.7-4 1.7-19-.4z' },
	{ cls: 'fil', d: 'M3 12.5c8-.4 14.4-2.6 18.6-6 3-2.4 7-3 9-1 2 2 .6 5-2 4.8-1.8-.2-2.4-2.2-1-3M3 15.5c8 .4 14.4 2.6 18.6 6 3 2.4 7 3 9 1 2-2 .6-5-2-4.8-1.8.2-2.4 2.2-1 3' },
	{ cls: 'fil', d: 'M11.6 11C9.8 9.2 10 6.6 12 6.1c1.5-.4 2.4 1.2 1.4 2.1M11.6 17c-1.8 1.8-1.6 4.4.4 4.9 1.5.4 2.4-1.2 1.4-2.1' },
	{ cls: 'gd', d: 'M23.4 14l2.4-2.4 2.4 2.4-2.4 2.4z' },
	{ cls: 'gd', d: 'M33.4 3.2l1.2-1.2 1.2 1.2-1.2 1.2zM33.4 24.8l1.2-1.2 1.2 1.2-1.2 1.2z' },
	{ cls: 'fil', d: 'M67 14h22', stroke: 0.9 },
	{ cls: 'gd', d: 'M76.4 14l1.6-1.6 1.6 1.6-1.6 1.6z' },
	{ cls: 'ox', d: 'M92 14l4.5-4.5L101 14l-4.5 4.5z', stroke: 0.9 },
];
const COMPACT: Shape[] = [{ cls: 'ox', d: 'M1 14l21-1.3v2.6z' }, { cls: 'gd', d: 'M23 14l2.6-2.6 2.6 2.6-2.6 2.6z' }];

function drawShapes(parent: SVGElement, shapes: Shape[]): void {
	for (const s of shapes) {
		const attr: Record<string, string> = { d: s.d };
		if (s.evenodd) attr['fill-rule'] = 'evenodd';
		// An oxblood shape with a stroke is rimmed in gold; a motif's stroke is a line in the motif's gold.
		const cls = s.cls === 'ox' && s.stroke !== undefined ? 'ox is-rim' : s.cls ?? (s.stroke !== undefined ? 'is-line' : '');
		const p = parent.createSvg('path', { cls: cls ? cls.split(' ') : undefined, attr });
		if (s.stroke !== undefined) p.setCssProps({ '--d5-sw': String(s.stroke) });
	}
}

function drawMotif(svg: SVGElement, motif: Group[], x: number): void {
	const g = svg.createSvg('g', { cls: 'm', attr: { transform: `translate(${x} 2)` } });
	for (const grp of motif) drawShapes(grp.transform ? g.createSvg('g', { attr: { transform: grp.transform } }) : g, grp.shapes);
}

function side(parent: HTMLElement, motif: Group[], right: boolean): void {
	const el = parent.createSpan({ cls: `dnd5e-scroll-side${right ? ' is-r' : ''}`, attr: { 'aria-hidden': 'true' } });
	const full = el.createSpan({ cls: 'dnd5e-scroll-full' });
	const svg = (into: HTMLElement, w: number, cls: string, aspect = true) => into.createSvg('svg', { cls, attr: { viewBox: `0 0 ${w} ${H}`, width: String(w), height: String(H), ...(aspect ? {} : { preserveAspectRatio: 'none' }) } });
	drawShapes(svg(full, 10, 'dnd5e-scroll-cap'), [{ cls: 'gd', d: 'M1 14l4-4 4 4-4 4z' }]);
	drawShapes(svg(full, 100, 'dnd5e-scroll-reach', false), [{ cls: 'ox', d: 'M0 14 100 12.7v2.6z' }]);
	const orn = svg(full, 102, 'dnd5e-scroll-orn');
	drawShapes(orn, ORN);
	drawMotif(orn, motif, 38);
	const compact = svg(el, 58, 'dnd5e-scroll-compact');
	drawShapes(compact, COMPACT);
	drawMotif(compact, motif, 34);
}

/** The class's heading: its name between two scrolls. */
export function classScroll(parent: HTMLElement, className: string, cls = ''): HTMLElement {
	const motif = classMotif(className);
	const el = parent.createDiv({ cls: `dnd5e-scroll ${cls}`.trim() });
	side(el, motif, false);
	el.createSpan({ cls: 'dnd5e-scroll-title', text: className });
	side(el, motif, true);
	return el;
}
