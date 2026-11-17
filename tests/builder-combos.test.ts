// Every combination the builders can make, through the same code the dialog uses:
// the block reads back clean, Edit → Save writes the same block, and homebrew
// joins the compendium. Also: Edit on every bundled monster, spell and item keeps
// everything (the book's content is the widest set of hand-written blocks we have).

import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { extractNimbleBlocks, readStatblock, toStatblockSource } from '../src/parser';
import { BuildRole, draftFromMonster, MonsterDraft, newMonsterDraft, toMonster, toSource } from '../src/entity-monster';
import {
	AreaShape, fromItem, fromSpell, itemSource, newItemDraft, newSpellDraft, RangeKind, SaveKey, spellSource, toItem, toSpell,
} from '../src/entity-homebrew';
import { HomebrewItem, ITEM_KINDS, ItemKind, itemBlockSource, parseItemBlock, parseSpellBlock, spellBlockSource } from '../src/homebrew-def';
import { RARITIES } from '../src/builder-math';
import { bundledCompendium, setHomebrew } from '../src/compendium-data';
import { fromBestiary } from '../src/bestiary';
import BESTIARY from '../src/data/bestiary.json';
import { monsterRole } from '../src/rules';
import type { ArmorType } from '../src/types';

const cross = <T>(axes: Record<string, unknown[]>): T[] =>
	Object.entries(axes).reduce<Record<string, unknown>[]>((acc, [k, vals]) => acc.flatMap(a => vals.map(v => ({ ...a, [k]: v }))), [{}]) as T[];

// ----------------------------------------------------------------------------
// Monsters

interface MonsterCombo { role: BuildRole; level: number; armor: ArmorType; attacks: 'one' | 'two' | 'twice'; extras: boolean; typed: boolean }

const LEVELS_FOR: Record<BuildRole, number[]> = { regular: [0.25, 0.5, 1, 4, 10, 20], solo: [1, 5, 12, 20], minion: [2, 6, 12] };

function monster(c: MonsterCombo): MonsterDraft {
	const party = { level: c.role === 'minion' ? c.level : 4, size: 4 };
	const d: MonsterDraft = { ...newMonsterDraft(party, c.role), name: `${c.role} ${c.level} ${c.armor} ${c.attacks}`, armor: c.armor };
	if (c.role !== 'minion') d.level = c.level;
	if (c.attacks === 'two') d.attacks = c.role === 'solo' ? [{ name: 'Bite', size: 'small' }, { name: 'Tail', size: 'big', die: 10 }, { name: 'Roar', size: 'big' }] : [{ name: 'Bite' }, { name: 'Claw', die: 6 }];
	if (c.attacks === 'twice' && c.role !== 'minion') d.attacksPerTurn = 2;
	if (c.typed) {
		d.hp = c.role === 'minion' ? undefined : 33;
		d.attacks = d.attacks.map((a, i) => (i === 0 ? { ...a, body: '2d6+3 piercing' } : a));
	}
	if (c.extras) Object.assign(d, {
		size: 'Large', type: 'Beast', speed: 8, moves: { fly: 10, swim: 4 }, saves: { STR: 1, DEX: -1, WIL: 2 },
		abilities: [{ name: 'Keen Nose', text: 'Smells hidden heroes.' }, { name: 'Pack', text: 'Advantage near allies.' }],
		bloodied: c.role === 'solo' ? undefined : 'It howls.', description: 'A big one.', group: 'Wolves', habitat: 'Forest',
		easier: 'Feed it.', harder: 'Two of them.', resistances: ['fire'], immunities: ['poison'], vulnerabilities: ['silver'],
	});
	return d;
}

const MONSTERS = (['regular', 'solo', 'minion'] as BuildRole[]).flatMap(role => cross<MonsterCombo>({
	role: [role], level: LEVELS_FOR[role], armor: ['none', 'medium', 'heavy'], attacks: ['one', 'two', 'twice'], extras: [false, true], typed: [false, true],
}));

describe(`monster builder: ${MONSTERS.length} combinations`, () => {
	it.each(MONSTERS.map(c => [`${c.role} L${c.level} ${c.armor} ${c.attacks}${c.extras ? ' +extras' : ''}${c.typed ? ' +typed' : ''}`, c] as const))('%s', (_label, c) => {
		const d = monster(c);
		const src = toSource(d);
		const { monster: m, issues } = readStatblock(src);
		// Reads back clean, and says the same thing written out again.
		expect(issues).toEqual([]);
		expect(m).not.toBeNull();
		expect(toStatblockSource(m!)).toBe(src);
		const want = toMonster(d);
		expect(m).toMatchObject({ name: want.name, armor: want.armor });
		// Minions have no HP line: the tracker counts them, it doesn't track their HP.
		if (c.role !== 'minion') expect(m!.hp).toBe(want.hp);
		expect(monsterRole(m!)).toBe(monsterRole(want));
		expect(m!.attacks?.map(a => a.raw)).toEqual(want.attacks?.map(a => a.raw));
		// Edit → Save on the block, untouched, writes the same block.
		const edit = draftFromMonster(m!, { level: 4, size: 4 }, true, true);
		expect(toSource(edit)).toBe(src);
		// Changing one thing changes only its line.
		expect(toSource({ ...edit, name: 'Renamed' })).toBe(src.replace(/^name: .*/, 'name: Renamed'));
		if (c.role !== 'minion') expect(toSource({ ...edit, hp: 77 })).toBe(src.replace(/^hp: .*$/m, c.role === 'solo' ? 'hp: 77/hero' : 'hp: 77'));
	});
});

