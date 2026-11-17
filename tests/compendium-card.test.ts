import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
	Modal: class {},
	// compendium-art.ts (the quick look's art slot) builds on these.
	FuzzySuggestModal: class {},
	Menu: class {},
	Notice: class {},
	TFile: class {},
	normalizePath: (p: string) => p,
	setIcon: (el: HTMLElement, icon: string) => { el.dataset.icon = icon; },
}));

import { Compendium, CompendiumHit, nameKey } from '../src/systems/nimble/compendium';
import { compendiumIcon, renderCard, renderConditionCard, renderHitCard } from '../src/systems/nimble/compendium-card';
import { bundledCompendium } from '../src/systems/nimble/compendium-data';
import { resolveCompendiumRef } from '../src/systems/nimble/compendium-ref';
import { FIXTURE } from './compendium-fixture';

const real = bundledCompendium();
const find = (kind: CompendiumHit['kind'], name: string, owner?: string) => resolveCompendiumRef(real, { kind, name, owner })!;
const box = () => document.body.createDiv();

describe('class pages', () => {
	it('show every level in order, option groups, subclasses and FAQ', () => {
		const el = box();
		renderHitCard(el, find('class', 'Oathsworn'));
		expect(el.querySelector('.nimble-cmp-card')?.classList.contains('is-page')).toBe(true);
		expect(el.querySelector('.nimble-cmp-tagline')?.textContent).toMatch(/righteous defender/i);
		const facts = [...el.querySelectorAll('.nimble-cmp-fact-label')].map(f => f.textContent);
		expect(facts).toEqual(expect.arrayContaining(['Key stats', 'Hit die', 'Starting HP', 'Saves', 'Armor', 'Weapons', 'Mana', 'Schools', 'Judgment Dice', 'Lay on Hands']));
		const levels = [...el.querySelectorAll('.nimble-cmp-page > .nimble-cmp-levels .nimble-cmp-level-badge')].map(b => Number(b.textContent));
		expect(levels[0]).toBe(1);
		expect(levels).toEqual([...levels].sort((a, b) => a - b));
		expect(levels.length).toBeGreaterThanOrEqual(19);
		const names = [...el.querySelectorAll('.nimble-cmp-feature-name')].map(n => n.textContent);
		expect(names).toContain('Lay on Hands');
		expect(names).toContain('Blinding Aura'); // a Sacred Decree
		expect(names).toContain('Aura of Zeal'); // Oath of Vengeance
		const summaries = [...el.querySelectorAll('summary .nimble-cmp-summary-title')].map(s => s.textContent);
		expect(summaries).toEqual(expect.arrayContaining(['Sacred Decrees', 'Oath of Vengeance', 'Oath of Refuge', 'FAQ']));
	});

	it('render every bundled class and subclass without losing a feature', () => {
		for (const hit of real.all().filter(h => h.kind === 'class' || h.kind === 'subclass')) {
			const el = box();
			renderHitCard(el, hit);
			const shown = new Set([...el.querySelectorAll('.nimble-cmp-feature-name')].map(n => nameKey(n.textContent ?? '')));
			const owned = real.all().filter(h => h.kind === 'feature' && (hit.kind === 'class' ? h.className === hit.name : h.subclass === hit.name && h.className === hit.className));
			for (const f of owned) expect(shown.has(nameKey(f.name)), `${hit.name}: ${f.name}`).toBe(true);
			el.remove();
		}
	});

	it('subclass pages name their class as a link when the card can open entries', () => {
		const opened: CompendiumHit[] = [];
		const el = box();
		renderHitCard(el, find('subclass', 'Oath of Vengeance'), { onOpenHit: h => opened.push(h) });
		const link = el.querySelector<HTMLAnchorElement>('a.nimble-cmp-link');
		expect(link?.textContent).toBe('Oathsworn');
		link!.click();
		expect(opened[0]).toMatchObject({ kind: 'class', name: 'Oathsworn' });
	});
});

describe('feature cards', () => {
	it('say where a feature comes from and link to its class', () => {
		const opened: CompendiumHit[] = [];
		const el = box();
		renderHitCard(el, find('feature', 'Lay on Hands'), { onOpenHit: h => opened.push(h) });
		const facts = Object.fromEntries([...el.querySelectorAll('.nimble-cmp-fact')].map(f => [f.querySelector('.nimble-cmp-fact-label')?.textContent, f.querySelector('.nimble-cmp-fact-value')?.textContent]));
		expect(facts).toMatchObject({ Class: 'Oathsworn', Level: '1' });
		el.querySelector<HTMLAnchorElement>('a.nimble-cmp-link')!.click();
		expect(opened[0]?.kind).toBe('class');
	});

	it('show an option’s group, cost and the group’s intro', () => {
		const el = box();
		renderHitCard(el, find('feature', 'Blinding Aura'));
		const labels = [...el.querySelectorAll('.nimble-cmp-fact-label')].map(f => f.textContent);
		expect(labels).toEqual(expect.arrayContaining(['Class', 'Option', 'Cost']));
		expect(el.querySelector('.nimble-cmp-group-about')).not.toBeNull();
		// No links without onOpenHit.
		expect(el.querySelector('a.nimble-cmp-link')).toBeNull();
	});
});

describe('other cards', () => {
	it('render every bundled entry', () => {
		for (const hit of real.all()) {
			const el = box();
			expect(() => renderHitCard(el, hit), `${hit.kind} ${hit.name}`).not.toThrow();
			expect(el.querySelector('.nimble-cmp-kind-icon')?.getAttribute('data-icon')).toBe(compendiumIcon(hit));
			el.remove();
		}
	});

	it('show conditions as cards', () => {
		const el = box();
		renderConditionCard(el, { name: 'Dazed', description: 'Can only take 1 action.' });
		expect(el.querySelector('.nimble-cmp-card.kind-condition .nimble-cmp-name')?.textContent).toBe('Dazed');
		expect(el.querySelector('.nimble-cmp-text')?.textContent).toBe('Can only take 1 action.');
		const both = box();
		renderCard(both, { name: 'Prone', description: 'On the ground.' });
		renderCard(both, new Compendium(FIXTURE).all()[0]);
		expect([...both.querySelectorAll('.nimble-cmp-card')].map(c => c.className)).toEqual(['nimble-cmp-card kind-condition', 'nimble-cmp-card kind-item']);
	});
});
