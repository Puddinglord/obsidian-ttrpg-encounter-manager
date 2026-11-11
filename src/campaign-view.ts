// The Campaign panel (left sidebar): switch campaigns, see the party, pick up
// where you left off, and move through chapters and scenes.

import { ItemView, MarkdownPostProcessorContext, MarkdownRenderChild, Platform, setIcon, WorkspaceLeaf } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { campaignMenu, renderOutline, renderPartyLine } from './campaign-ui';

export const CAMPAIGN_VIEW_TYPE = 'nimble-campaign';

export class CampaignView extends ItemView {
	private collapsed = new Set<string>();

	constructor(leaf: WorkspaceLeaf, private plugin: NimbleStatblocksPlugin) {
		super(leaf);
	}

	getViewType(): string { return CAMPAIGN_VIEW_TYPE; }
	getDisplayText(): string { return 'Campaign'; }
	getIcon(): string { return 'castle'; }

	async onOpen(): Promise<void> {
		this.registerEvent(this.plugin.campaigns.on('changed', () => this.render()));
		this.registerEvent(this.app.workspace.on('file-open', () => this.markCurrent()));
		this.render();
	}

	/** Highlight the open note without rebuilding the list. */
	private markCurrent(): void {
		const cur = this.app.workspace.getActiveFile()?.path;
		this.contentEl.querySelectorAll<HTMLElement>('.campaign-note').forEach(r => r.toggleClass('is-current', r.dataset.path === cur));
	}

	private render(): void {
		const root = this.contentEl;
		const scroll = root.scrollTop;
		root.empty();
		root.addClass('nimble-campaign-view');
		const store = this.plugin.campaigns;
		const c = store.active;

		const bar = root.createDiv({ cls: 'campaign-switcher' });
		const pick = bar.createEl('button', { cls: 'campaign-switch-btn', attr: { 'aria-label': 'Switch campaign' } });
		setIcon(pick.createSpan({ cls: 'campaign-switch-icon' }), 'castle');
		pick.createSpan({ cls: 'campaign-switch-name', text: c?.name ?? (store.campaigns.length ? 'Choose a campaign' : 'No campaigns yet') });
		setIcon(pick.createSpan({ cls: 'campaign-switch-chevron' }), 'chevrons-up-down');
		pick.addEventListener('click', (e) => campaignMenu(this.plugin, e));
		if (c) {
			const home = bar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Open the campaign home note' } });
			setIcon(home, 'house');
			home.addEventListener('click', () => void store.open(c.home.path));
		}
		this.renderSearch(root);

		if (!c) {
			const empty = root.createDiv({ cls: 'campaign-welcome' });
			empty.createEl('h4', { text: store.campaigns.length ? 'Pick a campaign' : 'Start a campaign' });
			empty.createEl('p', { text: 'Each campaign gets a folder for its chapters, scenes, NPCs and session notes, and its own party. Run as many as you like from one vault.' });
			const b = empty.createEl('button', { cls: 'mod-cta', text: 'New campaign' });
			b.addEventListener('click', () => this.plugin.newCampaign());
			return;
		}

		renderPartyLine(root, this.plugin, c);
		renderOutline(root.createDiv({ cls: 'campaign-outline' }), this.plugin, c, {
			current: this.app.workspace.getActiveFile()?.path,
			collapsed: this.collapsed,
			onToggle: () => this.render(),
		});
		root.scrollTop = scroll;
	}

	/**
	 * A button dressed as a search field that opens Spotlight; typing happens in
	 * the modal. The key chip only shows when the setting makes that key work.
	 */
	private renderSearch(root: HTMLElement): void {
		const btn = root.createEl('button', { cls: 'campaign-search', attr: { 'aria-label': 'Search (opens Spotlight)' } });
		setIcon(btn.createSpan({ cls: 'campaign-search-icon' }), 'search');
		btn.createSpan({ cls: 'campaign-search-placeholder', text: 'Search or roll dice…' });
		if (this.plugin.settings.spotlightKey && !Platform.isPhone) {
			const mac = Platform.isMacOS || Platform.isIosApp;
			btn.createSpan({ cls: 'campaign-search-kbd', text: mac ? '⌘K' : 'Ctrl K' });
			btn.setAttr('aria-keyshortcuts', mac ? 'Meta+K' : 'Control+K');
		}
		btn.addEventListener('click', () => this.plugin.toggleSpotlight());
	}
}

/** ```nimble-campaign on a campaign's home note: the same outline, in the note. */
export class CampaignBlock extends MarkdownRenderChild {
	private collapsed = new Set<string>();

	constructor(private plugin: NimbleStatblocksPlugin, el: HTMLElement, private ctx: MarkdownPostProcessorContext) {
		super(el);
	}

	onload(): void {
		this.registerEvent(this.plugin.campaigns.on('changed', () => this.render()));
		this.render();
	}

	private render(): void {
		const el = this.containerEl;
		el.empty();
		el.addClass('nimble-campaign-block');
		const c = this.plugin.campaigns.of(this.ctx.sourcePath);
		if (!c) {
			el.createDiv({ cls: 'campaign-empty', text: 'This block shows a campaign\'s chapters and scenes. Put it on a note with "nimble: campaign" in its properties.' });
			return;
		}
		const head = el.createDiv({ cls: 'campaign-block-head' });
		renderPartyLine(head, this.plugin, c);
		const open = head.createEl('button', { cls: 'campaign-block-panel', attr: { 'aria-label': 'Open the Campaign panel' } });
		setIcon(open.createSpan(), 'panel-left');
		open.createSpan({ text: 'Campaign panel' });
		open.addEventListener('click', () => void this.plugin.openCampaignView());
		renderOutline(el.createDiv({ cls: 'campaign-outline' }), this.plugin, c, {
			collapsed: this.collapsed,
			onToggle: () => this.render(),
			inNote: true,
		});
	}
}
