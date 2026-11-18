// How a 5e compendium entry looks: a spell, a magic item, a piece of equipment,
// a class page, a species, a background, a feat, a rule or a condition. Used
// by the compendium view, hover cards, the card modal and Spotlight.

import { App, setIcon } from 'obsidian';
import { appendRichText, RichTextOptions } from '../../core/markdown';
import { appendWithTerms, TermContext } from '../../core/rule-term-ui';
import { wireWikiLinks } from '../../core/wiki-links';
import { compendium5e, Hit5e, KIND5E } from './compendium';
import { applyLook } from '../../core/look';

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
			const table = parent.createEl('table', { cls: 'dnd5e-card-table' });
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

/** A labelled line: "**Casting Time** 1 action". */
function field(parent: HTMLElement, label: string, value: string | number | undefined): void {
	if (value === undefined || value === '') return;
	const p = parent.createDiv({ cls: 'dnd5e-card-field' });
	p.createSpan({ cls: 'dnd5e-card-label', text: label });
	p.appendText(` ${value}`);
}

export function renderCard5e(el: HTMLElement, hit: Hit5e, o: Card5eOptions): HTMLElement {
	const card = el.createDiv({ cls: `dnd5e-card kind-${hit.kind}` });
	applyLook(card, 'dnd5e');
	const head = card.createDiv({ cls: 'dnd5e-card-head' });
	setIcon(head.createSpan({ cls: 'dnd5e-card-icon' }), KIND5E[hit.kind].icon);
	const titles = head.createDiv();
	titles.createDiv({ cls: 'dnd5e-card-name', text: hit.name });
	titles.createDiv({ cls: 'dnd5e-card-line', text: hit.detail });
	const body = card.createDiv({ cls: 'dnd5e-card-body' });
	const text = (t: string | undefined, label = hit.name) => { if (t) renderText5e(body, t, label, o); };

	switch (hit.kind) {
		case 'spell': {
			const s = hit.spell;
			const facts = body.createDiv({ cls: 'dnd5e-card-facts' });
			field(facts, 'Casting Time', s.castingTime);
			field(facts, 'Range', s.range);
			field(facts, 'Components', s.components);
			field(facts, 'Duration', `${s.concentration && !/concentration/i.test(s.duration) ? 'Concentration, ' : ''}${s.duration}`);
			text(s.desc);
			if (s.higherLevel) {
				body.createDiv({ cls: 'dnd5e-card-sub', text: hit.edition === '2014' ? 'At Higher Levels' : 'Using a Higher-Level Spell Slot' });
				text(s.higherLevel);
			}
			if (s.classes.length) field(body, 'Classes', s.classes.join(', '));
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
				for (const p of e.properties) if (props[p]) { body.createDiv({ cls: 'dnd5e-card-sub', text: p }); text(props[p], p); }
			}
			text(e.desc);
			break;
		}
		case 'class': {
			const c = hit.cls;
			const facts = body.createDiv({ cls: 'dnd5e-card-facts' });
			field(facts, 'Hit Die', `d${c.hitDie}`);
			field(facts, 'Primary Ability', c.primary);
			field(facts, 'Saving Throws', c.saves.join(', '));
			field(facts, 'Proficiencies', c.proficiencies.join(', '));
			field(facts, 'Skills', c.skillChoice);
			field(facts, 'Spellcasting', c.spellcasting);
			// The level table: proficiency bonus, features, spell slots.
			const slots = c.levels.some(l => l.slots);
			const table = body.createEl('table', { cls: 'dnd5e-card-table dnd5e-level-table' });
			const hr = table.createEl('tr');
			for (const h of ['Lvl', 'PB', 'Features', ...(slots ? ['1', '2', '3', '4', '5', '6', '7', '8', '9'] : [])]) hr.createEl('th', { text: h });
			for (const l of c.levels) {
				const tr = table.createEl('tr');
				tr.createEl('td', { text: String(l.level) });
				tr.createEl('td', { text: `+${l.pb}` });
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
			for (const f of hit.subclass.features) {
				body.createDiv({ cls: 'dnd5e-card-sub', text: `${f.name} (level ${f.level})` });
				text(f.desc, f.name);
			}
			break;
		}
		case 'species': {
			const s = hit.species;
			const facts = body.createDiv({ cls: 'dnd5e-card-facts' });
			field(facts, 'Creature Type', s.type);
			field(facts, 'Size', s.size);
			field(facts, 'Speed', `${s.speed} feet`);
			field(facts, 'Ability Scores', s.abilityBonuses);
			text(s.desc);
			for (const t of s.traits) { body.createDiv({ cls: 'dnd5e-card-sub', text: t.name }); text(t.desc, t.name); }
			for (const sub of s.subspecies) {
				body.createDiv({ cls: 'dnd5e-card-level', text: sub.name });
				text(sub.desc);
				for (const t of sub.traits) { body.createDiv({ cls: 'dnd5e-card-sub', text: t.name }); text(t.desc, t.name); }
			}
			break;
		}
		case 'background': {
			const b = hit.background;
			const facts = body.createDiv({ cls: 'dnd5e-card-facts' });
			field(facts, 'Ability Scores', b.abilityScores?.join(', '));
			field(facts, 'Feat', b.feat);
			field(facts, 'Proficiencies', b.proficiencies.join(', '));
			field(facts, 'Equipment', b.equipment);
			if (b.feature) { body.createDiv({ cls: 'dnd5e-card-sub', text: b.feature.name }); text(b.feature.desc, b.feature.name); }
			break;
		}
		case 'feat':
			if (hit.feat.prerequisite) field(body, 'Prerequisite', hit.feat.prerequisite);
			text(hit.feat.desc);
			break;
		case 'rule':
			text(hit.rule.desc);
			break;
		case 'condition':
			text(hit.desc);
			break;
	}
	const own = (Object.values(hit).find(v => v && typeof v === 'object' && typeof (v as { source?: unknown }).source === 'string') as { source?: string } | undefined)?.source;
	card.createDiv({ cls: 'dnd5e-source', text: own ?? (hit.edition === '2014' ? 'SRD 5.1' : 'SRD 5.2') });
	wireWikiLinks(card, o.app, o.sourcePath);
	return card;
}
