// Keeps the user guide, the landing page and the changelog in step with the code.
//
//   node scripts/check-docs.mjs
//       Links: every relative link and image in docs/*.md, README.md and CHANGELOG.md points at a
//       file (and heading) that exists, and every guide page and screenshot the landing page links to
//       is there. Runs on every push and pull request.
//
//   node scripts/check-docs.mjs --base <git ref> [--labels '["release: minor"]']
//       A pull request's checks too, against the branch it merges into:
//       - a new entry under Unreleased → ### Added (a new feature) needs a guide change (docs/*.md)
//         and a landing page change (site/index.html, where the features bento lives).
//         Label the PR "docs: skip" or "site: skip" when one really isn't needed.
//       - plugin code that changes with nothing new under Unreleased gets a warning: the PR title
//         becomes the changelog entry.
//
// Plain Node, no dependencies, so the workflow doesn't need npm ci. See CLAUDE_CODE_GUIDE.md, "Shipping a feature".
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** GitHub-style heading ids, the same as scripts/build-docs.mjs, from a Markdown heading. */
export function slug(heading) {
	const text = heading
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/`+([^`]*)`+/g, '$1')
		.replace(/(\*\*|__|\*|_)(.+?)\1/g, '$2')
		.replace(/<[^>]+>/g, '');
	return text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

/** Heading ids in a Markdown file, with -1, -2 on repeats; code blocks are skipped. */
export function headingIds(md) {
	const ids = new Set();
	let fence = null;
	for (const line of md.split('\n')) {
		const f = /^\s*(`{3,}|~{3,})/.exec(line);
		if (f) { if (!fence) fence = f[1]; else if (line.trim().startsWith(fence)) fence = null; continue; }
		if (fence) continue;
		const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
		if (!h) continue;
		let id = slug(h[2]) || 'section';
		if (ids.has(id)) { let n = 1; while (ids.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
		ids.add(id);
	}
	return ids;
}

