// Quick look: click a monster pill, an NPC, or anyone in the tracker and their
// sheet opens in a modal over what you're doing, instead of jumping to their
// page. Monsters show their Nimble stat block; NPCs and heroes show their note.
// From the tracker the modal also shows the fight: HP (tap for the calculator),
// turn, actions, Wounds and statuses, kept live. "Open page" goes to the note
// when you do want it.

import { App, Component, EventRef, MarkdownRenderer, Modal, Notice, setIcon, TFile } from 'obsidian';
import { baseCreatureName } from './compendium-entries';
import type EmberVaultPlugin from '../../../main';
import { EncounterCreature, MonsterIndexEntry } from './types';
import { isDown, isHero, isMinionGroup, shownLabel } from './encounters';
import { conditionLabel, formatLevel, HpCommand, monsterRole } from './rules';
import { renderActionDots, renderMeter, renderWoundPips, VitalsMemory } from './vitals-ui';
import { openHpCalculator } from './hp-pad';
import { closePopover } from '../../core/popover';
import { portraitOf, renderAvatar } from '../../core/npc-card';
import { nimble } from './runtime';
import { pill } from '../../core/pill';
import { applyLook } from '../../core/look';
import { evIcon } from '../../core/icons';

/** The meter's − / + / keypad in the game's icons, as on the sheet. */
const METER_ICONS = { minus: evIcon('minus'), plus: evIcon('plus'), calc: evIcon('keypad') };

export type RecordTarget =
	| { kind: 'monster'; entry: MonsterIndexEntry; sourcePath?: string }
	| { kind: 'note'; file: TFile; sourcePath?: string; subtitle?: string }
	| { kind: 'combatant'; encId: string; creatureId: string };

export function openRecord(plugin: EmberVaultPlugin, target: RecordTarget): Modal {
	closePopover();
	plugin.hover.hide();
	const m = new RecordModal(plugin.app, plugin, target);
	m.open();
	return m;
}

class RecordModal extends Modal {
	private component = new Component();
	private ref: EventRef | null = null;
	private strip: HTMLElement | null = null;
	/** Bars and pips as last drawn, so changes animate (shared with the character sheet). */
	private vitals = new VitalsMemory();

