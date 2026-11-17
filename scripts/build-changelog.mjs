// Builds the site's changelog from CHANGELOG.md, so the file stays the one source of truth:
//
//   _site/changelog/index.html          every release, newest first
//   _site/changelog/<version>/index.html one release, with its own title and link preview (for Discord and the like)
//   _site/changelog/feed.xml            an Atom feed of releases
//
// A release's headline is the line under its "## [x.y.z] - date" heading, before "### Added".
// Without one, its first entry stands in. build-site.mjs calls buildChangelog() and puts the
// latest release in the landing page's "New in" chip.
//
//   node scripts/build-changelog.mjs   rebuild only the changelog into an existing _site/
import { Marked } from 'marked';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = 'https://puddinglord.github.io/obsidian-ttrpg-encounter-manager/';
const REPO = 'https://github.com/Puddinglord/obsidian-ttrpg-encounter-manager';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = new Marked({ gfm: true });
const inline = (text) => md.parseInline(text);
/** Markdown to one line of plain text, for titles, descriptions and the feed. */
const plain = (text) => text.replace(/`{3,}\s*([\w-]+)\s*`{3,}/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
const clip = (text, n) => (text.length <= n ? text : `${text.slice(0, n - 1).slice(0, text.slice(0, n - 1).lastIndexOf(' ')).replace(/[,.;:\s]+$/, '')}…`);
const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const BOOK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>';

/** Guide links (`docs/x.md#a`, as written in CHANGELOG.md) become Guide pills pointing at the built guide. */
const guideLinks = (html, root) => html.replace(/<a href="docs\/([\w-]+)\.md(#[^"]*)?">([\s\S]*?)<\/a>/g,
	(_, page, anchor = '', text) => `<a class="cl-guide" href="${root}docs/${page === 'README' ? '' : `${page}.html`}${anchor}">${BOOK}<span class="t">${text}</span></a>`);

