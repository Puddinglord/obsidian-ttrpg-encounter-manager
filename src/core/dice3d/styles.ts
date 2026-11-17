// Dice styles: how a die looks (colours, finish, texture, font, or an imported
// 3D model), which style each kind of die uses, and how the dice move. Plain
// data, no three.js, so settings and tests can use it without the 3D bundle.

/** The surface. The first group are real materials; the second are our animated looks. */
export const FINISHES = [
	{ id: 'plastic', label: 'Plastic' },
	{ id: 'resin', label: 'Resin (soft gloss)' },
	{ id: 'pristine', label: 'Pristine (clear coat)' },
	{ id: 'velvet', label: 'Velvet' },
	{ id: 'stone', label: 'Stone' },
	{ id: 'wood', label: 'Wood' },
	{ id: 'metal', label: 'Metal' },
	{ id: 'chrome', label: 'Chrome' },
	{ id: 'glass', label: 'Glass (see-through)' },
	{ id: 'frosted', label: 'Frosted glass' },
	{ id: 'iridescent', label: 'Iridescent' },
	{ id: 'lava', label: 'Lava (animated)' },
	{ id: 'nebula', label: 'Nebula (animated)' },
	{ id: 'opal', label: 'Opal (animated)' },
	{ id: 'frost', label: 'Frost (animated)' },
	{ id: 'marble', label: 'Marble (animated)' },
	{ id: 'glitter', label: 'Glitter (animated)' },
] as const;
export type Finish = typeof FINISHES[number]['id'];

/** Textures we draw ourselves (no image files, so nothing to license). */
export const TEXTURES = [
	{ id: 'none', label: 'None' },
	{ id: 'speckles', label: 'Speckles' },
	{ id: 'marble', label: 'Marble veins' },
	{ id: 'wood', label: 'Wood grain' },
	{ id: 'stone', label: 'Stone' },
	{ id: 'clouds', label: 'Clouds' },
	{ id: 'stars', label: 'Stars' },
	{ id: 'swirl', label: 'Swirl' },
	{ id: 'scales', label: 'Dragon scales' },
	{ id: 'paper', label: 'Parchment' },
	{ id: 'hex', label: 'Hex grid' },
] as const;
export type BuiltinTexture = typeof TEXTURES[number]['id'];

/** How a texture combines with the body colour (canvas blend modes). */
export const BLENDS = [
	{ id: 'multiply', label: 'Multiply (darken)' },
	{ id: 'overlay', label: 'Overlay' },
	{ id: 'soft-light', label: 'Soft light' },
	{ id: 'screen', label: 'Screen (lighten)' },
	{ id: 'source-over', label: 'Paint over' },
	{ id: 'hue', label: 'Tint to body colour' },
] as const;
export type Blend = typeof BLENDS[number]['id'];

export const FONTS = [
	{ id: 'inter', label: 'Sans (default)', css: '"Inter", "Helvetica Neue", Arial, sans-serif', weight: 800 },
	{ id: 'serif', label: 'Serif', css: 'Georgia, "Times New Roman", serif', weight: 700 },
	{ id: 'mono', label: 'Monospace', css: '"JetBrains Mono", Menlo, Consolas, monospace', weight: 700 },
	{ id: 'rounded', label: 'Rounded', css: '"Arial Rounded MT Bold", "Nunito", "Varela Round", sans-serif', weight: 800 },
	{ id: 'blackletter', label: 'Old style', css: '"Luminari", "Papyrus", "Palatino", serif', weight: 700 },
	{ id: 'theme', label: 'Same as Obsidian', css: 'var(--font-interface)', weight: 700 },
] as const;
export type FontId = typeof FONTS[number]['id'];

export interface DiceStyle {
	id: string;
	name: string;
	/** Body colour; several colours = each die picks one (a mixed set). */
	body: string[];
	label: string;
	outline: string;
	/** Edge lines between faces; '' for none. */
	edge: string;
	finish: Finish;
	/** A built-in texture id, or "vault:<path>" for an image in the vault. */
	texture: string;
	blend: Blend;
	font: FontId;
	/** Size of the numbers, 0.6–1.4. */
	labelScale: number;
	/** An imported dice set whose 3D models replace the dice it has (d20, d6…). */
	model?: string;
}

/** A dice set imported from Dice So Nice / The Rollsmith. Its files live in the plugin folder. */
export interface ImportedSet {
	id: string;
	name: string;
	author?: string;
	version?: string;
	/** Model file (relative to the set's folder) for each die size it has. */
	models: Partial<Record<number, string>>;
	/** When it was imported (ms). */
	added: number;
}

