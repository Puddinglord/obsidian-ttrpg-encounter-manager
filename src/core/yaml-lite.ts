// Enough YAML for what people type by hand and what other plugins write,
// without a dependency (Obsidian's parseYaml isn't available in pure modules):
// a 5e stat block written for Fantasy Statblocks, and our own content blocks
// (```5e-class, ```nimble-ancestry…, core/content/blocks.ts). Pure.
//
// Reads: block mappings and sequences (including "- key: value" items and
// sequences at their key's indent), plain, 'single' and "double" quoted
// scalars, | and > block scalars, [flow, lists] and {flow: maps}, comments,
// and numbers, booleans and null. Plain scalars may run over several lines.
// It never throws: what it can't make sense of, it skips, and `readYaml` says
// which lines those were. `toYaml` writes plain values back in the same subset.

/** `n`: the line's number in the source (1-based). */
interface Line { indent: number; text: string; n: number }

export function parseYamlLite(source: string): unknown {
	return readYaml(source).value;
}

/** The value, and the lines (1-based) it skipped because they didn't fit where they stood. */
export function readYaml(source: string): { value: unknown; skipped: number[] } {
	const lines: Line[] = [];
	let started = false;
	let n = 0;
	for (const raw of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
		n++;
		const t = raw.replace(/\t/g, '  ');
		// "---" opens the document; a second one (or "...") ends it.
		if (/^(---|\.\.\.)\s*$/.test(t)) { if (started || lines.some(l => l.text.trim())) break; started = true; continue; }
		const text = t.replace(/^ +/, '');
		lines.push({ indent: t.length - text.length, text: text.replace(/\s+$/, ''), n });
	}
	const reader = new Reader(lines);
	const value = reader.document();
	return { value, skipped: lines.filter((l, i) => isContent(l) && !reader.used.has(i)).map(l => l.n) };
}

const isContent = (l: Line | undefined) => !!l && l.text !== '' && !l.text.startsWith('#');
const isSeqItem = (text: string) => /^-(\s|$)/.test(text);

/** Cut a trailing " # comment", outside quotes and brackets' strings. */
function stripComment(s: string): string {
	let quote = '';
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (quote) { if (ch === quote) quote = ''; else if (ch === '\\' && quote === '"') i++; continue; }
		if ((ch === '"' || ch === '\'') && (i === 0 || /[\s[{,:]/.test(s[i - 1]))) quote = ch;
		else if (ch === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).replace(/\s+$/, '');
	}
	return s;
}

/** A plain scalar's value: null, a boolean, a number, or the text. */
function resolve(s: string): unknown {
	const t = s.trim();
	if (t === '' || t === '~' || /^null$/i.test(t)) return null;
	if (/^true$/i.test(t)) return true;
	if (/^false$/i.test(t)) return false;
	if (/^[-+]?\d+$/.test(t)) return Number(t);
	if (/^[-+]?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) || /^[-+]?\d+[eE][-+]?\d+$/.test(t)) return Number(t);
	return t;
}

