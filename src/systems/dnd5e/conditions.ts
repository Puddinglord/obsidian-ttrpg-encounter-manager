// The SRD conditions for each edition (data/conditions.json, built by
// scripts/dnd5e/build.py). Pure: no Obsidian imports.

import type { ConditionDef } from '../../core/types';
import data from './data/conditions.json';
import { asEdition } from './editions';

const byEdition: Record<'2014' | '2024', ConditionDef[]> = {
	'2014': data['2014'].map(withLevels),
	'2024': data['2024'].map(withLevels),
};

/** Exhaustion has levels (Exhaustion 3). */
function withLevels(c: { name: string; description: string }): ConditionDef {
	return c.name === 'Exhaustion' ? { ...c, hasValue: true } : c;
}

export function conditionsFor(edition: string | number | undefined): readonly ConditionDef[] {
	return byEdition[asEdition(edition)];
}

/**
 * What the tracker offers besides the conditions: the rules' other lasting
 * effects, with their timing (core/tracker/effects.ts). Only what the SRD
 * says: 5.2's Rules Glossary has Burning (a hazard); 5.1 has nothing like it.
 */
const effectsByEdition: Record<'2014' | '2024', ConditionDef[]> = {
	'2014': [],
	'2024': [{
		name: 'Burning',
		description: 'A burning creature or object takes 1d4 Fire damage at the start of each of its turns. As an action, you can extinguish fire on yourself by giving yourself the Prone condition and rolling on the ground. The fire also goes out if it is doused, submerged, or suffocated.',
		timing: { triggers: [{ kind: 'damage', at: 'start', dice: '1d4', damageType: 'Fire' }] },
	}],
};

/** The conditions, then the other effects the tracker can put on a creature (Burning). */
export function trackerConditionsFor(edition: string | number | undefined): readonly ConditionDef[] {
	return [...conditionsFor(edition), ...effectsByEdition[asEdition(edition)]];
}
