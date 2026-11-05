// The campaign outline: party line, Continue, chapters with their scenes, and
// the other folders (NPCs, Sessions…). Used by the Campaign panel and by the
// ```nimble-campaign dashboard block on a campaign's home note.

import { Menu, setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { Campaign, Chapter, NoteKind, NoteRef, Section } from './campaign-model';
import { SECTION_FOR } from './campaigns';
import { ChapterPicker, NamePrompt } from './campaign-modals';
import { onLongPress } from './touch';

export const KIND_ICON: Record<NoteKind, string> = {
	campaign: 'castle', chapter: 'book-marked', scene: 'clapperboard', map: 'map', npc: 'user-round', location: 'map-pin',
	session: 'calendar-days', monster: 'skull', handout: 'scroll-text', note: 'file-text',
};
const SECTION_ICON: Record<string, string> = { NPCs: 'users-round', Locations: 'map-pin', Sessions: 'calendar-days', Monsters: 'skull', Handouts: 'scroll-text', Assets: 'image', Maps: 'map' };

export interface OutlineOptions {
	/** Path of the note open in the editor, highlighted in the list. */
	current?: string;
	/** Remembered open/closed state of chapters and sections, by folder. */
	collapsed: Set<string>;
	onToggle?: () => void;
	/** Dashboard block: no Continue (it's on the page already). */
	inNote?: boolean;
}

function iconBtn(parent: HTMLElement, icon: string, label: string, onClick: (e: MouseEvent) => void, cls = ''): HTMLElement {
	const b = parent.createEl('button', { cls: `clickable-icon ${cls}`, attr: { 'aria-label': label } });
	setIcon(b, icon);
	b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(e); });
	return b;
}

function noteRow(parent: HTMLElement, plugin: NimbleStatblocksPlugin, n: NoteRef, opts: OutlineOptions, sourcePath?: string): HTMLElement {
	const row = parent.createEl('a', { cls: `campaign-note kind-${n.kind}`, href: '#', attr: { 'data-path': n.path } });
	if (n.path === opts.current) row.addClass('is-current');
	setIcon(row.createSpan({ cls: 'campaign-note-icon' }), KIND_ICON[n.kind]);
	const title = n.area && n.title.startsWith(n.area) ? n.title.slice(n.area.length).replace(/^[\s:.\-–—]+/, '') : n.title;
	if (n.area) row.createSpan({ cls: 'campaign-note-area', text: n.area });
	row.createSpan({ cls: 'campaign-note-title', text: title });
	row.addEventListener('click', (e) => {
		e.preventDefault();
		void plugin.app.workspace.openLinkText(n.path, sourcePath ?? '', e.metaKey || e.ctrlKey);
	});
	// Obsidian's page preview on hover (desktop), like any internal link.
	row.addEventListener('mouseover', (e) => {
		plugin.app.workspace.trigger('hover-link', { event: e, source: 'nimble-statblocks', hoverParent: parent, targetEl: row, linktext: n.path, sourcePath: sourcePath ?? '' });
	});
	return row;
}

function group(parent: HTMLElement, key: string, opts: OutlineOptions, head: (h: HTMLElement) => void, body: (b: HTMLElement) => void): void {
	const g = parent.createDiv({ cls: 'campaign-group' });
	const open = !opts.collapsed.has(key);
	g.toggleClass('is-collapsed', !open);
	const h = g.createDiv({ cls: 'campaign-group-head', attr: { role: 'button', tabindex: '0', 'aria-expanded': String(open) } });
	setIcon(h.createSpan({ cls: 'campaign-chevron' }), 'chevron-right');
	head(h);
	const b = g.createDiv({ cls: 'campaign-group-body' });
	if (open) body(b);
	const toggle = () => {
		if (opts.collapsed.has(key)) opts.collapsed.delete(key); else opts.collapsed.add(key);
		opts.onToggle?.();
	};
	h.addEventListener('click', toggle);
	h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
}

/** Party line: "4 heroes · level 3", or the starting level until heroes are added. */
export function renderPartyLine(el: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign): void {
	const party = plugin.settings.activeCampaign === c.folder ? plugin.settings.party : (plugin.settings.campaigns?.[c.folder]?.party ?? []);
	const line = el.createEl('button', { cls: 'campaign-party', attr: { 'aria-label': 'Edit this campaign\'s party' } });
	setIcon(line.createSpan({ cls: 'campaign-party-icon' }), 'users-round');
	if (party.length) {
		const lv = [...new Set(party.map(h => h.level))].sort((a, b) => a - b);
		line.createSpan({ text: `${party.length} hero${party.length === 1 ? '' : 'es'} · level ${lv.length > 1 ? `${lv[0]}–${lv[lv.length - 1]}` : lv[0]}` });
		line.setAttr('title', party.map(h => `${h.name} (${h.className ?? 'hero'} ${h.level})`).join(', '));
	} else {
		line.createSpan({ text: `${c.heroes ?? plugin.settings.defaultPartySize ?? 4} heroes · level ${c.level ?? 1}` });
		line.createSpan({ cls: 'campaign-party-hint', text: 'Add heroes' });
	}
	line.addEventListener('click', async () => {
		if (plugin.settings.activeCampaign !== c.folder) await plugin.campaigns.setActive(c.folder);
		plugin.openParty();
	});
}

