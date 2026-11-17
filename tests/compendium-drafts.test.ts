import { afterEach, describe, expect, it } from 'vitest';
import { bundledCompendium, compendiumFor, setCompendiumDrafts } from '../src/systems/nimble/compendium-data';
import { readCharacter } from '../src/systems/nimble/character-def';

describe('expansion drafts turned off', () => {
	afterEach(() => setCompendiumDrafts(true));

	it('hides draft classes from everyone who does not play one', () => {
		setCompendiumDrafts(false);
		expect(bundledCompendium().classByName('Manawright')).toBeUndefined();
		expect(compendiumFor('Berserker')).toBe(bundledCompendium());
		expect(compendiumFor('')).toBe(bundledCompendium());
	});

	it('a hero who plays a draft class keeps their whole sheet', () => {
		setCompendiumDrafts(true);
		const fm = { nimble: 'character', class: 'Manawright', level: 3, str: 2, dex: 1, int: 2, wil: 0 };
		const before = readCharacter(fm, compendiumFor(fm.class), 'Vess');
		setCompendiumDrafts(false);
		const comp = compendiumFor(fm.class);
		expect(comp.classByName('Manawright')).toBeDefined();
		const after = readCharacter(fm, comp, 'Vess');
		expect(after.cls?.name).toBe('Manawright');
		expect(after.hitDie).toBe(before.hitDie);
		expect(after.hpMax).toBe(before.hpMax);
		expect(after.features.map(f => f.name)).toEqual(before.features.map(f => f.name));
		expect(after.resources.map(r => r.name)).toEqual(before.resources.map(r => r.name));
	});
});
