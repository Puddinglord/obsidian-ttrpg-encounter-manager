// The class and subclass builders: a class as the class books write one (key
// stats and saves on the sheet's own stat boxes, Hit Die, gear, magic, the
// dice and pools the class panel keeps, levels 1 to 20 and their features,
// option lists), and a subclass for any class in the compendium. The preview
// is the class page; the check says what each level grants, as Level up will
// ask it. Drafts and rules: entity-content.ts.

import { Menu, setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { gameIcon } from '../../core/icons';
import { drawSvg } from '../../core/svg';
import { pill } from '../../core/pill';
import { ClassResource, Feature, nameKey, STATS } from './compendium';
import { spellSchools } from './level-plan';
import { saveTriangle } from './sheet-marks';
import { drawMotif, MOTIF_NAMES } from './class-scroll';
import {
	addBookRhythm, classLists, Draft, filledLevels, HIT_DICE, keyStatsOf, levelRow, levelRows, setSubclassLevel, setTierLevel, STARTING_HP,
	subclassLevelOf, tierLevels,
} from './entity-content';
import {
	arr, chipToggles, ContentBuilder, featureCards, gearField, grantRows, listCard, optionListsEditor, registerContentKind, stepper, str,
} from './entity-content-ui';
import {
	BuilderUI, checkHead, field, grid, iconButton, numberInput, section, segmented, suggestField, textButton, textInput,
} from '../../core/builder/frame';

const STAT_NAME: Record<string, string> = { STR: 'Strength', DEX: 'Dexterity', INT: 'Intelligence', WIL: 'Will' };
const obj = (d: Draft, key: string): Draft => {
	const v = d[key];
	if (v && typeof v === 'object' && !Array.isArray(v)) return v as Draft;
	const o: Draft = {};
	d[key] = o;
	return o;
};
const list = (d: Draft, key: string): Draft[] => (Array.isArray(d[key]) ? d[key] as Draft[] : (d[key] = [] as Draft[]));
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => String(x)) : []);

// ----------------------------------------------------------------------------
// Levels 1 to 20: a level picker, then that level's features and what each one asks

/** What a feature can do besides its words: the data level-plan.ts and the sheet read before the words. */
const GRANTS: { key: keyof Feature; label: string; icon: string }[] = [
	{ key: 'choose', label: 'A choice from a list', icon: 'list' },
	{ key: 'increase', label: 'A stat increase', icon: 'trend-up' },
	{ key: 'learn', label: 'Spells to learn', icon: 'wand' },
	{ key: 'uses', label: 'Uses per Safe Rest', icon: 'clock' },
	{ key: 'spellTier', label: 'Spell tier', icon: 'sparkle' },
	{ key: 'unlock', label: 'Opens a list\'s next tier', icon: 'lock' },
	{ key: 'knows', label: 'Given outright', icon: 'check' },
	{ key: 'boon', label: 'A boon to choose', icon: 'diamond' },
];

interface LevelHost {
	d: Draft;
	/** The lists a feature can name (a subclass's: its class's and its own). */
	lists(): string[];
	schools(): string[];
	/** The class decides its subclass level; a subclass doesn't. */
	isClass: boolean;
}

/** The level picked in the levels step, per draft (the step is redrawn on every structural change). */
const picked = new WeakMap<Draft, number>();

function levelsStep(panel: HTMLElement, ui: BuilderUI, h: LevelHost): void {
	const d = h.d;
	const at = picked.get(d) ?? (h.isClass ? 1 : filledLevels(d)[0] ?? 3);
	const head = section(panel, 'Levels');
	if (h.isClass) {
		head.addClass('has-aside');
		const rhythm = textButton(head, 'sparkle', 'Add the books\' rhythm', () => { addBookRhythm(d); ui.rebuild(); }, 'ncb-rhythm');
		rhythm.setAttr('aria-label', 'Add subclass features, stat increases and an Epic Boon where the books put them');
		const sub = field(panel, 'Subclass at level');
		const input = numberInput(sub.control, {
			get: () => subclassLevelOf(d), placeholder: () => 'None', min: 1, max: 20, label: 'Subclass at level', labelledBy: sub.labelId, ui,
			set: (v) => setSubclassLevel(d, v),
		});
		// The ladder follows as you type; the level's features redraw once you're done.
		input.addEventListener('change', () => ui.rebuild());
	}
	// The ladder: every level, the ones with something in them marked, the subclass level in the class's ochre.
	const ladder = panel.createDiv({ cls: 'ncb-ladder', attr: { role: 'tablist', 'aria-label': 'Level' } });
	for (let lv = 1; lv <= 20; lv++) {
		const b = ladder.createEl('button', { cls: 'ncb-rung', attr: { role: 'tab', 'aria-selected': String(lv === at), 'data-level': String(lv) } });
		b.createSpan({ cls: 'ncb-rung-n', text: String(lv) });
		b.addEventListener('click', () => { picked.set(d, lv); ui.rebuild(); });
		ui.live(() => {
			b.toggleClass('is-active', lv === at);
			b.toggleClass('has-features', filledLevels(d).includes(lv));
			b.toggleClass('is-subclass', h.isClass && subclassLevelOf(d) === lv);
		});
	}
	const head2 = panel.createDiv({ cls: 'ncb-level-head' });
	head2.createSpan({ cls: 'ncb-level-title', text: `Level ${at}` });
	// A level left empty adds nothing to the block (cleanEntry drops it).
	featureCards(panel, ui, {
		list: () => levelRow(d, at, true)!.features, noun: 'feature', name: at === 1 ? 'Kindle' : 'Steady Hand', text: 'What it does, in the book\'s words.',
		extras: (card, f) => grantsEditor(card, ui, f, h),
	});
}

