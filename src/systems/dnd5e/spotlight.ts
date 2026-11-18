// 5e in Spotlight (app/spotlight.ts): the campaign's monsters (your ```5e notes,
// then the edition's SRD ones) with their CR, the edition's compendium (spells,
// items, classes, rules), and the 5e compendium's search language for typed
// filters ("school:evocation", "cr:1-4"). The Nimble bestiary and compendium stay out.

import type EmberVaultPlugin from '../../../main';
import { fuzzyRank } from '../../core/compendium/query';
import { compendiumFilters, SpotlightLook, SpotlightRow, SpotlightSource } from '../../core/spotlight-source';
import { Hit5e, KIND5E } from './compendium';
import { Entry5e, KIND_LABEL_5E, QUERY_5E } from './compendium-entries';
import { source5e } from './compendium-view';
import { dnd5e } from './runtime';
import type { Dnd5eEntry } from './types';

export function dnd5eSpotlight(plugin: EmberVaultPlugin): SpotlightSource {
	const rt = dnd5e();
	const path = () => plugin.campaigns.active?.home.path;
	const edition = () => rt.edition(path());

	const monsterLook = (entry: Dnd5eEntry, kind: string, badge?: string): SpotlightLook => {
		const m = entry.monster;
		if (plugin.hideStats(entry.filePath)) return { kind, icon: 'paw-print', title: entry.name, meta: [m.size, m.type].filter(Boolean).join(' '), tag: 'Creature' };
		return {
			kind, iconClass: ['nimble-spot-level'], badge: badge ?? m.cr, title: entry.name, tag: 'Adversary',
			meta: [`CR ${m.cr}`, [m.size, m.type].filter(Boolean).join(' '), entry.bundled ? m.source : 'your note'].filter(Boolean).join(' · '),
		};
	};
	const hitLook = (hit: Hit5e, kind: string): SpotlightLook => ({ kind, icon: KIND5E[hit.kind].icon, title: hit.name, meta: hit.detail, tag: KIND5E[hit.kind].label });
	const quickLook = (entry: Dnd5eEntry) => rt.quickLook(entry, path() ?? '');
	const card = (hit: Hit5e) => rt.openCard(hit, path() ?? '');

	/** An entry of the compendium's search (with filters). */
	const entryRow = (e: Entry5e): SpotlightRow => {
		const look = e.monster ? monsterLook(e.monster, 'entry', e.badge ?? '–') : hitLook(e.hit!, 'entry');
		return {
			look: { ...look, title: e.name, meta: e.detail, tag: KIND_LABEL_5E(e.kind) },
			names: [e.name], order: e.monster ? 0 : 4,
			open: () => (e.monster ? quickLook(e.monster) : card(e.hit!)),
		};
	};
	const entries = source5e(rt, edition, () => path() ?? '');

	return {
		results(q) {
			const at = path();
			const ed = edition();
			const monsters = fuzzyRank(rt.index.all(ed, at), q.text, e => [e.name, e.monster.type ?? ''], 10, true).map(x => x.item);
			// Spells, items, classes, rules…: the edition's compendium (its conditions are Spotlight's own rows).
			const hits = fuzzyRank(rt.hits(ed, at).filter(h => h.kind !== 'condition'), q.text, h => [h.name], 8, true).map(x => x.item);
			return {
				rows: [
					...monsters.map((entry): SpotlightRow => ({ look: monsterLook(entry, 'dnd5e'), names: [entry.name], others: [entry.monster.type ?? ''], order: 0, open: () => quickLook(entry) })),
					...hits.map((hit): SpotlightRow => ({ look: hitLook(hit, 'dnd5eHit'), names: [hit.name], others: [hit.detail], order: 4, open: () => card(hit) })),
				],
			};
		},
		filters: compendiumFilters({ query: QUERY_5E, all: 'all', entries: () => entries.entries(plugin.hideStats()), row: entryRow }),
		lookup: (query) => { void rt.openCompendium({ query, path: path() }); },
	};
}