// ----------------------------------------------------------------------------
// Spells

interface SpellCombo { tier: number; rangeKind: RangeKind; area: AreaShape; utility: boolean; save: SaveKey; extras: boolean }

const SPELLS = cross<SpellCombo>({
	tier: [0, 1, 2, 5, 9], rangeKind: ['range', 'reach', 'self'], area: ['none', 'aoe', 'cone', 'line', 'square'],
	utility: [false, true], save: ['', 'DEX'], extras: [false, true],
});

describe(`spell builder: ${SPELLS.length} combinations`, () => {
	afterEach(() => setHomebrew({ spells: [], items: [] }));
	it.each(SPELLS.map(c => [`T${c.tier} ${c.rangeKind} ${c.area}${c.utility ? ' utility' : ''}${c.save ? ' save' : ''}${c.extras ? ' +extras' : ''}`, c] as const))('%s', (label, c) => {
		const d = { ...newSpellDraft(), name: `Spell ${label}`, tier: c.tier, rangeKind: c.rangeKind, area: c.area, utility: c.utility, save: c.save, text: 'It happens.' };
		if (c.extras) Object.assign(d, { school: 'Necrotic', actions: 1, distance: c.rangeKind === 'self' ? undefined : 6, areaSize: c.area === 'none' || c.area === 'aoe' ? undefined : 5, concentration: 'up to 1 minute', damage: c.utility ? undefined : '2d10+1', upcast: '+1d10.', scaling: '+2 damage.' });
		const src = spellSource(d);
		const s = parseSpellBlock(src)!;
		expect(s).toMatchObject({ ...toSpell(d), source: 'Homebrew' });
		expect(spellBlockSource(s)).toBe(src);
		expect(spellSource(fromSpell(s, true))).toBe(src);
		expect(spellSource({ ...fromSpell(s, true), concentration: 'up to 1 hour' })).toBe(parseSpellBlock(src) && spellBlockSource({ ...s, concentration: 'up to 1 hour' }));
		// A template of it builds the same spell.
		expect(spellSource({ ...fromSpell(s), name: s.name })).toBe(src);
		setHomebrew({ spells: [s], items: [] });
		expect(bundledCompendium().spell(s.name)).toMatchObject(JSON.parse(JSON.stringify({ name: s.name, tier: s.tier, damage: s.damage, range: s.range, aoe: s.aoe })));
	});
});

// ----------------------------------------------------------------------------
// Items

interface ItemCombo { kind: ItemKind; rarity: string; charges: boolean; catch: boolean; extras: boolean }

const ITEMS = cross<ItemCombo>({ kind: [...ITEM_KINDS], rarity: ['', ...RARITIES], charges: [false, true], catch: [false, true], extras: [false, true] });

describe(`item builder: ${ITEMS.length} combinations`, () => {
	afterEach(() => setHomebrew({ spells: [], items: [] }));
	it.each(ITEMS.map(c => [`${c.kind} ${c.rarity || 'no rarity'}${c.charges ? ' charges' : ''}${c.catch ? ' catch' : ''}${c.extras ? ' +extras' : ''}`, c] as const))('%s', (label, c) => {
		const d = { ...newItemDraft(c.kind), name: `Item ${label}`, rarity: c.rarity as never, text: 'Does a thing.' };
		if (c.charges) d.charges = '3';
		if (c.catch) d.catch = 'It hums at night.';
		if (c.extras) Object.assign(d, { damage: '2d6', stat: 'DEX', damageType: 'fire', props: ['Light', 'Thrown 4'], armor: c.kind === 'shield' ? '+1' : '4+DEX', strength: 2, cost: '75 gp' });
		const src = itemSource(d);
		const it0 = parseItemBlock(src)!;
		expect(it0).toMatchObject({ ...toItem(d), source: 'Homebrew' });
		expect(itemBlockSource(it0)).toBe(src);
		expect(itemSource(fromItem(it0, true))).toBe(src);
		expect(itemSource({ ...fromItem(it0, true), cost: '1 gp' })).toBe(itemBlockSource({ ...it0, cost: '1 gp' }));
		expect(itemSource({ ...fromItem(it0), name: it0.name })).toBe(src);
		setHomebrew({ spells: [], items: [it0] });
		const hit = bundledCompendium().item(it0.name)!;
		expect(hit).toMatchObject({ name: it0.name, category: it0.category });
		// The compendium leads with the charges; a template from it doesn't double them.
		expect(itemSource({ ...fromItem(hit as HomebrewItem), name: it0.name })).toBe(src);
	});
});

