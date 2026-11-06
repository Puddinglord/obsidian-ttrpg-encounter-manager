// Quick look: click a monster pill, an NPC, or anyone in the tracker and their
// sheet opens in a modal over what you're doing, instead of jumping to their
// page. Monsters show their Nimble stat block; NPCs and heroes show their note.
// From the tracker the modal also shows the fight: HP (tap for the calculator),
// turn, actions, Wounds and statuses, kept live. "Open page" goes to the note
// when you do want it.

import { App, Component, EventRef, MarkdownRenderer, Modal, Notice, setIcon, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { EncounterCreature, MonsterIndexEntry } from './types';
import { isDown, isHero, isMinionGroup } from './encounters';
import { conditionLabel, formatLevel, monsterRole } from './rules';
import { openHpCalculator } from './hp-pad';
import { closePopover } from './popover';
import { portraitOf, renderAvatar } from './npc-card';

export type RecordTarget =
	| { kind: 'monster'; entry: MonsterIndexEntry; sourcePath?: string }
	| { kind: 'note'; file: TFile; sourcePath?: string; subtitle?: string }
	| { kind: 'combatant'; encId: string; creatureId: string };

export function openRecord(plugin: NimbleStatblocksPlugin, target: RecordTarget): void {
	closePopover();
	plugin.hover.hide();
	new RecordModal(plugin.app, plugin, target).open();
}

class RecordModal extends Modal {
	private component = new Component();
	private ref: EventRef | null = null;
	private strip: HTMLElement | null = null;

	constructor(app: App, private plugin: NimbleStatblocksPlugin, private target: RecordTarget) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-record-modal');
		this.component.load();
		const t = this.target;
		if (t.kind === 'combatant') {
			// Keep the combat strip current while the modal is open.
			this.ref = this.plugin.encounters.on('changed', () => {
				const c = this.creature();
				if (!c) { this.close(); return; }
				this.renderStrip(c);
			});
		}
		void this.render();
	}

	onClose(): void {
		if (this.ref) this.plugin.encounters.offref(this.ref);
		closePopover();
		this.component.unload();
		this.contentEl.empty();
	}

	private creature(): EncounterCreature | undefined {
		const t = this.target;
		return t.kind === 'combatant' ? this.plugin.encounters.creature(t.encId, t.creatureId) : undefined;
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
		titles.createDiv({ cls: 'record-title', text: c?.label ?? src.entry?.name ?? src.file?.basename ?? '' });
		const sub = this.subtitle(c, src);
		if (sub) titles.createDiv({ cls: 'record-sub', text: sub });
		const actions = head.createDiv({ cls: 'record-actions' });
		if (t.kind === 'monster') {
			const add = actions.createEl('button', { cls: 'record-btn' });
			setIcon(add.createSpan(), 'plus');
			add.createSpan({ text: 'Add to fight' });
			add.onclick = (e) => { void this.plugin.addToEncounter(t.entry.monster, t.entry.filePath || undefined, e.shiftKey ? 2 : 1); };
		}
		const page = this.pageAction(src);
		if (page) {
			const open = actions.createEl('button', { cls: 'record-btn mod-cta' });
			setIcon(open.createSpan(), page.icon);
			open.createSpan({ text: page.label });
			open.onclick = (e) => { this.close(); page.run(e.metaKey || e.ctrlKey); };
		}

		// The fight, when opened from the tracker.
		if (c) { this.strip = contentEl.createDiv({ cls: 'record-strip' }); this.renderStrip(c); }

		const body = contentEl.createDiv({ cls: 'record-body' });
		if (src.entry && (!c || !isHero(c))) {
			this.plugin.renderStatblock(body, src.entry.monster, src.sourcePath, 'block');
		} else if (src.file) {
			const text = await this.app.vault.cachedRead(src.file);
			const md = text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
			await MarkdownRenderer.render(this.app, md || '*This page is empty.*', body.createDiv({ cls: 'record-note markdown-rendered' }), src.file.path, this.component);
		} else if (c && isHero(c)) {
			body.createDiv({ cls: 'record-empty', text: `${c.label} has no page in this vault. Make a note named "${c.monster.name}" to see it here.` });
		}
	}

	private subtitle(c: EncounterCreature | undefined, src: { entry?: MonsterIndexEntry; file?: TFile }): string {
		if (c && isHero(c)) return [c.monster.type, c.defense !== undefined ? `Defense ${c.defense}` : ''].filter(Boolean).join(' · ');
		if (this.target.kind === 'note') {
			const fm = this.app.metadataCache.getFileCache(this.target.file)?.frontmatter;
			return this.target.subtitle ?? (typeof fm?.role === 'string' ? fm.role : '');
		}
		const m = c?.monster ?? src.entry?.monster;
		if (!m) return '';
		const role = monsterRole(m);
		const lvl = formatLevel(m.level);
		const armor = m.armor === 'medium' ? 'Medium armor' : m.armor === 'heavy' ? 'Heavy armor' : 'No armor';
		return [lvl ? `Level ${lvl}` : '', role === 'legendary' ? (m.roleLabel || 'Legendary') : role === 'minion' ? 'Minion' : '', role === 'minion' ? '' : armor].filter(Boolean).join(' · ');
	}

	private pageAction(src: { entry?: MonsterIndexEntry; file?: TFile; sourcePath: string }): { label: string; icon: string; run: (newTab: boolean) => void } | null {
		if (src.file) return { label: 'Open page', icon: 'file-symlink', run: (tab) => void this.app.workspace.openLinkText(src.file!.path, src.sourcePath, tab) };
		const e = src.entry;
		if (!e) return null;
		if (e.filePath) return { label: 'Open page', icon: 'file-symlink', run: (tab) => void this.app.workspace.openLinkText(e.filePath, src.sourcePath, tab) };
		if (e.bundled) return { label: 'Open in bestiary', icon: 'book-open', run: () => void this.plugin.openBestiary(e.monster.bundledId) };
		return null;
	}

	/** HP, turn, actions, Wounds and statuses for a combatant, from the tracker. */
	private renderStrip(c: EncounterCreature): void {
		const t = this.target;
		if (!this.strip || t.kind !== 'combatant') return;
		const strip = this.strip;
		strip.empty();
		const enc = t.encId;
		const store = this.plugin.encounters;
		strip.toggleClass('is-down', isDown(c));

		const top = strip.createDiv({ cls: 'record-strip-row' });
		const turn = top.createEl('button', { cls: `record-turn${c.done ? ' is-done' : ''}` });
		setIcon(turn.createSpan(), c.done ? 'check-circle-2' : 'circle');
		turn.createSpan({ text: c.done ? 'Has gone' : 'Mark turn done' });
		turn.onclick = () => {
			const expired = store.setDone(enc, c.id, !c.done);
			if (expired.length) new Notice(`${c.label}: ${expired.join(', ')} wore off`);
		};

		const hpBox = top.createDiv({ cls: 'record-hp' });
		if (!isMinionGroup(c) && c.maxHp > 0) {
			const bar = hpBox.createDiv({ cls: 'record-hp-bar' });
			bar.createDiv({ cls: 'record-hp-fill' }).setCssProps({ '--fill': `${Math.max(0, Math.min(1, c.currentHp / c.maxHp)) * 100}%` });
		}
		const hp = hpBox.createEl('button', {
			cls: 'record-hp-btn',
			text: isMinionGroup(c) ? `${c.alive}/${c.count}` : c.maxHp > 0 ? `${c.currentHp}/${c.maxHp}${c.tempHp ? ` +${c.tempHp}` : ''}` : '—',
		});
		hp.onclick = () => openHpCalculator(hp, c, this.plugin.settings.autoArmor, (cmd) => { store.applyHp(enc, c.id, cmd); });

		if (isHero(c)) {
			const pips = strip.createDiv({ cls: 'record-pips' });
			const group = (label: string, n: number, max: number, cls: string, set: (v: number) => void) => {
				const g = pips.createDiv({ cls: `record-pip-group ${cls}` });
				g.createSpan({ cls: 'record-pip-label', text: label });
				for (let i = 0; i < max; i++) {
					const on = i < n;
					const p = g.createEl('button', { cls: `record-pip${on ? ' is-on' : ''}`, attr: { 'aria-pressed': String(on) } });
					p.onclick = () => set(on ? i : i + 1);
				}
			};
			group('Actions', c.actions ?? 3, 3, 'is-actions', (v) => store.setActions(enc, c.id, v));
			group('Wounds', c.wounds ?? 0, c.maxWounds ?? 6, 'is-wounds', (v) => store.setWounds(enc, c.id, v));
		}

		if (c.conditions.length) {
			const conds = strip.createDiv({ cls: 'record-conds' });
			for (const a of c.conditions) {
				const tag = conds.createSpan({ cls: 'record-cond' });
				tag.createSpan({ text: conditionLabel(a) });
				if (a.rounds) tag.createSpan({ cls: 'record-cond-rounds', text: `${a.rounds}r` });
				const x = tag.createEl('button', { cls: 'record-cond-x', text: '×', attr: { 'aria-label': `Remove ${a.name}` } });
				x.onclick = () => store.removeCondition(enc, c.id, a.name);
			}
		}
	}
}
