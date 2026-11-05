// 3D dice, loaded on demand. three.js and the renderer are built into a
// separate bundle that ships inside main.js as a string (see
// esbuild.config.mjs); it's only evaluated on the first roll, so plugin
// startup doesn't pay for it.

import RENDERER_SRC from 'dice3d-bundle';
import type { Dice3dOptions, DiceMaterial, Die3d, RollStats } from './renderer';

export type { Dice3dOptions, DiceMaterial, Die3d, RollStats } from './renderer';

export { DICE3D_MATERIALS } from './materials';

interface RendererLib {
	roll: (dice: Die3d[], opts: Dice3dOptions) => Promise<void>;
	stats: { last: RollStats | null };
}

let lib: RendererLib | null = null;
let loadMs = 0;

function load(): RendererLib {
	if (lib) return lib;
	const t0 = performance.now();
	// The bundle is an IIFE that assigns `__nimbleDice3dLib`; keep it local.
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	lib = new Function(`${RENDERER_SRC}\nreturn __nimbleDice3dLib;`)() as RendererLib;
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
			const c = document.createElement('canvas');
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
	await load().roll(dice, opts);
}

/** Timings of the last roll, for tuning (not needed to use the dice). */
export function dice3dLastStats(): (RollStats & { bundleLoadMs: number }) | null {
	const s = lib?.stats.last;
	return s ? { ...s, bundleLoadMs: loadMs } : null;
}
