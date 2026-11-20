// Nimble in Spotlight (app/spotlight.ts): adversaries (Enter a quick look,
// Cmd/Ctrl+Enter adds one to the encounter, "3 goblin" adds three), the player
// compendium (spells, items, features…), and the compendium's search language
// for typed filters ("school:fire", "tier:cantrip").

import type EmberVaultPlugin from '../../../main';
import { compendiumFilters, SpotlightRow, SpotlightSource } from '../../core/spotlight-source';
import { CompendiumHit, KIND_LABEL } from './compendium';
import { compendiumEntries } from './compendium-browser';
import { CompendiumCardModal, compendiumGlyph, CONDITION_GLYPH } from './compendium-card';
import { evIcon } from '../../core/icons';
import { Entry, ENTRY_KIND_LABEL } from './compendium-entries';
import { openCompendiumSearch, openEntry } from './compendium-modal';
import { fuzzyRank, NIMBLE_QUERY, search } from './compendium-query';
import { openRecord } from './record-modal';
import { formatLevel, monsterRole } from './rules';
import { nimble } from './runtime';
import { describeMonster } from './suggest';
import type { MonsterIndexEntry } from './types';

export function nimbleSpotlight(plugin: EmberVaultPlugin): SpotlightSource {
	// Players look monsters up; they don't add them to fights.
	const player = plugin.playerView();
	const add = (e: MonsterIndexEntry, count: number) => void nimble().addToEncounter(e.monster, e.filePath || undefined, count);

	const monsterRow = (entry: MonsterIndexEntry, count: number, adding: boolean): SpotlightRow => {
		const m = entry.monster;
		const look: SpotlightRow['look'] = plugin.hideStats(entry.filePath)
			// Player view: what a hero could know, no level.
			? {
				kind: 'monster', icon: evIcon('paw-print'), title: entry.name, tag: 'Creature',
				meta: [m.group, [m.size !== 'Medium' ? m.size : '', m.type].filter(Boolean).join(' '), m.habitat].filter(Boolean).join(' · '),
			}
			: {
				kind: 'monster', iconClass: ['nimble-spot-level', `role-${monsterRole(m)}`], badge: formatLevel(m.level) || '–',
				title: adding ? `Add ${count} × ${entry.name}` : entry.name,
				meta: `${describeMonster(entry)}${entry.bundled ? (m.source ? ` · ${m.source}` : '') : ' · your note'}`,
				tag: adding ? 'Add to encounter' : 'Adversary',
			};
		return {
			look, names: [entry.name], others: [m.group ?? ''], order: 0,
			open: () => (adding ? add(entry, count) : openRecord(plugin, { kind: 'monster', entry })),
			// Add and keep searching, to build a fight in one go.
			alt: player ? undefined : () => add(entry, count),
		};
	};

	const hitRow = (e: Entry, h: CompendiumHit): SpotlightRow => ({
		look: { kind: 'compendium', iconClass: [`cmp-${h.kind}`], icon: compendiumGlyph(h), title: h.name, draft: h.draft, meta: h.detail, tag: KIND_LABEL[h.kind] },
		names: [e.name], others: [e.detail], order: 4,
		open: () => {
			const m = new CompendiumCardModal(plugin.app, plugin, h);
			m.open();
			return m;
		},
	});

	/** An entry of the compendium's search (with filters): monsters, NPCs, spells, rules… */
	const entryRow = (e: Entry): SpotlightRow => {
		const look: SpotlightRow['look'] = { kind: 'entry', title: e.name, meta: e.detail, tag: ENTRY_KIND_LABEL[e.kind] };
		if (e.monster && !plugin.hideStats(e.monster.filePath)) {
			look.iconClass = ['nimble-spot-level', `role-${monsterRole(e.monster.monster)}`];
			look.badge = e.badge ?? '–';
		} else if (e.hit) {
			look.iconClass = [`cmp-${e.hit.kind}`];
			look.icon = compendiumGlyph(e.hit);
		} else look.icon = e.monster ? evIcon('paw-print') : e.npc ? evIcon('user') : e.condition ? CONDITION_GLYPH : evIcon('scales');
		return { look, names: [e.name], order: 4, open: () => openEntry(plugin, e) };
	};

	return {
		results(q, input) {
			// Typo matches ("zombieq") are kept: Spotlight shows them only when nothing matches outright.
			const mons = fuzzyRank(nimble().index.all(), q.text, e => [e.name, e.monster.group ?? ''], q.counted ? 20 : 8, true);
			const rows = mons.map(x => monsterRow(x.item, q.count, false));
			// Spells, items, class features…: the compendium's own search (typo-tolerant, typed filters).
			const cmp = search(compendiumEntries(plugin), input.trim(), { segment: 'all', only: e => !!e.hit, limit: 8 });
			const hits = cmp.entries.map(e => hitRow(e, e.hit!));
			// Typed filters ("school:fire") are the compendium's language: just its results.
			if (cmp.parsed.filters.length || cmp.parsed.segment) return { rows: hits, only: true };
			return { rows: [...rows, ...hits] };
		},
		adding(q) {
			if (player) return undefined;
			// "3 goblin" is about adding monsters: the names that match, else the closest typos.
			const mons = fuzzyRank(nimble().index.all(), q.text, e => [e.name, e.monster.group ?? ''], 20, true);
			const named = mons.filter(x => !x.fuzzy).map(x => x.item);
			return (named.length ? named : mons.map(x => x.item).slice(0, 5)).map(e => monsterRow(e, q.count, true));
		},
		filters: compendiumFilters({ query: NIMBLE_QUERY, all: 'all', entries: () => compendiumEntries(plugin), row: entryRow }),
		lookup: (query) => openCompendiumSearch(plugin, query),
	};
}
