// The spell and item builders' steps. Numbers come from entity-homebrew.ts;
// the cards they preview are the compendium's own.

import type NimbleStatblocksPlugin from '../main';
import { Compendium, itemDetail, Spell } from './compendium';
import { pluginCardOptions, renderHitCard } from './compendium-card';
import { bundledCompendium } from './compendium-data';
import { diceAverage, formatDiceParts, parseDiceParts, RARITIES, Rarity, SPELL_DAMAGE } from './builder-math';
import { HomebrewItem, ITEM_LANG, ItemKind, itemForCompendium, SPELL_LANG } from './homebrew-def';
import {
	AreaShape, autoTier, bookPeers, ItemDraft, itemSource, newItemDraft, newSpellDraft, rarityGuide, RangeKind, SaveKey, SCHOOLS, SpellDraft,
	spellActions, spellDamage, spellExpected, spellSource, suggestedCost, suggestedScaling, suggestedUpcast, tierCheck, toItem, toSpell, WEAPON_PROPS,
} from './entity-homebrew';
import {
	BuilderUI, dicePad, field, grid, homeFolder, iconButton, KindBuilder, meter, numberInput, Output, registerKind, section, segmented, StepDef, textArea, textInput,
} from './entity-builder';

const TIER_LABEL = (t: number) => (t === 0 ? 'Cantrip' : `Tier ${t}`);

function reviewRows(panel: HTMLElement, ui: BuilderUI, rows: [string, string, () => string][]): void {
	const box = panel.createDiv({ cls: 'eb-review' });
	for (const [label, step, text] of rows) {
		const r = box.createDiv({ cls: 'eb-review-row' });
		r.createSpan({ cls: 'eb-review-label', text: label });
		const v = r.createSpan({ cls: 'eb-review-value' });
		const edit = r.createEl('button', { cls: 'eb-review-edit', text: 'Edit' });
		edit.addEventListener('click', () => ui.go(step));
		ui.live(() => v.setText(text()));
	}
}

function folderField(panel: HTMLElement, get: () => string, set: (v: string) => void, help: string): void {
	const where = field(panel, 'Saved in', { wide: true, help });
	textInput(where.control, { value: get(), placeholder: 'Homebrew', code: true, label: 'Folder', onInput: v => set(v.trim()) });
}

// ----------------------------------------------------------------------------
// Spells

class SpellBuilder implements KindBuilder {
	kind = 'spell' as const;
	noun = 'spell';
	icon = 'wand-2';
	d: SpellDraft = newSpellDraft();
	private folder: string;

	constructor(private plugin: NimbleStatblocksPlugin, seed: unknown) {
		this.folder = homeFolder(plugin, 'Homebrew', 'Homebrew');
		const s = (seed as { spell?: Spell | null } | undefined)?.spell;
		if (s) this.d = fromSpell(s);
	}

	steps(): StepDef[] {
		return [
			{ id: 'start', label: 'Start', icon: 'sparkles' },
			{ id: 'casting', label: 'Casting', icon: 'hand' },
			{ id: 'effect', label: 'Effect', icon: 'flame' },
			{ id: 'review', label: 'Review', icon: 'check-check' },
		];
	}

	private settle(): void { if (this.d.autoTier) this.d.tier = autoTier(this.d); }

