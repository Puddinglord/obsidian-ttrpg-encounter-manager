// A creature from another game (core/import/creature.ts), built as a Nimble
// monster on the GM Guide's numbers: its level from the source's own measure
// (a 5e CR, as party level), HP and damage from the Monster Builder table for
// that level (or the legendary table for a solo), armor from its AC, attacks
// kept by name with their reach and range in spaces and their dice remade to
// the table's damage, saves as the table's DC. Everything else keeps its text,
// feet turned to spaces. Each change is said, for the GM to check.
// Pure: no Obsidian imports.

import { feetToSpaces, NeutralAttack, NeutralCreature } from '../../core/import/creature';
import { ARMOR_FROM, expectedRegular, expectedSolo, formatDiceParts, LEGENDARY_ARMOR_FROM, levelLabel, parseDiceParts, snapLevel, suggestDice } from './builder-math';
import type { ArmorType } from './types';

const STAT: Record<string, string> = { str: 'STR', con: 'STR', dex: 'DEX', int: 'INT', wis: 'WIL', cha: 'WIL' };
const spaces = (feet: number) => Math.max(1, Math.round(feet / 5));

/** AC to Nimble armor: 17 and up heavy, 14 to 16 medium, stepped down when the book says it's too early. */
export function armorFor(ac: number | undefined, level: number, solo: boolean): { armor: ArmorType; note?: string } {
	const want: ArmorType = ac === undefined ? 'none' : ac >= 17 ? 'heavy' : ac >= 14 ? 'medium' : 'none';
	const from = solo ? LEGENDARY_ARMOR_FROM : ARMOR_FROM;
	let armor = want;
	if (armor === 'heavy' && level < from.heavy) armor = level >= from.medium ? 'medium' : 'none';
	if (armor === 'medium' && level < from.medium) armor = 'none';
	const word = (a: ArmorType) => (a === 'none' ? 'no armor' : `${a} armor`);
	return { armor, note: armor !== want ? `AC ${ac} would be ${word(want)}, which the GM Guide starts at a higher level, so it has ${word(armor)}.` : ac !== undefined ? `AC ${ac} is ${word(armor)}.` : undefined };
}

/** An attack's text: "(Reach 2) 1d8+4 slashing. Rider." or a save: "DEX save DC 13 or 3d6 fire." */
function attackText(a: NeutralAttack, dice: string, dc: number): string {
	const shape = a.area ? /(cone|line|cube|sphere|emanation|radius|cylinder)/i.exec(a.area)?.[1] : undefined;
	const size = a.area ? /(\d+)-foot/.exec(a.area)?.[1] : undefined;
	const reachRange = a.range ? `Range ${spaces(a.range)}` : a.reach ? `Reach ${spaces(a.reach)}` : shape && size ? `${shape.charAt(0).toUpperCase()}${shape.slice(1).toLowerCase()} ${spaces(Number(size))}` : '';
	const type = a.damageType ? ` ${a.damageType}` : '';
	const rider = a.rider ? ` ${feetToSpaces(a.rider)}` : '';
	const body = a.save ? `${STAT[a.save.ability] ?? a.save.ability.toUpperCase()} save DC ${dc} or ${dice}${type} (half on a save).` : `${dice}${type}.`;
	return `${reachRange ? `${reachRange}. ` : ''}${body}${rider}${a.uses ? ` (${a.uses})` : ''}`.replace(/\s+/g, ' ').trim();
}

/** Dice for a target average, in the source's die size where it can be. */
function diceFor(target: number, source?: string): string {
	const d = source ? parseDiceParts(source.replace(/\s+/g, '')) : null;
	const sides = d?.sides && [4, 6, 8, 10, 12, 20].includes(d.sides) ? d.sides : 8;
	const s = suggestDice(target, sides);
	return formatDiceParts(s).replace(/^d/, '1d');
}