export const EFFECTS = [
	{ id: 'none', label: 'None' },
	{ id: 'ring', label: 'Ring burst' },
	{ id: 'sparks', label: 'Sparks' },
	{ id: 'embers', label: 'Embers' },
	{ id: 'stars', label: 'Starburst' },
	{ id: 'twinkle', label: 'Twinkling stars' },
	{ id: 'shooting', label: 'Shooting stars' },
	{ id: 'nebula', label: 'Nebula' },
	{ id: 'supernova', label: 'Supernova' },
	{ id: 'arcane', label: 'Arcane circle' },
	{ id: 'confetti', label: 'Confetti' },
	{ id: 'smoke', label: 'Smoke' },
	{ id: 'shatter', label: 'Shatter' },
	{ id: 'gloom', label: 'Gloom' },
] as const;
export type EffectId = typeof EFFECTS[number]['id'];

/** What happened, for effects: an attack miss or crit, or every die on its highest or lowest face. */
export type RollEvent = 'crit' | 'miss' | 'max' | 'min';

/** Each event's own colour for effects that take one (the ring burst): gold for a crit, red for a miss. */
export const EVENT_TINT: Record<RollEvent, string> = { crit: '#f2b705', miss: '#e0242c', max: '#f2b705', min: '#7b3fe4' };

export type DieKey = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';
export const DIE_KEYS: DieKey[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

export interface DiceSettings {
	/** Your own and imported styles (the built-in presets live in code). */
	styles: DiceStyle[];
	/** Style for the other dice. */
	normal: string;
	/** Style for the primary die of an attack; '' = same as the other dice. */
	primary: string;
	/** Style for crit (exploding) dice; '' = same as the primary die. */
	crit: string;
	/** Per die size, overriding the other-dice style. */
	perDie: Partial<Record<DieKey, string>>;
	/** Dice size on screen, 0.5–3. */
	size: number;
	/** Playback speed, 0.5–2. */
	speed: number;
	throwForce: 'gentle' | 'normal' | 'strong';
	/** How long the dice stay after landing, ms. */
	stayMs: number;
	shadows: 'off' | 'soft' | 'sharp';
	effects: Record<RollEvent, EffectId>;
	sets: ImportedSet[];
}

const style = (id: string, name: string, s: Partial<DiceStyle>): DiceStyle => ({
	id, name, body: ['#ece6d8'], label: '#1d1a17', outline: '', edge: '', finish: 'plastic', texture: 'none', blend: 'multiply', font: 'inter', labelScale: 1, ...s,
});

/** The presets that ship with the plugin. Ids are stable: settings point at them. */
export const PRESETS: DiceStyle[] = [
	style('ember', 'Ember Vault', { body: ['#7c3aed'], label: '#fbf8f2', outline: '#2e1065', edge: '#4c1d95', finish: 'resin' }),
	style('bone', 'Bone', { body: ['#ece6d8'], label: '#1d1a17', edge: '#a39b8b', finish: 'plastic' }),
	style('molten', 'Molten', { body: ['#e0a030'], label: '#fff1d6', outline: '#140800', finish: 'lava' }),
	style('rainbow', 'Rainbow sheen', { body: ['#ff5f6d', '#ffc371', '#47e891', '#3fa7ff', '#a76bff'], label: '#ffffff', outline: '#1b1814', finish: 'iridescent' }),
	style('obsidian', 'Obsidian glass', { body: ['#1b1622'], label: '#f2c14e', outline: '#000000', finish: 'glass' }),
	style('gilded', 'Gilded', { body: ['#d4a73a'], label: '#3a2a08', finish: 'metal' }),
	style('silver', 'Silver', { body: ['#c9ccd2'], label: '#202326', finish: 'chrome' }),
	style('sea', 'Frosted sea', { body: ['#2bb3a3'], label: '#0b2d2a', outline: '#e6fffb', finish: 'frosted' }),
	style('velvet', 'Midnight velvet', { body: ['#1e2a6b'], label: '#e8d9a8', finish: 'velvet' }),
	style('oak', 'Oak', { body: ['#b98a55'], label: '#2b1a0c', finish: 'wood', texture: 'wood', blend: 'multiply', font: 'serif' }),
	style('granite', 'Granite', { body: ['#8a8d91'], label: '#f5f5f2', outline: '#1d1f22', finish: 'stone', texture: 'stone', blend: 'multiply' }),
	style('parchment', 'Parchment', { body: ['#e9dcc0'], label: '#4a2e12', finish: 'velvet', texture: 'paper', blend: 'multiply', font: 'blackletter' }),
	style('dragon', 'Dragon scale', { body: ['#2f7d3b'], label: '#f4e9c8', outline: '#0e2612', finish: 'pristine', texture: 'scales', blend: 'multiply' }),
	style('starfield', 'Starfield', { body: ['#16133a'], label: '#ffffff', outline: '#000000', finish: 'pristine', texture: 'stars', blend: 'screen' }),
	style('nebula', 'Nebula', { body: ['#5b3fd6'], label: '#ffffff', outline: '#000000', finish: 'nebula' }),
	style('opal', 'Opal', { body: ['#d9e8f2'], label: '#1d1a17', outline: '#ffffff', finish: 'opal' }),
	style('frost', 'Frost', { body: ['#a9d6f5'], label: '#0f2238', outline: '#ffffff', finish: 'frost' }),
	style('marble', 'Marble', { body: ['#f0ede6'], label: '#1d1a17', outline: '#ffffff', finish: 'marble' }),
	style('glitter', 'Glitter', { body: ['#c0306b'], label: '#ffffff', edge: '#6d1238', finish: 'glitter' }),
];

export const DEFAULT_DICE: DiceSettings = {
	styles: [],
	normal: 'bone',
	primary: 'ember',
	crit: 'molten',
	perDie: {},
	size: 1,
	speed: 1,
	throwForce: 'normal',
	stayMs: 1700,
	shadows: 'soft',
	effects: { crit: 'ring', miss: 'ring', max: 'supernova', min: 'gloom' },
	sets: [],
};

/** Every style the user can pick: presets first, then their own and imported ones. */
export function allStyles(d: DiceSettings): DiceStyle[] {
	return [...PRESETS, ...d.styles];
}

export function findStyle(d: DiceSettings, id: string | undefined): DiceStyle | undefined {
	return id ? (d.styles.find(s => s.id === id) ?? PRESETS.find(s => s.id === id)) : undefined;
}

/**
 * "Use for all dice": every die takes this look, except crit dice, which keep
 * the look chosen for them. Returns what to tell the user.
 */
export function useForAllDice(d: DiceSettings, id: string): string {
	d.normal = id;
	d.primary = '';
	for (const k of DIE_KEYS) delete d.perDie[k];
	const crit = d.crit && d.crit !== id ? findStyle(d, d.crit) : undefined;
	return crit ? `Every die uses this look now. Crit dice keep theirs (${crit.name}).` : 'Every die uses this look now.';
}

export const dieKey = (sides: number): DieKey | undefined => (DIE_KEYS as string[]).includes(`d${sides}`) ? `d${sides}` as DieKey : undefined;

/**
 * The style a die gets. Crit dice use the crit style (else the primary's), the
 * primary die uses the primary style (else what other dice of its size use),
 * and other dice use their size's style, else the other-dice style.
 */
export function styleFor(d: DiceSettings, die: { sides: number; role: 'primary' | 'normal' | 'explosion' }): DiceStyle {
	const k = dieKey(die.sides);
	const other = findStyle(d, k && d.perDie[k]) ?? findStyle(d, d.normal) ?? PRESETS[1];
	const primary = findStyle(d, d.primary) ?? other;
	if (die.role === 'explosion') return findStyle(d, d.crit) ?? primary;
	if (die.role === 'primary') return primary;
	return other;
}

/** Keep a value inside [lo, hi], falling back to `def` for anything not a number. */
const clamp = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);
const oneOf = <T extends string>(v: unknown, ok: readonly T[], def: T): T => (ok.includes(v as T) ? v as T : def);
const hex = (v: unknown, def: string) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : def);