/** A feature's grants: each one it has, then a menu of the rest. */
function grantsEditor(card: HTMLElement, ui: BuilderUI, f: Feature, h: LevelHost): void {
	if (/^(?:\w+ )?subclass$/i.test(str(f.name).trim())) {
		card.addClass('is-subclass');
		return;
	}
	const box = card.createDiv({ cls: 'ncb-grants' });
	const rec = f as unknown as Draft;
	for (const g of GRANTS) {
		if (rec[g.key] === undefined) continue;
		const sub = box.createDiv({ cls: 'ncb-grant-edit' });
		const top = sub.createDiv({ cls: 'ncb-grant-top' });
		pill(top, { icon: gameIcon(g.icon), text: g.label, cls: 'ncb-grant-label' });
		iconButton(top, 'x', `Take out ${g.label.toLowerCase()}`, () => { delete rec[g.key]; ui.rebuild(); }, 'ncb-grant-remove');
		grantFields(sub, ui, g.key, rec, h);
	}
	const left = GRANTS.filter(g => rec[g.key] === undefined);
	if (!left.length) return;
	const add = pill(box, { tag: 'button', icon: gameIcon('plus'), text: 'What it grants', cls: 'ncb-grant-add', attr: { type: 'button' } });
	add.addEventListener('click', (ev) => {
		const m = new Menu();
		for (const g of left) m.addItem(i => i.setTitle(g.label).setIcon(gameIcon(g.icon)).onClick(() => { rec[g.key] = blankGrant(g.key); ui.rebuild(); }));
		m.showAtMouseEvent(ev);
	});
}

function blankGrant(key: keyof Feature): unknown {
	switch (key) {
		case 'choose': return { from: [], count: 1 };
		case 'increase': return { stats: [] };
		case 'learn': return [{ kind: 'utility', from: [], count: 1 }];
		case 'uses': return '';
		case 'spellTier': return 1;
		case 'unlock': return [];
		case 'knows': return { lists: [] };
		case 'boon': return 'epic';
	}
	return '';
}

function grantFields(el: HTMLElement, ui: BuilderUI, key: keyof Feature, f: Draft, h: LevelHost): void {
	const lists = h.lists().map(v => ({ value: v }));
	const none = (what: string) => el.createDiv({ cls: 'eb-help', text: what });
	switch (key) {
		case 'choose': {
			const c = obj(f, 'choose');
			if (lists.length) chipToggles(el, ui, lists, () => strs(c.from), v => { c.from = v; }, { label: 'Lists to choose from' });
			else none('Add an option list on the Options step first.');
			const row = el.createDiv({ cls: 'ncb-inline' });
			row.createSpan({ cls: 'ncb-inline-label', text: 'How many' });
			stepper(row, ui, { get: () => Number(c.count) || 1, set: n => { c.count = n; }, min: 1, max: 6, label: 'how many' });
			return;
		}
		case 'increase': {
			const c = obj(f, 'increase');
			chipToggles(el, ui, [...STATS.map(s => ({ value: s })), { value: 'any', label: 'Any' }], () => strs(c.stats), v => { c.stats = v; }, { label: 'Stats it can go to' });
			const row = el.createDiv({ cls: 'ncb-inline' });
			row.createSpan({ cls: 'ncb-inline-label', text: 'Stats that get +1' });
			stepper(row, ui, { get: () => Number(c.count) || 1, set: n => { c.count = n; }, min: 1, max: 4, label: 'stats that get +1' });
			return;
		}
		case 'learn': {
			const rows = Array.isArray(f.learn) ? f.learn as Draft[] : (f.learn = [] as Draft[]);
			rows.forEach((l, i) => {
				const r = el.createDiv({ cls: 'ncb-learn' });
				segmented<string>(r, [{ value: 'school', label: 'A school' }, { value: 'utilities', label: 'A school\'s Utility Spells' }, { value: 'utility', label: 'Utility Spells' }],
					() => str(l.kind) || 'utility', v => { l.kind = v; }, { label: 'What to learn', ui, cls: 'is-compact is-wrap-ok' });
				chipToggles(r, ui, [...h.schools().map(s => ({ value: s })), { value: 'known', label: 'Known' }, { value: 'new', label: 'New' }], () => strs(l.from), v => { l.from = v; }, { label: 'From' });
				const line = r.createDiv({ cls: 'ncb-inline' });
				line.createSpan({ cls: 'ncb-inline-label', text: 'How many' });
				stepper(line, ui, { get: () => Number(l.count) || 1, set: n => { l.count = n; }, min: 1, max: 6, label: 'how many' });
				if (rows.length > 1) iconButton(line, 'x', 'Take this one out', () => { rows.splice(i, 1); ui.rebuild(); }, 'ncb-grant-remove');
			});
			textButton(el, 'plus', 'Learn more', () => { rows.push({ kind: 'utility', from: [], count: 1 }); ui.rebuild(); }).addClass('ncb-small');
			return;
		}
		case 'uses':
			textInput(el, { value: str(f.uses), placeholder: 'WIL, or 2', code: true, label: 'Uses per Safe Rest', onInput: v => { f.uses = v; ui.changed(); } });
			return;
		case 'spellTier': {
			const row = el.createDiv({ cls: 'ncb-inline' });
			row.createSpan({ cls: 'ncb-inline-label', text: 'Spells up to tier' });
			stepper(row, ui, { get: () => Number(f.spellTier) || 0, set: n => { f.spellTier = n; }, min: 0, max: 9, label: 'spell tier' });
			return;
		}
		case 'unlock':
			if (lists.length) chipToggles(el, ui, lists, () => strs(f.unlock), v => { f.unlock = v; }, { label: 'Lists it opens' });
			else none('Add an option list on the Options step first.');
			return;
		case 'knows': {
			const k = obj(f, 'knows');
			if (lists.length) chipToggles(el, ui, lists, () => strs(k.lists), v => { k.lists = v; }, { label: 'Every option of' });
			chipToggles(el, ui, [...h.schools().map(s => ({ value: s, label: `${s} Utility` })), { value: 'known', label: 'Known schools\' Utility' }], () => strs(k.utility), v => { k.utility = v; }, { label: 'Utility Spells' });
			textInput(el, { value: strs(k.options).join(', '), placeholder: 'Options by name, with commas', label: 'Options by name', onInput: v => { k.options = v.split(',').map(x => x.trim()).filter(Boolean); ui.changed(); } });
			return;
		}
		case 'boon':
			segmented<string>(el, [{ value: 'epic', label: 'Epic' }, { value: 'lodging', label: 'Lodging' }, { value: 'other', label: 'Other' }], () => str(f.boon) || 'epic', v => { f.boon = v; }, { label: 'Boon type', ui, cls: 'is-compact' });
			return;
	}
}

