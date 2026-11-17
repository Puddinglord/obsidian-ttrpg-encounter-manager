// Stylised boxes for adventure notes: ```box read-aloud color=gold style=parchment
// The fence line holds the type and any overrides; the body is ordinary
// markdown. Pure (no Obsidian), so it's easy to test.

export type BoxStyle = 'card' | 'banner' | 'parchment' | 'letter' | 'stone' | 'minimal';
export type BoxFont = 'sans' | 'serif' | 'hand' | 'mono';

export interface BoxOptions {
	type: string;
	title?: string;
	icon?: string;
	color?: string;
	style?: BoxStyle;
	font?: BoxFont;
	bold?: boolean;
	italic?: boolean;
	/** Starts folded; click the title to open. */
	collapsed?: boolean;
}

export interface BoxPreset {
	label: string;
	title: string;
	icon: string;
	color: string;
	style?: BoxStyle;
	font?: BoxFont;
	italic?: boolean;
	/** What the slash command puts inside a new box. */
	body?: string;
	/** Slash aliases. */
	aliases?: string[];
	desc: string;
}

export const BOX_PRESETS: Record<string, BoxPreset> = {
	'read-aloud': { label: 'Read aloud', title: 'Read aloud', icon: 'book-open-text', color: 'violet', font: 'serif', aliases: ['read', 'readaloud', 'boxed'], desc: 'Boxed text to read or paraphrase' },
	look: { label: 'What\'s here', title: 'What\'s here', icon: 'eye', color: 'teal', aliases: ['here', 'room', 'describe'], desc: 'What the heroes can find or notice' },
	treasure: { label: 'Treasure', title: 'Treasure', icon: 'gem', color: 'gold', aliases: ['loot', 'reward'], desc: 'Loot, rewards and magic items' },
	trap: { label: 'Trap', title: 'Trap', icon: 'triangle-alert', color: 'red', aliases: ['hazard', 'danger'], desc: 'Trap or hazard with a save and damage',
		body: '**Trigger:** \n**Spot:** Perception DC 12\n**Effect:** DEX save DC 12, 2d6 damage on a failure.\n**Disarm:** Finesse DC 12' },
	secret: { label: 'GM secret', title: 'GM only', icon: 'eye-off', color: 'slate', aliases: ['gm', 'hidden'], desc: 'Something only the GM knows' },
	clue: { label: 'Clue', title: 'Clue', icon: 'search', color: 'amber', aliases: ['hint', 'lead'], desc: 'A clue and where it points' },
	checks: { label: 'Checks', title: 'Checks', icon: 'dices', color: 'blue', aliases: ['check', 'skills', 'dc'], desc: 'Skill checks with DCs and results',
		body: '| Check | DC | Result |\n| --- | --- | --- |\n| Perception | 12 | |' },
	exits: { label: 'Exits', title: 'Exits', icon: 'door-open', color: 'gray', aliases: ['exit', 'paths'], desc: 'Where the heroes can go next' },
	npc: { label: 'NPC', title: 'NPC', icon: 'user-round', color: 'green', aliases: ['character'], desc: 'An NPC card',
		body: '**Look:** \n**Wants:** \n**Voice:** \n**Secret:** ' },
	handout: { label: 'Handout', title: 'Handout', icon: 'scroll-text', color: 'sepia', style: 'parchment', font: 'serif', aliases: ['letter', 'note-in-world'], desc: 'A letter, sign or note the players see' },
	lore: { label: 'Lore', title: 'Lore', icon: 'library', color: 'indigo', aliases: ['history'], desc: 'History and background' },
	rumor: { label: 'Rumor', title: 'Rumors', icon: 'messages-square', color: 'pink', aliases: ['rumour', 'gossip'], desc: 'Rumors the heroes might hear' },
	quest: { label: 'Quest', title: 'Quest', icon: 'flag', color: 'orange', aliases: ['hook', 'objective'], desc: 'A hook or objective' },
	note: { label: 'Note', title: 'Note', icon: 'sticky-note', color: 'gray', aliases: ['box', 'aside'], desc: 'A plain styled box' },
};

export const BOX_COLORS: Record<string, string> = {
	violet: '#8b5cf6', indigo: '#6366f1', blue: '#3b82f6', teal: '#14b8a6', green: '#22a35a', gold: '#c9a227',
	amber: '#e0a030', orange: '#e07a35', red: '#e05d5d', pink: '#d0408a', sepia: '#a0764a', slate: '#64748b', gray: '#8a8a8a',
};

export const BOX_STYLES: { id: BoxStyle; label: string }[] = [
	{ id: 'card', label: 'Card' }, { id: 'banner', label: 'Banner' }, { id: 'parchment', label: 'Old note' },
	{ id: 'letter', label: 'Letter' }, { id: 'stone', label: 'Stone' }, { id: 'minimal', label: 'Minimal' },
];

export const BOX_FONTS: { id: BoxFont; label: string }[] = [
	{ id: 'sans', label: 'Sans' }, { id: 'serif', label: 'Serif' }, { id: 'hand', label: 'Hand' }, { id: 'mono', label: 'Mono' },
];

