// Exploratory pass: open each fixture note, screenshot, and probe suspected bugs.
// Usage: node e2e/explore.mjs <outDir>
import { mkdirSync } from 'node:fs';
import { launchObsidian } from './harness.mjs';

const out = process.argv[2] || '/tmp/nimble-explore';
mkdirSync(out, { recursive: true });
const o = await launchObsidian();
const { page } = o;
const findings = {};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

try {
	// 1. Inline refs right after startup (index may not be built yet)
	await o.openFile('Adventure.md');
	await page.waitForTimeout(800);
	findings.inlineAfterStartup = await page.evaluate(() => ({
		found: document.querySelectorAll('.markdown-reading-view .nimble-inline-found').length,
		unresolved: [...document.querySelectorAll('.markdown-reading-view .nimble-inline-unresolved')].map(e => e.textContent),
	}));
	await shot('01-adventure-reading');

	// Inline refs in Live Preview (editing) mode
	await o.openFile('Adventure.md', 'source');
	await page.waitForTimeout(800);
	findings.inlineInLivePreview = await page.evaluate(() => ({
		found: document.querySelectorAll('.markdown-source-view .nimble-inline-ref').length,
	}));
	await shot('02-adventure-live-preview');

	// 2. Code blocks
	for (const f of ['Bestiary/Goblin.md', 'Bestiary/Goblin Boss.md', 'Bestiary/Young Dragon.md', 'Edge Cases.md']) {
		await o.openFile(f);
		await page.waitForTimeout(500);
		await shot('03-' + f.replace(/[/ ]/g, '_'));
	}
	findings.edge = await page.evaluate(() => {
		const blocks = [...document.querySelectorAll('.markdown-reading-view .nimble-statblock')];
		return {
			count: blocks.length,
			names: blocks.map(b => b.querySelector('.monster-name-inline, .monster-name')?.textContent),
			xssFired: !!window.__nimbleXss,
			injectedTags: blocks.map(b => b.querySelectorAll('b, i, img').length),
			snakeLinkHtml: blocks[0]?.querySelector('.ability-item')?.innerHTML,
			errors: [...document.querySelectorAll('.nimble-error')].map(e => e.textContent),
			tildeRendered: document.body.innerText.includes('Tilde Toad'),
		};
	});
	findings.paperGolemHp = await o.eval((app, plugin) => plugin.index.get('Paper Golem')?.monster.hp);
	findings.tildeIndexed = await o.eval((app, plugin) => !!plugin.index.get('Tilde Toad'));

	// 3. Encounter tracker: rapid adds, label numbering after removal
	await o.openFile('Bestiary/Goblin.md');
	await page.click('.markdown-reading-view .nimble-statblock .add-btn');
	await page.waitForTimeout(600);
	await o.eval((app, plugin) => {
		const g = plugin.index.get('Goblin');
		plugin.addToEncounter(g.monster, g.filePath);
		plugin.addToEncounter(g.monster, g.filePath);
	});
	await page.waitForTimeout(300);
	findings.rapidAddIds = await o.eval((app, plugin) => {
		const enc = plugin.settings.encounters[0];
		return enc.creatures.map(c => c.id + ':' + c.label);
	});
	// remove Goblin-1 then add again -> label clash?
	await o.eval((app, plugin) => {
		const enc = plugin.settings.encounters[0];
		plugin.encounters.remove(enc.id, enc.creatures[0].id);
		const g = plugin.index.get('Goblin');
		plugin.addToEncounter(g.monster, g.filePath);
	});
	findings.labelsAfterRemoveAdd = await o.eval((app, plugin) => plugin.settings.encounters[0].creatures.map(c => c.label));
	await page.waitForTimeout(400);
	await shot('04-tracker');

	// HP: clicking -5 on second creature, check that scroll/focus and classes update
	await page.locator('.nimble-encounter-tracker .creature-item').first().locator('.hp-btn', { hasText: '-5' }).click();
	await page.waitForTimeout(200);
	findings.hpAfterMinus5 = await page.locator('.nimble-encounter-tracker .hp-display').first().textContent();
	await shot('05-tracker-after-damage');

	// Condition picker opens & closes
	await page.locator('.nimble-encounter-tracker .add-condition-btn').first().click();
	await page.waitForTimeout(200);
	await shot('06-condition-picker');
	findings.pickerOptions = await page.locator('.condition-picker .picker-option').count();
	await page.keyboard.press('Escape');
	await page.waitForTimeout(200);
	findings.pickerAfterEscape = await page.locator('.condition-picker').count();

	// Hover preview
	await o.openFile('Adventure.md');
	await page.waitForTimeout(500);
	const ref = page.locator('.markdown-reading-view .nimble-inline-name').first();
	if (await ref.count()) {
		await ref.hover();
		await page.waitForTimeout(700);
		findings.hoverPreview = await page.locator('#nimble-hover-preview-active').count();
		await shot('07-hover-preview');
	}

	// Settings tab
	await o.eval((app) => { app.setting.open(); app.setting.openTabById('nimble-statblocks'); });
	await page.waitForTimeout(500);
	await shot('08-settings');
	await o.eval((app) => app.setting.close());

	// Dark mode screenshot of dragon
	await o.eval((app) => app.changeTheme?.('obsidian') ?? document.body.classList.replace('theme-light', 'theme-dark'));
	await o.openFile('Bestiary/Young Dragon.md');
	await page.waitForTimeout(500);
	await shot('09-dragon-dark');

	findings.consoleErrors = o.consoleErrors;
} catch (e) {
	findings.crash = String(e.stack || e);
	await shot('zz-crash').catch(() => {});
} finally {
	console.log(JSON.stringify(findings, null, 2));
	await o.close();
}
