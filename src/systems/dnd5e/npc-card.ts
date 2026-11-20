// What 5e draws in an NPC's card (core's ```nimble-npc), for the GM only: a
// mini character sheet under the card (the design study's 70n). AC in its
// shield, HP as core's meter and keypad, Speed, Initiative, CR and PB; six
// small ability plaques with their saves; skills as rolls; senses and
// languages; then the actions with their to-hit or DC and their damage. Its
// numbers come from a linked stat block (the NPC's own changes marked), from
// the note, or nowhere (a story NPC gets one quiet line offering both). Players
// never see any of it.

import { FuzzySuggestModal, Notice, setTooltip, TFile } from 'obsidian';
import { pill } from '../../core/pill';
import { cluster } from '../../core/cluster';
import { evIcon } from '../../core/icons';
import { applyLook } from '../../core/look';
import { fmText } from '../../core/campaign-model';
import type { NoteCardContext } from '../../core/note-kinds';
import { markTerm, termContext, TermContext } from '../../core/rule-term-ui';
import { openHpPad, HP_PAD_MODES } from '../../core/tracker/hp-pad';
import { renderMeter, VitalsMemory } from '../../core/vitals/meter';
import { addMonster } from './combat';
import { npcActions5e, npcSenses5e, npcSheet5e, NpcSheet5e, npcSkills5e, setHpNow, statblockName } from './npc';
import { abilityMod, formatMod, initiativeOf, pbForCr } from './rules';
import type { Dnd5eRuntime } from './runtime';
import { acShield, corners, damageButton, profMark } from './sheet-parts';
import { renderText5e } from './cards';
import { ABILITIES, ABILITY_NAME, Dnd5eEntry } from './types';

const SHORT = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' } as const;
const d20 = (mod: number) => (mod === 0 ? '1d20' : `1d20${mod > 0 ? '+' : '-'}${Math.abs(mod)}`);
/** Folded blocks and opened actions, per note, kept across redraws. */
const foldedOf = new Map<string, boolean>();
const openedOf = new Map<string, Set<string>>();
const vitalsOf = new Map<string, VitalsMemory>();

export function drawNpc5e(rt: Dnd5eRuntime, el: HTMLElement, ctx: NoteCardContext): void {
	if (ctx.player) return;
	// The block goes under the whole card, full width, after its rows (styles.css places it last).
	const card = el.closest<HTMLElement>('.nimble-npc-card') ?? el;
	const section = card.createEl('section', { cls: 'dnd5e-npc-stats' });
	applyLook(section, 'dnd5e');
	new NpcStats5e(rt, section, ctx).render();
}

class NpcStats5e {
	private readonly name: string;
	private readonly terms: TermContext;

