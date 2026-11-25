import { describe, expect, it } from 'vitest';
import { checkBundle, emptyBundle } from '../src/core/import/bundle';
import { convertBundle } from '../src/core/import/convert';
import { feetToSpaces } from '../src/core/import/creature';
import { bundledMonsters } from '../src/systems/dnd5e/bestiary';
import { attackOf, creatureOut5e } from '../src/systems/dnd5e/creature';
import { KINDS_NIMBLE } from '../src/systems/nimble/content';
import { armorFor, creatureInNimble } from '../src/systems/nimble/creature';
import { guessRegularLevel, guessSoloLevel } from '../src/systems/nimble/builder-math';
import { writeEntryNimble } from '../src/systems/nimble/import-write';
import { parseStatblock } from '../src/systems/nimble/parser';

const games = { resolve: (id: string) => (id === 'nimble' ? { id: 'nimble', kinds: KINDS_NIMBLE } : undefined) };
const toNimble = { from: 'dnd5e', to: 'nimble', out: creatureOut5e, in: creatureInNimble };
const srd = (name: string, ed: '2014' | '2024' = '2024') => ({ ...bundledMonsters(ed).find(m => m.name === name)!.monster }) as unknown as Record<string, unknown>;

describe('5e monsters, converted to Nimble on the GM Guide\'s numbers', () => {
	it('a goblin: level from CR, HP and damage from the table, its attacks kept with reach and range in spaces', () => {
		const n = creatureOut5e(srd('Goblin Warrior'))!;
		expect(n.power.cr).toBe(0.25);
		expect(n.attacks.map(a => [a.name, a.reach, a.range])).toEqual([['Scimitar', 5, undefined], ['Shortbow', undefined, 80]]);
		const { value, notes } = creatureInNimble(n);
		expect(value).toMatchObject({ name: 'Goblin Warrior', level: '1/4', role: 'regular', armor: 'none', hp: 10, speed: 6 });
		expect((value.actions as { name: string; text: string }[]).map(a => a.text.split('.')[0])).toEqual(['Reach 1', 'Range 16']);
		expect(notes.join(' ')).toMatch(/Level 1\/4, from CR 1\/4/);
		expect(notes.join(' ')).toMatch(/AC 15 would be medium armor, which the GM Guide starts at a higher level, so it has no armor/);
	});

	it('a legendary one is a solo: HP per hero and a Last Stand, from the legendary table', () => {
		const { value } = creatureInNimble(creatureOut5e(srd('Adult Red Dragon'))!);
		expect(value).toMatchObject({ role: 'legendary', armor: 'heavy' });
		expect(typeof value.hpPerHero).toBe('number');
		expect(value.lastStand).toMatch(/HP per hero/);
		expect(value.actionsIntro).toBe('After each hero\'s turn, choose one:');
	});

	it('every SRD monster (both rulesets) converts to a Nimble monster that checks out, writes, and plays within a level of where it was put', () => {
		const off: string[] = [];
		let n = 0;
		for (const ed of ['2014', '2024'] as const) {
			const content = bundledMonsters(ed).map(m => ({ kind: 'monster', ...(m.monster as unknown as Record<string, unknown>), name: m.name }));
			const conv = convertBundle(emptyBundle({ system: 'dnd5e', content }), toNimble);
			const checked = checkBundle(conv.bundle, games);
			for (const r of checked.records) {
				n++;
				if (r.errors.length) { off.push(`${r.name}: ${r.errors.join('; ')}`); continue; }
				const v = r.value!;
				expect(r.convertedFrom).toBe('dnd5e');
				expect(r.original?.kind).toBe('monster');
				const block = writeEntryNimble('monster', v)!.body;
				expect(parseStatblock(block)?.name).toBe(r.name);
				const [a, b] = String(v.level).split('/').map(Number); const level = b ? a / b : a;
				const guess = v.role === 'legendary'
					? guessSoloLevel({ hpPerHero: v.hpPerHero as number, armor: v.armor as never })
					: guessRegularLevel({ hp: v.hp as number, armor: v.armor as never });
				if (Math.abs(guess.level - level) > 1) off.push(`${r.name}: level ${v.level}, plays like ${guess.level}`);
			}
		}
		expect(n).toBeGreaterThan(400);
		expect(off).toEqual([]);
	});

	it('what isn\'t a monster waits (coming soon); a converted one keeps its original', () => {
		const conv = convertBundle(emptyBundle({ system: 'dnd5e', content: [{ kind: 'spell', name: 'Fireball' }, { kind: 'monster', ...srd('Goblin', '2014'), name: 'Goblin' }] }), toNimble);
		expect(conv.bundle.content!.map(e => e.name)).toEqual(['Goblin']);
		// Not dropped: waiting, for the dialog to show as coming soon.
		expect(conv.waiting.map(e => e.name)).toEqual(['Fireball']);
		expect(conv.bundle.content![0]).toMatchObject({ convertedFrom: 'dnd5e', original: { kind: 'monster', name: 'Goblin', cr: '1/4' } });
	});

	it('feet become spaces; AC becomes armor, early armor stepped down', () => {
		expect(feetToSpaces('Each creature within 30 feet, in a 15-foot cone, or 60 ft. away.')).toBe('Each creature within 6 spaces, in a 3-space cone, or 12 spaces away.');
		expect(armorFor(18, 10, false).armor).toBe('heavy');
		expect(armorFor(18, 5, false).armor).toBe('medium');
		expect(armorFor(15, 2, false).armor).toBe('none');
		expect(armorFor(12, 9, false).armor).toBe('none');
	});

	it('a save action keeps its ability, with the table\'s DC', () => {
		const a = attackOf({ name: 'Fire Breath (Recharge 5–6)', desc: 'Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: 59 (17d6) Fire damage. Success: Half damage.' })!;
		expect(a).toMatchObject({ name: 'Fire Breath', save: { ability: 'dex', dc: 21 }, uses: 'Recharge 5–6', damageType: 'fire' });
	});
});
