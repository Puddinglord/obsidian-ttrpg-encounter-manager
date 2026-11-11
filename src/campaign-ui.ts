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
import type NimbleStatblocksPlugin from '../main';
import { Campaign, Chapter, defaultKindFor, FileRef, homeFolderFor, isFileFolder, NoteKind, NoteRef, Section } from './campaign-model';
import { SECTION_FOR } from './campaigns';
import { ChapterPicker, MovePicker, MoveTarget, NamePrompt, NewNoteModal, pickFiles } from './campaign-modals';
import { STARTERS, StarterKind } from './campaign-templates';
import { draggedPaths, startFileDrag } from './internals';
import { confirmAction, onLongPress } from './touch';

export const KIND_ICON: Record<NoteKind, string> = {
	campaign: 'castle', chapter: 'book-marked', scene: 'clapperboard', map: 'map', npc: 'user-round', location: 'map-pin',
	session: 'calendar-days', monster: 'skull', handout: 'scroll-text', combat: 'swords', note: 'file-text',
};
const SECTION_ICON: Record<string, string> = { NPCs: 'users-round', Locations: 'map-pin', Sessions: 'calendar-days', Monsters: 'skull', Handouts: 'scroll-text', Assets: 'image', Maps: 'map' };
const IMAGE = /^(png|jpe?g|gif|webp|svg|bmp|avif)$/;
const fileIcon = (ext: string) => (IMAGE.test(ext) ? 'image' : ext === 'pdf' ? 'file-text' : /^(mp3|wav|ogg|m4a|flac|webm)$/.test(ext) ? 'music' : /^(mp4|mov|mkv|ogv)$/.test(ext) ? 'film' : ext === 'canvas' ? 'layout-dashboard' : 'file');
/** Our own drag data: the path of a row dragged inside the outline. */
const DRAG_TYPE = 'application/x-nimble-path';

