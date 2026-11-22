// Writes what e2e/visual.mjs found: report.json (everything), report.md (issues grouped by
// surface and kind, worst first) and index.html (a gallery of every shot with its issues
// beside it and an outlined copy).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KIND = {
	clipped: 'Text cut off', spill: 'Spilling or scrolling sideways', crushed: 'Crushed', overlap: 'Overlapping',
	wrap: 'Wrapping', pill: 'Pill off its centre line', contrast: 'Low contrast', truncated: 'Name truncated with room', harness: 'Harness',
};

/** Same problem, any width or theme: the element, its words, and what's wrong with the numbers left out. */
const keyOf = (i) => `${i.kind}|${i.path}|${i.detail.replace(/"[^"]*"/g, '…').replace(/-?\d+(\.\d+)?/g, '#')}`;
const shotName = (s) => `${s.phone ? 'phone ' : ''}${s.width}${s.mode === 'sidebar' && !s.phone ? ' sidebar' : ''} ${s.theme}`;

export function writeReport(OUT, { shots, errors, unknownPills, ignore, seconds, pillSelectors }) {
	// Group by surface, then by problem.
	const surfaces = new Map();
	for (const s of shots) {
		const id = `${s.game}/${s.surface}`;
		const g = surfaces.get(id) ?? { id, game: s.game, surface: s.surface, shots: 0, problems: new Map() };
		g.shots++;
		s.issues.forEach((i, n) => {
			const k = keyOf(i);
			const p = g.problems.get(k) ?? { ...i, n: 0, count: 0, at: [], outlined: null, number: n + 1 };
			p.count++;
			if (p.at.includes(shotName(s))) return;
			p.n++;
			p.at.push(shotName(s));
			if (!p.outlined || i.sev > p.sev) { p.outlined = s.outlined; p.number = n + 1; }
			p.sev = Math.max(p.sev, i.sev);
			g.problems.set(k, p);
		});
		surfaces.set(id, g);
	}
	const groups = [...surfaces.values()].map(g => ({ ...g, problems: [...g.problems.values()].sort((a, b) => b.sev - a.sev || b.n - a.n) }))
		.filter(g => g.problems.length)
		.sort((a, b) => (b.problems[0]?.sev ?? 0) - (a.problems[0]?.sev ?? 0) || b.problems.reduce((t, p) => t + p.n * p.sev, 0) - a.problems.reduce((t, p) => t + p.n * p.sev, 0));
	const issues = shots.reduce((t, s) => t + s.issues.length, 0);
	const distinct = groups.reduce((t, g) => t + g.problems.length, 0);
	const surfaceCount = new Set(shots.map(s => `${s.game}/${s.surface}`)).size;
	const summary = `${shots.length} screenshots of ${surfaceCount} surfaces; ${issues} issues (${distinct} distinct, in ${groups.length} surfaces); ${errors.length} harness errors; ${Math.round(seconds / 60)} min.`;

	writeFileSync(join(OUT, 'report.json'), JSON.stringify({ summary, seconds, shots, errors, unknownPills, ignore, groups: groups.map(g => ({ ...g, problems: g.problems })) }, null, '\t'));

	// report.md
	const md = [];
	const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
	md.push('# Visual check', '', summary, '');
	md.push('Widths: notes and main-area views at content widths 320, 540, 700 and 900 px, dialogs at those window widths, sidebars at 260, 340 and 420 px, and everything at 390 px in Obsidian\'s phone layout; light and dark. Shots are 2×, in `e2e/artifacts/visual/<game>/<surface>/`; `*.issues.png` has the problems outlined and numbered.', '');
	if (errors.length) {
		md.push('## Surfaces the harness couldn\'t reach', '', '| Surface | Phone | Error |', '|---|---|---|');
		for (const e of errors) md.push(`| ${cell(`${e.game}/${e.surface}`)} | ${e.phone ? 'yes' : ''} | ${cell(e.error)} |`);
		md.push('');
	}
	const byKind = {};
	for (const g of groups) for (const p of g.problems) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
	md.push('## By kind', '', '| Kind | Distinct problems |', '|---|---|');
	for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) md.push(`| ${KIND[k] ?? k} | ${n} |`);
	md.push('', '## Issues, worst first', '');
	for (const g of groups) {
		md.push(`### ${g.id} (${g.problems.length} distinct, ${g.shots} shots)`, '', '| Sev | Kind | Element | Text | What | Where | Outlined (#) |', '|---|---|---|---|---|---|---|');
		for (const p of g.problems) {
			const where = `${p.n > 4 ? `${p.n} shots: ${p.at.slice(0, 3).join(', ')}…` : p.at.join(', ')}${p.count > p.n ? ` (${p.count} elements)` : ''}`;
			md.push(`| ${p.sev} | ${KIND[p.kind] ?? p.kind} | \`${cell(p.path)}\` | ${cell(p.text)} | ${cell(p.detail)} | ${cell(where)} | ${p.outlined ? `[${p.outlined.split('/').pop()}](${p.outlined}) (${p.number})` : ''} |`);
		}
		md.push('');
	}
	if (unknownPills.length) {
		md.push('## Pill-like elements not in PILL_SELECTORS', '', 'Small rounded boxes with a short label that `e2e/align.mjs` doesn\'t list (measured here anyway). Add the real pills to `PILL_SELECTORS` and the shared centring rule in styles.css.', '', '| Selector | Count | Seen in |', '|---|---|---|');
		for (const u of [...unknownPills].sort((a, b) => b.n - a.n)) md.push(`| \`${cell(u.sel)}\` | ${u.n} | ${cell(u.where.slice(0, 4).join(', '))}${u.where.length > 4 ? ` +${u.where.length - 4}` : ''} |`);
		md.push('');
	}
	md.push('## Ignored', '', ...ignore.map(r => `- ${Object.entries(r).filter(([k]) => k !== 'why').map(([k, v]) => `${k} ${v}`).join(', ')}: ${r.why}`), '');
	writeFileSync(join(OUT, 'report.md'), md.join('\n'));

	// index.html: the gallery.
	const data = { summary, pillSelectors: pillSelectors.length, errors, shots: shots.map(s => ({ g: s.game, s: s.surface, w: s.width, t: s.theme, p: s.phone, m: s.mode, f: s.file, o: s.outlined, i: s.issues.map(i => [i.kind, i.sev, i.path, i.text, i.detail]) })) };
	writeFileSync(join(OUT, 'index.html'), GALLERY.replace('/*DATA*/', JSON.stringify(data).replace(/</g, '\\u003c')));
	return { summary, issues, distinct };
}