/** "key: rest" (the key plain or quoted), or null. */
function keyOf(text: string): { key: string; rest: string } | null {
	if (isSeqItem(text) || /^[[{|>]/.test(text)) return null;
	if (text[0] === '"' || text[0] === '\'') {
		const q = readQuoted(text, 0);
		if (!q) return null;
		const after = /^\s*:(\s|$)/.exec(text.slice(q.end));
		return after ? { key: q.value, rest: text.slice(q.end + after[0].length) } : null;
	}
	const m = /:(\s|$)/.exec(text);
	if (!m || m.index === 0) return null;
	const key = text.slice(0, m.index).trim();
	if (key.includes(' #')) return null;
	return { key, rest: text.slice(m.index + 1) };
}

/** A quoted string starting at `start`, and where it ends; null if it doesn't close. */
function readQuoted(s: string, start: number): { value: string; end: number } | null {
	const q = s[start];
	let out = '';
	for (let i = start + 1; i < s.length; i++) {
		const ch = s[i];
		if (q === '\'') {
			if (ch === '\'') { if (s[i + 1] === '\'') { out += '\''; i++; continue; } return { value: out, end: i + 1 }; }
			out += ch;
			continue;
		}
		if (ch === '"') return { value: out, end: i + 1 };
		if (ch === '\\') {
			const e = s[++i];
			const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', '0': '\0', ' ': ' ', _: ' ' };
			if (e === 'u' || e === 'x') {
				const len = e === 'u' ? 4 : 2;
				const hex = s.slice(i + 1, i + 1 + len);
				if (/^[0-9a-f]+$/i.test(hex) && hex.length === len) { out += String.fromCharCode(parseInt(hex, 16)); i += len; continue; }
			}
			out += e !== undefined ? map[e] ?? e : '';
			continue;
		}
		out += ch;
	}
	return null;
}

/** Fold a multi-line quoted string: a line break is a space, a blank line a newline. */
function fold(parts: string[]): string {
	let out = '';
	let pendingBreaks = 0;
	parts.forEach((p, i) => {
		const t = i === 0 ? p : p.trim();
		if (i > 0 && !t) { pendingBreaks++; return; }
		if (i > 0) out += pendingBreaks ? '\n'.repeat(pendingBreaks) : ' ';
		pendingBreaks = 0;
		out += t;
	});
	return out;
}

/** [a, b, {c: d}] and {a: 1, b: [2]}. */
function parseFlow(s: string): unknown {
	let i = 0;
	const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
	/** Plain text up to a comma or a closing bracket, or (for a map's key) a colon before a space. */
	const plain = (key: boolean) => {
		const start = i;
		while (i < s.length && !/[,\]}]/.test(s[i]) && !(key && s[i] === ':' && /[\s,\]}]/.test(s[i + 1] ?? ' '))) i++;
		return s.slice(start, i).trim();
	};
	const value = (): unknown => {
		ws();
		const ch = s[i];
		if (ch === '[') {
			i++;
			const out: unknown[] = [];
			for (;;) {
				ws();
				if (i >= s.length) return out;
				if (s[i] === ']') { i++; return out; }
				if (s[i] === ',') { i++; continue; }
				const before = i;
				out.push(value());
				if (i === before) i++;
			}
		}
		if (ch === '{') {
			i++;
			const out: Record<string, unknown> = {};
			for (;;) {
				ws();
				if (i >= s.length) return out;
				if (s[i] === '}') { i++; return out; }
				if (s[i] === ',') { i++; continue; }
				const before = i;
				const k = s[i] === '"' || s[i] === '\'' ? (() => { const q = readQuoted(s, i); if (!q) { i = s.length; return ''; } i = q.end; return q.value; })() : plain(true);
				ws();
				if (s[i] === ':') { i++; out[k] = value(); } else if (k) out[k] = null;
				if (i === before) i++;
			}
		}
		if (ch === '"' || ch === '\'') {
			const q = readQuoted(s, i);
			if (!q) { const rest = s.slice(i + 1); i = s.length; return rest; }
			i = q.end;
			return q.value;
		}
		return resolve(plain(false));
	};
	return value();
}

class Reader {
	private i = 0;
	/** Lines read into the value (by index), so the rest can be reported as skipped. */
	readonly used = new Set<number>();
	constructor(private readonly lines: Line[]) {}

	document(): unknown {
		const j = this.next(0);
		if (j < 0) return null;
		this.i = j;
		return this.node(this.lines[j].indent);
	}

	/** The next line with content at or after `from`, or -1. */
	private next(from: number): number {
		for (let j = from; j < this.lines.length; j++) if (isContent(this.lines[j])) return j;
		return -1;
	}

	/** The block starting at the current line (which has content). */
	private node(indent: number): unknown {
		const l = this.lines[this.i];
		if (isSeqItem(l.text)) return this.seq(l.indent);
		if (keyOf(l.text)) return this.map(l.indent);
		this.used.add(this.i);
		this.i++;
		return this.scalar(l.text, Math.max(0, indent - 1));
	}

