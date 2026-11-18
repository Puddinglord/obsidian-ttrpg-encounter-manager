import { describe, expect, it } from 'vitest';
import { pill, setPill } from '../src/core/pill';
import { refPill } from '../src/core/inline-refs';

describe('pill(): one markup for every pill', () => {
	it('an icon span, then a text span, inside the tag asked for', () => {
		const host = document.createElement('div');
		const b = pill(host, { tag: 'button', cls: 'statblock-action mod-cta', icon: 'plus', text: 'Add' });
		expect(b.tagName).toBe('BUTTON');
		expect(b.parentElement).toBe(host);
		expect([...b.classList]).toEqual(['ev-pill', 'statblock-action', 'mod-cta']);
		expect([...b.children].map(c => c.className)).toEqual(['ev-pill-icon', 'ev-pill-text']);
		expect(b.textContent).toBe('Add');
	});
	it('text only, icon only, detached, and redrawn', () => {
		const t = pill(null, { text: 'SRD' });
		expect(t.tagName).toBe('SPAN');
		expect([...t.children].map(c => c.className)).toEqual(['ev-pill-text']);
		const i = pill(null, { icon: 'x', tag: 'a' });
		expect(i.classList.contains('is-icon-only')).toBe(true);
		expect(i.getAttribute('href')).toBe('#');
		setPill(i, { icon: 'check', text: 'Done' });
		expect(i.classList.contains('is-icon-only')).toBe(false);
		expect([...i.children].map(c => c.className)).toEqual(['ev-pill-icon', 'ev-pill-text']);
	});
});

describe('refPill(): inline references look the same in every game', () => {
	it('a compendium entry: [icon | name], the name a link', () => {
		const { el, name } = refPill({ cls: 'dnd5e-ref is-compendium kind-spell', icon: { name: 'wand-2', label: 'Spell' }, name: 'Fireball' });
		expect([...el.classList]).toEqual(['nimble-inline-ref', 'dnd5e-ref', 'is-compendium', 'kind-spell', 'nimble-inline-found']);
		expect([...el.children].map(c => c.className)).toEqual(['nimble-inline-kind', 'nimble-inline-name']);
		expect(name.tagName).toBe('A');
		expect(name.textContent).toBe('Fireball');
	});
	it('a monster: [level | name]; a name that finds nothing: [name | ?]', () => {
		const { el } = refPill({ badge: { text: '1/4', title: 'CR 1/4' }, name: 'Goblin Warrior' });
		expect([...el.children].map(c => c.className)).toEqual(['nimble-inline-level', 'nimble-inline-name']);
		const missing = refPill({ name: 'Nobody', unknown: { title: 'Not found', label: 'Unknown monster' } }).el;
		expect(missing.classList.contains('nimble-inline-unresolved')).toBe(true);
		expect(missing.classList.contains('nimble-inline-found')).toBe(false);
		expect(missing.querySelector('.nimble-inline-unknown')?.getAttribute('aria-label')).toBe('Unknown monster');
	});
});
