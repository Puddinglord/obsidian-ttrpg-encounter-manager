// Visual validation: drives every surface of both games (e2e/visual-surfaces.mjs) in one hidden
// Obsidian, at every width and in both themes, screenshots each, and checks each in the page:
// pills centred on their capitals, text cut off, things wrapping that shouldn't, spilling,
// overlapping or crushed, and tag labels too faint on their fill (e2e/visual-checks.mjs).
//
//   npm run test:visual                    build, then every surface (a while: about a thousand shots)
//   node e2e/visual.mjs nimble sheet       Nimble's surfaces whose name contains "sheet"
//   node e2e/visual.mjs 5e tracker,map     several names, comma-separated
//   node e2e/visual.mjs --widths=320,900 --themes=light --no-phone
//
// Widths: a note or main-area view at content widths 320, 540, 700 and 900 (and a phone at 390,
// in Obsidian's mobile emulation); dialogs at those window widths; sidebars at 260, 340 and 420.
//
// Out: e2e/artifacts/visual/<game>/<surface>/<width>-<theme>.png, a copy with the problems
// outlined (…​.issues.png), report.json, report.md (worst first) and index.html (a gallery).
// Exits 1 if anything is left after the ignore list below, so it can gate a release.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchObsidian } from './harness.mjs';
import { pillOffenders, PILL_SELECTORS, NOT_PILLS } from './align.mjs';
import { markRoot, frameRoot, markPillLikes, visualChecks, drawOutlines, clearOutlines, settle } from './visual-checks.mjs';
import { SURFACES, prepareVault } from './visual-surfaces.mjs';
import { writeReport } from './visual-report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'e2e', 'artifacts', 'visual');

// ---------------------------------------------------------------------------
// what to run

const args = process.argv.slice(2);
const flag = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const words = args.filter(a => !a.startsWith('--'));
const GAMES = ['nimble', '5e', 'shared'];
const gameFilter = words.filter(w => GAMES.includes(w));
const nameFilter = words.filter(w => !GAMES.includes(w)).flatMap(w => w.split(','));
const WIDTHS = { content: [320, 540, 700, 900], window: [320, 540, 700, 900], sidebar: [260, 340, 420] };
const onlyWidths = flag('widths')?.split(',').map(Number);
const THEMES = flag('themes')?.split(',') ?? ['light', 'dark'];
const PHONE = !args.includes('--no-phone');
const DESKTOP = !args.includes('--phone-only');
const PAD = 12;
const MAX_H = 3200;
const DESKTOP_H = 900;
const PHONE_W = 390, PHONE_H = 844;

// ---------------------------------------------------------------------------
// The ignore list: genuine false positives only, each with why. A rule matches on any of
// `kind`, `surface` (game/name), `sel` (the element) and `detail`, all regular expressions.

