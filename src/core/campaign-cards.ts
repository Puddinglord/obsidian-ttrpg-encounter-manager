// The cards at the top of quest, location and session notes, the same anatomy in every game and each
// game's look on top (design study: #nimble/campaign, #5e/campaign). A quest: kicker, title, a status
// stamp; who gave it, where, the reward; objectives you can tick; the GM's secret. A location: a banner,
// kicker, name, region, who's here, where it leads. A session: who was at the table, what happened,
// which quests moved, the loot, next time. What a game adds (5e's read-aloud, Nimble's monsters) comes
// through its noteKinds `card`, drawn under the facts.
//
// Everything is read from what the notes already hold (campaign-card-def.ts). A section the card shows
// (a quest's Objectives, a session's Recap) is left out of the note's reading view, so nothing shows twice.

import { MarkdownPostProcessorContext, setIcon, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../main';
import { fmText, noteKind } from './campaign-model';
import {
	fmList, inTaken, LEADS, linksIn, linkTarget, noteSections, findSection, questCard, questKind, questMoves, questStamp,
	sessionCard, sessionHead, setTask,
} from './campaign-card-def';
import { appendRichText } from './markdown';
import { wireWikiLinks } from './wiki-links';
import { evIcon, EvIconName } from './icons';
import { portraitOf, renderAvatar } from './npc-card';
import { isRemote, portraitLink, IMAGE_EXTENSIONS } from './npc-card-def';

/** The kinds that get core's card. */
export const CARD_KINDS = ['quest', 'location', 'session'] as const;
export type CardKind = typeof CARD_KINDS[number];
export const isCardKind = (k: string): k is CardKind => (CARD_KINDS as readonly string[]).includes(k);

export interface CardInput {
	plugin: EmberVaultPlugin;
	path: string;
	fm: Record<string, unknown>;
	/** The note's text (for its sections). */
	text: string;
	player: boolean;
	/** Draws what the game adds, under the facts. */
	extras: (el: HTMLElement) => void;
}

/** The card for a quest, location or session note, in `parent`. Returns the card. */
export function drawCampaignCard(parent: HTMLElement, kind: CardKind, input: CardInput): HTMLElement {
	const card = parent.createDiv({ cls: `ev-cq kind-${kind}` });
	if (kind === 'quest') drawQuest(card, input);
	else if (kind === 'location') drawLocation(card, input);
	else drawSession(card, input);
	wireWikiLinks(card, input.plugin.app, input.path);
	return card;
}

const titleOf = (path: string, fm: Record<string, unknown>) => fmText(fm.title).trim() || path.replace(/^.*\//, '').replace(/\.md$/i, '');

function head(card: HTMLElement, icon: EvIconName, kicker: string, title: string): HTMLElement {
	const h = card.createDiv({ cls: 'ev-cq-head' });
	const k = h.createDiv({ cls: 'ev-cq-kicker' });
	setIcon(k.createSpan({ cls: 'ev-cq-kicker-icon' }), evIcon(icon));
	k.createSpan({ text: kicker });
	h.createDiv({ cls: 'ev-cq-title', text: title });
	return h;
}

/** A section heading inside the card, with an optional note on its right ("1 of 3"). */
function sec(card: HTMLElement, title: string, note?: string): void {
	const s = card.createDiv({ cls: 'ev-cq-sec' });
	s.createSpan({ text: title });
	if (note) s.createSpan({ cls: 'ev-cq-sec-note', text: note });
}

/** A fact: icon, a small label, the value (links work). The label stays beside its value. */
function fact(row: HTMLElement, icon: EvIconName, label: string, fill: (v: HTMLElement) => void): void {
	const f = row.createDiv({ cls: 'ev-cq-fact' });
	setIcon(f.createSpan({ cls: 'ev-cq-fact-icon' }), evIcon(icon));
	f.createSpan({ cls: 'ev-cq-fact-label', text: label });
	fill(f.createSpan({ cls: 'ev-cq-fact-value' }));
}

/** Text that may be a [[link]]: as a link when it is one. */
function linkOrText(el: HTMLElement, v: string): void {
	appendRichText(el, v);
}

/** A person: their portrait (or initials), then their name as a link. */
function who(parent: HTMLElement, plugin: EmberVaultPlugin, raw: string, from: string): void {
	const { target, shown, link } = linkTarget(raw);
	const chip = parent.createSpan({ cls: 'ev-cq-who' });
	const file = plugin.app.metadataCache.getFirstLinkpathDest(target, from);
	const portrait = file ? portraitOf(plugin.app, file.path) : null;
	if (portrait) renderAvatar(chip, portrait, 'ev-cq-avatar');
	else chip.createSpan({ cls: 'ev-cq-avatar is-initials', text: initials(shown) });
	const name = chip.createSpan({ cls: 'ev-cq-who-name' });
	appendRichText(name, link || file ? `[[${target}${shown !== target ? `|${shown}` : ''}]]` : shown);
	// An NPC's name is a quick look, as NPC chips are everywhere; Cmd/Ctrl-click opens the page.
	const npc = file ? plugin.campaigns.npcs.find(n => n.path === file.path) : undefined;
	if (!file || !npc) return;
	chip.addClass('is-npc');
	name.addEventListener('click', (e) => {
		if (e.metaKey || e.ctrlKey || !(e.target as HTMLElement | null)?.closest('a')) return;
		e.preventDefault();
		e.stopPropagation();
		plugin.system(from).quickLook(plugin, { kind: 'note', file, sourcePath: from, subtitle: npc.role });
	}, true);
}

const initials = (name: string) => name.replace(/[[\]]/g, '').split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

function secret(card: HTMLElement, text: string): void {
	if (!text) return;
	const s = card.createDiv({ cls: 'ev-cq-secret' });
	const k = s.createSpan({ cls: 'ev-cq-secret-label' });
	setIcon(k.createSpan({ cls: 'ev-cq-secret-icon' }), evIcon('eye'));
	k.createSpan({ text: 'Secret' });
	const v = s.createDiv({ cls: 'ev-cq-secret-text' });
	text.split(/\n{2,}/).forEach((p) => appendRichText(v.createDiv(), p));
}

// ---------------------------------------------------------------------------
// Quest

function drawQuest(card: HTMLElement, x: CardInput): void {
	const { plugin, path, fm, player } = x;
	const chapter = plugin.campaigns.chapterOf(path);
	const h = head(card, 'flag', [questKind(fm.type), chapter?.name].filter(Boolean).join(' · '), titleOf(path, fm));
	const stamp = questStamp(fmText(fm.status));
	h.createSpan({ cls: `ev-cq-stamp is-${stamp.kind}`, text: stamp.text });

	const facts = card.createDiv({ cls: 'ev-cq-facts' });
	const giver = fmText(fm.giver).trim();
	if (giver) {
		const f = facts.createDiv({ cls: 'ev-cq-fact is-who' });
		setIcon(f.createSpan({ cls: 'ev-cq-fact-icon' }), evIcon('users'));
		f.createSpan({ cls: 'ev-cq-fact-label', text: 'Given by' });
		who(f, plugin, giver, path);
	}
	const where = fmText(fm.location).trim();
	if (where) fact(facts, 'castle', 'Where', v => linkOrText(v, where));
	const reward = fmText(fm.reward).trim();
	if (reward) fact(facts, 'sparkle', 'Reward', v => linkOrText(v, reward));
	const level = fmText(fm.level).trim();
	if (level && !player) fact(facts, 'target', 'Level', v => v.setText(level));
	if (!facts.childElementCount) facts.remove();
	x.extras(card);

	const data = questCard(fm, x.text, player);
	if (data.objectives.length) {
		sec(card, 'Objectives', `${data.objectives.filter(o => o.done).length} of ${data.objectives.length}`);
		const list = card.createEl('ul', { cls: 'ev-cq-objs' });
		for (const o of data.objectives) {
			const li = list.createEl('li', { cls: o.done ? 'is-done' : '' });
			const box = li.createEl('button', { cls: 'ev-cq-box', attr: { role: 'checkbox', 'aria-checked': String(o.done), 'aria-label': o.done ? 'Done. Click to undo.' : 'Click when done' } });
			if (o.done) setIcon(box, evIcon('check'));
			box.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const file = plugin.app.vault.getFileByPath(path);
				if (file) void plugin.app.vault.process(file, (t) => setTask(t, o.line, !o.done));
			});
			appendRichText(li.createSpan({ cls: 'ev-cq-obj-text' }), o.text);
		}
	}
	secret(card, data.secret);
}

