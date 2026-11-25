// A demo video of Import… for a pull request: a real Obsidian (hidden, as the
// e2e tests run) on the sample adventure, driven step by step, with a visible
// cursor and a caption for each step, captured frame by frame over the Chrome
// DevTools Protocol and put together by ffmpeg into an MP4 (and a GIF, which
// GitHub shows inline).
//
//   node e2e/demo-video.mjs            → e2e/artifacts/demo/import.mp4 and import.gif
//
// Needs ffmpeg on the PATH. Nothing here ships in the plugin.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launchObsidian } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'e2e', 'artifacts', 'demo');
const FRAMES = join(OUT, 'frames');
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
const C = 'Campaigns/The Old Quarter';
const R = '.workspace-leaf.mod-active .markdown-reading-view';
const T = '.nimble-encounter-tracker';
const M = '.modal.ev-import';

const o = await launchObsidian({ vaultDir: join(ROOT, 'sample-vault') });
const { page } = o;
const W = 1440, H = 900;
await page.setViewportSize({ width: W, height: H });

// ---------------------------------------------------------------------------
// The overlay: a cursor that follows the mouse, a ring where it clicks, a caption.

await page.evaluate(() => {
	const style = document.createElement('style');
	style.textContent = `
		#demo-cursor { position: fixed; z-index: 99999; left: 0; top: 0; width: 22px; height: 22px; pointer-events: none; transform: translate(-3px, -2px); }
		#demo-cursor svg { width: 22px; height: 22px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.45)); }
		.demo-ring { position: fixed; z-index: 99998; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; border: 3px solid #c8321e; pointer-events: none; animation: demo-ring .5s ease-out forwards; }
		@keyframes demo-ring { from { transform: scale(.4); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }
		#demo-caption { position: fixed; z-index: 99997; left: 50%; bottom: 26px; transform: translateX(-50%); max-width: 80%; padding: 10px 18px; border-radius: 10px; background: rgba(24, 22, 19, .88); color: #fff; font: 600 17px/1.35 -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; pointer-events: none; transition: opacity .25s; }
		#demo-caption:empty { opacity: 0; }
	`;
	document.head.appendChild(style);
	const cursor = document.createElement('div');
	cursor.id = 'demo-cursor';
	cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.3-7.7L20.5 11z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
	document.body.appendChild(cursor);
	const caption = document.createElement('div');
	caption.id = 'demo-caption';
	document.body.appendChild(caption);
	document.addEventListener('mousemove', (e) => { cursor.style.left = `${e.clientX}px`; cursor.style.top = `${e.clientY}px`; }, true);
	document.addEventListener('mousedown', (e) => {
		const r = document.createElement('div');
		r.className = 'demo-ring';
		r.style.left = `${e.clientX}px`; r.style.top = `${e.clientY}px`;
		document.body.appendChild(r);
		setTimeout(() => r.remove(), 600);
	}, true);
});

// ---------------------------------------------------------------------------
// The recorder: a frame every ~66ms (15 fps), each with when it was taken.

const cdp = await page.context().newCDPSession(page);
const shots = [];
let recording = true;
const recorder = (async () => {
	let n = 0;
	while (recording) {
		const t = Date.now();
		try {
			const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
			const file = join(FRAMES, `f${String(n++).padStart(5, '0')}.jpg`);
			writeFileSync(file, Buffer.from(data, 'base64'));
			shots.push({ file, t });
		} catch { /* a frame missed while the page was busy */ }
		const wait = 66 - (Date.now() - t);
		if (wait > 0) await new Promise(r => setTimeout(r, wait));
	}
})();

let mx = W / 2, my = H / 2;
const pause = (ms) => page.waitForTimeout(ms);
const caption = (text) => page.evaluate((t) => { document.getElementById('demo-caption').textContent = t; }, text);
async function moveTo(loc) {
	await loc.scrollIntoViewIfNeeded().catch(() => {});
	const b = await loc.boundingBox();
	if (!b) throw new Error(`Not on screen: ${loc}`);
	const x = b.x + b.width / 2, y = b.y + b.height / 2;
	await page.mouse.move(x, y, { steps: Math.max(8, Math.round(Math.hypot(x - mx, y - my) / 22)) });
	mx = x; my = y;
}
async function click(loc, after = 450) {
	await moveTo(loc);
	await pause(180);
	await loc.click();
	await pause(after);
}

// ---------------------------------------------------------------------------
// The run

