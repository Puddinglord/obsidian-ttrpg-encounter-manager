// All of Obsidian in the active campaign's game: <body> gets `ev-theme-<id>` (in every window), and styles.css
// gives Obsidian's own variables that game's colours and headings (GAME TOKENS, then "The whole app in the active
// campaign's game"). Notes, sidebars, tabs and dialogs wear it; a game's own surfaces keep `.ev-sys-<id>` on top.
// Off (settings.appLook) or with no active campaign, Obsidian is left as your theme draws it.

import type EmberVaultPlugin from '../../main';

const PREFIX = 'ev-theme-';

/** The game whose look the app wears now, or null. */
export function appLookGame(plugin: EmberVaultPlugin): string | null {
	const active = plugin.campaigns.active;
	if (!plugin.settings.appLook || !active) return null;
	return plugin.system(active.home.path).id;
}

/** Put the look on one window's body (or take it off). */
function dress(doc: Document, game: string | null): void {
	const body = doc.body;
	for (const c of Array.from(body.classList)) if (c.startsWith(PREFIX)) body.classList.remove(c);
	if (game) body.classList.add(`${PREFIX}${game}`);
}

/** Keep every window in the active campaign's game: now, when the campaign or the setting changes, and in new windows. */
export function registerAppLook(plugin: EmberVaultPlugin): () => void {
	const docs = (): Document[] => {
		const all = new Set<Document>([plugin.app.workspace.containerEl.ownerDocument]);
		plugin.app.workspace.iterateAllLeaves(l => { all.add(l.view.containerEl.ownerDocument); });
		return [...all];
	};
	const apply = () => { const game = appLookGame(plugin); for (const d of docs()) dress(d, game); };
	plugin.app.workspace.onLayoutReady(apply);
	plugin.registerEvent(plugin.events.on('active-campaign-changed', apply));
	// At startup (and just after a campaign is made) the active one is only known once the campaigns are indexed.
	plugin.registerEvent(plugin.campaigns.on('changed', apply));
	plugin.registerEvent(plugin.app.workspace.on('window-open', (win) => dress(win.doc, appLookGame(plugin))));
	plugin.register(() => { for (const d of docs()) dress(d, null); });
	return apply;
}
