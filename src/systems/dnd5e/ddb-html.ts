// D&D Beyond's descriptions are HTML. These turn it into the text our cards
// draw: one paragraph a line, **bold** and *italic*, "- " lists and
// "| a | b |" tables, entities decoded. It never builds DOM from the HTML (no
// innerHTML, no DOMParser): it reads the tags as text and keeps only words.
// Pure: no Obsidian imports.

const ENTITIES: Record<string, string> = {
	amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
	rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', sbquo: '‚', bdquo: '„', ndash: '–', mdash: '—', hellip: '…',
	times: '×', divide: '÷', minus: '−', plusmn: '±', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', bull: '•', middot: '·',
	copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»', prime: '′', Prime: '″', shy: '',
};

/** "&amp;", "&#39;", "&#x2019;" → the character. Unknown names stay as written. */
export function decodeEntities(s: string): string {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
		if (e[0] === '#') {
			const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
		}
		return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
	});
}

// Markers for bold and italic while lines are built (so spaces can be moved outside them before they become "**").
const B_OPEN = '\u0001', B_CLOSE = '\u0002', I_OPEN = '\u0003', I_CLOSE = '\u0004';
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'blockquote', 'pre', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'caption', 'hr', 'br']);
const HEADING = /^h[1-6]$/;
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'object']);

/** A line's markers as markdown: spaces moved outside, empty pairs dropped, bold inside italic kept as bold. */
function finishLine(line: string): string {
	let s = line;
	for (let i = 0; i < 3; i++) {
		s = s.replace(new RegExp(`${B_OPEN}(\\s+)`, 'g'), `$1${B_OPEN}`).replace(new RegExp(`(\\s+)${B_CLOSE}`, 'g'), `${B_CLOSE}$1`)
			.replace(new RegExp(`${I_OPEN}(\\s+)`, 'g'), `$1${I_OPEN}`).replace(new RegExp(`(\\s+)${I_CLOSE}`, 'g'), `${I_CLOSE}$1`)
			.replace(new RegExp(`${B_OPEN}${B_CLOSE}|${I_OPEN}${I_CLOSE}`, 'g'), '')
			.replace(new RegExp(`${I_OPEN}${B_OPEN}([^${B_OPEN}-${I_CLOSE}]*)${B_CLOSE}${I_CLOSE}`, 'g'), `${B_OPEN}$1${B_CLOSE}`)
			.replace(new RegExp(`${B_OPEN}${I_OPEN}([^${B_OPEN}-${I_CLOSE}]*)${I_CLOSE}${B_CLOSE}`, 'g'), `${B_OPEN}$1${B_CLOSE}`)
			.replace(new RegExp(`${B_CLOSE}${B_OPEN}|${I_CLOSE}${I_OPEN}`, 'g'), '');
	}
	return s.replace(new RegExp(`[${B_OPEN}${B_CLOSE}]`, 'g'), '**').replace(new RegExp(`[${I_OPEN}${I_CLOSE}]`, 'g'), '*').replace(/[ \t]+/g, ' ').trim();
}

/**
 * D&D Beyond's HTML as our text: paragraphs, headings and list items each on a line, bold and italic as markdown,
 * lists as "- ", tables as "| a | b |" rows. Tags it doesn't know are dropped and their words kept; scripts, styles
 * and images are dropped whole.
 */
export function htmlToText(html: string): string {
	if (!html) return '';
	const lines: string[] = [];
	let line = '';
	/** Bold and italic open on this line, to close at a line's end and open again on the next. */
	const open: string[] = [];
	let row: string[] | null = null;
	let cell: string | null = null;
	let rowsInTable = 0;
	let skip = 0;
	const add = (s: string) => { if (cell !== null) cell += s; else line += s; };
	const flush = (prefix = '') => {
		const closers = [...open].reverse().map(m => (m === B_OPEN ? B_CLOSE : I_CLOSE)).join('');
		const done = finishLine(line + closers);
		if (done) lines.push(done);
		line = prefix + open.join('');
	};
	const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>|<|[^<]+/g;
	for (let m = re.exec(html); m; m = re.exec(html)) {
		const [tok, closing, rawTag, selfClose] = m;
		if (tok.startsWith('<!--')) continue;
		if (!rawTag) {
			if (skip) continue;
			add(tok === '<' ? '<' : decodeEntities(tok).replace(/\s+/g, ' '));
			continue;
		}
		const tag = rawTag.toLowerCase();
		if (SKIP.has(tag)) { if (!selfClose) skip += closing ? -1 : 1; if (skip < 0) skip = 0; continue; }
		if (skip) continue;
		if (tag === 'strong' || tag === 'b' || tag === 'em' || tag === 'i') {
			const mark = tag === 'strong' || tag === 'b' ? B_OPEN : I_OPEN;
			if (!closing) { open.push(mark); add(mark); continue; }
			const at = open.lastIndexOf(mark);
			if (at >= 0) open.splice(at, 1);
			add(mark === B_OPEN ? B_CLOSE : I_CLOSE);
			continue;
		}
		if (tag === 'tr') {
			if (!closing) { row = []; continue; }
			if (row?.length) {
				flush();
				lines.push(`| ${row.join(' | ')} |`);
				if (++rowsInTable === 1) lines.push(`| ${row.map(() => '---').join(' | ')} |`);
			}
			row = null;
			continue;
		}
		if (tag === 'td' || tag === 'th') {
			if (!closing) { cell = ''; continue; }
			if (row && cell !== null) row.push(finishLine(cell).replace(/\|/g, '/'));
			cell = null;
			continue;
		}
		if (tag === 'table') { flush(); rowsInTable = 0; continue; }
		if (tag === 'li') { flush(closing ? '' : '- '); continue; }
		if (HEADING.test(tag)) {
			if (!closing) { flush(); open.push(B_OPEN); line += B_OPEN; continue; }
			const at = open.lastIndexOf(B_OPEN);
			if (at >= 0) open.splice(at, 1);
			line += B_CLOSE;
			flush();
			continue;
		}
		if (BLOCK.has(tag)) { if (cell !== null) { cell += ' '; continue; } flush(); continue; }
		// Anything else (a, span, img, sup…): its words stay, the tag goes.
	}
	// Anything left open closes with the text.
	flush();
	return lines.join('\n').replace(/\n{2,}/g, '\n').trim();
}

/**
 * The "Label: value" pairs in D&D Beyond's HTML (a class's core traits table, a background's "Skill Proficiencies:"
 * line), by lowercase label: a table row's first cell and the rest, or a line that opens with a bold label.
 */
export function labelledValues(html: string): Map<string, string> {
	const out = new Map<string, string>();
	const put = (label: string, value: string) => {
		const k = label.replace(/\*/g, '').replace(/[:.]\s*$/, '').trim().toLowerCase();
		const v = value.replace(/\*/g, '').replace(/^[:.]\s*/, '').trim();
		if (k && v && k.length <= 48 && !out.has(k)) out.set(k, v);
	};
	for (const line of htmlToText(html).split('\n')) {
		if (line.startsWith('|')) {
			const cells = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
			if (cells.length >= 2 && !cells.every(c => /^-+$/.test(c))) put(cells[0], cells.slice(1).join(' '));
			continue;
		}
		const bold = /^\*\*([^*]{2,48}?)\*\*\s*(.+)$/.exec(line);
		if (bold && /[:.]\s*$|^[^:]+$/.test(bold[1])) { put(bold[1], bold[2]); continue; }
		const plain = /^([A-Z][A-Za-z' ]{2,40}):\s+(.+)$/.exec(line);
		if (plain) put(plain[1], plain[2]);
	}
	return out;
}
