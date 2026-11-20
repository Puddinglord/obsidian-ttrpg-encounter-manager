// Marks the Nimble sheet draws that its dialogs draw too (the character wizard's
// stat boxes): a save's triangle, and a stat written the way the official sheet
// prints it.

/** A save mark, as the official sheet draws it: a triangle on top of a stat's box (▲) or under it (▼). 22 × 10. */
export const saveTriangle = (dir: 'up' | 'down'): string => `<path d="${dir === 'down' ? 'M1 .75 11 9.25l10-8.5' : 'M1 9.25 11 .75l10 8.5'}"/>`;

/** A stat as the official sheet prints it: 3, 0, −1 (no plus). */
export const plainMod = (n: number): string => (n < 0 ? `−${Math.abs(n)}` : String(n));
