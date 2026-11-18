// The current 5e fight, saved in the plugin's data (settings.systemData.dnd5e).
// Views never change the fight directly: they call change(), which saves and
// fires 'changed' so every open tracker redraws.

import { Events } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { Fight5e, newFight, normalizeFight } from './combat';
import type { Dnd5eEdition } from './editions';

export class FightStore extends Events {
	private cached: Fight5e | null = null;
	/** The saved object the cache was read from: when settings are re-read from disk (sync), it changes. */
	private source: unknown = undefined;

	constructor(private plugin: EmberVaultPlugin) {
		super();
	}

	private get data(): Record<string, unknown> {
		const s = this.plugin.settings;
		s.systemData ??= {};
		return (s.systemData.dnd5e ??= {});
	}

	get fight(): Fight5e {
		const saved = this.data.fight;
		// Re-read when the saved fight was replaced or removed under us (settings reloaded after a sync).
		if (!this.cached || (saved !== this.source && saved !== this.cached)) {
			this.cached = normalizeFight(saved) ?? newFight();
			this.source = saved;
		}
		return this.cached;
	}

	/** Change the fight, save it, and redraw every tracker. */
	change<T>(fn: (f: Fight5e) => T): T {
		const result = fn(this.fight);
		this.data.fight = this.source = this.fight;
		void this.plugin.saveSettings();
		this.trigger('changed');
		this.plugin.events.trigger('combat-changed');
		return result;
	}

	/** A fresh fight (the old one is dropped). */
	reset(name: string, edition: Dnd5eEdition, sourcePath?: string): Fight5e {
		// Saved and cached together, so a fight re-read from disk can't come back in its place.
		const fight = { ...newFight(name, edition), sourcePath };
		this.cached = fight;
		this.data.fight = this.source = fight;
		return this.change(f => f);
	}

}
