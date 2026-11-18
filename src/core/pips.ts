// Pips: one rule for every row of them, in every game (actions, Wounds,
// minions, class dice, legendary actions, death saves, spell slots).
// Pure: no Obsidian imports.

/**
 * Tapping a pip: a filled one takes one away, an empty one adds one, whichever
 * pip it is. Counts move one step at a time and never jump to the pip tapped:
 * with 3 of 3 filled, tapping the middle pip leaves 2; tapping it again leaves 1;
 * once more and it's 2 again.
 */
export function pipStep(count: number, filled: boolean, max = Infinity): number {
	return filled ? Math.max(0, count - 1) : Math.min(max, count + 1);
}