// ----------------------------------------------------------------------------
// The class

type ResKind = 'dice' | 'points' | 'uses';
const resKinds = new WeakMap<Draft, ResKind>();
function resKind(r: Draft): ResKind {
	const k = resKinds.get(r);
	if (k) return k;
	const max = str(r.max);
	return r.die || r.dice ? 'dice' : r.spend || /LVL/i.test(max) || Number(max) > 10 ? 'points' : 'uses';
}

const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
const RESETS = ['Safe Rest', 'encounter', 'Rage ends'];

class ClassBuilder extends ContentBuilder {
	constructor(plugin: EmberVaultPlugin, seed: unknown) { super(plugin, 'class', seed); }

	private host(): LevelHost {
		return { d: this.d, isClass: true, lists: () => arr<Draft>(this.d.optionGroups).map(g => str(g.name).trim()).filter(Boolean), schools: () => spellSchools(this.world().comp) };
	}

	protected draw(id: string, panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		switch (id) {
			case 'start': {
				section(panel, 'Your class');
				const top = grid(panel, 2);
				this.nameField(top, ui, 'Lanternkeeper');
				this.textField(top, ui, 'tagline', 'Tagline', 'Carries the light into the dark.');
				const dice = grid(panel, 2);
				const hd = field(dice, 'Hit Die');
				segmented<number>(hd.control, HIT_DICE.map(n => ({ value: n, label: `d${n}` })), () => Number(d.hitDie) || 8, v => { d.hitDie = v; }, { label: 'Hit Die', labelledBy: hd.labelId, ui, cls: 'is-compact is-tight', key: 'class-hit-die' });
				const hp = field(dice, 'Starting HP');
				numberInput(hp.control, { get: () => (typeof d.startingHp === 'number' ? d.startingHp : undefined), placeholder: () => String(STARTING_HP[Number(d.hitDie)] ?? ''), set: v => { d.startingHp = v; }, min: 1, max: 99, label: 'Starting HP', labelledBy: hp.labelId, ui });
				this.motifField(panel, ui);
				this.textField(panel, ui, 'flavor', 'About it', 'Lanternkeepers walk ahead of the party with a light that never goes out.', { area: true });
				return;
			}
			case 'stats': {
				section(panel, 'Key stats and saves');
				this.statBoxes(panel, ui);
				const sk = field(panel, 'Skilled Hero', { wide: true });
				const mods = obj(d, 'skillMods');
				const box = sk.control.createDiv({ cls: 'ncb-skills' });
				for (const s of this.world().comp.rules.skills ?? []) {
					const r = box.createDiv({ cls: 'ncb-skill' });
					r.createSpan({ cls: 'ncb-skill-name', text: s.name });
					r.createSpan({ cls: 'ncb-skill-stat', text: s.stat });
					stepper(r, ui, { get: () => Number(mods[s.name]) || 0, set: n => { if (n) mods[s.name] = n; else delete mods[s.name]; }, min: -3, max: 3, label: s.name, signed: true });
				}
				return;
			}
			case 'gear': {
				section(panel, 'Armor, weapons and gear');
				const g = grid(panel, 2);
				this.textField(g, ui, 'armor', 'Armor', 'Leather Armor, Shields');
				this.textField(g, ui, 'weapons', 'Weapons', 'DEX Weapons');
				gearField(panel, ui, () => this.world().comp, d);
				return;
			}
			case 'magic': return this.magicStep(panel, ui);
			case 'resources': return this.resourcesStep(panel, ui);
			case 'levels': return levelsStep(panel, ui, this.host());
			case 'options': {
				section(panel, 'Option lists');
				optionListsEditor(panel, ui, d);
				return;
			}
		}
	}

