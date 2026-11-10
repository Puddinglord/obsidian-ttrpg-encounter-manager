// From settings to what the renderer draws: a style becomes a DieLook (vault
// textures turned into URLs) and, for imported sets, a model URL per die size.

import { TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../../main';
import { setFileUrl } from './importer';
import type { Die3d, DieLook, Dice3dOptions } from './renderer';
import { DiceSettings, DiceStyle, RollEvent, rollEvent, styleFor } from './styles';

export function lookOf(plugin: NimbleStatblocksPlugin, st: DiceStyle): DieLook {
	let textureUrl: string | undefined;
	if (st.texture.startsWith('vault:')) {
		const f = plugin.app.vault.getAbstractFileByPath(st.texture.slice(6));
		if (f instanceof TFile) textureUrl = plugin.app.vault.getResourcePath(f);
	}
	return {
		body: st.body, label: st.label, outline: st.outline, edge: st.edge, finish: st.finish,
		texture: textureUrl ? 'none' : st.texture, textureUrl, blend: st.blend, font: st.font, labelScale: st.labelScale,
	};
}

/** The model to roll for a die of this size in this style, if its set has one. */
export function modelUrlOf(plugin: NimbleStatblocksPlugin, st: DiceStyle, sides: number): string | undefined {
	if (!st.model) return undefined;
	const set = plugin.settings.dice.sets.find(s => s.id === st.model);
	const rel = set?.models[sides];
	return set && rel ? setFileUrl(plugin, set, rel) : undefined;
}

/** Give each die its style's look and model. A crit's primary die takes the crit style, so every die that crit matches. */
export function dressDice(plugin: NimbleStatblocksPlugin, dice: Die3d[], crit: boolean): Die3d[] {
	const d = plugin.settings.dice;
	return dice.map(die => {
		const role = crit && die.role === 'primary' ? 'explosion' : die.role;
		const st = styleFor(d, { sides: die.sides, role });
		return { ...die, material: undefined, look: lookOf(plugin, st), modelUrl: modelUrlOf(plugin, st, die.sides) };
	});
}

const FORCE = { gentle: 0.65, normal: 1, strong: 1.45 } as const;

/** Motion, shadows and the effect for a roll. */
export function rollOptions(d: DiceSettings, event?: RollEvent): Dice3dOptions {
	return {
		primaryColor: '#7c3aed', diceColor: '#ece6d8',
		scale: d.size, speed: d.speed, force: FORCE[d.throwForce], stayMs: d.stayMs, shadows: d.shadows,
		effect: event ? { event, kind: d.effects[event] } : undefined,
	};
}

export { rollEvent };
