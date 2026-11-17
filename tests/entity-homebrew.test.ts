import { describe, expect, it } from 'vitest';
import { itemForCompendium, parseItemBlock, parseSpellBlock, unreadLines } from '../src/homebrew-def';
import { applyItemFix, applySpellFix, autoTier, fromItem, fromSpell, itemNotes, itemSource, newItemDraft, newSpellDraft, spellNotes, spellSource, suggestedCost, tierCheck, toItem, toSpell } from '../src/entity-homebrew';

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

describe('spell and item review notes', () => {
	it('suggests a drawback (or a lower tier) for a spell that hits too hard, and no save on cantrips', () => {
		const d = { ...newSpellDraft(), name: 'Big', damage: '4d10+10' };
		const warn = spellNotes(d).find(n => n.tone === 'warn')!;
		expect(warn.text).toMatch(/averages 32 damage, more than a tier 1 spell \(14\)\. The Creator's Kit: give it a drawback/);
		expect(applySpellFix(d, warn.fixes[0].fix).tier).toBe(3);
		expect(spellNotes({ ...newSpellDraft(), name: 'Zap', tier: 0, save: 'DEX' }).some(n => /Cantrips shouldn't ask for a save/.test(n.text))).toBe(true);
	});

	it('asks a magic item for its effect and its catch, and checks the price', () => {
		const notes = itemNotes({ ...newItemDraft('weapon'), name: 'Blade', damage: '1d8', cost: '900 gp' });
		const price = notes.find(n => /Priced at 900 gp/.test(n.text))!;
		expect(applyItemFix(newItemDraft('weapon'), price.fixes[0].fix).cost).toBe('30 gp');
		expect(itemNotes({ ...newItemDraft('magic'), name: 'Orb' }).map(n => n.tone)).toEqual(['warn', 'tip']);
	});
});

describe('Edit on a homebrew block', () => {
	it('keeps a spell\'s class, source and actions, range and area the controls can\'t say', () => {
		const s = parseSpellBlock('name: Ward\nschool: Wind\ntier: 1\nactions: Reaction\nrange: Touch\naoe: Sphere 2\nclass: Mage\nsource: My book\ntext: +2 armor.')!;
		expect(toSpell(fromSpell(s, true))).toMatchObject({ actions: 'Reaction', range: 'Touch', aoe: 'Sphere 2', class: 'Mage', source: 'My book' });
		// Change a control and it writes the control's value.
		expect(toSpell({ ...fromSpell(s, true), actions: 1, rangeKind: 'reach', distance: 2 })).toMatchObject({ actions: '1 Action', range: 'Reach 2', aoe: 'Sphere 2' });
	});

	it('keeps an item\'s category, subcategory, slots, range, source and a non-weapon\'s damage', () => {
		const it0 = parseItemBlock('name: Wand of Sparks\ncategory: wand\nsubcategory: arcane\nrarity: rare\nslots: 1\nrange: 8\nsource: Mine\ncharges: 3\ndamage: 1d6\nproperties: Light\ntext: Sparks.')!;
		const back = parseItemBlock(itemSource(fromItem(it0, true)))!;
		expect(back).toMatchObject({ category: 'wand', subcategory: 'arcane', slots: 1, range: '8', source: 'Mine', charges: '3', damage: '1d6', properties: ['Light'], text: 'Sparks.' });
		expect(toItem({ ...fromItem(it0, true), kind: 'gear' }).category).toBe('gear');
	});

	it('keeps a rarity or stat the controls can\'t say until they change', () => {
		const sword = parseItemBlock('name: Short Sword\ncategory: weapon\ndamage: 1d6\nstat: STR/DEX\nrarity: varies')!;
		expect(toItem(fromItem(sword, true))).toMatchObject({ stat: 'STR/DEX', rarity: 'varies' });
		expect(toItem({ ...fromItem(sword, true), stat: 'DEX', rarity: 'rare' })).toMatchObject({ stat: 'DEX', rarity: 'rare' });
	});

	it('takes a book item with numeric charges as a template, and a homebrew one without doubling its charges line', () => {
		const wand = { name: 'Wand of Fly', category: 'wand', charges: 3 as unknown as string, text: 'Fly.' };
		expect(toItem(fromItem(wand)).charges).toBe('3');
		const shown = itemForCompendium({ name: 'Lamp', category: 'magic', charges: '2', text: 'Glows.' });
		expect(fromItem(shown).text).toBe('Glows.');
	});

	it('leaves out damage, upcast and a price the block never had, until something they follow changes', () => {
		const s = parseSpellBlock('name: Ward\nschool: Wind\ntier: 1\ntext: +2 armor.')!;
		expect(toSpell(fromSpell(s, true))).not.toHaveProperty('damage');
		expect(toSpell(fromSpell(s, true))).not.toHaveProperty('higherLevels');
		expect(toSpell({ ...fromSpell(s, true), tier: 2 })).toHaveProperty('damage');
		const lamp = parseItemBlock('name: Lamp\ncategory: magic\nrarity: rare\ntext: Glows.')!;
		expect(toItem(fromItem(lamp, true))).not.toHaveProperty('cost');
		expect(toItem({ ...fromItem(lamp, true), rarity: 'uncommon' }).cost).toBe('50 gp');
	});

	it('counts the lines Edit would drop', () => {
		expect(unreadLines('name: Ward\nschool: Wind\nflavour: windy\njust words\ntier: 1\ntier: 2\ntext: anything: here', 'spell')).toBe(3);
		expect(unreadLines('name: Lamp\ncategory: magic\ntext: Glows.', 'item')).toBe(0);
	});
});
