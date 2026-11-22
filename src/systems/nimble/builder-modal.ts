// Encounter builder: pick monsters, see difficulty against the party live,
// then save to a note block, insert one, or run it straight away. A wide game
// dialog (core/dialog.ts) in Nimble's look: the rating as the encounter
// block's tag over a meter, the bestiary on the left, the fight on the right.

import { MarkdownView, Modal, Notice, setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { EncounterDef, encounterBlockSource } from '../../core/encounter-def';
import { BalanceTarget, budgetPhrase, formatLevel, levelValue, monsterRole, partyPhrase, rateEncounter, shiftMonster } from './rules';
import { renderBalance } from './balance-ui';
import { partyLevels, ratingChip, runEncounter } from './encounter-block';
import { describeMonster } from './suggest';
import { isTouch } from '../../core/touch';
import { attachMonsterHover } from './inline-ref';
import { nimble } from './runtime';
import { fighterFor } from './fighters';
import { dialogFoot, dialogLabel, gameDialog } from '../../core/dialog';
import { evIcon } from '../../core/icons';
import { pill, setPill } from '../../core/pill';

/** Where the meter's bands start (share of the budget), and what they're called. */
const BANDS = [[0.5, 'Easy'], [0.75, 'Medium'], [1, 'Hard'], [1.25, 'Deadly'], [1.5, 'Very Deadly']] as const;
const METER_MAX = 1.75;

export class BuilderModal extends Modal {
	private def: EncounterDef;
	private query = '';
	private resultsEl!: HTMLElement;
	private pickedEl!: HTMLElement;
	private pickedCount: HTMLElement | null = null;
	private ratingEl!: HTMLElement;
	private balanceTarget?: BalanceTarget;

	/** `onSave` writes the result back (editing a block, `from` its note); without it the modal inserts a new block. */
	constructor(private plugin: EmberVaultPlugin, def?: EncounterDef, private onSave?: (def: EncounterDef) => void, private from?: string) {
		super(plugin.app);
		this.def = def ? JSON.parse(JSON.stringify(def)) as EncounterDef : { name: 'New encounter', party: plugin.settings.party.length > 0, monsters: [] };
	}

	onOpen(): void {
		gameDialog(this, 'nimble', { cls: 'nimble-builder-modal' });
		this.titleEl.setText(this.onSave ? 'Edit encounter' : 'Build an encounter');
		const c = this.contentEl;
		c.empty();

		const top = c.createDiv({ cls: 'builder-top' });
		const name = top.createEl('input', { type: 'text', cls: 'builder-name', attr: { 'aria-label': 'Encounter name', placeholder: 'Encounter name' } });
		name.value = this.def.name;
		name.addEventListener('input', () => { this.def.name = name.value.trim() || 'Encounter'; });
		// The party joins the fight when it's run: a toggle, ticked when on.
		const party = pill(top, { tag: 'button', cls: 'builder-party', attr: { role: 'switch' } });
		const drawParty = () => {
			setPill(party, { icon: evIcon(this.def.party ? 'check' : 'users'), text: 'Add the party when run' });
			party.toggleClass('is-on', this.def.party);
			party.setAttr('aria-checked', String(this.def.party));
		};
		party.addEventListener('click', () => { this.def.party = !this.def.party; drawParty(); });
		drawParty();

		this.ratingEl = c.createDiv({ cls: 'builder-rating' });

		const cols = c.createDiv({ cls: 'builder-cols' });
		const left = cols.createDiv({ cls: 'builder-col' });
		dialogLabel(left, 'Monsters');
		const field = left.createDiv({ cls: 'builder-search-field' });
		setIcon(field.createSpan({ cls: 'builder-search-icon', attr: { 'aria-hidden': 'true' } }), evIcon('search'));
		const search = field.createEl('input', { type: 'search', cls: 'builder-search', attr: { placeholder: 'Search monsters or groups', 'aria-label': 'Search monsters' } });
		search.addEventListener('input', () => { this.query = search.value; this.renderResults(); });
		search.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const first = this.resultsEl.querySelector<HTMLElement>('.builder-result');
				first?.click();
			}
		});
		this.resultsEl = left.createDiv({ cls: 'builder-results' });
		const right = cols.createDiv({ cls: 'builder-col' });
		this.pickedCount = dialogLabel(right, 'In this encounter', '', 'builder-picked-count').value;
		this.pickedEl = right.createDiv({ cls: 'builder-picked' });

		const notes = c.createEl('textarea', { cls: 'builder-notes', attr: { placeholder: 'Notes: terrain, tactics, treasure…', rows: '2', 'aria-label': 'Notes' } });
		notes.value = this.def.notes || '';
		notes.addEventListener('input', () => { this.def.notes = notes.value.trim() || undefined; });

		dialogFoot(c, {
			cancel: () => this.close(),
			// Run stays open if the GM decides to keep the fight that's in the tracker, so the build isn't lost.
			second: [{ text: 'Run now', icon: evIcon('play'), cls: 'builder-run', onClick: () => void runEncounter(this.plugin, this.def, this.from).then(ran => { if (ran) this.close(); }) }],
			main: { text: this.onSave ? 'Save' : 'Insert into note', icon: evIcon(this.onSave ? 'check' : 'arrow-right'), cls: 'builder-save', onClick: () => this.save() },
		});

		this.renderResults();
		this.renderPicked();
		if (!isTouch()) window.setTimeout(() => search.focus(), 0);
	}

	private save(): void {
		if (this.onSave) { this.onSave(this.def); this.close(); return; }
		const block = `\`\`\`nimble-encounter\n${encounterBlockSource(this.def)}\n\`\`\`\n`;
		// Only the note the GM was last in, and only where there's a cursor to insert at:
		// never some other open note, or a spot they can't see in reading view.
		const view = this.app.workspace.getMostRecentLeaf()?.view;
		const md = view instanceof MarkdownView ? view : null;
		if (md && md.getMode() === 'source') {
			md.editor.replaceSelection(block);
			new Notice(`Inserted "${this.def.name}" into ${md.file?.basename ?? 'the note'}`);
		} else {
			void navigator.clipboard.writeText(block);
			new Notice(md
				? `${md.file?.basename ?? 'The note'} is in reading view: the encounter block was copied to the clipboard. Paste it where you want it.`
				: 'No note open to insert into: the encounter block was copied to the clipboard.');
		}
		this.close();
	}

	private renderResults(): void {
		const el = this.resultsEl;
		el.empty();
		const words = this.query.toLowerCase().split(/\s+/).filter(Boolean);
		const all = nimble().index.all().filter(e => words.every(w => e.name.toLowerCase().includes(w) || (e.monster.group || '').toLowerCase().includes(w)));
		const shown = all.sort((a, b) => (levelValue(a.monster.level) ?? 0) - (levelValue(b.monster.level) ?? 0) || a.name.localeCompare(b.name)).slice(0, 60);
		for (const e of shown) {
			const row = el.createDiv({ cls: 'builder-result', attr: { role: 'button', tabindex: '0', 'aria-label': `Add ${e.name}` } });
			const role = monsterRole(e.monster);
			row.createSpan({ cls: `builder-level role-${role}`, text: formatLevel(e.monster.level) || (role === 'minion' ? 'Min' : '–'), attr: { title: role === 'minion' ? 'Minion' : `Level ${formatLevel(e.monster.level)}` } });
			const t = row.createDiv({ cls: 'builder-result-text' });
			t.createDiv({ cls: 'builder-result-name', text: e.name });
			t.createDiv({ cls: 'builder-result-meta', text: describeMonster(e).replace(/^Lvl [^·]+· /, '') });
			setIcon(row.createSpan({ cls: 'builder-result-add', attr: { 'aria-hidden': 'true' } }), evIcon('plus'));
			const add = (n: number) => {
				const ex = this.def.monsters.find(m => m.name.toLowerCase() === e.name.toLowerCase());
				if (ex) ex.count += n;
				else this.def.monsters.push({ name: e.name, count: n });
				this.renderPicked();
			};
			row.addEventListener('click', (ev) => add(ev.shiftKey ? 2 : 1));
			row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') add(ev.shiftKey ? 2 : 1); });
			attachMonsterHover(this.plugin, row, e);
		}
		if (!shown.length) el.createDiv({ cls: 'builder-empty', text: this.query.trim() ? `Nothing called "${this.query.trim()}".` : 'No monsters yet.' });
		if (all.length > shown.length) el.createDiv({ cls: 'builder-more', text: `${all.length - shown.length} more: keep typing to narrow it down` });
	}

	private renderPicked(): void {
		const el = this.pickedEl;
		el.empty();
		const total = this.def.monsters.reduce((n, m) => n + m.count, 0);
		this.pickedCount?.setText(total ? `${total} ${total === 1 ? 'monster' : 'monsters'}` : '');
		if (!this.def.monsters.length) el.createDiv({ cls: 'builder-empty', text: 'Nothing added yet.' });
		for (const m of this.def.monsters) {
			const row = el.createDiv({ cls: 'builder-pick' });
			const keys = row.createDiv({ cls: 'builder-pick-keys ev-keys' });
			const minus = keys.createEl('button', { attr: { 'aria-label': `One fewer ${m.name}` } });
			setIcon(minus, evIcon('minus'));
			keys.createSpan({ cls: 'builder-pick-count', text: String(m.count) });
			const plus = keys.createEl('button', { attr: { 'aria-label': `One more ${m.name}` } });
			setIcon(plus, evIcon('plus'));
			const entry = fighterFor(this.plugin, m, this.from)?.entry;
			const name = row.createSpan({ cls: 'builder-pick-name', text: m.name });
			if (!entry) name.addClass('is-missing');
			else {
				attachMonsterHover(this.plugin, name, entry);
				const lvl = formatLevel(shiftMonster(entry.monster, m.shift ?? 0).level);
				if (lvl) row.createSpan({ cls: 'builder-pick-meta', text: `Lvl ${lvl}` });
			}
			minus.addEventListener('click', () => { m.count--; if (m.count <= 0) this.def.monsters.remove(m); this.renderPicked(); });
			plus.addEventListener('click', () => { m.count++; this.renderPicked(); });
		}
		this.renderRating();
	}

	private renderRating(): void {
		const el = this.ratingEl;
		el.empty();
		// Rated as they'll be run: a tougher or weaker monster counts as its shifted level.
		const groups = this.def.monsters.map(m => { const e = fighterFor(this.plugin, m, this.from)?.entry; return { monster: e ? shiftMonster(e.monster, m.shift ?? 0) : undefined, count: m.count }; })
			.filter((g): g is { monster: NonNullable<typeof g.monster>; count: number } => !!g.monster);
		const levels = partyLevels(this.plugin);
		const r = rateEncounter(groups, levels);
		const head = el.createDiv({ cls: 'builder-rating-head' });
		ratingChip(head, r.label, r.pct);
		const text = head.createSpan({ cls: 'builder-rating-text' });
		text.appendText(`${r.value.toFixed(1)} monster levels of ${budgetPhrase(r.budget)} · `);
		// Who it's rated against: the party, a link to edit it.
		const entered = this.plugin.settings.party.length > 0;
		const who = `${partyPhrase(levels, entered)}${entered ? '' : ': set up your party'}`;
		const edit = text.createEl('a', { cls: 'builder-party-link', text: who, href: '#', attr: { 'aria-label': this.plugin.settings.party.length ? 'Edit party' : 'Set up your party' } });
		edit.addEventListener('click', (e) => { e.preventDefault(); this.plugin.openParty(); });

		// The meter: the fight's share of the budget against the bands, the band it's in named under it.
		const meter = el.createDiv({ cls: 'builder-meter' });
		const track = meter.createDiv({ cls: 'nimble-meter' });
		const fill = track.createDiv({ cls: `nimble-meter-fill diff-${r.label.toLowerCase().replace(/\s+/g, '-')}` });
		fill.style.width = `${Math.min(r.pct, METER_MAX) / METER_MAX * 100}%`;
		const labels = meter.createDiv({ cls: 'nimble-meter-labels' });
		for (const [p, label] of BANDS) {
			const tick = track.createDiv({ cls: 'nimble-meter-tick' });
			tick.style.left = `${p / METER_MAX * 100}%`;
			const l = labels.createSpan({ cls: `nimble-meter-label${label === r.label ? ' is-here' : ''}`, text: label });
			l.style.left = `${p / METER_MAX * 100}%`;
		}
		for (const w of r.warnings) el.createDiv({ cls: 'encounter-block-warning', text: w });
		if (groups.length) {
			const bal = el.createDiv({ cls: 'builder-balance' });
			dialogLabel(bal, 'Balance to');
			renderBalance(bal.createDiv(), this.plugin, this.def, (next) => { this.def.monsters = next.monsters; this.renderPicked(); }, {
				initial: this.balanceTarget, onTarget: (t) => { this.balanceTarget = t; }, hideTitle: true, from: this.from,
			});
		}
	}
}
