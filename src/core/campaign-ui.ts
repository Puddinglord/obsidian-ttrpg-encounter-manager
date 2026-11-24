// The campaign outline: party line, Continue, chapters with their scenes, and
// the other folders (NPCs, Sessions, Factions, Assets…). Used by the Campaign
// panel and by the ```nimble-campaign dashboard block on a campaign's home note.
//
// Everything here can be managed without leaving the outline: + on every folder
// (a guided New note picker), right-click or long-press menus (move, rename,
// delete), and drag and drop of notes, files and folders between chapters and
// folders, including straight from Obsidian's file explorer.

import { Menu, Notice, setIcon, TFile, TFolder } from 'obsidian';
import { portraitOf, renderAvatar } from './npc-card';
import type EmberVaultPlugin from '../../main';
import { Campaign, Chapter, defaultKindFor, FileRef, homeFolderFor, isFileFolder, KIND_ICON, NoteRef, questOrder, questsIn, questState, Section } from './campaign-model';
import { evIcon } from './icons';
import { CharacterInfo, SECTION_FOR } from './campaigns';
import { CampaignPicker, CampaignSettingsModal, ChapterPicker, MovePicker, MoveTarget, NamePrompt, NewNoteModal, pickFiles, ROLE_INFO } from './campaign-modals';
import { STARTERS, StarterKind } from './campaign-templates';
import { draggedPaths, startFileDrag } from './internals';
import { handEnteredLeft, PartyMember } from './types';
import { confirmAction, onLongPress } from './touch';
import { openAsMarkdown } from './reading-mode';

export { KIND_ICON };
const SECTION_ICON: Record<string, string> = { Party: 'shield', NPCs: 'users-round', Locations: 'map-pin', Quests: 'flag', Sessions: 'calendar-days', Monsters: 'skull', Handouts: 'scroll-text', Assets: 'image', Maps: 'map' };
const IMAGE = /^(png|jpe?g|gif|webp|svg|bmp|avif)$/;
const fileIcon = (ext: string) => (IMAGE.test(ext) ? 'image' : ext === 'pdf' ? 'file-text' : /^(mp3|wav|ogg|m4a|flac|webm)$/.test(ext) ? 'music' : /^(mp4|mov|mkv|ogv)$/.test(ext) ? 'film' : ext === 'canvas' ? 'layout-dashboard' : 'file');
/** Our own drag data: the path of a row dragged inside the outline. */
const DRAG_TYPE = 'application/x-nimble-path';

const IN_CHAPTER: StarterKind[] = ['scene', 'map', 'note', 'npc', 'location', 'quest', 'monster', 'handout'];
const IN_FOLDER: StarterKind[] = ['note', 'npc', 'location', 'quest', 'session', 'map', 'monster', 'handout'];
/** In a campaign you play in: no monster stat blocks, but party members. */
const PLAYER_IN_CHAPTER: StarterKind[] = ['scene', 'note', 'npc', 'location', 'quest', 'map', 'handout'];
const PLAYER_IN_FOLDER: StarterKind[] = ['note', 'npc', 'location', 'quest', 'session', 'character', 'map', 'handout'];

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

