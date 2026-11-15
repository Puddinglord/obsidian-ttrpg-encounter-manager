// Campaign structure, worked out from folders and a little frontmatter. Pure:
// it takes a flat list of notes and returns campaigns, so it's easy to test.
//
// The conventions are deliberately loose:
//   - A campaign is any folder holding a note with `nimble: campaign` (its home).
//   - A chapter is a folder inside it holding a note with `nimble: chapter`.
//     Every other note in that folder (at any depth) belongs to the chapter.
//   - Any other folder in the campaign (NPCs, Quests, Sessions, Locations…) is a section,
//     even an empty one. Sections list their notes and any other files (images,
//     PDFs) so an Assets folder shows what's in it.
//   - `order:` sorts notes; without it, names sort naturally (N2 before N10).
//   - `role: player` on the home note makes it a campaign you play in rather
//     than run; the plugin shows player tools for it (see prototypes/PLAYER-MODE.md).
// Nothing else is required. Drop a note into a chapter folder and it shows up.

export type NoteKind = 'campaign' | 'chapter' | 'scene' | 'map' | 'npc' | 'location' | 'quest' | 'session' | 'monster' | 'handout' | 'combat' | 'character' | 'creature' | 'note';

/** Which side of the screen you're on: running the game, or playing in it. */
export type CampaignRole = 'gm' | 'player';

export interface NoteInfo {
	path: string;
	/** Frontmatter, or {} when the note has none. */
	fm: Record<string, unknown>;
}

export interface NoteRef {
	path: string;
	title: string;
	kind: NoteKind;
	order?: number;
	/** Short tag shown before the title, e.g. an area key ("N4"). */
	area?: string;
	/** `status:` from the properties (a quest's active, completed, failed…). */
	status?: string;
}

export interface Chapter {
	folder: string;
	home: NoteRef;
	name: string;
	label?: string;
	order?: number;
	level?: number;
	scenes: NoteRef[];
	maps: NoteRef[];
	/** Images, PDFs and other files kept in the chapter's folder. */
	files: FileRef[];
}

/** A file in a section that isn't a note: an image, a PDF, a canvas… */
export interface FileRef {
	path: string;
	/** File name with its extension. */
	name: string;
	/** Lower-case extension without the dot. */
	ext: string;
}

export interface Section {
	folder: string;
	name: string;
	notes: NoteRef[];
	files: FileRef[];
}

export interface Campaign {
	folder: string;
	home: NoteRef;
	name: string;
	/** Running it (`gm`, the default) or playing in it (`player`), from `role:` on the home note. */
	role: CampaignRole;
	/** Starting hero level; used to rate encounters until the party is filled in. */
	level?: number;
	/** Number of heroes; same use as `level`. */
	heroes?: number;
	status?: string;
	system?: string;
	chapters: Chapter[];
	sections: Section[];
	/** Notes sitting directly in the campaign folder. */
	loose: NoteRef[];
	/** Files (images, PDFs…) sitting directly in the campaign folder. */
	looseFiles: FileRef[];
}

const KINDS: NoteKind[] = ['campaign', 'chapter', 'scene', 'map', 'npc', 'location', 'quest', 'session', 'monster', 'handout', 'combat', 'character', 'creature', 'note'];