/** A curated icon library (Lucide names, all bundled with Obsidian). */
export const BOX_ICONS: { group: string; icons: string[] }[] = [
	{ group: 'Narration', icons: ['book-open-text', 'book-open', 'scroll-text', 'scroll', 'feather', 'quote', 'message-circle', 'messages-square', 'mic', 'megaphone', 'volume-2', 'ear'] },
	{ group: 'Senses', icons: ['eye', 'eye-off', 'search', 'scan-eye', 'glasses', 'telescope', 'lightbulb', 'sparkles', 'wind', 'droplets', 'flame', 'snowflake'] },
	{ group: 'Places', icons: ['door-open', 'door-closed', 'castle', 'landmark', 'tent', 'mountain', 'trees', 'map', 'map-pin', 'compass', 'signpost', 'footprints'] },
	{ group: 'Danger', icons: ['triangle-alert', 'skull', 'swords', 'sword', 'shield', 'shield-alert', 'bomb', 'zap', 'biohazard', 'ghost', 'bug', 'axe'] },
	{ group: 'Loot', icons: ['gem', 'coins', 'crown', 'key-round', 'lock', 'package', 'gift', 'trophy', 'wand-sparkles', 'flask-conical', 'hand-coins', 'shirt'] },
	{ group: 'People', icons: ['user-round', 'users-round', 'baby', 'drama', 'hand-heart', 'heart', 'brain', 'handshake', 'crown', 'hat-glasses', 'person-standing', 'smile'] },
	{ group: 'Rules', icons: ['dices', 'dice-5', 'list-checks', 'scale', 'hourglass', 'timer', 'calendar-days', 'flag', 'target', 'info', 'circle-help', 'sticky-note'] },
	{ group: 'Mystic', icons: ['moon', 'sun', 'star', 'orbit', 'atom', 'flower-2', 'leaf', 'bird', 'cat', 'fish', 'paw-print', 'library'] },
];

/** Split a fence info string into words, keeping "quoted values" together. */
function tokens(s: string): string[] {
	const out: string[] = [];
	const re = /(\w[\w-]*)=("([^"]*)"|'([^']*)'|\S+)|"([^"]*)"|(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(s))) {
		if (m[1]) out.push(`${m[1]}=${m[3] ?? m[4] ?? m[2]}`);
		else out.push(m[5] ?? m[6]);
	}
	return out;
}

/** The type of a box, accepting aliases ("read" → "read-aloud"). */
export function boxType(word: string): string | undefined {
	const w = word.toLowerCase();
	if (BOX_PRESETS[w]) return w;
	return Object.keys(BOX_PRESETS).find(k => BOX_PRESETS[k].aliases?.includes(w));
}

/** Parse "```box read-aloud color=gold italic" (the fence and "box" are optional). */
export function parseBoxFence(line: string): BoxOptions {
	const info = line.replace(/^\s*(`{3,}|~{3,})\s*/, '').replace(/^box\b\s*/i, '');
	const opts: BoxOptions = { type: 'note' };
	let typed = false;
	for (const t of tokens(info)) {
		const eq = t.indexOf('=');
		if (eq > 0) {
			const k = t.slice(0, eq).toLowerCase();
			const v = t.slice(eq + 1).trim();
			if (k === 'title') opts.title = v;
			else if (k === 'icon') opts.icon = v;
			else if (k === 'color' || k === 'colour') opts.color = v;
			else if (k === 'style' && BOX_STYLES.some(s => s.id === v)) opts.style = v as BoxStyle;
			else if (k === 'font' && BOX_FONTS.some(f => f.id === v)) opts.font = v as BoxFont;
			else if (k === 'type') { opts.type = boxType(v) ?? v; typed = true; }
			continue;
		}
		const w = t.toLowerCase();
		if (w === 'bold') opts.bold = true;
		else if (w === 'italic') opts.italic = true;
		else if (w === 'collapsed' || w === 'folded') opts.collapsed = true;
		else if (!typed) { opts.type = boxType(w) ?? w; typed = true; }
	}
	return opts;
}

const quote = (v: string) => (/[\s"=]/.test(v) ? `"${v.replace(/"/g, '\'')}"` : v);

/** The fence line for a box, writing only what differs from its preset. */
export function boxFence(o: BoxOptions, fence = '```'): string {
	const p = BOX_PRESETS[o.type];
	const parts = [`${fence}box`, o.type];
	if (o.title !== undefined && o.title !== (p?.title ?? '')) parts.push(`title=${quote(o.title)}`);
	if (o.icon && o.icon !== p?.icon) parts.push(`icon=${o.icon}`);
	if (o.color && o.color !== p?.color) parts.push(`color=${o.color}`);
	if (o.style && o.style !== (p?.style ?? 'card')) parts.push(`style=${o.style}`);
	if (o.font && o.font !== (p?.font ?? 'sans')) parts.push(`font=${o.font}`);
	if (o.bold) parts.push('bold');
	if (o.italic && !p?.italic) parts.push('italic');
	if (o.collapsed) parts.push('collapsed');
	return parts.join(' ');
}

/** Options with the preset filled in: what actually gets drawn. */
export function resolveBox(o: BoxOptions): Required<Omit<BoxOptions, 'collapsed' | 'bold' | 'italic'>> & { bold: boolean; italic: boolean; collapsed: boolean } {
	const p = BOX_PRESETS[o.type] ?? BOX_PRESETS.note;
	return {
		type: o.type,
		title: o.title ?? (BOX_PRESETS[o.type] ? p.title : o.type.replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase())),
		icon: o.icon ?? p.icon,
		color: o.color ?? p.color,
		style: o.style ?? p.style ?? 'card',
		font: o.font ?? p.font ?? 'sans',
		bold: !!o.bold,
		italic: !!o.italic || !!p.italic,
		collapsed: !!o.collapsed,
	};
}

/** A named colour or a CSS hex. Anything else falls back to gray. */
export function boxColor(c: string): string {
	if (BOX_COLORS[c]) return BOX_COLORS[c];
	return /^#[0-9a-f]{3,8}$/i.test(c) ? c : BOX_COLORS.gray;
}

/** Text for a new box from a slash command. */
export function newBox(type: string): string {
	const p = BOX_PRESETS[type];
	return `\`\`\`box ${type}\n${p?.body ?? ''}\n\`\`\``;
}
