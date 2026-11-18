// A game's look: everything drawn for one game carries `.ev-sys-<id>`, and
// styles.css (the GAME LOOKS section) gives each game its colour, paper and type
// through shared tokens (--ev-accent, --ev-paper, --ev-display-font…). Core marks
// the surfaces it draws for a game (the builder, note cards, quick looks); a game
// marks its own (sheet, tracker, stat blocks). A new game adds its tokens under
// its class and every shared surface follows.

const PREFIX = 'ev-sys-';

/** The class for a game's surfaces. */
export function lookClass(systemId: string): string {
	return `${PREFIX}${systemId}`;
}

/** Mark `el` as drawn for this game (and no other). */
export function applyLook(el: HTMLElement, systemId: string | undefined): void {
	for (const c of Array.from(el.classList)) if (c.startsWith(PREFIX)) el.classList.remove(c);
	if (systemId) el.classList.add(lookClass(systemId));
}
