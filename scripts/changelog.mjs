// CHANGELOG.md, kept the Keep a Changelog way (https://keepachangelog.com): you add to the
// "## [Unreleased]" section as you go, under ### Added / ### Changed / ### Fixed, and a release
// moves it under its version and date.
//
//   node scripts/changelog.mjs release <version> [--date YYYY-MM-DD] [--fallback "text"] [--out notes.md]
//       Moves Unreleased under "## [<version>] - <date>" (a fresh empty Unreleased stays on top),
//       writes CHANGELOG.md, and prints the release's notes (or writes them to --out). With nothing
//       under Unreleased, --fallback becomes a one-line "### Changed" entry so a release always says something.
//   node scripts/changelog.mjs notes <version> [--out notes.md]
//       Prints the notes for a version already in CHANGELOG.md (empty if it has none).
//
// auto-release.yml runs `release` when a PR merges; release.yml runs `notes` for the GitHub release.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HEADING = /^## \[([^\]]+)\][^\n]*$/gm;

/** The body under `## [name]` (up to the next `## [`), trimmed; '' if there's no such section. */
export function sectionBody(text, name) {
	const heads = [...text.matchAll(HEADING)];
	const i = heads.findIndex(m => m[1] === name);
	if (i < 0) return '';
	const start = heads[i].index + heads[i][0].length;
	const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
	return text.slice(start, end).trim();
}

/** Does a section have anything in it besides empty "### Added"-style headings? */
export function hasEntries(body) {
	return body.split('\n').some(l => l.trim() && !/^###\s/.test(l.trim()));
}

/** Drop subsection headings with nothing under them ("### Fixed" with no bullets). */
export function dropEmptySubsections(body) {
	const parts = body.split(/(?=^### )/m);
	return parts.filter(p => !/^### /.test(p) || hasEntries(p)).join('').trim();
}

/**
 * Move Unreleased under `## [version] - date`. Returns the new changelog text and the
 * release's notes. Throws if the version is already in the changelog.
 */
export function releaseChangelog(text, version, date, fallback = '') {
	if (sectionBody(text, version) || new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(text)) {
		throw new Error(`CHANGELOG.md already has a section for ${version}`);
	}
	const unreleased = sectionBody(text, 'Unreleased');
	let notes = dropEmptySubsections(unreleased);
	if (!hasEntries(notes)) notes = fallback.trim() ? `### Changed\n\n- ${fallback.trim()}` : '';
	const heads = [...text.matchAll(HEADING)];
	const u = heads.findIndex(m => m[1] === 'Unreleased');
	const block = `## [Unreleased]\n\n## [${version}] - ${date}\n\n${notes}\n\n`;
	let out;
	if (u < 0) {
		// No Unreleased yet: the new version goes before the first version, or at the end.
		const at = heads.length ? heads[0].index : text.length;
		out = `${text.slice(0, at).trimEnd()}\n\n${block}${text.slice(at)}`;
	} else {
		const start = heads[u].index;
		const end = u + 1 < heads.length ? heads[u + 1].index : text.length;
		out = `${text.slice(0, start)}${block}${text.slice(end)}`;
	}
	return { text: `${out.trimEnd()}\n`, notes };
}

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const [cmd, version] = args;
	const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'CHANGELOG.md');
	const text = existsSync(file) ? readFileSync(file, 'utf8') : '# Changelog\n';
	const write = (notes) => { const out = flag('--out'); if (out) writeFileSync(out, `${notes}\n`); else process.stdout.write(`${notes}\n`); };
	if (cmd === 'release' && version) {
		const date = flag('--date') ?? new Date().toISOString().slice(0, 10);
		const r = releaseChangelog(text, version, date, flag('--fallback') ?? '');
		writeFileSync(file, r.text);
		write(r.notes);
	} else if (cmd === 'notes' && version) {
		write(dropEmptySubsections(sectionBody(text, version)));
	} else {
		console.error('Usage: node scripts/changelog.mjs release <version> [--date YYYY-MM-DD] [--fallback text] [--out file]\n       node scripts/changelog.mjs notes <version> [--out file]');
		process.exit(1);
	}
}
