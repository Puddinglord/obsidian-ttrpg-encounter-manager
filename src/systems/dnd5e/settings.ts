// 5e's settings: kept with 5e's other data (settings.systemData.dnd5e.options), shown
// on the settings page and from the tracker's Encounter settings… (settingsSections).

import type EmberVaultPlugin from '../../../main';
import { SettingsSection, settingToggle } from '../../core/settings-ui';
import type { StartRolls } from './combat';

export interface Options5e {
	/** Start combat rolls initiative for monsters that have none. */
	rollMonsters: boolean;
	/** Start combat rolls initiative for heroes that have none (off: players say what they rolled). */
	rollHeroes: boolean;
}

const DEFAULTS: Options5e = { rollMonsters: true, rollHeroes: true };

function store(plugin: EmberVaultPlugin): Partial<Options5e> {
	const s = plugin.settings;
	s.systemData ??= {};
	const data = (s.systemData.dnd5e ??= {});
	if (!data.options || typeof data.options !== 'object') data.options = {};
	return data.options as Partial<Options5e>;
}

export function options5e(plugin: EmberVaultPlugin): Options5e {
	const o = store(plugin);
	return {
		rollMonsters: typeof o.rollMonsters === 'boolean' ? o.rollMonsters : DEFAULTS.rollMonsters,
		rollHeroes: typeof o.rollHeroes === 'boolean' ? o.rollHeroes : DEFAULTS.rollHeroes,
	};
}

export function startRolls5e(plugin: EmberVaultPlugin): StartRolls {
	const o = options5e(plugin);
	return { monsters: o.rollMonsters, heroes: o.rollHeroes };
}

export function settingsSections5e(plugin: EmberVaultPlugin): SettingsSection[] {
	const set = <K extends keyof Options5e>(k: K) => (v: Options5e[K]) => { store(plugin)[k] = v; };
	return [{ heading: '5e encounters', topic: 'encounter', rows: [
		{
			name: 'Roll monsters\' initiative when combat starts',
			desc: 'Monsters with no initiative get one when you press Start combat.',
			render: settingToggle(plugin, () => options5e(plugin).rollMonsters, set('rollMonsters')),
		},
		{
			name: 'Roll heroes\' initiative when combat starts',
			desc: 'Off: type in what your players roll. Heroes with no initiative go last until you do.',
			render: settingToggle(plugin, () => options5e(plugin).rollHeroes, set('rollHeroes')),
		},
	] }];
}