	renderStep(id: string, panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		if (id === 'start') {
			section(panel, 'What are you casting?', 'Pick a school and tier and Create for a spell with the book\'s damage, actions and range. Change anything later.');
			const top = grid(panel, 2);
			const name = field(top, 'Name');
			textInput(name.control, { value: d.name, placeholder: 'Ember Lash', words: true, label: 'Name', onInput: v => { d.name = v; ui.changed(); } });
			const kind = field(top, 'Kind', { help: 'Utility spells do something other than damage, and skip the damage check.' });
			segmented<boolean>(kind.control, [{ value: false, label: 'Damage', icon: 'flame' }, { value: true, label: 'Utility', icon: 'sparkle' }], () => d.utility, v => { d.utility = v; }, { label: 'Kind', ui });

			const school = field(panel, 'School', { wide: true, help: 'Spells deal the damage type of their school. Or name your own.' });
			const row = school.control.createDiv({ cls: 'eb-row-wrap' });
			segmented<string>(row, SCHOOLS.map(s => ({ value: s, label: s })), () => d.school, v => { d.school = v; custom.value = ''; }, { label: 'School', ui, cls: 'is-compact' });
			const custom = textInput(row, { value: SCHOOLS.includes(d.school) ? '' : d.school, placeholder: 'Other', words: true, label: 'Other school', cls: 'eb-input-short', onInput: v => { d.school = v.trim() || 'Fire'; ui.changed(); } });

			const tier = field(panel, 'Tier', { wide: true });
			const tw = tier.control.createDiv({ cls: 'eb-level' });
			const down = iconButton(tw, 'minus', 'Lower tier', () => { d.autoTier = false; d.tier = Math.max(0, d.tier - 1); ui.changed(); }, 'eb-num-btn');
			const value = tw.createDiv({ cls: 'eb-level-value eb-tier-value' });
			const up = iconButton(tw, 'plus', 'Higher tier', () => { d.autoTier = false; d.tier = Math.min(9, d.tier + 1); ui.changed(); }, 'eb-num-btn');
			const auto = tw.createEl('button', { cls: 'eb-auto', text: 'Auto', attr: { title: 'Follow the damage you type' } });
			auto.addEventListener('click', () => { d.autoTier = !d.autoTier; this.settle(); ui.changed(); });
			ui.live(() => {
				this.settle();
				value.setText(TIER_LABEL(d.tier));
				auto.toggleClass('is-active', d.autoTier);
				down.disabled = d.tier <= 0;
				up.disabled = d.tier >= 9;
				tier.help.removeClass('is-empty');
				tier.help.setText(d.tier === 0 ? 'Cantrips cost no mana and grow every 5th level.' : `Costs ${d.tier} mana. Each extra mana upcasts it one step.`);
			});
			return;
		}
		if (id === 'casting') {
			section(panel, 'Casting', 'The Creator\'s Kit: cantrips take 1 action, tiered spells 2, area spells at range 3. Range 8 is just past one move.');
			const g = grid(panel, 2);
			const act = field(g, 'Actions');
			segmented<number>(act.control, [1, 2, 3].map(n => ({ value: n, label: String(n) })), () => spellActions(d), v => { d.actions = v; }, { label: 'Actions', ui });
			const conc = field(g, 'Concentration', { help: 'Blank for none.' });
			textInput(conc.control, { value: d.concentration ?? '', placeholder: 'up to 1 minute', label: 'Concentration', onInput: v => { d.concentration = v; ui.changed(); } });
			const r = grid(panel, 2);
			const rk = field(r, 'Reach or range', { help: 'Range spells have disadvantage with an enemy adjacent; Reach spells work in melee.' });
			segmented<RangeKind>(rk.control, [{ value: 'range', label: 'Range' }, { value: 'reach', label: 'Reach' }, { value: 'self', label: 'Self' }], () => d.rangeKind, v => { d.rangeKind = v; d.distance = undefined; }, { label: 'Reach or range', ui });
			const dist = field(r, 'Distance');
			numberInput(dist.control, { get: () => d.distance, placeholder: () => (d.rangeKind === 'reach' ? '1' : String(spellExpected(d).range)), set: v => { d.distance = v; }, min: 1, max: 60, label: 'distance', ui });
			const area = field(panel, 'Area', { wide: true });
			const arow = area.control.createDiv({ cls: 'eb-row-wrap' });
			segmented<AreaShape>(arow, [{ value: 'none', label: 'One target' }, { value: 'aoe', label: 'Around' }, { value: 'cone', label: 'Cone' }, { value: 'line', label: 'Line' }, { value: 'square', label: 'Square' }],
				() => d.area, v => { d.area = v; d.areaSize = undefined; this.settle(); }, { label: 'Area', ui, cls: 'is-compact' });
			const sizeWrap = arow.createDiv({ cls: 'eb-inline-field' });
			sizeWrap.createSpan({ cls: 'eb-inline-label', text: 'Size' });
			numberInput(sizeWrap, { get: () => d.areaSize, placeholder: () => (d.area === 'square' ? '3' : d.area === 'line' ? '8' : '4'), set: v => { d.areaSize = v; }, min: 1, max: 30, label: 'area size', ui });
			area.help.removeClass('is-empty');
			ui.live(() => {
				sizeWrap.toggleClass('is-hidden', d.area === 'none' || d.area === 'aoe');
				area.help.setText(d.area === 'none' ? 'Hitting several creatures? Area spells deal less (about 60% of one target).' : 'Area spells deal about 60% of a single-target spell of the tier.');
			});
			const save = field(panel, 'Save', { wide: true, help: 'Creatures who save take half and suffer no other effect. Cantrips shouldn\'t ask for one.' });
			segmented<SaveKey>(save.control, [{ value: '', label: 'None' }, { value: 'STR', label: 'STR' }, { value: 'DEX', label: 'DEX' }, { value: 'INT', label: 'INT' }, { value: 'WIL', label: 'WIL' }], () => d.save, v => { d.save = v; }, { label: 'Save', ui, cls: 'is-compact' });
			return;
		}
		if (id === 'effect') {
			section(panel, 'Effect', d.utility ? 'What it does. Damage is optional for a utility spell.' : 'Damage starts at the Creator\'s Kit average for the tier. More than that wants a drawback; less, a benefit.');
			const dmg = field(panel, 'Damage', { wide: true });
			const input = textInput(dmg.control, { value: '', placeholder: '3d6+4', code: true, label: 'Damage', onInput: v => { d.damage = v; this.settle(); ui.changed(); } });
			ui.live(() => { if (activeDocument.activeElement !== input) input.value = spellDamage(d) ?? ''; });
			if (!d.utility) dicePad(dmg.row, {
				read: () => parseDiceParts(spellDamage(d) ?? ''),
				write: (p) => { d.damage = formatDiceParts(p).replace(/^d(\d+)$/, '1d$1'); this.settle(); },
				sides: () => d.sides, avg: () => diceAverage(spellDamage(d)), want: () => spellExpected(d).damage,
				reset: { shown: () => !!d.damage?.trim(), run: () => { d.damage = undefined; this.settle(); } }, ui,
			});
			const g = grid(panel, 2);
			if (d.tier === 0) {
				const sc = field(g, 'Higher levels');
				const t = textInput(sc.control, { value: d.scaling ?? '', label: 'Higher levels', onInput: v => { d.scaling = v; ui.changed(); } });
				ui.live(() => { t.placeholder = suggestedScaling(d) ?? '+2 Range every 5 levels.'; });
			} else {
				const up = field(g, 'Upcast (each extra mana)');
				const t = textInput(up.control, { value: d.upcast ?? '', label: 'Upcast', onInput: v => { d.upcast = v; ui.changed(); } });
				ui.live(() => { t.placeholder = suggestedUpcast(d) ?? '+1 target.'; });
			}
			const text = field(panel, 'What it does', { wide: true });
			textArea(text.control, { value: d.text, placeholder: 'A whip of flame cracks across one target. On a crit, it\'s Smoldering.', label: 'What it does', rows: 3, onInput: v => { d.text = v; ui.changed(); } });
			return;
		}
		section(panel, 'Review', ui.phone ? 'Tap Preview to see the card.' : 'The card on the right is what you\'ll get.');
		reviewRows(panel, ui, [
			['Name', 'start', () => d.name.trim() || 'Not named yet'],
			['School and tier', 'start', () => `${d.school}, ${TIER_LABEL(d.tier).toLowerCase()}${d.utility ? ' (utility)' : ''}`],
			['Casting', 'casting', () => [toSpell(d).actions, toSpell(d).range, toSpell(d).aoe].filter(Boolean).join(' · ')],
			['Damage', 'effect', () => toSpell(d).damage ?? 'None'],
		]);
		folderField(panel, () => this.folder, v => { this.folder = v; }, 'A new note with the spell. It joins the compendium, nimble:spell: references and the character sheet\'s Add spell.');
	}

