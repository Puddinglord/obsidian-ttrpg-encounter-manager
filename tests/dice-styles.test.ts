import { describe, expect, it } from 'vitest';
import { cleanStyle, DEFAULT_DICE, migrateDice, PRESETS, rollEvent, styleFor, useForAllDice } from '../src/dice3d/styles';

describe('dice settings carry over from 1.0.3', () => {
	it('untouched defaults map to the matching presets, nothing extra created', () => {
		const d = migrateDice(undefined, { dicePrimaryColor: '#7c3aed', diceColor: '#ece6d8', diceExplosionColor: '#e0a030', diceMaterialPrimary: 'classic', diceMaterialNormal: 'classic', diceMaterialCrit: 'lava' });
		expect([d.primary, d.normal, d.crit]).toEqual(['ember', 'bone', 'molten']);
		expect(d.styles).toEqual([]);
	});

	it('a changed colour or look becomes a style of your own', () => {
		const d = migrateDice(undefined, { dicePrimaryColor: '#ff0000', diceMaterialPrimary: 'gem', diceColor: '#ece6d8', diceMaterialNormal: 'metal' });
		expect(d.primary).toBe('legacy-primary');
		expect(d.styles.find(s => s.id === 'legacy-primary')).toMatchObject({ body: ['#ff0000'], finish: 'glass', label: '#fbf8f2' });
		expect(d.styles.find(s => s.id === 'legacy-normal')).toMatchObject({ finish: 'metal' });
		expect(d.crit).toBe('molten');
	});

	it('saved 1.0.4 settings are kept, with bad values repaired', () => {
		const d = migrateDice({ normal: 'oak', primary: '', crit: 'x', size: 9, speed: 'fast', shadows: 'sharp', effects: { miss: 'shatter', crit: 'nope' }, styles: [{ name: '  Mine ', body: '#123456', finish: 'velvet', labelScale: 5 }], perDie: { d20: 'rainbow', d7: 'x' } }, {});
		expect(d.normal).toBe('oak');
		expect(d.primary).toBe('');
		expect(d.size).toBe(3);
		expect(d.speed).toBe(1);
		expect(d.shadows).toBe('sharp');
		expect(d.effects).toEqual({ ...DEFAULT_DICE.effects, miss: 'shatter' });
		expect(d.styles[0]).toMatchObject({ name: 'Mine', body: ['#123456'], finish: 'velvet', labelScale: 1.4 });
		expect(d.perDie).toEqual({ d20: 'rainbow' });
	});
});

describe('which style a die gets', () => {
	const d = { ...DEFAULT_DICE, perDie: { d20: 'rainbow' as const } };
	it('primary, crit and other dice', () => {
		expect(styleFor(d, { sides: 6, role: 'normal' }).id).toBe('bone');
		expect(styleFor(d, { sides: 20, role: 'normal' }).id).toBe('rainbow');
		expect(styleFor(d, { sides: 20, role: 'primary' }).id).toBe('ember');
		expect(styleFor(d, { sides: 20, role: 'explosion' }).id).toBe('molten');
	});
	it('empty primary follows the die size, empty crit follows the primary', () => {
		const e = { ...d, primary: '', crit: '' };
		expect(styleFor(e, { sides: 20, role: 'primary' }).id).toBe('rainbow');
		expect(styleFor(e, { sides: 20, role: 'explosion' }).id).toBe('rainbow');
		expect(styleFor({ ...e, normal: 'missing' }, { sides: 6, role: 'normal' }).id).toBe('bone');
	});
});

describe('styles and events', () => {
	it('presets are complete and have unique ids', () => {
		expect(new Set(PRESETS.map(p => p.id)).size).toBe(PRESETS.length);
		for (const p of PRESETS) expect(cleanStyle(p)).toEqual({ ...p, model: undefined });
	});
	it('roll events', () => {
		expect(rollEvent(20, [20])).toBe('max');
		expect(rollEvent(6, [1, 1])).toBe('min');
		expect(rollEvent(6, [1, 3])).toBeUndefined();
		expect(rollEvent(6, [6, 3, 6], 'crit')).toBe('crit');
		expect(rollEvent(6, [1, 4], 'miss')).toBe('miss');
	});
});

describe('use for all dice', () => {
	it('puts the look on every die but leaves the crit look, and says so', () => {
		const d = migrateDice({ normal: 'bone', primary: 'ember', crit: 'molten', perDie: { d20: 'ember' } }, {});
		const said = useForAllDice(d, 'oak');
		expect([d.normal, d.primary, d.crit, d.perDie]).toEqual(['oak', '', 'molten', {}]);
		expect(said).toContain('Crit dice keep theirs');
	});

	it('says nothing about crits when they have no look of their own', () => {
		const d = migrateDice({ crit: '' }, {});
		expect(useForAllDice(d, 'oak')).toBe('Every die uses this look now.');
		d.crit = 'oak';
		expect(useForAllDice(d, 'oak')).toBe('Every die uses this look now.');
	});
});

describe('damaged dice settings', () => {
	it('drops styles and sets that are not objects', () => {
		const d = migrateDice({ styles: [null, 'x', 3, { name: 'Mine' }], sets: [null, { id: 'a', name: 'A', models: {} }] }, {});
		expect(d.styles.map(s => s.name)).toEqual(['Mine']);
		expect(d.sets.map(s => s.id)).toEqual(['a']);
	});
});