export function renderOutline(el: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign, opts: OutlineOptions): void {
	const store = plugin.campaigns;

	if (!opts.inNote) {
		const last = store.lastScene(c);
		const first = c.chapters[0]?.scenes[0]?.path;
		const target = last ?? first;
		if (target) {
			const go = el.createEl('button', { cls: 'campaign-continue mod-cta' });
			setIcon(go.createSpan(), 'play');
			const name = target.replace(/^.*\//, '').replace(/\.md$/, '');
			go.createSpan({ cls: 'campaign-continue-label', text: last ? 'Continue' : 'Start' });
			go.createSpan({ cls: 'campaign-continue-name', text: name });
			go.addEventListener('click', () => void store.open(target));
		}
	}

	// Chapters
	const chHead = el.createDiv({ cls: 'campaign-heading' });
	chHead.createSpan({ text: 'Chapters' });
	iconBtn(chHead, 'plus', 'New chapter', () => promptChapter(plugin, c));
	if (!c.chapters.length) {
		const empty = el.createDiv({ cls: 'campaign-empty' });
		empty.setText('No chapters yet. A chapter is a folder in this campaign with a chapter note; ');
		const a = empty.createEl('a', { text: 'add one', href: '#' });
		a.addEventListener('click', (e) => { e.preventDefault(); promptChapter(plugin, c); });
		empty.appendText('.');
	}
	for (const ch of c.chapters) renderChapter(el, plugin, c, ch, opts);

	// Other folders
	const sections = orderedSections(c);
	if (sections.length || c.loose.length) {
		const h = el.createDiv({ cls: 'campaign-heading' });
		h.createSpan({ text: 'Campaign' });
		iconBtn(h, 'plus', 'New NPC, location or session', (e) => newMenu(plugin, c, e));
	}
	for (const n of c.loose) noteRow(el.createDiv({ cls: 'campaign-loose' }), plugin, n, opts);
	for (const s of sections) renderSection(el, plugin, c, s, opts);
}

/** Sessions first (newest at the top), then NPCs and Locations, then the rest. */
function orderedSections(c: Campaign): Section[] {
	const rank = (s: Section) => ({ Sessions: 0, NPCs: 1, Locations: 2 } as Record<string, number>)[s.name] ?? 3;
	return [...c.sections].filter(s => s.notes.length || s.name in SECTION_ICON).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function renderChapter(el: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign, ch: Chapter, opts: OutlineOptions): void {
	group(el, ch.folder, opts, (h) => {
		h.addClass('campaign-chapter-head');
		if (ch.home.path === opts.current) h.addClass('is-current');
		const t = h.createDiv({ cls: 'campaign-chapter-title' });
		if (ch.label) t.createSpan({ cls: 'campaign-chapter-label', text: ch.label });
		const name = t.createEl('a', { cls: 'campaign-chapter-name', text: ch.name, href: '#' });
		name.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); void plugin.app.workspace.openLinkText(ch.home.path, '', e.metaKey || e.ctrlKey); });
		h.createSpan({ cls: 'campaign-count', text: String(ch.scenes.length) });
		for (const m of ch.maps) iconBtn(h, 'map', `Open ${m.title}`, () => void plugin.campaigns.open(m.path), 'campaign-map-btn');
		iconBtn(h, 'plus', `New scene in ${ch.name}`, () => promptScene(plugin, ch), 'campaign-add-scene');
	}, (b) => {
		b.addClass('campaign-scenes');
		for (const s of ch.scenes) noteRow(b, plugin, s, opts);
		if (!ch.scenes.length) {
			const add = b.createEl('a', { cls: 'campaign-add-inline', text: '+ First scene', href: '#' });
			add.addEventListener('click', (e) => { e.preventDefault(); promptScene(plugin, ch); });
		}
	});
}