	private map(indent: number): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		for (;;) {
			const j = this.next(this.i);
			if (j < 0) break;
			const l = this.lines[j];
			if (l.indent < indent) break;
			this.i = j;
			const kv = l.indent === indent ? keyOf(l.text) : null;
			if (!kv) { if (l.indent === indent) break; this.i++; continue; }
			this.used.add(this.i);
			this.i++;
			out[kv.key] = this.value(kv.rest, indent);
		}
		return out;
	}

	private seq(indent: number): unknown[] {
		const out: unknown[] = [];
		for (;;) {
			const j = this.next(this.i);
			if (j < 0) break;
			const l = this.lines[j];
			if (l.indent !== indent || !isSeqItem(l.text)) break;
			this.i = j;
			this.used.add(j);
			const after = l.text.slice(1);
			const rest = after.replace(/^\s+/, '');
			if (!stripComment(rest)) {
				this.i++;
				const k = this.next(this.i);
				if (k >= 0 && this.lines[k].indent > indent) { this.i = k; out.push(this.node(this.lines[k].indent)); }
				else out.push(null);
				continue;
			}
			const inner = indent + 1 + (after.length - rest.length);
			if (isSeqItem(rest) || keyOf(rest)) {
				// "- key: value" or "- - x": read it as a block that starts where the text does.
				this.lines[j] = { indent: inner, text: rest, n: l.n };
				out.push(this.node(inner));
			} else {
				this.i++;
				out.push(this.value(rest, indent));
			}
		}
		return out;
	}

	/** A value after "key:" or "- ": inline, or the block below. `indent` is its parent's. */
	private value(rest: string, indent: number): unknown {
		const r = rest.trim();
		if (r === '' || r.startsWith('#')) {
			const k = this.next(this.i);
			if (k < 0) return null;
			const l = this.lines[k];
			if (l.indent > indent || (l.indent === indent && isSeqItem(l.text))) { this.i = k; return this.node(l.indent); }
			return null;
		}
		if (r[0] === '|' || r[0] === '>') return this.block(r, indent);
		if (r[0] === '[' || r[0] === '{') {
			let text = stripComment(r);
			while (!balanced(text)) {
				const k = this.next(this.i);
				if (k < 0 || this.lines[k].indent <= indent && !/^[\]}]/.test(this.lines[k].text)) break;
				text += ` ${stripComment(this.lines[k].text)}`;
				this.used.add(k);
				this.i = k + 1;
			}
			return parseFlow(text);
		}
		if (r[0] === '"' || r[0] === '\'') {
			const parts = [r];
			while (!readQuoted(parts.join('\n'), 0) && this.i < this.lines.length && (this.lines[this.i].indent > indent || !this.lines[this.i].text)) {
				parts.push(this.lines[this.i].text);
				this.used.add(this.i);
				this.i++;
			}
			// A quoted string over several lines folds as YAML does; one that never closes is taken as written.
			// Fold the line breaks first, so an escaped "\n" stays a newline.
			const folded = fold(parts);
			const q = readQuoted(folded, 0);
			return q ? q.value : folded.slice(1);
		}
		return this.scalar(r, indent);
	}

	/** A plain scalar and any lines below that continue it (indented past `indent`). */
	private scalar(first: string, indent: number): unknown {
		const parts = [stripComment(first)];
		for (;;) {
			const k = this.next(this.i);
			if (k < 0 || this.lines[k].indent <= indent) break;
			// Blank lines in between are paragraph breaks.
			for (let b = this.i; b < k; b++) if (!this.lines[b].text) parts.push('');
			parts.push(stripComment(this.lines[k].text));
			this.used.add(k);
			this.i = k + 1;
		}
		return parts.length === 1 ? resolve(parts[0]) : fold(parts);
	}

	/** A | or > block. */
	private block(header: string, indent: number): string {
		const m = /^([|>])([+-]?)(\d?)([+-]?)/.exec(header)!;
		const literal = m[1] === '|';
		const chomp = m[2] || m[4];
		const body: string[] = [];
		let blockIndent = m[3] ? indent + Number(m[3]) : -1;
		while (this.i < this.lines.length) {
			const l = this.lines[this.i];
			if (l.text) {
				if (blockIndent < 0) { if (l.indent <= indent) break; blockIndent = l.indent; }
				if (l.indent < blockIndent) break;
				body.push(' '.repeat(l.indent - blockIndent) + l.text);
				this.used.add(this.i);
			} else body.push('');
			this.i++;
		}
		let trailing = 0;
		while (body.length && body[body.length - 1] === '') { body.pop(); trailing++; }
		let text: string;
		if (literal) text = body.join('\n');
		else {
			text = '';
			body.forEach((line, n) => {
				if (n === 0) { text = line; return; }
				const prev = body[n - 1];
				if (!line) text += '\n';
				else if (!prev || /^\s/.test(line) || /^\s/.test(prev)) text += (prev ? '\n' : '') + line;
				else text += ` ${line}`;
			});
		}
		if (!body.length) return '';
		if (chomp === '-') return text;
		if (chomp === '+') return text + '\n'.repeat(trailing + 1);
		return `${text}\n`;
	}
}

