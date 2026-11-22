// Nimble's fighters as map tokens: the active encounter's creatures, minion
// groups as how many are left, with the stat block's hover card.

import type EmberVaultPlugin from '../../../main';
import type { CombatTokens } from '../../core/tracker/tokens';
import { initials } from '../../core/tracker/tokens';
import { isDown, isHero, isMinionGroup, shownLabel } from './encounters';
import { attachMonsterHover } from './inline-ref';
import { monsterRole } from './rules';
import { nimble } from './runtime';
import type { EncounterCreature } from './types';

function title(c: EncounterCreature, name: string): string {
	if (isMinionGroup(c)) return `${name}: ${c.alive}/${c.count} standing`;
	return `${name}: ${c.currentHp}/${c.maxHp} HP${c.conditions.length ? ` · ${c.conditions.map(x => x.name).join(', ')}` : ''}`;
}

export function nimbleTokens(plugin: EmberVaultPlugin): CombatTokens | null {
	const enc = nimble().encounters.active;
	if (!enc || !enc.creatures.length) return null;
	return {
		name: enc.name,
		tokens: enc.creatures.map(c => ({ c, name: shownLabel(c, enc.creatures) })).map(({ c, name }) => ({
			id: c.id,
			label: name,
			text: isMinionGroup(c) ? `${c.alive}` : initials(name),
			role: isHero(c) ? 'hero' : monsterRole(c.monster),
			down: isDown(c),
			done: !!c.done,
			title: title(c, name),
			hover: isHero(c) ? undefined : (el) => attachMonsterHover(plugin, el, { name: c.monster.name, filePath: c.sourceFile || '', monster: c.monster, bundled: !c.sourceFile && !!c.monster.bundledId }),
		})),
	};
}
