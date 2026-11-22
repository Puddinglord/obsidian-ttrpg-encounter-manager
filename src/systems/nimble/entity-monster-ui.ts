// The monster builder's steps: Start (everything a quick build needs),
// Toughness, Attacks, Abilities, Story, Review. The numbers come from
// entity-monster.ts; this file only lays them out.

import { setIcon } from 'obsidian';
import { gameIcon } from '../../core/icons';
import type EmberVaultPlugin from '../../../main';
import { ArmorType, NimbleMonster } from './types';
import { describeMonster, searchMonsters } from './suggest';
import { diceAverage, expectedRegular, FLAVOR_ABILITIES, formatDiceParts, levelLabel, LEVELS, minionDie, parseDiceParts, stepLevel, ARMOR_FROM, LEGENDARY_ARMOR_FROM } from './builder-math';
import {
	applyFix, AttackDraft, attackBody, attackName, attackTarget, autoLevel, BuildRole, draftFromMonster, effectiveHp, expected, levelCheck,
	MonsterDraft, MOVE_MODES, missing, newMonsterDraft, reviewNotes, ReviewFix, SAVE_STATS, savesText, setRole, settledLevel, suggestedBloodied,
	suggestedLastStand, toMonster, toSource, toughnessLine, withDice,
} from './entity-monster';
import {
	arrowNudge, BuilderUI, bookTag, dicePad, field, folderPill, grid, homeFolder, iconButton, KindBuilder, meter, numberInput, Output, pill, registerKind,
	removeButton, reviewNotesView, reviewRows, section, segmented, StepDef, suggestField, textArea, textButton, textInput, wordSuggestions,
} from './entity-builder';
import { nimble } from './runtime';

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

function partyOf(plugin: EmberVaultPlugin): { level: number; size: number } {
	const party = plugin.settings.party ?? [];
	const level = party.length ? Math.round(party.reduce((a, p) => a + (p.level || 1), 0) / party.length) : 1;
	return { level: Math.max(1, level), size: nimble().encounters.partySize() };
}

/** How often each type, group or habitat is used across the monsters the note can see (the compendium's own facets). */
function monsterWords(plugin: EmberVaultPlugin, from: string, key: 'type' | 'group' | 'habitat'): Map<string, number> {
	const out = new Map<string, number>();
	for (const e of nimble().index.all(from)) {
		const m = e.monster;
		// The compendium's Type filter is a monster's group and its type together (Goblins, Undead…).
		const words = key === 'type' ? [m.group, m.type] : key === 'group' ? [m.group] : [m.habitat];
		for (const w of words) if (w?.trim()) out.set(w.trim(), (out.get(w.trim()) ?? 0) + 1);
	}
	return out;
}

class MonsterBuilder implements KindBuilder {
	kind = 'monster' as const;
	noun = 'monster';
	icon = 'skull';
	d: MonsterDraft;

	/** The four save rows are open (they start folded to one line). */
	private savesOpen = false;
	/** A regular monster's Bloodied field is showing (it's a solo rule, so it's asked for). */
	private bloodiedOpen = false;
	/** Editing a block in a note (not copying a monster): no "Start from". */
	private editing: boolean;
	private folder: string;

	constructor(private plugin: EmberVaultPlugin, seed: unknown) {
		const party = partyOf(plugin);
		const s = seed as { monster?: NimbleMonster; copyName?: boolean; editing?: boolean } | undefined;
		this.d = s?.monster ? draftFromMonster(s.monster, party, s.copyName ?? false, s.editing ?? false) : newMonsterDraft(party);
		this.editing = !!s?.editing;
		this.folder = homeFolder(plugin, 'Monsters', 'Bestiary');
	}

	steps(): StepDef[] {
		return [
			{ id: 'start', label: 'Start', icon: 'sparkles' },
			{ id: 'tough', label: this.d.role === 'minion' ? 'Defenses' : 'Toughness', icon: 'shield' },
			{ id: 'attacks', label: 'Attacks', icon: 'swords' },
			{ id: 'abilities', label: this.d.role === 'solo' ? 'Abilities & phases' : 'Abilities', icon: 'zap' },
			{ id: 'story', label: 'Story', icon: 'scroll-text' },
			{ id: 'review', label: 'Review', icon: 'check-check' },
		];
	}