	constructor(app: App, private plugin: EmberVaultPlugin, private target: RecordTarget) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-record-modal');
		// Nimble's paper and type, like the tracker it opens over.
		applyLook(this.modalEl, 'nimble');
		this.component.load();
		const t = this.target;
		if (t.kind === 'combatant') {
			// Keep the combat strip current while the modal is open.
			this.ref = nimble().encounters.on('changed', () => {
				const c = this.creature();
				if (!c) { this.close(); return; }
				this.renderStrip(c);
			});
		}
		void this.render();
	}

	onClose(): void {
		if (this.ref) nimble().encounters.offref(this.ref);
		closePopover();
		this.component.unload();
		this.contentEl.empty();
	}

	private creature(): EncounterCreature | undefined {
		const t = this.target;
		return t.kind === 'combatant' ? nimble().encounters.creature(t.encId, t.creatureId) : undefined;
	}

	/** The combatant's name as the tracker shows it (a lone monster without its number). */
	private shown(c: EncounterCreature): string {
		const t = this.target;
		const enc = t.kind === 'combatant' ? nimble().encounters.find(t.encId) : undefined;
		return enc ? shownLabel(c, enc.creatures) : c.label;
	}

	/** The monster entry or note behind the target, if any. */
	private source(): { entry?: MonsterIndexEntry; file?: TFile; sourcePath: string } {
		const t = this.target;
		const app = this.app;
		if (t.kind === 'monster') return { entry: t.entry, sourcePath: t.sourcePath ?? '' };
		if (t.kind === 'note') return { file: t.file, sourcePath: t.sourcePath ?? '' };
		const c = this.creature();
		if (!c) return { sourcePath: '' };
		if (isHero(c)) {
			// A hero's page, if the vault has a note with their name.
			const file = app.metadataCache.getFirstLinkpathDest(c.monster.name, '') ?? undefined;
			return { file, sourcePath: '' };
		}
		const entry: MonsterIndexEntry = { name: c.monster.name, filePath: c.sourceFile || '', monster: c.monster, bundled: !c.sourceFile && !!c.monster.bundledId };
		return { entry, sourcePath: c.sourceFile ?? '' };
	}

	private async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		const t = this.target;
		const c = this.creature();
		const src = this.source();

		// Header: name, a line about them, and the page buttons.
		const head = contentEl.createDiv({ cls: 'record-head' });
		const portraitFile = src.file ?? null;
		const portrait = portraitFile ? portraitOf(this.app, portraitFile.path) : null;
		if (portrait) renderAvatar(head, portrait, 'record-avatar');
		const titles = head.createDiv({ cls: 'record-titles' });
		titles.createDiv({ cls: 'record-title', text: (c ? this.shown(c) : undefined) ?? src.entry?.name ?? src.file?.basename ?? '' });
		const sub = this.subtitle(c, src);
		if (sub) titles.createDiv({ cls: 'record-sub', text: sub });
		const actions = head.createDiv({ cls: 'record-actions' });
		const lore = !c && !!src.entry && this.plugin.hideStats(src.entry.filePath, src.sourcePath || undefined);
		if (t.kind === 'monster' && !lore) {
			const add = pill(actions, { tag: 'button', cls: 'record-btn', icon: evIcon('plus'), text: 'Add to fight' });
			add.onclick = (e) => { void nimble().addToEncounter(t.entry.monster, t.entry.filePath || undefined, e.shiftKey ? 2 : 1); };
		}
		// Players keep their own notes on a creature: add them, or open them.
		if (lore && src.entry) {
			const name = baseCreatureName(src.entry.name);
			const noted = !!nimble().creatureNote(name);
			const notes = pill(actions, { tag: 'button', cls: 'record-btn', icon: evIcon(noted ? 'edit' : 'note'), text: noted ? 'Open notes' : 'Add notes' });
			notes.onclick = () => { this.close(); void nimble().openCreatureNote(name); };
		}
		const page = this.pageAction(src);
		if (page) {
			const open = pill(actions, { tag: 'button', cls: 'record-btn mod-cta', icon: page.icon, text: page.label });
			open.onclick = (e) => { this.close(); page.run(e.metaKey || e.ctrlKey); };
		}

		// The fight, when opened from the tracker.
		if (c) { this.strip = contentEl.createDiv({ cls: 'record-strip' }); this.renderStrip(c); }

		const body = contentEl.createDiv({ cls: 'record-body' });
		if (src.entry && (!c || !isHero(c))) {
			// The quick look shows the same block as the note, a size down.
			nimble().renderStatblock(body, src.entry.monster, src.sourcePath, 'block', undefined, { lore, compact: true });
		} else if (src.file) {
			const text = await this.app.vault.cachedRead(src.file);
			const md = text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
			await MarkdownRenderer.render(this.app, md || '*This page is empty.*', body.createDiv({ cls: 'record-note markdown-rendered' }), src.file.path, this.component);
		} else if (c && isHero(c)) {
			body.createDiv({ cls: 'record-empty', text: `${this.shown(c)} has no page in this vault. Make a note named "${c.monster.name}" to see it here.` });
		}
	}

	private subtitle(c: EncounterCreature | undefined, src: { entry?: MonsterIndexEntry; file?: TFile; sourcePath?: string }): string {
		if (c && isHero(c)) return [c.monster.type, c.defense !== undefined ? `Defense ${c.defense}` : ''].filter(Boolean).join(' · ');
		if (this.target.kind === 'note') {
			const fm = this.app.metadataCache.getFileCache(this.target.file)?.frontmatter;
			return this.target.subtitle ?? (typeof fm?.role === 'string' ? fm.role : '');
		}
		const m = c?.monster ?? src.entry?.monster;
		if (!m) return '';
		if (!c && src.entry && this.plugin.hideStats(src.entry.filePath, src.sourcePath || undefined)) return [m.group, m.type].filter(Boolean).join(' · ');
		const role = monsterRole(m);
		const lvl = formatLevel(m.level);
		const armor = m.armor === 'medium' ? 'Medium armor' : m.armor === 'heavy' ? 'Heavy armor' : 'No armor';
		return [lvl ? `Level ${lvl}` : '', role === 'legendary' ? (m.roleLabel || 'Legendary') : role === 'minion' ? 'Minion' : '', role === 'minion' ? '' : armor].filter(Boolean).join(' · ');
	}

	private pageAction(src: { entry?: MonsterIndexEntry; file?: TFile; sourcePath: string }): { label: string; icon: string; run: (newTab: boolean) => void } | null {
		if (src.file) return { label: 'Open page', icon: evIcon('open'), run: (tab) => void this.app.workspace.openLinkText(src.file!.path, src.sourcePath, tab) };
		const e = src.entry;
		if (!e) return null;
		if (e.filePath) return { label: 'Open page', icon: evIcon('open'), run: (tab) => void this.app.workspace.openLinkText(e.filePath, src.sourcePath, tab) };
		if (e.bundled) return { label: 'Open in compendium', icon: evIcon('books'), run: () => void nimble().openBestiary(e.monster.bundledId) };
		return null;
	}

	/** HP, turn, actions, Wounds and statuses for a combatant, from the tracker. */
	private renderStrip(c: EncounterCreature): void {
		const t = this.target;
		if (!this.strip || t.kind !== 'combatant') return;
		const strip = this.strip;
		strip.empty();
		const enc = t.encId;
		const store = nimble().encounters;
		strip.toggleClass('is-down', isDown(c));

		// The character sheet's own pieces (HP bar, Wounds, action dots, the End-style pill, conditions),
		// driving the fight instead of the note.
		const sheet = strip.createDiv({ cls: 'nimble-sheet ns-embed' });
		const hpCmd = (cmd: HpCommand) => { store.applyHp(enc, c.id, cmd); };
		const meters = sheet.createDiv({ cls: 'ns-meters' });
		if (isMinionGroup(c)) {
			const alive = c.alive ?? 0;
			const count = c.count ?? 0;
			renderMeter(meters, {
				key: 'alive', cls: 'is-hp', icon: evIcon('users'), label: 'Standing', cur: alive, max: count,
				bar: 'ns-hp', minus: 'Drop one', plus: 'Bring one back', calc: `${alive} of ${count} standing. Hit, bring back or set`,
				minusOff: alive <= 0, plusOff: alive >= count, icons: METER_ICONS, twoTone: true,
				onCalc: (a) => openHpCalculator(a, c, this.plugin.settings.autoArmor, hpCmd, { label: this.shown(c) }),
				taps: { floor: -alive, commit: (d) => { if (d) store.setAlive(enc, c.id, alive + d); else this.renderStrip(c); } },
			}, this.vitals);
		} else if (c.maxHp > 0) {
			const temp = c.tempHp ?? 0;
			const hp = renderMeter(meters, {
				key: 'hp', cls: 'is-hp', icon: evIcon('heart'), label: 'Hit points', cur: c.currentHp, max: c.maxHp, extra: temp, extraLabel: `${temp} temp`,
				state: isDown(c) ? (isHero(c) ? 'Dead' : 'Down') : undefined,
				bar: 'ns-hp', minus: 'Take 1 damage', plus: 'Heal 1', calc: `Hit points ${c.currentHp} of ${c.maxHp}${temp ? `, ${temp} temp` : ''}. Damage, heal, set or temp HP`,
				minusOff: false, plusOff: c.currentHp >= c.maxHp, icons: METER_ICONS, twoTone: true,
				onCalc: (a) => openHpCalculator(a, c, this.plugin.settings.autoArmor, hpCmd, { label: this.shown(c) }),
				taps: {
					floor: -(c.currentHp + temp), soak: temp,
					commit: (d) => {
						if (!d) { this.renderStrip(c); return; }
						hpCmd(d < 0 ? { kind: 'damage', amount: -d, crit: false } : { kind: 'heal', amount: d });
					},
				},
			}, this.vitals);
			if (isHero(c)) renderWoundPips(hp, { wounds: c.wounds ?? 0, max: c.maxWounds ?? 6, set: (n) => store.setWounds(enc, c.id, n) }, this.vitals);
		}

		// This turn: action dots (heroes) and the turn pill.
		const turn = sheet.createDiv({ cls: 'ns-turn' });
		const card = turn.createDiv({ cls: 'ns-actions-card' });
		if (isHero(c)) {
			card.createSpan({ cls: 'ns-chip-label ns-actions-label', text: 'Actions' });
			renderActionDots(card, { count: c.actions ?? 3, perTurn: 3, set: (n) => store.setActions(enc, c.id, n) }, this.vitals);
		}
		const done = pill(card, { tag: 'button', cls: `ns-actions-end${c.done ? ' is-done' : ''}`, icon: evIcon(c.done ? 'check-circle' : 'check'), text: c.done ? 'Has gone' : 'Mark turn done', attr: { 'aria-pressed': String(!!c.done) } });
		done.onclick = () => {
			const expired = store.setDone(enc, c.id, !c.done);
			if (expired.length) new Notice(`${this.shown(c)}: ${expired.join(', ')} wore off`);
		};

		// Conditions, as on the sheet.
		if (c.conditions.length) {
			const row = sheet.createDiv({ cls: 'ns-conds-row has-conds' });
			row.createSpan({ cls: 'ns-chip-label ns-conds-label', text: 'Conditions' });
			const conds = row.createDiv({ cls: 'ns-conds' });
			for (const a of c.conditions) {
				const tag = conds.createSpan({ cls: 'ns-cond' });
				tag.createEl('button', { cls: 'ns-cond-name', text: a.rounds ? `${conditionLabel(a)} · ${a.rounds}r` : conditionLabel(a) })
					.addEventListener('click', (e) => nimble().showConditionInfo(e.currentTarget as HTMLElement, a.name));
				const x = tag.createEl('button', { cls: 'ns-cond-x', attr: { 'aria-label': `Remove ${a.name}` } });
				setIcon(x, evIcon('x'));
				x.onclick = () => store.removeCondition(enc, c.id, a.name);
			}
		}
	}
}
