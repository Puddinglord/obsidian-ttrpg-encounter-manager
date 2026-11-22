// Links Obsidian doesn't update when a note is renamed, rewritten to the new name. Obsidian tracks
// [[links]] in a note's text and in properties whose whole value is one link. It doesn't look inside
// fenced code blocks, so the links in our own blocks (map pins, encounter blocks, boxes, NPC card
// rows) don't follow a rename, and neither do property values that hold a link among other words
// (a session's `quests:` line "[[The Missing Lantern]] advanced"). This finds those links and
// rewrites the ones the caller says meant a renamed note. Everything else in the text, Obsidian's
// own links included, is left byte for byte. Pure: no Obsidian imports (core/link-follow.ts wires it).

export interface RewriteOptions {
	/** Is this fence language one of ours ("nimble-map", "box")? Links inside other code blocks are left alone. */
	fence: (lang: string) => boolean;
	/**
	 * A link's path as written ("Lower Gate", "Locations/Lower Gate", "gate.png"): the path to write
	 * instead when it meant a renamed note, or undefined to leave it.
	 */
	target: (linkpath: string) => string | undefined;
}

/** "Locations/Lower Gate.md" → "Lower Gate". */
export function linkBasename(path: string): string {
	return path.replace(/^.*\//, '').replace(/\.md$/i, '');
}

/**
 * Does a link's path, as written, name the note at `path`? Whole names only: "Lower Gate",
 * "Locations/Lower Gate" and "Lower Gate.md" name "Campaigns/X/Locations/Lower Gate.md";
 * "Gate" and "r Gate" don't. Case doesn't matter, as in Obsidian.
 */
export function linkNames(linkpath: string, path: string): boolean {
	const lp = linkpath.trim().replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
	if (!lp) return false;
	const p = path.toLowerCase();
	return [p, p.replace(/\.md$/, '')].some(c => c === lp || c.endsWith(`/${lp}`));
}

/** One [[link]]'s inside rewritten, or null when it stays. `unquote`/`quote` read and write it inside a YAML scalar. */
function rewriteInner(inner: string, o: RewriteOptions, unquote: (s: string) => string, quote: (s: string) => string): string | null {
	// The shown text starts at the first "|" ("\|" inside a table).
	const bar = inner.search(/\\?\|/);
	const dest = bar < 0 ? inner : inner.slice(0, bar);
	const rest = bar < 0 ? '' : inner.slice(bar);
	const hash = dest.indexOf('#');
	const linkpath = hash < 0 ? dest : dest.slice(0, hash);
	const sub = hash < 0 ? '' : dest.slice(hash);
	if (!linkpath.trim()) return null; // [[#heading]]: this note
	const next = o.target(unquote(linkpath).trim());
	if (next === undefined) return null;
	let shown = rest;
	if (rest) {
		// Shown text that only repeated a path's note name follows it, as Obsidian's own update does.
		const sep = rest.startsWith('\\|') ? '\\|' : '|';
		const text = rest.slice(sep.length);
		if (linkpath.includes('/') && unquote(text).trim() === linkBasename(unquote(linkpath).trim())) shown = sep + quote(linkBasename(next));
	}
	return `${quote(next)}${sub}${shown}`;
}

const LINK = /\[\[([^[\]\n]+?)\]\]/g;

function rewriteLine(line: string, o: RewriteOptions, yaml: boolean): string {
	if (!line.includes('[[')) return line;
	return line.replace(LINK, (all: string, inner: string, at: number) => {
		const q = yaml ? quoteAt(line, at) : '';
		// In a 'single-quoted' YAML value an apostrophe is written twice.
		const unquote = (s: string) => (q === '\'' ? s.replace(/''/g, '\'') : s);
		const quote = (s: string) => (q === '\'' ? s.replace(/'/g, '\'\'') : s);
		const out = rewriteInner(inner, o, unquote, quote);
		return out === null ? all : `[[${out}]]`;
	});
}

/**
 * Which YAML quotes a frontmatter line is inside at `at`: a quote opens a scalar only where a value
 * starts (after "key:", "- ", "[", "," or "{"), so the apostrophe in `recap: Bram's men` doesn't.
 */
function quoteAt(line: string, at: number): '' | '\'' | '"' {
	let q: '' | '\'' | '"' = '';
	let prev = '';
	for (let i = 0; i < at; i++) {
		const c = line[i];
		if (q === '\'') {
			if (c === '\'') { if (line[i + 1] === '\'') i++; else q = ''; }
		} else if (q === '"') {
			if (c === '\\') i++;
			else if (c === '"') q = '';
		} else if ((c === '\'' || c === '"') && (prev === '' || /[:[,{-]/.test(prev))) q = c;
		if (!/\s/.test(c)) prev = c;
	}
	return q;
}

/** A fence opening a code block: its prefix (callout ">", list indentation), the fence, and the language. */
const OPEN = /^([ \t>]*)(`{3,}|~{3,})\s*([^\s`]*)/;

/** A note's lines in three kinds: its properties, inside a fenced block (with the block's language), and the text. */
function regions(lines: string[]): ({ kind: 'props' } | { kind: 'fence'; lang: string } | { kind: 'text' })[] {
	const out: ({ kind: 'props' } | { kind: 'fence'; lang: string } | { kind: 'text' })[] = lines.map(() => ({ kind: 'text' }));
	let i = 0;
	if (lines[0]?.replace(/\r$/, '') === '---') {
		for (let j = 1; j < lines.length; j++) {
			const l = lines[j].replace(/\r$/, '');
			if (l === '---' || l === '...') {
				for (let k = 1; k < j; k++) out[k] = { kind: 'props' };
				i = j + 1;
				break;
			}
		}
	}
	for (; i < lines.length; i++) {
		const m = OPEN.exec(lines[i]);
		if (!m) continue;
		const fence = m[2];
		const lang = m[3].toLowerCase();
		let j = i + 1;
		for (; j < lines.length; j++) {
			const rest = lines[j].replace(/^[ \t>]*/, '').replace(/\s+$/, '');
			if (rest.length >= fence.length && rest === fence[0].repeat(rest.length)) break;
			out[j] = { kind: 'fence', lang };
		}
		i = j; // unclosed: everything after it was inside
	}
	return out;
}

/**
 * `text` with the links that meant a renamed note rewritten, where Obsidian doesn't update them:
 * inside our own fenced blocks, and in the properties. The text outside those, and every link
 * `target` leaves, is returned as it was. The same string comes back when nothing changed.
 */
export function rewriteLinks(text: string, o: RewriteOptions): string {
	if (!text.includes('[[')) return text;
	const lines = text.split('\n');
	let changed = false;
	// The properties, and our own fenced blocks; the text and anyone else's blocks are left whole.
	regions(lines).forEach((r, i) => {
		if (r.kind === 'text' || (r.kind === 'fence' && !o.fence(r.lang))) return;
		const next = rewriteLine(lines[i], o, r.kind === 'props');
		if (next !== lines[i]) { lines[i] = next; changed = true; }
	});
	return changed ? lines.join('\n') : text;
}