/** A style read from settings or an import, with anything missing or broken filled in. */
export function cleanStyle(raw: Partial<DiceStyle> & { id?: string; name?: string }): DiceStyle {
	const body = (Array.isArray(raw.body) ? raw.body : [raw.body]).map(c => hex(c, '')).filter(Boolean);
	return {
		id: typeof raw.id === 'string' && raw.id ? raw.id : `style-${Math.random().toString(36).slice(2, 9)}`,
		name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'My dice',
		body: body.length ? body : ['#ece6d8'],
		label: hex(raw.label, '#1d1a17'),
		outline: raw.outline ? hex(raw.outline, '') : '',
		edge: raw.edge ? hex(raw.edge, '') : '',
		finish: oneOf(raw.finish, FINISHES.map(f => f.id), 'plastic'),
		texture: typeof raw.texture === 'string' && (raw.texture.startsWith('vault:') || TEXTURES.some(t => t.id === raw.texture)) ? raw.texture : 'none',
		blend: oneOf(raw.blend, BLENDS.map(b => b.id), 'multiply'),
		font: oneOf(raw.font, FONTS.map(f => f.id), 'inter'),
		labelScale: clamp(raw.labelScale, 0.6, 1.4, 1),
		model: typeof raw.model === 'string' && raw.model ? raw.model : undefined,
	};
}