	constructor(private rt: Dnd5eRuntime, private el: HTMLElement, private ctx: NoteCardContext) {
		this.name = fmText(ctx.fm.title).trim() || ctx.path.replace(/^.*\//, '').replace(/\.md$/i, '');
		this.terms = termContext(rt.plugin, ctx.path);
	}

	private get file(): TFile | null { return this.rt.plugin.app.vault.getFileByPath(this.ctx.path); }

	private edit(fn: (fm: Record<string, unknown>) => void): void {
		const f = this.file;
		if (f) void this.rt.plugin.app.fileManager.processFrontMatter(f, fn);
	}

	private roll(expression: string, label: string): void {
		this.rt.plugin.rollDice(expression, `${this.name}: ${label}`, 'effect');
	}

	render(): void {
		const el = this.el;
		el.empty();
		const ref = statblockName(this.ctx.fm.statblock);
		const base = ref ? this.rt.get(ref, this.ctx.path) : undefined;
		const s = npcSheet5e(this.name, this.ctx.fm, base ? { name: ref, monster: base.monster } : undefined);
		el.className = 'dnd5e-npc-stats';
		applyLook(el, 'dnd5e');
		if (!s) { this.renderStory(ref); return; }
		const folded = foldedOf.get(this.ctx.path) ?? false;
		el.toggleClass('is-folded', folded);
		if (!folded) corners(el);
		this.renderHead(el.createDiv({ cls: 'dnd5e-npc-head' }), s, ref, folded);
		if (folded) { this.renderSummary(el.createDiv({ cls: 'dnd5e-npc-sum' }), s); return; }
		this.renderVitals(el.createDiv({ cls: 'dnd5e-npc-vitals ev-vitals' }), s);
		this.renderAbilities(el.createDiv({ cls: 'dnd5e-npc-abilities' }), s);
		this.renderLines(el.createDiv({ cls: 'dnd5e-npc-lines' }), s);
		this.renderActions(el, s);
	}

	/** No stats yet: one quiet line with the two ways to add them. */
	private renderStory(ref: string): void {
		this.el.addClass('is-empty');
		if (ref) this.el.createSpan({ cls: 'dnd5e-npc-empty', text: `No 5e stat block called ${ref}` });
		else pill(this.el, { icon: evIcon('statblock'), text: 'A story NPC: no stats', cls: 'dnd5e-npc-empty' });
		const g = cluster(this.el, { cls: 'dnd5e-npc-empty-acts' });
		const pick = pill(g, { tag: 'button', icon: evIcon('plus'), text: 'From a stat block', cls: 'dnd5e-npc-btn' });
		pick.addEventListener('click', (e) => {
			e.preventDefault();
			new StatblockPicker(this.rt, this.ctx.path, (entry) => this.edit(fm => { fm.statblock = entry.name; })).open();
		});
		if (ref) return;
		const own = pill(g, { tag: 'button', text: 'Type them in', cls: 'dnd5e-npc-btn' });
		own.addEventListener('click', (e) => {
			e.preventDefault();
			// A plain commoner to start from; the card shows the numbers as soon as they're there.
			this.edit(fm => {
				if (!fmText(fm.ac).trim()) fm.ac = 10;
				if (!fmText(fm.hp).trim()) fm.hp = '4 (1d8)';
				if (!fmText(fm.cr).trim()) fm.cr = '0';
				for (const a of ABILITIES) fm[a] ??= 10;
				fm.speed ??= '30 ft';
				fm.actions ??= ['Club: Melee Attack Roll: +2, reach 5 ft. Hit: 2 (1d4) Bludgeoning damage.'];
			});
		});
	}

	/** The fold, where the numbers come from, and Add to fight. */
	private renderHead(head: HTMLElement, s: NpcSheet5e, ref: string, folded: boolean): void {
		const fold = pill(head, { tag: 'button', icon: evIcon(folded ? 'chevron-right' : 'chevron-down'), text: 'Stats', cls: 'dnd5e-npc-fold', title: folded ? 'Show stats' : 'Fold stats', attr: { 'aria-expanded': String(!folded) } });
		fold.addEventListener('click', (e) => { e.preventDefault(); foldedOf.set(this.ctx.path, !folded); this.render(); });
		const src = head.createSpan({ cls: 'dnd5e-npc-src' });
		if (s.from) {
			src.createEl('small', { text: 'From' });
			src.appendChild(this.rt.createRef(ref, this.ctx.path));
			if (s.own.length) {
				const ch = src.createEl('small', { cls: 'dnd5e-npc-changed' });
				ch.createSpan({ cls: 'dnd5e-npc-own', attr: { 'aria-hidden': 'true' } });
				ch.appendText(`${s.own.map(o => o.label).join(' and ')} ${s.own.length > 1 ? 'are' : 'is'} ${this.pronoun()} own`);
			}
		} else src.createEl('small', { text: 'Typed in this note' });
		const acts = cluster(head, { end: true, cls: 'dnd5e-npc-head-acts' });
		const add = pill(acts, { tag: 'button', icon: evIcon('swords'), text: 'Add to fight', cls: 'dnd5e-npc-fight dnd5e-npc-btn', attr: { 'aria-label': `Add ${this.name} to the 5e tracker` } });
		add.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.rt.fights.change(f => {
				// The fight starts from what the note says is left.
				for (const c of addMonster(f, s.monster, 1, { sourceFile: this.ctx.path })) c.hp = s.hpNow;
			});
			void this.rt.openTracker();
		});
	}

	private pronoun(): string {
		const p = fmText(this.ctx.fm.pronouns).toLowerCase();
		return /\bshe\b|\bher\b/.test(p) ? 'her' : /\bhe\b|\bhim\b/.test(p) ? 'his' : 'their';
	}

	/** Folded: one line. */
	private renderSummary(sum: HTMLElement, s: NpcSheet5e): void {
		const m = s.monster;
		acShield(sum, m.ac, 26, `Armor Class ${m.ac}`);
		const fact = (label: string, value: string, more?: string) => {
			const f = sum.createSpan({ cls: 'dnd5e-npc-sum-fact' });
			f.createEl('small', { text: label });
			f.createEl('b', { text: value });
			if (more) f.createEl('em', { text: more });
		};
		fact('HP', String(s.hpNow), ` / ${m.hp}`);
		fact('CR', m.cr);
		fact('Init', formatMod(initiativeOf(m)));
		const n = npcActions5e(m).length;
		if (n) sum.createSpan({ cls: 'dnd5e-npc-sum-acts', text: `${n} action${n === 1 ? '' : 's'}` });
	}

	/** AC on its shield, HP as the shared meter, then Speed, Initiative, CR and PB as small tiles. */
	private renderVitals(vit: HTMLElement, s: NpcSheet5e): void {
		const m = s.monster;
		const acOwn = s.own.find(o => o.label === 'AC');
		const hpOwn = s.own.find(o => o.label === 'HP');
		const ac = vit.createDiv({ cls: 'dnd5e-npc-ac' });
		acShield(ac, m.ac, 44, `Armor Class ${m.ac}${m.acNote ? ` (${m.acNote})` : ''}${acOwn ? `; the ${s.from} block says ${acOwn.block}` : ''}`);
		if (acOwn) ac.createSpan({ cls: 'dnd5e-npc-own', attr: { 'aria-hidden': 'true' } });
		const hp = vit.createDiv({ cls: 'dnd5e-npc-hp' });
		const mem = vitalsOf.get(this.ctx.path) ?? new VitalsMemory();
		vitalsOf.set(this.ctx.path, mem);
		const meter = renderMeter(hp, {
			key: 'hp', cls: 'is-hp', icon: evIcon('heart'), label: 'Hit points', cur: s.hpNow, max: m.hp,
			bar: 'dnd5e-npc-hp-bar', minus: 'Take 1 damage', plus: 'Heal 1', calc: `Hit points ${s.hpNow} of ${m.hp}. Damage, heal or set`,
			minusOff: s.hpNow === 0, plusOff: s.hpNow >= m.hp,
			icons: { minus: evIcon('minus'), plus: evIcon('plus'), calc: evIcon('keypad') },
			onCalc: (a) => openHpPad(a, {
				id: `npc-${this.ctx.path}`, label: this.name, sub: `${s.hpNow}/${m.hp} HP · AC ${m.ac}`, crit: false,
				modes: { damage: HP_PAD_MODES.damage, heal: HP_PAD_MODES.heal, set: HP_PAD_MODES.set },
				mods: { vulnerable: 'Vulnerable ×2', resisted: 'Resisted ½' },
				preview: (mode, v, _c, mod) => {
					if (mode !== 'set' && v <= 0) return '';
					const n = mode === 'damage' ? (mod === 'vulnerable' ? v * 2 : mod === 'resisted' ? Math.floor(v / 2) : v) : v;
					const after = mode === 'set' ? n : mode === 'heal' ? s.hpNow + n : s.hpNow - n;
					return `→ ${Math.max(0, Math.min(m.hp, after))}/${m.hp}`;
				},
				apply: (cmd) => this.edit(fm => {
					const n = cmd.kind === 'damage' ? (cmd.type === 'vulnerable' ? cmd.amount * 2 : cmd.type === 'resisted' ? Math.floor(cmd.amount / 2) : cmd.amount) : cmd.amount;
					setHpNow(fm, s, cmd.kind === 'set' ? n : cmd.kind === 'heal' ? s.hpNow + n : cmd.kind === 'damage' ? s.hpNow - n : s.hpNow);
				}),
			}),
			taps: { floor: -s.hpNow, commit: (delta) => { if (!delta) { this.render(); return; } this.edit(fm => setHpNow(fm, s, s.hpNow + delta)); } },
		}, mem);
		meter.toggleClass('is-low', s.hpNow > 0 && s.hpNow <= m.hp / 2);
		const label = meter.querySelector<HTMLElement>('.ns-meter-label span:last-child');
		if (label) markTerm(label, this.terms, 'Hit Points');
		if (m.hpFormula || hpOwn) {
			const head = meter.querySelector<HTMLElement>('.ns-meter-head') ?? meter;
			const d = head.createSpan({ cls: 'dnd5e-npc-hpd', text: m.hpFormula ? `(${m.hpFormula.replace(/\s*([+\-−])\s*/g, ' $1 ')})` : '' });
			if (hpOwn) {
				const own = d.createSpan({ cls: 'dnd5e-npc-own' });
				setTooltip(own, `The ${s.from} block says ${hpOwn.block}`, { delay: 350 });
			}
		}
		const facts = vit.createDiv({ cls: 'dnd5e-npc-facts' });
		const fact = (label: string, value: string, rule?: string) => {
			const f = facts.createDiv({ cls: 'dnd5e-npc-fact' });
			const l = f.createEl('small', { text: label });
			if (rule) markTerm(l, this.terms, rule);
			f.createEl('b', { text: value });
			return f;
		};
		fact('Speed', (m.speed ?? '30 ft.').split(',')[0].replace(/\.$/, ''), 'Speed');
		const init = initiativeOf(m);
		const ib = facts.createEl('button', { cls: 'dnd5e-npc-fact is-roll', attr: { 'aria-label': `Roll initiative ${formatMod(init)}` } });
		ib.createEl('small', { text: 'Initiative' });
		ib.createEl('b', { text: formatMod(init) });
		ib.addEventListener('click', (e) => { e.preventDefault(); this.roll(d20(init), 'initiative'); });
		fact('CR', m.cr, m.edition === '2014' ? 'Challenge' : 'Challenge Rating');
		fact('PB', formatMod(m.pb ?? pbForCr(m.cr)), m.edition === '2014' ? 'Proficiency Bonus' : 'Proficiency');
	}

	/** Six small plaques: the modifier large (it rolls), the score small; the save under it, marked when proficient. */
	private renderAbilities(grid: HTMLElement, s: NpcSheet5e): void {
		const m = s.monster;
		ABILITIES.forEach((a, i) => {
			const score = m.abilities[i];
			const mod = abilityMod(score);
			const prof = m.saves?.[a] !== undefined;
			const save = m.saves?.[a] ?? mod;
			const box = grid.createDiv({ cls: `dnd5e-npc-ab${prof ? ' is-prof' : ''}` });
			const top = box.createDiv({ cls: 'dnd5e-npc-ab-top' });
			const k = top.createSpan({ cls: 'dnd5e-npc-ab-k', text: SHORT[a] });
			markTerm(k, this.terms, a.toUpperCase());
			const mb = top.createEl('button', { cls: 'dnd5e-npc-ab-m', text: formatMod(mod), attr: { 'aria-label': `Roll ${ABILITY_NAME[a]} ${formatMod(mod)}` } });
			mb.addEventListener('click', (e) => { e.preventDefault(); this.roll(d20(mod), `${ABILITY_NAME[a]} check`); });
			top.createSpan({ cls: 'dnd5e-npc-ab-s', text: String(score), attr: { 'aria-label': `${ABILITY_NAME[a]} score ${score}` } });
			const sv = box.createEl('button', { cls: 'dnd5e-npc-save', attr: { 'aria-label': `Roll ${ABILITY_NAME[a]} save ${formatMod(save)}${prof ? ' (proficient)' : ''}` } });
			profMark(sv, prof ? 1 : 0);
			sv.createSpan({ cls: 'dnd5e-npc-save-l', text: 'Save' });
			sv.createEl('b', { text: formatMod(save) });
			sv.addEventListener('click', (e) => { e.preventDefault(); this.roll(d20(save), `${ABILITY_NAME[a]} save`); });
		});
	}

	/** Skills as rolls, then senses and languages as the stat block words them. */
	private renderLines(lines: HTMLElement, s: NpcSheet5e): void {
		const m = s.monster;
		const line = (label: string, rule: string) => {
			const row = lines.createDiv({ cls: 'dnd5e-npc-line' });
			markTerm(row.createSpan({ cls: 'dnd5e-npc-line-l', text: label }), this.terms, rule);
			return row.createDiv({ cls: 'dnd5e-npc-line-v' });
		};
		const skills = npcSkills5e(m);
		if (skills.length) {
			const v = line('Skills', 'Skills');
			v.addClass('is-skills');
			for (const k of skills) {
				const b = v.createEl('button', { cls: 'dnd5e-npc-skill', attr: { 'aria-label': `Roll ${k.name} ${formatMod(k.bonus)} (${ABILITY_NAME[k.ability]})` } });
				markTerm(b.createSpan({ cls: 'dnd5e-npc-skill-n', text: k.name }), this.terms, k.name);
				b.createEl('small', { text: SHORT[k.ability] });
				b.createEl('b', { text: formatMod(k.bonus) });
				b.addEventListener('click', (e) => { e.preventDefault(); this.roll(d20(k.bonus), k.name); });
			}
		}
		line('Senses', 'Senses').setText(npcSenses5e(m));
		if (m.languages) line('Languages', 'Languages').setText(m.languages);
		if (!lines.childElementCount) lines.remove();
	}

	/** Actions: the name (it opens the action's own words), to-hit or DC, damage, then the notes. */
	private renderActions(el: HTMLElement, s: NpcSheet5e): void {
		const rows = npcActions5e(s.monster);
		if (!rows.length) return;
		const opened = openedOf.get(this.ctx.path) ?? new Set<string>();
		openedOf.set(this.ctx.path, opened);
		const grid = el.createDiv({ cls: 'dnd5e-npc-acts' });
		const card = this.rt.cardOptions(this.ctx.path);
		let group = '';
		for (const r of rows) {
			if (r.group !== group) { group = r.group; grid.createDiv({ cls: 'dnd5e-npc-grp', text: r.group }); }
			const id = `${r.group}:${r.name}`;
			const open = opened.has(id);
			const row = grid.createDiv({ cls: `dnd5e-npc-act${open ? ' is-open' : ''}` });
			const name = pill(row, { tag: 'button', icon: evIcon('chevron-right'), text: r.name, cls: 'dnd5e-npc-act-name', attr: { 'aria-expanded': String(open) } });
			name.addEventListener('click', (e) => { e.preventDefault(); if (opened.has(id)) opened.delete(id); else opened.add(id); this.render(); });
			const hit = row.createDiv({ cls: 'dnd5e-npc-act-hit' });
			if (r.hit !== undefined) {
				const b = pill(hit, { tag: 'button', text: formatMod(r.hit), cls: 'dnd5e-npc-roll', title: `Roll ${r.name} (attack)` });
				b.addEventListener('click', (e) => { e.preventDefault(); this.roll(d20(r.hit!), `${r.name} (attack)`); });
			} else if (r.dc !== undefined) pill(hit, { text: `DC ${r.dc}`, cls: 'dnd5e-dc', title: r.save ? `${ABILITY_NAME[r.save]} save, DC ${r.dc}` : `DC ${r.dc}` });
			const dmg = row.createDiv({ cls: 'dnd5e-npc-act-dmg' });
			if (r.damage) damageButton(dmg, r.damage, r.damageType, () => this.roll(r.damage!, `${r.name} damage`));
			row.createSpan({ cls: 'dnd5e-npc-act-note', text: r.note });
			if (open && r.text) renderText5e(row.createDiv({ cls: 'dnd5e-npc-act-text' }), r.text, `${this.name}: ${r.name}`, card);
		}
	}
}

/** Pick the stat block an NPC uses. */
class StatblockPicker extends FuzzySuggestModal<Dnd5eEntry> {
	constructor(private rt: Dnd5eRuntime, private sourcePath: string, private onPick: (e: Dnd5eEntry) => void) {
		super(rt.plugin.app);
		this.setPlaceholder('Use the stats of…');
	}
	getItems(): Dnd5eEntry[] { return this.rt.index.all(this.rt.edition(this.sourcePath), this.sourcePath); }
	getItemText(e: Dnd5eEntry): string { return `${e.name} (CR ${e.monster.cr})`; }
	onChooseItem(e: Dnd5eEntry): void {
		this.onPick(e);
		new Notice(`Stats from ${e.name}`);
	}
}