// ----------------------------------------------------------------------------
// Edit on everything the book ships

describe('Edit → Save keeps everything, on every bundled monster, spell and item, and every block in the sample and test vaults', () => {
	const party = { level: 3, size: 4 };
	// What a block says must survive; a default the builder adds where the block said nothing ("Choose twice:", a minion die) is fine.
	const same = (a: unknown, b: unknown) => a === undefined || JSON.stringify(a) === JSON.stringify(b ?? null);

	it('monsters', () => {
		const lost: string[] = [];
		for (const e of BESTIARY as Parameters<typeof fromBestiary>[0][]) {
			const m = readStatblock(toStatblockSource(fromBestiary(e))).monster!;
			const back = readStatblock(toSource(draftFromMonster(m, party, true, true))).monster!;
			for (const k of ['name', 'senses', 'languages', 'source', 'habitat', 'group', 'description', 'bloodied', 'lastStand', 'actionText', 'role', 'roleLabel', 'type', 'size', 'movement', 'resistances', 'immunities', 'vulnerabilities', 'minionDie', 'tactics'] as const)
				if (!same(m[k], back[k])) lost.push(`${m.name}.${k}: ${JSON.stringify(m[k])} → ${JSON.stringify(back[k])}`);
			if (m.attacks?.length !== back.attacks?.length) lost.push(`${m.name}: attacks`);
			if (!same(m.abilities, back.abilities)) lost.push(`${m.name}: abilities`);
		}
		expect(lost).toEqual([]);
	});

	it('the sample and test vaults\' hand-written blocks', () => {
		const lost: string[] = [];
		const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => {
			const p = join(dir, f);
			return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
		});
		let blocks = 0;
		for (const file of [...walk('sample-vault'), ...walk('e2e/fixtures/vault')]) {
			const text = readFileSync(file, 'utf8');
			for (const body of extractNimbleBlocks(text)) {
				const m = readStatblock(body).monster;
				if (!m) continue;
				blocks++;
				const back = readStatblock(toSource(draftFromMonster(m, party, true, true))).monster!;
				for (const k of Object.keys(m) as (keyof typeof m)[]) {
					// Legacy str/dex/will come back as saves; hp for minions isn't written.
					if (['str', 'dex', 'will', 'saves', 'monsterType', 'level', 'hp', 'attacks'].includes(k)) continue;
					if (!same(m[k], back[k])) lost.push(`${file} ${m.name}.${k}: ${JSON.stringify(m[k])} → ${JSON.stringify(back[k])}`);
				}
				if (monsterRole(m) !== 'minion' && m.hp !== back.hp) lost.push(`${file} ${m.name}.hp`);
				if (m.attacks?.length !== back.attacks?.length) lost.push(`${file} ${m.name}.attacks`);
			}
			// Spells and items: an untouched Edit writes back exactly what the block says, nothing more.
			for (const body of extractNimbleBlocks(text, 'nimble-spell')) {
				const s = parseSpellBlock(body)!; blocks++;
				expect(parseSpellBlock(spellSource(fromSpell(s, true)))).toEqual(s);
			}
			for (const body of extractNimbleBlocks(text, 'nimble-item')) {
				const i = parseItemBlock(body)!; blocks++;
				expect(parseItemBlock(itemSource(fromItem(i, true)))).toEqual(i);
			}
		}
		expect(blocks).toBeGreaterThan(15);
		expect(lost).toEqual([]);
	});

	it('spells and items: an untouched Edit changes nothing', () => {
		const lost: string[] = [];
		for (const h of bundledCompendium().all()) {
			if (h.kind === 'spell') {
				const s = parseSpellBlock(spellBlockSource(h.entry as never))!;
				const back = parseSpellBlock(spellBlockSource(toSpell(fromSpell(s, true))))!;
				if (JSON.stringify(back) !== JSON.stringify(s)) lost.push(`${s.name}: ${JSON.stringify(s)} → ${JSON.stringify(back)}`);
			} else if (h.kind === 'item') {
				const entry = h.entry as HomebrewItem;
				const it0 = parseItemBlock(itemBlockSource({ ...entry, charges: entry.charges != null ? String(entry.charges) : undefined }))!;
				const back = parseItemBlock(itemBlockSource(toItem(fromItem(it0, true))))!;
				if (JSON.stringify(back) !== JSON.stringify(it0)) lost.push(`${it0.name}: ${JSON.stringify(it0)} → ${JSON.stringify(back)}`);
			}
		}
		expect(lost).toEqual([]);
	});
});