// ---------------------------------------------------------------------------
// Location

function drawLocation(card: HTMLElement, x: CardInput): void {
	const { plugin, path, fm, player } = x;
	banner(card, plugin, fm, path);
	const type = fmText(fm.type).trim();
	head(card, 'castle', ['Location', type ? type[0].toUpperCase() + type.slice(1) : ''].filter(Boolean).join(' · '), titleOf(path, fm));
	const facts = card.createDiv({ cls: 'ev-cq-facts' });
	const region = fmText(fm.region).trim();
	if (region) fact(facts, 'flag', 'Region', v => linkOrText(v, region));
	if (!facts.childElementCount) facts.remove();
	x.extras(card);

	// Who's here: the campaign's NPCs whose `location:` is this place.
	const file = plugin.app.vault.getFileByPath(path);
	const here = file ? npcsAt(plugin, file) : [];
	if (here.length) {
		sec(card, 'Who’s here');
		const whos = card.createDiv({ cls: 'ev-cq-whos' });
		for (const n of here) who(whos, plugin, `[[${n}]]`, path);
	}
	// Where it leads: `leads:`, or the links in its Leads to / Exits / Connections section.
	const leads = fmList(fm.leads).length ? fmList(fm.leads).map(l => linkTarget(l).target) : linksIn(findSection(noteSections(x.text), LEADS)?.body.join('\n') ?? '');
	if (leads.length) {
		sec(card, 'Leads to');
		const row = card.createDiv({ cls: 'ev-cq-leads' });
		for (const l of leads) appendRichText(row.createSpan({ cls: 'ev-cq-lead' }), `[[${l}]]`);
	}
	if (!player) secret(card, fmText(fm.secret).trim());
}

