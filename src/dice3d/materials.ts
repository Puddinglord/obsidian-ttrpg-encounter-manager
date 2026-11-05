// The looks the dice come in, for a settings dropdown. Plain data (no three.js),
// so settings can list them without loading the 3D bundle.

import type { DiceMaterial } from './renderer';

/** Looks for the dice, for a settings dropdown. */
export const DICE3D_MATERIALS: { id: DiceMaterial; label: string }[] = [
	{ id: 'classic', label: 'Classic resin' },
	{ id: 'gem', label: 'Gem (see-through)' },
	{ id: 'metal', label: 'Metal' },
	{ id: 'glitter', label: 'Glitter' },
	{ id: 'lava', label: 'Lava' },
	{ id: 'frost', label: 'Frost' },
	{ id: 'nebula', label: 'Nebula' },
	{ id: 'opal', label: 'Opal' },
	{ id: 'marble', label: 'Marble' },
];
