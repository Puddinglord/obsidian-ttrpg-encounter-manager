// The ```5e-sheet block: a 5e character sheet drawn from its note's
// frontmatter (character.ts does the rules). Rolls go through the plugin's dice;
// every change is a frontmatter edit, so the note stays the source of truth and
// the sheet redraws when it changes.

import { FuzzySuggestModal, MarkdownPostProcessorContext, MarkdownRenderChild, Menu, Notice, setIcon, TFile } from 'obsidian';
import {
	addItem, addListEntry, changeHp, cycleSkill, Frontmatter, longRest, readSheet5e, removeListEntry, setDeathSaves, setItem, Sheet5e, shortRest, useSlot,
} from './character';
import { findHit, Hit5e, KIND5E } from './compendium';
import { asEdition } from './editions';
import { parseHp } from './combat';
import { formatMod } from './rules';
import type { Dnd5eRuntime } from './runtime';
import { openLevelUp5e } from './character-wizard';
import { ABILITIES, ABILITY_NAME, AbilityKey } from './types';
import { markTerm, termContext } from '../../core/rule-term-ui';

export const SHEET_LANG = '5e-sheet';
const SHORT: Record<AbilityKey, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const d20 = (mod: number) => (mod === 0 ? '1d20' : `1d20${mod > 0 ? '+' : '-'}${Math.abs(mod)}`);

export class Dnd5eSheet extends MarkdownRenderChild {
	constructor(private rt: Dnd5eRuntime, el: HTMLElement, private ctx: MarkdownPostProcessorContext) {
		super(el);
	}

	private get file(): TFile | null {
		return this.rt.plugin.app.vault.getFileByPath(this.ctx.sourcePath);
	}

	private get fm(): Frontmatter {
		const f = this.file;
		return (f ? this.rt.plugin.app.metadataCache.getFileCache(f)?.frontmatter : undefined) ?? {};
	}

	private sheet(): Sheet5e {
		const fm = this.fm;
		const edition = fm.edition !== undefined ? asEdition(fm.edition as string) : this.rt.edition(this.ctx.sourcePath);
		return readSheet5e(fm, edition, this.file?.basename ?? 'Hero');
	}

	onload(): void {
		this.registerEvent(this.rt.plugin.app.metadataCache.on('changed', (f) => { if (f.path === this.ctx.sourcePath) this.render(); }));
		this.render();
	}

	/** Change the note's frontmatter; the 'changed' event redraws. */
	private edit(fn: (fm: Frontmatter, s: Sheet5e) => void): void {
		const f = this.file;
		if (!f) return;
		const s = this.sheet();
		void this.rt.plugin.app.fileManager.processFrontMatter(f, (fm: Frontmatter) => fn(fm, s));
	}

	private roll(expression: string, label: string): number | undefined {
		return this.rt.plugin.rollDice(expression, label, 'effect')?.total;
	}

	/** A number that rolls when clicked. */
	private rollable(parent: HTMLElement, text: string, expression: string, label: string, cls = ''): HTMLElement {
		const b = parent.createEl('button', { cls: `dnd5e-sheet-roll ${cls}`.trim(), text, attr: { 'aria-label': `Roll ${label}` } });
		b.onclick = (e) => { e.preventDefault(); this.roll(expression, label); };
		return b;
	}

