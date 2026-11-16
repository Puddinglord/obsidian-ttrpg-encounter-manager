// Campaign pages open in reading view. Characters, chapters, scenes, NPCs,
// places, quests, maps and handouts are read far more than they're edited, and the
// sheet, cards and blocks look their best there. Editing is one click on
// Obsidian's own edit toggle. Session logs are written at the table, so they
// open however Obsidian would open them, and so does a note you just made.

import { MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { opensInReading } from './campaign-model';

/** A note made this recently is being written, not read. */
const FRESH_MS = 15_000;

/**
 * Campaign notes show their properties as a row of tags in reading view
 * (Ancestry Human · Status alive…) instead of Obsidian's form. The class goes
 * on the tab; styles.css does the rest, and Live Preview keeps the form for editing.
 */
function tagProperties(plugin: NimbleStatblocksPlugin): void {
	for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) continue;
		const inCampaign = !!view.file && !!plugin.campaigns.of(view.file.path);
		const on = inCampaign && plugin.settings.tagProperties;
		view.containerEl.toggleClass('nimble-props-tags', on);
		watchEmptyProperties(view, on);
	}
}

/** The reading views whose empty properties are being kept hidden. */
const watching = new WeakMap<MarkdownView, MutationObserver>();

/**
 * A property left empty stays out of the row of tags. Obsidian draws the properties whenever
 * the page renders, so the reading view is watched and each empty one is marked for styles.css.
 */
function watchEmptyProperties(view: MarkdownView, on: boolean): void {
	const current = watching.get(view);
	if (!on) {
		current?.disconnect();
		watching.delete(view);
		return;
	}
	if (current) return;
	const reading = view.containerEl.querySelector<HTMLElement>('.markdown-reading-view');
	if (!reading) return;
	const mark = () => {
		reading.querySelectorAll<HTMLElement>('.metadata-property').forEach((el) => {
			const value = el.querySelector('.metadata-property-value');
			const text = value?.querySelector('.metadata-input-longtext');
			el.toggleClass('nimble-prop-empty', !!value && (!value.hasChildNodes() || (!!text && !text.hasChildNodes())));
		});
	};
	// Only nodes coming and going are watched, so marking (a class change) doesn't wake it again.
	const observer = new MutationObserver(mark);
	observer.observe(reading, { childList: true, subtree: true });
	watching.set(view, observer);
	mark();
}

export function registerReadingMode(plugin: NimbleStatblocksPlugin): void {
	const app = plugin.app;
	const tag = () => tagProperties(plugin);
	plugin.registerEvent(app.workspace.on('layout-change', tag));
	plugin.registerEvent(app.workspace.on('file-open', tag));
	plugin.registerEvent(plugin.campaigns.on('changed', tag));
	app.workspace.onLayoutReady(tag);
	// The page each tab last showed: coming back to the same tab (or Obsidian
	// re-firing file-open) leaves the mode the user picked alone.
	const shown = new WeakMap<WorkspaceLeaf, string>();
	const created = new Map<string, number>();
	// Obsidian reports every file as created while a vault loads, so only notes made after that count as new.
	app.workspace.onLayoutReady(() => {
		plugin.registerEvent(app.vault.on('create', (f) => { if (f instanceof TFile) created.set(f.path, Date.now()); }));
	});

	// A page opened from the Campaign panel leaves the panel focused, so the tab showing it is looked up
	// rather than assumed to be the active one.
	plugin.registerEvent(app.workspace.on('file-open', (file) => {
		if (!file) return;
		for (const leaf of app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || view.file?.path !== file.path) continue;
			if (shown.get(leaf) === file.path) continue;
			shown.set(leaf, file.path);
			if (!plugin.settings.readingView || view.getMode() === 'preview') continue;
			const born = created.get(file.path);
			if (born !== undefined && Date.now() - born < FRESH_MS) continue;
			if (!plugin.campaigns.of(file.path)) continue;
			const fm = (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
			if (!opensInReading(fm, !!plugin.campaigns.chapterOf(file.path))) continue;
			// Obsidian is still finishing the open (and would set its default mode back), so switch just after.
			window.setTimeout(() => {
				if (!(leaf.view instanceof MarkdownView) || leaf.view.file?.path !== file.path || leaf.view.getMode() === 'preview') return;
				const state = leaf.getViewState();
				void leaf.setViewState({ ...state, state: { ...state.state, mode: 'preview' } });
			}, 30);
		}
	}));
}