export function creatureInNimble(c: NeutralCreature): { value: Record<string, unknown>; notes: string[] } {
	const notes: string[] = [];
	const cr = c.power.cr ?? c.power.level ?? 1;
	const solo = !!c.power.solo;
	const level = solo ? Math.max(1, Math.round(cr)) : snapLevel(Math.max(1 / 8, cr));
	notes.push(`Level ${levelLabel(level)}${c.power.cr !== undefined ? `, from CR ${c.power.cr < 1 && c.power.cr > 0 ? `1/${Math.round(1 / c.power.cr)}` : c.power.cr}` : ''}${solo ? ', as a solo (legendary) monster' : ''}.`);
	const { armor, note: armorNote } = armorFor(c.ac, level, solo);
	if (armorNote) notes.push(armorNote);
	const value: Record<string, unknown> = { name: c.name, level: levelLabel(level), role: solo ? 'legendary' : c.power.minion ? 'minion' : 'regular', armor };
	if (c.size) value.size = c.size.charAt(0).toUpperCase() + c.size.slice(1).toLowerCase();
	if (c.type) value.type = c.type;
	const perTurn = Math.max(1, Math.min(3, c.attacksPerTurn));
	let dc = 12;
	let perAttack = 0;
	if (solo) {
		const e = expectedSolo(level, armor);
		value.hpPerHero = e.hpPerHero;
		value.lastStand = `When it drops to 0 HP, it fights on with ${e.lastStandPerHero} more HP per hero.`;
		dc = e.dc;
		perAttack = e.big;
		notes.push(`${e.hpPerHero} HP per hero and a Last Stand of ${e.lastStandPerHero} per hero, from the GM Guide's legendary table${c.hp ? ` (the 5e block had ${c.hp} HP)` : ''}. Its Last Stand is a starting point: give it a twist of its own.`);
	} else {
		const e = expectedRegular(level, armor, perTurn);
		value.hp = e.hp;
		dc = e.dc;
		perAttack = e.perAttack;
		notes.push(`${e.hp} HP, from the GM Guide's Monster Builder for level ${levelLabel(level)}${c.hp ? ` (the 5e block had ${c.hp})` : ''}.`);
	}
	const sp = c.speed ?? {};
	if (sp.walk !== undefined) value.speed = spaces(sp.walk);
	for (const k of ['fly', 'swim', 'climb', 'burrow'] as const) if (sp[k]) value[k] = spaces(sp[k]);
	if (sp.hover && sp.fly) value.movement = `${spaces(sp.walk ?? 30)}, fly ${spaces(sp.fly)} (hover)`;
	const saves = [...new Set(c.goodSaves.map(s => STAT[s]).filter(Boolean))];
	if (saves.length) value.saves = saves.map(s => `${s}+`).join(' ');
	if (c.attacks.length) {
		value.actions = c.attacks.map(a => ({ name: a.name, text: attackText(a, diceFor(perAttack, a.dice), dc) }));
		if (perTurn > 1) value.actionsIntro = solo ? 'After each hero\'s turn, choose one:' : `It makes ${perTurn} attacks a turn:`;
		else if (solo) value.actionsIntro = 'After each hero\'s turn, choose one:';
		const was = c.attacks.map(a => a.avg).filter((n): n is number => n !== undefined);
		notes.push(`Each attack does about ${Math.round(perAttack)} (${diceFor(perAttack, c.attacks[0].dice)}), the table's damage for ${perTurn === 1 ? 'one attack' : `${perTurn} attacks`} a turn${was.length ? ` (the 5e attacks did ${was.join(', ')})` : ''}.`);
		if (c.attacks.some(a => a.save)) notes.push(`Saving throws are DC ${dc}, the table's for its level.`);
	} else notes.push('It has no attacks the converter could read: give it one from its abilities.');
	const traits = c.abilities.map(a => ({
		name: a.when === 'reaction' ? `${a.name} (Reaction)` : a.when === 'bonus' ? `${a.name} (Bonus action)` : a.when === 'legendary' ? `${a.name} (Legendary)` : a.name,
		text: feetToSpaces(a.text),
	}));
	if (traits.length) {
		value.traits = traits;
		notes.push('Its other abilities keep their 5e words (distances in spaces): check they suit Nimble.');
	}
	if (c.resist?.length) value.resist = c.resist;
	if (c.immune?.length) value.immune = c.immune;
	if (c.vuln?.length) value.vuln = c.vuln;
	if (c.senses) value.senses = feetToSpaces(c.senses);
	if (c.languages) value.languages = c.languages;
	if (c.flavor) value.flavor = c.flavor;
	return { value, notes };
}

