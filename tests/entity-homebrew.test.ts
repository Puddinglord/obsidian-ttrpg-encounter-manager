import { describe, expect, it } from 'vitest';
import { parseItemBlock, parseSpellBlock } from '../src/homebrew-def';
import { autoTier, itemSource, newItemDraft, newSpellDraft, spellSource, suggestedCost, tierCheck, toItem, toSpell } from '../src/entity-homebrew';

describe('spell builder', () => {
	it('fills a tier 1 spell from the Creator\'s Kit, and the block reads back', () => {
		const d = { ...newSpellDraft(), name: 'Ember Lash' };
		expect(toSpell(d)).toEqual({ name: 'Ember Lash', school: 'Fire', tier: 1, actions: '2 Actions', range: 'Range 8', damage: '3d8', higherLevels: '+5 damage.' });
		expect(parseSpellBlock(spellSource(d))).toMatchObject({ name: 'Ember Lash', tier: 1, damage: '3d8', higherLevels: '+5 damage.' });
		expect(tierCheck(d)!.verdict).toBe(0);
	});

	it('makes cantrips that scale every 5th level, and area spells with less damage and 3 actions at range', () => {
		const c = toSpell({ ...newSpellDraft(), name: 'Spark', tier: 0 });
		expect(c).toMatchObject({ actions: '1 Action', damage: '1d10', cantripScaling: '+5 damage every 5 levels.' });
		expect(c.higherLevels).toBeUndefined();
		const blast = toSpell({ ...newSpellDraft(), name: 'Firestorm', tier: 4, area: 'cone', save: 'DEX' });
		expect(blast).toMatchObject({ actions: '3 Actions', aoe: 'Cone 4', damage: '4d8+8', text: 'DEX save for half.' });
	});

	it('says what typed damage hits like, and Auto follows it', () => {
		const d = { ...newSpellDraft(), name: 'Big', damage: '4d10+10' };
		expect(tierCheck(d)).toMatchObject({ tier: 3, verdict: 1 });
		expect(autoTier(d)).toBe(3);
		expect(tierCheck({ ...d, utility: true })).toBeNull();
	});
});

describe('item builder', () => {
	it('prices a weapon along the Core table, and a magic one at its rarity', () => {
		const sword = { ...newItemDraft('weapon'), name: 'Duelist\'s Blade', damage: '1d8', stat: 'DEX' as const, props: ['Light'] };
		expect(toItem(sword)).toMatchObject({ category: 'weapon', damage: '1d8', stat: 'DEX', properties: ['Light'], cost: '30 gp' });
		expect(suggestedCost({ ...sword, rarity: 'rare' })).toBe('530 gp');
		const lantern = { ...newItemDraft('magic'), name: 'Lantern', rarity: 'rare' as const, charges: '3', text: 'Replays sound.', catch: 'It also replays your whispers.' };
		const it = parseItemBlock(itemSource(lantern))!;
		expect(it).toMatchObject({ category: 'magic', rarity: 'rare', charges: '3', cost: '500 gp', text: 'Replays sound. **Catch:** It also replays your whispers.' });
	});
});