const IGNORE = [
	// Obsidian's own chrome inside a surface (the settings dialog's frame, a modal's close button).
	{ sel: /^div\.modal-close-button|^div\.vertical-tab/, why: "Obsidian's own controls, not ours" },
	// Obsidian's own accent button (a plain .mod-cta): its colours are the theme's, not ours.
	{ sel: /^button\.mod-cta$/, kind: /contrast/, why: "Obsidian's accent button, coloured by the theme" },
	// Obsidian's settings window at 320px leaves its tab content about 30px wide: nothing anyone's fits.
	{ surface: /^shared\/settings$/, width: 320, why: "Obsidian's settings window has no room for its content at 320px" },
	// At 540px its tab is about 210px: Obsidian's own setting rows wrap a name beside its toggle, ours as any plugin's.
	{ surface: /^shared\/settings$/, width: 540, kind: /wrap/, sel: /^div\.setting-item-name$/, why: "Obsidian's setting rows in a 210px tab (its layout, not ours)" },
	// A map pin's number is a hair wider than its round badge and is centred over it (as in layout-sweep).
	{ sel: /nimble-map-pin-inner/, kind: /spill|clipped/, why: 'centred over the badge on purpose' },
	// Four reaction cards across a narrow sheet: a two-word name ("Opportunity Attack") takes two lines, balanced and centred.
	{ sel: /^b\.ns-rc-name$/, kind: /wrap/, why: 'a reaction card name in four narrow cards wraps on purpose (text-wrap: balance, centred)' },
	// The 5e tracker card's name is a heading you can click (role=button), not a button label: in a 260px sidebar or on a
	// phone a long one ("Goblin Warrior") takes two balanced lines rather than ending in "…".
	{ surface: /^5e\/tracker$/, sel: /^h2\.dnd5e-combatant-name$/, kind: /wrap/, width: 260, why: "the card's name wraps balanced when the card is this narrow" },
	{ surface: /^5e\/tracker$/, sel: /^h2\.dnd5e-combatant-name$/, kind: /wrap/, width: 'phone', why: "the card's name wraps balanced when the card is this narrow" },
	// Cut-with-… labels that are meant to be: a secondary line under a name, never the name or the action itself.
	{ surface: /condition-picker$/, sel: /^small$/, kind: /truncated/, why: "a condition's one-line summary in the picker; its full rules open beside it" },
	{ sel: /eb-folder-parent/, kind: /truncated/, why: "the folder path above the note's name in the builder; the name stays whole" },
	{ sel: /ns-row-detail/, kind: /truncated/, why: "an item's detail line under its name; the row opens to the full text" },
	// The narrowest sidebar (260px) has no room for a long campaign, chapter or creature name: it ends in …, with the full name as its tooltip.
	{ width: 260, kind: /truncated/, sel: /campaign-switch-name|campaign-chapter-name|dnd5e-member/, why: "a long name at the 260px sidebar, with its tooltip" },
	// A group member's chip in the 260px 5e tracker ("4 / 10 · Frightened"): its HP stays whole, a condition after it may end in …, with the full text as its tooltip.
	{ surface: /^5e\/tracker$/, width: 260, kind: /truncated/, sel: /^span$/, detail: /^button label "\d+ \/ \d+/, why: "a group member's condition at the 260px sidebar" },
	// "Next: <a long creature name>" in the 260px tracker: the name ends in …, "Next:" and the button stay whole.
	{ surface: /\/tracker$/, width: 260, kind: /truncated/, sel: /^span\.ev-pill-text$/, detail: /^button label "Next: /, why: "the next creature's long name at the 260px sidebar" },
];
const ignored = (surface, i, width) => IGNORE.find(r => (!r.kind || r.kind.test(i.kind)) && (!r.surface || r.surface.test(surface)) && (!r.sel || r.sel.test(i.sel)) && (!r.detail || r.detail.test(i.detail)) && (!r.width || r.width === width));

// ---------------------------------------------------------------------------

// A name matches a surface ("sheet") or one of its states ("sheet-inventory", "builder-monster-03").
const surfaces = SURFACES.filter(s => (!gameFilter.length || gameFilter.includes(s.game)) && (!nameFilter.length || nameFilter.some(n => s.name.includes(n) || n.startsWith(`${s.name}-`))));
const stateWanted = (s, full) => !nameFilter.length || nameFilter.some(n => s.name.includes(n) || (n.startsWith(`${s.name}-`) && full.includes(n)));
if (!surfaces.length) { console.log('No surface matches.'); process.exit(0); }
// A run of everything starts afresh; a run of some surfaces updates them in the last report and keeps the rest.
const partial = gameFilter.length || nameFilter.length || onlyWidths || flag('themes') || !PHONE || !DESKTOP;
const earlier = partial && existsSync(join(OUT, 'report.json')) ? JSON.parse(readFileSync(join(OUT, 'report.json'), 'utf8')) : null;
if (!gameFilter.length && !nameFilter.length) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const o = await launchObsidian({ vaultDir: join(ROOT, 'sample-vault') });
const { page } = o;
// Its own Obsidian (its own user-data dir under this folder), so a stuck run can be told apart from any other.
console.log(`Obsidian for this run: ${o.work}`);
const cdp = await page.context().newCDPSession(page);
// A step that can't find its control fails in seconds, not Playwright's 30.
page.setDefaultTimeout(8000);
const originals = new Map();

let viewport = { width: 1200, height: DESKTOP_H, mobile: false };
async function setViewport(width, height, mobile = viewport.mobile) {
	viewport = { width: Math.round(width), height: Math.round(height), mobile };
	await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 2, mobile });
	// Let the resize land: Obsidian's resize handlers, then two frames for layout.
	await page.waitForTimeout(120);
	await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** What the setups get: the app and the small moves they all make. */
const c = {
	o, page,
	wait: (ms) => page.waitForTimeout(ms),
	eval: (fn, arg) => o.eval(fn, arg),
	cmd: (id) => o.eval((app, _p, id) => app.commands.executeCommandById(`nimble-gm:${id}`), id),
	async open(path, mode = 'preview') {
		await o.eval(async (app, _p, [path, mode]) => {
			const f = app.vault.getAbstractFileByPath(path);
			if (!f) throw new Error(`no note ${path}`);
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(f, { state: { mode } });
			app.workspace.setActiveLeaf(leaf, { focus: true });
		}, [path, mode]);
		await page.waitForTimeout(800);
	},
	async campaign(folder) {
		await o.eval(async (app, plugin, f) => { if (plugin.settings.activeCampaign !== f) await plugin.campaigns.setActive(f); }, folder);
	},
	async click(selector, opts) {
		await page.locator(selector, opts).filter({ visible: true }).first().click();
		await page.waitForTimeout(350);
	},
	/** Put a note back as it was when the run started (a setup that taps Rage, levels up…). */
	async restore(path) {
		if (!originals.has(path)) originals.set(path, await o.eval((app, _p, p) => app.vault.adapter.read(p), path));
		else await o.eval(async (app, _p, [p, text]) => { const f = app.vault.getAbstractFileByPath(p); if ((await app.vault.read(f)) !== text) await app.vault.modify(f, text); }, [path, originals.get(path)]);
		await page.waitForTimeout(200);
	},
	pack: (name) => readFileSync(join(ROOT, 'docs', 'content', 'examples', name), 'utf8'),
	fixture: (rel) => readFileSync(join(ROOT, rel), 'utf8'),
	/** Close dialogs, menus, popovers and notices; one tab; sidebars shut. */
	async clean() {
		await page.mouse.move(2, 2).catch(() => {});
		for (let i = 0; i < 5 && await page.locator('.modal-container').count(); i++) {
			const discard = page.locator('.modal-container button.mod-warning', { hasText: 'Discard' });
			if (await discard.count()) { await discard.first().click().catch(() => {}); await page.waitForTimeout(200); continue; }
			await page.keyboard.press('Escape');
			await page.waitForTimeout(200);
		}
		await o.eval(async (app, plugin) => {
			plugin.hover?.hide?.();
			plugin.omnisearch?.close?.();
			app.setting?.close?.();
			document.querySelectorAll('.menu, .nimble-popover, .suggestion-container, .notice, .ev-term-popover, .tooltip').forEach(n => n.remove());
			document.querySelectorAll('.modal-container').forEach(n => n.remove());
			const keymap = app.keymap;
			for (let i = 0; i < 10 && keymap?.scope && keymap.scope !== app.scope; i++) keymap.popScope(keymap.scope);
			const leaves = [];
			app.workspace.iterateRootLeaves(l => leaves.push(l));
			leaves.slice(1).forEach(l => l.detach());
			// The plugin's panels (trackers, the Campaign and Character panels, compendiums): each setup opens what it shows.
			const ours = [];
			app.workspace.iterateAllLeaves(l => { if (/^nimble-/.test(l.view?.getViewType?.() ?? '')) ours.push(l); });
			ours.forEach(l => { if (!leaves.includes(l) || leaves.indexOf(l) > 0) l.detach(); });
			app.workspace.leftSplit.collapse();
			app.workspace.rightSplit.collapse();
		});
		await page.waitForTimeout(250);
	},
};

async function setTheme(theme) {
	await page.evaluate((dark) => { document.body.classList.toggle('theme-dark', dark); document.body.classList.toggle('theme-light', !dark); }, theme === 'dark');
	await page.waitForTimeout(120);
}

/** Size the window for a width: a note's content, a dialog's window, or a sidebar. */
async function applyWidth(s, width, phone) {
	// The height a state grew to for an earlier width stays: the next width usually needs about as much.
	const h = Math.max(viewport.height, phone ? PHONE_H : DESKTOP_H);
	if (phone) { await setViewport(PHONE_W, h, true); return; }
	if (s.mode === 'sidebar') {
		await setViewport(1200, h, false);
		await o.eval((app, _p, [side, w]) => { const split = side === 'left' ? app.workspace.leftSplit : app.workspace.rightSplit; split.expand(); split.setSize?.(w); }, [s.side, width]);
		await page.waitForTimeout(250);
		return;
	}
	if (s.mode === 'window') { await setViewport(width, h, false); return; }
	// content: the note's readable width set to the target, and the window just wide enough for it.
	await page.evaluate((w) => document.body.style.setProperty('--file-line-width', `${w}px`), width);
	let w = width + 200;
	for (let i = 0; i < 3; i++) {
		await setViewport(w, h, false);
		const got = await page.evaluate(() => {
			const root = document.querySelector('[data-vis-root]');
			if (!root) return null;
			const box = root.closest('.markdown-preview-sizer, .cm-sizer') ?? root;
			const cs = getComputedStyle(box);
			return box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
		});
		if (got === null || Math.abs(got - width) <= 1) break;
		w += width - got;
	}
}

const shots = [];
const errors = [];
const unknownPills = new Map();

async function capture(s, name, width, theme, phone) {
	const room = !phone && (s.mode === 'sidebar' ? width >= 340 : width >= 540);
	await page.evaluate(settle, 900);
	let f = await page.evaluate(frameRoot, { pad: PAD });
	for (let i = 0; f && f.hidden > 0 && viewport.height < MAX_H && i < 3; i++) {
		await setViewport(viewport.width, Math.min(MAX_H, viewport.height + Math.ceil(f.hidden * 1.2) + 16));
		await page.evaluate(settle, 600);
		f = await page.evaluate(frameRoot, { pad: PAD });
	}
	if (!f) throw new Error('the surface went away');
	for (const p of await page.evaluate(markPillLikes, { selectors: PILL_SELECTORS, notPills: NOT_PILLS })) {
		const u = unknownPills.get(p.sel) ?? { n: 0, where: new Set() };
		u.n += p.n; u.where.add(`${s.game}/${name}`);
		unknownPills.set(p.sel, u);
	}
	const T0 = Date.now();
	const pills = await page.evaluate(pillOffenders, { root: '[data-vis-root]', tolerance: 1, gap: 3, selectors: [...PILL_SELECTORS, '[data-vis-pill]'].map(x => `${x}:not([data-vis-offscreen])`) });
	const T1 = Date.now();
	const checks = await page.evaluate(visualChecks, { room, pillSelectors: PILL_SELECTORS });
	const T2 = Date.now();
	const all = [
		...pills.filter(p => p.part !== 'missing root').map(p => {
			const m = /^(\S+)(?: "(.*)")?$/.exec(p.el) ?? [];
			const off = Math.abs(p.offset);
			const detail = p.part === 'icon gap' ? `icon ${p.offset}px from its label (needs 3px)` : p.part === 'icon vs text' ? `icon and label ${off}px apart on the centre line` : `${p.part} ${p.offset > 0 ? off + 'px low' : off + 'px high'} of the pill's centre`;
			return { kind: 'pill', sev: off >= 2 ? 4 : 3, sel: m[1] ?? p.el, path: m[1] ?? p.el, text: m[2] ?? '', detail, rect: p.rect };
		}),
		...checks,
	];
	const surface = `${s.game}/${name}`;
	const issues = [], skipped = [];
	for (const i of all) (ignored(surface, i, phone ? 'phone' : width) ? skipped : issues).push(i);
	issues.sort((a, b) => b.sev - a.sev);

	// The shot: the surface (and anything sticking out of it) with even padding, clamped to the window.
	const vis = issues.filter(i => i.rect && i.rect.w && i.rect.h && i.rect.y < viewport.height && i.rect.y + i.rect.h > 0);
	const left = Math.min(f.left, ...vis.map(i => i.rect.x)) - PAD, top = Math.min(f.top, ...vis.map(i => i.rect.y)) - PAD;
	const right = Math.max(f.right, ...vis.map(i => i.rect.x + i.rect.w)) + PAD, bottom = Math.max(f.bottom, ...vis.map(i => i.rect.y + i.rect.h)) + PAD;
	const clip = { x: Math.max(0, Math.floor(left)), y: Math.max(0, Math.floor(top)) };
	clip.width = Math.max(10, Math.min(viewport.width, Math.ceil(right)) - clip.x);
	clip.height = Math.max(10, Math.min(viewport.height, Math.ceil(bottom)) - clip.y);
	const dir = join(OUT, s.game, name);
	mkdirSync(dir, { recursive: true });
	const base = `${phone ? 'phone-' : ''}${width}-${theme}`;
	const grab = async (file) => {
		const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: false });
		writeFileSync(join(dir, file), Buffer.from(data, 'base64'));
	};
	await grab(`${base}.png`);
	if (process.env.VIS_TIMING) console.log(`    ${name} ${base}: pills ${T1 - T0}ms, checks ${T2 - T1}ms, shot ${Date.now() - T2}ms, ${clip.width}×${clip.height}`);
	if (issues.length) {
		await page.evaluate(drawOutlines, issues);
		await grab(`${base}.issues.png`);
		await page.evaluate(clearOutlines);
	} else rmSync(join(dir, `${base}.issues.png`), { force: true }); // an outline from an earlier run, now fixed
	ran.add(`${s.game}/${name}|${!!phone}`);
	shots.push({
		game: s.game, surface: name, mode: s.mode, width, theme, phone,
		file: `${s.game}/${name}/${base}.png`, outlined: issues.length ? `${s.game}/${name}/${base}.issues.png` : null,
		clip, issues, ignored: skipped.length,
	});
	return issues.length;
}

