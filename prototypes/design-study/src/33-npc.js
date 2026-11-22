/* ============================================================================
   The shared NPC card. Same frame in every game; each game adds its own
   stats in its own words. GM view and player view (written from outside).
   ========================================================================== */
const PILL = { alive: 'Alive', dead: 'Dead', missing: 'Missing', unknown: 'Unknown', friendly: 'Friendly', neutral: 'Neutral', hostile: 'Hostile' };

/**
 * npc: { name, role, facts: 'Human · she/her · 50s', links: [[icon, label, value]], status, attitude, rows: [[label, text]], secret }
 * extras: an element the game draws under the facts (its stats and the link to its stat block), GM only.
 * mode: 'gm' | 'player'. Players see their own notes ("What we know"), never stats or secrets.
 */
function npcCard(npc, { extras, mode = 'gm', size = 'full' } = {}) {
	const player = mode === 'player';
	const rows = player ? npc.playerRows : npc.rows;
	return h('div.npc' + (player ? '.is-player' : '') + (size === 'compact' ? '.is-compact' : ''),
		h('div.npc-art', portrait(npc.name, size === 'compact' ? 64 : 150, 'tall')),
		h('div.npc-body',
			h('h3.npc-name', npc.name),
			h('div.npc-role', npc.role),
			h('div.npc-facts', npc.facts),
			npc.links ? h('div.npc-links', (player ? npc.links.filter(l => l[1] !== 'Faction') : npc.links).map(([ic, l, v]) => h('span', icon(ic, 13), h('small', l), v))) : null,
			h('div.npc-pills', h('span.npc-pill.st-' + npc.status, PILL[npc.status]), h('span.npc-pill.at-' + npc.attitude, PILL[npc.attitude])),
			player ? null : extras || null,
			h('div.npc-rows', player ? h('div.npc-rows-h', icon('feather', 13), 'What we know · your notes') : null,
				rows.map(([k, v]) => h('div.npc-row', h('span.k', k), h('span.v', v))),
				!player && npc.secret ? h('div.npc-row.secret', h('span.k', icon('eye', 13), 'Secret'), h('span.v', npc.secret)) : null)));
}