	/** The scrollwork's motif: plain, or one of the book classes'. */
	private motifField(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		const f = field(panel, 'Motif', { wide: true });
		const row = f.control.createDiv({ cls: 'ncb-motifs', attr: { role: 'radiogroup', 'aria-labelledby': f.labelId } });
		for (const m of ['', ...MOTIF_NAMES]) {
			const b = row.createEl('button', { cls: 'ncb-motif', attr: { role: 'radio', type: 'button', 'aria-label': m ? `${m}'s motif` : 'Plain motif' } });
			drawMotif(b, m || undefined, 'ncb-motif-svg');
			b.addEventListener('click', () => { if (m) d.motif = m; else delete d.motif; ui.changed(); });
			ui.live(() => {
				const on = (str(d.motif) || '') === m;
				b.toggleClass('is-active', on);
				b.setAttr('aria-checked', String(on));
			});
		}
		const name = f.aside.createSpan({ cls: 'ncb-motif-name' });
		ui.live(() => name.setText(str(d.motif) || 'Plain'));
	}

	/** STR, DEX, INT, WIL as the sheet draws them: tap a box for a key stat (two at most), a triangle for a save. */
	private statBoxes(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		const saves = obj(d, 'saves');
		const f = field(panel, 'Stats', { wide: true });
		f.control.addClass('is-stack');
		f.aside.createSpan({ cls: 'ncb-aside-hint', text: 'Tap a box for a key stat, a triangle for a save' });
		const sheet = f.control.createDiv({ cls: 'nimble-sheet ns-sheet ncb-sheet' });
		const row = sheet.createDiv({ cls: 'ns-stats ncb-stats' });
		for (const stat of STATS) {
			const cell = row.createDiv({ cls: 'ns-stat ncb-stat' });
			const box = cell.createDiv({ cls: 'ns-stat-box' });
			const key = box.createEl('button', { cls: 'ns-stat-face ncb-stat-face', attr: { type: 'button', 'data-k': `key-${stat}` } });
			const mark = key.createSpan({ cls: 'ns-stat-value ncb-key' });
			key.createSpan({ cls: 'ns-stat-label', text: stat });
			key.addEventListener('click', () => {
				const keys = keyStatsOf(d);
				d.keyStats = keys.includes(stat) ? keys.filter(k => k !== stat) : [...keys, stat].slice(-2);
				ui.changed();
			});
			const tris: [HTMLButtonElement, 'adv' | 'dis'][] = [];
			for (const dir of ['up', 'down'] as const) {
				const side = dir === 'up' ? 'adv' : 'dis';
				const t = box.createEl('button', { cls: `ns-tri is-${dir} is-editable`, attr: { type: 'button', 'data-k': `${side}-${stat}` } });
				drawSvg(t, saveTriangle(dir), 22, 10);
				t.addEventListener('click', () => {
					const other = side === 'adv' ? 'dis' : 'adv';
					if (saves[side] === stat) delete saves[side];
					else { saves[side] = stat; if (saves[other] === stat) delete saves[other]; }
					ui.changed();
				});
				tris.push([t, side]);
			}
			ui.live(() => {
				const on = keyStatsOf(d).includes(stat);
				cell.toggleClass('is-key', on);
				mark.setText(on ? 'Key' : '');
				key.setAttr('aria-pressed', String(on));
				key.setAttr('aria-label', `${STAT_NAME[stat]}${on ? ', a key stat' : ''}`);
				for (const [t, side] of tris) {
					const set = saves[side] === stat;
					t.toggleClass('is-on', set);
					t.setAttr('aria-pressed', String(set));
					t.setAttr('aria-label', `${set ? 'Clear' : 'Set'} ${stat} as the ${side === 'adv' ? 'advantaged' : 'disadvantaged'} save`);
				}
			});
		}
		const said = f.control.createDiv({ cls: 'ncb-stat-said' });
		ui.live(() => {
			said.empty();
			const keys = keyStatsOf(d);
			if (keys.length) pill(said, { text: `Key: ${keys.join(', ')}`, cls: 'ncb-said is-key' });
			if (saves.adv) pill(said, { text: `▲ ${str(saves.adv)}`, cls: 'ncb-said' });
			if (saves.dis) pill(said, { text: `▼ ${str(saves.dis)}`, cls: 'ncb-said' });
		});
	}

