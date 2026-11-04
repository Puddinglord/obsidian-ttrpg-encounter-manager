import { describe, expect, it } from 'vitest';
import { appendRichText } from '../src/markdown';

function html(text: string, dice = false): string {
	const el = document.createElement('div');
	appendRichText(el, text, dice ? { onDice: () => {} } : {});
	return el.innerHTML;
}

describe('appendRichText', () => {
	it('never turns text into markup', () => {
		const el = document.createElement('div');
		appendRichText(el, '<img src=x onerror="alert(1)"> <b>hi</b>');
		expect(el.querySelector('img')).toBeNull();
		expect(el.querySelector('b')).toBeNull();
		expect(el.textContent).toBe('<img src=x onerror="alert(1)"> <b>hi</b>');
	});

	it('renders emphasis', () => {
		expect(html('a **b** *c* ***d***')).toBe('a <strong>b</strong> <em>c</em> <strong><em>d</em></strong>');
		expect(html('__b__ _c_')).toBe('<strong>b</strong> <em>c</em>');
	});

	it('leaves snake_case words alone', () => {
		expect(html('use snake_case_name here')).toBe('use snake_case_name here');
	});

	it('keeps underscores inside wikilinks', () => {
		const el = document.createElement('div');
		appendRichText(el, 'See [[snake_case_note]] and [[Goblin|the goblin]]');
		const links = el.querySelectorAll('a.nimble-wikilink');
		expect(links.length).toBe(2);
		expect(links[0].getAttribute('data-link')).toBe('snake_case_note');
		expect(links[0].textContent).toBe('snake_case_note');
		expect(links[1].getAttribute('data-link')).toBe('Goblin');
		expect(links[1].textContent).toBe('the goblin');
	});

	it('escapes markup inside link text', () => {
		const el = document.createElement('div');
		appendRichText(el, '[[x|<script>1</script>]]');
		expect(el.querySelector('script')).toBeNull();
	});

	it('marks dice only when asked', () => {
		expect(html('Bite 2d6+3 piercing')).toBe('Bite 2d6+3 piercing');
		const el = document.createElement('div');
		const seen: string[] = [];
		appendRichText(el, 'Bite 2d6 + 3 piercing, then d4, **1d8 fire**, not 2d6x or v1d6', { onDice: (_e, x) => seen.push(x) });
		expect(seen).toEqual(['2d6+3', 'd4', '1d8']);
		expect(el.querySelector('strong .nimble-dice')?.textContent).toBe('1d8');
	});

	it('does not swallow a second dice term as a modifier', () => {
		const seen: string[] = [];
		appendRichText(document.createElement('div'), '1d6+12d4', { onDice: (_e, x) => seen.push(x) });
		expect(seen[0]).toBe('1d6');
	});
});