/** Relative links and images in Markdown (outside code), as { href, line }. */
export function markdownLinks(md) {
	const out = [];
	let fence = null;
	md.split('\n').forEach((line, i) => {
		const f = /^\s*(`{3,}|~{3,})/.exec(line);
		if (f) { if (!fence) fence = f[1]; else if (line.trim().startsWith(fence)) fence = null; return; }
		if (fence) return;
		const bare = line.replace(/`+[^`]*`+/g, '');
		for (const m of bare.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
			if (!/^(https?:|mailto:|obsidian:|#$)/.test(m[1])) out.push({ href: m[1], line: i + 1 });
		}
	});
	return out;
}

/** Problems with links in the guide, README, changelog and landing page. */
export function checkLinks(root) {
	const errors = [];
	const warnings = [];
	const ids = new Map();
	const idsOf = (file) => {
		if (!ids.has(file)) ids.set(file, existsSync(file) ? headingIds(readFileSync(file, 'utf8')) : new Set());
		return ids.get(file);
	};
	const docs = readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md'));
	const sources = [...docs.map((f) => `docs/${f}`), 'README.md', 'CHANGELOG.md'].filter((f) => existsSync(join(root, f)));

	for (const src of sources) {
		const md = readFileSync(join(root, src), 'utf8');
		for (const { href, line } of markdownLinks(md)) {
			const [path, anchor] = href.split('#');
			const target = path ? normalize(join(dirname(join(root, src)), decodeURI(path))) : join(root, src);
			if (path && !existsSync(target)) { errors.push(`${src}:${line} links to ${href}, which doesn't exist`); continue; }
			if (anchor && target.endsWith('.md') && !idsOf(target).has(anchor)) errors.push(`${src}:${line} links to ${href}, but there's no heading "#${anchor}" there`);
		}
	}

	// Every guide page should be in the index, so it shows in the right sidebar group.
	const index = readFileSync(join(root, 'docs/README.md'), 'utf8');
	for (const f of docs) if (f !== 'README.md' && !index.includes(`(${f})`)) warnings.push(`docs/${f} isn't listed in docs/README.md, so the guide's sidebar files it under Reference`);

	// The landing page: guide pages (docs/x.html#anchor → docs/x.md) and screenshots.
	const site = join(root, 'site/index.html');
	if (existsSync(site)) {
		const html = readFileSync(site, 'utf8');
		for (const m of html.matchAll(/(?:href|src)="(docs\/[\w-]*(?:\.html)?(?:#[^"]*)?|images\/[\w.-]+)"/g)) {
			const ref = m[1];
			if (ref.startsWith('images/')) {
				if (!existsSync(join(root, 'docs', ref))) errors.push(`site/index.html uses ${ref}, which isn't in docs/images/`);
				continue;
			}
			const [page, anchor] = ref.replace(/^docs\//, '').split('#');
			const md = join(root, 'docs', !page || page === 'index.html' ? 'README.md' : page.replace(/\.html$/, '.md'));
			if (!existsSync(md)) errors.push(`site/index.html links to ${ref}, but there's no ${md.slice(root.length + 1)}`);
			else if (anchor && !idsOf(md).has(anchor)) errors.push(`site/index.html links to ${ref}, but there's no heading "#${anchor}" in ${md.slice(root.length + 1)}`);
		}
	}
	return { errors, warnings };
}

/** The bullets under Unreleased, by subsection: { Added: [...], Changed: [...], ... }. */
export function unreleased(changelog) {
	const m = /^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## \[|(?![\s\S]))/m.exec(changelog ?? '');
	const out = {};
	let kind = null;
	for (const line of (m?.[1] ?? '').split('\n')) {
		const h = /^###\s+(\w+)/.exec(line);
		if (h) { kind = h[1]; out[kind] ??= []; continue; }
		if (kind && /^\s*[-*]\s+\S/.test(line)) out[kind].push(line.replace(/^\s*[-*]\s+/, '').trim());
	}
	return out;
}

/**
 * A pull request's rules. `changed` is the list of files it changes, `before` and `after` the
 * changelog on the base branch and in the PR, `labels` its label names.
 * @param {{ changed: string[], before: string, after: string, labels?: string[] }} pr
 */
export function prRules({ changed, before, after, labels = [] }) {
	const errors = [];
	const warnings = [];
	const had = new Set(Object.values(unreleased(before)).flat());
	const now = unreleased(after);
	const fresh = (kind) => (now[kind] ?? []).filter((b) => !had.has(b));
	const added = fresh('Added');
	const anyNew = Object.keys(now).some((k) => fresh(k).length);
	const docs = changed.some((f) => /^docs\/.*\.md$/.test(f));
	const landing = changed.includes('site/index.html');
	const code = changed.some((f) => /^(src|styles\.css$)/.test(f));
	const short = (b) => (b.length > 70 ? `${b.slice(0, 69)}…` : b);

	if (added.length) {
		const list = added.map((b) => `  - ${short(b)}`).join('\n');
		if (!docs && !labels.includes('docs: skip')) {
			errors.push(`This PR adds ${added.length === 1 ? 'a feature' : `${added.length} features`} to the changelog but doesn't touch the user guide:\n${list}\n  Explain ${added.length === 1 ? 'it' : 'them'} in docs/ with an example (and docs/README.md for a new page), or label the PR "docs: skip".`);
		}
		if (!landing && !labels.includes('site: skip')) {
			errors.push(`This PR adds ${added.length === 1 ? 'a feature' : 'features'} but doesn't touch the landing page.\n  Add or update its tile in the features bento (#features in site/index.html), or label the PR "site: skip" if it's too small for a tile.`);
		}
	}
	const unlinked = added.filter((b) => !/\]\(docs\/[\w-]+\.md/.test(b));
	if (unlinked.length && !labels.includes('docs: skip')) {
		warnings.push(`Link each new feature's guide page from its changelog entry (\`See the [builder guide](docs/builder.md).\`), so the changelog page can show a Guide pill:\n${unlinked.map((b) => `  - ${short(b)}`).join('\n')}`);
	}
	if (fresh('Changed').length && !docs && !labels.includes('docs: skip')) {
		warnings.push('The changelog says something works differently now. Check the user guide still describes it (docs/).');
	}
	if (code && !anyNew && !labels.includes('release: skip')) {
		warnings.push('Plugin code changed but nothing was added under "## [Unreleased]" in CHANGELOG.md, so the PR title will be the release note.');
	}
	return { errors, warnings };
}

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const root = join(dirname(fileURLToPath(import.meta.url)), '..');
	const args = process.argv.slice(2);
	const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
	const gh = !!process.env.GITHUB_ACTIONS;
	const report = (kind, msg) => console.log(gh ? `::${kind}::${msg.replace(/\n/g, '%0A')}` : `${kind === 'error' ? '✗' : '!'} ${msg}`);

	const results = [checkLinks(root)];
	const base = flag('--base');
	if (base) {
		const changed = git(root, 'diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
		let before = '';
		try { before = git(root, 'show', `${base}:CHANGELOG.md`); } catch { /* no changelog on the base yet */ }
		let labels = [];
		try { labels = JSON.parse(flag('--labels') ?? process.env.LABELS ?? '[]'); } catch { /* not JSON */ }
		results.push(prRules({ changed, before, after: readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), labels }));
	}
	const errors = results.flatMap((r) => r.errors);
	const warnings = results.flatMap((r) => r.warnings);
	warnings.forEach((w) => report('warning', w));
	errors.forEach((e) => report('error', e));
	console.log(errors.length ? `\n${errors.length} problem${errors.length === 1 ? '' : 's'}. See CLAUDE_CODE_GUIDE.md, "Shipping a feature".` : `Docs check passed${warnings.length ? ` with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}.`);
	process.exit(errors.length ? 1 : 0);
}