	renderCheck(el: HTMLElement): void {
		const c = tierCheck(this.d);
		if (!c) return;
		const head = el.createDiv({ cls: 'eb-check-head' });
		const big = head.createDiv({ cls: 'eb-check-level' });
		big.createSpan({ cls: 'eb-check-kicker', text: 'Hits like' });
		big.createSpan({ cls: 'eb-check-value', text: TIER_LABEL(c.tier).toLowerCase() });
		const tone = c.verdict === 0 ? 'ok' : c.verdict > 0 ? 'high' : 'low';
		head.createDiv({ cls: `eb-verdict tone-${tone}`, text: c.verdict === 0 ? `Right for ${TIER_LABEL(this.d.tier).toLowerCase()}` : c.verdict > 0 ? 'Hits hard: give it a drawback' : 'Hits light: give it a benefit' });
		meter(el, this.d.area === 'none' ? 'Average damage' : 'Average damage (area)', c.have, c.want);
		el.createDiv({ cls: 'eb-check-text', text: `The Creator's Kit averages: cantrip ${SPELL_DAMAGE[0]}, tier 1 ${SPELL_DAMAGE[1]}, tier 3 ${SPELL_DAMAGE[3]}, tier 5 ${SPELL_DAMAGE[5]}, tier 9 ${SPELL_DAMAGE[9]}.` });
	}

