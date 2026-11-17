import { describe, expect, it } from 'vitest';
import { Compendium, nameKey } from '../src/systems/nimble/compendium';
import { formatCompendiumRef, parseCompendiumRef, refForHit, resolveCompendiumRef } from '../src/systems/nimble/compendium-ref';
import BUNDLED from '../src/systems/nimble/data/compendium.json';
import { FIXTURE } from './compendium-fixture';

const real = new Compendium(BUNDLED);
const fixture = new Compendium(FIXTURE);
const resolve = (comp: Compendium, text: string) => {
	const ref = parseCompendiumRef(text);
	return ref ? resolveCompendiumRef(comp, ref) : undefined;
};

describe('parseCompendiumRef', () => {
	it('reads a kind, a name and an owner', () => {
		expect(parseCompendiumRef('spell:Flame Dart')).toEqual({ kind: 'spell', name: 'Flame Dart', owner: undefined });
		expect(parseCompendiumRef(' Feature : Blur @ Zephyr ')).toEqual({ kind: 'feature', name: 'Blur', owner: 'Zephyr' });
		expect(parseCompendiumRef('condition:Dazed')).toEqual({ kind: 'condition', name: 'Dazed', owner: undefined });
		expect(parseCompendiumRef('CLASS:Oathsworn')?.kind).toBe('class');
	});

	it('treats a bare name, or a leading word that is not a kind, as the whole name', () => {
		expect(parseCompendiumRef('Goblin')).toEqual({ kind: undefined, name: 'Goblin', owner: undefined });
		expect(parseCompendiumRef('Kobold: Chief')).toEqual({ kind: undefined, name: 'Kobold: Chief', owner: undefined });
		// "@" only names an owner after a kind; a monster may have one in its name.
		expect(parseCompendiumRef('Bandit @ Night')?.name).toBe('Bandit @ Night');
	});

	it('gives nothing for empty text or a kind with no name', () => {
		expect(parseCompendiumRef('')).toBeNull();
		expect(parseCompendiumRef('   ')).toBeNull();
		expect(parseCompendiumRef('spell:')).toBeNull();
		expect(parseCompendiumRef('feature: @Zephyr')).toBeNull();
	});
});

describe('formatCompendiumRef', () => {
	it('keeps monsters bare and prefixes everything else with its kind', () => {
		expect(formatCompendiumRef('monster', 'Goblin Boss')).toBe('Goblin Boss');
		expect(formatCompendiumRef('spell', 'Flame Dart')).toBe('spell:Flame Dart');
		expect(formatCompendiumRef('feature', 'Blur', 'Zephyr')).toBe('feature:Blur@Zephyr');
		expect(formatCompendiumRef('condition', 'Dazed')).toBe('condition:Dazed');
	});

	it('round-trips through parse', () => {
		expect(parseCompendiumRef(formatCompendiumRef('feature', 'Lay on Hands', 'Oathsworn'))).toEqual({ kind: 'feature', name: 'Lay on Hands', owner: 'Oathsworn' });
	});
});

describe('resolveCompendiumRef', () => {
	it('finds Lay on Hands: a feature of the Oathsworn, not a spell', () => {
		for (const text of ['feature:Lay on Hands', 'Lay on Hands', 'feature:lay on hands', 'feature:Lay on Hands@Oathsworn']) {
			const hit = resolve(real, text);
			expect(hit?.kind, text).toBe('feature');
			expect(hit?.name).toBe('Lay on Hands');
			expect(hit?.className).toBe('Oathsworn');
			expect(hit?.level).toBe(1);
		}
		expect(resolve(real, 'spell:Lay on Hands')).toBeUndefined();
	});

	it('finds a class, a spell and an item by kind', () => {
		expect(resolve(real, 'class:Oathsworn')).toMatchObject({ kind: 'class', name: 'Oathsworn' });
		expect(resolve(real, 'spell:Flame Dart')).toMatchObject({ kind: 'spell', name: 'Flame Dart' });
		expect(resolve(real, 'item:Short Sword')).toMatchObject({ kind: 'item', name: 'Short Sword' });
		expect(resolve(real, 'subclass:Oath of Vengeance')).toMatchObject({ kind: 'subclass', className: 'Oathsworn' });
	});

	it('falls back from a bare name to the compendium, spells first', () => {
		expect(resolve(real, 'Flame Dart')).toMatchObject({ kind: 'spell', name: 'Flame Dart' });
		expect(resolve(real, 'Oathsworn')?.kind).toBe('class');
		expect(resolve(fixture, 'Rage')).toMatchObject({ kind: 'feature', className: 'Berserker' });
		expect(resolve(fixture, 'Battleaxe')?.kind).toBe('item');
		expect(resolve(real, 'Nobody’s Spell Of Nothing')).toBeUndefined();
	});

	it('uses the owner to pick between entries that share a name', () => {
		const zephyr = resolve(real, 'feature:Blur@Zephyr');
		expect(zephyr?.className).toBe('Zephyr');
		expect(zephyr?.subclass).toBeUndefined();
		expect(resolve(real, 'feature:Blur@Invoker of Surges')).toMatchObject({ className: 'Mage', subclass: 'Invoker of Surges' });
		expect(resolve(real, 'feature:Blur@Mage')).toMatchObject({ className: 'Mage' });
		expect(resolve(real, 'feature:Riposte@The Honorseeker')).toMatchObject({ className: 'The Cheat', subclass: 'The Honorseeker' });
		// An owner that doesn't match still finds the name.
		expect(resolve(real, 'feature:Blur@Nobody')?.name).toBe('Blur');
	});

	it('forgives the ways an item is written', () => {
		expect(resolve(real, 'item:Club')?.name).toBe('Club/Mace');
		expect(resolve(fixture, 'item:Javelin')?.name).toBe('Javelins');
	});

	it('leaves conditions to the caller', () => {
		expect(resolve(real, 'condition:Dazed')).toBeUndefined();
	});

	it('does not find draft classes when drafts are off', () => {
		expect(resolve(fixture, 'class:Hexbinder')?.name).toBe('Hexbinder');
		expect(resolve(new Compendium(FIXTURE, { drafts: false }), 'class:Hexbinder')).toBeUndefined();
	});
});

describe('refForHit', () => {
	it('names an entry by kind, adding the owner only when the name is shared', () => {
		const lay = resolve(real, 'feature:Lay on Hands')!;
		expect(refForHit(real, lay)).toBe('feature:Lay on Hands');
		const blur = resolve(real, 'feature:Blur@Zephyr')!;
		expect(refForHit(real, blur)).toBe('feature:Blur@Zephyr');
		const surges = resolve(real, 'feature:Blur@Invoker of Surges')!;
		expect(refForHit(real, surges)).toBe('feature:Blur@Invoker of Surges');
		expect(refForHit(real, resolve(real, 'class:Oathsworn')!)).toBe('class:Oathsworn');
	});

	it('finds every bundled entry again', () => {
		for (const hit of real.all()) {
			const back = resolve(real, refForHit(real, hit));
			expect(back, `${hit.kind} ${hit.name}`).toBeDefined();
			expect(back!.kind).toBe(hit.kind);
			expect(nameKey(back!.name)).toBe(nameKey(hit.name));
			expect(back!.subclass ?? back!.className).toBe(hit.subclass ?? hit.className);
		}
	});
});
