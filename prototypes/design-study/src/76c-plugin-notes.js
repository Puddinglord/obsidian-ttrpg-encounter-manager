/* ============================================================================
   What building the first wave in the plugin decided, where it differs from the
   mocks above. Kept beside the surfaces so the study stays the reference.
   ========================================================================== */
for (const g of ['nimble', '5e']) {
	const add = (s, notes) => { if (DEFS[g] && DEFS[g][s]) DEFS[g][s].notes = [...(DEFS[g][s].notes || []), ...notes]; };
	add('campaign', [
		'<b>In the plugin:</b> the GM/Player tag and a session’s quest moves (Advanced, New, Done, Failed) are dark tags with white text (rule 14); loot stays as light item chips.',
		'<b>Cards replace sections, never repeat them:</b> the note’s Objectives, The truth, Recap, Loot and Next time sections and its inline title are hidden in reading view when the card shows them.',
		g === 'nimble' ? '<b>A place’s monsters</b> are the standard <code>nimble:</code> reference pills, so references look the same everywhere (not the dark skull chips drawn here).' : '<b>The read-aloud box</b> comes from a place’s <code>read_aloud:</code> property.',
	]);
	add('npc', ['<b>Under 420px</b> the card keeps the portrait as a thumbnail beside the name rather than stacking the 150px portrait: in Obsidian’s page preview the stacked portrait took more than half the card.']);
}
