// Save a fight mid-combat to a note, and pick it back up later.
//
// The note lives in a Fights folder next to the note the encounter came from
// (or in the active campaign, or the vault root). It has a digest you can read
// without the plugin, and a ```nimble-fight block holding the tracker state,
// which renders as a card with a Resume button. The encounter block in the
// source note also offers to resume it.

import { App, MarkdownPostProcessorContext, MarkdownRenderChild, Notice, normalizePath, setIcon, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { Encounter, EncounterCreature } from './types';
import { fightInProgress, isDown, isHero, isMinionGroup, sameFight } from './encounters';
import { confirmAction } from './touch';
import { conditionLabel } from './rules';
import { fmText, safeName } from './campaign-model';

export const FIGHT_BLOCK = 'nimble-fight';

export interface SavedFight {
	file: TFile;
	round: number;
	phase: string;
	saved: string;
}

function hpText(c: EncounterCreature): string {
	if (isMinionGroup(c)) return `${c.alive ?? 0}/${c.count ?? 0} standing`;
	return c.maxHp > 0 ? `${c.currentHp}/${c.maxHp}${c.tempHp ? ` +${c.tempHp}` : ''}` : '—';
}

function phaseText(enc: Encounter): string {
	const phase = enc.phase === 'setup' ? enc.paused?.phase : enc.phase;
	return phase === 'monsters' ? "monsters' turn" : phase === 'heroes' ? "heroes' turn" : 'not started';
}

/** A readable digest of where the fight stands. */
export function fightDigest(enc: Encounter, when: Date): string {
	const rows = enc.creatures.map(c => {
		const notes = [
			...(isHero(c) && (c.wounds ?? 0) > 0 ? [`${c.wounds} Wound${c.wounds === 1 ? '' : 's'}`] : []),
			...c.conditions.map(conditionLabel),
			...(isDown(c) ? ['down'] : []),
		];
		return `| ${c.label.replace(/\|/g, '/')} | ${hpText(c)} | ${notes.join(', ') || '—'} |`;
	});
	const log = (enc.log ?? []).slice(0, 15).map(l => `- Round ${l.round}: ${l.text}`);
	return [
		`**Round ${enc.paused?.round ?? enc.round ?? 1}, ${phaseText(enc)}.** Saved ${when.toLocaleString()}.`,
		'',
		'| Combatant | HP | Notes |',
		'| --- | --- | --- |',
		...rows,
		...(log.length ? ['', '## Recent log', ...log] : []),
	].join('\n');
}

/** Where a fight's note goes: Fights/ next to its source note, else in the campaign, else the vault root. */
export function fightNotePath(plugin: NimbleStatblocksPlugin, enc: Encounter): string {
	const source = enc.sourcePath ? plugin.app.vault.getFileByPath(enc.sourcePath) : null;
	const base = source?.parent?.path ?? plugin.campaigns.active?.folder ?? '';
	const name = source ? `${source.basename} - ${enc.name}` : enc.name;
	return normalizePath(`${base && base !== '/' ? `${base}/` : ''}Fights/${safeName(name)}.md`);
}

/**
 * The note to save a fight to: its usual path, unless that note already holds
 * a different fight (or isn't a fight note at all). Then the next free
 * "<name> 2", "<name> 3"… so no other fight is overwritten.
 */
export async function freeFightNotePath(plugin: NimbleStatblocksPlugin, enc: Encounter): Promise<string> {
	const first = fightNotePath(plugin, enc);
	const stem = first.replace(/\.md$/, '');
	for (let n = 1; n < 500; n++) {
		const path = n === 1 ? first : `${stem} ${n}.md`;
		const file = plugin.app.vault.getFileByPath(path);
		if (!file) return path;
		const saved = await readSavedFight(plugin.app, file);
		if (saved && sameFight(saved, enc)) return path;
	}
	return `${stem} ${Date.now()}.md`;
}

/**
 * Before anything replaces what's in the tracker: ask when that would lose a
 * fight (started, ended part-way, or with someone already hurt). Run, Resume
 * and the builder's "Run now" all come through here. True means go ahead.
 */
export async function confirmReplaceFight(plugin: NimbleStatblocksPlugin, incoming: string): Promise<boolean> {
	// With several encounters, a new one is added next to the others; nothing is replaced.
	if (plugin.settings.multipleEncounters) return true;
	const active = plugin.encounters.active;
	if (!active || !fightInProgress(active)) return true;
	const round = active.paused?.round ?? active.round ?? 1;
	const where = active.phase && active.phase !== 'setup' ? `in round ${round}` : active.paused ? `stopped at round ${round}` : 'already has damage on it';
	const n = active.creatures.length;
	return confirmAction(plugin.app, `Replace "${active.name}"?`,
		`The tracker holds "${active.name}" (${n} combatant${n === 1 ? '' : 's'}), which is ${where}. Loading "${incoming}" replaces it, along with its HP, conditions and log. To keep it, cancel and save the fight to a note from the tracker first.`,
		'Replace', true);
}

export async function saveFight(plugin: NimbleStatblocksPlugin, enc: Encounter): Promise<TFile | null> {
	const { app } = plugin;
	const path = await freeFightNotePath(plugin, enc);
	const now = new Date();
	const source = enc.sourcePath ? app.vault.getFileByPath(enc.sourcePath) : null;
	const snapshot: Encounter = JSON.parse(JSON.stringify(enc)) as Encounter;
	snapshot.log = (snapshot.log ?? []).slice(0, 60);
	const fm = [
		'---',
		'nimble: combat',
		`encounter: ${JSON.stringify(enc.name)}`,
		...(source ? [`source: ${JSON.stringify(`[[${app.metadataCache.fileToLinktext(source, path, true)}]]`)}`] : []),
		`round: ${enc.paused?.round ?? enc.round ?? 1}`,
		`saved: ${now.toISOString().slice(0, 16)}`,
		'---',
	].join('\n');
	const body = `${fm}\n\n\`\`\`${FIGHT_BLOCK}\n${JSON.stringify(snapshot)}\n\`\`\`\n\n${fightDigest(enc, now)}\n`;
	try {
		const folder = path.slice(0, path.lastIndexOf('/'));
		if (folder && !app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
		const existing = app.vault.getFileByPath(path);
		const file = existing ?? await app.vault.create(path, body);
		if (existing) await app.vault.process(existing, () => body);
		return file;
	} catch (e) {
		console.error('Ember Vault: could not save the fight', e);
		new Notice("Couldn't save the fight. See the developer console for details.");
		return null;
	}
}

/** Read a fight note's saved tracker state. */
export async function readSavedFight(app: App, file: TFile): Promise<Encounter | null> {
	const text = await app.vault.cachedRead(file);
	const m = text.match(new RegExp('```' + FIGHT_BLOCK + '\\s*\\n([\\s\\S]*?)\\n```'));
	return m ? parseSnapshot(m[1]) : null;
}

function parseSnapshot(src: string): Encounter | null {
	try {
		const data = JSON.parse(src) as Encounter;
		return data && Array.isArray(data.creatures) ? data : null;
	} catch {
		return null;
	}
}

/** Saved fights for an encounter block: same encounter name, linked back to this note. */
export function savedFightsFor(app: App, sourcePath: string, encounterName: string): SavedFight[] {
	const out: SavedFight[] = [];
	for (const f of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(f)?.frontmatter;
		if (!fm || fmText(fm.nimble).toLowerCase() !== 'combat' || fmText(fm.encounter) !== encounterName) continue;
		const link = fmText(fm.source).replace(/^\[\[|\]\]$/g, '').split('|')[0];
		const dest = link ? app.metadataCache.getFirstLinkpathDest(link, f.path) : null;
		if (dest?.path !== sourcePath) continue;
		out.push({ file: f, round: Number(fm.round) || 1, phase: '', saved: fmText(fm.saved) });
	}
	return out.sort((a, b) => b.saved.localeCompare(a.saved));
}

/** `sourcePath`: the note the fight is being resumed for, when known (the saved one may have moved since). */
export async function resumeSavedFight(plugin: NimbleStatblocksPlugin, file: TFile, sourcePath?: string): Promise<void> {
	const snapshot = await readSavedFight(plugin.app, file);
	if (!snapshot) { new Notice(`${file.basename} has no saved fight in it`); return; }
	if (!await confirmReplaceFight(plugin, snapshot.name)) return;
	if (sourcePath) snapshot.sourcePath = sourcePath;
	plugin.encounters.restore(snapshot);
	await plugin.showTracker();
	new Notice(`Resumed ${snapshot.name}, round ${snapshot.paused?.round ?? snapshot.round ?? 1}`);
}

/** The ```nimble-fight block: a card with the fight's state and a Resume button. */
export function registerFightBlock(plugin: NimbleStatblocksPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor(FIGHT_BLOCK, (source, el, ctx) => {
		ctx.addChild(new FightCard(plugin, el, source, ctx));
	});
}

class FightCard extends MarkdownRenderChild {
	constructor(private plugin: NimbleStatblocksPlugin, el: HTMLElement, private source: string, private ctx: MarkdownPostProcessorContext) {
		super(el);
	}

	/** Where this fight note's `source:` link points now, if it's a fight note and the link resolves. */
	private sourceNote(): string | null {
		const { app } = this.plugin;
		const note = app.vault.getFileByPath(this.ctx.sourcePath);
		const fm = note ? app.metadataCache.getFileCache(note)?.frontmatter : null;
		if (!fm || fmText(fm.nimble).toLowerCase() !== 'combat') return null;
		const link = fmText(fm.source).replace(/^\[\[|\]\]$/g, '').split('|')[0];
		return (link ? app.metadataCache.getFirstLinkpathDest(link, this.ctx.sourcePath)?.path : null) ?? null;
	}

	onload(): void {
		const el = this.containerEl;
		const enc = parseSnapshot(this.source.trim());
		const card = el.createDiv({ cls: 'nimble-fight-card' });
		if (!enc) { card.createDiv({ cls: 'nimble-error', text: 'This saved fight could not be read.' }); return; }
		const head = card.createDiv({ cls: 'nimble-fight-head' });
		setIcon(head.createSpan({ cls: 'nimble-fight-icon' }), 'swords');
		const t = head.createDiv({ cls: 'nimble-fight-titles' });
		t.createDiv({ cls: 'nimble-fight-title', text: enc.name });
		t.createDiv({ cls: 'nimble-fight-sub', text: `Saved fight · round ${enc.paused?.round ?? enc.round ?? 1}, ${phaseText(enc)}` });
		const resume = head.createEl('button', { cls: 'mod-cta nimble-fight-resume' });
		setIcon(resume.createSpan(), 'play');
		resume.createSpan({ text: 'Resume fight' });
		resume.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			void (async () => {
				if (!await confirmReplaceFight(this.plugin, enc.name)) return;
				// The saved path goes stale when the source note moves; the fight note's own link follows it.
				const source = this.sourceNote();
				this.plugin.encounters.restore(source ? { ...enc, sourcePath: source } : enc);
				await this.plugin.showTracker();
				new Notice(`Resumed ${enc.name}`);
			})();
		});
		const list = card.createDiv({ cls: 'nimble-fight-list' });
		for (const c of enc.creatures) {
			const row = list.createDiv({ cls: `nimble-fight-row side-${isHero(c) ? 'hero' : 'monster'}${isDown(c) ? ' is-down' : ''}` });
			row.createSpan({ cls: 'nimble-fight-name', text: c.label });
			if (c.conditions.length) row.createSpan({ cls: 'nimble-fight-conds', text: c.conditions.map(conditionLabel).join(', ') });
			row.createSpan({ cls: 'nimble-fight-hp', text: hpText(c) });
		}
	}
}
