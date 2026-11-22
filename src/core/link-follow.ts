// Our links follow a rename. Obsidian updates [[links]] in a note's text and in properties whose
// whole value is a link; it doesn't look inside fenced blocks or at a link among other words. So on
// a rename (a folder's too), once Obsidian's own update is done, the notes whose blocks or properties
// still name the old note are rewritten to the new name (link-rename.ts, pure). If Obsidian asked
// and was told Do not update, nothing is rewritten.

import { App, TFile, TFolder } from 'obsidian';
import type EmberVaultPlugin from '../../main';
import { afterLinkUpdates, vaultConfig, whenIndexed } from './internals';
import { linkNames, rewriteLinks, RewriteOptions } from './link-rename';

interface Moved { file: TFile; oldPath: string }

/** Every file in a folder, however deep. */
function filesIn(folder: TFolder): TFile[] {
	return folder.children.flatMap(c => (c instanceof TFile ? [c] : c instanceof TFolder ? filesIn(c) : []));
}

/**
 * Was Obsidian told Do not update? It only asks when "Automatically update internal links" is off;
 * then, once it has read the notes again, a link it tracks that still names a moved note (now going
 * nowhere) means it left its links alone. Links inside code blocks aren't among the ones it tracks.
 */
async function declined(app: App, moved: Moved[]): Promise<boolean> {
	if (vaultConfig(app, 'alwaysUpdateLinks') === true) return false;
	// Obsidian's own edits have just been written: let it read them before asking it anything.
	await new Promise(r => window.setTimeout(r, 50));
	await whenIndexed(app);
	for (const links of Object.values(app.metadataCache.unresolvedLinks)) {
		for (const link of Object.keys(links)) {
			const lp = link.split('#')[0];
			if (moved.some(m => linkNames(lp, m.oldPath))) return true;
		}
	}
	return false;
}

/** A note that may hold a link we'd rewrite: one with a code block or a link in its properties (or not indexed yet). */
function mayHoldLinks(app: App, f: TFile): boolean {
	const cache = app.metadataCache.getFileCache(f);
	if (!cache) return true;
	if (cache.sections?.some(s => s.type === 'code')) return true;
	return !!cache.frontmatter && JSON.stringify(cache.frontmatter).includes('[[');
}

/** Rewrite the links to the moved notes in every note that has one in our blocks or its properties. */
async function follow(plugin: EmberVaultPlugin, moved: Moved[]): Promise<void> {
	const app = plugin.app;
	const options = (source: string): RewriteOptions => ({
		fence: (lang) => plugin.fences.has(lang),
		target: (linkpath) => {
			// A link that still goes somewhere meant somewhere else.
			if (app.metadataCache.getFirstLinkpathDest(linkpath, source)) return undefined;
			const m = moved.find(x => linkNames(linkpath, x.oldPath));
			return m && app.vault.getFileByPath(m.file.path) ? app.metadataCache.fileToLinktext(m.file, source, true) : undefined;
		},
	});
	for (const f of app.vault.getMarkdownFiles()) {
		if (!mayHoldLinks(app, f)) continue;
		const text = await app.vault.cachedRead(f);
		if (rewriteLinks(text, options(f.path)) === text) continue;
		await app.vault.process(f, (current) => rewriteLinks(current, options(f.path)));
	}
}

export function registerLinkFollow(plugin: EmberVaultPlugin): void {
	const app = plugin.app;
	let moved: Moved[] = [];
	const add = (file: TFile, oldPath: string) => {
		if (!moved.some(m => m.file === file)) moved.push({ file, oldPath });
	};
	plugin.registerEvent(app.vault.on('rename', (f, oldPath) => {
		const first = !moved.length;
		if (f instanceof TFile) add(f, oldPath);
		// A folder: each note in it moved (Obsidian may also report them one by one; each counts once).
		else if (f instanceof TFolder) for (const c of filesIn(f)) add(c, oldPath + c.path.slice(f.path.length));
		if (!first || !moved.length) return;
		// One pass per rename (a folder's notes together), after Obsidian's own update.
		afterLinkUpdates(app, async () => {
			const batch = moved;
			moved = [];
			if (await declined(app, batch)) return;
			await follow(plugin, batch);
		});
	}));
}
