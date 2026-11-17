// The spell and item builders' steps. Numbers come from entity-homebrew.ts;
// the cards they preview are the compendium's own.

import { setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { Compendium, CompendiumHit, Item, itemDetail, Spell, spellDetail } from './compendium';
import { pluginCardOptions, renderHitCard } from './compendium-card';
import { bundledCompendium } from './compendium-data';
import { diceAverage, formatDiceParts, parseDiceParts, RARITIES, Rarity, SPELL_DAMAGE } from './builder-math';
import { HomebrewItem, ITEM_LANG, ItemKind, itemForCompendium, SPELL_LANG } from './homebrew-def';
import {
	applyItemFix, applySpellFix, AreaShape, autoTier, bookPeers, HomebrewFix, ItemDraft, itemNotes, itemSource, newItemDraft, newSpellDraft, rarityGuide,
	RangeKind, SaveKey, SCHOOLS, SpellDraft, spellActions, spellDamage, spellExpected, spellNotes, spellSource, suggestedCost, suggestedScaling,
	suggestedUpcast, tierCheck, toItem, toSpell, WEAPON_PROPS,
} from './entity-homebrew';
import {
	BuilderUI, dicePad, field, folderPill, grid, homeFolder, iconButton, KindBuilder, meter, numberInput, Output, pill, registerKind, reviewNotesView,
	reviewRows, section, segmented, StepDef, suggestField, textArea, textInput,
} from './entity-builder';

const TIER_LABEL = (t: number) => (t === 0 ? 'Cantrip' : `Tier ${t}`);

/** Start from: search the compendium's spells or items, or show the one copied (with a way back to blank). */
function startFrom(f: ReturnType<typeof field>, o: {
	kind: 'spell' | 'item';
	copied: string | undefined;
	clear: () => void;
	pick: (hit: CompendiumHit) => void;
	placeholder: string;
}): void {
	if (o.copied) {
		const tpl = f.control.createDiv({ cls: 'eb-template' });
		setIcon(tpl.createSpan({ cls: 'eb-template-icon' }), 'copy');
		tpl.createSpan({ cls: 'eb-template-name', text: o.copied });
		tpl.createSpan({ cls: 'eb-template-meta' });
		iconButton(tpl, 'x', 'Start blank instead', o.clear);
		return;
	}
	suggestField<CompendiumHit>(f.control, {
		placeholder: o.placeholder, code: true, labelledBy: f.labelId, label: `Copy a ${o.kind}`, onInput: () => { /* searching */ },
		suggest: (q) => bundledCompendium().search(q, [o.kind], 6).map(h => ({ item: h, label: h.name, meta: o.kind === 'spell' ? spellDetail(h.entry as Spell) : itemDetail(h.entry as Item) })),
		onPick: (s) => o.pick(s.item),
	});
}

// ----------------------------------------------------------------------------
// Spells

class SpellBuilder implements KindBuilder {
	kind = 'spell' as const;
	noun = 'spell';
	icon = 'wand-2';
	d: SpellDraft = newSpellDraft();
	/** The book spell this one was copied from. */
	private copied?: string;
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
			section(panel, 'What are you casting?', 'Pick a school and tier, then Create: damage, actions and range come from the Creator\'s Kit.');
			const top = grid(panel, 2);
			const name = field(top, 'Name');
			textInput(name.control, { value: d.name, placeholder: 'Ember Lash', words: true, labelledBy: name.labelId, label: 'Name', onInput: v => { d.name = v; ui.changed(); } });
			const from = field(top, 'Start from', { help: this.copied ? undefined : 'Copy a spell and change what you like.' });
			startFrom(from, {
				kind: 'spell', copied: this.copied, placeholder: 'Blank, or search: ignite, frost…',
				clear: () => { const n = this.d.name; this.d = { ...newSpellDraft(), name: n }; this.copied = undefined; ui.rebuild(); },
				pick: (hit) => { const n = this.d.name; this.d = { ...fromSpell(hit.entry as Spell), name: n }; this.copied = hit.name; ui.rebuild(); },
			});

			const mid = grid(panel, 2);
			const kind = field(mid, 'Kind');
			segmented<boolean>(kind.control, [{ value: false, label: 'Damage', icon: 'flame' }, { value: true, label: 'Utility', icon: 'sparkle' }], () => d.utility, v => { d.utility = v; }, { label: 'Kind', labelledBy: kind.labelId, ui });
			const tier = field(mid, 'Tier');
			const tw = tier.control.createDiv({ cls: 'eb-level' });
			const down = iconButton(tw, 'minus', 'Lower tier', () => { d.autoTier = false; d.tier = Math.max(0, d.tier - 1); ui.changed(); }, 'eb-num-btn');
			const value = tw.createDiv({ cls: 'eb-level-value eb-tier-value' });
			const up = iconButton(tw, 'plus', 'Higher tier', () => { d.autoTier = false; d.tier = Math.min(9, d.tier + 1); ui.changed(); }, 'eb-num-btn');
			const auto = tw.createEl('button', { cls: 'eb-auto', attr: { 'aria-label': 'Follow the damage you type' } });
			auto.createSpan({ cls: 'eb-t', text: 'Auto' });
			auto.addEventListener('click', () => { d.autoTier = !d.autoTier; this.settle(); ui.changed(); });
			tier.help.removeClass('is-empty');
			ui.live(() => {
				this.settle();
				value.setText(TIER_LABEL(d.tier));
				auto.toggleClass('is-active', d.autoTier);
				down.disabled = d.tier <= 0;
				up.disabled = d.tier >= 9;
				tier.help.setText(d.tier === 0 ? 'Costs no mana.' : `Costs ${d.tier} mana.`);
			});

			const school = field(panel, 'School', { wide: true });
			const row = school.control.createDiv({ cls: 'eb-row-wrap' });
			segmented<string>(row, SCHOOLS.map(s => ({ value: s, label: s })), () => d.school, v => { d.school = v; custom.value = ''; }, { label: 'School', labelledBy: school.labelId, ui, cls: 'is-compact' });
			const custom = textInput(row, { value: SCHOOLS.includes(d.school) ? '' : d.school, placeholder: 'Other', words: true, label: 'Other school', cls: 'eb-input-short', onInput: v => { d.school = v.trim() || 'Fire'; ui.changed(); } });
			return;
		}
		if (id === 'casting') {
			section(panel, 'Casting');
			const g = grid(panel, 2);
			const act = field(g, 'Actions');
			segmented<number>(act.control, [1, 2, 3].map(n => ({ value: n, label: String(n) })), () => spellActions(d), v => { d.actions = v; }, { label: 'Actions', labelledBy: act.labelId, ui });
			const conc = field(g, 'Concentration');
			textInput(conc.control, { value: d.concentration ?? '', placeholder: 'None, or up to 1 minute', labelledBy: conc.labelId, label: 'Concentration', onInput: v => { d.concentration = v; ui.changed(); } });
			const r = grid(panel, 2);
			const rk = field(r, 'Reach or range', { help: 'Range spells have disadvantage with an enemy adjacent.' });
			segmented<RangeKind>(rk.control, [{ value: 'range', label: 'Range' }, { value: 'reach', label: 'Reach' }, { value: 'self', label: 'Self' }], () => d.rangeKind, v => { d.rangeKind = v; d.distance = undefined; }, { label: 'Reach or range', labelledBy: rk.labelId, ui });
			const dist = field(r, 'Distance');
			numberInput(dist.control, { get: () => d.distance, placeholder: () => (d.rangeKind === 'reach' ? '1' : String(spellExpected(d).range)), set: v => { d.distance = v; }, min: 1, max: 60, label: 'Distance', labelledBy: dist.labelId, ui });
			ui.live(() => dist.row.toggleClass('is-hidden', d.rangeKind === 'self'));
			const area = field(panel, 'Area', { wide: true });
			const arow = area.control.createDiv({ cls: 'eb-row-wrap' });
			segmented<AreaShape>(arow, [{ value: 'none', label: 'One target' }, { value: 'aoe', label: 'Around' }, { value: 'cone', label: 'Cone' }, { value: 'line', label: 'Line' }, { value: 'square', label: 'Square' }],
				() => d.area, v => { d.area = v; d.areaSize = undefined; this.settle(); }, { label: 'Area', labelledBy: area.labelId, ui, cls: 'is-compact' });
			const sizeWrap = arow.createDiv({ cls: 'eb-inline-field' });
			sizeWrap.createSpan({ cls: 'eb-inline-label', text: 'Size' });
			numberInput(sizeWrap, { get: () => d.areaSize, placeholder: () => (d.area === 'square' ? '3' : d.area === 'line' ? '8' : '4'), set: v => { d.areaSize = v; }, min: 1, max: 30, label: 'Area size', ui });
			ui.live(() => {
				sizeWrap.toggleClass('is-hidden', d.area === 'none' || d.area === 'aoe');
				area.help.setText(d.area === 'none' ? '' : 'Area spells deal about 60% of a one-target spell.');
				area.help.toggleClass('is-empty', d.area === 'none');
			});
			const save = field(panel, 'Save', { wide: true, help: 'Half damage on a save.' });
			segmented<SaveKey>(save.control, [{ value: '', label: 'None' }, { value: 'STR', label: 'STR' }, { value: 'DEX', label: 'DEX' }, { value: 'INT', label: 'INT' }, { value: 'WIL', label: 'WIL' }], () => d.save, v => { d.save = v; }, { label: 'Save', labelledBy: save.labelId, ui, cls: 'is-compact' });
			return;
		}
		if (id === 'effect') {
			section(panel, 'Effect', d.utility ? undefined : 'More damage than the tier wants needs a drawback; less, a benefit.');
			const dmg = field(panel, d.utility ? 'Damage (optional)' : 'Damage', { wide: true });
			const input = textInput(dmg.control, { value: '', placeholder: '3d6+4', code: true, labelledBy: dmg.labelId, label: 'Damage', onInput: v => { d.damage = v; this.settle(); ui.changed(); } });
			ui.live(() => { if (activeDocument.activeElement !== input) input.value = spellDamage(d) ?? ''; });
			if (!d.utility) dicePad(dmg.row, {
				read: () => parseDiceParts(spellDamage(d) ?? ''),
				write: (p) => { d.sides = p.sides; d.damage = formatDiceParts(p).replace(/^d(\d+)$/, '1d$1'); this.settle(); },
				sides: () => d.sides, avg: () => diceAverage(spellDamage(d)), want: () => spellExpected(d).damage,
				reset: { shown: () => !!d.damage?.trim(), run: () => { d.damage = undefined; this.settle(); } }, dieMenu: true, ui,
			});
			const g = grid(panel, 2);
			if (d.tier === 0) {
				const sc = field(g, 'Higher levels');
				const t = textInput(sc.control, { value: d.scaling ?? '', labelledBy: sc.labelId, label: 'Higher levels', onInput: v => { d.scaling = v; ui.changed(); } });
				ui.live(() => { t.placeholder = suggestedScaling(d) ?? '+2 Range every 5 levels.'; });
			} else {
				const up = field(g, 'Upcast (each extra mana)');
				const t = textInput(up.control, { value: d.upcast ?? '', labelledBy: up.labelId, label: 'Upcast', onInput: v => { d.upcast = v; ui.changed(); } });
				ui.live(() => { t.placeholder = suggestedUpcast(d) ?? '+1 target.'; });
			}
			const text = field(panel, 'What it does', { wide: true });
			textArea(text.control, { value: d.text, placeholder: 'A whip of flame cracks across one target. On a crit, it\'s Smoldering.', labelledBy: text.labelId, label: 'What it does', rows: 3, onInput: v => { d.text = v; ui.changed(); } });
			return;
		}
		const head = section(panel, 'Review');
		head.addClass('has-aside');
		folderPill(head, { app: this.plugin.app, get: () => this.folder, set: (p) => { this.folder = p; } });
		reviewRows(panel, ui, [
			['School and tier', 'start', () => `${d.school}, ${TIER_LABEL(d.tier).toLowerCase()}${d.utility ? ' (utility)' : ''}`],
			['Casting', 'casting', () => [toSpell(d).actions, toSpell(d).range, toSpell(d).aoe].filter(Boolean).join(' · ')],
			['Damage', 'effect', () => toSpell(d).damage ?? 'None'],
		]);
		reviewNotesView(panel, ui, () => spellNotes(this.d).map(n => ({ ...n, fixes: n.fixes.map(f => ({ label: f.label, run: () => this.fix(f.fix, ui) })) })));
	}

	private fix(f: HomebrewFix, ui: BuilderUI): void {
		if (f.kind === 'go') { ui.go(f.step); return; }
		this.d = applySpellFix(this.d, f);
		ui.rebuild();
	}

	renderCheck(el: HTMLElement): void {
		const c = tierCheck(this.d);
		if (!c) return;
		const head = el.createDiv({ cls: 'eb-check-head' });
		const big = head.createDiv({ cls: 'eb-check-level' });
		big.createSpan({ cls: 'eb-check-kicker', text: 'Hits like' });
		big.createSpan({ cls: 'eb-check-value', text: TIER_LABEL(c.tier).toLowerCase() });
		const tone = c.verdict === 0 ? 'ok' : c.verdict > 0 ? 'high' : 'low';
		pill(head, c.verdict === 0 ? `Right for ${TIER_LABEL(this.d.tier).toLowerCase()}` : c.verdict > 0 ? 'Hits hard: give it a drawback' : 'Hits light: give it a benefit', `eb-verdict tone-${tone}`);
		meter(el, this.d.area === 'none' ? 'Average damage' : 'Average damage (area)', c.have, c.want);
		el.createDiv({ cls: 'eb-check-text', text: `The Creator's Kit: cantrip ${SPELL_DAMAGE[0]}, tier 1 ${SPELL_DAMAGE[1]}, tier 3 ${SPELL_DAMAGE[3]}, tier 5 ${SPELL_DAMAGE[5]}, tier 9 ${SPELL_DAMAGE[9]}.` });
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
	const sides = parseDiceParts(s.damage ?? '')?.sides;
	return {
		...d, name: s.name, school: s.school ?? d.school, tier: s.tier ?? 0, utility: !!s.utility,
		actions: parseInt(s.actions ?? '', 10) || undefined,
		rangeKind: /^self/i.test(s.range ?? '') ? 'self' : range ? (range[1].toLowerCase() as RangeKind) : 'range',
		distance: range ? Number(range[2]) : undefined,
		area: area ? (area[1].toLowerCase() as AreaShape) : sq ? 'square' : s.aoe ? 'aoe' : 'none',
		areaSize: area ? Number(area[2]) : sq ? Number(sq[1]) : undefined,
		concentration: s.concentration, damage: s.damage, upcast: s.higherLevels, scaling: s.cantripScaling, sides: sides ?? d.sides,
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
	private copied?: string;
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
			section(panel, 'What are you making?', 'Pick what it is and how rare, then Create.');
			const top = grid(panel, 2);
			const name = field(top, 'Name');
			textInput(name.control, { value: d.name, placeholder: 'Lantern of Echoes', words: true, labelledBy: name.labelId, label: 'Name', onInput: v => { d.name = v; ui.changed(); } });
			const from = field(top, 'Start from', { help: this.copied ? undefined : 'Copy an item and change what you like.' });
			startFrom(from, {
				kind: 'item', copied: this.copied, placeholder: 'Blank, or search: longsword, potion…',
				clear: () => { const n = this.d.name; this.d = { ...newItemDraft(this.d.kind), name: n }; this.copied = undefined; ui.rebuild(); },
				pick: (hit) => { const n = this.d.name; this.d = { ...fromItem(hit.entry as HomebrewItem), name: n }; this.copied = hit.name; ui.rebuild(); },
			});
			const kind = field(panel, 'Kind', { wide: true });
			segmented<ItemKind>(kind.control, KIND_OPTIONS, () => d.kind, v => { if (v !== d.kind) { d.kind = v; ui.rebuild(); } }, { label: 'Kind', labelledBy: kind.labelId, ui, cls: 'is-wrap is-compact eb-seg-3' });
			const rarity = field(panel, 'Rarity', { wide: true });
			segmented<Rarity | ''>(rarity.control, [{ value: '', label: 'Mundane' }, ...RARITIES.map(r => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }))], () => d.rarity, v => { d.rarity = v; }, { label: 'Rarity', labelledBy: rarity.labelId, ui, cls: 'is-wrap is-compact eb-seg-3' });
			ui.live(() => {
				const g = rarityGuide(d);
				rarity.help.setText(g ?? '');
				rarity.help.toggleClass('is-empty', !g);
			});
			return;
		}
		if (id === 'details') {
			section(panel, 'Details', d.kind === 'magic' || (d.rarity && d.rarity !== 'common') ? 'Memorable items have a trade-off.' : undefined);
			if (d.kind === 'weapon') {
				const dmg = field(panel, 'Damage', { wide: true });
				const input = textInput(dmg.control, { value: d.damage ?? '', placeholder: '1d6', code: true, labelledBy: dmg.labelId, label: 'Damage', onInput: v => { d.damage = v; ui.changed(); } });
				dicePad(dmg.row, {
					read: () => parseDiceParts(d.damage || '1d6'), write: (p) => { d.damage = formatDiceParts(p).replace(/^d(\d+)$/, '1d$1'); input.value = d.damage; },
					sides: () => 6, avg: () => diceAverage(d.damage || '1d6'), dieMenu: true, ui,
				});
				const g = grid(panel, 2);
				const stat = field(g, 'Stat');
				segmented<'STR' | 'DEX'>(stat.control, [{ value: 'STR', label: 'STR' }, { value: 'DEX', label: 'DEX' }], () => d.stat, v => { d.stat = v; }, { label: 'Stat', labelledBy: stat.labelId, ui });
				const type = field(g, 'Damage type');
				textInput(type.control, { value: d.damageType, placeholder: 'slashing', labelledBy: type.labelId, label: 'Damage type', onInput: v => { d.damageType = v; ui.changed(); } });
				const props = field(panel, 'Properties', { wide: true });
				const chips = props.control.createDiv({ cls: 'eb-modes' });
				for (const p of WEAPON_PROPS) {
					const b = chips.createEl('button', { cls: 'eb-chip-toggle', attr: { 'aria-pressed': 'false' } });
					b.createSpan({ cls: 'eb-t', text: p });
					b.addEventListener('click', () => { const i = d.props.indexOf(p); if (i >= 0) d.props.splice(i, 1); else d.props.push(p); ui.changed(); });
					ui.live(() => { b.toggleClass('is-active', d.props.includes(p)); b.setAttr('aria-pressed', String(d.props.includes(p))); });
				}
			} else if (d.kind === 'armor' || d.kind === 'shield') {
				const g = grid(panel, 2);
				const def = field(g, 'Defense', { help: d.kind === 'shield' ? 'Book shields: +2 to +8.' : 'Mail caps DEX at 2; plate is flat.' });
				textInput(def.control, { value: d.armor ?? '', placeholder: d.kind === 'shield' ? '+4' : '4+DEX', code: true, labelledBy: def.labelId, label: 'Defense', onInput: v => { d.armor = v; ui.changed(); } });
				const str = field(g, 'STR needed');
				numberInput(str.control, { get: () => d.strength, placeholder: () => '0', set: v => { d.strength = v || undefined; }, min: 0, max: 6, label: 'STR needed', labelledBy: str.labelId, ui });
			}
			const g = grid(panel, 2);
			const cost = field(g, 'Price');
			const c = textInput(cost.control, { value: d.cost ?? '', labelledBy: cost.labelId, label: 'Price', onInput: v => { d.cost = v; ui.changed(); } });
			ui.live(() => { c.placeholder = suggestedCost(d) ?? '10 gp'; });
			if (d.kind === 'magic' || d.kind === 'consumable') {
				const ch = field(g, 'Charges or uses');
				textInput(ch.control, { value: d.charges ?? '', placeholder: 'None, or 3 (recharges at dawn)', labelledBy: ch.labelId, label: 'Charges', onInput: v => { d.charges = v; ui.changed(); } });
			}
			const text = field(panel, 'What it does', { wide: true });
			textArea(text.control, { value: d.text, placeholder: d.kind === 'consumable' ? '(1 action) Heal 2d4+4 HP.' : 'While you hold it, you hear the last minute of sound in the room.', labelledBy: text.labelId, label: 'What it does', rows: 2, onInput: v => { d.text = v; ui.changed(); } });
			if (d.kind !== 'gear') {
				const cat = field(panel, 'The catch', { wide: true });
				textInput(cat.control, { value: d.catch, placeholder: 'Each use, roll a d6: on a 1 it cracks.', labelledBy: cat.labelId, label: 'The catch', onInput: v => { d.catch = v; ui.changed(); } });
			}
			return;
		}
		const head = section(panel, 'Review');
		head.addClass('has-aside');
		folderPill(head, { app: this.plugin.app, get: () => this.folder, set: (p) => { this.folder = p; } });
		reviewRows(panel, ui, [
			['Kind', 'start', () => [KIND_OPTIONS.find(k => k.value === d.kind)?.label, d.rarity].filter(Boolean).join(', ')],
			['Details', 'details', () => itemDetail(toItem(d))],
		]);
		reviewNotesView(panel, ui, () => itemNotes(this.d).map(n => ({ ...n, fixes: n.fixes.map(f => ({ label: f.label, run: () => this.fix(f.fix, ui) })) })));
	}

	private fix(f: HomebrewFix, ui: BuilderUI): void {
		if (f.kind === 'go') { ui.go(f.step); return; }
		this.d = applyItemFix(this.d, f);
		ui.rebuild();
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