/** NPC notes in the place's campaign whose `location:` links to it. */
function npcsAt(plugin: EmberVaultPlugin, place: TFile): string[] {
	const camp = plugin.campaigns.of(place.path);
	const out: string[] = [];
	for (const n of plugin.campaigns.npcs) {
		if (camp && n.campaign !== camp.folder) continue;
		const f = plugin.app.vault.getFileByPath(n.path);
		const loc = f ? fmText(plugin.app.metadataCache.getFileCache(f)?.frontmatter?.location).trim() : '';
		if (!loc) continue;
		const dest = plugin.app.metadataCache.getFirstLinkpathDest(linkTarget(loc).target, n.path);
		if (dest?.path === place.path) out.push(f!.basename);
	}
	return out.sort((a, b) => a.localeCompare(b));
}

/**
 * The place's banner: its image when it has one, else an explorer's hex map with a faint compass rose,
 * drawn in the game's tint (`currentColor`, opacities from the CSS); and its emblem.
 */
function banner(card: HTMLElement, plugin: EmberVaultPlugin, fm: Record<string, unknown>, path: string): void {
	const b = card.createDiv({ cls: 'ev-cq-banner' });
	const link = portraitLink(fm.image ?? fm.banner);
	let src: string | null = null;
	if (link && isRemote(link)) src = link;
	else if (link) {
		const f = plugin.app.metadataCache.getFirstLinkpathDest(link, path);
		if (f && IMAGE_EXTENSIONS.includes(f.extension.toLowerCase())) src = plugin.app.vault.getResourcePath(f);
	}
	if (src) {
		b.addClass('has-image');
		b.createEl('img', { cls: 'ev-cq-banner-img', attr: { src, alt: '', draggable: 'false' } });
	} else hexMap(b);
	setIcon(b.createSpan({ cls: 'ev-cq-emblem' }), evIcon('castle'));
}

