// How a 5e compendium entry looks: a spell, a magic item, a piece of equipment,
// a class page, a species, a background, a feat, a rule or a condition. Used
// by the compendium view, hover cards, the card modal and Spotlight. Drawn as
// the SRD sets them, in the stat block's dress for the edition (design study:
// #5e/compendium): the name in Garamond small caps, the italic line under it,
// labels in the book's red, run-in headings ("Using a Higher-Level Spell Slot.")
// in bold italic, and a class page under the class's scrollwork.

import { App } from 'obsidian';
import { appendRichText, RichTextOptions } from '../../core/markdown';
import { appendWithTerms, TermContext } from '../../core/rule-term-ui';
import { wireWikiLinks } from '../../core/wiki-links';
import { compendium5e, Hit5e, OriginChoices5e } from './compendium';
import { ABILITIES, ABILITY_NAME } from './types';
import { applyLook } from '../../core/look';
import { classScroll } from './scroll';

export interface Card5eOptions {
	app: App;
	sourcePath: string;
	/** Roll a dice expression; unset: dice are plain text. */
	onRoll?: (expression: string, label: string) => void;
	/** The game's rules words (conditions, senses, Dim Light…) in the text become clickable. */
	terms?: TermContext;
}

/**
 * Rules text: paragraphs, "- " bullet lists and "| a | b |" tables, with
 * inline markdown and clickable dice.
 */
export function renderText5e(parent: HTMLElement, text: string, label: string, o: Card5eOptions): void {
	const onDice = o.onRoll ? (d: HTMLElement, expression: string) => {
		d.addClass('is-clickable');
		d.setAttr('role', 'button');
		d.setAttr('tabindex', '0');
		const go = (e: Event) => { e.preventDefault(); e.stopPropagation(); o.onRoll!(expression, label); };
		d.addEventListener('click', go);
		d.addEventListener('keydown', (e) => { if ((e).key === 'Enter') go(e); });
	} : undefined;
	const rich = (el: HTMLElement, t: string, opts: RichTextOptions) => {
		if (o.terms) appendWithTerms(el, t, o.terms, opts);
		else appendRichText(el, t, opts);
	};
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;
		if (/^[-*]\s/.test(line)) {
			const ul = parent.createEl('ul');
			for (; i < lines.length && /^\s*[-*]\s/.test(lines[i]); i++) rich(ul.createEl('li'), lines[i].trim().replace(/^[-*]\s+/, ''), { onDice });
			i--;
			continue;
		}
		if (line.startsWith('|')) {
			const table = parent.createDiv({ cls: 'dnd5e-table-wrap' }).createEl('table', { cls: 'dnd5e-card-table' });
			let first = true;
			for (; i < lines.length && lines[i].trim().startsWith('|'); i++) {
				const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
				if (cells.every(c => /^:?-+:?$/.test(c))) continue;
				const tr = table.createEl('tr');
				for (const c of cells) rich(tr.createEl(first ? 'th' : 'td'), c, { onDice });
				first = false;
			}
			i--;
			continue;
		}
		rich(parent.createEl('p'), line, { onDice });
	}
}

