import { describe, expect, it } from 'vitest';
import { boxColor, boxFence, boxType, newBox, parseBoxFence, resolveBox } from '../src/box-def';

describe('box fence', () => {
	it('reads the type, aliases and overrides', () => {
		expect(parseBoxFence('```box read-aloud')).toEqual({ type: 'read-aloud' });
		expect(parseBoxFence('```box read').type).toBe('read-aloud');
		expect(parseBoxFence('```box loot').type).toBe('treasure');
		const o = parseBoxFence('```box treasure title="Hoard of the Wyrm" icon=crown color=#aa3300 style=parchment font=hand bold italic collapsed');
		expect(o).toEqual({ type: 'treasure', title: 'Hoard of the Wyrm', icon: 'crown', color: '#aa3300', style: 'parchment', font: 'hand', bold: true, italic: true, collapsed: true });
	});

	it('ignores unknown styles and fonts, keeps unknown types', () => {
		const o = parseBoxFence('~~~box ritual style=wobbly font=comic');
		expect(o.type).toBe('ritual');
		expect(o.style).toBeUndefined();
		expect(o.font).toBeUndefined();
		expect(resolveBox(o).title).toBe('Ritual');
	});

	it('writes only what differs from the preset, and round-trips', () => {
		expect(boxFence({ type: 'look' })).toBe('```box look');
		expect(boxFence({ type: 'look', title: 'What\'s here', color: 'teal', style: 'card' })).toBe('```box look');
		const line = boxFence({ type: 'clue', title: 'The notes', color: 'red', style: 'stone', bold: true });
		expect(line).toBe('```box clue title="The notes" color=red style=stone bold');
		expect(boxFence(parseBoxFence(line))).toBe(line);
		expect(boxFence({ type: 'note' }, '~~~~')).toBe('~~~~box note');
	});

	it('fills in presets', () => {
		const r = resolveBox({ type: 'handout' });
		expect(r.style).toBe('parchment');
		expect(r.font).toBe('serif');
		expect(r.icon).toBe('scroll-text');
	});

	it('resolves colours and aliases', () => {
		expect(boxColor('gold')).toMatch(/^#/);
		expect(boxColor('#123')).toBe('#123');
		expect(boxColor('url(evil)')).toBe(boxColor('gray'));
		expect(boxType('hazard')).toBe('trap');
		expect(newBox('trap')).toMatch(/^```box trap\n\*\*Trigger:\*\*/);
	});
});
