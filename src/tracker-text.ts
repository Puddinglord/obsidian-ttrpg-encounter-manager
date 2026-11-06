// Text parsing for the tracker's controls. Pure: no Obsidian imports, so it's easy to test.

/** "3 goblin", "3x goblin", "3× goblin" → count and query. */
export function parseCountQuery(input: string): { count: number; query: string } {
	const t = input.trim();
	const m = t.match(/^(\d+)\s*[x×]?\s+(.*)$/i);
	if (!m) return { count: 1, query: t };
	return { count: Math.max(1, Math.min(50, Number(m[1]))), query: m[2].trim() };
}
