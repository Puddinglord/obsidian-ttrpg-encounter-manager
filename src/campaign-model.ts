// Campaign structure, worked out from folders and a little frontmatter. Pure:
// it takes a flat list of notes and returns campaigns, so it's easy to test.
//
// The conventions are deliberately loose:
//   - A campaign is any folder holding a note with `nimble: campaign` (its home).
//   - A chapter is a folder inside it holding a note with `nimble: chapter`.
//     Every other note in that folder (at any depth) belongs to the chapter.
//   - Any other folder in the campaign (NPCs, Sessions, Locations…) is a section.
//   - `order:` sorts notes; without it, names sort naturally (N2 before N10).
// Nothing else is required. Drop a note into a chapter folder and it shows up.

export type NoteKind = 'campaign' | 'chapter' | 'scene' | 'map' | 'npc' | 'location' | 'session' | 'monster' | 'handout' | 'combat' | 'note';

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
}

export interface Section {
	folder: string;
	name: string;
	notes: NoteRef[];
}

export interface Campaign {
	folder: string;
	home: NoteRef;
	name: string;
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
}

const KINDS: NoteKind[] = ['campaign', 'chapter', 'scene', 'map', 'npc', 'location', 'session', 'monster', 'handout', 'combat', 'note'];

const basename = (path: string) => path.replace(/^.*\//, '').replace(/\.md$/i, '');
const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
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
	};
}

/** Natural sort: `order` first (notes without one go last), then the title (N2 before N10). */
export function byOrder(a: { order?: number; title?: string; name?: string }, b: { order?: number; title?: string; name?: string }): number {
	const ao = a.order ?? Infinity;
	const bo = b.order ?? Infinity;
	if (ao !== bo) return ao < bo ? -1 : 1;
	return (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '', undefined, { numeric: true, sensitivity: 'base' });
}

const inside = (path: string, folder: string) => folder === '' || path.startsWith(folder + '/');

export function buildCampaigns(notes: NoteInfo[]): Campaign[] {
	const md = notes.filter(n => /\.md$/i.test(n.path));
	const homes = md.filter(n => noteKind(n.fm) === 'campaign');
	const folders = homes.map(h => parentOf(h.path));
	const campaigns: Campaign[] = [];

	for (const home of homes) {
		const folder = parentOf(home.path);
		// Notes that belong to a deeper campaign (one nested inside this folder) aren't ours.
		const nested = folders.filter(f => f !== folder && inside(f, folder) && f.length > folder.length);
		// Saved fights (nimble: combat) are reached from their encounter, not listed as scenes.
		const mine = md.filter(n => n !== home && inside(n.path, folder) && !nested.some(f => inside(n.path, f)) && noteKind(n.fm) !== 'combat');
		const rel = (p: string) => (folder ? p.slice(folder.length + 1) : p);

		// Group by the first folder under the campaign.
		const groups = new Map<string, NoteInfo[]>();
		const loose: NoteRef[] = [];
		for (const n of mine) {
			const parts = rel(n.path).split('/');
			if (parts.length === 1) { loose.push(ref(n)); continue; }
			const g = groups.get(parts[0]) ?? [];
			g.push(n);
			groups.set(parts[0], g);
		}

		const chapters: Chapter[] = [];
		const sections: Section[] = [];
		for (const [name, group] of groups) {
			const sub = folder ? `${folder}/${name}` : name;
			// The chapter's home: a `nimble: chapter` note, preferring one directly in the folder.
			const chapterHomes = group.filter(n => noteKind(n.fm) === 'chapter').sort((a, b) => a.path.split('/').length - b.path.split('/').length);
			const chHome = chapterHomes[0];
			if (chHome) {
				const rest = group.filter(n => n !== chHome).map(ref);
				chapters.push({
					folder: sub,
					home: ref(chHome),
					name: str(chHome.fm.title) ?? basename(chHome.path),
					label: str(chHome.fm.label),
					order: num(chHome.fm.order),
					level: num(chHome.fm.level),
					scenes: rest.filter(r => r.kind !== 'map').sort(byOrder),
					maps: rest.filter(r => r.kind === 'map').sort(byOrder),
				});
			} else {
				sections.push({ folder: sub, name, notes: group.map(ref).sort(byOrder) });
			}
		}
		chapters.sort((a, b) => byOrder({ order: a.order, title: a.name }, { order: b.order, title: b.name }));
		sections.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

		campaigns.push({
			folder,
			home: ref(home),
			name: str(home.fm.title) ?? basename(home.path),
			level: num(home.fm.level),
			heroes: num(home.fm.heroes),
			status: str(home.fm.status),
			system: str(home.fm.system),
			chapters,
			sections,
			loose: loose.sort(byOrder),
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
	return campaign.chapters.flatMap(ch => ch.scenes.filter(s => s.kind === 'scene' || s.kind === 'note'));
}

/** The scene before or after `path`, crossing chapter boundaries. */
export function adjacentScene(campaign: Campaign, path: string, step: 1 | -1): NoteRef | undefined {
	const list = playOrder(campaign);
	const i = list.findIndex(s => s.path === path);
	if (i < 0) {
		// From a chapter home, "next" is its first scene.
		const ch = campaign.chapters.find(c => c.home.path === path);
		return step === 1 && ch ? ch.scenes[0] : undefined;
	}
	return list[i + step];
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