// The banner's map is drawn in CSS pixels (no viewBox), so the hexes and hairlines are one size at every
// card width. Everything hangs off the rose, which sits a fixed distance in from the right edge.
const HEX_R = 13; // a flat-topped hex, centre to corner
const HEX_ROW = 22.5; // flat side to flat side: √3·13 is 22.52, so two rows tile in whole pixels
const ROSE_X = -62; // the rose's centre, from the right edge
const ROSE_Y = 5; // below the middle, which leaves room for its N
const ROSE = { ring: 21.5, band: 19, outer: 23.5, cardinal: 31, cardinalW: 3.5, ordinal: 19, ordinalW: 2.6, hub: 1.5, halo: 2 };
/** Each map's ids get a number, so two cards on one page (a note and its hover preview) keep their own masks. */
let mapSeq = 0;

const num = (n: number): string => String(Math.round(n * 100) / 100);
/** (x, y) turned by `a` radians about the rose's centre. */
const turn = (x: number, y: number, a: number): string => `${num(x * Math.cos(a) - y * Math.sin(a))} ${num(x * Math.sin(a) + y * Math.cos(a))}`;

/** The hex map: a grid fading in past the emblem and out at the edges, and a ghosted compass rose. */
function hexMap(b: HTMLElement): void {
	const n = ++mapSeq;
	const ref = (k: string): string => `ev-cq-${k}-${n}`;
	const url = (k: string): string => `url(#${ref(k)})`;
	const svg = b.createSvg('svg', { cls: 'ev-cq-map', attr: { 'aria-hidden': 'true' } });
	const defs = svg.createSvg('defs');
	// A group whose origin is the rose's centre, wherever the right edge is.
	const atRose = (parent: SVGElement): SVGGElement =>
		parent.createSvg('svg', { attr: { x: '100%', y: '50%', overflow: 'visible' } }).createSvg('g', { attr: { transform: `translate(${ROSE_X} ${ROSE_Y})` } });

	// The tile: two columns by two rows of hexes, each drawing its top and its two right-hand edges, so every
	// edge is drawn once. Neighbours spill in so lines crossing the tile's edges join up. A hex is centred on the rose.
	const tileW = 3 * HEX_R, tileH = 2 * HEX_ROW;
	let d = '';
	for (let i = -1; i <= 1; i++) {
		for (let j = -1; j <= 2; j++) {
			for (const [cx, cy] of [[tileW * i, HEX_ROW * (j + 0.25)], [tileW * i + 1.5 * HEX_R, HEX_ROW * (j + 0.75)]]) {
				d += `M${num(cx - HEX_R / 2)} ${num(cy - HEX_ROW / 2)}H${num(cx + HEX_R / 2)}L${num(cx + HEX_R)} ${num(cy)}L${num(cx + HEX_R / 2)} ${num(cy + HEX_ROW / 2)}`;
			}
		}
	}
	defs.createSvg('pattern', { attr: { id: ref('hex'), width: tileW, height: tileH, y: num(-HEX_ROW / 4), patternUnits: 'userSpaceOnUse' } })
		.createSvg('path', { attr: { d, fill: 'none', stroke: 'currentColor', 'stroke-width': '0.6' } });

	// Where the grid shows: not under the emblem, less at the top and bottom, softly less round the rose, and
	// never touching it (a knockout halo, as printed maps keep lines off their symbols).
	const gradient = (tag: 'linearGradient' | 'radialGradient', k: string, stops: [number, number][], attr: Record<string, string> = {}): void => {
		const g = defs.createSvg(tag, { attr: { id: ref(k), ...attr } });
		for (const [offset, a] of stops) g.createSvg('stop', { attr: { offset, 'stop-color': '#000', 'stop-opacity': a } });
	};
	gradient('linearGradient', 'left', [[0, 1], [0.3, 0.92], [0.65, 0.35], [1, 0]]);
	gradient('linearGradient', 'edges', [[0, 0.3], [0.22, 0], [0.78, 0], [1, 0.3]], { x2: '0', y2: '1' });
	gradient('radialGradient', 'clear', [[0, 0.45], [0.5, 0.3], [1, 0]]);
	const mask = defs.createSvg('mask', { attr: { id: ref('fade'), maskUnits: 'userSpaceOnUse', x: '0', y: '0', width: '100%', height: '100%' } });
	mask.createSvg('rect', { attr: { width: '100%', height: '100%', fill: '#fff' } });
	mask.createSvg('rect', { attr: { width: '100%', height: '100%', fill: url('edges') } });
	mask.createSvg('rect', { attr: { width: '260', height: '100%', fill: url('left') } });
	const clear = atRose(mask);
	clear.createSvg('circle', { attr: { r: '70', fill: url('clear') } });
	const halo = clear.createSvg('g', { cls: 'ev-cq-halo', attr: { fill: '#000', stroke: '#000', 'stroke-width': ROSE.halo * 2, 'stroke-linejoin': 'round' } });
	halo.createSvg('circle', { attr: { r: ROSE.outer } });
	halo.createSvg('path', { attr: { d: star(ROSE.cardinal, ROSE.cardinalW, 0) } });
	halo.createSvg('rect', { attr: { x: '-3.5', y: num(-ROSE.cardinal - 9.6), width: '7', height: '7' } });

	atRose(svg.createSvg('g', { cls: 'ev-cq-grid', attr: { mask: url('fade') } }))
		.createSvg('rect', { attr: { x: '-3000', y: '-150', width: '3200', height: '300', fill: url('hex') } });
	rose(atRose(svg));
}

