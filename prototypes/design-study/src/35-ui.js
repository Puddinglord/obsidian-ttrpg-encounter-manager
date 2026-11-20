/* ============================================================================
   Shared UI contract (design-system lead). Stable; game files may use all of it.

   CLUSTERS: buttons that belong together sit in one cluster; clusters sit in a
   row with clear space between them and never wrap into a ragged second row:
   a cluster that doesn't fit moves down as a unit, and every cluster on a line
   stretches so each line is full.
     clusters(cluster([rollBtn]), cluster([passed, failed], { joined: true }), cluster([later], { end: true }))
     <div class="ev-clusters">
       <div class="ev-cluster" role="group">…buttons…</div>
       <div class="ev-cluster is-joined" role="group" aria-label="Rolled at the table">…Passed, Failed…</div>
       <div class="ev-cluster is-end" role="group">…Later…</div>
     </div>
     is-joined  a segmented pair or set (an answer: Passed | Failed, Keep | End it; a pick-one)
     is-end     quiet trailing actions (Later, Skip, Not now): pushed right, never stretched
     is-fixed   don't stretch this cluster's buttons
   promptCard({ acts }) and moment({ acts }) take clusters, an array of arrays (one per cluster), or a flat
   list of buttons (sorted into clusters by what they say: rolls, answers, choices, later).

   TICKER: the round and the turn, as a muted strip above the card. One line, never overlaps.
     ticker({ round: 3, turn: 'Goblin Boss’s turn', note: '2 of 6 acted' })
     <div class="ev-ticker" role="status">
       <span class="ev-ticker-round">Round <b>3</b></span>
       <span class="ev-ticker-turn">Goblin Boss’s turn</span>
       <span class="ev-ticker-note">2 of 6 acted</span>
     </div>
     round may be a string ('Setup', 'Before the fight'); turn and note are optional.

   GALLERIES: a game page's view tiles are moments of one design, not options. Give each
     { state: 'Before the fight', diff: 'one line on what’s different here', render, … }
     (viewTile shows state || cap, then diff || sub). rec: true is ignored: nothing is being chosen.
     Suggested names: 'Before the fight', 'On a monster’s turn', 'On a hero’s turn', 'A hero at 0 HP',
     'At the end of a turn' (prompts), 'Taking damage' (keypad), 'Adding a condition', 'Wider pane', 'Phone'.
     Layout concepts (def.concepts) are drawn folded as History, with the decision: card and queue.

   ICON-ONLY BUTTONS: btn({ kind: 'icon', icon: 'tag' }) centres the glyph's ink; don't nudge it.
   ICONS NEXT TO TEXT in your own components: add class ev-cap-align to the container (or translateY by
     var(--g-icon-dy)) so the icon meets the capitals of your face. Set --g-icon-dy on a container that uses
     another face (e.g. 5e's Garamond small caps: about 0.12em).

   LABELS: button labels are short, without articles: "Roll save (+1)", not "Roll the save (+1)".
   btn() drops a leading article after the verb for you (shortLabel); write them short anyway.
   ========================================================================== */

/** "Roll the save (+1)" -> "Roll save (+1)"; "Add a condition" -> "Add condition". */
function shortLabel(t) { return t.replace(/^(\w+) (the|a|an) (?=\S)/i, '$1 '); }

function cluster(items, opts = {}) {
	const cls = ['ev-cluster'];
	if (opts.joined) cls.push('is-joined');
	if (opts.end) cls.push('is-end');
	if (opts.fixed) cls.push('is-fixed');
	return h('div.' + cls.join('.'), { role: 'group', 'aria-label': opts.label }, opts.caption ? h('span.ev-cluster-l', opts.caption) : null, items);
}
function clusters(...groups) { return h('div.ev-clusters', groups.flat()); }

const ANSWER = /^(Passed|Failed|Pass|Fail|Success|Failure|Saved|Hit|Miss|Keep|End it|Yes|No)\b/i;
const LATER = /^(Later|Skip|Not yet|Not now|Dismiss|Close)\b/i;
/** Turn what a prompt was given into clusters. */
function toClusters(acts) {
	if (!acts || !acts.length) return null;
	if (acts.length === 1 && acts[0].classList && acts[0].classList.contains('ev-clusters')) return acts[0];
	if (acts.some(a => Array.isArray(a))) return clusters(acts.map(a => Array.isArray(a) ? cluster(a) : a));
	if (acts.every(a => a.classList && a.classList.contains('ev-cluster'))) return clusters(acts);
	const label = b => (b.getAttribute('aria-label') || b.textContent || '').trim();
	const roll = [], answer = [], choice = [], later = [];
	for (const b of acts) {
		const t = label(b);
		if (LATER.test(t) || (b.classList.contains('is-quiet') && b.classList.contains('is-icon'))) later.push(b);
		else if (ANSWER.test(t)) answer.push(b);
		else if (b.classList.contains('is-primary') || /^Roll\b/.test(t)) roll.push(b);
		else choice.push(b);
	}
	const out = [];
	if (roll.length) out.push(cluster(roll));
	if (answer.length) out.push(cluster(answer, { joined: true, label: 'Rolled at the table' }));
	if (choice.length) out.push(cluster(choice, { joined: choice.length > 1 && !roll.length && !answer.length }));
	if (later.length) out.push(cluster(later, { end: true }));
	return clusters(out);
}

/** The round and the turn: a muted strip above the card. */
function ticker({ round, turn, note, cls = '' } = {}) {
	const r = typeof round === 'number' ? h('span.ev-ticker-round', 'Round ', h('b.ev-num', String(round))) : round ? h('span.ev-ticker-round', h('b', round)) : null;
	return h('div.ev-ticker' + (cls ? '.' + cls : ''), { role: 'status' },
		r,
		turn ? h('span.ev-ticker-turn', turn) : null,
		note ? h('span.ev-ticker-note', note) : null);
}