const basename = (path: string) => path.replace(/^.*\//, '').replace(/\.md$/i, '');
export const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const num = (v: unknown): number | undefined => {
	const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
	return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);

/** String(v) for a frontmatter value (lists joined with commas); '' for missing values and objects. */
export function fmText(v: unknown): string {
	if (v === undefined || v === null) return '';
	if (Array.isArray(v)) return v.map(fmText).join(',');
	if (typeof v === 'string') return v;
	return typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint' ? String(v) : '';
}

/** `role:` on a campaign home note: player (also "players", "pc", "playing"), otherwise gm. */
export function campaignRole(fm: Record<string, unknown>): CampaignRole {
	const r = fmText(fm.role).toLowerCase().trim();
	return /^(players?|pc|playing|play)$/.test(r) ? 'player' : 'gm';
}

/** Campaign pages that are mostly read: they open in reading view (see reading-mode.ts). */
const READ_KINDS: NoteKind[] = ['campaign', 'chapter', 'scene', 'npc', 'location', 'quest', 'map', 'handout', 'monster', 'character', 'creature'];

/**
 * Should a campaign note open in reading view? Characters, chapters, scenes,
 * NPCs, places, quests, maps, handouts and stat blocks do (a quest's
 * objectives still tick off in reading view); session logs (written at
 * the table) and plain notes don't. A note without properties in a chapter
 * folder is one of its scenes.
 */
export function opensInReading(fm: Record<string, unknown>, inChapter: boolean): boolean {
	const kind = noteKind(fm);
	if (kind === 'note') return inChapter;
	return READ_KINDS.includes(kind);
}

/** A yes/no property: true, "true", "yes" or 1 (how people write `mine: true`). */
export function fmTrue(v: unknown): boolean {
	return v === true || v === 1 || (typeof v === 'string' && /^(true|yes|1)$/i.test(v.trim()));
}

export function noteKind(fm: Record<string, unknown>): NoteKind {
	const k = fmText(fm.nimble).toLowerCase().trim();
	return (KINDS as string[]).includes(k) ? k as NoteKind : 'note';
}

function ref(n: NoteInfo): NoteRef {
	return {
		path: n.path,
		title: str(n.fm.title) ?? basename(n.path),
		kind: noteKind(n.fm),
		order: num(n.fm.order),
		area: str(n.fm.area),
		status: str(n.fm.status),
	};
}

/**
 * Where a quest stands, from its `status:`. Anything that isn't finished
 * (active, available, on hold, or a status of your own) is `open`.
 */
export function questState(status: string | undefined): 'open' | 'done' | 'failed' {
	const s = (status ?? '').toLowerCase().trim();
	if (/^(completed?|done|finished|succeeded|success|resolved)$/.test(s)) return 'done';
	if (/^(failed|abandoned|lost|dropped|cancell?ed)$/.test(s)) return 'failed';
	return 'open';
}

/** Quests still to do first (in their usual order), then the finished ones. */
export function questOrder(notes: NoteRef[]): NoteRef[] {
	const closed = (n: NoteRef) => n.kind === 'quest' && questState(n.status) !== 'open';
	return [...notes.filter(n => !closed(n)), ...notes.filter(closed)];
}

/** Natural sort: `order` first (notes without one go last), then the title (N2 before N10). */
export function byOrder(a: { order?: number; title?: string; name?: string }, b: { order?: number; title?: string; name?: string }): number {
	const ao = a.order ?? Infinity;
	const bo = b.order ?? Infinity;
	if (ao !== bo) return ao < bo ? -1 : 1;
	return (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '', undefined, { numeric: true, sensitivity: 'base' });
}

const inside = (path: string, folder: string) => folder === '' || path.startsWith(folder + '/');
/** Dot-folders and dot-files (.obsidian, .trash…) are never part of a campaign. */
const hidden = (path: string) => path.split('/').some(p => p.startsWith('.'));
const isNote = (path: string) => /\.md$/i.test(path);

function fileRef(path: string): FileRef {
	const name = path.replace(/^.*\//, '');
	const dot = name.lastIndexOf('.');
	return { path, name, ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : '' };
}

/**
 * Work out every campaign in the vault.
 *
 * @param notes Every file in the vault. Notes (.md) carry their frontmatter;
 *   any other file (images, PDFs) is listed in the section it sits in.
 * @param folders Every folder in the vault, so empty folders still show up as
 *   sections (a new campaign's NPCs, Locations… start out empty).
 */
export function buildCampaigns(notes: NoteInfo[], folders: string[] = []): Campaign[] {
	const visible = notes.filter(n => !hidden(n.path));
	const md = visible.filter(n => isNote(n.path));
	const others = visible.filter(n => !isNote(n.path));
	const homes = md.filter(n => noteKind(n.fm) === 'campaign');
	const campaignFolders = homes.map(h => parentOf(h.path));
	const campaigns: Campaign[] = [];

	for (const home of homes) {
		const folder = parentOf(home.path);
		// Notes that belong to a deeper campaign (one nested inside this folder) aren't ours.
		const nested = campaignFolders.filter(f => f !== folder && inside(f, folder) && f.length > folder.length);
		const ours = (p: string) => inside(p, folder) && !nested.some(f => p === f || inside(p, f));
		// Saved fights (nimble: combat) are reached from their encounter, not listed as scenes.
		const mine = md.filter(n => n !== home && ours(n.path) && noteKind(n.fm) !== 'combat');
		const rel = (p: string) => (folder ? p.slice(folder.length + 1) : p);

		const byName = (a: FileRef, b: FileRef) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

		// Chapters first. A chapter is the folder its `nimble: chapter` note sits in,
		// at any depth (Campaign/Act 1, or Campaign/Chapters/Act 1), and everything
		// under that folder is the chapter's. A chapter note loose in the campaign
		// folder itself doesn't make the whole campaign a chapter.
		const homesByFolder = new Map<string, NoteInfo[]>();
		for (const n of mine) {
			if (noteKind(n.fm) !== 'chapter') continue;
			const f = parentOf(n.path);
			if (f === folder) continue;
			homesByFolder.set(f, [...(homesByFolder.get(f) ?? []), n]);
		}
		// A chapter folder inside another chapter's folder stays part of the outer one.
		const chapterFolders = [...homesByFolder.keys()].filter(f => ![...homesByFolder.keys()].some(o => o !== f && inside(f, o)));
		const chapterFor = (p: string) => chapterFolders.find(f => inside(p, f));

		const chapters: Chapter[] = [];
		for (const sub of chapterFolders) {
			// Two chapter notes in one folder: the first in order is its home, the other is listed with the scenes.
			const chHome = [...(homesByFolder.get(sub) ?? [])].sort((a, b) => byOrder(ref(a), ref(b)))[0];
			const rest = mine.filter(n => n !== chHome && inside(n.path, sub)).map(ref);
			chapters.push({
				folder: sub,
				home: ref(chHome),
				name: str(chHome.fm.title) ?? basename(chHome.path),
				label: str(chHome.fm.label),
				order: num(chHome.fm.order),
				level: num(chHome.fm.level),
				scenes: rest.filter(r => r.kind !== 'map').sort(byOrder),
				maps: rest.filter(r => r.kind === 'map').sort(byOrder),
				files: others.filter(f => ours(f.path) && inside(f.path, sub)).map(f => fileRef(f.path)).sort(byName),
			});
		}

		// Everything else is grouped by the first folder under the campaign.
		const groups = new Map<string, NoteInfo[]>();
		const files = new Map<string, FileRef[]>();
		const loose: NoteRef[] = [];
		const looseFiles: FileRef[] = [];
		for (const n of mine) {
			if (chapterFor(n.path)) continue;
			const parts = rel(n.path).split('/');
			if (parts.length === 1) { loose.push(ref(n)); continue; }
			const g = groups.get(parts[0]) ?? [];
			g.push(n);
			groups.set(parts[0], g);
		}
		for (const f of others) {
			if (!ours(f.path) || chapterFor(f.path)) continue;
			const parts = rel(f.path).split('/');
			if (parts.length === 1) { looseFiles.push(fileRef(f.path)); continue; }
			const g = files.get(parts[0]) ?? [];
			g.push(fileRef(f.path));
			files.set(parts[0], g);
		}
		// Every folder directly under the campaign, including empty ones. A folder
		// holding nothing but saved fights stays out, like the fights themselves,
		// and so does one that only holds chapters (Campaign/Chapters/Act 1).
		const names = new Set<string>([...groups.keys(), ...files.keys()]);
		const fights = new Set(md.filter(n => ours(n.path) && noteKind(n.fm) === 'combat').map(n => rel(n.path).split('/')[0]));
		const chapterParents = new Set(chapterFolders.map(f => rel(f).split('/')[0]));
		for (const f of folders) {
			if (hidden(f) || f === folder || !ours(f)) continue;
			const name = rel(f).split('/')[0];
			if (!names.has(name) && (fights.has(name) || chapterParents.has(name))) continue;
			names.add(name);
		}

		const sections: Section[] = [];
		for (const name of names) {
			const sub = folder ? `${folder}/${name}` : name;
			if (chapterFolders.includes(sub)) continue;
			sections.push({ folder: sub, name, notes: (groups.get(name) ?? []).map(ref).sort(byOrder), files: (files.get(name) ?? []).sort(byName) });
		}
		chapters.sort((a, b) => byOrder({ order: a.order, title: a.name }, { order: b.order, title: b.name }));
		sections.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

		campaigns.push({
			folder,
			home: ref(home),
			name: str(home.fm.title) ?? basename(home.path),
			role: campaignRole(home.fm),
			level: num(home.fm.level),
			heroes: num(home.fm.heroes),
			status: str(home.fm.status),
			system: str(home.fm.system),
			chapters,
			sections,
			loose: loose.sort(byOrder),
			looseFiles: looseFiles.sort(byName),
		});
	}
	return campaigns.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** The campaign a note belongs to: the deepest campaign folder containing it. */
export function campaignOf(campaigns: Campaign[], path: string): Campaign | undefined {
	let best: Campaign | undefined;
	for (const c of campaigns) {
		if ((path === c.home.path || inside(path, c.folder)) && (!best || c.folder.length > best.folder.length)) best = c;
	}
	return best;
}

export function chapterOf(campaign: Campaign, path: string): Chapter | undefined {
	return campaign.chapters.find(ch => ch.home.path === path || inside(path, ch.folder));
}

/** Scenes across the whole campaign, in play order (chapter by chapter). */
export function playOrder(campaign: Campaign): NoteRef[] {
	return campaign.chapters.flatMap(ch => ch.scenes.filter(isPlayable));
}

/** Is this something you play through (a scene, or a plain note in a chapter), as opposed to an NPC, handout or map kept there? */
export const isPlayable = (n: NoteRef) => n.kind === 'scene' || n.kind === 'note';

/**
 * The scene before or after `path`, crossing chapter boundaries. From a note
 * that isn't a scene, it goes by where the note sits: the campaign home leads
 * to the first scene; a chapter note (or a map, handout or NPC kept in a
 * chapter) leads on to that chapter's first scene, or back to the last scene
 * of the chapter before.
 */
export function adjacentScene(campaign: Campaign, path: string, step: 1 | -1): NoteRef | undefined {
	const list = playOrder(campaign);
	const i = list.findIndex(s => s.path === path);
	if (i >= 0) return list[i + step];
	if (path === campaign.home.path) return step === 1 ? list[0] : undefined;
	const ci = campaign.chapters.findIndex(c => c.home.path === path || inside(path, c.folder));
	if (ci < 0) return undefined;
	const scenes = (k: number) => campaign.chapters[k].scenes.filter(isPlayable);
	if (step === 1) {
		for (let k = ci; k < campaign.chapters.length; k++) if (scenes(k).length) return scenes(k)[0];
		return undefined;
	}
	for (let k = ci - 1; k >= 0; k--) if (scenes(k).length) return scenes(k)[scenes(k).length - 1];
	return undefined;
}

/** What a section's folder name suggests new notes in it should be. */
const FOLDER_KIND: Record<string, NoteKind> = {
	npc: 'npc', npcs: 'npc', characters: 'npc', people: 'npc',
	location: 'location', locations: 'location', places: 'location',
	quest: 'quest', quests: 'quest', 'quest log': 'quest', missions: 'quest', jobs: 'quest', bounties: 'quest',
	session: 'session', sessions: 'session', 'session logs': 'session',
	monster: 'monster', monsters: 'monster', bestiary: 'monster',
	handout: 'handout', handouts: 'handout',
	map: 'map', maps: 'map',
	party: 'character', pcs: 'character', heroes: 'character',
};

/** The starter a new note in this folder gets by default: scenes in chapters, NPCs in NPCs, plain notes elsewhere. */
export function defaultKindFor(folderName: string, isChapter = false): NoteKind {
	if (isChapter) return 'scene';
	return FOLDER_KIND[folderName.trim().toLowerCase()] ?? 'note';
}

/** The folder a kind of note gets when the campaign doesn't have one for it yet. */
const HOME_SECTION: Partial<Record<NoteKind, string>> = { npc: 'NPCs', location: 'Locations', quest: 'Quests', session: 'Sessions', monster: 'Monsters', handout: 'Handouts', character: 'Party' };

/**
 * Where a new note of `kind` goes when it's asked for in `from`.
 *
 * A chapter's notes are its scenes, and the top of the campaign is for loose
 * notes, so an NPC, location, quest, monster, handout or session log made from either
 * is filed in the campaign's folder for that kind instead (the one named for it,
 * or a renamed one such as "Characters"; made if it's missing). That way it's
 * listed with the rest and doesn't get lost among a chapter's scenes. A folder
 * of the GM's own (Factions…) keeps whatever is made in it.
 */
export function homeFolderFor(c: Campaign, kind: NoteKind, from: string): string {
	const inChapter = c.chapters.some(ch => ch.folder === from);
	if (from !== c.folder && !inChapter) return from;
	if (kind === 'map' && inChapter) return from; // a chapter keeps its own maps
	const fallback = HOME_SECTION[kind];
	if (!fallback && kind !== 'map') return from; // scenes and plain notes stay put
	const named = c.sections.filter(s => defaultKindFor(s.name) === kind);
	const existing = named.find(s => s.name === fallback) ?? named[0];
	if (existing) return existing.folder;
	return fallback ? joinPath(c.folder, fallback) : from;
}

/** Folders that hold files rather than notes; their + adds files from disk. */
export function isFileFolder(s: Pick<Section, 'name' | 'notes' | 'files'>): boolean {
	if (s.notes.length) return false;
	if (/^(assets?|attachments?|images?|files|media|art|audio|music|pdfs?)$/i.test(s.name.trim())) return true;
	return s.files.length > 0;
}

/** Path for `name` inside `folder`. */
export function joinPath(folder: string, name: string): string {
	return folder ? `${folder}/${name}` : name;
}

/** Can `path` (a file or folder) be moved into `target`? Not into itself, its own folder, or below itself. */
export function canMoveInto(path: string, target: string): boolean {
	if (!path || path === target) return false;
	if (parentOf(path) === target) return false; // already there
	return !target.startsWith(path + '/'); // a folder can't go inside itself
}

/** Next free `order` value in a list. */
export function nextOrder(items: { order?: number }[]): number {
	const orders = items.map(i => i.order).filter((n): n is number => typeof n === 'number');
	return orders.length ? Math.floor(Math.max(...orders)) + 1 : items.length + 1;
}

/** A file name that's safe on every platform Obsidian runs on. */
export function safeName(name: string): string {
	return name.replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || 'Untitled';
}
