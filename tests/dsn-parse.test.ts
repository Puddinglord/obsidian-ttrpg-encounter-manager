import { describe, expect, it } from 'vitest';
import { literalCalls, modulePath, parseDiceModule, parseDsnExport } from '../src/dice3d/dsn-parse';

// The shape of a model dice set's script (written for this test).
const SCRIPT = `
Hooks.once('diceSoNiceReady', (dice3d) => {
  dice3d.addSystem({ id: "acme-glow", name: "Glow Set", group: "Acme" }, false);
  dice3d.addDicePreset({ type: "d4", labels: "", modelFile: "modules/acme-glow/models/dice_4.gltf", system: "acme-glow" });
  dice3d.addDicePreset({ type: 'd20', labels: '', modelFile: 'modules/acme-glow/models/dice_20.gltf', system: 'acme-glow', }); // trailing comma
  /* a call we can't read as data: skipped, not run */
  dice3d.addDicePreset({ type: "d6", modelFile: someVariable });
  dice3d.addColorset({ name: 'acme-ember', description: 'Acme Ember', category: 'Acme', foreground: '#fff1d6', background: ['#ff6a1f', '#c2410c'], outline: 'black', edge: '#7c2d12', texture: 'lava', material: 'metal' });
});`;

describe('reading dice set scripts as data', () => {
	it('finds literal call arguments and skips ones that need code', () => {
		expect(literalCalls(SCRIPT, 'addDicePreset').map(a => (a[0] as { type: string }).type)).toEqual(['d4', 'd20']);
		expect(literalCalls(SCRIPT, 'addSystem')[0]).toEqual([{ id: 'acme-glow', name: 'Glow Set', group: 'Acme' }, false]);
		expect(literalCalls('x.addDicePreset(`${evil}`)', 'addDicePreset')).toEqual([]);
	});

	it('turns a module into a dice set with models and colour sets', () => {
		const set = parseDiceModule({ id: 'acme-glow', title: 'The Rollsmith - Glow Dice Set', version: '1.0.1', authors: [{ name: 'Acme' }, { name: 'Jo' }] }, [SCRIPT])!;
		expect(set).toMatchObject({ id: 'acme-glow', name: 'Glow', author: 'Acme, Jo', version: '1.0.1', models: { 4: 'models/dice_4.gltf', 20: 'models/dice_20.gltf' } });
		expect(set.styles[0]).toMatchObject({ name: 'Acme Ember', body: ['#ff6a1f', '#c2410c'], label: '#fff1d6', outline: '#000000', edge: '#7c2d12', finish: 'metal' });
	});

	it('returns null for a module without dice', () => {
		expect(parseDiceModule({ id: 'x' }, ['console.log(1)'])).toBeNull();
		expect(parseDiceModule({}, [SCRIPT])).toBeNull();
	});

	it('paths inside the module', () => {
		expect(modulePath('modules/acme-glow/models/dice_20.gltf')).toBe('models/dice_20.gltf');
		expect(modulePath('./models/a.gltf')).toBe('models/a.gltf');
	});
});

describe('Dice So Nice export files', () => {
	const EXPORT = {
		appearance: {
			global: { labelColor: '#ffffff', diceColor: '#7a1f1f', outlineColor: '#000000', edgeColor: '#7a1f1f', colorset: 'custom', texture: 'marble', material: 'glass', font: 'auto', system: 'standard' },
			d20: { labelColor: '#ffffff', diceColor: '#7a1f1f', outlineColor: '#000000', edgeColor: '#7a1f1f', colorset: 'custom', texture: 'none', material: 'auto', font: 'auto', system: 'acme-glow' },
			d6: { labelColor: '#ffffff', diceColor: '#7a1f1f', outlineColor: '#000000', edgeColor: '#7a1f1f', colorset: 'custom', texture: 'marble', material: 'glass', font: 'auto', system: 'standard' },
		},
		saves: { 'Wood night': { appearance: { global: { labelColor: '#111111', diceColor: '#a0522d', texture: 'wood', material: 'wood', font: 'Georgia', system: 'standard' } } } },
	};
	it('makes a style for your dice, each die size set apart, and each save', () => {
		const r = parseDsnExport(EXPORT, ['acme-glow']);
		expect(r.styles.map(s => s.name)).toEqual(['Dice So Nice', 'Dice So Nice (d20)', 'Wood night']);
		expect(r.styles[0]).toMatchObject({ body: ['#7a1f1f'], label: '#ffffff', finish: 'glass', texture: 'marble' });
		expect(r.styles[1]).toMatchObject({ model: 'acme-glow', finish: 'plastic', texture: 'none' });
		expect(r.styles[2]).toMatchObject({ finish: 'wood', texture: 'wood', font: 'serif' });
		expect(r.main).toBe('dsn-current');
		expect(r.perDie).toEqual({ 20: 'dsn-current-d20' });
		expect(r.systems).toEqual(['acme-glow']);
	});
	it('rejects files that are not exports', () => {
		expect(() => parseDsnExport({ hello: 1 })).toThrow(/no Dice So Nice/);
	});
});