const GALLERY = `<!doctype html>
<html><head><meta charset="utf-8"><title>Ember Vault visual check</title>
<style>
body { margin: 0; font: 13px/1.45 system-ui, sans-serif; color: #222; background: #f4f2ee; display: grid; grid-template-columns: 280px minmax(0, 1fr); height: 100vh; }
nav { overflow: auto; border-right: 1px solid #ddd; background: #fff; padding: 10px 0; }
nav h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #888; margin: 14px 14px 4px; }
nav button { display: flex; width: 100%; justify-content: space-between; gap: 8px; border: 0; background: none; padding: 4px 14px; font: inherit; text-align: left; cursor: pointer; }
nav button:hover { background: #f0ede8; } nav button.on { background: #222; color: #fff; }
.n { font-variant-numeric: tabular-nums; border-radius: 9px; padding: 0 6px; background: #e11d48; color: #fff; font-size: 11px; } .n.zero { background: #d7d3cc; color: #555; }
main { overflow: auto; padding: 16px 20px 40px; }
.summary { color: #555; margin-bottom: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 6px; cursor: pointer; }
.card.on { outline: 2px solid #222; } .card img { width: 100%; max-height: 240px; object-fit: contain; object-position: top; background: #eee; border-radius: 4px; }
.card .cap { display: flex; justify-content: space-between; margin-top: 4px; }
.detail { margin-top: 18px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 360px; gap: 14px; align-items: start; }
.detail img { width: 100%; border: 1px solid #ddd; border-radius: 6px; background: #fff; }
.issues { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 8px 10px; }
.issue { padding: 6px 0; border-bottom: 1px solid #eee; } .issue:last-child { border: 0; }
.issue b { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; } .issue code { font-size: 11px; color: #555; word-break: break-all; }
.k-clipped, .k-spill, .k-crushed { color: #e11d48; } .k-wrap, .k-truncated { color: #b45309; } .k-pill { color: #7c3aed; } .k-overlap { color: #0284c7; } .k-contrast { color: #15803d; }
.filters { display: flex; gap: 8px; margin-bottom: 10px; } .filters label { display: flex; gap: 4px; align-items: center; }
</style></head><body>
<nav id="nav"></nav><main><div class="summary" id="summary"></div><div class="filters"><label><input type="checkbox" id="onlyBad"> Only surfaces with issues</label></div><div class="grid" id="grid"></div><div id="detail"></div></main>
<script type="application/json" id="data">/*DATA*/</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const bySurface = new Map();
for (const s of D.shots) { const id = s.g + '/' + s.s; if (!bySurface.has(id)) bySurface.set(id, []); bySurface.get(id).push(s); }
document.getElementById('summary').textContent = D.summary;
let current = null;
function nav() {
	const n = document.getElementById('nav'); n.replaceChildren();
	const only = document.getElementById('onlyBad').checked;
	for (const game of ['nimble', '5e', 'shared']) {
		const ids = [...bySurface.keys()].filter(id => id.startsWith(game + '/'));
		if (!ids.length) continue;
		n.append(el('h2', '', game));
		for (const id of ids) {
			const count = bySurface.get(id).reduce((t, s) => t + s.i.length, 0);
			if (only && !count) continue;
			const b = el('button', id === current ? 'on' : '');
			b.append(el('span', '', id.slice(game.length + 1)), el('span', 'n' + (count ? '' : ' zero'), String(count)));
			b.onclick = () => { current = id; nav(); show(id); };
			n.append(b);
		}
	}
}
function show(id, pick) {
	const g = document.getElementById('grid'); g.replaceChildren();
	const list = bySurface.get(id);
	list.forEach((s, k) => {
		const c = el('div', 'card' + (k === (pick ?? -1) ? ' on' : ''));
		const img = el('img'); img.loading = 'lazy'; img.src = s.f;
		const cap = el('div', 'cap'); cap.append(el('span', '', (s.p ? 'phone ' : '') + s.w + (s.m === 'sidebar' && !s.p ? ' sidebar' : '') + ' · ' + s.t), el('span', 'n' + (s.i.length ? '' : ' zero'), String(s.i.length)));
		c.append(img, cap);
		c.onclick = () => { show(id, k); };
		g.append(c);
	});
	const d = document.getElementById('detail'); d.replaceChildren();
	if (pick === undefined) return;
	const s = list[pick];
	const box = el('div', 'detail');
	const a = el('img'); a.src = s.f; const b = el('img'); b.src = s.o || s.f;
	const issues = el('div', 'issues');
	issues.append(el('div', '', s.i.length ? s.i.length + ' issue' + (s.i.length === 1 ? '' : 's') : 'Nothing found.'));
	s.i.forEach(([kind, sev, path, text, detail], n) => {
		const row = el('div', 'issue');
		row.append(el('b', 'k-' + kind, (n + 1) + '. ' + kind + ' (sev ' + sev + ')'), el('div', '', detail), el('code', '', path + (text ? ' "' + text + '"' : '')));
		issues.append(row);
	});
	box.append(a, b, issues);
	d.append(box);
	box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.getElementById('onlyBad').onchange = nav;
nav();
const first = [...bySurface.keys()].find(id => bySurface.get(id).some(s => s.i.length)) ?? [...bySurface.keys()][0];
if (first) { current = first; nav(); show(first); }
</script></body></html>`;