	renderStep(id: string, panel: HTMLElement, ui: BuilderUI): void {
		switch (id) {
			case 'start': return this.start(panel, ui);
			case 'tough': return this.tough(panel, ui);
			case 'attacks': return this.attacks(panel, ui);
			case 'abilities': return this.abilities(panel, ui);
			case 'story': return this.story(panel, ui);
			case 'review': return this.review(panel, ui);
		}
	}

	/** Auto level follows what's been typed; called after any number changes. */
	private settle(): void {
		if (this.d.autoLevel && this.d.role !== 'minion') this.d.level = autoLevel(this.d);
	}

	/** A text field that suggests the compendium's words as you type. */
	private wordField(parent: HTMLElement, f: ReturnType<typeof field>, key: 'type' | 'group' | 'habitat', o: { value: string; placeholder: string; set: (v: string) => void; ui: BuilderUI }): void {
		const words = monsterWords(this.plugin, o.ui.sourcePath, key);
		suggestField<string>(parent, {
			value: o.value, placeholder: o.placeholder, words: true, labelledBy: f.labelId, label: key[0].toUpperCase() + key.slice(1), hideExact: true,
			onInput: v => { o.set(v); o.ui.changed(); },
			suggest: (q) => wordSuggestions(words, q),
			onPick: (s, input) => { input.value = s.item; o.set(s.item); o.ui.changed(); },
		});
	}

	// ------------------------------------------------------------------------
	// Start

	private start(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		section(panel, 'What are you making?', 'Anything you leave blank follows the GM Guide.');
		const top = grid(panel, 2);
		const name = field(top, 'Name');
		textInput(name.control, { value: d.name, placeholder: d.template ? `${d.template.name} variant` : 'Cave bear', words: true, labelledBy: name.labelId, label: 'Name', onInput: v => { d.name = v; ui.changed(); } });

		if (this.editing) {
			const ed = field(top, 'Editing');
			ed.control.createDiv({ cls: 'eb-template-meta', text: d.template ? `${d.template.name}, level ${levelLabel(d.template.level)}` : '' });
		} else {
			const from = field(top, 'Start from');
			this.templatePicker(from, ui);
		}

		const mid = grid(panel, 2);
		const role = field(mid, 'Role');
		segmented<BuildRole>(role.control, [
			{ value: 'regular', label: 'Regular', icon: 'skull' },
			{ value: 'solo', label: 'Solo', icon: 'crown' },
			{ value: 'minion', label: 'Minion', icon: 'users' },
		], () => d.role, v => { if (v !== d.role) { this.d = setRole(d, v); ui.rebuild(); } }, { label: 'Role', labelledBy: role.labelId, ui, key: 'monster-role' });

		const lvl = field(mid, d.role === 'minion' ? 'Party level' : 'Level');
		if (d.role === 'minion') {
			numberInput(lvl.control, { get: () => this.d.partyLevel, placeholder: () => '1', set: v => { this.d.partyLevel = v ?? 1; }, min: 1, max: 30, label: 'Party level', labelledBy: lvl.labelId, ui });
			lvl.help.removeClass('is-empty');
			ui.live(() => lvl.help.setText(`The book's minion die at this level: d${minionDie(this.d.partyLevel)}.`));
		} else this.levelControl(lvl, ui);

		const bottom = grid(panel, 2);
		const size = field(bottom, 'Size');
		segmented(size.control, SIZES.map(s => ({ value: s, label: s })), () => this.d.size, v => { this.d.size = v; }, { label: 'Size', labelledBy: size.labelId, ui, cls: 'is-wrap is-compact' });
		const type = field(bottom, 'Type');
		this.wordField(type.control, type, 'type', { value: d.type, placeholder: 'Goblin, Undead, Beast…', set: v => { this.d.type = v; }, ui });
	}

