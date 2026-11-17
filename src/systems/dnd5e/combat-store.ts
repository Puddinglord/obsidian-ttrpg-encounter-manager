// The current 5e fight, saved in the plugin's data (settings.systemData.dnd5e).
// Views never change the fight directly: they call change(), which saves and
// fires 'changed' so every open tracker redraws.

import { Events } from 'obsidian';
import type NimbleStatblocksPlugin from '../../../main';
import { Fight5e, newFight, normalizeFight } from './combat';
import type { Dnd5eEdition } from './editions';

export class FightStore extends Events {
	private cached: Fight5e | null = null;
	/** The saved object the cache was read from: when settings are re-read from disk (sync), it changes. */
	private source: unknown = undefined;

	constructor(private plugin: NimbleStatblocksPlugin) {
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
		return result;
	}

	/** A fresh fight (the old one is dropped). */
	reset(name: string, edition: Dnd5eEdition, sourcePath?: string): Fight5e {
		this.cached = { ...newFight(name, edition), sourcePath };
		return this.change(f => f);
	}

}