/** A four-pointed star's outline: tips at `t`, shoulders `w` out on the diagonals, turned by `a`. */
function star(t: number, w: number, a: number): string {
	let s = '';
	for (let k = 0; k < 4; k++) s += `${k ? 'L' : 'M'}${turn(-w, -w, a + k * Math.PI / 2)}L${turn(0, -t, a + k * Math.PI / 2)}`;
	return s + 'Z';
}

/**
 * An engraved compass rose: a ticked ring inside a hairline one, the four cardinal and four intercardinal
 * points each split down its length (one half shaded, one the paper's colour, which hides the ring behind it), and N.
 */
function rose(at: SVGGElement): void {
	const g = at.createSvg('g', { cls: 'ev-cq-rose', attr: { fill: 'none', stroke: 'currentColor', 'stroke-width': '0.55', 'stroke-linejoin': 'round' } });
	g.createSvg('circle', { attr: { r: ROSE.outer, 'stroke-width': '0.4' } });
	g.createSvg('circle', { attr: { r: ROSE.ring } });
	g.createSvg('circle', { attr: { r: ROSE.band } });
	let ticks = '';
	for (let k = 0; k < 32; k++) {
		if (k % 8) ticks += `M${turn(0, -ROSE.band, k * Math.PI / 16)}L${turn(0, -ROSE.ring, k * Math.PI / 16)}`;
	}
	g.createSvg('path', { attr: { d: ticks, 'stroke-width': '0.45' } });
	for (const [t, w, off] of [[ROSE.ordinal, ROSE.ordinalW, Math.PI / 4], [ROSE.cardinal, ROSE.cardinalW, 0]]) {
		for (let k = 0; k < 4; k++) {
			const a = off + k * Math.PI / 2;
			g.createSvg('path', { cls: 'ev-cq-paper', attr: { d: `M0 0L${turn(-w, -w, a)}L${turn(0, -t, a)}Z` } });
			g.createSvg('path', { cls: 'ev-cq-shade', attr: { d: `M0 0L${turn(0, -t, a)}L${turn(w, -w, a)}Z`, fill: 'currentColor' } });
		}
	}
	g.createSvg('circle', { cls: 'ev-cq-paper', attr: { r: ROSE.hub } });
	g.createSvg('text', { cls: 'ev-cq-rose-n', attr: { y: num(-ROSE.cardinal - 2.6), 'text-anchor': 'middle', fill: 'currentColor', stroke: 'none' } }).setText('N');
}

