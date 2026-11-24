// Screenshots of the Import… study, one per state and frame, into shots/.
// Also reports script errors and anything that spills sideways inside the dialog.
//
//   node prototypes/import-study/shots.mjs            (every shot)
//   node prototypes/import-study/shots.mjs review     (only shots whose name contains "review")
//   CHROME_BIN overrides where Chrome is.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const file = new URL('index.html', here).href;
const out = new URL('shots/', here).pathname;
mkdirSync(out, { recursive: true });

const D = 'desktop', W = 'window', P = 'phone';
const SHOTS = [
	['empty', D], ['empty', W], ['empty', P], ['dragging', D], ['dragging-more', D],
	['review', D], ['review-npc', D], ['review-location', D], ['review-map', D], ['review-item', D],
	['review-update', D], ['review-same', D], ['review-yours', D], ['review-out', D], ['review-source', D],
	['missing-picture', D], ['pasted', D], ['link', D], ['fetching', D], ['fetch-failed', D], ['link-unknown', D], ['link-ddb', D],
	['reading', D], ['unrecognised', D], ['invalid', D], ['nothing-new', D], ['ddb', D], ['pack', D], ['done', D],
	['review', W, 'list'], ['review', W, 'detail'], ['review-map', W],
	['review', P, 'list'], ['review', P, 'detail'], ['review-map', P], ['review-update', P], ['pasted', P, 'detail'], ['link', P], ['invalid', P], ['ddb', P], ['done', P],
	['review', D, 'dark'], ['review-map', D, 'dark'], ['empty', D, 'dark'], ['review', D, '5e'], ['review', P, 'detail', 'dark'],
];

const only = process.argv[2];
const executablePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1340, height: 1000 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(file);
await page.waitForTimeout(600);
for (const [state, view, ...flags] of SHOTS) {
	const name = [state, view === D ? 'desktop' : view === W ? 'window-700' : 'phone-390', ...flags].join('-');
	if (only && !name.includes(only)) continue;
	await page.evaluate(h => { location.hash = h; }, [state, view, ...flags].join('/'));
	await page.waitForTimeout(state === 'empty' ? 400 : 250);
	// Sideways spill inside the dialog: an element wider than its scroll box that isn't meant to scroll.
	const spill = await page.evaluate(() => {
		const m = document.querySelector('.ev-import');
		if (!m) return ['no dialog drawn'];
		const bad = [];
		for (const el of m.querySelectorAll('*')) {
			const cs = getComputedStyle(el);
			if (el.scrollWidth > el.clientWidth + 1 && !['auto', 'scroll'].includes(cs.overflowX) && cs.overflowX !== 'hidden' && el.clientWidth > 0 && !(el instanceof SVGElement) && !el.closest('.ev-import-code, .ev-import-pin')) bad.push(el.className || el.tagName);
		}
		return bad.slice(0, 5);
	});
	if (spill.length) errors.push(`${name}: spills: ${spill.join(', ')}`);
	await page.locator('#frame').screenshot({ path: `${out}${name}.png` });
	console.log('shot', name);
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no errors');
process.exitCode = errors.length ? 1 : 0;
