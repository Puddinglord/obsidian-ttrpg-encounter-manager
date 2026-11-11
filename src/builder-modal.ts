// Encounter builder: pick monsters, see difficulty against the party live,
// then save to a note block, insert one, or run it straight away.

import { MarkdownView, Modal, Notice, setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { EncounterDef, encounterBlockSource } from './encounter-def';
import { BalanceTarget, budgetPhrase, formatLevel, levelValue, monsterRole, rateEncounter, shiftMonster } from './rules';
import { renderBalance } from './balance-ui';
import { partyLevels, ratingChip, runEncounter } from './encounter-block';
import { describeMonster } from './suggest';
import { isTouch } from './touch';

export class BuilderModal extends Modal {
	private def: EncounterDef;
	private query = '';
	private resultsEl!: HTMLElement;
	private pickedEl!: HTMLElement;
	private ratingEl!: HTMLElement;
	private balanceTarget?: BalanceTarget;

	/** `onSave` writes the result back (editing a block); without it the modal inserts a new block. */
	constructor(private plugin: NimbleStatblocksPlugin, def?: EncounterDef, private onSave?: (def: EncounterDef) => void) {
		super(plugin.app);
		this.def = def ? JSON.parse(JSON.stringify(def)) as EncounterDef : { name: 'New encounter', party: plugin.settings.party.length > 0, monsters: [] };
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-builder-modal');
		this.titleEl.setText(this.onSave ? 'Edit encounter' : 'Build an encounter');
		const c = this.contentEl;
		c.empty();

		const top = c.createDiv({ cls: 'builder-top' });
		const name = top.createEl('input', { type: 'text', cls: 'builder-name', attr: { 'aria-label': 'Encounter name', placeholder: 'Encounter name' } });
		name.value = this.def.name;
		name.addEventListener('input', () => { this.def.name = name.value.trim() || 'Encounter'; });
		const partyLabel = top.createEl('label', { cls: 'builder-party' });
		const party = partyLabel.createEl('input', { type: 'checkbox' });
		party.checked = this.def.party;
		party.addEventListener('change', () => { this.def.party = party.checked; });
		partyLabel.appendText(' Add the party when run');

		this.ratingEl = c.createDiv({ cls: 'builder-rating' });

		const cols = c.createDiv({ cls: 'builder-cols' });
		const left = cols.createDiv({ cls: 'builder-col' });
		const search = left.createEl('input', { type: 'search', cls: 'builder-search', attr: { placeholder: 'Search monsters…', 'aria-label': 'Search monsters' } });
		search.addEventListener('input', () => { this.query = search.value; this.renderResults(); });
		search.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const first = this.resultsEl.querySelector<HTMLElement>('.builder-result');
				first?.click();
			}
		});
		this.resultsEl = left.createDiv({ cls: 'builder-results' });
		const right = cols.createDiv({ cls: 'builder-col' });
		right.createDiv({ cls: 'builder-col-title', text: 'In this encounter' });
		this.pickedEl = right.createDiv({ cls: 'builder-picked' });

		const notes = c.createEl('textarea', { cls: 'builder-notes', attr: { placeholder: 'Notes (optional): terrain, tactics, treasure…', rows: '2' } });
		notes.value = this.def.notes || '';
		notes.addEventListener('input', () => { this.def.notes = notes.value.trim() || undefined; });

		const bar = c.createDiv({ cls: 'modal-button-container' });
		const run = bar.createEl('button', { text: 'Run now' });
		// Stays open if the GM decides to keep the fight that's in the tracker, so the build isn't lost.
		run.addEventListener('click', () => void runEncounter(this.plugin, this.def).then(ran => { if (ran) this.close(); }));
		const save = bar.createEl('button', { text: this.onSave ? 'Save' : 'Insert into note', cls: 'mod-cta' });
		save.addEventListener('click', () => this.save());

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
		const all = this.plugin.index.all().filter(e => words.every(w => e.name.toLowerCase().includes(w) || (e.monster.group || '').toLowerCase().includes(w)));
		const shown = all.sort((a, b) => (levelValue(a.monster.level) ?? 0) - (levelValue(b.monster.level) ?? 0) || a.name.localeCompare(b.name)).slice(0, 60);
		for (const e of shown) {
			const row = el.createDiv({ cls: 'builder-result', attr: { role: 'button', tabindex: '0' } });
			row.createSpan({ cls: 'bestiary-level', text: formatLevel(e.monster.level) || (monsterRole(e.monster) === 'minion' ? 'min' : '–') });
			const t = row.createDiv({ cls: 'builder-result-text' });
			t.createDiv({ cls: 'builder-result-name', text: e.name });
			t.createDiv({ cls: 'builder-result-meta', text: describeMonster(e).replace(/^Lvl [^·]+· /, '') });
			setIcon(row.createSpan({ cls: 'builder-result-add' }), 'plus');
			const add = (n: number) => {
				const ex = this.def.monsters.find(m => m.name.toLowerCase() === e.name.toLowerCase());
				if (ex) ex.count += n;
				else this.def.monsters.push({ name: e.name, count: n });
				this.renderPicked();
			};
			row.addEventListener('click', (ev) => add(ev.shiftKey ? 2 : 1));
			row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') add(ev.shiftKey ? 2 : 1); });
			this.plugin.hover.attach(row, e);
		}
		if (all.length > shown.length) el.createDiv({ cls: 'builder-more', text: `${all.length - shown.length} more; keep typing to narrow it down` });
	}

	private renderPicked(): void {
		const el = this.pickedEl;
		el.empty();
		if (!this.def.monsters.length) el.createDiv({ cls: 'builder-empty', text: 'Nothing added yet.' });
		for (const m of this.def.monsters) {
			const row = el.createDiv({ cls: 'builder-pick' });
			const minus = row.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': `One fewer ${m.name}` } });
			setIcon(minus, 'minus');
			row.createSpan({ cls: 'builder-pick-count', text: String(m.count) });
			const plus = row.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': `One more ${m.name}` } });
			setIcon(plus, 'plus');
			const entry = this.plugin.index.get(m.name);
			const name = row.createSpan({ cls: 'builder-pick-name', text: m.name });
			if (!entry) name.addClass('is-missing');
			else this.plugin.hover.attach(name, entry);
			minus.addEventListener('click', () => { m.count--; if (m.count <= 0) this.def.monsters.remove(m); this.renderPicked(); });
			plus.addEventListener('click', () => { m.count++; this.renderPicked(); });
		}
		this.renderRating();
	}

	private renderRating(): void {
		const el = this.ratingEl;
		el.empty();
		// Rated as they'll be run: a tougher or weaker monster counts as its shifted level.
		const groups = this.def.monsters.map(m => { const e = this.plugin.index.get(m.name); return { monster: e ? shiftMonster(e.monster, m.shift ?? 0) : undefined, count: m.count }; })
			.filter((g): g is { monster: NonNullable<typeof g.monster>; count: number } => !!g.monster);
		const levels = partyLevels(this.plugin);
		const r = rateEncounter(groups, levels);
		const head = el.createDiv({ cls: 'builder-rating-head' });
		ratingChip(head, r.label, r.pct);
		head.createSpan({ cls: 'builder-rating-text', text: `${r.value.toFixed(1)} monster levels of ${budgetPhrase(r.budget)} (${levels.length} heroes)` });
		const meter = el.createDiv({ cls: 'nimble-meter' });
		const fill = meter.createDiv({ cls: `nimble-meter-fill diff-${r.label.toLowerCase().replace(/\s+/g, '-')}` });
		fill.style.width = `${Math.min(r.pct, 1.75) / 1.75 * 100}%`;
		for (const [p, label] of [[0.5, 'Easy'], [0.75, 'Medium'], [1, 'Hard'], [1.25, 'Deadly'], [1.5, 'Very Deadly']] as const) {
			const tick = meter.createDiv({ cls: 'nimble-meter-tick' });
			tick.style.left = `${p / 1.75 * 100}%`;
			tick.createSpan({ cls: 'nimble-meter-label', text: label });
		}
		for (const w of r.warnings) el.createDiv({ cls: 'encounter-block-warning', text: w });
		if (groups.length) {
			const bal = el.createDiv({ cls: 'builder-balance' });
			bal.createSpan({ cls: 'builder-balance-label', text: 'Balance to' });
			renderBalance(bal.createDiv(), this.plugin, this.def, (next) => { this.def.monsters = next.monsters; this.renderPicked(); }, {
				initial: this.balanceTarget, onTarget: (t) => { this.balanceTarget = t; }, hideTitle: true,
			});
		}
		const hint = el.createDiv({ cls: 'builder-hint' });
		hint.appendText(this.plugin.settings.party.length ? `Rated against ${levels.length} heroes · ` : `No party set up: rating against ${levels.length} level-${levels[0] ?? 1} heroes · `);
		const edit = hint.createEl('a', { text: this.plugin.settings.party.length ? 'Edit party' : 'Set up your party', href: '#' });
		edit.addEventListener('click', (e) => { e.preventDefault(); this.plugin.openParty(); });
	}
}