/** Brackets closed, outside strings. */
function balanced(s: string): boolean {
	let depth = 0;
	let quote = '';
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (quote) { if (ch === quote) quote = ''; else if (ch === '\\' && quote === '"') i++; continue; }
		if (ch === '"' || ch === '\'') quote = ch;
		else if (ch === '[' || ch === '{') depth++;
		else if (ch === ']' || ch === '}') depth--;
	}
	return depth <= 0;
}

// ----------------------------------------------------------------------------
// Writing: plain values (what JSON holds) as YAML this reader reads back the same

/** Can `s` be written bare, and read back as the same text? */
function plainSafe(s: string): boolean {
	if (!s || s !== s.trim() || /[\n\r\t]/.test(s)) return false;
	if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || /:(\s|$)|\s#/.test(s)) return false;
	return resolve(s) === s;
}

/** A key as written: bare when it can be, else quoted. */
function keyText(k: string): string {
	return /^[A-Za-z_][\w -]*$/.test(k) && k === k.trim() ? k : JSON.stringify(k);
}

/** A string on its key's line, or a block below it (`|` for several lines). */
function stringText(s: string, indent: number): string {
	if (plainSafe(s)) return s;
	const lines = s.replace(/\n+$/, '').split('\n');
	// A block keeps several lines as written; one that starts with a space, or holds tabs or trailing spaces, can't.
	if (lines.length > 1 && !/^ /.test(lines[0]) && !/[\t\r]/.test(s) && !lines.some(l => / $/.test(l))) {
		const trailing = /\n*$/.exec(s)?.[0].length ?? 0;
		const chomp = trailing === 0 ? '-' : trailing === 1 ? '' : '+';
		const pad = ' '.repeat(indent + 2);
		return `|${chomp}\n${lines.map(l => (l ? pad + l : '')).join('\n')}${'\n'.repeat(Math.max(0, trailing - 1))}`;
	}
	return JSON.stringify(s);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Fits in a flow list: [Strength, Constitution]. */
const flowSafe = (v: unknown) => typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && plainSafe(v) && !/[,[\]{}]/.test(v));

/** A value after "key:" (or "- "): inline when it's short, else the lines below it. `indent`: its key's. */
function valueText(v: unknown, indent: number): string {
	if (v === null || v === undefined) return 'null';
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	if (typeof v === 'string') return stringText(v, indent);
	if (Array.isArray(v)) {
		if (!v.length) return '[]';
		const flow = `[${v.map(String).join(', ')}]`;
		if (v.every(flowSafe) && flow.length + indent <= 80) return flow;
		return `\n${seqText(v, indent + 2)}`;
	}
	if (isPlainObject(v)) {
		if (!Object.values(v).some(x => x !== undefined)) return '{}';
		return `\n${mapText(v, indent + 2)}`;
	}
	return 'null';
}

function mapText(o: Record<string, unknown>, indent: number): string {
	const pad = ' '.repeat(indent);
	return Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => {
		const val = valueText(v, indent);
		return `${pad}${keyText(k)}:${val.startsWith('\n') ? '' : ' '}${val}`;
	}).join('\n');
}

function seqText(list: unknown[], indent: number): string {
	const pad = ' '.repeat(indent);
	return list.map((x) => {
		// "- name: …", the rest of the map under it two spaces in.
		if (isPlainObject(x) && Object.values(x).some(y => y !== undefined)) return `${pad}- ${mapText(x, indent + 2).slice(indent + 2)}`;
		if (Array.isArray(x) && x.length) return `${pad}-\n${seqText(x, indent + 2)}`;
		const val = valueText(x, indent);
		return `${pad}-${val.startsWith('\n') ? '' : ' '}${val}`;
	}).join('\n');
}

/** A plain value (an object, usually) as YAML that `parseYamlLite` reads back the same. Undefined fields are left out. */
export function toYaml(value: unknown): string {
	if (isPlainObject(value)) return mapText(value, 0);
	if (Array.isArray(value)) return value.length ? seqText(value, 0) : '[]';
	return valueText(value, 0);
}
