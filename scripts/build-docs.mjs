// Builds the user guide (docs/*.md) into a documentation site at _site/docs/:
// one HTML page per Markdown file, with a sidebar, an "On this page" list,
// prev/next links and a search index. Layout files live in site/docs-assets/
// (copied with the rest of site/). build-site.mjs calls buildDocs().
//
//   node scripts/build-docs.mjs     rebuild only the guide (and docs-assets) into an existing _site/
import { Marked } from 'marked';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = 'https://puddinglord.github.io/obsidian-ttrpg-encounter-manager/';
const REPO = 'https://github.com/Puddinglord/obsidian-ttrpg-encounter-manager';

const pageName = (file) => (file === 'README.md' ? 'index' : file.replace(/\.md$/, ''));
const pageUrl = (file) => (file === 'README.md' ? 'index.html' : `${pageName(file)}.html`);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
	if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
	return ENTITIES[e.toLowerCase()] ?? m;
});
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html) => decode(html
	.replace(/<div class="code-bar">[\s\S]*?<\/div>/g, ' ')
	.replace(/<a class="anchor"[\s\S]*?<\/a>/g, '')
	.replace(/<\/?(p|li|ul|ol|h\d|td|th|tr|table|div|pre|figure|figcaption|blockquote|br)\b[^>]*>/g, ' ')
	.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
// GitHub-style heading ids, so links like npcs.md#portraits keep working.
const slug = (text) => text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');

function rewriteHref(href) {
	const m = /^([\w-]+)\.md(#.*)?$/.exec(href);
	return m ? pageUrl(`${m[1]}.md`) + (m[2] ?? '') : href;
}

function pngSize(file) {
	try {
		const b = readFileSync(file);
		return b.toString('ascii', 12, 16) === 'IHDR' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null;
	} catch { return null; }
}

function makeRenderer(root, state) {
	const marked = new Marked({ gfm: true });
	marked.use({
		renderer: {
			heading({ tokens, depth }) {
				const html = this.parser.parseInline(tokens);
				const text = plain(html);
				let id = slug(text) || 'section';
				if (state.ids.has(id)) { let n = 1; while (state.ids.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
				state.ids.add(id);
				if (depth === 2 || depth === 3) state.toc.push({ depth, id, text });
				return `<h${depth} id="${id}">${html}<a class="anchor" href="#${id}" aria-label="Link to ${esc(text)}">#</a></h${depth}>\n`;
			},
			link({ href, title, tokens }) {
				const ext = /^https?:/.test(href);
				return `<a href="${esc(rewriteHref(href))}"${title ? ` title="${esc(title)}"` : ''}${ext ? ' rel="noopener"' : ''}>${this.parser.parseInline(tokens)}</a>`;
			},
			image({ href, text }) {
				const local = /^images\//.test(href);
				const size = local ? pngSize(join(root, 'docs', href)) : null;
				const dims = size ? ` width="${size.w}" height="${size.h}"` : '';
				return `<img src="${esc(local ? `../${href}` : href)}" alt="${esc(text)}"${dims} loading="lazy" decoding="async">`;
			},
			paragraph({ tokens }) {
				const inner = this.parser.parseInline(tokens);
				const solo = tokens.filter((t) => !(t.type === 'text' && !t.text.trim()));
				if (solo.length === 1 && solo[0].type === 'image') {
					const cap = solo[0].text;
					return `<figure class="shot">${inner}${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>\n`;
				}
				return `<p>${inner}</p>\n`;
			},
			code({ text, lang }) {
				const label = (lang || '').split(/\s/)[0];
				return `<div class="code-card"><div class="code-bar"><span></span><span></span><span></span>${label ? `<b>${esc(label)}</b>` : ''}</div><pre><code>${esc(text)}</code></pre></div>\n`;
			},
			// The index's "Page | What it covers" tables and link-only lists become cards.
			table(token) {
				const head = token.header.map((c) => c.text.trim().toLowerCase());
				if (head[0] !== 'page') return false;
				const cards = token.rows.map((row) => {
					const link = row[0].tokens.find((t) => t.type === 'link');
					if (!link) return '';
					return `<a class="doc-card" href="${esc(rewriteHref(link.href))}"><b>${this.parser.parseInline(link.tokens)}</b><span>${this.parser.parseInline(row[1].tokens)}</span></a>`;
				});
				return `<div class="doc-cards">${cards.join('')}</div>\n`;
			},
			list(token) {
				const links = token.items.map((it) => {
					const inl = it.tokens[0]?.tokens ?? [];
					return it.tokens.length === 1 && inl.length === 1 && inl[0].type === 'link' && /\.md(#|$)/.test(inl[0].href) ? inl[0] : null;
				});
				if (token.ordered || !links.length || links.some((l) => !l)) return false;
				return `<div class="doc-cards">${links.map((l) => `<a class="doc-card" href="${esc(rewriteHref(l.href))}"><b>${this.parser.parseInline(l.tokens)}</b></a>`).join('')}</div>\n`;
			},
		},
	});
	return marked;
}

// The first prose in the page, for the meta description.
function describe(tokens, title) {
	let text = '';
	for (const t of tokens) {
		if (text.length >= 120) break;
		if (t.type === 'paragraph' && t.tokens.every((x) => x.type === 'image' || (x.type === 'text' && !x.text.trim()))) continue;
		if (t.type === 'paragraph' || t.type === 'list' || t.type === 'blockquote') {
			text = `${text} ${plain(new Marked({ gfm: true }).parser([t]))}`.trim();
		}
	}
	text = text.replace(/:$/, '.');
	if (text.length < 80) text = `${title}: ${text} Part of the Ember Vault guide for Nimble GMs in Obsidian.`.replace(/\s+/g, ' ');
	if (text.length <= 155) return text;
	const cut = text.slice(0, 154);
	return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:\s]+$/, '') + '…';
}

function lastModified(root, file) {
	try {
		const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', join('docs', file)], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		if (d) return d;
	} catch { /* not a git checkout */ }
	return new Date().toISOString().slice(0, 10);
}

const hash = (file) => createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8);

const D20 = `<svg width="0" height="0" class="defs" aria-hidden="true"><defs><linearGradient id="ember" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb259"/><stop offset=".55" stop-color="#ff6a1f"/><stop offset="1" stop-color="#d9400f"/></linearGradient><symbol id="d20" viewBox="0 0 100 100"><path d="M50 2 93 27V73L50 98 7 73V27Z" fill="url(#ember)"/><path d="M50 2 7 27 50 24Z" fill="#fff" opacity=".28"/><path d="M50 2 50 24 93 27Z" fill="#fff" opacity=".12"/><path d="M7 27 19 71 50 24Z" fill="#fff" opacity=".16"/><path d="M7 27 7 73 19 71Z" fill="#fff" opacity=".06"/><path d="M93 27 50 24 81 71Z" fill="#000" opacity=".06"/><path d="M93 27 81 71 93 73Z" fill="#000" opacity=".16"/><path d="M7 73 50 98 19 71Z" fill="#000" opacity=".1"/><path d="M19 71 50 98 81 71Z" fill="#000" opacity=".2"/><path d="M81 71 50 98 93 73Z" fill="#000" opacity=".28"/><path d="M50 24 19 71H81Z" fill="#fff" opacity=".1"/><path d="M50 2 93 27V73L50 98 7 73V27ZM50 24 19 71H81ZM50 2V24M7 27 50 24 93 27M7 27 19 71 7 73M93 27 81 71 93 73M19 71 50 98 81 71" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="1.6" stroke-linejoin="round"/></symbol></defs></svg>`;
const ICON_SEARCH = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const LOGO = '<svg class="logo-mark" aria-hidden="true"><use href="#d20"/></svg><span>Ember <b>Vault</b></span>';

function layout(p, ctx) {
	const { nav, pages, v } = ctx;
	const i = pages.indexOf(p);
	const prev = pages[i - 1], next = pages[i + 1];
	const canonical = `${SITE}docs/${p.name === 'index' ? '' : p.url}`;
	const side = nav.map((g) => `<p class="side-group">${esc(g.label)}</p><ul>${g.items.map((it) => `<li><a href="${it.url}"${it.url === p.url ? ' aria-current="page"' : ''}>${esc(it.label)}</a></li>`).join('')}</ul>`).join('');
	const tocItems = p.toc.map((h) => `<li class="d${h.depth}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join('');
	const toc = tocItems ? `<ul>${tocItems}</ul>` : '';
	const pager = (q, rel, label) => (q ? `<a class="pager-${rel}" href="${q.url}" rel="${rel}"><small>${label}</small><b>${esc(q.label)}</b></a>` : '<span></span>');
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${esc(p.docTitle)}</title>
	<meta name="description" content="${esc(p.description)}">
	<link rel="canonical" href="${canonical}">
	<meta property="og:type" content="article">
	<meta property="og:site_name" content="Ember Vault">
	<meta property="og:url" content="${canonical}">
	<meta property="og:title" content="${esc(p.docTitle)}">
	<meta property="og:description" content="${esc(p.description)}">
	<meta property="og:image" content="${SITE}images/${p.ogImage}">
	<meta name="twitter:card" content="summary_large_image">
	<meta name="theme-color" content="#120f16">
	<link rel="icon" href="../favicon.svg" type="image/svg+xml">
	<link rel="preload" href="../fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin>
	<link rel="preload" href="../fonts/figtree.woff2" as="font" type="font/woff2" crossorigin>
	<link rel="stylesheet" href="../docs-assets/docs.css?v=${v.css}">
	<script src="../docs-assets/docs.js?v=${v.js}" defer></script>
</head>
<body>
	${D20}
	<a class="skip" href="#content">Skip to content</a>
	<header class="dnav">
		<div class="dnav-inner">
			<a class="logo" href="../" aria-label="Ember Vault home">${LOGO}</a>
			<nav class="dnav-links" aria-label="Site">
				<a href="../#features">Features</a>
				<a href="../#demo">Live demo</a>
				<a href="./" class="is-active"${p.name === 'index' ? ' aria-current="page"' : ''}>Guide</a>
				<a href="${REPO}" rel="noopener">GitHub</a>
			</nav>
			<button class="search-btn" type="button" aria-haspopup="dialog" aria-controls="search" aria-keyshortcuts="/ Control+K Meta+K">${ICON_SEARCH}<span>Search the guide</span><kbd>/</kbd></button>
			<a class="btn btn-ember btn-sm" href="../#install">Get it free</a>
		</div>
	</header>
	<div class="mbar">
		<button class="menu-btn" type="button" aria-expanded="false" aria-controls="sidebar"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>Menu</button>
		<span class="mbar-title">${esc(p.label)}</span>
	</div>
	<div class="layout">
		<aside class="sidebar" id="sidebar" aria-label="Guide pages">
			<nav class="side-nav">${side}</nav>
		</aside>
		<div class="scrim" hidden></div>
		<main id="content" class="doc" tabindex="-1">
			<article>
				<header class="doc-head">
					<p class="kicker">${esc(p.group)}</p>
					<h1>${p.titleHtml}</h1>
				</header>
				${toc ? `<details class="toc-inline"><summary>On this page</summary>${toc}</details>` : ''}
				${p.html}
			</article>
			<p class="edit"><a href="${REPO}/blob/main/docs/${p.file}" rel="noopener"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>Edit this page on GitHub</a></p>
			<nav class="pager" aria-label="Previous and next page">${pager(prev, 'prev', 'Previous')}${pager(next, 'next', 'Next')}</nav>
		</main>
		<aside class="toc" aria-label="On this page">
			${toc ? `<p class="side-group">On this page</p>${toc}<a class="to-top" href="#content">Back to top</a>` : ''}
		</aside>
	</div>
	<footer class="foot">
		<div class="foot-inner">
			<div>
				<a class="logo" href="../" aria-label="Ember Vault home">${LOGO}</a>
				<p class="support">Free for anyone who owns the books, is trying Nimble out, or can't afford it right now. If you enjoy Nimble and you're able, please buy the official books at <a href="https://nimbleRPG.com">nimbleRPG.com</a>.</p>
			</div>
			<nav class="foot-links" aria-label="Project links">
				<a href="${REPO}" rel="noopener">Source on GitHub</a>
				<a href="./">User guide</a>
				<a href="${REPO}/issues" rel="noopener">Report a bug</a>
			</nav>
		</div>
		<div class="foot-inner legal">
			<p>Ember Vault is an independent product published under the Nimble 3rd Party Creator License. Nimble TTRPG © Nimble Co. Nimble text is included with permission. Not affiliated with or endorsed by Nimble Co. or Obsidian (Dynalist Inc.).</p>
			<p>Plugin code is <a href="${REPO}/blob/main/LICENSE">MIT-licensed</a>. The sample adventure and its art are © their creators and used with permission (<a href="${REPO}/blob/main/NOTICE.md">NOTICE</a>). Fonts: Fraunces and Figtree, SIL Open Font License.</p>
		</div>
	</footer>
	<dialog class="search" id="search" aria-label="Search the guide" data-index="search-index.json?v=${v.index}">
		<div class="search-box">${ICON_SEARCH}<input id="search-input" type="search" placeholder="Search the guide" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list"><button class="search-close" type="button" aria-label="Close search"><kbd>Esc</kbd></button></div>
		<div class="search-body">
			<ul id="search-results" role="listbox" aria-label="Results"></ul>
			<p class="search-empty">Try <button type="button">minion</button> <button type="button">3D dice</button> <button type="button">portrait</button> <button type="button">armor</button></p>
		</div>
		<p class="search-keys" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></p>
	</dialog>
</body>
</html>
`;
}

// The sidebar groups come from the index page: each "## Group" and the .md links under it.
function readNav(readme) {
	const groups = [];
	for (const t of new Marked({ gfm: true }).lexer(readme)) {
		if (t.type === 'heading' && t.depth === 2) groups.push({ label: t.text, items: [] });
		else if (groups.length) {
			const walk = (tokens) => tokens?.forEach((x) => {
				if (x.type === 'link' && /^[\w-]+\.md$/.test(x.href)) {
					const g = groups[groups.length - 1];
					if (!g.items.some((it) => it.file === x.href)) g.items.push({ file: x.href, label: x.text });
				} else walk(x.tokens ?? x.items ?? (x.rows ? x.rows.flat() : undefined));
			});
			walk(t.tokens ?? t.items ?? (t.rows ? t.rows.flat() : undefined));
		}
	}
	return groups;
}

export function buildDocs({ root, out }) {
	const docsDir = join(root, 'docs');
	const outDir = join(out, 'docs');
	mkdirSync(outDir, { recursive: true });
	const files = readdirSync(docsDir).filter((f) => f.endsWith('.md'));
	const groups = readNav(readFileSync(join(docsDir, 'README.md'), 'utf8'));
	const nav = [{ label: 'Start', items: [{ file: 'README.md', label: 'Overview' }] }, ...groups]
		.map((g) => ({ ...g, items: g.items.filter((it) => files.includes(it.file)).map((it) => ({ ...it, url: pageUrl(it.file) })) }));
	const ordered = nav.flatMap((g) => g.items.map((it) => ({ ...it, group: g.label === 'Start' ? 'User guide' : g.label })));
	for (const f of files) if (!ordered.some((o) => o.file === f)) ordered.push({ file: f, label: pageName(f), url: pageUrl(f), group: 'Reference' });

	const pages = ordered.map((o) => {
		const src = readFileSync(join(docsDir, o.file), 'utf8');
		const state = { ids: new Set(), toc: [] };
		const marked = makeRenderer(root, state);
		const tokens = marked.lexer(src);
		const h1i = tokens.findIndex((t) => t.type === 'heading' && t.depth === 1);
		const h1 = h1i >= 0 ? tokens.splice(h1i, 1)[0] : null;
		const title = h1 ? h1.text.replace(/\*\*|`/g, '') : o.label;
		const titleHtml = h1 ? marked.parseInline(h1.text) : esc(title);
		let html = marked.parser(tokens).replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
		html = html.replace(/^<p>/, '<p class="lede">');
		const img = /src="\.\.\/images\/([\w-]+\.png)"/.exec(html);
		return {
			...o, name: pageName(o.file), title, titleHtml, html, toc: state.toc,
			docTitle: o.file === 'README.md' ? 'Ember Vault user guide' : `${title} · Ember Vault guide`,
			description: describe(tokens, title),
			ogImage: img ? img[1] : 'tracker.png',
		};
	});

	const v = { css: hash(join(root, 'site/docs-assets/docs.css')), js: hash(join(root, 'site/docs-assets/docs.js')) };
	const index = [];
	for (const p of pages) {
		if (p.name === 'index') continue;
		// One search entry per section: the intro, then each h2/h3.
		const re = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;
		let last = { heading: p.title, anchor: '', start: 0 };
		// Prose (x) and code examples (c) are kept apart so search can rank prose higher.
		const codeRe = /<div class="code-card">[\s\S]*?<\/pre><\/div>/g;
		const push = (end) => {
			const chunk = p.html.slice(last.start, end);
			const text = plain(chunk.replace(codeRe, ' '));
			const code = (chunk.match(codeRe) ?? []).map(plain).join(' ');
			// Bold lead-ins ("**Minions** share one row…") are the guide's keywords.
			const keys = [...chunk.replace(codeRe, ' ').matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) => plain(m[1])).join(' · ');
			if (text || code || last.anchor) index.push({ t: p.title, h: last.heading, a: last.anchor, u: p.url + (last.anchor ? `#${last.anchor}` : ''), x: text, ...(keys && { k: keys }), ...(code && { c: code }) });
		};
		for (let m; (m = re.exec(p.html));) {
			push(m.index);
			last = { heading: plain(m[3]), anchor: m[2], start: m.index + m[0].length };
		}
		push(p.html.length);
	}
	const json = JSON.stringify(index);
	writeFileSync(join(outDir, 'search-index.json'), json);
	v.index = createHash('sha1').update(json).digest('hex').slice(0, 8);
	for (const p of pages) writeFileSync(join(outDir, p.url), layout(p, { nav, pages, v }));

	// Always start from site/sitemap.xml, so running this twice doesn't list the pages twice.
	const sitemapSrc = join(root, 'site/sitemap.xml');
	const urls = pages.map((p) => `\t<url><loc>${SITE}docs/${p.name === 'index' ? '' : p.url}</loc><lastmod>${lastModified(root, p.file)}</lastmod></url>`).join('\n');
	writeFileSync(join(out, 'sitemap.xml'), readFileSync(sitemapSrc, 'utf8').replace(/(\s*)<\/urlset>/, `\n${urls}$1</urlset>`));

	console.log(`docs: ${pages.length} pages, ${index.length} search entries`);
	return pages;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const root = join(dirname(fileURLToPath(import.meta.url)), '..');
	cpSync(join(root, 'site/docs-assets'), join(root, '_site/docs-assets'), { recursive: true });
	buildDocs({ root, out: join(root, '_site') });
}
