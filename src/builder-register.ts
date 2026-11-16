// The builder's ways in that don't belong to another view: commands.

import type NimbleStatblocksPlugin from '../main';
import { EntityKind, kindAvailable, openBuilder } from './entity-builder';
import { registerMonsterBuilder } from './entity-monster-ui';

export function registerBuilders(plugin: NimbleStatblocksPlugin): void {
	registerMonsterBuilder();
	const cmd = (kind: EntityKind, name: string, icon: string) => {
		if (!kindAvailable(kind)) return;
		plugin.addCommand({ id: `new-${kind}`, name, icon, callback: () => { openBuilder(plugin, { kind }); } });
	};
	cmd('monster', 'New monster…', 'skull');
}