// ---------------------------------------------------------------------------
// Session

function drawSession(card: HTMLElement, x: CardInput): void {
	const { plugin, path, fm } = x;
	const h = sessionHead(titleOf(path, fm), fmText(fm.date));
	head(card, 'book', h.kicker, h.title);
	const party = fmList(fm.party);
	if (party.length) {
		const at = card.createDiv({ cls: 'ev-cq-at' });
		at.createSpan({ cls: 'ev-cq-at-label', text: 'At the table' });
		const whos = at.createDiv({ cls: 'ev-cq-whos' });
		for (const p of party) who(whos, plugin, p, path);
	}
	x.extras(card);
	const data = sessionCard(fm, x.text);
	if (data.recap.length) {
		sec(card, 'What happened');
		const ul = card.createEl('ul', { cls: 'ev-cq-recap' });
		for (const r of data.recap) appendRichText(ul.createEl('li'), r);
	}
	const moves = questMoves(fm.quests);
	if (moves.length) {
		sec(card, 'Quests');
		const list = card.createDiv({ cls: 'ev-cq-threads' });
		for (const m of moves) {
			const row = list.createDiv({ cls: 'ev-cq-thread' });
			appendRichText(row.createSpan({ cls: 'ev-cq-thread-name' }), m.quest);
			row.createSpan({ cls: `ev-cq-change is-${m.move}`, text: m.word });
		}
	}
	if (data.loot.length) {
		sec(card, 'Loot');
		const loot = card.createDiv({ cls: 'ev-cq-loot' });
		for (const l of data.loot) appendRichText(loot.createSpan({ cls: 'ev-cq-loot-item' }), l);
	}
	if (data.next) {
		const n = card.createDiv({ cls: 'ev-cq-next' });
		n.createSpan({ cls: 'ev-cq-next-label', text: 'Next time' });
		appendRichText(n.createSpan({ cls: 'ev-cq-next-text' }), data.next);
	}
}

// ---------------------------------------------------------------------------
// Nothing twice: the reading view leaves out the sections a card shows.

/** The line ranges a card shows from a note's text. */
export function takenSections(kind: string, fm: Record<string, unknown>, text: string, player: boolean): [number, number][] {
	if (kind === 'quest') return questCard(fm, text, player).taken;
	if (kind === 'session') return sessionCard(fm, text).taken;
	return [];
}

/**
 * Mark the reading view's sections that a card on the page already shows. They're hidden only inside a view
 * whose card is drawn (`.ev-cq-host`, set by the card), so an embed or a preview without the card shows them.
 */
export function registerCardSections(plugin: EmberVaultPlugin): void {
	let last: { key: string; taken: [number, number][] } | null = null;
	plugin.registerMarkdownPostProcessor((el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		const info = ctx.getSectionInfo(el);
		if (!info) return;
		const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
		const fm = (ctx.frontmatter as Record<string, unknown> | undefined) ?? (file && plugin.app.metadataCache.getFileCache(file)?.frontmatter) ?? {};
		const kind = noteKind(fm);
		if (kind !== 'quest' && kind !== 'session') return;
		const player = plugin.playerView(ctx.sourcePath);
		const key = `${ctx.sourcePath}|${player}|${info.text}`;
		if (last?.key !== key) last = { key, taken: takenSections(kind, fm, info.text, player) };
		if (inTaken(last.taken, info.lineStart)) el.addClass('ev-on-card');
	});
}