async function runSurface(s, phone) {
	if (phone && s.phone === false) return;
	const widths = phone ? [PHONE_W] : WIDTHS[s.mode].filter(w => !onlyWidths || onlyWidths.includes(w));
	if (!widths.length) return;
	// `width`: set it up at that width (a popover or hover card closes when the window or sidebar changes size).
	const setup = async (width) => {
		await c.clean();
		await setViewport(phone ? PHONE_W : 1200, phone ? PHONE_H : DESKTOP_H, phone);
		await page.evaluate(() => document.body.style.setProperty('--file-line-width', '700px'));
		if (width && s.mode !== 'content') await applyWidth(s, width, phone);
		await s.setup(c);
		if (!s.hover) await page.mouse.move(2, 2);
	};
	const started = Date.now();
	try {
		await setup(widths[0]);
	} catch (e) {
		ran.add(`${s.game}/${s.name}|${!!phone}`);
		errors.push({ game: s.game, surface: s.name, phone, error: `setup: ${e.message.split('\n')[0]}` });
		console.log(`  ✗ ${s.game}/${s.name}${phone ? ' (phone)' : ''}: setup failed: ${e.message.split('\n')[0]}`);
		return;
	}
	const states = typeof s.states === 'function' ? await s.states(c) : (s.states ?? [null]);
	for (const st of states) {
		const name = st ? `${s.name}-${st.name}` : s.name;
		if (!stateWanted(s, name)) continue;
		let n = 0;
		try {
			if (st) await st.go(c);
			for (const width of widths) {
				for (const [ti, theme] of THEMES.entries()) {
					if (ti === 0) {
						let ok = await page.evaluate(markRoot, s.root);
						if (ok) { await applyWidth(s, width, phone); ok = await page.evaluate(markRoot, s.root); }
						// A dialog or hover card can close when the window changes: set it up again.
						if (!ok) {
							await setup(width);
							if (st) await st.go(c);
							await page.evaluate(markRoot, s.root);
							if (s.mode === 'content') await applyWidth(s, width, phone);
							if (!await page.evaluate(markRoot, s.root)) throw new Error(`no ${s.root} at ${width}px`);
						}
					}
					await setTheme(theme);
					if (!await page.evaluate(markRoot, s.root)) {
						// Gone between shots (a hover card or a toast timing out): set it up again in this theme.
						await setup(width);
						if (st) await st.go(c);
						if (s.mode === 'content' && await page.evaluate(markRoot, s.root)) await applyWidth(s, width, phone);
						await setTheme(theme);
						if (!await page.evaluate(markRoot, s.root)) throw new Error(`no ${s.root} at ${width}px ${theme}`);
					}
					n += await capture(s, name, width, theme, phone);
				}
			}
			console.log(`  ${n ? '✗' : '✓'} ${s.game}/${name}${phone ? ' (phone)' : ''}: ${n} issue${n === 1 ? '' : 's'} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
		} catch (e) {
			ran.add(`${s.game}/${name}|${!!phone}`);
			errors.push({ game: s.game, surface: name, phone, error: e.message.split('\n')[0] });
			console.log(`  ✗ ${s.game}/${name}${phone ? ' (phone)' : ''}: ${e.message.split('\n')[0]}`);
		}
	}
	await setTheme('light');
	// Put back any note this surface changed (a Rage, a die, a level), so the next one starts from the sample.
	for (const [path, text] of originals) {
		await o.eval(async (app, _p, [p, text]) => { const f = app.vault.getAbstractFileByPath(p); if (f && (await app.vault.read(f)) !== text) await app.vault.modify(f, text); }, [path, text]).catch(() => {});
	}
}

const t0 = Date.now();
/** Write the report as it stands (after every surface, so a long run can be read before it ends). */
/** This run's shots and errors, with the last report's for every surface (and pass) this run didn't redo. */
const ran = new Set();
const merged = (list) => [...(earlier ? list(earlier).filter(x => !ran.has(`${x.game}/${x.surface}|${!!x.phone}`)) : []), ...list({ shots, errors })];
const pillsSoFar = () => {
	const all = new Map((earlier?.unknownPills ?? []).map(u => [u.sel, { n: u.n, where: new Set(u.where) }]));
	for (const [sel, u] of unknownPills) { const a = all.get(sel) ?? { n: 0, where: new Set() }; a.n += u.n; u.where.forEach(w => a.where.add(w)); all.set(sel, a); }
	return [...all].map(([sel, u]) => ({ sel, n: u.n, where: [...u.where] }));
};
const flush = () => writeReport(OUT, { shots: merged(r => r.shots), errors: merged(r => r.errors), unknownPills: pillsSoFar(), ignore: IGNORE.map(r => ({ ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])) })), seconds: Math.round((Date.now() - t0) / 1000), pillSelectors: PILL_SELECTORS });
try {
	await prepareVault(o, ROOT);
	// Obsidian's status bar floats over the bottom right of the window; keep it out of the shots.
	await page.evaluate(() => { const st = document.createElement('style'); st.id = 'vis-style'; st.textContent = '.status-bar { display: none; }'; document.head.append(st); });
	if (DESKTOP) for (const s of surfaces) { await runSurface(s, false); flush(); }
	if (PHONE) {
		// The phone pass: Obsidian's mobile layout (it reloads the plugin), a touch screen at 390×844.
		await o.eval(async (app, plugin) => { await plugin.saveSettings(); });
		await page.waitForTimeout(400);
		await setViewport(PHONE_W, PHONE_H, true);
		await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
		await o.eval((app) => app.emulateMobile(true));
		await page.waitForTimeout(1500);
		await o.waitFor(() => page.evaluate(() => !!window.app.plugins?.plugins?.['nimble-gm']?._loaded), { what: 'the plugin after the switch to mobile' });
		for (const s of surfaces) { await runSurface(s, true); flush(); }
	}
} finally {
	await o.close();
}

const report = flush();
console.log(`\n${report.summary}\nReport: ${join(OUT, 'report.md')}\nGallery: ${join(OUT, 'index.html')}`);
process.exit(report.issues || merged(r => r.errors).length ? 1 : 0);
