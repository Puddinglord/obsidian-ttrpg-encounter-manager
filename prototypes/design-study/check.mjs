// Opens the built study in a headless Chrome and visits every game's page and sub-tab:
// reports script errors, pages that came out nearly empty, and sideways scroll.
//
//   node prototypes/design-study/check.mjs        (CHROME_BIN overrides where Chrome is)
import { chromium } from 'playwright-core';


const file = new URL('../encounter-design-study.html', import.meta.url).href;
const executablePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await chromium.launch({ executablePath, headless: true });
const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto(file); await p.waitForTimeout(800);
for (const g of ['5e', 'nimble', 'coc', 'dh', 'pf']) for (const s of ['', '/sheet', '/npc', '/block', '/campaign', '/ds']) {
	await p.evaluate(h => { location.hash = h; }, g + s); await p.waitForTimeout(250);
	const len = await p.evaluate(() => (document.querySelector('.subpage:not([hidden])')?.innerText || document.body.innerText).trim().length);
	if (len < 200) errs.push(`thin page ${g}${s}: ${len} chars`);
}
const scroll = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(errs.length ? errs.slice(0, 10).join('\n') : 'no errors');
console.log('sideways scroll px:', scroll);
await b.close();
process.exitCode = errs.length || scroll > 0 ? 1 : 0;