const IN_CHAPTER: StarterKind[] = ['scene', 'map', 'note', 'npc', 'location', 'monster', 'handout'];
const IN_FOLDER: StarterKind[] = ['note', 'npc', 'location', 'session', 'map', 'monster', 'handout'];

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
function draggable(row: HTMLElement, plugin: NimbleStatblocksPlugin, path: string): void {
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
function dropPaths(plugin: NimbleStatblocksPlugin, e: DragEvent): string[] {
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
function dropTarget(el: HTMLElement, plugin: NimbleStatblocksPlugin, folder: string): void {
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

function noteRow(parent: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign, n: NoteRef, opts: OutlineOptions, sourcePath?: string): HTMLElement {
	const row = parent.createEl('a', { cls: `campaign-note kind-${n.kind}`, href: '#', attr: { 'data-path': n.path } });
	if (n.path === opts.current) row.addClass('is-current');
	const portrait = n.kind === 'npc' ? portraitOf(plugin.app, n.path) : null;
	if (portrait) renderAvatar(row, portrait, 'campaign-note-avatar');
	else setIcon(row.createSpan({ cls: 'campaign-note-icon' }), KIND_ICON[n.kind]);
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
function fileRow(parent: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign, f: FileRef, opts: OutlineOptions): HTMLElement {
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
	line.addEventListener('click', () => void (async () => {
		if (plugin.settings.activeCampaign !== c.folder) await plugin.campaigns.setActive(c.folder);
		plugin.openParty();
	})());
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

/** Sessions first (newest at the top), then NPCs and Locations, then the rest, with file folders (Assets) last. */
function orderedSections(c: Campaign): Section[] {
	const rank = (s: Section) => ({ Sessions: 0, NPCs: 1, Locations: 2 } as Record<string, number>)[s.name] ?? (isFileFolder(s) ? 4 : 3);
	return [...c.sections].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function renderChapter(el: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign, ch: Chapter, opts: OutlineOptions): void {
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

function renderSection(el: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign, s: Section, opts: OutlineOptions): void {
	const files = isFileFolder(s);
	const { g, h } = group(el, s.folder, opts, (h) => {
		setIcon(h.createSpan({ cls: 'campaign-section-icon' }), SECTION_ICON[s.name] ?? (files ? 'image' : 'folder'));
		h.createSpan({ cls: 'campaign-section-name', text: s.name });
		h.createSpan({ cls: 'campaign-count', text: String(s.notes.length + s.files.length) });
		if (files) iconBtn(h, 'plus', `Add files to ${s.name}`, () => addFiles(plugin, s.folder, opts), 'campaign-add-scene');
		else iconBtn(h, 'plus', `New in ${s.name}`, () => promptNew(plugin, c, s.folder, opts), 'campaign-add-scene');
	}, (b) => {
		const notes = s.name === 'Sessions' ? [...s.notes].reverse() : s.notes;
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

function newMenu(plugin: NimbleStatblocksPlugin, c: Campaign, e: MouseEvent | PointerEvent, opts?: OutlineOptions): void {
	const m = new Menu();
	m.addItem(i => i.setTitle('New session log').setIcon('calendar-days').onClick(() => promptSectionNote(plugin, c, 'session')));
	m.addItem(i => i.setTitle('New NPC').setIcon('user-round').onClick(() => promptSectionNote(plugin, c, 'npc')));
	m.addItem(i => i.setTitle('New location').setIcon('map-pin').onClick(() => promptSectionNote(plugin, c, 'location')));
	m.addItem(i => i.setTitle('New note…').setIcon('file-plus').onClick(() => promptNew(plugin, c, c.folder, opts)));
	m.addSeparator();
	m.addItem(i => i.setTitle('New chapter').setIcon('book-marked').onClick(() => promptChapter(plugin, c)));
	m.addItem(i => i.setTitle('New folder').setIcon('folder-plus').onClick(() => promptFolder(plugin, c, opts)));
	m.showAtMouseEvent(e);
}

/** Right-click or long-press on a note or file row. */
function itemMenu(plugin: NimbleStatblocksPlugin, c: Campaign, path: string, e: MouseEvent | PointerEvent): void {
	const f = plugin.app.vault.getAbstractFileByPath(path);
	if (!f) return;
	const m = new Menu();
	m.addItem(i => i.setTitle('Open in new tab').setIcon('file-plus').setSection('open').onClick(() => void plugin.campaigns.open(path, true)));
	m.addItem(i => i.setTitle('Move to chapter or folder…').setIcon('folder-input').setSection('action').onClick(() => promptMove(plugin, c, path)));
	m.addItem(i => i.setTitle('Rename…').setIcon('pencil').setSection('action').onClick(() => promptRename(plugin, path)));
	m.addItem(i => i.setTitle('Delete').setIcon('trash-2').setSection('danger').setWarning(true).onClick(() => void (async () => {
		if (await confirmAction(plugin.app, `Delete "${baseName(path)}"?`, TRASH_NOTE, 'Delete', true)) await plugin.campaigns.trash(path);
	})()));
	plugin.app.workspace.trigger('file-menu', m, f, 'nimble-campaign');
	m.showAtMouseEvent(e);
}

function sectionMenu(plugin: NimbleStatblocksPlugin, c: Campaign, s: Section, e: MouseEvent | PointerEvent, opts: OutlineOptions): void {
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

function chapterMenu(plugin: NimbleStatblocksPlugin, c: Campaign, ch: Chapter, e: MouseEvent | PointerEvent, opts: OutlineOptions): void {
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

async function openNew(plugin: NimbleStatblocksPlugin, p: Promise<{ path: string }>): Promise<void> {
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
export function promptNew(plugin: NimbleStatblocksPlugin, c: Campaign, folder: string, opts?: OutlineOptions): void {
	const ch = c.chapters.find(x => x.folder === folder);
	const name = folder === c.folder ? c.name : folder.replace(/^.*\//, '');
	const kind = starterFor(ch ? '' : name, !!ch);
	const images = [...c.sections.flatMap(s => s.files), ...c.chapters.flatMap(x => x.files), ...c.looseFiles].filter(f => IMAGE.test(f.ext));
	new NewNoteModal(plugin.app, {
		where: ch ? ch.name : name,
		kinds: ch ? IN_CHAPTER : IN_FOLDER,
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

function addFiles(plugin: NimbleStatblocksPlugin, folder: string, opts?: OutlineOptions): void {
	void pickFiles().then(files => {
		if (!files.length) return;
		expand(opts, folder);
		return plugin.campaigns.importFiles(folder, files);
	});
}

function promptFolder(plugin: NimbleStatblocksPlugin, c: Campaign, opts?: OutlineOptions): void {
	new NamePrompt(plugin.app, 'New folder', 'Folder name, e.g. Factions', '', 'Create', (name) => void plugin.campaigns.createFolder(c.folder, name).then(path => expand(opts, path))).open();
}

function promptRename(plugin: NimbleStatblocksPlugin, path: string): void {
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

function promptMove(plugin: NimbleStatblocksPlugin, c: Campaign, path: string): void {
	new MovePicker(plugin.app, moveTargets(c, path), (t) => void plugin.campaigns.move([path], t.folder)).open();
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
	const c = plugin.campaigns.of(ch.home.path);
	if (c) { promptNew(plugin, c, ch.folder); return; }
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
	m.showAtMouseEvent(e);
}