/** "Strength or Dexterity", from STR, Dexterity… */
function abilityWords(list: string[], joiner = 'or'): string {
	const names = list.map(a => ABILITY_NAME[ABILITIES.find(k => k === a.toLowerCase() || ABILITY_NAME[k].toLowerCase() === a.toLowerCase()) ?? 'str'] ?? a);
	return names.length < 3 ? names.join(` ${joiner} `) : `${names.slice(0, -1).join(', ')}, ${joiner} ${names[names.length - 1]}`;
}
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
/** "Common and Ignan, and one of Elvish or Sylvan": what an origin gives and lets you choose. */
function choiceWords(given: string[] | undefined, pick: { count: number; from?: string[] } | undefined, anyWord: string): string {
	const parts: string[] = [];
	if (given?.length) parts.push(given.join(', '));
	if (pick?.count) {
		const n = NUMBER_WORDS[pick.count] ?? String(pick.count);
		parts.push(pick.from?.length ? `${n} of ${pick.from.join(pick.from.length === 2 ? ' or ' : ', ')}` : `${n} ${anyWord} of your choice`);
	}
	return parts.join('; ');
}
/** The facts an origin's own choices add (a pack's or your species, lineage or background). */
function originFacts(facts: HTMLElement, o: OriginChoices5e): void {
	field(facts, 'Languages', choiceWords(o.languages, o.languageChoices, o.languageChoices?.count === 1 ? 'language' : 'languages'));
	field(facts, 'Skills', choiceWords(o.skills, o.skillChoices, 'skill'));
	field(facts, 'Tools', choiceWords(undefined, o.toolChoices, 'tool'));
	field(facts, 'Cantrip', choiceWords(undefined, o.cantripChoices, 'cantrip'));
}

/** A labelled line: "**Casting Time** 1 action". */
function field(parent: HTMLElement, label: string, value: string | number | undefined): void {
	if (value === undefined || value === '') return;
	const p = parent.createDiv({ cls: 'dnd5e-card-field' });
	p.createSpan({ cls: 'dnd5e-card-label', text: label });
	p.appendText(` ${value}`);
}