	private levelControl(f: ReturnType<typeof field>, ui: BuilderUI): void {
		const wrap = f.control.createDiv({ cls: 'eb-level' });
		const down = iconButton(wrap, 'minus', 'Lower level', () => { this.d.autoLevel = false; this.d.level = this.d.role === 'solo' ? Math.max(1, this.d.level - 1) : stepLevel(this.d.level, -1); ui.changed(); }, 'eb-num-btn');
		const value = wrap.createDiv({ cls: 'eb-level-value', attr: { 'aria-live': 'polite' } });
		const up = iconButton(wrap, 'plus', 'Higher level', () => { this.d.autoLevel = false; this.d.level = this.d.role === 'solo' ? this.d.level + 1 : stepLevel(this.d.level, 1); ui.changed(); }, 'eb-num-btn');
		const auto = wrap.createEl('button', { cls: 'eb-auto', attr: { 'aria-pressed': 'false', 'aria-label': 'Follow the HP and damage you type' } });
		auto.createSpan({ cls: 'eb-t', text: 'Auto' });
		auto.addEventListener('click', () => { this.d.autoLevel = !this.d.autoLevel; this.settle(); ui.changed(); });
		f.help.removeClass('is-empty');
		ui.live(() => {
			this.settle();
			value.setText(levelLabel(this.d.level));
			auto.toggleClass('is-active', this.d.autoLevel);
			auto.setAttr('aria-pressed', String(this.d.autoLevel));
			down.disabled = this.d.role === 'solo' ? this.d.level <= 1 : this.d.level <= LEVELS[0];
			up.disabled = this.d.level >= 30;
			f.help.setText(`Current party level: ${this.d.partyLevel}`);
		});
	}

	private templatePicker(f: ReturnType<typeof field>, ui: BuilderUI): void {
		const d = this.d;
		if (d.template) {
			const tpl = f.control.createDiv({ cls: 'eb-template' });
			setIcon(tpl.createSpan({ cls: 'eb-template-icon' }), gameIcon('copy'));
			tpl.createSpan({ cls: 'eb-template-name', text: d.template.name });
			tpl.createSpan({ cls: 'eb-template-meta', text: `level ${levelLabel(d.template.level)}` });
			iconButton(tpl, 'x', 'Start blank instead', () => {
				const party = { level: d.partyLevel, size: d.partySize };
				this.d = { ...newMonsterDraft(party, d.role), name: d.name };
				ui.rebuild();
			});
			return;
		}
		suggestField<NimbleMonster>(f.control, {
			placeholder: 'Blank, or search: goblin, ogre…', code: true, labelledBy: f.labelId, label: 'Copy a monster', onInput: () => { /* searching */ },
			suggest: (q) => searchMonsters(nimble().index.all(ui.sourcePath), q, 6).map(e => ({ item: e.monster, label: e.name, meta: describeMonster(e) })),
			onPick: (s) => {
				const party = { level: this.d.partyLevel, size: this.d.partySize };
				const name = this.d.name;
				this.d = draftFromMonster(s.item, party, false);
				this.d.name = name;
				ui.rebuild();
			},
		});
	}

	// ------------------------------------------------------------------------
	// Toughness

