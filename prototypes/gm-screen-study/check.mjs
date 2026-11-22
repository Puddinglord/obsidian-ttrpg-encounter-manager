// Every page of the GM screen study in headless Chrome: script errors, empty pages, sideways scroll; a screenshot of
// each into /tmp/gm-screen-study/ (or the folder given).
//
//   node prototypes/gm-screen-study/check.mjs [outdir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const executablePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const file = new URL('../gm-screen-study.html', import.meta.url).href;
const out = process.argv[2] || '/tmp/gm-screen-study';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath, headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(file); await p.waitForTimeout(800);
const pages = await p.evaluate(() => [...document.querySelectorAll('#tabs button')].map(b => b.dataset.p));
for (const theme of ['light', 'dark']) {
	if (theme === 'dark') { await p.click('#theme button[data-t="dark"]'); await p.waitForTimeout(500); }
	for (const id of pages) {
		await p.evaluate((id) => { location.hash = id; }, id);
		await p.waitForTimeout(250);
		const info = await p.evaluate(() => { const s = document.querySelector('section.page.on'); return { text: s ? s.innerText.length : 0, pre: !!s?.querySelector('pre'), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
		if (!info.text || info.pre) errors.push(`${id} (${theme}): ${info.pre ? 'threw' : 'empty'}`);
		if (info.sideways > 0) errors.push(`${id} (${theme}): ${info.sideways}px sideways scroll`);
		if (theme === 'light' || id === 'screen') await p.screenshot({ path: `${out}/${id}-${theme}.png`, fullPage: true });
	}
}
await b.close();
console.log(errors.length ? errors.join('\n') : 'no errors');
process.exit(errors.length ? 1 : 0);