	private magicStep(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		section(panel, 'Magic');
		const on = field(panel, 'Casts spells', { wide: true });
		segmented<boolean>(on.control, [{ value: false, label: 'No' }, { value: true, label: 'Yes', icon: 'wand' }], () => !!d.casting, v => {
			if (v && !d.casting) d.casting = { manaFormula: '', manaFromLevel: undefined, schools: [] };
			if (!v) delete d.casting;
			window.setTimeout(() => ui.rebuild(), 0);
		}, { label: 'Casts spells', labelledBy: on.labelId, ui, cls: 'is-compact', key: 'class-casts' });
		if (!d.casting) return;
		const c = obj(d, 'casting');
		const g = grid(panel, 2);
		const mana = field(g, 'Mana');
		textInput(mana.control, {
			value: str(c.manaFormula || c.mana), placeholder: 'WIL×3+LVL', code: true, labelledBy: mana.labelId, label: 'Mana',
			onInput: v => { c.manaFormula = v.replace(/×/g, '*').replace(/\s+/g, ''); c.mana = v.replace(/\*/g, '×').trim(); ui.changed(); },
		});
		const from = field(g, 'From level');
		numberInput(from.control, { get: () => (typeof c.manaFromLevel === 'number' ? c.manaFromLevel : undefined), placeholder: () => '1', set: v => { c.manaFromLevel = v; }, min: 1, max: 20, label: 'From level', labelledBy: from.labelId, ui });
		const sc = field(panel, 'Schools', { wide: true });
		chipToggles(sc.control, ui, spellSchools(this.world().comp).map(s => ({ value: s })), () => strs(c.schools), v => { c.schools = v; }, { label: 'Schools', labelledBy: sc.labelId });
		// The tier ladder: the level each tier comes at (a "Tier N Spells" feature at that level).
		const tf = field(panel, 'Spell tiers', { wide: true });
		const fill = textButton(tf.aside, 'sparkle', 'Every 2 levels', () => {
			for (let t = 1; t <= 9; t++) setTierLevel(d, t, Math.min(20, t * 2));
			ui.rebuild();
		}, 'ncb-small');
		fill.setAttr('aria-label', 'Tier 1 at level 2, then a tier every 2 levels');
		const ladder = tf.control.createDiv({ cls: 'ncb-tiers' });
		const levels = tierLevels(d);
		for (let t = 1; t <= 9; t++) {
			const cell = ladder.createDiv({ cls: 'ncb-tier' });
			cell.createSpan({ cls: 'ncb-tier-label', text: `Tier ${t}` });
			const input = cell.createEl('input', { cls: 'ncb-tier-input', attr: { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', placeholder: '—', 'aria-label': `Level for tier ${t} spells` } });
			input.value = levels.has(t) ? String(levels.get(t)) : '';
			input.addEventListener('change', () => {
				const n = parseInt(input.value.replace(/[^\d]/g, ''), 10);
				setTierLevel(d, t, Number.isFinite(n) && n >= 1 && n <= 20 ? n : undefined);
				ui.rebuild();
			});
		}
	}

	private resourcesStep(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		section(panel, 'What the class panel keeps');
		const res = list(d, 'resources');
		const box = panel.createDiv({ cls: 'eb-attacks eb-list ncb-resources' });
		res.forEach((r, i) => this.resourceCard(box, ui, r, () => { res.splice(i, 1); ui.rebuild(); }));
		const adds = panel.createDiv({ cls: 'ncb-adds' });
		textButton(adds, 'dice', 'Add dice', () => { const r: Draft = { name: '', max: '', die: 'd6', reset: 'Safe Rest', dice: { rolled: 'spent', addTo: ['attack'] } }; resKinds.set(r, 'dice'); res.push(r); ui.rebuild(); }).addClass('eb-list-add');
		textButton(adds, 'plus', 'Add a pool or uses', () => { const r: Draft = { name: '', max: '', reset: 'Safe Rest' }; resKinds.set(r, 'uses'); res.push(r); ui.rebuild(); }).addClass('eb-list-add');

		// States the panel switches (Rage puts Raging on the hero), and a target it keeps.
		const st = field(panel, 'States', { wide: true });
		st.control.addClass('is-stack');
		const states = list(d, 'states');
		const sbox = st.control.createDiv({ cls: 'eb-attacks eb-list' });
		states.forEach((s, i) => {
			const { card } = listCard(sbox, ui, { title: () => str(s.name).trim() || `State ${i + 1}`, remove: () => { states.splice(i, 1); ui.rebuild(); } });
			const g = grid(card, 2);
			const n = field(g, 'Name');
			textInput(n.control, { value: str(s.name), placeholder: 'Kindle', words: true, labelledBy: n.labelId, label: 'State name', onInput: v => { s.name = v; ui.changed(); } });
			const c = field(g, 'Puts on');
			textInput(c.control, { value: str(s.condition), placeholder: 'Kindled', words: true, labelledBy: c.labelId, label: 'Condition', onInput: v => { s.condition = v; ui.changed(); } });
			this.featurePick(card, ui, s, 'feature', 'Explained by');
		});
		textButton(st.control, 'plus', 'Add a state', () => { states.push({ name: '', condition: '' }); ui.rebuild(); }).addClass('eb-list-add');

		const tf = field(panel, 'A target it keeps', { wide: true });
		segmented<boolean>(tf.control, [{ value: false, label: 'None' }, { value: true, label: 'One at a time', icon: 'target' }], () => !!d.target, v => {
			if (v && !d.target) d.target = { name: '' };
			if (!v) delete d.target;
			window.setTimeout(() => ui.rebuild(), 0);
		}, { label: 'A target it keeps', labelledBy: tf.labelId, ui, cls: 'is-compact', key: 'class-target' });
		if (d.target) {
			const t = obj(d, 'target');
			const g = grid(panel, 2);
			const n = field(g, 'Name');
			textInput(n.control, { value: str(t.name), placeholder: 'Lit Quarry', words: true, labelledBy: n.labelId, label: 'Target name', onInput: v => { t.name = v; ui.changed(); } });
			this.featurePick(g, ui, t, 'feature', 'Explained by');
		}
	}

	/** A feature of the class, by name (the one whose words explain a row of the class panel). */
	private featurePick(parent: HTMLElement, ui: BuilderUI, into: Draft, key: string, label: string): void {
		const f = field(parent, label);
		const names = () => arr<{ features?: Feature[] }>(this.d.levels).flatMap(l => arr<Feature>(l.features)).map(x => str(x.name).trim()).filter(n => n && !/^subclass$/i.test(n));
		suggestField<string>(f.control, {
			value: str(into[key]), placeholder: 'A feature\'s name', words: true, labelledBy: f.labelId, label, onEmpty: true, hideExact: true,
			onInput: v => { into[key] = v; ui.changed(); },
			suggest: (q) => names().filter(n => !q || nameKey(n).includes(nameKey(q))).slice(0, 8).map(n => ({ item: n, label: n })),
			onPick: (s, input) => { input.value = s.item; into[key] = s.item; ui.changed(); },
		});
	}

	private resourceCard(parent: HTMLElement, ui: BuilderUI, r: Draft, remove: () => void): void {
		const { card } = listCard(parent, ui, { title: () => str(r.name).trim() || 'New resource', remove, cls: 'ncb-resource' });
		const top = grid(card, 2);
		const n = field(top, 'Name');
		textInput(n.control, { value: str(r.name), placeholder: resKind(r) === 'dice' ? 'Wick Dice' : 'Oil', words: true, labelledBy: n.labelId, label: 'Resource name', onInput: v => { r.name = v; ui.changed(); } });
		const k = field(top, 'Kind');
		segmented<ResKind>(k.control, [{ value: 'dice', label: 'Dice', icon: 'dice' }, { value: 'points', label: 'Points' }, { value: 'uses', label: 'Uses' }], () => resKind(r), v => {
			resKinds.set(r, v);
			if (v === 'dice') { r.die = str(r.die) || 'd6'; if (!r.dice) r.dice = { rolled: 'spent', addTo: ['attack'] }; delete r.spend; }
			else { delete r.die; delete r.dice; if (v === 'uses') delete r.spend; }
			window.setTimeout(() => ui.rebuild(), 0);
		}, { label: 'Kind', labelledBy: k.labelId, ui, cls: 'is-compact' });
		const kind = resKind(r);
		if (kind === 'dice') {
			const die = field(card, 'Die', { wide: true });
			segmented<string>(die.control, DICE.map(x => ({ value: x, label: x })), () => str(r.die) || 'd6', v => { r.die = v; }, { label: 'Die', labelledBy: die.labelId, ui, cls: 'is-compact is-tight' });
		}
		const g = grid(card, kind === 'points' ? 3 : 2);
		const max = field(g, kind === 'dice' ? 'Most held' : 'Max');
		textInput(max.control, { value: str(r.max), placeholder: kind === 'points' ? '5×LVL' : kind === 'dice' ? '2' : 'WIL', code: true, labelledBy: max.labelId, label: 'Max', onInput: v => { r.max = v; ui.changed(); } });
		const reset = field(g, 'Comes back');
		suggestField<string>(reset.control, {
			value: str(r.reset), placeholder: 'Safe Rest', labelledBy: reset.labelId, label: 'Comes back', onEmpty: true, hideExact: true,
			onInput: v => { r.reset = v; ui.changed(); },
			suggest: (q) => RESETS.filter(x => !q || x.toLowerCase().includes(q.toLowerCase())).map(x => ({ item: x, label: x })),
			onPick: (s, input) => { input.value = s.item; r.reset = s.item; ui.changed(); },
		});
		if (kind === 'points') {
			const sp = field(g, 'Button');
			textInput(sp.control, { value: str(r.spend), placeholder: 'Spend', words: true, labelledBy: sp.labelId, label: 'Button', onInput: v => { r.spend = v; ui.changed(); } });
		}
		if (kind === 'dice') this.diceFields(card, ui, obj(r, 'dice'));
	}

	/** How a class's dice are used at the table (resource-def.ts reads it): rolled when, into what, how many, kept, on. */
	private diceFields(card: HTMLElement, ui: BuilderUI, x: Draft): void {
		const g = grid(card, 2);
		const rolled = field(g, 'Rolled');
		segmented<string>(rolled.control, [{ value: 'spent', label: 'When spent' }, { value: 'gained', label: 'When gained' }], () => str(x.rolled) || 'spent', v => { x.rolled = v; window.setTimeout(() => ui.rebuild(), 0); }, { label: 'Rolled', labelledBy: rolled.labelId, ui, cls: 'is-compact' });
		const use = field(g, 'Into one roll');
		segmented<string>(use.control, [{ value: 'one', label: 'One' }, { value: 'any', label: 'Any' }, { value: 'all', label: 'All' }], () => str(x.use) || 'one', v => { x.use = v; }, { label: 'Into one roll', labelledBy: use.labelId, ui, cls: 'is-compact' });
		const into = field(card, 'Goes into', { wide: true });
		chipToggles(into.control, ui, ['attack', 'spell', 'save', 'check'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), () => strs(x.addTo), v => { x.addTo = v; }, { label: 'Goes into', labelledBy: into.labelId });
		const more = field(card, 'At the table', { wide: true });
		const flags: [string, string][] = [['keep', 'Kept after the roll'], ['reachOnly', 'Melee and Reach only'], ['clearsOnRest', 'Gone after a fight'], ['on', 'On from the start']];
		chipToggles(more.control, ui, flags.map(([value, label]) => ({ value, label })), () => flags.filter(([k]) => x[k] === true).map(([k]) => k), v => { for (const [k] of flags) { if (v.includes(k)) x[k] = true; else delete x[k]; } }, { label: 'At the table', labelledBy: more.labelId });
		const g2 = grid(card, 2);
		const ow = field(g2, 'On while');
		textInput(ow.control, { value: str(x.onWhile), placeholder: 'Kindled', words: true, labelledBy: ow.labelId, label: 'On while', onInput: v => { x.onWhile = v; ui.changed(); } });
		const dt = field(g2, 'Damage type');
		textInput(dt.control, { value: str(x.damageType), placeholder: 'fire', labelledBy: dt.labelId, label: 'Damage type', onInput: v => { x.damageType = v; ui.changed(); } });
		if (str(x.rolled) === 'gained') {
			const g3 = grid(card, 2);
			const gl = field(g3, 'Gain button');
			textInput(gl.control, { value: str(x.gainLabel), placeholder: 'Kindle', words: true, labelledBy: gl.labelId, label: 'Gain button', onInput: v => { x.gainLabel = v; if (v.trim() && !x.gain) x.gain = 1; ui.changed(); } });
			const gn = field(g3, 'Dice it gains');
			numberInput(gn.control, { get: () => (typeof x.gain === 'number' ? x.gain : undefined), placeholder: () => '1', set: v => { x.gain = v; }, min: 1, max: 10, label: 'Dice it gains', labelledBy: gn.labelId, ui });
		}
		// As it levels: a bigger die, more held (for one subclass, if it names one).
		const by = field(card, 'Die by level', { wide: true });
		by.control.addClass('is-stack');
		const steps = Array.isArray(x.byLevel) ? x.byLevel as Draft[] : (x.byLevel = [] as Draft[]);
		for (const [i, s] of steps.entries()) {
			const row = by.control.createDiv({ cls: 'ncb-inline' });
			row.createSpan({ cls: 'ncb-inline-label', text: 'From level' });
			stepper(row, ui, { get: () => Number(s.level) || 1, set: n => { s.level = n; }, min: 1, max: 20, label: 'level' });
			segmented<string>(row, DICE.map(v => ({ value: v, label: v })), () => str(s.die) || 'd8', v => { s.die = v; }, { label: 'Die', ui, cls: 'is-compact is-tight' });
			iconButton(row, 'x', 'Take this step out', () => { steps.splice(i, 1); ui.rebuild(); }, 'ncb-grant-remove');
		}
		textButton(by.control, 'plus', 'A bigger die from a level', () => { steps.push({ level: 5, die: 'd8' }); ui.rebuild(); }).addClass('ncb-small');
		const mx = field(card, 'Holds more', { wide: true });
		mx.control.addClass('is-stack');
		const adds = Array.isArray(x.maxSteps) ? x.maxSteps as Draft[] : (x.maxSteps = [] as Draft[]);
		for (const [i, s] of adds.entries()) {
			const row = mx.control.createDiv({ cls: 'ncb-inline' });
			row.createSpan({ cls: 'ncb-inline-label', text: 'From level' });
			stepper(row, ui, { get: () => Number(s.level) || 1, set: n => { s.level = n; }, min: 1, max: 20, label: 'level' });
			stepper(row, ui, { get: () => Number(s.add) || 1, set: n => { s.add = n; }, min: 1, max: 5, label: 'more held', signed: true });
			textInput(row, { value: str(s.subclass), placeholder: 'For one subclass', words: true, label: 'For one subclass', cls: 'ncb-inline-text', onInput: v => { s.subclass = v; ui.changed(); } });
			iconButton(row, 'x', 'Take this step out', () => { adds.splice(i, 1); ui.rebuild(); }, 'ncb-grant-remove');
		}
		textButton(mx.control, 'plus', 'More held from a level', () => { adds.push({ level: 5, add: 1 }); ui.rebuild(); }).addClass('ncb-small');
	}

	renderCheck(el: HTMLElement): void {
		const { comp, name } = this.world();
		const rows = levelRows(comp, name);
		checkHead(el, { kicker: 'Level up asks', value: `${rows.length} ${rows.length === 1 ? 'level' : 'levels'}` });
		grantRows(el, rows, 'Give it a feature at level 1.');
	}

	checkChip(): { text: string; tone: 'ok' | 'high' | 'low' | 'none' } {
		const n = super.checkChip();
		return n.tone === 'ok' ? { text: `${filledLevels(this.d).length} levels`, tone: 'ok' } : n;
	}

	protected summary(): [string, string, () => string][] {
		const d = this.d;
		return [
			['Hit Die and HP', 'start', () => `d${str(d.hitDie) || 8} · ${typeof d.startingHp === 'number' ? d.startingHp : STARTING_HP[Number(d.hitDie)] ?? '?'} HP`],
			['Key stats and saves', 'stats', () => [keyStatsOf(d).join(' '), d.saves && (d.saves as Draft).adv ? `▲ ${str((d.saves as Draft).adv)}` : '', d.saves && (d.saves as Draft).dis ? `▼ ${str((d.saves as Draft).dis)}` : ''].filter(Boolean).join(' · ') || 'None yet'],
			['Magic', 'magic', () => (d.casting ? `${str((d.casting as Draft).mana) || 'Mana'} · ${strs((d.casting as Draft).schools).join(', ') || 'no school'}` : 'None')],
			['Resources', 'resources', () => arr<ClassResource>(d.resources).map(r => str(r.name)).filter(Boolean).join(', ') || 'None'],
			['Levels', 'levels', () => filledLevels(d).join(', ') || 'None yet'],
			['Option lists', 'options', () => arr<Draft>(d.optionGroups).map(g => str(g.name)).filter(Boolean).join(', ') || 'None'],
		];
	}
}

// ----------------------------------------------------------------------------
// The subclass

class SubclassBuilder extends ContentBuilder {
	constructor(plugin: EmberVaultPlugin, seed: unknown) { super(plugin, 'subclass', seed); }

	private classLists(): string[] {
		const { comp, className } = this.world();
		return classLists(comp, className).map(l => l.name);
	}

	private host(): LevelHost {
		return {
			d: this.d, isClass: false, schools: () => spellSchools(this.world().comp),
			lists: () => [...new Set([...this.classLists(), ...arr<Draft>(this.d.optionGroups).map(g => str(g.name).trim()).filter(Boolean)])],
		};
	}

	protected draw(id: string, panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		if (id === 'levels') { levelsStep(panel, ui, this.host()); return; }
		if (id === 'options') {
			section(panel, 'Its own lists, and what it swaps');
			optionListsEditor(panel, ui, d);
			const classLists = this.classLists();
			const own = arr<Draft>(d.optionGroups).map(g => str(g.name).trim()).filter(Boolean);
			if (own.length) {
				const comp = field(panel, 'Companions', { wide: true });
				chipToggles(comp.control, ui, own.map(v => ({ value: v })), () => strs(d.companions), v => { d.companions = v; }, { label: 'Companions', labelledBy: comp.labelId });
			}
			// What it changes in its class's lists, once its class has some.
			if (!classLists.length) return;
			const lose = field(panel, 'Gives up', { wide: true });
			chipToggles(lose.control, ui, classLists.map(v => ({ value: v })), () => strs(d.lose), v => { d.lose = v; }, { label: 'Gives up', labelledBy: lose.labelId });
			const ins = field(panel, 'Chooses instead', { wide: true });
			ins.control.addClass('is-stack');
			const swaps = list(d, 'instead');
			for (const [i, s] of swaps.entries()) {
				const row = ins.control.createDiv({ cls: 'ncb-swap' });
				const pick = (key: 'from' | 'to', options: string[], label: string) => {
					const sel = row.createEl('select', { cls: 'dropdown eb-select', attr: { 'aria-label': label } });
					sel.createEl('option', { value: '', text: label });
					for (const o of options) sel.createEl('option', { value: o, text: o }).selected = nameKey(o) === nameKey(str(s[key]));
					sel.addEventListener('change', () => { s[key] = sel.value; ui.changed(); });
				};
				pick('from', classLists, 'Whenever it would choose');
				setIcon(row.createSpan({ cls: 'ncb-swap-arrow' }), gameIcon('arrow-right'));
				pick('to', [...new Set([...classLists, ...own])], 'It chooses instead');
				iconButton(row, 'x', 'Take this swap out', () => { swaps.splice(i, 1); ui.rebuild(); }, 'ncb-grant-remove');
			}
			textButton(ins.control, 'plus', 'Add a swap', () => { swaps.push({ from: '', to: '' }); ui.rebuild(); }).addClass('ncb-small');
			return;
		}
		section(panel, 'Your subclass');
		const top = grid(panel, 2);
		this.nameField(top, ui, 'Hooded Lantern');
		this.classField(top, ui);
		this.textField(panel, ui, 'flavor', 'About it', 'Light only where you want it.', { area: true });
	}

	renderCheck(el: HTMLElement): void {
		const { comp, name, className } = this.world();
		if (!className) return;
		const rows = levelRows(comp, className, { subclass: name, only: 'subclass' });
		checkHead(el, { kicker: `In the ${className}`, value: rows.length ? `Levels ${rows.map(r => r.level).join(', ')}` : 'No levels yet' });
		grantRows(el, rows, 'Give it a feature.');
	}

	protected summary(): [string, string, () => string][] {
		const d = this.d;
		return [
			['Class', 'start', () => str(d.class) || 'None yet'],
			['Levels', 'levels', () => filledLevels(d).join(', ') || 'None yet'],
			['Lists', 'options', () => arr<Draft>(d.optionGroups).map(g => str(g.name)).filter(Boolean).join(', ') || 'None'],
		];
	}
}

export function registerClassBuilders(): void {
	registerContentKind('class', (p, s) => new ClassBuilder(p, s));
	registerContentKind('subclass', (p, s) => new SubclassBuilder(p, s));
}
