// Screenshots of every builder step, wide and phone-sized, for checking the layout by eye.
// Usage: node e2e/builder-shots.mjs [outDir] [kind]
import { mkdirSync } from 'node:fs';
import { launchObsidian } from './harness.mjs';

const out = process.argv[2] || '/tmp/eb-shots';
const kind = process.argv[3] || 'monster';
mkdirSync(out, { recursive: true });
const o = await launchObsidian();
const { page } = o;
try {
	const scenario = process.argv[4] || 'regular';
	for (const [w, h, tag] of [[1440, 900, 'wide'], [1024, 768, 'tablet'], [390, 844, 'phone']]) {
		await page.setViewportSize({ width: w, height: h });
		await page.evaluate((p) => document.body.classList.toggle('is-phone', p), tag === 'phone');
		await o.eval((app, _p, k) => app.commands.executeCommandById(`nimble-gm:new-${k}`), kind);
		await page.waitForSelector('.nimble-entity-builder .eb-panel.is-active');
		await page.locator('.nimble-entity-builder .eb-panel.is-active input').first().fill('Cave Bear');
		if (scenario === 'solo') await page.locator('.nimble-entity-builder .eb-seg-btn', { hasText: 'Solo' }).click();
		if (scenario === 'template') {
			await page.locator('.nimble-entity-builder input[aria-label="Copy a monster"]').fill('goblin boss');
			await page.waitForTimeout(200);
			await page.keyboard.press('Enter');
			await page.locator('.nimble-entity-builder button[aria-label="Higher level"]').click();
			await page.locator('.nimble-entity-builder button[aria-label="Higher level"]').click();
		}
		await page.waitForTimeout(300);
		const steps = await page.locator('.nimble-entity-builder .eb-dot').count();
		const sizes = [];
		for (let i = 0; i < steps; i++) {
			await page.locator('.nimble-entity-builder .eb-dot').nth(i).click();
			await page.waitForTimeout(450);
			const box = await page.locator('.modal.nimble-entity-builder').boundingBox();
			sizes.push(`${Math.round(box.width)}x${Math.round(box.height)}`);
			const scroll = await page.evaluate(() => { const p = document.querySelector('.nimble-entity-builder .eb-panel.is-active'); return p ? p.scrollHeight - p.clientHeight : -1; });
			console.log(tag, i, 'overflow', scroll);
			await page.screenshot({ path: `${out}/${scenario}-${tag}-${i}.png` });
			if (tag === 'phone' && i === 0) { await page.locator('.eb-preview-btn').click(); await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${scenario}-${tag}-sheet.png` }); await page.locator('.eb-preview-btn').click(); await page.waitForTimeout(300); }
		}
		console.log(tag, 'modal sizes', [...new Set(sizes)].join(' '));
		await page.keyboard.press('Escape');
		await page.waitForTimeout(300);
	}
} finally {
	await o.close();
}