	private tough(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		if (d.role === 'minion') section(panel, 'Defenses', 'Any damage defeats a minion.');
		else section(panel, 'Toughness', d.role === 'solo' ? 'HP is per hero.' : undefined);

		const top = grid(panel, 2);
		if (d.role !== 'minion') {
			const hp = field(top, d.role === 'solo' ? 'HP per hero' : 'HP');
			numberInput(hp.control, { get: () => this.d.hp, placeholder: () => String(effectiveHp({ ...this.d, hp: undefined })), set: v => { this.d.hp = v; this.settle(); }, min: 1, label: 'HP', labelledBy: hp.labelId, ui });
			bookTag(hp.aside, { text: () => this.d.hp === undefined ? null : `Book: ${d.role === 'solo' ? expected(this.d).perHero : expected(this.d).hp}`, use: () => { this.d.hp = undefined; this.settle(); }, ui });
			ui.live(() => {
				const text = this.d.role === 'solo' ? `${effectiveHp(this.d) * this.d.partySize} HP for ${this.d.partySize} heroes.` : this.d.template && this.d.hp === undefined ? `Re-levelled from ${this.d.template.name}.` : '';
				hp.help.setText(text);
				hp.help.toggleClass('is-empty', !text);
			});
		} else {
			const die = field(top, 'Minion die', { help: 'No crits, misses on a 1, no advantage.' });
			segmented<number>(die.control, [4, 6, 8, 10, 12, 20].map(n => ({ value: n, label: `d${n}` })), () => this.d.minionDie ?? minionDie(this.d.partyLevel), v => { this.d.minionDie = v; }, { label: 'Minion die', labelledBy: die.labelId, ui, cls: 'is-compact' });
		}

		const armor = field(top, 'Armor');
		segmented<ArmorType>(armor.control, [{ value: 'none', label: 'None' }, { value: 'medium', label: 'Medium' }, { value: 'heavy', label: 'Heavy' }],
			() => this.d.armor, v => { this.d.armor = v; this.settle(); }, { label: 'Armor', labelledBy: armor.labelId, ui });
		ui.live(() => {
			const e = expected(this.d);
			const from = this.d.role === 'solo' ? LEGENDARY_ARMOR_FROM : ARMOR_FROM;
			const text = this.d.armor === 'none' ? ''
				: e.armorEarly ? `The book holds ${this.d.armor} armor back until level ${from[this.d.armor]}.`
					: `−${this.d.armor === 'medium' ? 10 : 20} damage from each attack; crits ignore it.`;
			armor.help.toggleClass('is-warn', e.armorEarly);
			armor.help.setText(text);
			armor.help.toggleClass('is-empty', !text);
		});

		const move = grid(panel, 2);
		const speed = field(move, 'Speed');
		numberInput(speed.control, { get: () => this.d.speed === 6 ? undefined : this.d.speed, placeholder: () => '6', set: v => { this.d.speed = v ?? 6; }, min: 0, max: 60, label: 'Speed', labelledBy: speed.labelId, ui });
		const modes = field(move, 'Also moves by');
		const chips = modes.control.createDiv({ cls: 'eb-modes' });
		for (const m of MOVE_MODES) {
			const word = m[0].toUpperCase() + m.slice(1);
			const chip = chips.createDiv({ cls: 'eb-mode' });
			const toggle = chip.createEl('button', { cls: 'eb-mode-toggle', attr: { 'aria-pressed': 'false' } });
			toggle.createSpan({ cls: 'eb-t', text: word });
			const num = chip.createEl('input', { cls: 'eb-mode-num', attr: { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off' } });
			num.dataset.field = `${word} speed`;
			num.setAttr('aria-labelledby', modes.labelId);
			toggle.addEventListener('click', () => {
				if (this.d.moves[m] === undefined) { this.d.moves[m] = this.d.speed; window.setTimeout(() => { num.focus(); num.select(); }, 0); } else delete this.d.moves[m];
				ui.changed();
			});
			num.addEventListener('input', () => { const v = parseInt(num.value.replace(/\D/g, ''), 10); if (!Number.isNaN(v)) { this.d.moves[m] = v; ui.changed(); } });
			arrowNudge(num, (dir, mult) => { this.d.moves[m] = Math.max(0, Math.min(60, (this.d.moves[m] ?? this.d.speed) + dir * mult)); num.value = String(this.d.moves[m]); ui.changed(); });
			ui.live(() => {
				const on = this.d.moves[m] !== undefined;
				chip.toggleClass('is-on', on);
				toggle.setAttr('aria-pressed', String(on));
				if (activeDocument.activeElement !== num) num.value = on ? String(this.d.moves[m]) : '';
			});
		}

		// Most monsters roll a plain d20 for every save, so the four rows open only when asked.
		const saves = field(panel, 'Saves', { wide: true, help: d.role === 'solo' ? 'Legendary monsters usually get one or two advantaged saves.' : undefined });
		const summary = saves.control.createDiv({ cls: 'eb-saves-summary' });
		const sumText = summary.createSpan({ cls: 'eb-saves-text' });
		textButton(summary, 'pencil', 'Change', () => { this.savesOpen = true; ui.changed(); });
		const sgrid = saves.control.createDiv({ cls: 'eb-saves' });
		for (const s of SAVE_STATS) {
			const cell = sgrid.createDiv({ cls: 'eb-save' });
			cell.createSpan({ cls: 'eb-save-stat', text: s });
			segmented<number>(cell, [{ value: -1, label: '−', title: 'Disadvantage' }, { value: 0, label: '0', title: 'Plain d20' }, { value: 1, label: '+', title: 'Advantage' }, { value: 2, label: '++', title: 'Advantage 2' }],
				() => this.d.saves[s] ?? 0, v => { if (v) this.d.saves[s] = v; else delete this.d.saves[s]; }, { label: `${s} save`, ui, cls: 'is-compact is-tight' });
		}
		ui.live(() => {
			const text = savesText(this.d);
			sumText.setText(text || 'Plain d20 for every save');
			sumText.toggleClass('is-plain', !text);
			summary.toggleClass('is-hidden', this.savesOpen);
			sgrid.toggleClass('is-hidden', !this.savesOpen);
		});

		const defs = grid(panel, 3);
		for (const [key, label, ph] of [['resistances', 'Resists (−10)', 'fire, cold'], ['immunities', 'Immune to', 'poison'], ['vulnerabilities', 'Vulnerable (+10)', 'radiant']] as const) {
			const f = field(defs, label);
			textInput(f.control, { value: this.d[key].join(', '), placeholder: ph, labelledBy: f.labelId, label, onInput: v => { this.d[key] = v.split(/[,;]/).map(x => x.trim()).filter(Boolean); ui.changed(); } });
		}
	}

	// ------------------------------------------------------------------------
	// Attacks

	private attacks(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		section(panel, 'Attacks', d.role === 'solo' ? 'After each hero\'s turn it picks one: a small attack that moves, or a big one.'
			: d.role === 'minion' ? 'Minions attacking one hero roll together as one attack.' : undefined);

		if (d.role === 'regular') {
			const per = field(panel, 'Attacks a turn', { cls: 'eb-per-turn' });
			segmented<number>(per.control, [1, 2, 3].map(n => ({ value: n, label: String(n) })), () => this.d.attacksPerTurn, v => { this.d.attacksPerTurn = v; this.settle(); }, { label: 'Attacks a turn', labelledBy: per.labelId, ui });
			// What the choice means in numbers: the book splits a turn's damage over the attacks.
			per.help.removeClass('is-empty');
			ui.live(() => {
				const lv = levelLabel(this.d.level);
				const each = [1, 2, 3].map(n => expectedRegular(this.d.level, this.d.armor, n).perAttack);
				per.help.setText(`At level ${lv} the book has one hit of ${each[0]}, two of ${each[1]} or three of ${each[2]}.`);
			});
		} else if (d.role === 'solo') {
			const f = field(panel, 'Before the attacks', { wide: true });
			textInput(f.control, { value: d.actionText ?? '', placeholder: 'After each hero\'s turn, choose one:', labelledBy: f.labelId, label: 'Before the attacks', onInput: v => { this.d.actionText = v; ui.changed(); } });
		}

		const list = panel.createDiv({ cls: 'eb-attacks' });
		d.attacks.forEach((a, i) => this.attackCard(list, a, i, ui));
		if (d.role !== 'minion') {
			const add = panel.createDiv({ cls: 'eb-add-row' });
			textButton(add, 'plus', d.role === 'solo' ? 'Add an option' : 'Add an attack', () => {
				const last = this.d.attacks[this.d.attacks.length - 1];
				this.d.attacks.push({ name: '', size: this.d.role === 'solo' ? 'big' : undefined, die: last?.die });
				ui.rebuild();
				window.setTimeout(() => panel.querySelectorAll<HTMLInputElement>('.eb-attack-name').item(this.d.attacks.length - 1)?.focus(), 20);
			});
		}
	}

	/** One attack: name and what it does on one row, then its dice (with its own die). */
	private attackCard(list: HTMLElement, a: AttackDraft, i: number, ui: BuilderUI): void {
		const d = this.d;
		const card = list.createDiv({ cls: 'eb-attack' });
		const head = card.createDiv({ cls: 'eb-attack-head' });
		if (d.role === 'solo') {
			segmented<'small' | 'big'>(head, [{ value: 'small', label: 'Small', title: 'Moves or sets up, smaller hit' }, { value: 'big', label: 'Big', title: 'The big hit, once it\'s in position' }],
				() => a.size ?? 'big', v => { a.size = v; }, { label: 'Attack size', ui, cls: 'is-compact is-tight' });
		}
		const placeholder = attackName({ ...d, attacksPerTurn: 1 }, { name: '' }, i);
		textInput(head, { value: a.name, placeholder, words: true, label: 'Attack name', cls: 'eb-attack-name', onInput: v => { a.name = v; ui.changed(); } });
		const body = textInput(head, { value: '', placeholder: 'Dice and what else it does', label: 'What it does', cls: 'eb-attack-body', onInput: v => { a.body = v; this.settle(); ui.changed(); } });
		if (d.attacks.length > 1) removeButton(head, this.plugin.app, a.name.trim() || placeholder, () => { this.d.attacks.splice(i, 1); ui.rebuild(); });

		dicePad(card, {
			read: () => parseDiceParts(attackBody(this.d, a)),
			write: (p) => {
				a.die = p.sides;
				a.body = withDice(attackBody(this.d, a), formatDiceParts(p).replace(/^d(\d+)$/, '1d$1'));
				this.settle();
			},
			sides: () => this.d.role === 'minion' ? this.d.minionDie ?? minionDie(this.d.partyLevel) : a.die ?? this.d.die,
			avg: () => diceAverage(attackBody(this.d, a)),
			want: () => attackTarget(this.d, a),
			reset: { shown: () => a.body !== undefined, run: () => { a.body = undefined; this.settle(); } },
			dieMenu: d.role !== 'minion',
			ui,
		});
		ui.live(() => { if (activeDocument.activeElement !== body) body.value = attackBody(this.d, a); });
	}

	// ------------------------------------------------------------------------
	// Abilities, Bloodied, Last Stand

	private rollAbility(): void {
		const taken = new Set(this.d.abilities.map(a => a.name));
		const pool = FLAVOR_ABILITIES.flat().filter(a => !taken.has(a.name));
		const pick = pool[Math.floor(Math.random() * pool.length)];
		if (pick) this.d.abilities.push({ ...pick });
	}

	private abilities(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		section(panel, d.role === 'solo' ? 'Abilities and phases' : 'Abilities', 'The GM Guide\'s numbers assume one simple ability.');
		const list = panel.createDiv({ cls: 'eb-abilities' });
		d.abilities.forEach((ab, i) => {
			const card = list.createDiv({ cls: 'eb-ability' });
			const head = card.createDiv({ cls: 'eb-ability-head' });
			textInput(head, { value: ab.name, placeholder: 'Pack Tactics', words: true, label: 'Ability name', cls: 'eb-ability-name', onInput: v => { ab.name = v; ui.changed(); } });
			removeButton(head, this.plugin.app, ab.name.trim() || 'this ability', () => { this.d.abilities.splice(i, 1); ui.rebuild(); });
			textArea(card, { value: ab.text, placeholder: 'Advantage when an ally is adjacent to the target.', label: 'What it does', rows: 2, onInput: v => { ab.text = v; ui.changed(); } });
		});
		const add = panel.createDiv({ cls: 'eb-add-row' });
		textButton(add, 'plus', 'Add an ability', () => {
			this.d.abilities.push({ name: '', text: '' });
			ui.rebuild();
			window.setTimeout(() => panel.querySelectorAll<HTMLInputElement>('.eb-ability-name').item(this.d.abilities.length - 1)?.focus(), 20);
		});
		textButton(add, 'dices', 'Roll an ability', () => { this.rollAbility(); ui.rebuild(); });

		if (d.role !== 'solo') {
			// Bloodied is a legendary rule (GM Guide p.39); Monsters & More gives one to a few tough regulars (giants, golems, hags).
			if (d.bloodied === undefined && !this.bloodiedOpen) {
				textButton(add, 'droplet', 'Add a Bloodied phase', () => { this.bloodiedOpen = true; ui.rebuild(); window.setTimeout(() => ui.nudge('abilities', 'Bloodied'), 0); });
				return;
			}
			const f = field(panel, 'Bloodied', { wide: true, help: 'At half HP. A few tough regular monsters have one.' });
			textInput(f.control, { value: d.bloodied ?? '', placeholder: 'At half HP it goes berserk: +2 damage.', labelledBy: f.labelId, label: 'Bloodied', onInput: v => { this.d.bloodied = v; ui.changed(); } });
			return;
		}
		const phases = grid(panel, 2);
		const bl = field(phases, 'Bloodied');
		const blText = textArea(bl.control, { value: d.bloodied ?? '', placeholder: suggestedBloodied(d), labelledBy: bl.labelId, label: 'Bloodied', rows: 3, onInput: v => { this.d.bloodied = v; ui.changed(); } });
		bl.help.removeClass('is-empty');
		ui.live(() => {
			blText.placeholder = suggestedBloodied(this.d);
			bl.help.setText(`At half HP: ${Math.round(effectiveHp(this.d) * this.d.partySize / 2)} for ${this.d.partySize} heroes.`);
		});
		const ls = field(phases, 'Last Stand', { help: 'Say "regains N HP per hero" and the tracker applies it.' });
		const lsText = textArea(ls.control, { value: d.lastStand ?? '', placeholder: suggestedLastStand(d), labelledBy: ls.labelId, label: 'Last Stand', rows: 3, onInput: v => { this.d.lastStand = v; ui.changed(); } });
		ui.live(() => { lsText.placeholder = suggestedLastStand(this.d); });
	}

	// ------------------------------------------------------------------------
	// Story

	private story(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		section(panel, 'Story and tactics');
		const desc = field(panel, 'Description', { wide: true });
		textArea(desc.control, { value: d.description ?? '', placeholder: 'What the heroes see, hear and smell.', labelledBy: desc.labelId, label: 'Description', rows: 4, onInput: v => { this.d.description = v; ui.changed(); } });
		const easy = field(panel, 'Easier', { wide: true });
		textInput(easy.control, { value: d.easier ?? '', placeholder: 'Spread its attacks around.', labelledBy: easy.labelId, label: 'Easier', onInput: v => { this.d.easier = v; ui.changed(); } });
		const hard = field(panel, 'Harder', { wide: true });
		textInput(hard.control, { value: d.harder ?? '', placeholder: 'Focus the weakest hero.', labelledBy: hard.labelId, label: 'Harder', onInput: v => { this.d.harder = v; ui.changed(); } });
		const g = grid(panel, 2);
		const group = field(g, 'Group');
		this.wordField(group.control, group, 'group', { value: d.group ?? '', placeholder: 'Goblins, Bandits…', set: v => { this.d.group = v; }, ui });
		const hab = field(g, 'Habitat');
		this.wordField(hab.control, hab, 'habitat', { value: d.habitat ?? '', placeholder: 'Forest, Underground…', set: v => { this.d.habitat = v; }, ui });
	}

	// ------------------------------------------------------------------------
	// Review: a summary, then what's worth a second look, each with its fix

	private review(panel: HTMLElement, ui: BuilderUI): void {
		const head = section(panel, 'Review');
		head.addClass('has-aside');
		folderPill(head, { app: this.plugin.app, get: () => this.folder, set: (p) => { this.folder = p; } });
		const dice = (a: AttackDraft) => { const p = parseDiceParts(attackBody(this.d, a)); return p ? formatDiceParts(p).replace(/^d/, '1d') : ''; };
		reviewRows(panel, ui, [
			['Role and level', 'start', () => this.d.role === 'minion' ? `Minion, party level ${this.d.partyLevel}` : `${this.d.role === 'solo' ? 'Solo' : 'Regular'}, level ${levelLabel(this.d.level)}`],
			['Toughness', 'tough', () => toughnessLine(this.d)],
			['Attacks', 'attacks', () => this.d.attacks.map((a, i) => `${attackName(this.d, a, i)} ${dice(a)}`.trim()).join(' · ')],
			['Abilities', 'abilities', () => this.d.abilities.filter(a => a.name.trim()).map(a => a.name.trim()).join(', ') || 'None'],
		]);
		reviewNotesView(panel, ui, () => reviewNotes(this.d).map(n => ({ ...n, fixes: n.fixes.map(f => ({ label: f.label, run: () => this.fix(f.fix, ui) })) })));
	}

	private fix(f: ReviewFix, ui: BuilderUI): void {
		if (f.kind === 'go') {
			if (f.open === 'saves') this.savesOpen = true;
			if (f.field) ui.nudge(f.step, f.field); else ui.go(f.step);
			ui.changed();
			return;
		}
		if (f.kind === 'roll-ability') { this.rollAbility(); ui.rebuild(); return; }
		const structural = f.kind === 'add-attack' || f.kind === 'book-numbers' || f.kind === 'book-dice';
		this.d = applyFix(this.d, f);
		if (structural) ui.rebuild(); else ui.changed();
	}

	// ------------------------------------------------------------------------
	// Side

	renderCheck(el: HTMLElement, ui: BuilderUI): void {
		const c = levelCheck(this.d);
		if (!c) {
			el.createDiv({ cls: 'eb-check-title', text: 'Minions' });
			el.createDiv({ cls: 'eb-check-text', text: `Two a hero count as one level ${this.d.partyLevel} monster; three or four, as two.` });
			return;
		}
		const head = el.createDiv({ cls: 'eb-check-head' });
		const big = head.createDiv({ cls: 'eb-check-level' });
		big.createSpan({ cls: 'eb-check-kicker', text: 'Plays like' });
		big.createSpan({ cls: 'eb-check-value', text: `level ${levelLabel(c.guess.level)}` });
		const tone = c.verdict === 0 ? 'ok' : c.verdict > 0 ? 'high' : 'low';
		pill(head, c.verdict === 0 ? `Right for level ${levelLabel(this.d.level)}` : c.verdict > 0 ? `Tougher than level ${levelLabel(this.d.level)}` : `Weaker than level ${levelLabel(this.d.level)}`, `eb-verdict tone-${tone}`);
		const solo = this.d.role === 'solo';
		meter(el, solo ? 'HP per hero' : 'HP', c.hp.have, c.hp.want);
		meter(el, solo ? 'Damage per action' : 'Damage per attack', c.damage.have, c.damage.want);
		if (c.guess.low !== c.guess.high) el.createDiv({ cls: 'eb-check-text', text: `HP says level ${levelLabel(c.guess.byHp ?? c.guess.level)}, damage says ${levelLabel(c.guess.byDamage ?? c.guess.level)}.` });
		if (c.verdict !== 0 && !this.d.autoLevel) {
			const to = settledLevel(this.d);
			if (to !== this.d.level) {
				const fix = el.createEl('button', { cls: 'eb-check-fix' });
				fix.createSpan({ cls: 'eb-t', text: `Make it level ${levelLabel(to)}` });
				fix.addEventListener('click', () => {
					// The typed numbers stay; the level moves to what they say.
					this.d.level = to;
					ui.changed();
				});
			}
		}
	}

	renderPreview(el: HTMLElement, ui: BuilderUI): void {
		const m = toMonster(this.d);
		nimble().renderStatblock(el, m, ui.sourcePath, 'inline', undefined, { lore: false });
	}

	checkChip(): { text: string; tone: 'ok' | 'high' | 'low' | 'none' } {
		const c = levelCheck(this.d);
		if (!c) return { text: '', tone: 'none' };
		return { text: c.verdict === 0 ? `Level ${levelLabel(c.guess.level)} ✓` : `Plays like ${levelLabel(c.guess.level)}`, tone: c.verdict === 0 ? 'ok' : c.verdict > 0 ? 'high' : 'low' };
	}

	missing(): string | null { return missing(this.d); }

	output(): Output {
		const m = toMonster(this.d);
		return {
			lang: 'nimble',
			body: toSource(this.d),
			name: m.name,
			frontmatter: { nimble: 'monster', level: m.level ? String(m.level) : '', role: this.d.role === 'solo' ? 'solo' : this.d.role },
			folder: this.folder,
		};
	}
}

export function registerMonsterBuilder(): void {
	registerKind('monster', (plugin, seed) => new MonsterBuilder(plugin, seed));
}
