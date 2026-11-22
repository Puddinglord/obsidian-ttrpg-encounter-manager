// What the cards at the top of quest, location and session notes show, read from what the notes
// already hold: their properties, and a few of their own sections (a quest's Objectives and The
// truth, a session's Recap, Loot and Next time). A section the card shows is the card's: the note's
// reading view leaves it out (core/campaign-cards.ts), so nothing shows twice. Pure: no Obsidian imports.

import { fmText } from './campaign-model';

/** A heading's section: its title, the lines it covers (heading included, end exclusive), and its body. */
export interface NoteSection {
	title: string;
	level: number;
	start: number;
	end: number;
	body: string[];
}

const FENCE = /^\s*(`{3,}|~{3,})/;

/** The note's `#` sections, skipping the frontmatter and anything inside code fences. */
export function noteSections(text: string): NoteSection[] {
	const lines = text.split('\n');
	let i = 0;
	if (lines[0]?.trim() === '---') {
		const close = lines.findIndex((l, n) => n > 0 && l.trim() === '---');
		if (close > 0) i = close + 1;
	}
	const heads: { title: string; level: number; line: number }[] = [];
	let fence: string | null = null;
	for (; i < lines.length; i++) {
		const f = FENCE.exec(lines[i]);
		if (f) {
			if (!fence) fence = f[1][0];
			else if (f[1][0] === fence) fence = null;
			continue;
		}
		if (fence) continue;
		const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]);
		if (h) heads.push({ title: h[2].trim(), level: h[1].length, line: i });
	}
	return heads.map((h, n) => {
		const next = heads.slice(n + 1).find(x => x.level <= h.level);
		const end = next ? next.line : lines.length;
		return { title: h.title, level: h.level, start: h.line, end, body: lines.slice(h.line + 1, end) };
	});
}

/** The first section whose title is one of `names` (ignoring case and trailing punctuation). */
export function findSection(sections: NoteSection[], names: string[]): NoteSection | undefined {
	const want = names.map(n => n.toLowerCase());
	return sections.find(s => want.includes(s.title.toLowerCase().replace(/[:.]+$/, '').trim()));
}

/** A line that's only the template's italic prompt ("*What happened, for next time.*"). */
const PROMPT = /^\s*[*_][^*_].*[*_]\s*$/;

/** A section's items: its list items (without the marker), or its paragraphs when it has no list. Empty ones and prompts are left out. */
export function sectionItems(s: NoteSection | undefined): string[] {
	if (!s) return [];
	const items: string[] = [];
	let para: string[] = [];
	const flush = () => { if (para.length) { items.push(para.join(' ')); para = []; } };
	let listed = false;
	for (const raw of s.body) {
		const line = raw.trimEnd();
		const li = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.*)$/.exec(line);
		if (li) { flush(); listed = true; if (li[1].trim()) items.push(li[1].trim()); continue; }
		if (!line.trim() || PROMPT.test(line) || /^\s*>/.test(line) || /^#{1,6}\s/.test(line)) { flush(); continue; }
		if (listed && /^\s{2,}\S/.test(raw) && items.length) { items[items.length - 1] += ` ${line.trim()}`; continue; }
		para.push(line.trim());
	}
	flush();
	return items;
}

export interface Objective {
	text: string;
	done: boolean;
	/** The line in the note, so ticking it in the card ticks it in the note. */
	line: number;
}

/** A section's tasks (`- [ ] …`, `- [x] …`), empty ones left out. */
export function sectionTasks(s: NoteSection | undefined): Objective[] {
	if (!s) return [];
	const out: Objective[] = [];
	s.body.forEach((raw, i) => {
		const m = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX/-])\]\s*(.*)$/.exec(raw);
		if (m && m[2].trim()) out.push({ text: m[2].trim(), done: m[1] !== ' ', line: s.start + 1 + i });
	});
	return out;
}

/** The note's text with the task on `line` ticked or not. Unchanged when that line isn't a task. */
export function setTask(text: string, line: number, done: boolean): string {
	const lines = text.split('\n');
	const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX/-])(\].*)$/.exec(lines[line] ?? '');
	if (!m) return text;
	lines[line] = `${m[1]}${done ? 'x' : ' '}${m[3]}`;
	return lines.join('\n');
}

/** A property as a list of strings: a YAML list, or one value (commas don't split, a name can hold one). */
export function fmList(v: unknown): string[] {
	if (Array.isArray(v)) return v.map(x => fmText(x).trim()).filter(Boolean);
	const s = fmText(v).trim();
	return s ? [s] : [];
}

// ---------------------------------------------------------------------------
// Quests

export type QuestStamp = 'active' | 'open' | 'done' | 'failed';

/** How a quest's `status:` is stamped: Active, an open one (Available, On hold…), Done or Failed. */
export function questStamp(status: string | undefined): { kind: QuestStamp; text: string } {
	const s = (status ?? '').trim();
	const low = s.toLowerCase();
	const word = s ? s[0].toUpperCase() + s.slice(1) : 'Open';
	if (/^(completed?|done|finished|succeeded|success|resolved)$/.test(low)) return { kind: 'done', text: word };
	if (/^(failed|abandoned|lost|dropped|cancell?ed)$/.test(low)) return { kind: 'failed', text: word };
	return { kind: low === 'active' ? 'active' : 'open', text: word };
}

