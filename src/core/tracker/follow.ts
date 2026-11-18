// One tracker panel, following the campaign. Each game has its own tracker view; when the
// active campaign changes, an open tracker turns into the new campaign's game's tracker in
// the same place (each campaign's fight comes back with it: GameSystem.campaignState).

import { WorkspaceLeaf } from 'obsidian';
import type EmberVaultPlugin from '../../../main';

/** Every game's tracker view type. */
function trackerTypes(plugin: EmberVaultPlugin): string[] {
	return plugin.systems.all().map(s => s.trackerView).filter((t): t is string => !!t);
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
