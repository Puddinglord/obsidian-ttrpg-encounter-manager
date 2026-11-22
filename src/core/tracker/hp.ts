// The HP command language every tracker shares. Typed in an HP box, or built
// by the HP keypad:
//
//   7     damage          7!  or !7   a crit's damage
//   7v    vulnerable      7r          resisted (with ! in any order)
//   +7    heal            =20         set HP          t5   temporary HP
//
// What the flags do is each game's own (Nimble's armor and crits, 5e's
// doubling and halving). Pure: no Obsidian imports.

export type HpCommand =
	| { kind: 'damage'; amount: number; crit?: boolean; type?: DamageMod }
	| { kind: 'heal'; amount: number }
	| { kind: 'set'; amount: number }
	| { kind: 'temp'; amount: number };

/** v = the attack's damage type is one this creature is vulnerable to; r = resisted. */
export type DamageMod = 'vulnerable' | 'resisted';

export function parseHpCommand(input: string): HpCommand | null {
	let s = input.trim().replace(/−/g, '-').toLowerCase();
	if (!s) return null;
	let crit = false;
	let type: DamageMod | undefined;
	if (s.startsWith('!')) { crit = true; s = s.slice(1).trim(); }
	// suffixes in any order: ! (crit), v (vulnerable), r (resisted)
	for (;;) {
		const last = s.slice(-1);
		if (last === '!') { crit = true; s = s.slice(0, -1).trim(); continue; }
		if (last === 'v' && /\d\s*v$/.test(s)) { type = 'vulnerable'; s = s.slice(0, -1).trim(); continue; }
		if (last === 'r' && /\d\s*r$/.test(s)) { type = 'resisted'; s = s.slice(0, -1).trim(); continue; }
		break;
	}
	const temp = s.match(/^t\s*(\d+)$/);
	if (temp) return { kind: 'temp', amount: Number(temp[1]) };
	const m = s.match(/^([+\-=]?)\s*(\d+)$/);
	if (!m) return null;
	const amount = Number(m[2]);
	if (m[1] === '+') return { kind: 'heal', amount };
	if (m[1] === '=') return { kind: 'set', amount };
	return { kind: 'damage', amount, crit, type };
}
