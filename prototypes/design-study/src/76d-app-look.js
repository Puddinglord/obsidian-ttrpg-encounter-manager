/* ============================================================================
   THE WHOLE APP: Obsidian in the active campaign's game, and the tracker as a
   page in a tab. Designed in the plugin (core/app-look.ts, the app bridge in
   styles.css; core/tracker/follow.ts), archived as screenshots (shots/*.png).
   ========================================================================== */
for (const g of ['nimble', '5e']) {
	const def = DEFS[g] && DEFS[g].campaign;
	if (!def) continue;
	const name = g === 'nimble' ? 'Nimble' : '5e';
	def.notes = [...(def.notes || []),
		`<b>All of Obsidian wears the game</b> while one of its campaigns is active: notes and sidebars on the game’s page (<code>--ev-bg</code>), never white; fields and dialogs on its card; the tab bar, title bar, ribbon and status bar a shade deeper, a frame; links and accents in its ink; headings in its face (${g === 'nimble' ? 'Vollkorn heavy italic, ink on the page' : 'EB Garamond small capitals in oxblood'}). It follows the campaign, light and dark; <i>Theme Obsidian to match the game</i> turns it off.`,
		'<b>The body carries only colours and type.</b> Each game’s other tokens stay on its own surfaces, so one game’s extras never reach another game’s surfaces through the page.',
		'<b>The tracker is also a page.</b> The ribbon’s swords open it in a tab, and its ⋯ menu opens it in a tab or the sidebar. As a page it is one column, 920px at most, centred like a note, so a row’s name stays near its HP.',
	];
	def.shots = [...(def.shots || []),
		{ device: 'img', src: `design-study/shots/${g}-app-look.png`, w: 1100, cap: `The whole app in ${name}’s look`, sub: g === 'nimble' ? 'The Campaign panel, a scene with its encounter, the hound fight in the tracker: one page colour, a deeper frame.' : 'Parchment everywhere, the location’s heading in oxblood small capitals, the road ambush in the 5e tracker.' },
		...(g === '5e' ? [{ device: 'img', src: 'design-study/shots/5e-app-look-dark.png', w: 1100, cap: 'The same, dark', sub: 'The game’s dark page and frame; oxblood turns to a warm rose for links and headings.' }] : []),
		{ device: 'img', src: `design-study/shots/${g}-tracker-page.jpg`, w: 1100, cap: 'The tracker as a page', sub: 'Opened from the ribbon: one centred column on the game’s page, the footer under it.' },
	];
}
