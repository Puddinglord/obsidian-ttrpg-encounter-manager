// The one useful fact under each record's name in Import…'s list:
// "Monster · Level 4 · Fey", "Map · 7 pins · 30 × 20", "NPC · Cleric".
// Pure: no Obsidian imports.

import type { CheckedRecord } from './bundle';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** `label`: what the kind is called ("Monster", "Magic item"). */
export function recordFact(r: CheckedRecord, label: string): string {
	const v = r.value ?? {};
	const parts: (string | undefined)[] = [label];
	if (!r.value) return [label, r.errors[0] ? 'Left out' : undefined].filter(Boolean).join(' · ');
	if (r.type === 'map') {
		const pins = Array.isArray(v.pins) ? v.pins.length : 0;
		parts.push(pins ? `${pins} pin${pins === 1 ? '' : 's'}` : 'No pins');
		const g = /^(\d+)x(\d+)$/.exec(str(v.grid) ?? '');
		if (g) parts.push(`${g[1]} × ${g[2]}`);
	} else if (r.type === 'note') {
		const f = (v.fields ?? {}) as Record<string, unknown>;
		parts.push(str(f.role) ?? str(f.region) ?? str(f.location) ?? str(f.faction) ?? str(f.status));
	} else {
		switch (r.kind) {
			case 'monster': {
				const level = str(v.level);
				const cr = str(v.cr);
				parts.push(level ? `Level ${level}` : cr ? `CR ${cr}` : undefined);
				const role = str(v.role);
				parts.push(role && role !== 'regular' ? cap(role) : str(v.type));
				break;
			}
			case 'spell': {
				const level = typeof v.level === 'number' ? v.level : typeof v.tier === 'number' ? v.tier : undefined;
				parts.push(level === 0 ? 'Cantrip' : level !== undefined ? `${typeof v.tier === 'number' ? 'Tier' : 'Level'} ${level}` : undefined, str(v.school));
				break;
			}
			case 'item': parts.push(str(v.rarity) ? cap(str(v.rarity)!) : undefined, str(v.subcategory) ?? str(v.type)); break;
			default: parts.push(str(v.class), str(v.type));
		}
	}
	return parts.filter(Boolean).join(' · ');
}

/** What changed between the vault's copy and the import's, field by field (import fields aside). */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): { key: string; before?: unknown; after?: unknown }[] {
	const skip = new Set(['imported', 'importId']);
	const keys = [...new Set([...Object.keys(after), ...Object.keys(before)])].filter(k => !skip.has(k));
	const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
	return keys.filter(k => !same(before[k], after[k])).map(k => ({ key: k, before: before[k], after: after[k] }));
}
