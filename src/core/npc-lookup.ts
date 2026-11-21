// Which NPC note a name in one of our blocks means: "Ysolde Krenn" in an encounter block's list, or
// the name inside a [[link]] there. A game's encounter block asks this when a name isn't one of its
// monsters, or first when it's written as a link. Pure: no Obsidian imports.

/** What the lookup needs of an NPC note (core's NpcInfo has more). */
export interface NpcRef {
	path: string;
	/** The note's name (its file name). */
	name: string;
	aliases: string[];
}

const norm = (s: string) => s.trim().replace(/\.md$/i, '').replace(/\s+/g, ' ').toLowerCase();

/**
 * The NPC `name` names, among those `visible` (the block's campaign's, by the plugin's rule): a path
 * ("NPCs/Ysolde Krenn") matches the end of a note's path; a name matches a note's name, then an alias.
 * Case doesn't matter. Undefined when nothing matches.
 */
export function findNpc<T extends NpcRef>(npcs: readonly T[], name: string, visible: (n: T) => boolean = () => true): T | undefined {
	const q = norm(name.replace(/^\[\[/, '').replace(/(?:[|#][^\]]*)?\]\]$/, ''));
	if (!q) return undefined;
	const seen = npcs.filter(visible);
	if (q.includes('/')) {
		return seen.find((n) => {
			const p = norm(n.path);
			return p === q || p.endsWith(`/${q}`);
		});
	}
	return seen.find(n => norm(n.name) === q) ?? seen.find(n => n.aliases.some(a => norm(a) === q));
}
