// How a note points at a compendium entry that isn't a monster. Pure: no
// Obsidian imports.
//
//   `nimble:Goblin`                  a monster (vault or bundled), as before
//   `nimble:spell:Fireball`          a spell
//   `nimble:feature:Lay on Hands`    a class feature or option
//   `nimble:feature:Blur@Zephyr`     the same, when two classes share the name
//   `nimble:Fireball`                no kind: a monster first, then any compendium entry by exact name
//
// Kinds: spell, item, feature, class, subclass, ancestry, background, boon, condition.

import { CompendiumHit, CompendiumKind, nameKey, type Compendium } from './compendium';

export type RefKind = CompendiumKind | 'condition';
export const REF_KINDS: RefKind[] = ['spell', 'item', 'feature', 'class', 'subclass', 'ancestry', 'background', 'boon', 'condition'];

export interface CompendiumRef {
	/** Undefined for a bare `nimble:Name`. */
	kind?: RefKind;
	name: string;
	/** The class or subclass a feature belongs to, for names two classes share. */
	owner?: string;
}

/** Split the text after `nimble:` into kind, name and owner. A leading word that isn't a kind is part of the name. */
export function parseCompendiumRef(text: string): CompendiumRef | null {
	const raw = text.trim();
	if (!raw) return null;
	const m = raw.match(/^([a-z]+)\s*:\s*(.*)$/i);
	const kind = m && (REF_KINDS as string[]).includes(m[1].toLowerCase()) ? m[1].toLowerCase() as RefKind : undefined;
	let name = (kind && m ? m[2] : raw).trim();
	let owner: string | undefined;
	const at = name.lastIndexOf('@');
	if (kind && at >= 0) { owner = name.slice(at + 1).trim() || undefined; name = name.slice(0, at).trim(); }
	return name ? { kind, name, owner } : null;
}

/** The text that goes after `nimble:` for an entry. Monsters stay bare; the owner is added only when the name alone is ambiguous. */
export function formatCompendiumRef(kind: RefKind | 'monster', name: string, owner?: string): string {
	if (kind === 'monster') return name;
	return `${kind}:${name}${owner ? `@${owner}` : ''}`;
}

/** Resolution order for a bare name that isn't a monster. */
const BARE_ORDER: CompendiumKind[] = ['spell', 'item', 'feature', 'class', 'subclass', 'ancestry', 'background', 'boon'];

/** Hits by name key, built once per compendium. */
const byName = new WeakMap<Compendium, Map<string, CompendiumHit[]>>();
function hitsNamed(comp: Compendium, name: string): CompendiumHit[] {
	let m = byName.get(comp);
	if (!m) {
		m = new Map();
		for (const h of comp.all()) {
			const k = nameKey(h.name);
			const list = m.get(k);
			if (list) list.push(h); else m.set(k, [h]);
		}
		byName.set(comp, m);
	}
	return m.get(nameKey(name)) ?? [];
}

/** The entry a reference names, or undefined. Conditions aren't in the compendium data; callers resolve those. */
export function resolveCompendiumRef(comp: Compendium, ref: CompendiumRef): CompendiumHit | undefined {
	if (ref.kind === 'condition') return undefined;
	if (!nameKey(ref.name)) return undefined;
	let hits = hitsNamed(comp, ref.name).filter(h => !ref.kind || h.kind === ref.kind);
	if (!hits.length && (!ref.kind || ref.kind === 'item')) {
		// Items forgive the ways a note writes them ("Javelin", "Club" for "Club/Mace").
		const it = comp.item(ref.name);
		const hit = it && comp.all().find(h => h.kind === 'item' && h.entry === it);
		if (hit) hits = [hit];
	}
	if (!hits.length) return undefined;
	if (ref.owner) {
		const o = nameKey(ref.owner);
		const owned = hits.find(h => nameKey(h.className ?? '') === o || nameKey(h.subclass ?? '') === o);
		if (owned) return owned;
	}
	if (ref.kind) return hits[0];
	return BARE_ORDER.map(kind => hits.find(h => h.kind === kind)).find(Boolean);
}

/** The text after `nimble:` that finds exactly this hit again (adds `@Class` when another entry of its kind shares the name). */
export function refForHit(comp: Compendium, hit: CompendiumHit): string {
	const twins = hitsNamed(comp, hit.name).filter(h => h.kind === hit.kind);
	const owner = twins.length > 1 ? (hit.subclass ?? hit.className) : undefined;
	return formatCompendiumRef(hit.kind, hit.name, owner);
}