	render(): void {
		const el = this.containerEl;
		el.empty();
		const s = this.sheet();
		const root = el.createDiv({ cls: `dnd5e-sheet ed-${s.edition}` });
		const who = (what: string) => `${s.name}: ${what}`;

		// Header.
		const head = root.createDiv({ cls: 'dnd5e-sheet-head' });
		const titles = head.createDiv();
		titles.createDiv({ cls: 'dnd5e-sheet-name', text: s.name });
		titles.createDiv({ cls: 'dnd5e-sheet-sub', text: [`Level ${s.level}`, s.species, [s.className || 'No class', s.subclass ? `(${s.subclass})` : ''].filter(Boolean).join(' '), s.background].filter(Boolean).join(' · ') });
		const acts = head.createDiv({ cls: 'dnd5e-sheet-actions' });
		const act = (label: string, icon: string, run: () => void) => {
			const b = acts.createEl('button');
			setIcon(b.createSpan({ cls: 'dnd5e-btn-icon' }), icon);
			b.createSpan({ text: label });
			b.onclick = run;
		};
		act('Short rest', 'coffee', () => this.shortRest(s));
		act('Long rest', 'bed', () => { this.edit(longRest); new Notice(`${s.name} takes a long rest.`); });
		if (s.level < 20) act('Level up', 'trending-up', () => this.levelUp(s));

		// The game's rules words: a label's click shows what it means.
		const terms = termContext(this.rt.plugin, this.ctx.sourcePath);
		const mark = <T extends HTMLElement>(el: T, word: string): T => { markTerm(el, terms, word); return el; };

		// Vitals.
		const vit = root.createDiv({ cls: 'dnd5e-sheet-vitals' });
		const box = (label: string, fill: (b: HTMLElement) => void, title?: string, rule = label) => {
			const b = vit.createDiv({ cls: 'dnd5e-sheet-box', attr: title ? { 'aria-label': title } : {} });
			mark(b.createDiv({ cls: 'dnd5e-sheet-box-label' }).createSpan({ text: label }), rule);
			fill(b.createDiv({ cls: 'dnd5e-sheet-box-value' }));
		};
		box('AC', b => b.setText(String(s.ac)), s.acFrom);
		box('Initiative', b => this.rollable(b, formatMod(s.initiative), d20(s.initiative), who('initiative')));
		box('Speed', b => b.setText(`${s.speed} ft.`));
		box('Prof.', b => b.setText(formatMod(s.pb)), undefined, 'Proficiency Bonus');
		box('Hit dice', b => b.setText(`${s.hitDiceLeft}/${s.level} d${s.hitDie}`), undefined, s.edition === '2014' ? 'Hit Points' : 'Hit Point Dice');
		box('Inspiration', b => {
			const t = b.createEl('button', { cls: `dnd5e-sheet-toggle${s.inspiration ? ' is-on' : ''}`, text: s.inspiration ? 'Yes' : 'No' });
			t.onclick = () => this.edit(fm => { if (s.inspiration) delete fm.inspiration; else fm.inspiration = true; });
		}, undefined, 'Heroic Inspiration');

		// HP.
		const hp = root.createDiv({ cls: 'dnd5e-sheet-hp' });
		mark(hp.createSpan({ cls: 'dnd5e-sheet-box-label', text: 'Hit points' }), 'Hit Points');
		const bar = hp.createDiv({ cls: 'dnd5e-hp-bar' });
		bar.createDiv({ cls: 'dnd5e-hp-fill' }).setCssStyles({ width: `${Math.round(100 * s.hp / s.hpMax)}%` });
		hp.createSpan({ cls: 'dnd5e-sheet-hp-text', text: `${s.hp} / ${s.hpMax}${s.tempHp ? ` (+${s.tempHp} temp)` : ''}` });
		const input = hp.createEl('input', { type: 'text', cls: 'dnd5e-hp-input', attr: { placeholder: '−dmg +heal', 'aria-label': 'HP change', title: 'Damage (7), heal (+7), temp HP (t7), set (=7); Enter' } });
		input.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter') return;
			const c = parseHp(input.value);
			if (!c) { input.addClass('is-invalid'); return; }
			this.edit((fm, sh) => changeHp(fm, sh, { kind: c.kind, amount: c.amount }));
		});
		if (s.hp === 0) {
			const ds = root.createDiv({ cls: 'dnd5e-death' });
			mark(ds.createSpan({ cls: 'dnd5e-death-label', text: 'Death saves' }), s.edition === '2014' ? 'Dropping to 0 Hit Points' : 'Death Saving Throw');
			const group = (label: string, n: number, cls: string, set: (v: number) => void) => {
				const g = ds.createSpan({ cls: `dnd5e-death-group ${cls}` });
				g.createSpan({ cls: 'dnd5e-death-label', text: label });
				for (let i = 0; i < 3; i++) {
					const pip = g.createSpan({ cls: `dnd5e-pip${i < n ? ' is-on' : ''}` });
					pip.onclick = () => set(i < n ? i : i + 1);
				}
			};
			group('Saves', s.deathSaves.success, 'is-success', v => this.edit(fm => setDeathSaves(fm, v, s.deathSaves.failure)));
			group('Fails', s.deathSaves.failure, 'is-failure', v => this.edit(fm => setDeathSaves(fm, s.deathSaves.success, v)));
			const r = ds.createEl('button', { text: 'Roll save' });
			r.onclick = () => {
				const n = this.roll('1d20', who('death save'));
				if (n === undefined) return;
				if (n === 20) this.edit(fm => { fm.hp = 1; delete fm.death_saves; });
				else this.edit(fm => setDeathSaves(fm, s.deathSaves.success + (n >= 10 ? 1 : 0), s.deathSaves.failure + (n === 1 ? 2 : n < 10 ? 1 : 0)));
			};
		}

		// Abilities and saves.
		const abil = root.createDiv({ cls: 'dnd5e-sheet-abilities' });
		for (const a of ABILITIES) {
			const card = abil.createDiv({ cls: 'dnd5e-sheet-ability' });
			mark(card.createDiv({ cls: 'dnd5e-sheet-ability-name' }).createSpan({ text: SHORT[a] }), SHORT[a]);
			this.rollable(card, formatMod(s.mods[a]), d20(s.mods[a]), who(`${ABILITY_NAME[a]} check`), 'is-mod');
			card.createDiv({ cls: 'dnd5e-sheet-ability-score', text: String(s.scores[a]) });
			const save = card.createDiv({ cls: `dnd5e-sheet-save${s.saves[a].proficient ? ' is-prof' : ''}` });
			mark(save.createSpan({ text: 'Save' }), 'Saving Throw');
			save.appendText(' ');
			this.rollable(save, formatMod(s.saves[a].bonus), d20(s.saves[a].bonus), who(`${ABILITY_NAME[a]} save`));
		}

		const cols = root.createDiv({ cls: 'dnd5e-sheet-cols' });
		// Skills: click the bonus to roll, the dot to cycle proficiency.
		const skills = cols.createDiv({ cls: 'dnd5e-sheet-skills' });
		mark(skills.createDiv({ cls: 'dnd5e-sheet-section' }).createSpan({ text: 'Skills' }), 'Skills');
		for (const k of s.skills) {
			const row = skills.createDiv({ cls: 'dnd5e-sheet-skill' });
			const dot = row.createSpan({ cls: `dnd5e-skill-dot${k.expertise ? ' is-expert' : k.proficient ? ' is-prof' : ''}`, attr: { role: 'button', 'aria-label': `${k.name}: ${k.expertise ? 'expertise' : k.proficient ? 'proficient' : 'not proficient'}` } });
			dot.onclick = () => this.edit(fm => cycleSkill(fm, k.name));
			this.rollable(row, formatMod(k.bonus), d20(k.bonus), who(k.name));
			mark(row.createSpan({ cls: 'dnd5e-skill-name', text: k.name }), k.name);
			row.appendText(' ');
			row.createSpan({ cls: 'dnd5e-skill-ab', text: SHORT[k.ability] });
		}
		const passive = skills.createDiv({ cls: 'dnd5e-sheet-passive' });
		mark(passive.createSpan({ text: 'Passive Perception' }), 'Passive Perception');
		passive.appendText(` ${s.passivePerception}`);

		const right = cols.createDiv({ cls: 'dnd5e-sheet-right' });
		// Attacks.
		right.createDiv({ cls: 'dnd5e-sheet-section', text: 'Attacks' });
		if (!s.attacks.length) right.createDiv({ cls: 'dnd5e-sheet-empty', text: 'Equip a weapon in the inventory to see it here.' });
		for (const a of s.attacks) {
			const row = right.createDiv({ cls: 'dnd5e-sheet-attack' });
			row.createSpan({ cls: 'dnd5e-sheet-attack-name', text: a.name });
			this.rollable(row, formatMod(a.toHit), d20(a.toHit), who(`${a.name} (attack)`));
			this.rollable(row, `${a.damage} ${a.damageType}`.trim(), a.damage, who(`${a.name} damage`));
		}

		// Spellcasting.
		if (s.spellcasting || s.spells.length) {
			right.createDiv({ cls: 'dnd5e-sheet-section', text: 'Spells' });
			if (s.spellcasting) {
				const line = right.createDiv({ cls: 'dnd5e-sheet-cast' });
				line.appendText(`${ABILITY_NAME[s.spellcasting.ability]} · Save DC ${s.spellcasting.dc} · Attack `);
				this.rollable(line, formatMod(s.spellcasting.attack), d20(s.spellcasting.attack), who('spell attack'));
			}
			if (s.slots.length) {
				const slots = right.createDiv({ cls: 'dnd5e-sheet-slots' });
				for (const sl of s.slots) {
					const g = slots.createDiv({ cls: 'dnd5e-slot-group', attr: { 'aria-label': `Level ${sl.level} slots: ${sl.max - sl.used} of ${sl.max} left` } });
					g.createSpan({ cls: 'dnd5e-slot-level', text: String(sl.level) });
					for (let i = 0; i < sl.max; i++) {
						const pip = g.createSpan({ cls: `dnd5e-pip${i < sl.max - sl.used ? ' is-on' : ''}` });
						pip.onclick = () => this.edit((fm, sh) => useSlot(fm, sh, sl.level, i < sl.max - sl.used ? 1 : -1));
					}
				}
			}
			const byLevel = [...s.spells].sort((a, b) => (a.spell?.level ?? 99) - (b.spell?.level ?? 99) || a.name.localeCompare(b.name));
			const list = right.createDiv({ cls: 'dnd5e-sheet-spells' });
			for (const sp of byLevel) {
				const row = list.createDiv({ cls: 'dnd5e-sheet-spell' });
				row.createSpan({ cls: 'dnd5e-cmp-badge', text: sp.spell ? (sp.spell.level === 0 ? 'C' : String(sp.spell.level)) : '?' });
				const name = row.createEl('a', { text: sp.name, cls: 'dnd5e-sheet-spell-name', attr: { href: '#' } });
				const hit = sp.spell ? findHit(s.edition, sp.name, 'spell') : undefined;
				if (hit) {
					name.onclick = (e) => { e.preventDefault(); this.rt.openCard(hit, this.ctx.sourcePath); };
					this.rt.plugin.hover.attach(name, () => this.rt.hitHover(hit, this.ctx.sourcePath));
					if (sp.spell?.concentration) row.createSpan({ cls: 'dnd5e-sheet-tag', text: 'C' }).setAttr('aria-label', 'Concentration');
				} else name.addClass('is-unresolved');
				const x = row.createEl('button', { cls: 'clickable-icon dnd5e-sheet-x', attr: { 'aria-label': `Remove ${sp.name}` } });
				setIcon(x, 'x');
				x.onclick = () => this.edit(fm => removeListEntry(fm, 'spells', sp.name));
			}
			const add = right.createEl('button', { cls: 'dnd5e-sheet-add', text: 'Add spell' });
			add.onclick = () => this.pick('spell', s, (hit) => this.edit(fm => addListEntry(fm, 'spells', hit.name)));
		}

		// Inventory.
		right.createDiv({ cls: 'dnd5e-sheet-section', text: 'Inventory' });
		for (const it of s.inventory) {
			const row = right.createDiv({ cls: `dnd5e-sheet-item${it.equipped ? ' is-equipped' : ''}` });
			const eq = row.createEl('input', { type: 'checkbox', attr: { 'aria-label': `Equip ${it.name}` } });
			eq.checked = it.equipped;
			eq.onchange = () => this.edit(fm => setItem(fm, it.index, { equipped: eq.checked }));
			const name = row.createEl('a', { text: `${it.name}${it.qty !== 1 ? ` ×${it.qty}` : ''}`, cls: 'dnd5e-sheet-item-name', attr: { href: '#' } });
			const hit = findHit(s.edition, it.name, it.item ? 'item' : 'equipment');
			if (hit) { name.onclick = (e) => { e.preventDefault(); this.rt.openCard(hit, this.ctx.sourcePath); }; this.rt.plugin.hover.attach(name, () => this.rt.hitHover(hit, this.ctx.sourcePath)); }
			const more = row.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': `${it.name}: more` } });
			setIcon(more, 'more-horizontal');
			more.onclick = (e) => {
				const m = new Menu();
				m.addItem(i => i.setTitle('One more').setIcon('plus').onClick(() => this.edit(fm => setItem(fm, it.index, { qty: it.qty + 1 }))));
				m.addItem(i => i.setTitle(it.qty > 1 ? 'One fewer' : 'Remove').setIcon(it.qty > 1 ? 'minus' : 'trash-2').onClick(() => this.edit(fm => setItem(fm, it.index, { qty: it.qty - 1 }))));
				m.showAtMouseEvent(e);
			};
		}
		const addItemBtn = right.createEl('button', { cls: 'dnd5e-sheet-add', text: 'Add item' });
		addItemBtn.onclick = () => this.pick('item', s, (hit) => this.edit(fm => addItem(fm, hit.name, { equipped: hit.kind === 'equipment' && !!(hit.equipment.damage || hit.equipment.ac) })));
		right.createDiv({ cls: 'dnd5e-sheet-gold', text: `${s.gold} gp` });

		// Features.
		const feats = root.createDiv({ cls: 'dnd5e-sheet-features' });
		feats.createDiv({ cls: 'dnd5e-sheet-section', text: 'Features and traits' });
		for (const f of s.features) {
			const d = feats.createEl('details', { cls: 'dnd5e-sheet-feature' });
			const sum = d.createEl('summary');
			sum.createSpan({ cls: 'dnd5e-sheet-feature-name', text: f.name });
			sum.createSpan({ cls: 'dnd5e-sheet-feature-src', text: f.level ? `${f.source} ${f.level}` : f.source });
			if (f.desc) d.createDiv({ cls: 'dnd5e-sheet-feature-text', text: f.desc });
		}
		if (!s.cls) feats.createDiv({ cls: 'dnd5e-sheet-empty', text: `No ${s.edition} class called "${s.className}": set class: in the note's properties.` });
	}

	/** Spend hit dice: one die per click of the prompt, each healing a roll + Con. */
	private shortRest(s: Sheet5e): void {
		if (!s.hitDiceLeft) { new Notice(`${s.name} has no hit dice left.`); return; }
		const mod = s.mods.con;
		const total = this.roll(`1d${s.hitDie}${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}`, `${s.name}: hit die`);
		if (total === undefined) return;
		this.edit((fm, sh) => shortRest(fm, sh, 1, Math.max(0, total)));
	}

	/** The level-up wizard: hit points, a subclass when it's time, an increase or a feat, new spells. */
	private levelUp(s: Sheet5e): void {
		const file = this.file;
		if (!file) return;
		openLevelUp5e(this.rt, file, { ...this.fm }, s.edition, s.name);
	}

	private pick(kind: 'spell' | 'item', s: Sheet5e, onPick: (hit: Hit5e) => void): void {
		const all = this.rt.hits(s.edition, this.ctx.sourcePath).filter(h => kind === 'spell' ? h.kind === 'spell' : h.kind === 'item' || h.kind === 'equipment');
		// A caster's own class list first.
		const mine = kind === 'spell' && s.className ? all.filter(h => h.kind === 'spell' && h.spell.classes.includes(s.className)) : [];
		new HitPicker(this.rt, mine.length ? [...mine, ...all.filter(h => !mine.includes(h))] : all, kind === 'spell' ? 'Add a spell…' : 'Add an item…', onPick).open();
	}
}

class HitPicker extends FuzzySuggestModal<Hit5e> {
	constructor(rt: Dnd5eRuntime, private hits: Hit5e[], placeholder: string, private onPick: (hit: Hit5e) => void) {
		super(rt.plugin.app);
		this.setPlaceholder(placeholder);
	}
	getItems(): Hit5e[] { return this.hits; }
	getItemText(h: Hit5e): string { return `${h.name} (${KIND5E[h.kind].label}: ${h.detail})`; }
	onChooseItem(h: Hit5e): void { this.onPick(h); }
}
