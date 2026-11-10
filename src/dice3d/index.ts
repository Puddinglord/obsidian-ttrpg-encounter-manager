// 3D dice, loaded on demand. three.js and the renderer sit behind a dynamic
// import; esbuild (cjs, no splitting) inlines it into main.js inside a lazy
// module initializer, so three.js only runs on the first roll and plugin
// startup doesn't pay for it.

import type { Dice3dOptions, DiceMaterial, Die3d, DieLook, RollStats } from './renderer';

export type { Dice3dOptions, DiceMaterial, Die3d, DieLook, RollStats } from './renderer';

export { DICE3D_MATERIALS } from './materials';

interface RendererLib {
	roll: (dice: Die3d[], opts: Dice3dOptions) => Promise<void>;
	preview: (canvas: HTMLCanvasElement, die: { sides: number; look: DieLook; modelUrl?: string }) => () => void;
	stats: { last: RollStats | null };
}

let lib: RendererLib | null = null;
let loadMs = 0;

async function load(): Promise<RendererLib> {
	if (lib) return lib;
	const t0 = performance.now();
	lib = await import('./renderer');
	loadMs = performance.now() - t0;
	return lib;
}

let webgl: boolean | null = null;

/** WebGL is available and the user hasn't asked for reduced motion. */
export function dice3dSupported(): boolean {
	if (typeof window === 'undefined') return false;
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
	if (webgl === null) {
		try {
			const c = createEl('canvas');
			webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
		} catch {
			webgl = false;
		}
	}
	return webgl;
}

/** Throw the dice; resolves once they've all landed (explosions included). */
export async function roll3d(dice: Die3d[], opts: Dice3dOptions): Promise<void> {
	if (!dice.length || !dice3dSupported()) return;
	await (await load()).roll(dice, opts);
}

/** A slowly turning die on `canvas`, for settings. Returns a function that stops it (it also stops when the canvas leaves the page). */
export async function preview3d(canvas: HTMLCanvasElement, die: { sides: number; look: DieLook; modelUrl?: string }): Promise<() => void> {
	if (!dice3dSupported()) return () => {};
	return (await load()).preview(canvas, die);
}

/** Timings of the last roll, for tuning (not needed to use the dice). */
export function dice3dLastStats(): (RollStats & { bundleLoadMs: number }) | null {
	const s = lib?.stats.last;
	return s ? { ...s, bundleLoadMs: loadMs } : null;
}

/**
 * The dice to throw for a roll that's already decided. For a Nimble attack the
 * first die is the primary; dice past `count` are crit explosions. On a crit the
 * primary die takes the crit look too, so every die that crit burns the same way.
 */
export function diceForRoll(sides: number, count: number, rolls: number[], nimble: boolean, critMaterial?: DiceMaterial): Die3d[] {
	const crit = nimble && rolls.length > count;
	return rolls.map((value, i) => {
		const role: Die3d['role'] = nimble && i === 0 ? 'primary' : i >= count ? 'explosion' : 'normal';
		const die: Die3d = { sides, value, role };
		if (crit && critMaterial && (i === 0 || i >= count)) die.material = critMaterial;
		return die;
	});
}
