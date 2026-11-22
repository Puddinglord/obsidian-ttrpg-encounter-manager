// Game-surface icons (core/icons.ts): every name draws something, aliases included.
import { describe, expect, it, vi } from 'vitest';

const added = new Map<string, string>();
vi.mock('obsidian', async (orig) => ({ ...(await orig<object>()), addIcon: (id: string, svg: string) => { added.set(id, svg); } }));

describe('Phosphor icons', () => {
	it('registers every name with real path data, an alias ("swords" is "attack") with its target’s', async () => {
		const { registerIcons, evIcon, damageIcon } = await import('../src/core/icons');
		const { PHOSPHOR_BOLD } = await import('../src/core/icons-data');
		registerIcons();
		for (const name of Object.keys(PHOSPHOR_BOLD)) {
			const svg = added.get(evIcon(name as keyof typeof PHOSPHOR_BOLD));
			expect(svg, name).toMatch(/<path /);
			expect(svg, name).not.toMatch(/>@/);
		}
		expect(added.get(evIcon('swords'))).toBe(added.get(evIcon('attack')));
		expect(damageIcon('Bludgeoning')).toEqual({ icon: 'ev-dmg-bludgeoning', label: 'Bludgeoning damage' });
	});
});
