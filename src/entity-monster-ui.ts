// The monster builder's steps: Start (everything a quick build needs),
// Toughness, Attacks, Abilities, Story, Review. The numbers come from
// entity-monster.ts; this file only lays them out.

import { setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { ArmorType, NimbleMonster } from './types';
import { searchMonsters, describeMonster } from './suggest';
import { diceAverage, DIE_SIZES, FLAVOR_ABILITIES, levelLabel, LEVELS, minionDie, parseDiceParts, formatDiceParts, stepLevel, ARMOR_FROM, LEGENDARY_ARMOR_FROM } from './builder-math';
import {
	AttackDraft, attackBody, attackName, attackTarget, autoLevel, BuildRole, draftFromMonster, effectiveHp, expected, levelCheck,
	MonsterDraft, MOVE_MODES, missing, newMonsterDraft, SAVE_STATS, setRole, settledLevel, suggestedBloodied, suggestedLastStand, toMonster, toSource, withDice,
} from './entity-monster';
import {
	BuilderUI, bookTag, field, grid, homeFolder, iconButton, KindBuilder, meter, numberInput, Output, registerKind, section, segmented, StepDef,
	textArea, textButton, textInput,
} from './entity-builder';

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
const DIE_THEME: Record<number, string> = { 4: 'Undead: slow, big bonus damage', 6: 'Goblins: chaotic, likely to miss or crit', 8: 'Humans: balanced and reliable', 10: 'Beasts: stronger than humans', 12: 'Giants: superhumanly strong', 20: 'The mightiest creatures' };

function partyOf(plugin: NimbleStatblocksPlugin): { level: number; size: number } {
	const party = plugin.settings.party ?? [];
	const level = party.length ? Math.round(party.reduce((a, p) => a + (p.level || 1), 0) / party.length) : 1;
	return { level: Math.max(1, level), size: plugin.encounters.partySize() };
}

class MonsterBuilder implements KindBuilder {
	kind = 'monster' as const;
	noun = 'monster';
	icon = 'skull';
	d: MonsterDraft;

	constructor(private plugin: NimbleStatblocksPlugin, seed: unknown) {
		const party = partyOf(plugin);
		const s = seed as { monster?: NimbleMonster; copyName?: boolean } | undefined;
		this.d = s?.monster ? draftFromMonster(s.monster, party, s.copyName ?? false) : newMonsterDraft(party);
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

	// ------------------------------------------------------------------------
	// Start

	private start(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		section(panel, 'What are you making?', 'Pick a level and Create for a monster ready to run. Everything you leave blank follows the GM Guide\'s numbers.');
		const top = grid(panel, 2);
		const name = field(top, 'Name');
		textInput(name.control, { value: d.name, placeholder: d.template ? `${d.template.name} variant` : 'Cave bear', words: true, label: 'Name', onInput: v => { d.name = v; ui.changed(); } });

		const from = field(top, 'Start from', { help: d.template ? undefined : 'Copy a monster and change what you like. Its numbers move with the level.' });
		this.templatePicker(from.control, ui);

		const mid = grid(panel, 2);
		const role = field(mid, 'Role');
		segmented<BuildRole>(role.control, [
			{ value: 'regular', label: 'Regular', icon: 'skull', title: 'Fights in a group, 1–3 a hero' },
			{ value: 'solo', label: 'Solo', icon: 'crown', title: 'A legendary boss: acts after each hero\'s turn' },
			{ value: 'minion', label: 'Minion', icon: 'users', title: 'Dies to any damage; comes in crowds' },
		], () => d.role, v => { if (v !== d.role) { this.d = setRole(d, v); ui.rebuild(); } }, { label: 'Role', ui });
		const roleHelp = role.help;
		roleHelp.removeClass('is-empty');
		ui.live(() => roleHelp.setText(this.d.role === 'solo' ? 'Acts after each hero\'s turn. HP is per hero, with Bloodied and Last Stand phases.' : this.d.role === 'minion' ? 'No HP: any damage defeats one. Two a hero count as one monster of the party\'s level.' : 'A standard monster. A Hard fight is monster levels adding up to the party\'s.'));

		const lvl = field(mid, d.role === 'minion' ? 'Party level' : 'Level');
		if (d.role === 'minion') {
			numberInput(lvl.control, { get: () => this.d.partyLevel, placeholder: () => '1', set: v => { this.d.partyLevel = v ?? 1; }, min: 1, max: 30, label: 'party level', ui });
			lvl.help.removeClass('is-empty');
			ui.live(() => lvl.help.setText(`Minions use the party's level. At level ${this.d.partyLevel} the book's minion die is d${minionDie(this.d.partyLevel)}.`));
		} else this.levelControl(lvl, ui);

		const bottom = grid(panel, 2);
		const size = field(bottom, 'Size');
		segmented(size.control, SIZES.map(s => ({ value: s, label: s })), () => this.d.size, v => { this.d.size = v; }, { label: 'Size', ui, cls: 'is-wrap is-compact' });
		const type = field(bottom, 'Type', { help: 'Shown above the name: Beast, Undead, Angry Bugbear…' });
		textInput(type.control, { value: d.type, placeholder: 'Beast', words: true, label: 'Type', onInput: v => { this.d.type = v; ui.changed(); } });
	}

	private levelControl(f: ReturnType<typeof field>, ui: BuilderUI): void {
		const wrap = f.control.createDiv({ cls: 'eb-level' });
		const down = iconButton(wrap, 'minus', 'Lower level', () => { this.d.autoLevel = false; this.d.level = this.d.role === 'solo' ? Math.max(1, this.d.level - 1) : stepLevel(this.d.level, -1); ui.changed(); }, 'eb-num-btn');
		const value = wrap.createDiv({ cls: 'eb-level-value', attr: { 'aria-live': 'polite' } });
		const up = iconButton(wrap, 'plus', 'Higher level', () => { this.d.autoLevel = false; this.d.level = this.d.role === 'solo' ? this.d.level + 1 : stepLevel(this.d.level, 1); ui.changed(); }, 'eb-num-btn');
		const auto = wrap.createEl('button', { cls: 'eb-auto', text: 'Auto', attr: { 'aria-pressed': 'false', title: 'Follow the HP and damage you type' } });
		auto.addEventListener('click', () => { this.d.autoLevel = !this.d.autoLevel; this.settle(); ui.changed(); });
		f.help.removeClass('is-empty');
		ui.live(() => {
			this.settle();
			value.setText(levelLabel(this.d.level));
			auto.toggleClass('is-active', this.d.autoLevel);
			auto.setAttr('aria-pressed', String(this.d.autoLevel));
			down.disabled = this.d.role === 'solo' ? this.d.level <= 1 : this.d.level <= LEVELS[0];
			up.disabled = this.d.level >= 30;
			const p = this.d.partyLevel;
			f.help.setText(this.d.autoLevel ? 'Auto: the level follows the HP and damage you type.'
				: this.d.role === 'solo' ? `A solo of the party's level (${p}) is a full fight on its own.` : this.d.level < 1 ? `${levelLabel(this.d.level)}: ${Math.round(1 / this.d.level)} of these are about one level 1 hero.` : `Level ${levelLabel(this.d.level)}. Your party is level ${p}.`);
		});
	}

	private templatePicker(parent: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		if (d.template) {
			const pill = parent.createDiv({ cls: 'eb-template' });
			setIcon(pill.createSpan({ cls: 'eb-template-icon' }), 'copy');
			pill.createSpan({ cls: 'eb-template-name', text: d.template.name });
			pill.createSpan({ cls: 'eb-template-meta', text: `level ${levelLabel(d.template.level)}` });
			iconButton(pill, 'x', 'Start blank instead', () => {
				const party = { level: d.partyLevel, size: d.partySize };
				this.d = { ...newMonsterDraft(party, d.role), name: d.name };
				ui.rebuild();
			});
			return;
		}
		const box = parent.createDiv({ cls: 'eb-search' });
		const input = textInput(box, { placeholder: 'Blank, or search: goblin, ogre…', label: 'Copy a monster', code: true, onInput: () => draw() });
		input.setAttr('role', 'combobox');
		input.setAttr('aria-expanded', 'false');
		const list = box.createDiv({ cls: 'eb-search-list', attr: { role: 'listbox' } });
		let rows: HTMLElement[] = [];
		let sel = 0;
		const pick = (m: NimbleMonster) => {
			const party = { level: this.d.partyLevel, size: this.d.partySize };
			const name = this.d.name;
			this.d = draftFromMonster(m, party, false);
			this.d.name = name;
			ui.rebuild();
		};
		const draw = () => {
			list.empty();
			const q = input.value.trim();
			const hits = q ? searchMonsters(this.plugin.index.all(ui.sourcePath), q, 6) : [];
			rows = hits.map((e, i) => {
				const r = list.createDiv({ cls: `eb-search-row${i === sel ? ' is-selected' : ''}`, attr: { role: 'option' } });
				r.createSpan({ cls: 'eb-search-name', text: e.name });
				r.createSpan({ cls: 'eb-search-meta', text: describeMonster(e) });
				r.addEventListener('mousedown', (ev) => { ev.preventDefault(); pick(e.monster); });
				return r;
			});
			list.toggleClass('is-open', hits.length > 0);
			input.setAttr('aria-expanded', String(hits.length > 0));
			if (!hits.length) sel = 0;
			(input as HTMLInputElement & { hits?: typeof hits }).hits = hits;
		};
		input.addEventListener('keydown', (e) => {
			const hits = (input as HTMLInputElement & { hits?: { monster: NimbleMonster }[] }).hits ?? [];
			if (!hits.length) return;
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault(); e.stopPropagation();
				sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
				rows.forEach((r, i) => r.toggleClass('is-selected', i === sel));
			} else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); pick(hits[sel].monster); }
			else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.value = ''; draw(); }
		}, true);
		input.addEventListener('blur', () => window.setTimeout(() => { list.removeClass('is-open'); }, 120));
		input.addEventListener('focus', () => draw());
	}

	// ------------------------------------------------------------------------
	// Toughness

	private tough(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		if (d.role === 'minion') {
			section(panel, 'Defenses', 'Minions have no HP: any damage defeats one. With the optional overkill rule, leftover damage carries over, a minion soaking up its die size.');
		} else section(panel, 'Toughness', d.role === 'solo' ? 'HP is per hero, so the fight scales with the party.' : 'Leave HP blank for the book\'s number at this level.');

		const top = grid(panel, 2);
		if (d.role !== 'minion') {
			const hp = field(top, d.role === 'solo' ? 'HP per hero' : 'HP');
			numberInput(hp.control, { get: () => this.d.hp, placeholder: () => String(effectiveHp({ ...this.d, hp: undefined })), set: v => { this.d.hp = v; this.settle(); }, min: 1, label: 'HP', ui });
			bookTag(hp.aside, { text: () => this.d.hp === undefined ? null : `Book: ${d.role === 'solo' ? expected(this.d).perHero : expected(this.d).hp}`, use: () => { this.d.hp = undefined; this.settle(); }, ui });
			hp.help.removeClass('is-empty');
			ui.live(() => {
				const e = expected(this.d);
				hp.help.setText(this.d.role === 'solo' ? `${effectiveHp(this.d) * this.d.partySize} HP for ${this.d.partySize} heroes. Last Stand: ${e.lastStandPerHero} more per hero.` : this.d.template && this.d.hp === undefined ? `Re-levelled from ${this.d.template.name}.` : 'Blank: the book\'s HP for this level and armor.');
			});
		} else {
			const die = field(top, 'Minion die', { help: 'Each minion attacks with one die: no crits, misses on a 1, no advantage.' });
			segmented<number>(die.control, [4, 6, 8, 10, 12, 20].map(n => ({ value: n, label: `d${n}` })), () => this.d.minionDie ?? minionDie(this.d.partyLevel), v => { this.d.minionDie = v; }, { label: 'Minion die', ui, cls: 'is-compact' });
		}

		const armor = field(top, 'Armor');
		segmented<ArmorType>(armor.control, [
			{ value: 'none', label: 'None' }, { value: 'medium', label: 'Medium', title: '−10 damage from each attack (crits ignore it)' }, { value: 'heavy', label: 'Heavy', title: '−20 damage from each attack (crits ignore it)' },
		], () => this.d.armor, v => { this.d.armor = v; this.settle(); }, { label: 'Armor', ui });
		armor.help.removeClass('is-empty');
		ui.live(() => {
			const e = expected(this.d);
			const from = this.d.role === 'solo' ? LEGENDARY_ARMOR_FROM : ARMOR_FROM;
			armor.help.toggleClass('is-warn', e.armorEarly);
			armor.help.setText(this.d.armor === 'none' ? 'Armor means less HP: no harder, just different.'
				: e.armorEarly ? `The book holds ${this.d.armor} armor back until level ${from[this.d.armor]}: it can be a slog for heroes this early.`
					: `Takes ${this.d.armor === 'medium' ? 10 : 20} less damage from each attack; crits ignore armor.`);
		});

		const move = grid(panel, 2);
		const speed = field(move, 'Speed', { help: '6 is normal and isn\'t shown on the stat block.' });
		numberInput(speed.control, { get: () => this.d.speed === 6 ? undefined : this.d.speed, placeholder: () => '6', set: v => { this.d.speed = v ?? 6; }, min: 0, max: 60, label: 'speed', ui });
		const modes = field(move, 'Also moves by');
		const chips = modes.control.createDiv({ cls: 'eb-modes' });
		for (const m of MOVE_MODES) {
			const chip = chips.createDiv({ cls: 'eb-mode' });
			const toggle = chip.createEl('button', { cls: 'eb-mode-toggle', text: m[0].toUpperCase() + m.slice(1), attr: { 'aria-pressed': 'false' } });
			const num = chip.createEl('input', { cls: 'eb-mode-num', attr: { type: 'text', inputmode: 'numeric', 'aria-label': `${m} speed` } });
			toggle.addEventListener('click', () => {
				if (this.d.moves[m] === undefined) this.d.moves[m] = this.d.speed; else delete this.d.moves[m];
				ui.changed();
			});
			num.addEventListener('input', () => { const v = parseInt(num.value.replace(/\D/g, ''), 10); if (!Number.isNaN(v)) { this.d.moves[m] = v; ui.changed(); } });
			ui.live(() => {
				const on = this.d.moves[m] !== undefined;
				chip.toggleClass('is-on', on);
				toggle.setAttr('aria-pressed', String(on));
				if (activeDocument.activeElement !== num) num.value = on ? String(this.d.moves[m]) : '';
			});
		}

		const saves = field(panel, 'Saves', { wide: true, help: d.role === 'solo' ? 'Legendary monsters usually get one or two advantaged saves, sometimes one disadvantaged.' : 'Most monsters roll a plain d20. Mark only what stands out.' });
		const sgrid = saves.control.createDiv({ cls: 'eb-saves' });
		for (const s of SAVE_STATS) {
			const cell = sgrid.createDiv({ cls: 'eb-save' });
			cell.createSpan({ cls: 'eb-save-stat', text: s });
			segmented<number>(cell, [{ value: -1, label: '−', title: 'Disadvantage' }, { value: 0, label: '0', title: 'Plain d20' }, { value: 1, label: '+', title: 'Advantage' }, { value: 2, label: '++', title: 'Advantage 2' }],
				() => this.d.saves[s] ?? 0, v => { if (v) this.d.saves[s] = v; else delete this.d.saves[s]; }, { label: `${s} save`, ui, cls: 'is-compact is-tight' });
		}

		const defs = grid(panel, 3);
		for (const [key, label, ph] of [['resistances', 'Resists (−10 damage)', 'fire, cold'], ['immunities', 'Immune to', 'poison'], ['vulnerabilities', 'Vulnerable (+10)', 'radiant']] as const) {
			const f = field(defs, label);
			textInput(f.control, { value: this.d[key].join(', '), placeholder: ph, label, onInput: v => { this.d[key] = v.split(/[,;]/).map(x => x.trim()).filter(Boolean); ui.changed(); } });
		}
	}

	// ------------------------------------------------------------------------
	// Attacks

	private attacks(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		section(panel, 'Attacks', d.role === 'solo' ? 'After each hero\'s turn it picks one: a small attack that moves or sets up, or a big one when it\'s in position.'
			: d.role === 'minion' ? 'One die each. Minions attacking the same hero roll together as one attack.' : 'Each attack starts at the book\'s damage for the level. Change the dice or the words.');

		if (d.role === 'regular') {
			const g = grid(panel, 2);
			const per = field(g, 'Attacks a turn', { help: 'More attacks hit for less each.' });
			segmented<number>(per.control, [1, 2, 3].map(n => ({ value: n, label: String(n) })), () => this.d.attacksPerTurn, v => { this.d.attacksPerTurn = v; this.settle(); }, { label: 'Attacks a turn', ui });
			const die = field(g, 'Die');
			segmented<number>(die.control, DIE_SIZES.map(n => ({ value: n, label: `d${n}`, title: DIE_THEME[n] })), () => this.d.die, v => { this.retypeDice(v); this.d.die = v; }, { label: 'Damage die', ui, cls: 'is-compact' });
			die.help.removeClass('is-empty');
			ui.live(() => die.help.setText(DIE_THEME[this.d.die] ?? ''));
		} else if (d.role === 'solo') {
			const f = field(panel, 'Before the attacks', { wide: true });
			textInput(f.control, { value: d.actionText ?? '', placeholder: 'After each hero\'s turn, choose one:', label: 'Line before the attacks', onInput: v => { this.d.actionText = v; ui.changed(); } });
		}

		const list = panel.createDiv({ cls: 'eb-attacks' });
		d.attacks.forEach((a, i) => this.attackCard(list, a, i, ui));
		if (d.role !== 'minion') {
			const add = panel.createDiv({ cls: 'eb-add-row' });
			textButton(add, 'plus', d.role === 'solo' ? 'Add an option' : 'Add an attack', () => {
				this.d.attacks.push({ name: '', size: this.d.role === 'solo' ? 'big' : undefined });
				ui.rebuild();
				window.setTimeout(() => panel.querySelectorAll<HTMLInputElement>('.eb-attack-name').item(this.d.attacks.length - 1)?.focus(), 20);
			});
		}
	}

	/** Changing the die rewrites dice the GM hasn't touched, and swaps the die in ones they have. */
	private retypeDice(sides: number): void {
		for (const a of this.d.attacks) {
			if (a.body === undefined) continue;
			const p = parseDiceParts(a.body);
			if (!p || p.sides === sides) continue;
			const avg = diceAverage(a.body) ?? 0;
			a.body = withDice(a.body, formatDiceParts({ count: p.count, sides, bonus: Math.max(0, Math.round(avg - p.count * (sides + 1) / 2)) }));
		}
	}

	private attackCard(list: HTMLElement, a: AttackDraft, i: number, ui: BuilderUI): void {
		const d = this.d;
		const card = list.createDiv({ cls: 'eb-attack' });
		const head = card.createDiv({ cls: 'eb-attack-head' });
		if (d.role === 'solo') {
			segmented<'small' | 'big'>(head, [{ value: 'small', label: 'Small', title: 'Moves or sets up, smaller hit' }, { value: 'big', label: 'Big', title: 'The big hit, when it\'s in position' }],
				() => a.size ?? 'big', v => { a.size = v; }, { label: 'Attack size', ui, cls: 'is-compact is-tight' });
		}
		const name = textInput(head, { value: a.name, placeholder: attackName({ ...d, attacksPerTurn: 1 }, { name: '' }, i), words: true, label: 'Attack name', cls: 'eb-attack-name', onInput: v => { a.name = v; ui.changed(); } });
		name.addClass('eb-attack-name');
		if (d.attacks.length > 1) iconButton(head, 'trash-2', 'Remove this attack', () => { this.d.attacks.splice(i, 1); ui.rebuild(); }, 'eb-attack-remove');

		const body = textInput(card, { value: '', label: 'What it does', code: false, cls: 'eb-attack-body', onInput: v => { a.body = v; this.settle(); ui.changed(); } });
		body.placeholder = 'Dice and what else it does';

		const pad = card.createDiv({ cls: 'eb-dice eb-noswipe' });
		const parts = () => parseDiceParts(attackBody(this.d, a)) ?? { count: 1, sides: this.d.role === 'minion' ? this.d.minionDie ?? minionDie(this.d.partyLevel) : this.d.die, bonus: 0 };
		const setParts = (p: { count: number; sides: number; bonus: number }) => {
			a.body = withDice(attackBody(this.d, a), formatDiceParts(p).replace(/^d(\d+)$/, '1d$1'));
			this.settle();
			ui.changed();
		};
		const step = (label: string, icon: string, fn: () => void) => iconButton(pad, icon, label, fn, 'eb-dice-btn');
		step('One die fewer', 'minus', () => { const p = parts(); if (p.count > 1) setParts({ ...p, count: p.count - 1 }); });
		const diceText = pad.createSpan({ cls: 'eb-dice-text' });
		step('One die more', 'plus', () => { const p = parts(); setParts({ ...p, count: Math.min(20, p.count + 1) }); });
		pad.createSpan({ cls: 'eb-dice-sep', text: 'bonus' });
		step('Less bonus', 'minus', () => { const p = parts(); setParts({ ...p, bonus: Math.max(0, p.bonus - (p.bonus > 20 ? 5 : 1)) }); });
		const bonusText = pad.createSpan({ cls: 'eb-dice-text' });
		step('More bonus', 'plus', () => { const p = parts(); setParts({ ...p, bonus: p.bonus + (p.bonus >= 20 ? 5 : 1) }); });
		const avg = pad.createSpan({ cls: 'eb-dice-avg' });
		const reset = textButton(pad, 'rotate-ccw', 'Book dice', () => { a.body = undefined; this.settle(); ui.changed(); }, 'eb-dice-reset');

		ui.live(() => {
			const text = attackBody(this.d, a);
			if (activeDocument.activeElement !== body) body.value = text;
			const p = parseDiceParts(text);
			diceText.setText(p ? `${p.count}d${p.sides}` : '—');
			bonusText.setText(p ? `+${Math.max(0, p.bonus)}` : '—');
			const have = diceAverage(text);
			const want = attackTarget(this.d, a);
			avg.empty();
			if (have !== null) {
				avg.createSpan({ cls: 'eb-dice-avg-have', text: `avg ${Math.round(have * 10) / 10}` });
				const off = want ? have / want : 1;
				avg.createSpan({ cls: `eb-dice-avg-want ${off > 1.25 ? 'is-high' : off < 0.75 ? 'is-low' : 'is-ok'}`, text: `book ${Math.round(want)}` });
			}
			reset.toggleClass('is-hidden', a.body === undefined || (a.base !== undefined && a.body === undefined));
		});
	}

	// ------------------------------------------------------------------------
	// Abilities, Bloodied, Last Stand

	private abilities(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		section(panel, d.role === 'solo' ? 'Abilities and phases' : 'Abilities', 'One simple ability makes a monster feel like itself. The GM Guide\'s numbers assume one; without it, give the monster a level\'s more HP or damage. Roll for one from the book\'s table, or write your own.');
		const list = panel.createDiv({ cls: 'eb-abilities' });
		d.abilities.forEach((ab, i) => {
			const row = list.createDiv({ cls: 'eb-ability' });
			textInput(row, { value: ab.name, placeholder: 'Pack Tactics', words: true, label: 'Ability name', cls: 'eb-ability-name', onInput: v => { ab.name = v; ui.changed(); } });
			textInput(row, { value: ab.text, placeholder: 'Advantage when an ally is adjacent to the target.', label: 'What it does', cls: 'eb-ability-text', onInput: v => { ab.text = v; ui.changed(); } });
			iconButton(row, 'trash-2', 'Remove this ability', () => { this.d.abilities.splice(i, 1); ui.rebuild(); });
		});
		const add = panel.createDiv({ cls: 'eb-add-row' });
		textButton(add, 'plus', 'Add an ability', () => {
			this.d.abilities.push({ name: '', text: '' });
			ui.rebuild();
			window.setTimeout(() => panel.querySelectorAll<HTMLInputElement>('.eb-ability-name').item(this.d.abilities.length - 1)?.focus(), 20);
		});
		textButton(add, 'dices', 'Roll an ability', () => {
			const taken = new Set(this.d.abilities.map(a => a.name));
			const pool = FLAVOR_ABILITIES.flat().filter(a => !taken.has(a.name));
			const pick = pool[Math.floor(Math.random() * pool.length)];
			if (pick) this.d.abilities.push({ ...pick });
			ui.rebuild();
		});

		if (d.role !== 'solo') {
			const f = field(panel, 'Bloodied (optional)', { wide: true, help: 'Some tough regular monsters change at half HP too.' });
			textInput(f.control, { value: d.bloodied ?? '', placeholder: 'At half HP it goes berserk: +2 damage.', label: 'Bloodied', onInput: v => { this.d.bloodied = v; ui.changed(); } });
			return;
		}
		const phases = grid(panel, 2);
		const bl = field(phases, 'Bloodied');
		const blText = textArea(bl.control, { value: d.bloodied ?? '', placeholder: suggestedBloodied(d), label: 'Bloodied', rows: 3, onInput: v => { this.d.bloodied = v; ui.changed(); } });
		ui.live(() => { blText.placeholder = suggestedBloodied(this.d); });
		bl.help.removeClass('is-empty');
		ui.live(() => bl.help.setText(`At half HP (${Math.round(effectiveHp(this.d) * this.d.partySize / 2)} for ${this.d.partySize} heroes) it gets more dangerous. Left blank: the placeholder.`));
		const ls = field(phases, 'Last Stand');
		const lsText = textArea(ls.control, { value: d.lastStand ?? '', placeholder: suggestedLastStand(d), label: 'Last Stand', rows: 3, onInput: v => { this.d.lastStand = v; ui.changed(); } });
		ui.live(() => { lsText.placeholder = suggestedLastStand(this.d); });
		ls.help.removeClass('is-empty');
		ui.live(() => ls.help.setText(`At 0 HP it's dying, and fights on until ${expected(this.d).lastStandPerHero} more damage per hero. Write "regains N HP per hero" and the tracker applies it.`));
	}

	// ------------------------------------------------------------------------
	// Story

	private story(panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		section(panel, 'Story and tactics', 'All optional. Easier and Harder are tactics to tune the fight at the table.');
		const desc = field(panel, 'Description', { wide: true });
		textArea(desc.control, { value: d.description ?? '', placeholder: 'What the heroes see, hear and smell.', label: 'Description', rows: 2, onInput: v => { this.d.description = v; ui.changed(); } });
		const t = grid(panel, 2);
		const easy = field(t, 'Easier', { help: 'Subtly sub-optimal: spread damage, waste a turn.' });
		textInput(easy.control, { value: d.easier ?? '', placeholder: 'Spread its attacks around.', label: 'Easier', onInput: v => { this.d.easier = v; ui.changed(); } });
		const hard = field(t, 'Harder', { help: 'Its best play: focus fire, move every turn.' });
		textInput(hard.control, { value: d.harder ?? '', placeholder: 'Focus the weakest hero.', label: 'Harder', onInput: v => { this.d.harder = v; ui.changed(); } });
		const g = grid(panel, 2);
		const group = field(g, 'Group', { help: 'Its family in the compendium: Goblins, Bears…' });
		textInput(group.control, { value: d.group ?? '', placeholder: 'Bears', words: true, label: 'Group', onInput: v => { this.d.group = v; ui.changed(); } });
		const hab = field(g, 'Habitat');
		textInput(hab.control, { value: d.habitat ?? '', placeholder: 'Forest, caves', label: 'Habitat', onInput: v => { this.d.habitat = v; ui.changed(); } });
	}

	// ------------------------------------------------------------------------
	// Review

	private review(panel: HTMLElement, ui: BuilderUI): void {
		section(panel, 'Review', ui.phone ? 'Tap Preview to see the stat block.' : 'The stat block on the right is what you\'ll get.');
		const rows = panel.createDiv({ cls: 'eb-review' });
		const line = (label: string, step: string, text: () => string) => {
			const r = rows.createDiv({ cls: 'eb-review-row' });
			r.createSpan({ cls: 'eb-review-label', text: label });
			const v = r.createSpan({ cls: 'eb-review-value' });
			const edit = r.createEl('button', { cls: 'eb-review-edit', text: 'Edit' });
			edit.addEventListener('click', () => ui.go(step));
			ui.live(() => v.setText(text()));
		};
		line('Name', 'start', () => this.d.name.trim() || 'Not named yet');
		line('Role and level', 'start', () => this.d.role === 'minion' ? `Minion (party level ${this.d.partyLevel})` : `${this.d.role === 'solo' ? 'Solo' : 'Regular'}, level ${levelLabel(this.d.level)}`);
		line('Toughness', 'tough', () => this.d.role === 'minion' ? `d${this.d.minionDie ?? minionDie(this.d.partyLevel)} minion` : `${effectiveHp(this.d)} HP${this.d.role === 'solo' ? ' per hero' : ''}, ${this.d.armor === 'none' ? 'no armor' : `${this.d.armor} armor`}`);
		line('Attacks', 'attacks', () => toMonster(this.d).attacks?.map(a => a.raw.replace(/\*\*/g, '')).join(' · ') ?? '');
		line('Abilities', 'abilities', () => this.d.abilities.filter(a => a.name.trim()).map(a => a.name).join(', ') || 'None');
		const where = field(panel, 'Saved in', { wide: true });
		const folder = homeFolder(this.plugin, 'Monsters', 'Bestiary');
		this.folder ??= folder;
		textInput(where.control, { value: this.folder, placeholder: 'Bestiary', code: true, label: 'Folder', onInput: v => { this.folder = v.trim(); } });
		where.help.removeClass('is-empty');
		where.help.setText('A new note with the stat block. It joins the compendium and works with nimble: references right away.');
	}

	private folder?: string;

	// ------------------------------------------------------------------------
	// Side

	renderCheck(el: HTMLElement, ui: BuilderUI): void {
		const c = levelCheck(this.d);
		if (!c) {
			el.createDiv({ cls: 'eb-check-title', text: 'Minions' });
			el.createDiv({ cls: 'eb-check-text', text: `Two minions a hero count as one level ${this.d.partyLevel} monster; three or four, as two.` });
			return;
		}
		const head = el.createDiv({ cls: 'eb-check-head' });
		const big = head.createDiv({ cls: 'eb-check-level' });
		big.createSpan({ cls: 'eb-check-kicker', text: 'Plays like' });
		big.createSpan({ cls: 'eb-check-value', text: `level ${levelLabel(c.guess.level)}` });
		const tone = c.verdict === 0 ? 'ok' : c.verdict > 0 ? 'high' : 'low';
		head.createDiv({ cls: `eb-verdict tone-${tone}`, text: c.verdict === 0 ? `Right for level ${levelLabel(this.d.level)}` : c.verdict > 0 ? `Tougher than level ${levelLabel(this.d.level)}` : `Weaker than level ${levelLabel(this.d.level)}` });
		const solo = this.d.role === 'solo';
		meter(el, solo ? 'HP per hero' : 'HP', c.hp.have, c.hp.want);
		meter(el, solo ? 'Damage per action' : 'Damage per attack', c.damage.have, c.damage.want);
		if (c.guess.low !== c.guess.high) el.createDiv({ cls: 'eb-check-text', text: `HP says level ${levelLabel(c.guess.byHp ?? c.guess.level)}, damage says ${levelLabel(c.guess.byDamage ?? c.guess.level)}.` });
		if (c.verdict !== 0 && !this.d.autoLevel) {
			const to = settledLevel(this.d);
			if (to !== this.d.level) {
				const fix = el.createEl('button', { cls: 'eb-check-fix', text: `Make it level ${levelLabel(to)}` });
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
		this.plugin.renderStatblock(el, m, ui.sourcePath, 'inline', undefined, { lore: false });
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
			folder: this.folder ?? homeFolder(this.plugin, 'Monsters', 'Bestiary'),
		};
	}
}

export function registerMonsterBuilder(): void {
	registerKind('monster', (plugin, seed) => new MonsterBuilder(plugin, seed));
}