/** The old (1.0.3 and before) per-role colour + look settings. */
export interface LegacyDice {
	dicePrimaryColor?: string;
	diceColor?: string;
	diceExplosionColor?: string;
	diceMaterialPrimary?: string;
	diceMaterialNormal?: string;
	diceMaterialCrit?: string;
}

const LEGACY_FINISH: Record<string, Finish> = { classic: 'plastic', gem: 'glass', metal: 'metal', glitter: 'glitter', lava: 'lava', frost: 'frost', nebula: 'nebula', opal: 'opal', marble: 'marble' };
const LEGACY_DEFAULT = { primary: ['#7c3aed', 'classic', 'ember'], normal: ['#ece6d8', 'classic', 'bone'], crit: ['#e0a030', 'lava', 'molten'] } as const;

/**
 * Settings for 1.0.4 from what's saved. Older saves only have per-role colours
 * and looks: untouched defaults map to the matching presets, anything the user
 * changed becomes a style of their own, so dice look the same after updating.
 */
export function migrateDice(saved: unknown, legacy: LegacyDice): DiceSettings {
	if (saved && typeof saved === 'object') {
		const d = saved as Partial<DiceSettings>;
		const styles = Array.isArray(d.styles) ? d.styles.filter(s => s && typeof s === 'object').map(s => cleanStyle(s)) : [];
		const effects = { ...DEFAULT_DICE.effects };
		const ids = EFFECTS.map(e => e.id);
		for (const k of Object.keys(effects) as RollEvent[]) effects[k] = oneOf(d.effects?.[k], ids, effects[k]);
		const perDie: Partial<Record<DieKey, string>> = {};
		for (const k of DIE_KEYS) if (typeof d.perDie?.[k] === 'string' && d.perDie[k]) perDie[k] = d.perDie[k];
		return {
			styles,
			normal: typeof d.normal === 'string' && d.normal ? d.normal : DEFAULT_DICE.normal,
			primary: typeof d.primary === 'string' ? d.primary : DEFAULT_DICE.primary,
			crit: typeof d.crit === 'string' ? d.crit : DEFAULT_DICE.crit,
			perDie,
			size: clamp(d.size, 0.5, 3, 1),
			speed: clamp(d.speed, 0.5, 2, 1),
			throwForce: oneOf(d.throwForce, ['gentle', 'normal', 'strong'] as const, 'normal'),
			stayMs: clamp(d.stayMs, 800, 10000, DEFAULT_DICE.stayMs),
			shadows: oneOf(d.shadows, ['off', 'soft', 'sharp'] as const, 'soft'),
			effects,
			sets: Array.isArray(d.sets) ? d.sets.filter(s => s && typeof s.id === 'string' && typeof s.name === 'string' && s.models && typeof s.models === 'object') : [],
		};
	}
	const out: DiceSettings = { ...DEFAULT_DICE, styles: [], effects: { ...DEFAULT_DICE.effects }, perDie: {}, sets: [] };
	const role = (key: 'primary' | 'normal' | 'crit', color: string | undefined, material: string | undefined, name: string) => {
		const [defColor, defMat, preset] = LEGACY_DEFAULT[key];
		const c = hex(color, defColor), m = material && LEGACY_FINISH[material] ? material : defMat;
		if (c.toLowerCase() === defColor && m === defMat) { out[key] = preset; return; }
		const s = cleanStyle({ id: `legacy-${key}`, name, body: [c], finish: LEGACY_FINISH[m], label: lightLabel(c, m) });
		out.styles.push(s);
		out[key] = s.id;
	};
	role('primary', legacy.dicePrimaryColor, legacy.diceMaterialPrimary, 'My primary die');
	role('normal', legacy.diceColor, legacy.diceMaterialNormal, 'My dice');
	role('crit', legacy.diceExplosionColor, legacy.diceMaterialCrit, 'My crit dice');
	return out;
}

/** A readable number colour for a body colour: dark on light dice, light on dark ones. */
export function lightLabel(body: string, finish = 'plastic'): string {
	if (finish === 'lava' || finish === 'nebula') return '#ffffff';
	const m = /^#?([0-9a-f]{6})/i.exec(body);
	if (!m) return '#1d1a17';
	const n = parseInt(m[1], 16);
	const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
	return lum > 0.55 ? '#1d1a17' : '#fbf8f2';
}

/** Which event a finished roll is, for effects. */
export function rollEvent(sides: number, rolls: number[], outcome?: 'miss' | 'crit'): RollEvent | undefined {
	if (outcome) return outcome;
	if (!rolls.length) return undefined;
	if (rolls.every(r => r === sides)) return 'max';
	if (sides > 2 && rolls.every(r => r === 1)) return 'min';
	return undefined;
}