/** The guide pages a release links to, in order, titled from each page's heading. */
function guidesOf(r, docsDir) {
	const seen = new Map();
	for (const g of r.groups) for (const it of g.items) for (const m of it.matchAll(/\]\(docs\/([\w-]+)\.md(?:#[^)]*)?\)/g)) {
		if (seen.has(m[1])) continue;
		let title = m[1];
		try { title = /^#\s+(.+)$/m.exec(readFileSync(join(docsDir, `${m[1]}.md`), 'utf8'))?.[1] ?? title; } catch { /* missing page: check-docs reports it */ }
		seen.set(m[1], plain(title).replace(/:.*$/, ''));
	}
	return [...seen].map(([page, title]) => ({ page, title }));
}

const KINDS = {
	Added: { label: 'New', cls: 'added' },
	Changed: { label: 'Changed', cls: 'changed' },
	Fixed: { label: 'Fixed', cls: 'fixed' },
	Removed: { label: 'Removed', cls: 'removed' },
	Deprecated: { label: 'Deprecated', cls: 'removed' },
	Security: { label: 'Security', cls: 'fixed' },
};

/** The released versions in CHANGELOG.md, newest first. Unreleased is left out. */
export function parseChangelog(text) {
	const heads = [...text.matchAll(/^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?[^\n]*$/gm)];
	const releases = [];
	heads.forEach((h, i) => {
		const version = h[1];
		if (!/^\d+\.\d+\.\d+/.test(version)) return;
		const body = text.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : text.length).trim();
		const parts = body.split(/^### /m);
		const lead = parts.shift().trim();
		const groups = parts.map((p) => {
			const [name, ...rest] = p.split('\n');
			const items = [];
			for (const line of rest) {
				if (/^\s*[-*] /.test(line)) items.push(line.replace(/^\s*[-*] /, '').trim());
				else if (line.trim() && items.length) items[items.length - 1] += ` ${line.trim()}`;
			}
			return { name: name.trim(), items };
		}).filter((g) => g.items.length);
		if (!groups.length && !lead) return;
		const first = groups[0]?.items[0] ?? '';
		const headline = lead.split('\n\n')[0].replace(/\n/g, ' ').trim();
		releases.push({ version, date: h[2] ?? '', lead, headline, title: (plain(headline) || clip(plain(first).split(/(?<=\.)\s/)[0], 90)).replace(/\.$/, ''), groups });
	});
	return releases;
}

function card(r, base, { latest = false, full = false, root = '../', docsDir = '' } = {}) {
	const count = r.groups.reduce((n, g) => n + g.items.length, 0);
	const pills = r.groups.map((g) => { const k = KINDS[g.name] ?? { label: g.name, cls: 'changed' }; return `<span class="cl-pill ${k.cls}"><span class="t">${g.items.length} ${esc(k.label.toLowerCase())}</span></span>`; }).join('');
	const groups = r.groups.map((g) => {
		const k = KINDS[g.name] ?? { label: g.name, cls: 'changed' };
		return `<section class="cl-group ${k.cls}"><h3><span class="cl-tag"><span class="t">${esc(k.label)}</span></span></h3><ul>${g.items.map((it) => `<li>${guideLinks(inline(it), root)}</li>`).join('')}</ul></section>`;
	}).join('');
	const more = r.lead.split('\n\n').slice(1).map((p) => `<p>${guideLinks(inline(p), root)}</p>`).join('');
	const guides = guidesOf(r, docsDir);
	const guideRow = guides.length ? `<div class="cl-guides"><span class="cl-guides-label">In the guide</span>${guides.map((g) => `<a class="cl-guide" href="${root}docs/${g.page === 'README' ? '' : `${g.page}.html`}">${BOOK}<span class="t">${esc(g.title)}</span></a>`).join('')}</div>` : '';
	const link = `${base}${r.version}/`;
	return `<article class="cl-release${latest ? ' is-latest' : ''}" id="v${esc(r.version)}">
	<header class="cl-head">
		<div class="cl-meta">
			<a class="cl-version" href="${link}"><span class="t">${esc(r.version)}</span></a>
			${latest ? '<span class="cl-latest"><span class="t">Latest</span></span>' : ''}
			${r.date ? `<time datetime="${r.date}"><span class="t">${longDate(r.date)}</span></time>` : ''}
		</div>
		<h2>${full ? '' : `<a href="${link}">`}${r.headline ? inline(r.headline) : esc(r.title)}${full ? '' : '</a>'}</h2>
		${more}
		${guideRow}
		<div class="cl-pills">${pills}<button class="cl-copy" type="button" data-url="${SITE}changelog/${r.version}/" aria-label="Copy a link to ${esc(r.version)}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg><span>Copy link</span></button></div>
	</header>
	<div class="cl-body${!full && count > 6 ? ' is-folded' : ''}">${groups}${!full && count > 6 ? `<a class="cl-more" href="${link}">Read all ${count} changes</a>` : ''}</div>
</article>`;
}

const D20 = `<svg width="0" height="0" class="defs" aria-hidden="true"><defs><linearGradient id="ember" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb259"/><stop offset=".55" stop-color="#ff6a1f"/><stop offset="1" stop-color="#d9400f"/></linearGradient><symbol id="d20" viewBox="0 0 100 100"><path d="M50 2 93 27V73L50 98 7 73V27Z" fill="url(#ember)"/><path d="M50 2 7 27 50 24Z" fill="#fff" opacity=".28"/><path d="M50 2 50 24 93 27Z" fill="#fff" opacity=".12"/><path d="M7 27 19 71 50 24Z" fill="#fff" opacity=".16"/><path d="M19 71 50 98 81 71Z" fill="#000" opacity=".2"/><path d="M81 71 50 98 93 73Z" fill="#000" opacity=".28"/><path d="M50 2 93 27V73L50 98 7 73V27ZM50 24 19 71H81ZM50 2V24M7 27 50 24 93 27M7 27 19 71 7 73M93 27 81 71 93 73M19 71 50 98 81 71" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="1.6" stroke-linejoin="round"/></symbol></defs></svg>`;
const LOGO = '<svg class="logo-mark" aria-hidden="true"><use href="#d20"/></svg><span>Ember <b>Vault</b></span>';

function page({ base, root, title, description, canonical, ogTitle, image, main, v }) {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${esc(title)}</title>
	<meta name="description" content="${esc(description)}">
	<link rel="canonical" href="${canonical}">
	<link rel="alternate" type="application/atom+xml" title="Ember Vault releases" href="${SITE}changelog/feed.xml">
	<meta property="og:type" content="article">
	<meta property="og:site_name" content="Ember Vault">
	<meta property="og:url" content="${canonical}">
	<meta property="og:title" content="${esc(ogTitle)}">
	<meta property="og:description" content="${esc(description)}">
	<meta property="og:image" content="${SITE}images/${image}">
	<meta property="og:image:width" content="1200">
	<meta property="og:image:height" content="800">
	<meta name="twitter:card" content="summary_large_image">
	<meta name="theme-color" content="#ff6a1f">
	<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
	<link rel="preload" href="${root}fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin>
	<link rel="preload" href="${root}fonts/figtree.woff2" as="font" type="font/woff2" crossorigin>
	<link rel="stylesheet" href="${root}docs-assets/docs.css?v=${v.css}">
	<link rel="stylesheet" href="${root}docs-assets/changelog.css?v=${v.cl}">
	<script src="${root}embers.js?v=${v.embers}" defer></script>
	<script src="${root}docs-assets/changelog.js?v=${v.js}" defer></script>
</head>
<body class="cl-page">
	${D20}
	<a class="skip" href="#content">Skip to content</a>
	<header class="dnav">
		<div class="dnav-inner">
			<a class="logo" href="${root}" aria-label="Ember Vault home">${LOGO}</a>
			<nav class="dnav-links" aria-label="Site">
				<a href="${root}#features">Features</a>
				<a href="${root}#sample">Sample adventure</a>
				<a href="${root}docs/">Guide</a>
				<a href="${base}" class="is-active">Changelog</a>
				<a href="${REPO}" rel="noopener">GitHub</a>
			</nav>
			<a class="btn btn-ember btn-sm cl-get" href="${root}#install">Get it free</a>
		</div>
	</header>
	<main id="content" tabindex="-1">${main}</main>
	<footer class="foot">
		<div class="foot-inner">
			<div>
				<a class="logo" href="${root}" aria-label="Ember Vault home">${LOGO}</a>
				<p class="support">Free for anyone who owns the books, is trying Nimble out, or can't afford it right now. If you enjoy Nimble and you're able, please buy the official books at <a href="https://nimbleRPG.com">nimbleRPG.com</a>.</p>
			</div>
			<nav class="foot-links" aria-label="Project links">
				<a href="${REPO}" rel="noopener">Source on GitHub</a>
				<a href="${root}docs/">User guide</a>
				<a href="${SITE}changelog/feed.xml">Release feed</a>
				<a href="${REPO}/issues" rel="noopener">Report a bug</a>
			</nav>
		</div>
		<div class="foot-inner legal">
			<p>Ember Vault is an independent product published under the Nimble 3rd Party Creator License. Nimble TTRPG © Nimble Co. Nimble text is included with permission. Not affiliated with or endorsed by Nimble Co. or Obsidian (Dynalist Inc.).</p>
		</div>
	</footer>
</body>
</html>
`;
}

/** Each release's share image: the screenshot of what it brought, when there is one. */
const IMAGES = [
	[/builder|monster, spell/i, 'builder.png'],
	[/quest/i, 'quest.png'],
	[/compendium/i, 'compendium.png'],
	[/character sheet|player campaign/i, 'character-sheet.png'],
	[/dice/i, 'tracker.png'],
];

export function buildChangelog({ root, out }) {
	const releases = parseChangelog(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'));
	const dir = join(out, 'changelog');
	mkdirSync(dir, { recursive: true });
	const hash = (f) => createHash('sha1').update(readFileSync(join(root, 'site/docs-assets', f))).digest('hex').slice(0, 8);
	const v = { css: hash('docs.css'), cl: hash('changelog.css'), js: hash('changelog.js'), embers: createHash('sha1').update(readFileSync(join(root, 'site/embers.js'))).digest('hex').slice(0, 8) };
	const imageFor = (r) => {
		const found = IMAGES.find(([re]) => re.test(r.headline));
		const file = found?.[1];
		try { if (file) { readFileSync(join(root, 'docs/images', file)); return file; } } catch { /* not taken yet */ }
		return 'tracker.png';
	};
	const latest = releases[0];

	const docsDir = join(root, 'docs');
	const list = releases.map((r, i) => card(r, '', { latest: i === 0, root: '../', docsDir })).join('\n');
	const toc = releases.map((r) => `<li><a href="#v${esc(r.version)}"><b>${esc(r.version)}</b><span>${r.date ? longDate(r.date) : ''}</span></a></li>`).join('');
	const indexMain = `
	<section class="cl-hero" data-embers>
		<div class="cl-wrap">
			<p class="cl-kicker">Changelog</p>
			<h1>What's new in Ember Vault</h1>
			<p class="cl-lede">Every release, newest first. Obsidian keeps the plugin up to date; here's what each update brought.</p>
			<div class="cl-hero-links"><a class="btn btn-ember" href="${latest ? `${latest.version}/` : '#'}">Read ${latest ? esc(latest.version) : 'the latest'}</a><a class="cl-feed" href="feed.xml" title="Add this link to a feed reader or a Discord feed bot to hear about new releases"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>RSS feed</a></div>
		</div>
	</section>
	<div class="cl-wrap cl-layout">
		<nav class="cl-toc" aria-label="Releases"><p>Releases</p><ul>${toc}</ul></nav>
		<div class="cl-list">${list}</div>
	</div>`;
	writeFileSync(join(dir, 'index.html'), page({
		base: './', root: '../', v,
		title: "What's new · Ember Vault changelog",
		ogTitle: "What's new in Ember Vault",
		description: latest ? `Latest: ${latest.version}, ${latest.title}. Every Ember Vault release for Nimble GMs in Obsidian, newest first.` : 'Every Ember Vault release, newest first.',
		canonical: `${SITE}changelog/`, image: latest ? imageFor(latest) : 'tracker.png', main: indexMain,
	}));

	releases.forEach((r, i) => {
		const newer = releases[i - 1], older = releases[i + 1];
		const items = r.groups.flatMap((g) => g.items).map(plain);
		const description = clip(r.headline ? `${plain(r.headline)} ${items[0] ?? ''}` : items.join(' '), 200);
		const pager = (q, rel, label) => (q ? `<a class="pager-${rel}" href="../${q.version}/" rel="${rel}"><small>${label}</small><b>${esc(q.version)}: ${esc(q.title)}</b></a>` : '<span></span>');
		const main = `
	<div class="cl-wrap cl-single">
		<a class="cl-back" href="../">← All releases</a>
		${card(r, '../', { latest: i === 0, full: true, root: '../../', docsDir })}
		<p class="cl-cta">${i === 0 ? 'Obsidian installs updates for you. Not using Ember Vault yet? ' : ''}<a href="../../#install">${i === 0 ? 'Get it free' : 'Get the latest version'}</a> · <a href="${REPO}/releases/tag/${r.version}" rel="noopener">GitHub release</a> · <a href="../../docs/">User guide</a></p>
		<nav class="pager" aria-label="Newer and older releases">${pager(older, 'prev', 'Older')}${pager(newer, 'next', 'Newer')}</nav>
	</div>`;
		mkdirSync(join(dir, r.version), { recursive: true });
		writeFileSync(join(dir, r.version, 'index.html'), page({
			base: '../', root: '../../', v,
			title: `Ember Vault ${r.version}: ${r.title}`,
			ogTitle: `Ember Vault ${r.version}: ${r.title}`,
			description, canonical: `${SITE}changelog/${r.version}/`, image: imageFor(r), main,
		}));
	});

	const updated = latest?.date ? `${latest.date}T12:00:00Z` : new Date().toISOString();
	const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<title>Ember Vault releases</title>
	<link href="${SITE}changelog/"/>
	<link rel="self" href="${SITE}changelog/feed.xml"/>
	<id>${SITE}changelog/</id>
	<updated>${updated}</updated>
${releases.slice(0, 30).map((r) => `	<entry>
		<title>${esc(`${r.version}: ${r.title}`)}</title>
		<link href="${SITE}changelog/${r.version}/"/>
		<id>${SITE}changelog/${r.version}/</id>
		<updated>${r.date || updated.slice(0, 10)}T12:00:00Z</updated>
		<author><name>Ember Vault</name></author>
		<content type="html">${esc(r.groups.map((g) => `<h3>${esc((KINDS[g.name] ?? { label: g.name }).label)}</h3><ul>${g.items.map((it) => `<li>${inline(it).replace(/href="docs\/([\w-]+)\.md/g, `href="${SITE}docs/$1.html`)}</li>`).join('')}</ul>`).join(''))}</content>
	</entry>`).join('\n')}
</feed>
`;
	writeFileSync(join(dir, 'feed.xml'), feed);

	// buildDocs() writes _site/sitemap.xml first; add the changelog's pages to it.
	try {
		const map = join(out, 'sitemap.xml');
		const urls = [`\t<url><loc>${SITE}changelog/</loc><lastmod>${latest?.date ?? updated.slice(0, 10)}</lastmod></url>`, ...releases.map((r) => `\t<url><loc>${SITE}changelog/${r.version}/</loc>${r.date ? `<lastmod>${r.date}</lastmod>` : ''}</url>`)].join('\n');
		writeFileSync(map, readFileSync(map, 'utf8').replace(/(\s*)<\/urlset>/, `\n${urls}$1</urlset>`));
	} catch { /* no sitemap yet */ }
	console.log(`changelog: ${releases.length} releases`);
	return releases;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const root = join(dirname(fileURLToPath(import.meta.url)), '..');
	cpSync(join(root, 'site/docs-assets'), join(root, '_site/docs-assets'), { recursive: true });
	buildChangelog({ root, out: join(root, '_site') });
}