export function renderCard5e(el: HTMLElement, hit: Hit5e, o: Card5eOptions): HTMLElement {
	const card = el.createDiv({ cls: `dnd5e-card dnd5e-entry kind-${hit.kind} ed-${hit.edition}` });
	applyLook(card, 'dnd5e');
	const head = card.createDiv({ cls: 'dnd5e-card-head' });
	// A class or subclass page: its name between the class's scrollwork, as the sheet heads its class.
	if (hit.kind === 'class') classScroll(head, hit.name, 'dnd5e-card-name dnd5e-card-scroll');
	else if (hit.kind === 'subclass') classScroll(head, hit.cls.name, 'dnd5e-card-name dnd5e-card-scroll', hit.name);
	else head.createDiv({ cls: 'dnd5e-card-name', text: hit.name });
	// 2024 names a spell's classes in its italic line, as the book does: "Level 3 Evocation (Sorcerer, Wizard)".
	const classesInLine = hit.kind === 'spell' && hit.edition === '2024' && hit.spell.classes.length > 0;
	const line = classesInLine ? `${hit.detail} (${hit.spell.classes.join(', ')})` : hit.detail;
	if (line) head.createDiv({ cls: 'dnd5e-card-line', text: line });
	const body = card.createDiv({ cls: 'dnd5e-card-body' });
	const text = (t: string | undefined, label = hit.name) => { if (t) renderText5e(body, t, label, o); };
	// A run-in heading, as the book sets one: "***Darkvision.*** You can see…"
	const lead = (name: string, t: string | undefined) => {
		if (!t) return;
		const at = body.childElementCount;
		renderText5e(body, t, name, o);
		const first = body.children[at];
		const strong = createEl('strong', { cls: 'dnd5e-card-lead', text: `${name.replace(/\.$/, '')}. ` });
		if (first?.tagName === 'P') first.prepend(strong);
		else body.insertBefore(createDiv({ cls: 'dnd5e-card-sub', text: name }), first ?? null);
	};

	switch (hit.kind) {
		case 'spell': {
			const s = hit.spell;
			const facts = body.createDiv({ cls: 'dnd5e-card-facts' });
			field(facts, 'Casting Time', s.castingTime);
			field(facts, 'Range', s.range);
			field(facts, 'Components', s.components);
			field(facts, 'Duration', `${s.concentration && !/concentration/i.test(s.duration) ? 'Concentration, ' : ''}${s.duration}`);
			text(s.desc);
			lead(hit.edition === '2014' ? 'At Higher Levels' : 'Using a Higher-Level Spell Slot', s.higherLevel);
			if (s.classes.length && !classesInLine) field(body, 'Classes', s.classes.join(', '));
			break;
		}
		case 'item':
			text(hit.item.desc);
			break;
		case 'equipment': {
			const e = hit.equipment;
			const facts = body.createDiv({ cls: 'dnd5e-card-facts' });
			field(facts, 'Cost', e.cost);
			field(facts, 'Weight', e.weight !== undefined ? `${e.weight} lb.` : undefined);
			field(facts, 'Damage', e.damage ? `${e.damage}${e.versatile ? ` (${e.versatile} two-handed)` : ''}` : undefined);
			field(facts, 'Range', e.range ? `${e.range} ft.` : undefined);
			field(facts, 'Armor Class', e.ac ? `${e.ac.base}${e.ac.dex ? (e.ac.max !== undefined ? ` + Dex modifier (max ${e.ac.max})` : ' + Dex modifier') : ''}` : undefined);
			field(facts, 'Strength', e.strMin ? `${e.strMin} required` : undefined);
			field(facts, 'Stealth', e.stealthDisadvantage ? 'Disadvantage' : undefined);
			field(facts, 'Mastery', e.mastery);
			if (e.properties?.length) {
				field(facts, 'Properties', e.properties.join(', '));
				const props = compendium5e(hit.edition).weaponProperties;
				for (const p of e.properties) lead(p, props[p]);
			}
			text(e.desc);
			break;
		}
		case 'class': {
			const c = hit.cls;
			const facts = body.createDiv({ cls: 'dnd5e-card-facts' });
			field(facts, 'Hit Die', c.hitDie ? `d${c.hitDie}` : undefined);
			field(facts, 'Primary Ability', c.primary);
			field(facts, 'Saving Throws', c.saves.join(', '));
			field(facts, 'Proficiencies', c.proficiencies.join(', '));
			field(facts, 'Skills', c.skillChoice);
			field(facts, 'Spellcasting', c.spellcasting);
			// The level table: proficiency bonus, features, spell slots.
			const slots = c.levels.some(l => l.slots);
			const table = body.createDiv({ cls: 'dnd5e-table-wrap' }).createEl('table', { cls: 'dnd5e-card-table dnd5e-level-table' });
			const hr = table.createEl('tr');
			for (const h of ['Lvl', 'PB', 'Features', ...(slots ? ['1', '2', '3', '4', '5', '6', '7', '8', '9'] : [])]) hr.createEl('th', { text: h });
			for (const l of c.levels) {
				const tr = table.createEl('tr');
				tr.createEl('td', { text: String(l.level) });
				tr.createEl('td', { text: l.pb !== undefined ? `+${l.pb}` : '—' });
				tr.createEl('td', { text: l.features.join(', ') || '—' });
				if (slots) for (let i = 0; i < 9; i++) tr.createEl('td', { text: l.slots?.[i] ? String(l.slots[i]) : '—' });
			}
			let level = -1;
			for (const f of c.features) {
				if (f.level !== level) { level = f.level; body.createDiv({ cls: 'dnd5e-card-level', text: `Level ${level}` }); }
				body.createDiv({ cls: 'dnd5e-card-sub', text: f.name });
				text(f.desc, f.name);
			}
			if (c.subclasses.length) field(body, 'Subclasses', c.subclasses.map(s => s.name).join(', '));
			break;
		}
		case 'subclass': {
			text(hit.subclass.desc);
			// Spells it always has prepared, as the book tables a domain's or an oath's.
			const spells = (hit.subclass.spells ?? []).filter(x => x.spells?.length);
			if (spells.length) {
				body.createDiv({ cls: 'dnd5e-card-sub', text: `${hit.subclass.name} Spells` });
				const t = body.createDiv({ cls: 'dnd5e-table-wrap' }).createEl('table', { cls: 'dnd5e-card-table' });
				const hr = t.createEl('tr');
				hr.createEl('th', { text: `${hit.cls.name || 'Class'} Level` });
				hr.createEl('th', { text: hit.edition === '2014' ? 'Spells' : 'Prepared Spells' });
				for (const x of [...spells].sort((a, b) => a.level - b.level)) {
					const tr = t.createEl('tr');
					tr.createEl('td', { text: String(x.level) });
					tr.createEl('td', { text: x.spells.join(', ') });
				}
			}
			for (const f of hit.subclass.features) {
				body.createDiv({ cls: 'dnd5e-card-sub', text: hit.edition === '2014' ? `${f.name} (level ${f.level})` : `Level ${f.level}: ${f.name}` });
				text(f.desc, f.name);
			}
			break;
		}
		case 'species': {
			const s = hit.species;
			const facts = body.createDiv({ cls: 'dnd5e-card-facts' });
			field(facts, 'Creature Type', s.type);
			field(facts, 'Size', s.size);
			field(facts, 'Speed', s.speed !== undefined ? `${s.speed} feet` : undefined);
			field(facts, 'Ability Scores', [s.abilityBonuses, s.abilityChoices?.count ? `+${s.abilityChoices.bonus || 1} to ${NUMBER_WORDS[s.abilityChoices.count] ?? s.abilityChoices.count} of your choice${s.abilityChoices.from?.length ? ` (${abilityWords(s.abilityChoices.from)})` : ''}` : ''].filter(Boolean).join(', '));
			originFacts(facts, s);
			text(s.desc);
			for (const t of s.traits) lead(t.name, t.desc);
			for (const sub of s.subspecies) {
				body.createDiv({ cls: 'dnd5e-card-level', text: sub.name });
				const subFacts = body.createDiv({ cls: 'dnd5e-card-facts' });
				field(subFacts, 'Ability Scores', sub.abilityBonuses);
				originFacts(subFacts, sub);
				if (!subFacts.childElementCount) subFacts.remove();
				text(sub.desc);
				for (const t of sub.traits) lead(t.name, t.desc);
			}
			break;
		}
		case 'background': {
			const b = hit.background;
			const facts = body.createDiv({ cls: 'dnd5e-card-facts' });
			field(facts, 'Ability Scores', b.abilityScores?.join(', '));
			field(facts, 'Feat', b.feat);
			field(facts, 'Proficiencies', b.proficiencies.join(', '));
			field(facts, 'Languages', choiceWords(b.languages, b.languageChoices, b.languageChoices?.count === 1 ? 'language' : 'languages'));
			field(facts, 'Equipment', b.equipment);
			if (b.feature) lead(b.feature.name, b.feature.desc);
			break;
		}
		case 'feat': {
			const f = hit.feat;
			if (f.prerequisite) field(body, 'Prerequisite', f.prerequisite);
			text(f.desc);
			// Its increase and Repeatable, as the 2024 book closes a feat, unless its text already says so.
			if (f.increase?.length && !/Ability Score Increase/i.test(f.desc)) lead('Ability Score Increase', `Increase your ${abilityWords(f.increase)} score by 1, to a maximum of ${f.type === 'epic-boon' ? 30 : 20}.`);
			if (f.repeatable && !/\bRepeatable\b/.test(f.desc)) lead('Repeatable', 'You can take this feat more than once.');
			break;
		}
		case 'rule':
			text(hit.rule.desc);
			break;
		case 'condition':
			text(hit.desc);
			break;
	}
	const own = Object.values(hit).find(v => v && typeof v === 'object' && typeof (v as { source?: unknown }).source === 'string') as { source?: string; imported?: unknown } | undefined;
	const from = own?.source && typeof own.imported === 'string' && own.imported ? `${own.source} from ${own.imported}` : own?.source;
	card.createDiv({ cls: 'dnd5e-source', text: from ?? (hit.edition === '2014' ? 'SRD 5.1' : 'SRD 5.2') });
	wireWikiLinks(card, o.app, o.sourcePath);
	return card;
}