function renderSection(el: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign, s: Section, opts: OutlineOptions): void {
	group(el, s.folder, opts, (h) => {
		setIcon(h.createSpan({ cls: 'campaign-section-icon' }), SECTION_ICON[s.name] ?? 'folder');
		h.createSpan({ cls: 'campaign-section-name', text: s.name });
		h.createSpan({ cls: 'campaign-count', text: String(s.notes.length) });
		const kind = (Object.entries(SECTION_FOR) as [keyof typeof SECTION_FOR, string][]).find(([, f]) => f === s.name)?.[0];
		if (kind) iconBtn(h, 'plus', `New ${kind === 'npc' ? 'NPC' : kind}`, () => promptSectionNote(plugin, c, kind), 'campaign-add-scene');
	}, (b) => {
		const notes = s.name === 'Sessions' ? [...s.notes].reverse() : s.notes;
		for (const n of notes) noteRow(b, plugin, n, opts);
		if (!s.notes.length) b.createDiv({ cls: 'campaign-empty', text: 'Nothing here yet.' });
	});
}

function newMenu(plugin: NimbleStatblocksPlugin, c: Campaign, e: MouseEvent): void {
	const m = new Menu();
	m.addItem(i => i.setTitle('New session log').setIcon('calendar-days').onClick(() => promptSectionNote(plugin, c, 'session')));
	m.addItem(i => i.setTitle('New NPC').setIcon('user-round').onClick(() => promptSectionNote(plugin, c, 'npc')));
	m.addItem(i => i.setTitle('New location').setIcon('map-pin').onClick(() => promptSectionNote(plugin, c, 'location')));
	m.addItem(i => i.setTitle('New chapter').setIcon('book-marked').onClick(() => promptChapter(plugin, c)));
	m.showAtMouseEvent(e);
}

async function openNew(plugin: NimbleStatblocksPlugin, p: Promise<{ path: string }>): Promise<void> {
	const f = await p;
	await plugin.campaigns.open(f.path);
}

export function promptChapter(plugin: NimbleStatblocksPlugin, c: Campaign): void {
	let label = '';
	new NamePrompt(plugin.app, 'New chapter', 'Chapter name, e.g. The Sunless Citadel', `Chapter ${c.chapters.length + 1}`, 'Create',
		(name) => void openNew(plugin, plugin.campaigns.createChapter(c, name, label || undefined)),
		(el) => {
			const l = el.createEl('input', { type: 'text', cls: 'nimble-name-input', attr: { placeholder: 'Short label (optional): Act 1, Prelude, Part 2…', 'aria-label': 'Chapter label' } });
			l.addEventListener('input', () => { label = l.value.trim(); });
		}).open();
}

export function promptScene(plugin: NimbleStatblocksPlugin, ch: Chapter): void {
	new NamePrompt(plugin.app, `New scene in ${ch.name}`, 'Scene name, e.g. The Collapsed Bridge', '', 'Create',
		(name) => void openNew(plugin, plugin.campaigns.createScene(ch, name))).open();
}

/** New scene from a command: the chapter you're in, or ask which. */
export function newSceneAnywhere(plugin: NimbleStatblocksPlugin): void {
	const f = plugin.app.workspace.getActiveFile();
	const here = f ? plugin.campaigns.chapterOf(f.path) : undefined;
	if (here) { promptScene(plugin, here); return; }
	const c = plugin.campaigns.active;
	if (!c) { plugin.newCampaign(); return; }
	if (c.chapters.length === 1) { promptScene(plugin, c.chapters[0]); return; }
	if (!c.chapters.length) { promptChapter(plugin, c); return; }
	new ChapterPicker(plugin.app, c.chapters, (ch) => promptScene(plugin, ch)).open();
}

export function promptSectionNote(plugin: NimbleStatblocksPlugin, c: Campaign, kind: keyof typeof SECTION_FOR): void {
	const label = kind === 'npc' ? 'NPC' : kind;
	const initial = kind === 'session' ? plugin.campaigns.nextSessionName(c) : '';
	new NamePrompt(plugin.app, `New ${label}`, kind === 'npc' ? 'Name, e.g. Sister Garaele' : kind === 'location' ? 'Place, e.g. Phandalin' : 'Session name', initial, 'Create',
		(name) => void openNew(plugin, plugin.campaigns.createInSection(c, kind, name))).open();
}

/** Campaign switcher menu: every campaign, plus New campaign. */
export function campaignMenu(plugin: NimbleStatblocksPlugin, e: MouseEvent | PointerEvent): void {
	const m = new Menu();
	for (const c of plugin.campaigns.campaigns) {
		m.addItem(i => i.setTitle(c.name).setIcon(c.folder === plugin.settings.activeCampaign ? 'check' : 'castle').onClick(async () => {
			await plugin.campaigns.setActive(c.folder);
		}));
	}
	m.addSeparator();
	m.addItem(i => i.setTitle('New campaign…').setIcon('plus').onClick(() => plugin.newCampaign()));
	m.showAtMouseEvent(e as MouseEvent);
}