	renderPreview(el: HTMLElement): void {
		const hit = new Compendium({ spells: [{ ...toSpell(this.d), source: 'Homebrew' }] }).all()[0];
		if (hit) renderHitCard(el, hit, pluginCardOptions(this.plugin, hit.name));
	}

	checkChip(): { text: string; tone: 'ok' | 'high' | 'low' | 'none' } {
		const c = tierCheck(this.d);
		if (!c) return { text: '', tone: 'none' };
		return { text: c.verdict === 0 ? `${TIER_LABEL(c.tier)} ✓` : `Hits like ${TIER_LABEL(c.tier).toLowerCase()}`, tone: c.verdict === 0 ? 'ok' : c.verdict > 0 ? 'high' : 'low' };
	}

	missing(): string | null { return this.d.name.trim() ? null : 'Give it a name.'; }

	output(): Output {
		return { lang: SPELL_LANG, body: spellSource(this.d), name: this.d.name.trim(), frontmatter: { nimble: 'spell' }, folder: this.folder };
	}
}

function fromSpell(s: Spell): SpellDraft {
	const d = newSpellDraft();
	const range = s.range?.match(/^(Range|Reach)\s+(\d+)/i);
	const area = s.aoe?.match(/^(Cone|Line)\s+(\d+)/i);
	const sq = s.aoe?.match(/^(\d+)\s*[×x]\s*\d+/);
	return {
		...d, name: s.name, school: s.school ?? d.school, tier: s.tier ?? 0, utility: !!s.utility,
		actions: parseInt(s.actions ?? '', 10) || undefined,
		rangeKind: /^self/i.test(s.range ?? '') ? 'self' : range ? (range[1].toLowerCase() as RangeKind) : 'range',
		distance: range ? Number(range[2]) : undefined,
		area: area ? (area[1].toLowerCase() as AreaShape) : sq ? 'square' : s.aoe ? 'aoe' : 'none',
		areaSize: area ? Number(area[2]) : sq ? Number(sq[1]) : undefined,
		concentration: s.concentration, damage: s.damage, upcast: s.higherLevels, scaling: s.cantripScaling,
		// "DEX save for half." leads the text when the builder wrote it: read it back as the save.
		save: (s.text?.match(/^(STR|DEX|INT|WIL) save for half\./)?.[1] ?? '') as SaveKey,
		text: (s.text ?? '').replace(/^(STR|DEX|INT|WIL) save for half\.\s*/, ''),
	};
}

// ----------------------------------------------------------------------------
// Items

const KIND_OPTIONS: { value: ItemKind; label: string; icon: string }[] = [
	{ value: 'weapon', label: 'Weapon', icon: 'sword' }, { value: 'armor', label: 'Armor', icon: 'shirt' }, { value: 'shield', label: 'Shield', icon: 'shield' },
	{ value: 'consumable', label: 'Consumable', icon: 'flask-conical' }, { value: 'magic', label: 'Magic item', icon: 'gem' }, { value: 'gear', label: 'Gear', icon: 'backpack' },
];

class ItemBuilder implements KindBuilder {
	kind = 'item' as const;
	noun = 'item';
	icon = 'backpack';
	d: ItemDraft = newItemDraft();
	private folder: string;

	constructor(private plugin: NimbleStatblocksPlugin, seed: unknown) {
		this.folder = homeFolder(plugin, 'Homebrew', 'Homebrew');
		const s = seed as { itemKind?: ItemKind; item?: HomebrewItem | null } | undefined;
		if (s?.item) this.d = fromItem(s.item);
		else if (s?.itemKind) this.d = newItemDraft(s.itemKind);
	}

	steps(): StepDef[] {
		return [
			{ id: 'start', label: 'Start', icon: 'sparkles' },
			{ id: 'details', label: 'Details', icon: 'list' },
			{ id: 'review', label: 'Review', icon: 'check-check' },
		];
	}