const baseName = (path: string) => path.replace(/^.*\//, '').replace(/\.md$/i, '');

// ---------------------------------------------------------------------------
// Rows

/** Rows can be dragged onto a chapter or folder here, into a note (as a link), or onto the file explorer. */
function draggable(row: HTMLElement, plugin: EmberVaultPlugin, path: string): void {
	row.draggable = true;
	row.addEventListener('dragstart', (e) => {
		if (!e.dataTransfer) return;
		const f = plugin.app.vault.getAbstractFileByPath(path);
		if (f instanceof TFile) startFileDrag(plugin.app, e, f);
		e.dataTransfer.setData(DRAG_TYPE, path);
		e.dataTransfer.effectAllowed = 'all';
		row.addClass('is-dragging');
	});
	row.addEventListener('dragend', () => {
		row.removeClass('is-dragging');
		activeDocument.querySelectorAll('.is-drop-target').forEach(el => el.removeClass('is-drop-target'));
	});
}

/** What's being dropped: a row from the outline, or files/folders from Obsidian's file explorer. */
function dropPaths(plugin: EmberVaultPlugin, e: DragEvent): string[] {
	const own = e.dataTransfer?.getData(DRAG_TYPE);
	if (own) return [own];
	const dragged = draggedPaths(plugin.app);
	if (dragged.length) return dragged;
	// Fallback: Obsidian puts an obsidian://open link in the text of a file drag.
	const text = e.dataTransfer?.getData('text/plain') ?? '';
	const m = text.match(/^obsidian:\/\/open\?.*?[?&]file=([^&\s]+)/);
	if (!m) return [];
	const link = decodeURIComponent(m[1]);
	const f = plugin.app.vault.getAbstractFileByPath(link) ?? plugin.app.metadataCache.getFirstLinkpathDest(link, '');
	return f ? [f.path] : [];
}

/** Let notes and files be dropped onto `el` to move them into `folder`. */
function dropTarget(el: HTMLElement, plugin: EmberVaultPlugin, folder: string): void {
	el.dataset.dropFolder = folder;
	const accepts = (e: DragEvent) => !!e.dataTransfer && (e.dataTransfer.types.includes(DRAG_TYPE) || draggedPaths(plugin.app).length > 0 || e.dataTransfer.types.includes('text/uri-list'));
	el.addEventListener('dragover', (e) => {
		if (!accepts(e)) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		activeDocument.querySelectorAll('.is-drop-target').forEach(x => { if (x !== el) x.removeClass('is-drop-target'); });
		el.addClass('is-drop-target');
	});
	el.addEventListener('dragleave', (e) => {
		if (!el.contains(e.relatedTarget as Node | null)) el.removeClass('is-drop-target');
	});
	el.addEventListener('drop', (e) => {
		el.removeClass('is-drop-target');
		const paths = dropPaths(plugin, e);
		if (!paths.length) return;
		e.preventDefault();
		e.stopPropagation();
		void plugin.campaigns.move(paths, folder);
	});
}

function noteRow(parent: HTMLElement, plugin: EmberVaultPlugin, c: Campaign, n: NoteRef, opts: OutlineOptions, sourcePath?: string): HTMLElement {
	const row = parent.createEl('a', { cls: `campaign-note kind-${n.kind}`, href: '#', attr: { 'data-path': n.path } });
	if (n.path === opts.current) row.addClass('is-current');
	// A finished quest is ticked off (or crossed out) and fades back.
	const quest = n.kind === 'quest' ? questState(n.status) : undefined;
	if (quest && quest !== 'open') row.addClass(`is-quest-${quest}`);
	const portrait = n.kind === 'npc' ? portraitOf(plugin.app, n.path) : null;
	if (portrait) renderAvatar(row, portrait, 'campaign-note-avatar');
	else setIcon(row.createSpan({ cls: 'campaign-note-icon' }), quest === 'done' ? 'circle-check' : quest === 'failed' ? 'circle-x' : KIND_ICON[n.kind]);
	const title = n.area && n.title.startsWith(n.area) ? n.title.slice(n.area.length).replace(/^[\s:.\-–—]+/, '') : n.title;
	if (n.area) row.createSpan({ cls: 'campaign-note-area', text: n.area });
	row.createSpan({ cls: 'campaign-note-title', text: title });
	row.addEventListener('click', (e) => {
		e.preventDefault();
		void plugin.app.workspace.openLinkText(n.path, sourcePath ?? '', e.metaKey || e.ctrlKey);
	});
	// Obsidian's page preview on hover (desktop), like any internal link.
	row.addEventListener('mouseover', (e) => {
		plugin.app.workspace.trigger('hover-link', { event: e, source: 'nimble-gm', hoverParent: parent, targetEl: row, linktext: n.path, sourcePath: sourcePath ?? '' });
	});
	draggable(row, plugin, n.path);
	onLongPress(row, (e) => itemMenu(plugin, c, n.path, e));
	return row;
}

/** An image, PDF or other file in a folder. Opens in Obsidian's own viewer. */
function fileRow(parent: HTMLElement, plugin: EmberVaultPlugin, c: Campaign, f: FileRef, opts: OutlineOptions): HTMLElement {
	const row = parent.createEl('a', { cls: 'campaign-note campaign-file', href: '#', attr: { 'data-path': f.path } });
	if (f.path === opts.current) row.addClass('is-current');
	setIcon(row.createSpan({ cls: 'campaign-note-icon' }), fileIcon(f.ext));
	row.createSpan({ cls: 'campaign-note-title', text: f.name });
	row.addEventListener('click', (e) => {
		e.preventDefault();
		void plugin.app.workspace.openLinkText(f.path, '', e.metaKey || e.ctrlKey);
	});
	if (IMAGE.test(f.ext)) {
		row.addEventListener('mouseover', (e) => {
			plugin.app.workspace.trigger('hover-link', { event: e, source: 'nimble-gm', hoverParent: parent, targetEl: row, linktext: f.path, sourcePath: '' });
		});
	}
	draggable(row, plugin, f.path);
	onLongPress(row, (e) => itemMenu(plugin, c, f.path, e));
	return row;
}

function group(parent: HTMLElement, key: string, opts: OutlineOptions, head: (h: HTMLElement) => void, body: (b: HTMLElement) => void): { g: HTMLElement; h: HTMLElement } {
	const g = parent.createDiv({ cls: 'campaign-group', attr: { 'data-folder': key } });
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
	return { g, h };
}

/**
 * The party as cards: a character note for each hero. In a campaign you play
 * in, your hero comes first and larger, marked You; in one you run, every hero
 * shows their HP, and the encounter party is read from these sheets.
 */
export function renderRoster(el: HTMLElement, plugin: EmberVaultPlugin, c: Campaign): void {
	const gm = c.role !== 'player';
	const heroes = plugin.campaigns.characters(c);
	const roster = el.createDiv({ cls: `campaign-roster${gm ? ' is-gm' : ''}` });
	const head = roster.createDiv({ cls: 'campaign-heading campaign-roster-head' });
	head.createSpan({ text: 'Party' });
	iconBtn(head, 'user-plus', gm ? 'Add a hero' : 'Add a party member', () => promptCharacter(plugin, c, false));
	// Heroes entered by hand (before heroes had sheets) that no sheet has replaced yet: shown after the
	// sheets, with a button to make sheets for them. They count in encounters meanwhile (mergeParty).
	const stored = gm ? (plugin.settings.activeCampaign === c.folder ? plugin.settings.party : (plugin.settings.campaigns?.[c.folder]?.party ?? [])) : [];
	const left = handEnteredLeft(stored, heroes.map(h => h.name));
	if ((heroes.length || left.length) && plugin.campaigns.sameGame(c).length) {
		iconBtn(head, 'copy', 'Copy the party to another campaign', () => sendHeroes(plugin, c, heroes.map(h => h.path), left, false));
	}
	if (!heroes.length && !left.length) {
		const add = roster.createEl('button', { cls: 'campaign-party campaign-roster-empty' });
		setIcon(add.createSpan({ cls: 'campaign-party-icon' }), gm ? 'user-plus' : 'shield');
		add.createSpan({ text: gm ? 'Add a hero' : 'Add your character' });
		add.addEventListener('click', () => promptCharacter(plugin, c, !gm));
		if (gm) roster.createDiv({ cls: 'campaign-roster-note', text: `Encounters are rated for ${c.heroes ?? plugin.settings.defaultPartySize ?? 4} level ${c.level ?? 1} heroes until then.` });
		return;
	}
	const list = roster.createDiv({ cls: 'campaign-roster-list' });
	for (const h of heroes) {
		// The same menu as the hero's row in the outline, plus what only a hero has.
		heroCard(list, plugin, { ...h, showHp: h.mine || gm }, (e) => itemMenu(plugin, c, h.path, e, (m) => {
			if (!h.mine && !gm) m.addItem(i => i.setTitle('This is my character').setIcon('shield').setSection('action').onClick(() => void plugin.campaigns.setMine(c, h.path)));
		}));
	}
	for (const h of left) heroCard(list, plugin, { name: h.name, className: h.className, level: h.level, hpMax: h.maxHp });
	if (left.length) {
		const make = roster.createEl('button', { cls: 'campaign-party campaign-roster-empty' });
		setIcon(make.createSpan({ cls: 'campaign-party-icon' }), 'scroll-text');
		make.createSpan({ text: `Make character sheets for ${left.length === 1 ? (heroes.length ? left[0].name : 'this hero') : `these ${left.length}`}` });
		make.addEventListener('click', () => void sheetsForParty(plugin, c, left));
	}
}

/**
 * One hero's card in the Party section, the same for campaigns you run and
 * ones you play in: portrait, name (with You for yours), "Ancestry Class
 * level — player", and an HP bar. With a note behind it, it opens the sheet
 * (a menu on right-click or long-press, and it drags into notes); without one
 * (a party entered by hand), it's just the card.
 */
function heroCard(list: HTMLElement, plugin: EmberVaultPlugin, h: Partial<CharacterInfo> & { name: string; showHp?: boolean }, menu?: (e: MouseEvent | PointerEvent) => void): HTMLElement {
	const path = h.path;
	const card: HTMLElement = path
		? list.createEl('a', { cls: `campaign-hero${h.mine ? ' is-mine' : ''}`, href: '#', attr: { 'data-path': path } })
		: list.createDiv({ cls: 'campaign-hero is-plain' });
	const portrait = path ? portraitOf(plugin.app, path) : null;
	if (portrait) renderAvatar(card, portrait, 'campaign-hero-avatar');
	else setIcon(card.createSpan({ cls: 'campaign-hero-avatar is-empty' }), h.mine ? 'shield' : 'user-round');
	const text = card.createDiv({ cls: 'campaign-hero-text' });
	const name = text.createDiv({ cls: 'campaign-hero-name' });
	name.createSpan({ text: h.name });
	if (h.mine) name.createSpan({ cls: 'campaign-hero-you', text: 'You' });
	const kind = [h.ancestry, h.className].filter(Boolean).join(' ');
	const what = [kind, h.level !== undefined ? (kind ? `${h.level}` : `Level ${h.level}`) : ''].filter(Boolean).join(' · ');
	const sub = [what, !h.mine && h.player ? h.player : '', !path && h.hpMax ? `${h.hpMax} HP` : ''].filter(Boolean).join(' — ');
	if (sub) text.createDiv({ cls: 'campaign-hero-sub', text: sub });
	if (h.showHp && h.hpMax) {
		// A sheet with no `hp` yet is at full HP, as the sheet itself shows it.
		const hp = h.hp ?? h.hpMax;
		const bar = text.createDiv({ cls: 'campaign-hero-hp', attr: { 'aria-label': `${hp} of ${h.hpMax} HP` } });
		const pct = Math.max(0, Math.min(100, Math.round((hp / h.hpMax) * 100)));
		bar.createDiv({ cls: `campaign-hero-hp-fill${pct <= 25 ? ' is-low' : ''}` }).setCssProps({ '--hp-pct': `${pct}%` });
		bar.createSpan({ cls: 'campaign-hero-hp-text', text: `${hp}/${h.hpMax}` });
	}
	if (path) {
		card.addEventListener('click', (e) => { e.preventDefault(); void plugin.campaigns.open(path, e.metaKey || e.ctrlKey); });
		// Right-click and long-press both (onLongPress handles the mouse's contextmenu too: one menu, not two).
		if (menu) onLongPress(card, menu);
		draggable(card, plugin, path);
	}
	return card;
}

/** Make a new hero (ancestry, class, stats, background) in the campaign's Party folder. Yours, or another party member. */
export function promptCharacter(plugin: EmberVaultPlugin, c: Campaign, mine: boolean, name = '', level = c.level): void {
	const folder = homeFolderFor(c, 'character', c.folder);
	const system = plugin.system(c.folder);
	if (!system.characters) { new Notice(`${system.name} campaigns don't have character sheets yet.`); return; }
	system.characters.promptNew(plugin, {
		folder, mine, name, level,
		onCreated: (f) => void (async () => {
			if (mine) await plugin.campaigns.setMine(c, f.path);
			await plugin.campaigns.open(f.path);
		})(),
	});
}

/** The party, as character sheets: the same section for campaigns you run and ones you play in. */
export function renderPartyLine(el: HTMLElement, plugin: EmberVaultPlugin, c: Campaign): void {
	renderRoster(el, plugin, c);
}

/** Pick another campaign of the same game, then copy or move heroes (sheets and heroes entered by hand) into it. */
function sendHeroes(plugin: EmberVaultPlugin, c: Campaign, sheets: string[], typed: PartyMember[], move: boolean): void {
	const n = sheets.length + typed.length;
	const what = n === 1 ? (sheets[0] ? baseName(sheets[0]) : typed[0].name) : `${n} heroes`;
	new CampaignPicker(plugin.app, plugin.campaigns.sameGame(c), (to) => void (async () => {
		const { sent, skipped } = await plugin.campaigns.sendHeroes(c, to, sheets, typed, move);
		const done = sent.length ? `${move ? 'Moved' : 'Copied'} ${sent.join(', ')} to ${to.name}.` : '';
		const left = skipped.length ? ` ${to.name} already has ${skipped.join(', ')}.` : '';
		new Notice((done + left).trim());
	})(), `${move ? 'Move' : 'Copy'} ${what} to which campaign?`).open();
}

/** A party entered by hand (name, class, level, HP): a character note for each, keeping their HP, Defense and Wounds. */
async function sheetsForParty(plugin: EmberVaultPlugin, c: Campaign, party: PartyMember[]): Promise<void> {
	const folder = homeFolderFor(c, 'character', c.folder);
	let made = 0;
	const failed: string[] = [];
	for (const h of party) {
		try {
			const characters = plugin.system(c.folder).characters;
			if (!characters) throw new Error('This game system has no character sheets');
			await characters.createFromPartyMember(plugin, h, folder);
			made++;
		} catch (e) {
			// One hero that can't be written doesn't stop the rest; they stay in the party until it's sorted.
			console.error(`Ember Vault: could not make a character sheet for ${h.name}`, e);
			failed.push(h.name);
		}
	}
	new Notice(`Made ${made} character sheet${made === 1 ? '' : 's'} in ${folder}.${failed.length ? ` Couldn't make ${failed.join(', ')}.` : ''}`);
}

export function renderOutline(el: HTMLElement, plugin: EmberVaultPlugin, c: Campaign, opts: OutlineOptions): void {
	const store = plugin.campaigns;

	if (!opts.inNote) {
		const last = store.lastScene(c);
		const first = c.chapters[0]?.scenes[0]?.path;
		const target = last ?? first;
		if (target) {
			// In the game's accent: the one thing to press when the players sit down.
			const go = el.createEl('button', { cls: 'campaign-continue mod-cta' });
			setIcon(go.createSpan({ cls: 'campaign-continue-icon' }), evIcon('play'));
			const name = target.replace(/^.*\//, '').replace(/\.md$/, '');
			go.createSpan({ cls: 'campaign-continue-label', text: last ? 'Continue' : 'Start' });
			go.createSpan({ cls: 'campaign-continue-name', text: name });
			go.addEventListener('click', () => void store.open(target));
		}
	}

	// Chapters
	const chHead = el.createDiv({ cls: 'campaign-heading campaign-heading-chapters' });
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

	renderOpenQuests(el, plugin, c, opts);

	// Everything else: always shown, so there's somewhere to add the first NPC or folder.
	const h = el.createDiv({ cls: 'campaign-heading campaign-heading-folders' });
	h.createSpan({ text: 'Campaign' });
	iconBtn(h, 'folder-plus', 'New folder', () => promptFolder(plugin, c, opts), 'campaign-new-folder');
	iconBtn(h, 'plus', 'New note or folder', (e) => newMenu(plugin, c, e, opts), 'campaign-new-menu');
	onLongPress(h, (e) => newMenu(plugin, c, e, opts));
	dropTarget(h, plugin, c.folder);
	const sections = orderedSections(c);
	if (!sections.length && !c.loose.length && !c.looseFiles.length) {
		const empty = el.createDiv({ cls: 'campaign-empty' });
		empty.setText('Folders for NPCs, locations, factions and the like show up here. ');
		const a = empty.createEl('a', { text: 'New folder', href: '#' });
		a.addEventListener('click', (e) => { e.preventDefault(); promptFolder(plugin, c, opts); });
	}
	if (c.loose.length || c.looseFiles.length) {
		const loose = el.createDiv({ cls: 'campaign-loose' });
		for (const n of c.loose) noteRow(loose, plugin, c, n, opts);
		for (const f of c.looseFiles) fileRow(loose, plugin, c, f, opts);
	}
	for (const s of sections) renderSection(el, plugin, c, s, opts);
}

/** Sessions first (newest at the top), then Quests, NPCs and Locations, then the rest, with file folders (Assets) last. */
function orderedSections(c: Campaign): Section[] {
	const rank = (s: Section) => ({ Sessions: 0, Quests: 1, NPCs: 2, Locations: 3, Party: 4 } as Record<string, number>)[s.name] ?? (isFileFolder(s) ? 6 : 5);
	return [...c.sections].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/**
 * The quests still to do, wherever they're kept, each with a status dot (filled: active; a ring: available
 * or waiting). One tap opens the quest. The Quests folder below keeps every quest, finished ones too.
 */
function renderOpenQuests(el: HTMLElement, plugin: EmberVaultPlugin, c: Campaign, opts: OutlineOptions): void {
	const open = questsIn(c).filter(n => questState(n.status) === 'open');
	if (!open.length) return;
	const h = el.createDiv({ cls: 'campaign-heading campaign-heading-quests' });
	h.createSpan({ text: 'Quests' });
	h.createSpan({ cls: 'campaign-heading-note', text: `${open.length} open` });
	const list = el.createDiv({ cls: 'campaign-quests' });
	for (const n of open) {
		const status = (n.status ?? '').trim().toLowerCase();
		const row = list.createEl('a', { cls: 'campaign-quest', href: '#', attr: { 'data-quest': n.path } });
		if (n.path === opts.current) row.addClass('is-current');
		row.createSpan({ cls: `campaign-quest-dot is-${status === 'active' ? 'active' : 'open'}`, attr: { 'aria-label': status ? status[0].toUpperCase() + status.slice(1) : 'Open' } });
		row.createSpan({ cls: 'campaign-quest-title', text: n.title });
		row.addEventListener('click', (e) => {
			e.preventDefault();
			void plugin.app.workspace.openLinkText(n.path, '', e.metaKey || e.ctrlKey);
		});
		row.addEventListener('mouseover', (e) => {
			plugin.app.workspace.trigger('hover-link', { event: e, source: 'nimble-gm', hoverParent: list, targetEl: row, linktext: n.path, sourcePath: '' });
		});
		onLongPress(row, (e) => itemMenu(plugin, c, n.path, e));
	}
}

function renderChapter(el: HTMLElement, plugin: EmberVaultPlugin, c: Campaign, ch: Chapter, opts: OutlineOptions): void {
	const { g, h } = group(el, ch.folder, opts, (h) => {
		h.addClass('campaign-chapter-head');
		if (ch.home.path === opts.current) h.addClass('is-current');
		const t = h.createDiv({ cls: 'campaign-chapter-title' });
		if (ch.label) t.createSpan({ cls: 'campaign-chapter-label', text: ch.label });
		const name = t.createEl('a', { cls: 'campaign-chapter-name', text: ch.name, href: '#' });
		name.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); void plugin.app.workspace.openLinkText(ch.home.path, '', e.metaKey || e.ctrlKey); });
		h.createSpan({ cls: 'campaign-count', text: String(ch.scenes.length) });
		for (const m of ch.maps) iconBtn(h, 'map', `Open ${m.title}`, () => void plugin.campaigns.open(m.path), 'campaign-map-btn');
		iconBtn(h, 'plus', `New in ${ch.name}`, () => promptNew(plugin, c, ch.folder, opts), 'campaign-add-scene');
	}, (b) => {
		b.addClass('campaign-scenes');
		// Maps get a row too (as well as their button above), so they can be renamed, moved and deleted like anything else.
		for (const m of ch.maps) noteRow(b, plugin, c, m, opts);
		for (const s of ch.scenes) noteRow(b, plugin, c, s, opts);
		for (const f of ch.files) fileRow(b, plugin, c, f, opts);
		if (!ch.scenes.length) {
			const add = b.createEl('a', { cls: 'campaign-add-inline', text: '+ First scene', href: '#' });
			add.addEventListener('click', (e) => { e.preventDefault(); promptNew(plugin, c, ch.folder, opts); });
		}
	});
	onLongPress(h, (e) => chapterMenu(plugin, c, ch, e, opts));
	dropTarget(g, plugin, ch.folder);
}

function renderSection(el: HTMLElement, plugin: EmberVaultPlugin, c: Campaign, s: Section, opts: OutlineOptions): void {
	const files = isFileFolder(s);
	const { g, h } = group(el, s.folder, opts, (h) => {
		setIcon(h.createSpan({ cls: 'campaign-section-icon' }), SECTION_ICON[s.name] ?? (files ? 'image' : 'folder'));
		h.createSpan({ cls: 'campaign-section-name', text: s.name });
		h.createSpan({ cls: 'campaign-count', text: String(s.notes.length + s.files.length) });
		if (files) iconBtn(h, 'plus', `Add files to ${s.name}`, () => addFiles(plugin, s.folder, opts), 'campaign-add-scene');
		else iconBtn(h, 'plus', `New in ${s.name}`, () => promptNew(plugin, c, s.folder, opts), 'campaign-add-scene');
	}, (b) => {
		// Newest session first; quests still to do above the finished ones.
		const notes = s.name === 'Sessions' ? [...s.notes].reverse() : questOrder(s.notes);
		for (const n of notes) noteRow(b, plugin, c, n, opts);
		for (const f of s.files) fileRow(b, plugin, c, f, opts);
		if (!s.notes.length && !s.files.length) {
			const empty = b.createDiv({ cls: 'campaign-empty' });
			empty.appendText('Nothing here yet. ');
			if (files) {
				const a = empty.createEl('a', { cls: 'campaign-add-inline', text: '+ Add files', href: '#' });
				a.addEventListener('click', (e) => { e.preventDefault(); addFiles(plugin, s.folder, opts); });
			} else {
				const label = STARTERS.find(x => x.kind === starterFor(s.name, false))?.label ?? 'Note';
				const a = empty.createEl('a', { cls: 'campaign-add-inline', text: `+ New ${label === 'NPC' ? label : label.toLowerCase()}`, href: '#' });
				a.addEventListener('click', (e) => { e.preventDefault(); promptNew(plugin, c, s.folder, opts); });
			}
		}
	});
	onLongPress(h, (e) => sectionMenu(plugin, c, s, e, opts));
	dropTarget(g, plugin, s.folder);
}

// ---------------------------------------------------------------------------
// Menus

function newMenu(plugin: EmberVaultPlugin, c: Campaign, e: MouseEvent | PointerEvent, opts?: OutlineOptions): void {
	const m = new Menu();
	m.addItem(i => i.setTitle('New session log').setIcon('calendar-days').onClick(() => promptSectionNote(plugin, c, 'session')));
	m.addItem(i => i.setTitle('New NPC').setIcon('user-round').onClick(() => promptSectionNote(plugin, c, 'npc')));
	m.addItem(i => i.setTitle('New location').setIcon('map-pin').onClick(() => promptSectionNote(plugin, c, 'location')));
	m.addItem(i => i.setTitle('New quest').setIcon('flag').onClick(() => promptSectionNote(plugin, c, 'quest')));
	if (c.role === 'player') m.addItem(i => i.setTitle('New party member').setIcon('user-plus').onClick(() => promptCharacter(plugin, c, false)));
	m.addItem(i => i.setTitle('New note…').setIcon('file-plus').onClick(() => promptNew(plugin, c, c.folder, opts)));
	m.addSeparator();
	m.addItem(i => i.setTitle('New chapter').setIcon('book-marked').onClick(() => promptChapter(plugin, c)));
	m.addItem(i => i.setTitle('New folder').setIcon('folder-plus').onClick(() => promptFolder(plugin, c, opts)));
	m.showAtMouseEvent(e);
}

/** Right-click or long-press on a note or file row (and a hero's card, which adds its own items with `extra`). */
function itemMenu(plugin: EmberVaultPlugin, c: Campaign, path: string, e: MouseEvent | PointerEvent, extra?: (m: Menu) => void): void {
	const f = plugin.app.vault.getAbstractFileByPath(path);
	if (!f) return;
	const m = new Menu();
	m.addItem(i => i.setTitle('Open in new tab').setIcon('file-plus').setSection('open').onClick(() => void plugin.campaigns.open(path, true)));
	// A sheet or card stands in for its note when it opens; this shows the note itself.
	if (f instanceof TFile && f.extension === 'md') m.addItem(i => i.setTitle('Open as Markdown').setIcon('file-code').setSection('open').onClick(() => void openAsMarkdown(plugin.app, path)));
	extra?.(m);
	// A hero (from the card or the Party folder) can join another campaign of the same game.
	if (plugin.campaigns.sameGame(c).length && plugin.campaigns.characters(c).some(h => h.path === path)) {
		m.addItem(i => i.setTitle('Copy to campaign…').setIcon('copy').setSection('action').onClick(() => sendHeroes(plugin, c, [path], [], false)));
		m.addItem(i => i.setTitle('Move to campaign…').setIcon('folder-input').setSection('action').onClick(() => sendHeroes(plugin, c, [path], [], true)));
	}
	m.addItem(i => i.setTitle('Move to chapter or folder…').setIcon('folder-input').setSection('action').onClick(() => promptMove(plugin, c, path)));
	m.addItem(i => i.setTitle('Rename…').setIcon('pencil').setSection('action').onClick(() => promptRename(plugin, path)));
	m.addItem(i => i.setTitle('Delete').setIcon('trash-2').setSection('danger').setWarning(true).onClick(() => void (async () => {
		if (await confirmAction(plugin.app, `Delete "${baseName(path)}"?`, TRASH_NOTE, 'Delete', true)) await plugin.campaigns.trash(path);
	})()));
	plugin.app.workspace.trigger('file-menu', m, f, 'nimble-campaign');
	m.showAtMouseEvent(e);
}

function sectionMenu(plugin: EmberVaultPlugin, c: Campaign, s: Section, e: MouseEvent | PointerEvent, opts: OutlineOptions): void {
	const folder = plugin.app.vault.getAbstractFileByPath(s.folder);
	const m = new Menu();
	m.addItem(i => i.setTitle('New note…').setIcon('file-plus').setSection('action-primary').onClick(() => promptNew(plugin, c, s.folder, opts)));
	m.addItem(i => i.setTitle('Add files…').setIcon('paperclip').setSection('action-primary').onClick(() => addFiles(plugin, s.folder, opts)));
	m.addItem(i => i.setTitle('Rename folder…').setIcon('pencil').setSection('action').onClick(() => promptRename(plugin, s.folder)));
	m.addItem(i => i.setTitle('Delete folder').setIcon('trash-2').setSection('danger').setWarning(true).onClick(() => void (async () => {
		const n = s.notes.length + s.files.length;
		const body = n ? `${n} item${n === 1 ? '' : 's'} inside go with it. ${TRASH_NOTE}` : TRASH_NOTE;
		if (await confirmAction(plugin.app, `Delete the ${s.name} folder?`, body, 'Delete', true)) await plugin.campaigns.trash(s.folder);
	})()));
	if (folder instanceof TFolder) plugin.app.workspace.trigger('file-menu', m, folder, 'nimble-campaign');
	m.showAtMouseEvent(e);
}

function chapterMenu(plugin: EmberVaultPlugin, c: Campaign, ch: Chapter, e: MouseEvent | PointerEvent, opts: OutlineOptions): void {
	const folder = plugin.app.vault.getAbstractFileByPath(ch.folder);
	const m = new Menu();
	m.addItem(i => i.setTitle('New scene or note…').setIcon('file-plus').setSection('action-primary').onClick(() => promptNew(plugin, c, ch.folder, opts)));
	m.addItem(i => i.setTitle('Open chapter note').setIcon('book-marked').setSection('action-primary').onClick(() => void plugin.campaigns.open(ch.home.path)));
	m.addItem(i => i.setTitle('Add files…').setIcon('paperclip').setSection('action-primary').onClick(() => addFiles(plugin, ch.folder, opts)));
	m.addItem(i => i.setTitle('Rename chapter…').setIcon('pencil').setSection('action').onClick(() => {
		new NamePrompt(plugin.app, 'Rename chapter', 'Chapter name', ch.folder.replace(/^.*\//, ''), 'Rename', (name) => void plugin.campaigns.renameChapter(ch, name)).open();
	}));
	m.addItem(i => i.setTitle('Delete chapter').setIcon('trash-2').setSection('danger').setWarning(true).onClick(() => void (async () => {
		const n = ch.scenes.length + ch.maps.length + ch.files.length;
		const body = `Its folder${n ? ` and the ${n} item${n === 1 ? '' : 's'} in it` : ''} go too. ${TRASH_NOTE}`;
		if (await confirmAction(plugin.app, `Delete the chapter "${ch.name}"?`, body, 'Delete', true)) await plugin.campaigns.trash(ch.folder);
	})()));
	if (folder instanceof TFolder) plugin.app.workspace.trigger('file-menu', m, folder, 'nimble-campaign');
	m.showAtMouseEvent(e);
}

const TRASH_NOTE = 'Deleted files follow your Obsidian setting under Files and links.';

// ---------------------------------------------------------------------------
// Prompts

async function openNew(plugin: EmberVaultPlugin, p: Promise<{ path: string }>): Promise<void> {
	try {
		const f = await p;
		await plugin.campaigns.open(f.path);
	} catch (err) {
		console.error('Ember Vault: could not create the note', err);
		new Notice(`Couldn't create that: ${err instanceof Error ? err.message : 'see the developer console'}`);
	}
}

/** Make sure a folder is open in the outline, so what was just added to it is visible. */
function expand(opts: OutlineOptions | undefined, folder: string): void {
	if (opts?.collapsed.delete(folder)) opts.onToggle?.();
}

function starterFor(folderName: string, isChapter: boolean): StarterKind {
	const k = defaultKindFor(folderName, isChapter);
	return STARTERS.some(s => s.kind === k) ? k as StarterKind : 'note';
}

/** The guided New note dialog for a chapter or folder (or the campaign folder itself). */
export function promptNew(plugin: EmberVaultPlugin, c: Campaign, folder: string, opts?: OutlineOptions): void {
	const ch = c.chapters.find(x => x.folder === folder);
	const name = folder === c.folder ? c.name : folder.replace(/^.*\//, '');
	const kind = starterFor(ch ? '' : name, !!ch);
	const images = [...c.sections.flatMap(s => s.files), ...c.chapters.flatMap(x => x.files), ...c.looseFiles].filter(f => IMAGE.test(f.ext));
	new NewNoteModal(plugin.app, {
		where: ch ? ch.name : name,
		kinds: c.role === 'player' ? (ch ? PLAYER_IN_CHAPTER : PLAYER_IN_FOLDER) : (ch ? IN_CHAPTER : IN_FOLDER),
		kind,
		images,
		suggest: (k) => (k === 'session' ? plugin.campaigns.nextSessionName(c) : ''),
		// From a chapter or the top of the campaign, NPCs, locations and the like are filed in their own folder.
		elsewhere: (k) => {
			const to = homeFolderFor(c, k, folder);
			return to === folder ? '' : to.replace(/^.*\//, '');
		},
		onSubmit: (k, n, extra) => {
			const to = homeFolderFor(c, k, folder);
			expand(opts, to);
			void openNew(plugin, plugin.campaigns.createStarter(to, k, n, extra));
		},
		onAddFiles: () => addFiles(plugin, folder, opts),
	}).open();
}

function addFiles(plugin: EmberVaultPlugin, folder: string, opts?: OutlineOptions): void {
	void pickFiles().then(files => {
		if (!files.length) return;
		expand(opts, folder);
		return plugin.campaigns.importFiles(folder, files);
	});
}

function promptFolder(plugin: EmberVaultPlugin, c: Campaign, opts?: OutlineOptions): void {
	new NamePrompt(plugin.app, 'New folder', 'Folder name, e.g. Factions', '', 'Create', (name) => void plugin.campaigns.createFolder(c.folder, name).then(path => expand(opts, path))).open();
}

function promptRename(plugin: EmberVaultPlugin, path: string): void {
	const f = plugin.app.vault.getAbstractFileByPath(path);
	if (!f) return;
	const current = f instanceof TFile && f.extension === 'md' ? f.basename : f.name;
	const what = f instanceof TFolder ? 'folder' : f instanceof TFile && f.extension === 'md' ? 'note' : 'file';
	new NamePrompt(plugin.app, `Rename ${what}`, 'New name', current, 'Rename', (name) => void plugin.campaigns.rename(path, name)).open();
}

/** Every chapter and folder of the campaign, except the one `path` is already in. */
export function moveTargets(c: Campaign, path: string): MoveTarget[] {
	const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
	const all: MoveTarget[] = [
		{ folder: c.folder, label: c.name, detail: 'Campaign folder (top level)' },
		...c.chapters.map(ch => ({ folder: ch.folder, label: ch.label ? `${ch.label} · ${ch.name}` : ch.name, detail: 'Chapter' })),
		...orderedSections(c).map(s => ({ folder: s.folder, label: s.name, detail: 'Folder' })),
	];
	return all.filter(t => t.folder !== parent && t.folder !== path && !t.folder.startsWith(path + '/'));
}

function promptMove(plugin: EmberVaultPlugin, c: Campaign, path: string): void {
	new MovePicker(plugin.app, moveTargets(c, path), (t) => void plugin.campaigns.move([path], t.folder)).open();
}

export function promptChapter(plugin: EmberVaultPlugin, c: Campaign): void {
	let label = '';
	new NamePrompt(plugin.app, 'New chapter', 'Chapter name, e.g. The Sunless Citadel', `Chapter ${c.chapters.length + 1}`, 'Create',
		(name) => void openNew(plugin, plugin.campaigns.createChapter(c, name, label || undefined)),
		(el) => {
			const l = el.createEl('input', { type: 'text', cls: 'nimble-name-input', attr: { placeholder: 'Short label (optional): Act 1, Prelude, Part 2…', 'aria-label': 'Chapter label' } });
			l.addEventListener('input', () => { label = l.value.trim(); });
		}).open();
}

export function promptScene(plugin: EmberVaultPlugin, ch: Chapter): void {
	const c = plugin.campaigns.of(ch.home.path);
	if (c) { promptNew(plugin, c, ch.folder); return; }
	new NamePrompt(plugin.app, `New scene in ${ch.name}`, 'Scene name, e.g. The Collapsed Bridge', '', 'Create',
		(name) => void openNew(plugin, plugin.campaigns.createScene(ch, name))).open();
}

/** New scene from a command: the chapter you're in, or ask which. */
export function newSceneAnywhere(plugin: EmberVaultPlugin): void {
	const f = plugin.app.workspace.getActiveFile();
	const here = f ? plugin.campaigns.chapterOf(f.path) : undefined;
	if (here) { promptScene(plugin, here); return; }
	const c = plugin.campaigns.active;
	if (!c) { plugin.newCampaign(); return; }
	if (c.chapters.length === 1) { promptScene(plugin, c.chapters[0]); return; }
	if (!c.chapters.length) { promptChapter(plugin, c); return; }
	new ChapterPicker(plugin.app, c.chapters, (ch) => promptScene(plugin, ch)).open();
}

export function promptSectionNote(plugin: EmberVaultPlugin, c: Campaign, kind: keyof typeof SECTION_FOR): void {
	const label = kind === 'npc' ? 'NPC' : kind;
	const initial = kind === 'session' ? plugin.campaigns.nextSessionName(c) : '';
	const placeholder = STARTERS.find(s => s.kind === kind)?.placeholder ?? 'Name';
	new NamePrompt(plugin.app, `New ${label}`, kind === 'session' ? 'Session name' : placeholder, initial, 'Create',
		(name) => void openNew(plugin, plugin.campaigns.createInSection(c, kind, name))).open();
}

/**
 * Campaign switcher menu. It doubles as the view switcher: campaigns you run
 * and campaigns you play in are listed apart, and picking one switches the
 * plugin to that side.
 */
export function campaignMenu(plugin: EmberVaultPlugin, e: MouseEvent | PointerEvent): void {
	const m = new Menu();
	const all = plugin.campaigns.campaigns;
	const groups: [string, Campaign[]][] = [['Running', all.filter(c => c.role === 'gm')], ['Playing', all.filter(c => c.role === 'player')]];
	const labelled = groups.every(([, list]) => list.length > 0);
	for (const [label, list] of groups) {
		if (!list.length) continue;
		if (labelled) m.addItem(i => i.setTitle(label).setIcon(label === 'Running' ? ROLE_INFO.gm.icon : ROLE_INFO.player.icon).setDisabled(true).setSection(label));
		for (const c of list) {
			m.addItem(i => i.setTitle(c.name).setSection(labelled ? label : 'campaigns')
				.setIcon(c.folder === plugin.settings.activeCampaign ? 'check' : ROLE_INFO[c.role].icon)
				.onClick(async () => { await plugin.campaigns.setActive(c.folder); }));
		}
	}
	const active = plugin.campaigns.active;
	if (active) {
		m.addItem(i => i.setTitle('Campaign settings…').setIcon('settings-2').setSection('manage').onClick(() => new CampaignSettingsModal(plugin, active).open()));
		const other = active.role === 'gm' ? 'player' : 'gm';
		m.addItem(i => i.setTitle(other === 'player' ? 'Switch to player view' : 'Switch to GM view').setIcon(ROLE_INFO[other].icon).setSection('manage')
			.onClick(() => void plugin.campaigns.setRole(active, other)));
	}
	m.addItem(i => i.setTitle('New campaign…').setIcon('plus').setSection('new').onClick(() => plugin.newCampaign()));
	m.showAtMouseEvent(e);
}
