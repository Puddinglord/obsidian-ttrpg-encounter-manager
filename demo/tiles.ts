// Two small live demos in the "rest of your toolkit" bento: the plugin's box
// types (real nimble-box markup and preset colours) and dice, quick or 3D.

import './obsidian-shim';
import { setIcon } from 'obsidian';
import { dice3dSupported, looks3d, preview3d, DICE3D_MATERIALS } from '../src/dice3d';
import type { DiceMaterial, PreviewHandle } from '../src/dice3d';
import { reducedMotion, renderBox, roll, rollNotice } from './slash-demo';

// ---------------------------------------------------------------------------
// Read-aloud boxes: one open at a time; it cycles until you pick one.

const BOXES: [string, string][] = [
	['read-aloud', 'A knee-deep pool of living quicksilver ripples without any breeze.'],
	['trap', '**Effect:** STR save DC 12 or take 1d6 damage.'],
	['treasure', '**Silver ring** (300 gp), glinting beneath the mercury.'],
	['clue', 'The chains hang in the same pattern as the silver inlay.'],
	['secret', 'Vess is alive, after a fashion: half flesh, half mercury.'],
	['handout', '*Day 211. The reflections have the equations right.*'],
];

const LABELS: Record<string, string> = { 'read-aloud': 'Read aloud', trap: 'Trap', treasure: 'Treasure', clue: 'Clue', secret: 'GM secret', handout: 'Handout' };

/** One callout at a time in a fixed-size slot (no layout shift), with tabs to pick a type. */
function buildBoxes(root: HTMLElement): void {
	root.empty();
	root.addClass('is-live', 'obs');
	const stage = root.createDiv({ cls: 'tb-stage', attr: { 'aria-live': 'polite' } });
	const boxes = BOXES.map(([type, text]) => renderBox(stage, type, text));
	const tabs = root.createDiv({ cls: 'tb-tabs', attr: { role: 'tablist', 'aria-label': 'Box types' } });
	const buttons = BOXES.map(([type], i) => {
		const b = tabs.createEl('button', { cls: 'tb-tab', text: LABELS[type] ?? type, attr: { role: 'tab', type: 'button' } });
		b.style.setProperty('--box-color', boxes[i].style.getPropertyValue('--box-color'));
		return b;
	});

	let open = 0;
	const show = (i: number) => {
		open = i;
		boxes.forEach((b, j) => { b.toggleClass('is-active', j === i); b.setAttr('aria-hidden', String(j !== i)); });
		buttons.forEach((b, j) => { b.toggleClass('is-active', j === i); b.setAttr('aria-selected', String(j === i)); b.tabIndex = j === i ? 0 : -1; });
	};
	show(0);

	// Cycle through the types while the card is on screen, until someone picks one.
	let timer = 0, visible = false, touched = false;
	const stop = () => { window.clearInterval(timer); timer = 0; };
	const start = () => {
		if (touched || timer || !visible || reducedMotion()) return;
		timer = window.setInterval(() => show((open + 1) % boxes.length), 3000);
	};
	new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); }, { threshold: 0.4 }).observe(root);
	root.addEventListener('pointerenter', stop);
	root.addEventListener('pointerleave', start);
	root.addEventListener('focusin', stop);

	buttons.forEach((b, i) => {
		b.addEventListener('click', () => { touched = true; stop(); show(i); });
		b.addEventListener('keydown', (e) => {
			if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
			e.preventDefault();
			const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
			touched = true; stop(); show(n); buttons[n].focus();
		});
	});
}

// ---------------------------------------------------------------------------
// Dice, two ways: the same 3d6, shown at once or thrown in 3D.

function buildDice(root: HTMLElement): void {
	root.empty();
	root.addClass('is-live');
	const buttons = root.createDiv({ cls: 'td-buttons' });
	const quick = buttons.createEl('button', { cls: 'td-btn td-btn-ember', attr: { type: 'button' } });
	setIcon(quick.createSpan({ cls: 'td-btn-icon', attr: { 'aria-hidden': 'true' } }), 'zap');
	quick.createSpan({ text: 'Quick roll' });
	const three = buttons.createEl('button', { cls: 'td-btn td-btn-quiet', attr: { type: 'button' } });
	setIcon(three.createSpan({ cls: 'td-btn-icon', attr: { 'aria-hidden': 'true' } }), 'dices');
	const threeLabel = three.createSpan({ text: '3D roll' });

	const result = root.createDiv({ cls: 'td-result', attr: { 'aria-live': 'polite' } });
	const idle = result.createDiv({ cls: 'td-card is-idle' });
	idle.createDiv({ cls: 'td-idle-dice', text: '3d6' });
	idle.createDiv({ cls: 'td-idle-text', text: 'Pick a way to roll' });

	const show = (label: string, r: Parameters<typeof rollNotice>[2], note?: string) => {
		result.empty();
		const card = result.createDiv({ cls: 'td-card notice' });
		rollNotice(card, label, r);
		if (note) card.createDiv({ cls: 'td-note', text: note });
	};

	quick.addEventListener('click', () => {
		const rolled = roll('3d6', 'effect', false);
		if (rolled) show('Quick roll', rolled.result);
	});

	three.addEventListener('click', () => {
		const can = dice3dSupported();
		const rolled = roll('3d6', 'effect', true);
		if (!rolled) return;
		if (!can) {
			show('3D roll', rolled.result, reducedMotion() ? 'Your device asks for less motion, so no 3D dice.' : 'This browser can\'t draw 3D dice.');
			return;
		}
		quick.disabled = three.disabled = true;
		threeLabel.setText('Rolling…');
		result.empty();
		const wait = result.createDiv({ cls: 'td-card is-idle is-rolling' });
		wait.createDiv({ cls: 'td-idle-dice', text: '3d6' });
		wait.createDiv({ cls: 'td-idle-text', text: 'Dice in the air…' });
		void rolled.landed.then(() => {
			show('3D roll', rolled.result);
			quick.disabled = three.disabled = false;
			threeLabel.setText('3D roll');
		});
	});
}

