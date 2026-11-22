// A new Nimble hero as frontmatter (Core Rules 3.3, Character Creation): level 1
// from character-def.ts (the stat array as placed, HP, gear or gold), then, for a
// hero who starts higher, the same steps as levelling up, one level at a time
// (level-plan.ts): HP, Hit Dice, the subclass, the class's picks, stat increases
// and skill points. Pure: no Obsidian imports.

import type { Compendium } from './compendium';
import { DEFAULT_HIT_DIE, Frontmatter, hpAverage, levelOneFrontmatter, NewCharacterOptions } from './character-def';
import { applyLevelChoices, LevelChoices, LevelPlan, levelPlans, noChoices } from './level-plan';

export interface NewHero extends NewCharacterOptions {
	/** What the player chose for level 1's picks and each level after it. Missing: the flat HP bonus, nothing else chosen. */
	choices?: LevelChoices;
}

/** The levels a new hero is made through: 1 (its picks) up to the starting level. */
export function heroPlans(o: Pick<NewHero, 'className' | 'level' | 'background'>, comp: Compendium, chosen?: string): LevelPlan[] {
	const cls = comp.classByName(o.className);
	if (!cls) return [];
	const to = Math.max(1, Math.min(20, Math.floor(o.level ?? 1)));
	const bg = comp.background(o.background);
	return levelPlans(comp, { className: cls.name, subclass: '', chosen, from: 1, to, hitDie: cls.hitDie ?? DEFAULT_HIT_DIE, background: bg ? { name: bg.name, text: bg.text } : undefined });
}

/** Frontmatter for a new hero, at level 1 or levelled up to `o.level` with the choices made. */
export function newCharacterFrontmatter(o: NewHero, comp: Compendium): Frontmatter {
	const fm = levelOneFrontmatter(o, comp);
	const c = o.choices ?? noChoices();
	const plans = heroPlans(o, comp, c.subclass);
	if (plans.length) applyLevelChoices(fm, comp, plans, c);
	else {
		// No class: still the level they start at, with the flat bonus of an unknown Hit Die.
		const target = Math.max(1, Math.min(20, Math.floor(o.level ?? 1)));
		if (target > 1) applyLevelChoices(fm, comp, Array.from({ length: target - 1 }, (_, i) => blankPlan(i + 2, comp)), c);
	}
	return fm;
}

function blankPlan(level: number, comp: Compendium): LevelPlan {
	return { level, features: [], subclasses: [], picks: [], stats: [], boons: [], spells: [], spellGrants: [], grants: [], hitDie: DEFAULT_HIT_DIE, average: hpAverage(DEFAULT_HIT_DIE, comp) };
}
