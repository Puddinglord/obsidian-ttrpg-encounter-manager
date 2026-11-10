// The 3D dice part of settings: a gallery of looks (presets, your own, and
// imported sets), an editor with a live preview, which look each die uses,
// how the dice move, effects, and importing from Dice So Nice.

import { App, FuzzySuggestModal, Notice, setIcon, Setting, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { showSliderValue } from './compat';
import { pickFiles } from './campaign-modals';
import { preview3d } from './dice3d';
import { importFile, ImportResult, importUrl, removeSet } from './dice3d/importer';
import { lookOf, modelUrlOf } from './dice3d/looks';
import {
	allStyles, BLENDS, cleanStyle, DIE_KEYS, DiceStyle, EFFECTS, EffectId, findStyle, FINISHES, FONTS, PRESETS, RollEvent, TEXTURES,
} from './dice3d/styles';
import { confirmAction } from './touch';

/** The look open in the editor; kept across redraws of the settings page. */
let selected = 'ember';
let previewSides = 20;

const isPreset = (id: string) => PRESETS.some(p => p.id === id);

/** Dropdown options: every look, with optional "same as…" first. */
function styleOptions(plugin: NimbleStatblocksPlugin, first?: [string, string]): Record<string, string> {
	const out: Record<string, string> = {};
	if (first) out[first[0]] = first[1];
	for (const s of allStyles(plugin.settings.dice)) out[s.id] = s.model ? `${s.name} (3D models)` : s.name;
	return out;
}

/** "Which look each die uses" rows. */
export function diceAssignmentRows(plugin: NimbleStatblocksPlugin, visible: () => boolean, refresh: () => void) {
	const d = () => plugin.settings.dice;
	const save = async () => { await plugin.saveSettings(); };
	const pick = (name: string, desc: string, get: () => string, set: (v: string) => void, first?: [string, string]) => ({
		name, desc, visible, cls: 'nimble-dice-assign',
		render: (setting: Setting) => {
			setting.addDropdown(dd => {
				dd.addOptions(styleOptions(plugin, first));
				dd.setValue(get());
				dd.onChange(async v => { set(v); await save(); });
			});
		},
	});
	return [
		pick('Other dice', 'Every die that isn\'t an attack\'s primary die or a crit.', () => d().normal, v => { d().normal = v; }),
		pick('Primary die', 'The first die of an attack roll.', () => d().primary, v => { d().primary = v; }, ['', 'Same as other dice']),
		pick('Crit dice', 'Dice that explode on a crit, and the primary die that set them off.', () => d().crit, v => { d().crit = v; }, ['', 'Same as the primary die']),
		{
			name: 'Per die size',
			desc: 'Give a d20 (or any size) its own look. It replaces the other-dice look for that size.',
			visible, cls: 'nimble-dice-perdie',
			render: (setting: Setting) => {
				const wrap = setting.controlEl.createDiv({ cls: 'nimble-dice-perdie-grid' });
				for (const k of DIE_KEYS) {
					const cell = wrap.createDiv({ cls: 'nimble-dice-perdie-cell' });
					cell.createSpan({ cls: 'nimble-dice-perdie-label', text: k });
					const sel = cell.createEl('select', { cls: 'dropdown', attr: { 'aria-label': `Look for ${k}` } });
					for (const [v, label] of Object.entries(styleOptions(plugin, ['', 'Same as other dice']))) sel.createEl('option', { value: v, text: label });
					sel.value = d().perDie[k] ?? '';
					sel.addEventListener('change', () => {
						if (sel.value) d().perDie[k] = sel.value; else delete d().perDie[k];
						void save();
					});
				}
				void refresh;
			},
		},
	];
}

/** Motion and effects rows. */
export function diceMotionRows(plugin: NimbleStatblocksPlugin, visible: () => boolean) {
	const d = () => plugin.settings.dice;
	const save = async () => { await plugin.saveSettings(); };
	const effect = (event: RollEvent, name: string, desc: string) => ({
		name, desc, visible,
		render: (setting: Setting) => {
			setting.addDropdown(dd => {
				for (const e of EFFECTS) dd.addOption(e.id, e.label);
				dd.setValue(d().effects[event]).onChange(async v => { d().effects[event] = v as EffectId; await save(); });
			});
		},
	});
	return [
		{
			name: 'Dice size', desc: 'Up to three times the usual size. The table shrinks to fit, so big dice still land on screen.', visible,
			render: (setting: Setting) => {
				setting.addSlider(sl => showSliderValue(sl.setLimits(50, 300, 10).setValue(Math.round(d().size * 100))).onChange(async v => { d().size = v / 100; await save(); }));
			},
		},
		{
			name: 'Speed', desc: 'How fast the throw plays back.', visible,
			render: (setting: Setting) => {
				setting.addSlider(sl => showSliderValue(sl.setLimits(50, 200, 10).setValue(Math.round(d().speed * 100))).onChange(async v => { d().speed = v / 100; await save(); }));
			},
		},
		{
			name: 'Throw', visible,
			render: (setting: Setting) => {
				setting.addDropdown(dd => dd.addOptions({ gentle: 'Gentle', normal: 'Normal', strong: 'Hard' }).setValue(d().throwForce)
					.onChange(async v => { d().throwForce = v as 'gentle' | 'normal' | 'strong'; await save(); }));
			},
		},
		{
			name: 'Stay on screen', desc: 'Seconds the dice stay after they land.', visible,
			render: (setting: Setting) => {
				setting.addSlider(sl => showSliderValue(sl.setLimits(1, 8, 0.5).setValue(d().stayMs / 1000)).onChange(async v => { d().stayMs = v * 1000; await save(); }));
			},
		},
		{
			name: 'Shadows', visible,
			render: (setting: Setting) => {
				setting.addDropdown(dd => dd.addOptions({ off: 'Off', soft: 'Soft', sharp: 'Sharp' }).setValue(d().shadows)
					.onChange(async v => { d().shadows = v as 'off' | 'soft' | 'sharp'; await save(); }));
			},
		},
		effect('crit', 'Effect on a crit', 'Plays as the dice explode.'),
		effect('miss', 'Effect on a miss', 'An attack that rolls a 1. The die that missed also dims.'),
		effect('max', 'Effect on a max roll', 'Every die on its highest face, like a natural 20.'),
		effect('min', 'Effect on a min roll', 'Every die on a 1 (not an attack).'),
		{
			name: '', searchable: false, visible, cls: 'nimble-dice-tests',
			render: (setting: Setting) => {
				setting
					.addButton(b => b.setButtonText('Test roll').onClick(() => plugin.rollDice('2d6+2', 'Test roll', 'attack', [4, 3])))
					.addButton(b => b.setButtonText('Test crit').onClick(() => plugin.rollDice('2d6+2', 'Test crit', 'attack', [6, 3, 6, 2])))
					.addButton(b => b.setButtonText('Test miss').onClick(() => plugin.rollDice('2d6+2', 'Test miss', 'attack', [1, 4])))
					.addButton(b => b.setButtonText('Test natural 20').onClick(() => plugin.rollDice('1d20', 'Test natural 20', 'effect', [20])));
			},
		},
	];
}

class ImagePicker extends FuzzySuggestModal<TFile> {
	constructor(app: App, private onPick: (f: TFile) => void) {
		super(app);
		this.setPlaceholder('Pick an image for the texture…');
	}
	getItems(): TFile[] { return this.app.vault.getFiles().filter(f => /^(png|jpe?g|webp|gif|avif)$/i.test(f.extension)); }
	getItemText(f: TFile): string { return f.path; }
	onChooseItem(f: TFile): void { this.onPick(f); }
}

/** A small picture of a look: its colours, a sample number, and its finish. */
function swatch(parent: HTMLElement, st: DiceStyle): HTMLElement {
	const sw = parent.createDiv({ cls: `nimble-dice-swatch finish-${st.finish}` });
	const stops = st.body.length > 1 ? st.body.map((c, i) => `${c} ${Math.round((i / (st.body.length - 1)) * 100)}%`).join(', ') : `${st.body[0]}, ${st.body[0]}`;
	sw.style.setProperty('--dice-body', `linear-gradient(135deg, ${stops})`);
	sw.style.setProperty('--dice-label', st.label);
	sw.style.setProperty('--dice-outline', st.outline || 'transparent');
	sw.createSpan({ cls: 'nimble-dice-swatch-num', text: '20' });
	if (st.model) setIcon(sw.createSpan({ cls: 'nimble-dice-swatch-badge', attr: { 'aria-label': '3D models' } }), 'box');
	return sw;
}

/** The gallery, the editor for the selected look, and importing. */
export function renderDiceStudio(el: HTMLElement, plugin: NimbleStatblocksPlugin, refresh: () => void): void {
	const d = plugin.settings.dice;
	const save = async () => { await plugin.saveSettings(); };
	if (!findStyle(d, selected)) selected = d.normal;
	const root = el.createDiv({ cls: 'nimble-dice-studio' });

	// Workshop: roll pools, stage crits and misses, pick effects with a preview.
	const ws = root.createDiv({ cls: 'nimble-dice-workshop-cta' });
	const wsText = ws.createDiv();
	wsText.createDiv({ cls: 'nimble-dice-studio-heading', text: 'Dice workshop' });
	wsText.createDiv({ cls: 'setting-item-description', text: 'Roll a pool of dice, test a crit explosion or a miss, and try every effect.' });
	const wsBtn = ws.createEl('button', { cls: 'mod-cta', text: 'Open dice workshop' });
	wsBtn.addEventListener('click', () => plugin.openDiceWorkshop());

	// Gallery
	root.createDiv({ cls: 'nimble-dice-studio-heading', text: 'Dice looks' });
	const grid = root.createDiv({ cls: 'nimble-dice-gallery', attr: { role: 'listbox', 'aria-label': 'Dice looks' } });
	for (const st of allStyles(d)) {
		const card = grid.createEl('button', { cls: 'nimble-dice-card', attr: { role: 'option', 'data-style': st.id, 'aria-selected': String(st.id === selected) } });
		if (st.id === selected) card.addClass('is-selected');
		swatch(card, st);
		card.createSpan({ cls: 'nimble-dice-card-name', text: st.name });
		const uses = [d.normal === st.id && 'Other', d.primary === st.id && 'Primary', d.crit === st.id && 'Crit', ...Object.entries(d.perDie).filter(([, v]) => v === st.id).map(([k]) => k)].filter(Boolean);
		if (uses.length) card.createSpan({ cls: 'nimble-dice-card-uses', text: uses.join(' · ') });
		card.addEventListener('click', () => { selected = st.id; refresh(); });
	}
	const add = grid.createEl('button', { cls: 'nimble-dice-card nimble-dice-card-new', attr: { 'aria-label': 'New look' } });
	setIcon(add.createSpan({ cls: 'nimble-dice-card-plus' }), 'plus');
	add.createSpan({ cls: 'nimble-dice-card-name', text: 'New look' });
	add.addEventListener('click', () => void (async () => {
		const base = findStyle(d, selected) ?? PRESETS[0];
		const copy = cleanStyle({ ...base, id: undefined, name: `${base.name} (mine)`, model: base.model });
		d.styles.push(copy);
		selected = copy.id;
		await save();
		refresh();
	})());

	// Editor
	const st = findStyle(d, selected) ?? PRESETS[0];
	const ed = root.createDiv({ cls: 'nimble-dice-editor' });
	const top = ed.createDiv({ cls: 'nimble-dice-editor-top' });
	const pv = top.createDiv({ cls: 'nimble-dice-preview' });
	const canvas = pv.createEl('canvas', { cls: 'nimble-dice-preview-canvas', attr: { 'aria-label': `Preview of ${st.name}` } });
	const sizes = pv.createDiv({ cls: 'nimble-dice-preview-sizes' });
	for (const n of [4, 6, 8, 10, 12, 20]) {
		const b = sizes.createEl('button', { text: `d${n}`, cls: n === previewSides ? 'is-active' : '' });
		b.addEventListener('click', () => { previewSides = n; refresh(); });
	}
	window.setTimeout(() => void preview3d(canvas, { sides: previewSides, look: lookOf(plugin, st), modelUrl: modelUrlOf(plugin, st, previewSides) }), 0);

	const info = top.createDiv({ cls: 'nimble-dice-editor-info' });
	info.createDiv({ cls: 'nimble-dice-editor-name', text: st.name });
	const set = st.model ? d.sets.find(s => s.id === st.model) : undefined;
	if (set) info.createDiv({ cls: 'setting-item-description', text: `3D models from ${set.name}${set.author ? ` by ${set.author}` : ''}: ${Object.keys(set.models).map(n => `d${n}`).join(', ')}. Other sizes use the colours below.` });
	else if (isPreset(st.id)) info.createDiv({ cls: 'setting-item-description', text: 'A built-in look. Use New look to make an editable copy.' });
	const actions = info.createDiv({ cls: 'nimble-dice-editor-actions' });
	const act = (text: string, fn: () => void | Promise<void>, cta = false) => {
		const b = actions.createEl('button', { text, cls: cta ? 'mod-cta' : '' });
		b.addEventListener('click', () => void (async () => { await fn(); await save(); refresh(); })());
	};
	act('Use for all dice', () => { d.normal = st.id; d.primary = ''; for (const k of DIE_KEYS) delete d.perDie[k]; }, true);
	act('Primary die', () => { d.primary = st.id; });
	act('Crit dice', () => { d.crit = st.id; });
	act('Roll them', () => { void plugin.rollLookPreview(st.id); });
	if (!isPreset(st.id)) {
		const del = actions.createEl('button', { text: set && st.id === `set:${set.id}` ? 'Remove set' : 'Delete', cls: 'mod-warning' });
		del.addEventListener('click', () => void (async () => {
			const what = set && st.id === `set:${set.id}` ? `the ${set.name} set and its files` : `"${st.name}"`;
			if (!(await confirmAction(plugin.app, `Delete ${what}?`, 'Dice using it go back to the other-dice look.', 'Delete', true))) return;
			if (set && st.id === `set:${set.id}`) await removeSet(plugin, set.id);
			d.styles = d.styles.filter(x => x.id !== st.id);
			for (const k of ['normal', 'primary', 'crit'] as const) if (d[k] === st.id) d[k] = k === 'normal' ? 'bone' : '';
			for (const k of DIE_KEYS) if (d.perDie[k] === st.id) delete d.perDie[k];
			selected = d.normal;
			await save();
			refresh();
		})());
	}

	if (!isPreset(st.id)) editFields(ed, plugin, st, refresh);

	// Import
	const imp = root.createDiv({ cls: 'nimble-dice-import' });
	imp.createDiv({ cls: 'nimble-dice-studio-heading', text: 'Import from Dice So Nice' });
	imp.createDiv({ cls: 'setting-item-description', text: 'A Dice So Nice dice set: the module.json link from your download page (The Rollsmith\'s sets work this way) or the module zip. Or your own Dice So Nice export (Profiles & Data → Export), to bring over your looks. Imported files stay on this device.' });
	const row = imp.createDiv({ cls: 'nimble-dice-import-row' });
	const url = row.createEl('input', { type: 'text', cls: 'nimble-dice-import-url', attr: { placeholder: 'https://…/module.json', 'aria-label': 'Dice set link' } });
	const done = async (r: ImportResult) => {
		await save();
		const names = [...r.sets.map(s => s.name), ...r.styles.filter(s => !s.id.startsWith('set:')).map(s => s.name)];
		new Notice(`Imported ${names.length ? names.join(', ') : 'nothing new'}.${r.notes.length ? ` ${r.notes.join(' ')}` : ''}`, 8000);
		const first = r.styles[0];
		if (first) selected = first.id;
		refresh();
	};
	const fail = (e: unknown) => new Notice(`Couldn't import: ${e instanceof Error ? e.message : String(e)}`, 8000);
	const go = row.createEl('button', { text: 'Import link', cls: 'mod-cta' });
	const run = () => {
		if (!url.value.trim()) { url.focus(); return; }
		go.disabled = true;
		go.setText('Importing…');
		importUrl(plugin, url.value).then(done, fail).finally(() => { go.disabled = false; go.setText('Import link'); });
	};
	go.addEventListener('click', run);
	url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
	const file = row.createEl('button', { text: 'Import file…' });
	file.addEventListener('click', () => void pickFiles().then(async files => {
		for (const f of files) await importFile(plugin, f).then(done, fail);
	}));
	if (d.sets.length) {
		const list = imp.createDiv({ cls: 'nimble-dice-sets' });
		for (const s of d.sets) {
			const item = list.createDiv({ cls: 'nimble-dice-set' });
			item.createSpan({ cls: 'nimble-dice-set-name', text: s.name });
			item.createSpan({ cls: 'setting-item-description', text: Object.keys(s.models).map(n => `d${n}`).join(' ') });
			const open = item.createEl('button', { text: 'Edit' });
			open.addEventListener('click', () => { selected = `set:${s.id}`; refresh(); });
		}
	}
}

/** Fields for a look you own. */
function editFields(ed: HTMLElement, plugin: NimbleStatblocksPlugin, st: DiceStyle, refresh: () => void): void {
	const d = plugin.settings.dice;
	const save = async (redraw = true) => { await plugin.saveSettings(); if (redraw) refresh(); };
	const fields = ed.createDiv({ cls: 'nimble-dice-fields' });
	new Setting(fields).setName('Name').addText(t => t.setValue(st.name).onChange(async v => { st.name = v.trim() || st.name; await save(false); }));
	const body = new Setting(fields).setName('Body colour').setDesc('Add colours for a mixed set: each die picks one.');
	st.body.forEach((c, i) => {
		body.addColorPicker(cp => cp.setValue(c).onChange(async v => { st.body[i] = v; await save(); }));
		if (st.body.length > 1) body.addExtraButton(b => b.setIcon('x').setTooltip('Remove this colour').onClick(async () => { st.body.splice(i, 1); await save(); }));
	});
	if (st.body.length < 6) body.addExtraButton(b => b.setIcon('plus').setTooltip('Add a colour').onClick(async () => { st.body.push(st.body[st.body.length - 1]); await save(); }));
	new Setting(fields).setName('Numbers').addColorPicker(cp => cp.setValue(st.label).onChange(async v => { st.label = v; await save(); }));
	const optionalColour = (name: string, key: 'outline' | 'edge', fallback: string) => {
		const s = new Setting(fields).setName(name);
		s.addToggle(t => t.setValue(!!st[key]).onChange(async v => { st[key] = v ? fallback : ''; await save(); }));
		if (st[key]) s.addColorPicker(cp => cp.setValue(st[key]).onChange(async v => { st[key] = v; await save(); }));
	};
	optionalColour('Number outline', 'outline', '#000000');
	optionalColour('Edges', 'edge', '#000000');
	new Setting(fields).setName('Finish').addDropdown(dd => {
		for (const f of FINISHES) dd.addOption(f.id, f.label);
		dd.setValue(st.finish).onChange(async v => { st.finish = v as DiceStyle['finish']; await save(); });
	});
	const tex = new Setting(fields).setName('Texture');
	tex.addDropdown(dd => {
		for (const t of TEXTURES) dd.addOption(t.id, t.label);
		if (st.texture.startsWith('vault:')) dd.addOption(st.texture, st.texture.slice(6).replace(/^.*\//, ''));
		dd.setValue(st.texture).onChange(async v => { st.texture = v; await save(); });
	});
	tex.addButton(b => b.setButtonText('Image from vault…').onClick(() => new ImagePicker(plugin.app, f => { st.texture = `vault:${f.path}`; void save(); }).open()));
	if (st.texture !== 'none') {
		new Setting(fields).setName('Texture blend').addDropdown(dd => {
			for (const b of BLENDS) dd.addOption(b.id, b.label);
			dd.setValue(st.blend).onChange(async v => { st.blend = v as DiceStyle['blend']; await save(); });
		});
	}
	new Setting(fields).setName('Font').addDropdown(dd => {
		for (const f of FONTS) dd.addOption(f.id, f.label);
		dd.setValue(st.font).onChange(async v => { st.font = v as DiceStyle['font']; await save(); });
	});
	new Setting(fields).setName('Number size').addSlider(sl => showSliderValue(sl.setLimits(60, 140, 5).setValue(Math.round(st.labelScale * 100))).onChange(async v => { st.labelScale = v / 100; await save(); }));
	if (d.sets.length) {
		new Setting(fields).setName('3D models').setDesc('Use an imported set\'s models for the sizes it has.').addDropdown(dd => {
			dd.addOption('', 'None');
			for (const s of d.sets) dd.addOption(s.id, s.name);
			dd.setValue(st.model ?? '').onChange(async v => { st.model = v || undefined; await save(); });
		});
	}
}