// ---------------------------------------------------------------------------
// Your dice, your look: one d20 turning in the plugin's own renderer, cycling
// through the built-in looks. three.js loads when the tile scrolls into view.

const LOOK_COLORS: Record<DiceMaterial, string> = {
	classic: '#7c3aed', gem: '#e0245e', metal: '#d4a72c', glitter: '#8b5cf6', lava: '#ff6a1f',
	frost: '#7dd3fc', nebula: '#5b21b6', opal: '#f4ecff', marble: '#ece6d8',
};
const SHORT: Partial<Record<DiceMaterial, string>> = { classic: 'Resin', gem: 'Gem' };

function buildLooks(root: HTMLElement): void {
	root.empty();
	root.addClass('is-live');
	const looks = DICE3D_MATERIALS.map(m => ({ id: m.id, label: SHORT[m.id] ?? m.label }));
	const stage = root.createDiv({ cls: 'dl-stage' });
	stage.createDiv({ cls: 'dl-glow' });
	const canvas = stage.createEl('canvas', { cls: 'dl-canvas', attr: { 'aria-hidden': 'true' } });
	const still = stage.createEl('img', { cls: 'dl-still', attr: { src: 'd20.svg', alt: '', width: '120', height: '120' } });
	const name = stage.createDiv({ cls: 'dl-name', attr: { 'aria-live': 'polite' } }).createSpan({ cls: 't' });
	const pills = root.createDiv({ cls: 'dl-pills', attr: { role: 'radiogroup', 'aria-label': 'Dice looks' } });
	const buttons = looks.map((l, i) => {
		const b = pills.createEl('button', { cls: 'dl-pill', attr: { type: 'button', role: 'radio', 'aria-label': l.label } });
		b.style.setProperty('--look', LOOK_COLORS[l.id]);
		b.addEventListener('click', () => { pick(i); pausedUntil = performance.now() + 7000; });
		return b;
	});

	let at = 0;
	let handle: PreviewHandle | null = null;
	let lookFor: ((color: string, material: DiceMaterial) => ReturnType<Awaited<ReturnType<typeof looks3d>>>) | null = null;
	let pausedUntil = 0;
	const pick = (i: number) => {
		at = (i + looks.length) % looks.length;
		const l = looks[at];
		name.setText(l.label);
		root.style.setProperty('--look', LOOK_COLORS[l.id]);
		root.parentElement?.style.setProperty('--look', LOOK_COLORS[l.id]);
		buttons.forEach((b, j) => { b.toggleClass('is-active', j === at); b.setAttr('aria-checked', String(j === at)); });
		if (handle && lookFor) handle.setLook(lookFor(LOOK_COLORS[l.id], l.id));
	};
	pick(0);

	if (!dice3dSupported()) { root.addClass('is-still'); return; }
	let visible = false;
	let started = false;
	const start = async () => {
		started = true;
		try {
			lookFor = await looks3d();
			const lookOf = lookFor;
			handle = await preview3d(canvas, { sides: 20, look: lookOf(LOOK_COLORS[looks[at].id], looks[at].id) });
			// Build and compile every look now, so the cycle never waits on a shader.
			window.setTimeout(() => handle?.preload(looks.map(l => lookOf(LOOK_COLORS[l.id], l.id))), 300);
			root.addClass('is-3d');
			still.remove();
		} catch { root.addClass('is-still'); }
	};
	new IntersectionObserver((entries) => {
		visible = entries.some(e => e.isIntersecting);
		if (visible && !started) void start();
	}, { rootMargin: '200px' }).observe(root);
	root.addEventListener('pointerenter', () => { pausedUntil = Infinity; });
	root.addEventListener('pointerleave', () => { pausedUntil = performance.now() + 1200; });
	window.setInterval(() => {
		if (!visible || !handle || performance.now() < pausedUntil) return;
		pick(at + 1);
	}, 2600);
}

const looksRoot = activeDocument.getElementById('tile-looks-demo');
if (looksRoot) buildLooks(looksRoot);

const boxesRoot = activeDocument.getElementById('tile-boxes-demo');
if (boxesRoot) buildBoxes(boxesRoot);
const diceRoot = activeDocument.getElementById('tile-dice-demo');
if (diceRoot) buildDice(diceRoot);
