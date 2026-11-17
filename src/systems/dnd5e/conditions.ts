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
