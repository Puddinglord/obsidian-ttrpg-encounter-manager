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
import { isDown, isHero, isMinionGroup } from './encounters';
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

export async function saveFight(plugin: NimbleStatblocksPlugin, enc: Encounter): Promise<TFile | null> {
	const { app } = plugin;
	const path = fightNotePath(plugin, enc);
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
		console.error('Nimble GM: could not save the fight', e);
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

export async function resumeSavedFight(plugin: NimbleStatblocksPlugin, file: TFile): Promise<void> {
	const snapshot = await readSavedFight(plugin.app, file);
	if (!snapshot) { new Notice(`${file.basename} has no saved fight in it`); return; }
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
			this.plugin.encounters.restore(enc);
			void this.plugin.showTracker();
			new Notice(`Resumed ${enc.name}`);
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