try {
	await page.mouse.move(mx, my);
	await o.openFile(`${C}/1 The Quicksilver Vaults/Q1 Entry Chamber.md`, 'preview');
	await pause(900);
	await caption('Import… lives in the compendium\'s ⋯ menu (and /import, and the command palette)');
	await o.eval((app, plugin) => plugin.openSystemCompendium());
	const cmp = page.locator('.nimble-compendium').first();
	await cmp.waitFor();
	await pause(900);
	await click(cmp.locator('.nimble-cmpx-more'));
	await click(page.locator('.menu .menu-item', { hasText: 'Import…' }), 900);

	await caption('Step 1, Choose: drop files, choose them, paste text or a link');
	await moveTo(page.locator(`${M} .ev-import-drop`));
	await pause(1500);
	await caption('A Nimble Nexus collection: three monsters and an item');
	await page.locator(`${M} input.ev-import-file`).setInputFiles({ name: 'marsh-folk.json', mimeType: 'application/json', buffer: readFileSync(join(ROOT, 'tests/fixtures/nexus-collection.json')) });
	await page.locator(`${M} .ev-import-paper .nimble-statblock`).waitFor();
	await pause(1200);

	await caption('Step 2, Review: each record drawn the way the vault will show it');
	await pause(1200);
	for (const name of ['Bog Wisp', 'The Drowned King', 'Lantern of the Drowned']) await click(page.locator(`${M} .ev-import-row`, { hasText: name }), 1100);
	await caption('Source shows what will be written, and the file as it was read');
	await click(page.locator(`${M} .ev-import-seg button`, { hasText: 'Source' }), 1400);
	await click(page.locator(`${M} .ev-import-row`, { hasText: 'Mire Hag' }), 1100);

	await caption('Import 4: written into the campaign, each remembering where it came from');
	await click(page.locator(`${M} button.ev-import-main`), 300);
	await page.locator(`${M} .ev-import-done`).waitFor();
	await caption('Step 3, Done: what it wrote, with Open');
	await pause(1600);
	await click(page.locator(`${M} .ev-import-written-row`, { hasText: 'Mire Hag' }).locator('.ev-import-open'), 300);
	await page.keyboard.press('Escape');
	await page.locator(M).waitFor({ state: 'detached' });
	await o.openFile(`${C}/Monsters/Mire Hag.md`, 'preview');
	await page.locator(`${R} .nimble-statblock`).first().waitFor();
	await caption('The Mire Hag is a monster note in the campaign: Add to encounter');
	await pause(1400);
	await click(page.locator(`${R} .add-btn`).first(), 300);
	await click(page.locator(`${R} .add-btn`).first(), 900);

	// Into the fight.
	await o.eval((app, plugin) => plugin.openTracker());
	await page.locator(`${T} .creature-item`).first().waitFor();
	await caption('Two Mire Hags in the tracker, with the HP and armor the import brought');
	await pause(1600);
	// A 5e monster, pasted, converted to Nimble.
	await caption('Now a 5e goblin, pasted from the SRD into this Nimble campaign');
	await o.eval((app) => { app.commands.executeCommandById('nimble-gm:import-content'); });
	await page.locator(M).waitFor();
	await pause(700);
	await moveTo(page.locator(`${M} textarea`));
	await page.locator(`${M} textarea`).fill('Goblin Warrior\nSmall Fey (Goblinoid), Chaotic Neutral\nAC 15 Initiative +2 (12)\nHP 10 (3d6)\nSpeed 30 ft.\nMOD SAVE MOD SAVE MOD SAVE\nStr 8 −1 −1 Dex 15 +2 +2 Con 10 +0 +0\nInt 10 +0 +0 Wis 8 −1 −1 Cha 8 −1 −1\nSkills Stealth +6\nSenses Darkvision 60 ft.; Passive Perception 9\nLanguages Common, Goblin\nCR 1/4 (XP 50; PB +2)\nActions\nScimitar. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage.\nShortbow. Ranged Attack Roll: +4, range 80/320 ft. Hit: 5 (1d6 + 2) Piercing damage.');
	await page.locator(`${M} .ev-import-paper .nimble-statblock`).waitFor();
	await caption('Converted on the GM Guide\'s numbers: level from CR, HP and damage from the table');
	await pause(2600);
	await caption('Original shows the 5e stat block it came from');
	await click(page.locator(`${M} .ev-import-seg button`, { hasText: 'Original' }), 1800);
	await click(page.locator(`${M} .ev-import-seg button`, { hasText: 'Preview' }), 500);
	await click(page.locator(`${M} button.ev-import-main`), 300);
	await page.locator(`${M} .ev-import-done`).waitFor();
	await pause(700);
	await click(page.locator(`${M} .ev-import-written-row`, { hasText: 'Goblin Warrior' }).locator('.ev-import-open'), 300);
	await page.keyboard.press('Escape');
	await page.locator(M).waitFor({ state: 'detached' });
	await o.openFile(`${C}/Monsters/Goblin Warrior.md`, 'preview');
	await page.locator(`${R} .ev-original`).waitFor();
	await caption('The note keeps the original, folded, with Convert again behind its ⋯');
	await click(page.locator(`${R} .ev-original-toggle`), 1800);
	await click(page.locator(`${R} .ev-original-more`), 1400);
	await page.keyboard.press('Escape');
	await click(page.locator(`${R} .ev-original-toggle`), 500);
	await caption('And into the same fight');
	await click(page.locator(`${R} .add-btn`).first(), 1200);
	const gob = page.locator(`${T} .creature-item`).filter({ hasText: 'Goblin Warrior' }).first();
	await gob.waitFor();
	await caption('Run the fight: 6 damage to the goblin');
	await click(gob.locator('.hp-display'), 300);
	await page.keyboard.type('6', { delay: 140 });
	await pause(500);
	await page.keyboard.press('Enter');
	await pause(1800);
	await caption('Import from anywhere');
	await pause(1800);
} finally {
	recording = false;
	await recorder;
	await o.close?.();
}

// ---------------------------------------------------------------------------
// Frames → MP4 (each frame held as long as it really was) → GIF

const list = shots.map((s, i) => {
	const next = shots[i + 1]?.t ?? s.t + 66;
	return `file '${s.file}'\nduration ${((next - s.t) / 1000).toFixed(3)}`;
}).join('\n') + `\nfile '${shots[shots.length - 1].file}'\n`;
writeFileSync(join(OUT, 'frames.txt'), list);
const mp4 = join(OUT, 'import.mp4');
const gif = join(OUT, 'import.gif');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(OUT, 'frames.txt'), '-vf', 'fps=30,scale=1440:-2:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-movflags', '+faststart', mp4]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', gif]);
const secs = ((shots[shots.length - 1].t - shots[0].t) / 1000).toFixed(1);
console.log(`${shots.length} frames, ${secs}s → ${mp4} and ${gif}`);
process.exit(0);