	renderStep(id: string, panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		if (id === 'start') {
			section(panel, 'What are you making?', 'Pick what it is and how rare, and Create. The price follows the book unless you set one.');
			const name = field(panel, 'Name', { wide: true });
			textInput(name.control, { value: d.name, placeholder: 'Lantern of Echoes', words: true, label: 'Name', onInput: v => { d.name = v; ui.changed(); } });
			const kind = field(panel, 'Kind', { wide: true });
			segmented<ItemKind>(kind.control, KIND_OPTIONS, () => d.kind, v => { if (v !== d.kind) { d.kind = v; ui.rebuild(); } }, { label: 'Kind', ui, cls: 'is-wrap is-compact eb-seg-3' });
			const rarity = field(panel, 'Rarity', { wide: true });
			segmented<Rarity | ''>(rarity.control, [{ value: '', label: 'Mundane' }, ...RARITIES.map(r => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }))], () => d.rarity, v => { d.rarity = v; }, { label: 'Rarity', ui, cls: 'is-wrap is-compact eb-seg-3' });
			rarity.help.removeClass('is-empty');
			ui.live(() => rarity.help.setText(rarityGuide(d) ?? 'Bought in a shop. Small towns stock things up to about 50 gp.'));
			return;
		}
		if (id === 'details') {
			section(panel, 'Details', d.kind === 'magic' || d.rarity ? 'The GM Guide: the memorable items are a bit strange, have a trade-off, are temporary, or need creativity. Pure number boosts get forgotten.' : 'Core 3.3\'s tables set the numbers; the book items on the right are for comparison.');
			if (d.kind === 'weapon') {
				const dmg = field(panel, 'Damage', { wide: true });
				const input = textInput(dmg.control, { value: d.damage ?? '', placeholder: '1d6', code: true, label: 'Damage', onInput: v => { d.damage = v; ui.changed(); } });
				dicePad(dmg.row, {
					read: () => parseDiceParts(d.damage || '1d6'), write: (p) => { d.damage = formatDiceParts(p).replace(/^d(\d+)$/, '1d$1'); input.value = d.damage; },
					sides: () => 6, avg: () => diceAverage(d.damage || '1d6'), ui,
				});
				const g = grid(panel, 2);
				const stat = field(g, 'Stat');
				segmented<'STR' | 'DEX'>(stat.control, [{ value: 'STR', label: 'STR' }, { value: 'DEX', label: 'DEX' }], () => d.stat, v => { d.stat = v; }, { label: 'Stat', ui });
				const type = field(g, 'Damage type');
				textInput(type.control, { value: d.damageType, placeholder: 'slashing', label: 'Damage type', onInput: v => { d.damageType = v; ui.changed(); } });
				const props = field(panel, 'Properties', { wide: true, help: 'Vicious: roll 1 more die on a crit. Range: disadvantage with an enemy adjacent.' });
				const chips = props.control.createDiv({ cls: 'eb-modes' });
				for (const p of WEAPON_PROPS) {
					const b = chips.createEl('button', { cls: 'eb-chip-toggle', text: p });
					b.addEventListener('click', () => { const i = d.props.indexOf(p); if (i >= 0) d.props.splice(i, 1); else d.props.push(p); ui.changed(); });
					ui.live(() => b.toggleClass('is-active', d.props.includes(p)));
				}
			} else if (d.kind === 'armor' || d.kind === 'shield') {
				const g = grid(panel, 2);
				const def = field(g, 'Defense', { help: d.kind === 'shield' ? 'Shields add to Defense: +2 buckler to +8 Dragon Shield.' : 'Cloth and leather add DEX; mail caps it (max 2); plate is flat.' });
				textInput(def.control, { value: d.armor ?? '', placeholder: d.kind === 'shield' ? '+4' : '4+DEX', code: true, label: 'Defense', onInput: v => { d.armor = v; ui.changed(); } });
				const str = field(g, 'STR needed');
				numberInput(str.control, { get: () => d.strength, placeholder: () => '0', set: v => { d.strength = v || undefined; }, min: 0, max: 6, label: 'STR needed', ui });
			}
			const g = grid(panel, 2);
			const cost = field(g, 'Price');
			const c = textInput(cost.control, { value: d.cost ?? '', label: 'Price', onInput: v => { d.cost = v; ui.changed(); } });
			ui.live(() => { c.placeholder = suggestedCost(d) ?? '10 gp'; });
			if (d.kind === 'magic' || d.kind === 'consumable') {
				const ch = field(g, 'Charges or uses', { help: 'Blank if it never runs out.' });
				textInput(ch.control, { value: d.charges ?? '', placeholder: '3, recharges at dawn', label: 'Charges', onInput: v => { d.charges = v; ui.changed(); } });
			}
			const text = field(panel, 'What it does', { wide: true });
			textArea(text.control, { value: d.text, placeholder: d.kind === 'consumable' ? '(1 action) Heal 2d4+4 HP.' : 'While you hold it, you hear the last minute of sound in the room.', label: 'What it does', rows: 2, onInput: v => { d.text = v; ui.changed(); } });
			if (d.kind !== 'gear') {
				const cat = field(panel, 'The catch', { wide: true, help: 'No item should be better than the others in every way. What does it cost the hero?' });
				textInput(cat.control, { value: d.catch, placeholder: 'Each use, roll a d6: on a 1 it cracks.', label: 'The catch', onInput: v => { d.catch = v; ui.changed(); } });
			}
			return;
		}
		section(panel, 'Review', ui.phone ? 'Tap Preview to see the card.' : 'The card on the right is what you\'ll get.');
		reviewRows(panel, ui, [
			['Name', 'start', () => d.name.trim() || 'Not named yet'],
			['Kind', 'start', () => [KIND_OPTIONS.find(k => k.value === d.kind)?.label, d.rarity].filter(Boolean).join(', ')],
			['Details', 'details', () => itemDetail(toItem(d))],
		]);
		folderField(panel, () => this.folder, v => { this.folder = v; }, 'A new note with the item. It joins the compendium, nimble:item: references and the character sheet\'s Add item.');
	}

	renderCheck(el: HTMLElement): void {
		const peers = bookPeers(this.d, bundledCompendium().items.filter(i => i.source !== 'Homebrew'));
		const guide = rarityGuide(this.d);
		if (!peers.length && !guide) return;
		el.createDiv({ cls: 'eb-check-kicker', text: 'From the book' });
		if (guide) el.createDiv({ cls: 'eb-check-text', text: guide });
		for (const p of peers) {
			const r = el.createDiv({ cls: 'eb-peer' });
			r.createSpan({ cls: 'eb-peer-name', text: p.name });
			r.createSpan({ cls: 'eb-peer-detail', text: itemDetail(p) });
		}
	}

	renderPreview(el: HTMLElement): void {
		const hit = new Compendium({ items: [{ ...itemForCompendium(toItem(this.d)), source: 'Homebrew' }] }).all()[0];
		if (hit) renderHitCard(el, hit, pluginCardOptions(this.plugin, hit.name));
	}

	checkChip(): { text: string; tone: 'ok' | 'high' | 'low' | 'none' } { return { text: '', tone: 'none' }; }

	missing(): string | null { return this.d.name.trim() ? null : 'Give it a name.'; }

	output(): Output {
		return { lang: ITEM_LANG, body: itemSource(this.d), name: this.d.name.trim(), frontmatter: { nimble: 'item' }, folder: this.folder };
	}
}

function fromItem(it: HomebrewItem): ItemDraft {
	const kind = (['weapon', 'armor', 'shield', 'consumable', 'magic', 'gear'] as ItemKind[]).find(k => k === it.category) ?? (it.category === 'wand' || it.category === 'scroll' ? 'magic' : 'gear');
	const text = it.text ?? '';
	const c = text.match(/\s*\*\*Catch:\*\*\s*(.+)$/);
	return {
		...newItemDraft(kind), name: it.name, rarity: (RARITIES as readonly string[]).includes(it.rarity ?? '') ? it.rarity as Rarity : '',
		damage: it.damage, stat: it.stat === 'DEX' ? 'DEX' : 'STR', damageType: it.damageType ?? '', props: it.properties ?? [], armor: it.armor,
		strength: it.strength, cost: it.cost, charges: it.charges, text: c ? text.slice(0, c.index).trim() : text, catch: c ? c[1].trim() : '',
	};
}

export function registerHomebrewBuilders(): void {
	registerKind('spell', (plugin, seed) => new SpellBuilder(plugin, seed));
	registerKind('item', (plugin, seed) => new ItemBuilder(plugin, seed));
}
