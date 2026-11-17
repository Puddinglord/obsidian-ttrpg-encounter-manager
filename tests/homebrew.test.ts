import { describe, expect, it } from 'vitest';
import { itemBlockSource, itemForCompendium, parseItemBlock, parseSpellBlock, readTier, spellBlockSource } from '../src/homebrew-def';
import { bundledCompendium, setHomebrew } from '../src/compendium-data';
import { extractNimbleBlocks } from '../src/parser';
import { replaceEncounterBlock } from '../src/encounter-def';

const LASH = `name: Ember Lash
school: Fire
tier: 1
actions: 2
range: Range 8
damage: 3d6+4
upcast: +5 damage.
text: A whip of flame cracks across one target.
On a crit, it's Smoldering.`;

describe('homebrew spells', () => {
	it('reads a spell block, rules text running to the end', () => {
		expect(parseSpellBlock(LASH)).toEqual({
			name: 'Ember Lash', school: 'Fire', tier: 1, actions: '2 Actions', range: 'Range 8', damage: '3d6+4', higherLevels: '+5 damage.',
			text: 'A whip of flame cracks across one target.\nOn a crit, it\'s Smoldering.', source: 'Homebrew',
		});
	});

	it('round-trips, and reads tiers written several ways', () => {
		const s = parseSpellBlock(LASH)!;
		expect(parseSpellBlock(spellBlockSource(s))).toEqual({ ...s, text: s.text });
		expect([readTier('cantrip'), readTier('Tier 3'), readTier('12'), readTier(undefined)]).toEqual([0, 3, 9, 0]);
		expect(parseSpellBlock('school: Fire')).toBeNull();
	});
});

describe('homebrew items', () => {
	it('reads an item block, with properties as a list and charges kept apart', () => {
		const it = parseItemBlock('name: Lantern of Echoes\ncategory: Magic\nrarity: Rare\ncharges: 3\ncost: 800 gp\nproperties: Light, Fragile\ntext: Replays the last minute of sound.')!;
		expect(it).toMatchObject({ name: 'Lantern of Echoes', category: 'magic', rarity: 'rare', charges: '3', cost: '800 gp', properties: ['Light', 'Fragile'] });
		expect(itemForCompendium(it).text).toBe('**Charges:** 3. Replays the last minute of sound.');
		expect(parseItemBlock(itemBlockSource(it))).toEqual(it);
	});
});

describe('homebrew in the compendium', () => {
	it('joins the compendium, and a note named like a book entry replaces it', () => {
		const note = `# Homebrew\n\n\`\`\`nimble-spell\n${LASH}\n\`\`\`\n\n\`\`\`nimble-item\nname: Dagger\ncategory: weapon\ndamage: 1d6\ntext: A better dagger.\n\`\`\``;
		const spells = extractNimbleBlocks(note, 'nimble-spell').map(b => parseSpellBlock(b)!);
		const items = extractNimbleBlocks(note, 'nimble-item').map(b => parseItemBlock(b)!);
		const bookDagger = bundledCompendium().item('Dagger')!.damage;
		setHomebrew({ spells, items });
		try {
			expect(bundledCompendium().spell('Ember Lash')?.damage).toBe('3d6+4');
			expect(bundledCompendium().item('Dagger')?.text).toBe('A better dagger.');
			expect(bundledCompendium().search('ember lash', ['spell'])[0]?.detail).toBe('Fire · Tier 1 · 2 Actions · Range 8 · 3d6+4');
			// Listed once: the book's Dagger steps aside.
			expect(bundledCompendium().all().filter(h => h.kind === 'item' && h.name === 'Dagger')).toHaveLength(1);
		} finally {
			setHomebrew({ spells: [], items: [] });
		}
		expect(bundledCompendium().spell('Ember Lash')).toBeUndefined();
		expect(bundledCompendium().item('Dagger')?.damage).toBe(bookDagger);
	});
});

describe('Edit writing a homebrew block back', () => {
	it('lengthens the fences when the new text has a ``` line, and leaves them alone otherwise', () => {
		const note = 'Intro\n\n```nimble-spell\nname: Zap\ntext: Old.\n```\n\nAfter';
		const plain = replaceEncounterBlock(note, 2, 5, 'name: Zap\ntext: Old.', 'name: Zap\ntext: New.', 'nimble-spell')!;
		expect(plain).toBe('Intro\n\n```nimble-spell\nname: Zap\ntext: New.\n```\n\nAfter');
		const fenced = replaceEncounterBlock(note, 2, 5, 'name: Zap\ntext: Old.', 'name: Zap\ntext: Say\n```\nthis', 'nimble-spell')!;
		expect(fenced).toBe('Intro\n\n````nimble-spell\nname: Zap\ntext: Say\n```\nthis\n````\n\nAfter');
		expect(extractNimbleBlocks(fenced, 'nimble-spell')).toEqual(['name: Zap\ntext: Say\n```\nthis']);
	});
});
