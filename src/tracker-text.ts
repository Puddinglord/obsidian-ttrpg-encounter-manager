// Text parsing for the tracker's controls. Pure: no Obsidian imports, so it's easy to test.

/** "3 goblin", "3x goblin", "3× goblin" → count and query. */
export function parseCountQuery(input: string): { count: number; query: string } {
	const t = input.trim();
	const m = t.match(/^(\d+)\s*[x×]?\s+(.*)$/i);
	if (!m) return { count: 1, query: t };
	return { count: Math.max(1, Math.min(50, Number(m[1]))), query: m[2].trim() };
}

/** One legendary choice, read from its stat block line: "**Metallic Burst.** Cone 3. DEX save DC 12 or take 2d6…". */
export interface LegendaryOption { name: string; text: string; tag?: string; dice?: string; save: boolean }

export function legendaryOption(raw: string): LegendaryOption {
	const t = raw.trim();
	const bold = t.match(/^\*\*([^*]+?)\.?\*\*\s*(.*)$/s);
	const plain = !bold ? t.match(/^([^.:]{2,40})[.:]\s+(.*)$/s) : null;
	const name = (bold?.[1] ?? plain?.[1] ?? t.split(/\s+/).slice(0, 3).join(' ')).trim();
	const text = (bold?.[2] ?? plain?.[2] ?? t).trim();
	const tag = text.match(/\b(Reach|Range|Cone|Line|Burst|Aura)\s*\d+/i)?.[0];
	const dice = text.match(/\b\d*d\d+(?:\s*[+\-−]\s*\d+)?/i)?.[0]?.replace(/\s+/g, '').replace(/−/g, '-');
	return { name, text, tag, dice, save: /\bsave\b/i.test(text) };
}
