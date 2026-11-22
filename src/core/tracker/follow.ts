// One tracker panel, following the campaign. Each game has its own tracker view; when the
// active campaign changes, an open tracker turns into the new campaign's game's tracker in
// the same place (each campaign's fight comes back with it: GameSystem.campaignState).

import { Menu, WorkspaceLeaf } from 'obsidian';
import type EmberVaultPlugin from '../../../main';

/** Every game's tracker view type. */
function trackerTypes(plugin: EmberVaultPlugin): string[] {
	return plugin.systems.all().map(s => s.trackerView).filter((t): t is string => !!t);
}

/** Where a tracker can be: a tab in the main area (or a window of its own), or a sidebar. */
export type TrackerPlace = 'tab' | 'side';

/** A leaf in the left or right sidebar (not the main area or a popout window). */
export function inSidebar(plugin: EmberVaultPlugin, leaf: WorkspaceLeaf): boolean {
	const root = leaf.getRoot();
	return root === plugin.app.workspace.leftSplit || root === plugin.app.workspace.rightSplit;
}

/**
 * Show the tracker of view `type`: the one already in that place (any place, with none given), else another game's
 * tracker there turned into this one, else a new one: a tab in the main area, or the right sidebar. A tracker in a tab
 * and one in the sidebar can both be open; they show the same fight.
 */
export async function openTrackerLeaf(plugin: EmberVaultPlugin, type: string, place?: TrackerPlace, focus = true): Promise<WorkspaceLeaf | null> {
	const ws = plugin.app.workspace;
	const fits = (l: WorkspaceLeaf) => !place || (place === 'side') === inSidebar(plugin, l);
	const open = trackerTypes(plugin).flatMap(t => ws.getLeavesOfType(t)).filter(fits);
	let leaf: WorkspaceLeaf | null = open.find(l => l.view.getViewType() === type) ?? open[0] ?? null;
	if (leaf && leaf.view.getViewType() !== type) await leaf.setViewState({ type, active: focus });
	if (!leaf) {
		leaf = place === 'tab' ? ws.getLeaf('tab') : ws.getRightLeaf(false);
		if (!leaf) return null;
		await leaf.setViewState({ type, active: focus });
	}
	if (focus) {
		await ws.revealLeaf(leaf);
		// A tab is a page you go to: in front, like any note you open.
		if (!inSidebar(plugin, leaf)) ws.setActiveLeaf(leaf, { focus: true });
	}
	return leaf;
}

/** A tracker's own menu: open it in a tab when it's in a sidebar, or in the sidebar when it's in a tab. */
export function addPlaceItems(menu: Menu, plugin: EmberVaultPlugin, leaf: WorkspaceLeaf, type: string): void {
	if (inSidebar(plugin, leaf)) menu.addItem(i => i.setTitle('Open in a tab').setIcon('panel-top-open').onClick(() => void openTrackerLeaf(plugin, type, 'tab')));
	else menu.addItem(i => i.setTitle('Open in the sidebar').setIcon('panel-right').onClick(() => void openTrackerLeaf(plugin, type, 'side')));
}

/** An open tracker of any game, to reuse rather than opening a second panel. */
export function anyTrackerLeaf(plugin: EmberVaultPlugin): WorkspaceLeaf | null {
	for (const type of trackerTypes(plugin)) {
		const leaf = plugin.app.workspace.getLeavesOfType(type)[0];
		if (leaf) return leaf;
	}
	return null;
}

/** Turn open trackers into the active campaign's game's tracker. */
export async function followCampaign(plugin: EmberVaultPlugin): Promise<void> {
	const target = plugin.system().trackerView;
	if (!target) return;
	for (const type of trackerTypes(plugin)) {
		if (type === target) continue;
		for (const leaf of plugin.app.workspace.getLeavesOfType(type)) await leaf.setViewState({ type: target, active: false });
	}
}

export function registerTrackerFollow(plugin: EmberVaultPlugin): void {
	plugin.registerEvent(plugin.events.on('active-campaign-changed', () => { void followCampaign(plugin); }));
}
