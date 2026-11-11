// Layout sweep: opens every note of the sample vault where space is tight
// (Obsidian's hover page preview, and a phone-sized screen) and reports any
// plugin element that is crushed to nothing or spills out of its container.
//
//   npm run build && node e2e/layout-sweep.mjs [screenshot-dir]
//
// The regular suite checks behaviour; this catches "it renders, but you can't
// read it" in the places a wide desktop note never exercises. Exits 1 if it
// finds anything. Screenshots go to a temp folder (or the one you name).

import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchObsidian } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || mkdtempSync(join(tmpdir(), 'nimble-layout-'));
mkdirSync(OUT, { recursive: true });
// Known and harmless: a pin's number is a hair wider than its round badge and is centred over it.
const IGNORE = [/nimble-map-pin-inner/];

const o = await launchObsidian({ vaultDir: join(HERE, '..', 'sample-vault') });
await o.page.setViewportSize?.({ width: 1400, height: 900 }).catch(() => {});

// Runs in the page: scan everything the plugin rendered under `rootSel`.
const scan = (rootSel) => o.page.evaluate((rootSel) => {
	const root = document.querySelector(rootSel);
	if (!root) return { error: `no ${rootSel}` };
	const rr = root.getBoundingClientRect();
	const out = new Map();
	const sig = (e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`;
	const clipped = (e) => {
		for (let p = e.parentElement; p && p !== root.parentElement; p = p.parentElement) {
			if (getComputedStyle(p).overflowX !== 'visible') return true;
		}
		return false;
	};
	const seen = new Set();
	for (const b of root.querySelectorAll('[class*="block-language-"], table, .callout, [class*="nimble-"]')) {
		for (const e of [b, ...b.querySelectorAll('*')]) {
			if (seen.has(e)) continue;
			seen.add(e);
			const cs = getComputedStyle(e);
			if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed' || cs.display === 'inline' || cs.display === 'contents') continue;
			const r = e.getBoundingClientRect();
			const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
			if (!r.width && !r.height) { if (own.length >= 2) out.set(`ZERO ${sig(e)}`, own.slice(0, 30)); continue; }
			if (r.right > rr.right + 2 && !clipped(e)) out.set(`SPILLS ${sig(e)}`, `${Math.round(r.right - rr.right)}px past the edge`);
			if (own.length >= 4 && r.width < 16) out.set(`CRUSHED ${sig(e)}`, `${Math.round(r.width)}px wide: "${own.slice(0, 24)}"`);
			const lh = parseFloat(cs.lineHeight) || 20;
			if (own.length >= 6 && own.length < 40 && r.width < 70 && r.height > lh * 3.5) out.set(`TALL ${sig(e)}`, `${Math.round(r.width)}×${Math.round(r.height)}: "${own.slice(0, 24)}"`);
			if (e.scrollWidth > e.clientWidth + 4 && cs.overflowX === 'visible' && e.clientWidth > 0) out.set(`OVERFLOWS ${sig(e)}`, `content ${e.scrollWidth}px in ${e.clientWidth}px`);
		}
	}
	return { width: Math.round(rr.width), issues: [...out].map(([k, v]) => `${k} — ${v}`) };
}, rootSel);

/** Scan a scrolling view top to bottom, so lazily rendered sections are covered. */
async function scanAll(viewSel, shot, stepPx) {
	const all = new Set();
	let width = 0;
	for (let step = 0; step < 14; step++) {
		const res = await scan(viewSel);
		if (res.error && step > 0) break; // a hover preview can close on its own part-way; what was scanned still counts
		width = res.width ?? width;
		(res.issues ?? [res.error]).forEach(x => all.add(x));
		if (step < 2) await shot(step);
		const more = await o.page.evaluate(([sel, px]) => {
			const v = document.querySelector(sel);
			if (!v) return false;
			const before = v.scrollTop;
			v.scrollTop += px;
			return v.scrollTop > before;
		}, [viewSel, stepPx]);
		await o.page.waitForTimeout(280);
		if (!more) break;
	}
	return { width, issues: [...all].filter(i => !IGNORE.some(re => re.test(i))) };
}

const report = [];
try {
	const paths = await o.eval(async (app) => {
		const files = app.vault.getMarkdownFiles().map(f => f.path).filter(p => !p.startsWith('Credits')).sort();
		await app.vault.create('Sweep.md', files.map(p => `- [[${p.replace(/\.md$/, '')}]]`).join('\n') + '\n');
		return files;
	});
	await o.page.waitForTimeout(1500);

	// 1. Obsidian's page preview (Cmd/Ctrl + hover)
	await o.openFile('Sweep.md', 'preview');
	const POP = '.popover.hover-popover .markdown-preview-view';
	for (const [i, p] of paths.entries()) {
		const link = o.page.locator('.markdown-reading-view a.internal-link').nth(i);
		await link.scrollIntoViewIfNeeded();
		let open = false;
		for (let t = 0; t < 4 && !open; t++) {
			await o.page.mouse.move(900, 20);
			await o.page.keyboard.down('Meta');
			await link.hover();
			await o.page.waitForTimeout(1100);
			await o.page.keyboard.up('Meta');
			open = (await o.page.locator(POP).count()) > 0;
		}
		if (!open) { report.push({ where: 'hover preview', note: p, issues: ['the preview did not open'] }); continue; }
		const res = await scanAll(POP, (s) => o.page.locator('.popover.hover-popover').screenshot({ path: join(OUT, `hover-${String(i).padStart(2, '0')}-${s}.png`) }).catch(() => {}), 320);
		if (res.issues.length) report.push({ where: `hover preview (${res.width}px)`, note: p, issues: res.issues });
		await o.page.mouse.move(900, 20);
		await o.page.keyboard.press('Escape');
		await o.page.waitForTimeout(700);
	}

	// 2. A phone
	await o.eval(async (app) => { app.emulateMobile(true); });
	await o.page.setViewportSize({ width: 390, height: 844 });
	await o.page.waitForTimeout(1500);
	const VIEW = '.workspace-leaf.mod-active .markdown-reading-view .markdown-preview-view';
	for (const [i, p] of paths.entries()) {
		await o.openFile(p, 'preview');
		await o.page.waitForTimeout(500);
		const res = await scanAll(VIEW, (s) => o.page.screenshot({ path: join(OUT, `phone-${String(i).padStart(2, '0')}-${s}.png`) }).catch(() => {}), 600);
		if (res.issues.length) report.push({ where: `phone (${res.width}px)`, note: p, issues: res.issues });
	}

	console.log(`Checked ${paths.length} notes in the hover preview and at phone width. Screenshots: ${OUT}`);
	for (const r of report) console.log(`\n  ✗ ${r.where}: ${r.note}\n      ${r.issues.join('\n      ')}`);
	if (!report.length) console.log('  ✓ nothing crushed or spilling');
	if (o.consoleErrors.length) console.log('\nconsole errors:', o.consoleErrors.slice(0, 10));
} finally {
	await o.close();
}
process.exit(report.length ? 1 : 0);