/** "Main quest", "Side quest", or "Quest", from `type:`. */
export function questKind(type: unknown): string {
	const t = fmText(type).trim().toLowerCase();
	if (!t) return 'Quest';
	if (t === 'main' || t === 'side' || t === 'personal') return `${t[0].toUpperCase()}${t.slice(1)} quest`;
	return /quest$/.test(t) ? `${t[0].toUpperCase()}${t.slice(1)}` : `${t[0].toUpperCase()}${t.slice(1)} quest`;
}

export const OBJECTIVES = ['Objectives', 'Objective', 'Goals'];
export const TRUTH = ['The truth', 'Truth', 'Secret', 'Secrets'];

export interface QuestCardData {
	objectives: Objective[];
	/** The GM's secret: `secret:`, else the note's "The truth" section (its prompt left out). */
	secret: string;
	/** The sections the card shows (so the reading view leaves them out). */
	taken: [number, number][];
}

export function questCard(fm: Record<string, unknown>, text: string, player: boolean): QuestCardData {
	const sections = noteSections(text);
	const obj = findSection(sections, OBJECTIVES);
	const objectives = sectionTasks(obj);
	const taken: [number, number][] = [];
	if (obj && objectives.length) taken.push([obj.start, obj.end]);
	let secret = '';
	if (!player) {
		secret = fmText(fm.secret).trim();
		const truth = findSection(sections, TRUTH);
		const words = sectionItems(truth).join('\n\n');
		if (!secret && words) { secret = words; if (truth) taken.push([truth.start, truth.end]); }
	}
	return { objectives, secret, taken };
}

// ---------------------------------------------------------------------------
// Sessions

/**
 * A session's kicker and title, repeating nothing: "Session 7 - Through the Gate" is kicker "Session 7"
 * and title "Through the Gate"; a note called "Session 9" keeps its title and the kicker is just the date.
 */
export function sessionHead(title: string, date: string): { kicker: string; title: string } {
	const m = /^(session\s+\d+)\s*(?:[-–—:·]\s*(.+))?$/i.exec(title.trim());
	const when = sessionDate(date);
	if (m?.[2]) return { kicker: [cap(m[1]), when].filter(Boolean).join(' · '), title: m[2].trim() };
	return { kicker: when || 'Session', title };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11-12" → "12 November 2026"; anything else as written. */
export function sessionDate(v: unknown): string {
	const s = fmText(v).trim();
	const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s);
	if (!m) return s;
	return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

export type QuestMove = 'advanced' | 'new' | 'done' | 'failed';

/**
 * Which quests a session moved, from `quests:` ("[[The missing assayer]] advanced", "[[Krenn's whistle]]: failed").
 * A quest written without a word is Advanced.
 */
export function questMoves(v: unknown): { quest: string; move: QuestMove; word: string }[] {
	return fmList(v).map((raw) => {
		const m = /^(.*?)[\s:–—-]*\b(advanced|new|started|done|completed?|finished|failed|lost)\s*$/i.exec(raw);
		const quest = (m ? m[1] : raw).replace(/[\s:–—-]+$/, '').trim();
		const w = (m?.[2] ?? 'advanced').toLowerCase();
		const move: QuestMove = /^(new|started)$/.test(w) ? 'new' : /^(done|completed?|finished)$/.test(w) ? 'done' : /^(failed|lost)$/.test(w) ? 'failed' : 'advanced';
		return { quest, move, word: { advanced: 'Advanced', new: 'New', done: 'Done', failed: 'Failed' }[move] };
	}).filter(q => q.quest);
}

export const RECAP = ['Recap', 'What happened', 'Summary'];
export const LOOT = ['Loot', 'Treasure'];
export const NEXT = ['Next time', 'Next session', 'Next'];

export interface SessionCardData {
	recap: string[];
	loot: string[];
	next: string;
	taken: [number, number][];
}

/** What happened, the loot and what's next: the properties first (`loot:`, `next:`), else the note's own sections. */
export function sessionCard(fm: Record<string, unknown>, text: string): SessionCardData {
	const sections = noteSections(text);
	const taken: [number, number][] = [];
	const take = (names: string[]) => {
		const s = findSection(sections, names);
		const items = sectionItems(s);
		if (s && items.length) taken.push([s.start, s.end]);
		return items;
	};
	const recap = take(RECAP);
	const loot = fmList(fm.loot).length ? fmList(fm.loot) : take(LOOT);
	const next = fmText(fm.next).trim() || take(NEXT).join(' ');
	return { recap, loot, next, taken };
}

/** True when line `line` falls in one of the sections a card took. */
export function inTaken(taken: [number, number][], line: number): boolean {
	return taken.some(([a, b]) => line >= a && line < b);
}

/** A wiki link's target ("[[Gullhaven Chapel|the chapel]]" → "Gullhaven Chapel"), or the text itself. */
export function linkTarget(v: string): { target: string; shown: string; link: boolean } {
	const m = /^\s*\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]\s*$/.exec(v);
	if (m) return { target: m[1].trim(), shown: (m[2] ?? m[1]).trim(), link: true };
	return { target: v.trim(), shown: v.trim(), link: false };
}

/** The wiki links in some text, in order, once each. */
export function linksIn(text: string): string[] {
	const out: string[] = [];
	for (const m of text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g)) {
		const t = m[1].trim();
		if (t && !out.includes(t)) out.push(t);
	}
	return out;
}

export const LEADS = ['Leads to', 'Exits', 'Connections'];
