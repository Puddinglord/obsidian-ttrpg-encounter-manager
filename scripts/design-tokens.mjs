// Each game's design tokens, from the design study into styles.css (between the GAME TOKENS markers).
// The study sets them as --g-* on .g-<game>; the plugin reads them as --ev-* on .ev-sys-<id>, in light and
// dark. A game's private tokens (--x5-*, --xn-*) keep their names. Run after changing a game's tokens in
// the study, so the two never disagree:
//
//   node scripts/design-tokens.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const GAMES = [['nimble', 'nimble'], ['5e', 'dnd5e']]; // [study class, plugin system id]
const START = '/* ===== GAME TOKENS (generated from the design study by scripts/design-tokens.mjs; do not edit by hand) ===== */';
const END = '/* ===== end GAME TOKENS ===== */';
const dir = new URL('../prototypes/design-study/src/', import.meta.url);
const css = readdirSync(dir).filter(f => f.endsWith('.css')).sort().map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n');

/** Every custom property set by a rule whose selector is exactly `selector`, in file order (later wins). */
function tokens(selector) {
	const out = new Map();
	const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	for (const m of css.matchAll(new RegExp(`(?:^|\\n|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))) {
		const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
		for (const d of body.split(/;(?![^(]*\))/)) {
			const i = d.indexOf(':');
			if (i < 0) continue;
			const k = d.slice(0, i).trim(), v = d.slice(i + 1).trim();
			if (k.startsWith('--') && v) out.set(k, v);
		}
	}
	return out;
}
const rename = k => k.startsWith('--g-') ? '--ev-' + k.slice(4) : k;
const block = (sel, map) => `${sel} {\n${[...map].map(([k, v]) => `\t${rename(k)}: ${v};`).join('\n')}\n}`;

const parts = [];
for (const [study, id] of GAMES) {
	parts.push(block(`.ev-sys-${id}`, tokens(`.g-${study}`)));
	parts.push(block(`.theme-dark .ev-sys-${id}`, tokens(`html[data-theme="dark"] .g-${study}`)));
}
const path = new URL('../styles.css', import.meta.url);
let out = readFileSync(path, 'utf8');
const gen = `${START}\n${parts.join('\n')}\n${END}`;
const a = out.indexOf(START), b = out.indexOf(END);
if (a >= 0 && b > a) out = out.slice(0, a) + gen + out.slice(b + END.length);
else {
	const at = out.indexOf('/* A game that sets its own colour');
	out = out.slice(0, at) + gen + '\n' + out.slice(at);
}
writeFileSync(path, out);
console.log(parts.map(p => p.split('\n')[0] + ' ' + (p.split('\n').length - 2) + ' tokens').join('\n'));
