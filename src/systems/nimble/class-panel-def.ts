// What a hero's class panel holds, in the one frame every class shares: dice
// you hold (Fury, Judgment), a pool (mana), a number (Lay on Hands), uses
// (1/Safe Rest features, Coordinated Strike), charges (Thrill of the Hunt), a
// state (Raging) and a target (Hunter's Mark). Each row knows its rules in the
// book's words (the class feature that explains it, or the magic rules for
// mana) and how its max is worked out, for the name's tooltip. Pure: the sheet
// (class-panel.ts) draws it.

import type { CharacterSheet, Resource, SheetFeature } from './character-def';
import { nameKey } from './compendium';
import { heldFaces, ruleOf } from './resource-def';

export interface RuleText { name: string; text: string }

interface RowBase {
	/** Stable per hero ("res:Fury Dice", "mana", "rage"): keeps a row open across redraws. */
	key: string;
	label: string;
	/** How the max is worked out and when it comes back ("d4 · up to KEY · lost when Rage ends"). */
	tip?: string;
	/** The book's words, behind the chevron on the name. */
	rules: RuleText[];
}

export type PanelRow = RowBase & (
	| { kind: 'pool'; value: number; max: number }
	| { kind: 'dice'; res: Resource; sides: number; faces: number[]; max?: number; roll: number; rolledWhen: 'gained' | 'spent' }
	| { kind: 'number'; res: Resource; value: number; max: number; spend: string }
	| { kind: 'uses'; res: Resource; left: number; max: number }
	| { kind: 'charges'; res: Resource; value: number }
	| { kind: 'state'; on: boolean; text: string; condition: string }
	| { kind: 'target'; target: string }
);

/** The magic rules' entries (compendium rules.magicRules), read defensively. */
function magicRule(magicRules: unknown, name: string): RuleText | undefined {
	if (!Array.isArray(magicRules)) return undefined;
	for (const r of magicRules as unknown[]) {
		if (!r || typeof r !== 'object') continue;
		const e = r as { name?: unknown; text?: unknown };
		if (typeof e.name === 'string' && typeof e.text === 'string' && nameKey(e.name) === nameKey(name)) return { name: e.name, text: e.text };
	}
	return undefined;
}

/**
 * The features whose words explain `name`: the ones named, else one called the
 * same, else one whose name starts the other's ("Thrill of the Hunt charges"),
 * else the first that mentions it.
 */
export function rulesFor(name: string, features: SheetFeature[], named?: string[]): RuleText[] {
	const own = features.filter(f => f.text && (f.group === 'Class' || f.group === 'Subclass' || f.group === 'Chosen'));
	const pick = (f: SheetFeature | undefined): RuleText[] => (f ? [{ name: f.name, text: f.text }] : []);
	if (named?.length) {
		const out = named.flatMap(n => pick(own.find(f => nameKey(f.name) === nameKey(n))));
		if (out.length) return out;
	}
	const k = nameKey(name);
	const exact = own.find(f => nameKey(f.name) === k);
	if (exact) return pick(exact);
	const starts = own.find(f => { const fk = nameKey(f.name); return fk.length >= 4 && (k.startsWith(fk) || fk.startsWith(k)); });
	if (starts) return pick(starts);
	const words = name.toLowerCase();
	return pick(own.find(f => f.text.toLowerCase().includes(words)));
}

/** "Safe Rest" → "back on a Safe Rest"; the book's words otherwise. */
function resetText(reset: string | undefined): string {
	const r = String(reset ?? '').trim();
	if (!r) return '';
	if (/^safe rest$/i.test(r)) return 'back on a Safe Rest';
	if (/^encounter$/i.test(r)) return 'back each encounter';
	if (/^rage ends$/i.test(r)) return 'lost when your Rage ends';
	return r.charAt(0).toLowerCase() + r.slice(1);
}

function tipFor(res: Resource): string {
	const f = res.formula && !/^\d+$/.test(res.formula) ? res.formula : '';
	const max = res.max !== undefined ? `up to ${f ? `${f} (${res.max})` : res.max}` : '';
	return [res.die ?? '', max, resetText(res.reset)].filter(Boolean).join(' · ');
}

const RAGE = /^rag(e|ing)$/i;

/** Every row of the hero's class panel, in the order the sheet shows them. */
export function classPanelRows(s: CharacterSheet, magicRules?: unknown): PanelRow[] {
	const rows: PanelRow[] = [];
	const has = (name: string) => s.features.find(f => nameKey(f.name) === nameKey(name) && (f.group === 'Class' || f.group === 'Subclass'));

	// A marked target leads (Hunter's Mark): it's what the Hunter's other things are about.
	const mark = has('Hunter’s Mark');
	if (mark) rows.push({ kind: 'target', key: 'quarry', label: mark.name, target: s.quarry, tip: 'one Quarry at a time, for a day', rules: [{ name: mark.name, text: mark.text }] });

	if (s.manaMax > 0) {
		const mana = magicRule(magicRules, 'Mana');
		const formula = s.cls?.casting?.mana;
		rows.push({ kind: 'pool', key: 'mana', label: 'Mana', value: s.mana, max: s.manaMax, tip: [formula ?? '', 'back on a Safe Rest'].filter(Boolean).join(' · '), rules: mana ? [mana] : [] });
	}

	const rage = has('Rage');
	const rageRow = (): PanelRow | null => (rage ? {
		kind: 'state', key: 'rage', label: rage.name, on: s.conditions.some(c => RAGE.test(c)), text: 'Raging', condition: 'Raging',
		tip: 'until it ends', rules: [{ name: rage.name, text: rage.text }],
	} : null);
	let rageShown = false;

	for (const res of s.resources) {
		const rule = ruleOf(res);
		const key = `res:${res.name}`;
		const rules = res.feature ? rulesFor(res.feature, s.features) : rulesFor(res.name, s.features, rule?.rules);
		const tip = tipFor(res);
		const sides = Number(String(res.die ?? '').replace(/^d/i, '')) || 0;
		if (sides && (rule || (res.max !== undefined && res.max <= 10))) {
			const faces = heldFaces(res.current, res.rolled);
			const room = res.max !== undefined ? Math.max(0, res.max - faces.length) : 1;
			const roll = rule?.gain?.count === 1 ? 1 : room || 1;
			rows.push({ kind: 'dice', key, label: res.name, res, sides, faces, max: res.max, roll, rolledWhen: rule?.rolledWhen ?? 'spent', tip, rules });
			// Rage sits under the dice it rolls.
			if (/fury/i.test(res.name)) { const r = rageRow(); if (r) { rows.push(r); rageShown = true; } }
			continue;
		}
		if (res.max === undefined) { rows.push({ kind: 'charges', key, label: res.name, res, value: res.current, tip, rules }); continue; }
		if (res.max > 10 || /LVL/i.test(res.formula ?? '')) {
			rows.push({ kind: 'number', key, label: res.name, res, value: res.current, max: res.max, spend: /lay on hands/i.test(res.name) ? 'Heal' : 'Spend', tip, rules });
			continue;
		}
		rows.push({ kind: 'uses', key, label: res.name, res, left: res.current, max: res.max, tip, rules });
	}
	if (!rageShown) {
		const r = rageRow();
		const lead = rows.filter(x => x.kind === 'target' || x.kind === 'pool').length;
		if (r) rows.splice(lead, 0, r);
	}
	return rows;
}
