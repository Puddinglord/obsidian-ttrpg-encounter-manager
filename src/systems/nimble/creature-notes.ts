// A player's notes on a creature (`nimble: creature`), as the bestiary shows
// them under the book's lore. Pure, so it's unit-tested.

/** A creature note's text without its properties, empty bullets, or headings with nothing under them yet. */
export function notesBody(text: string): string {
	const lines = text.replace(/^---\n[\s\S]*?\n---\n?/, '').split('\n').filter(l => !/^\s*[-*]\s*$/.test(l));
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const h = lines[i].match(/^(#+)\s/);
		if (h) {
			// Keep a heading only if something but blank lines comes before the next heading of its level or higher.
			let j = i + 1;
			while (j < lines.length && !lines[j].trim()) j++;
			const next = lines[j]?.match(/^(#+)\s/);
			if (j >= lines.length || (next && next[1].length <= h[1].length)) continue;
		}
		out.push(lines[i]);
	}
	return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
