// 5e's fighters as map tokens: the fight's combatants, in initiative order,
// with the stat block's hover card on monsters.

import type EmberVaultPlugin from '../../../main';
import type { CombatTokens } from '../../core/tracker/tokens';
import { initials } from '../../core/tracker/tokens';
import { isRunning, legendaryUses, order } from './combat';
import { dnd5e } from './runtime';

export function dnd5eTokens(plugin: EmberVaultPlugin): CombatTokens | null {
	const rt = dnd5e();
	const f = rt.fights.fight;
	if (!f.combatants.length) return null;
	const list = isRunning(f) ? order(f) : f.combatants;
	return {
		name: f.name || 'Fight',
		tokens: list.map(c => ({
			id: c.id,
			label: c.label,
			text: initials(c.label),
			role: c.side === 'hero' ? 'hero' : c.monster && legendaryUses(c.monster) ? 'legendary' : 'regular',
			down: c.hp <= 0 || !!c.dead,
			done: false,
			title: `${c.label}: ${c.hp}/${c.maxHp} HP${c.tempHp ? ` +${c.tempHp}` : ''}${c.conditions.length ? ` · ${c.conditions.map(x => x.name).join(', ')}` : ''}`,
			hover: c.monster ? (el) => {
				const entry = { name: c.monster!.name, filePath: c.sourceFile ?? '', monster: c.monster! };
				plugin.hover.attach(el, () => rt.hover(entry, f.sourcePath ?? ''));
			} : undefined,
		})),
	};
}
