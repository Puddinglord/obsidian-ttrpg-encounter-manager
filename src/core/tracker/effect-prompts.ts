// What conditions ask for at a turn boundary, in any game's tracker: "Ogre is
// Burning: 1d4 Fire damage" with Roll and apply / Skip; "Mage, Hold Person:
// Wisdom save DC 13" with Roll the save / Passed / Failed. Several at once go in
// one dialog, in order; reminders are a notice. Rolls go through the plugin's
// dice (3D dice and the roll log). The game applies the damage by its own HP
// rules and knows the save bonus, through the handlers.

import { App, Modal, Notice, setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { applyLook } from '../look';
import { pill } from '../pill';
import { damageRoll, describeTrigger, EffectPrompt, EffectWords, saveEnds, savePassed } from './effects';

export interface EffectHandlers {
	/** The game, for its look. */
	system: string;
	words?: EffectWords;
	/** A combatant's name as the tracker shows it. */
	label(id: string): string;
	/** Apply damage by the game's rules; returns what happened ("Ogre takes 3"). */
	damage(id: string, amount: number, damageType?: string): string | undefined;
	/** The bonus to a save, when the tracker knows it (a monster's stat block). */
	saveBonus?(id: string, ability?: string): number | undefined;
	/** A save ended it. */
	endCondition(id: string, name: string): void;
	/** Something happened worth the fight's log ("Mage passes the Wisdom save"). */
	log?(text: string): void;
}

/** Show what a turn boundary asks: reminders as notices, the rest in one dialog. */
export function showEffectPrompts(plugin: EmberVaultPlugin, prompts: readonly EffectPrompt[], h: EffectHandlers): EffectPromptModal | null {
	const words = h.words ?? {};
	for (const p of prompts.filter(p => p.trigger.kind === 'reminder')) {
		new Notice(`${h.label(p.bearerId)}, ${p.condition}: ${describeTrigger(p.trigger, words)}`, 8000);
	}
	const asks = prompts.filter(p => p.trigger.kind !== 'reminder');
	if (!asks.length) return null;
	const m = new EffectPromptModal(plugin.app, plugin, asks, h);
	m.open();
	return m;
}

const signed = (n: number) => (n < 0 ? `-${Math.abs(n)}` : `+${n}`);

export class EffectPromptModal extends Modal {
	constructor(app: App, private plugin: EmberVaultPlugin, private prompts: readonly EffectPrompt[], private h: EffectHandlers) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('ev-effect-prompt');
		applyLook(this.modalEl, this.h.system);
		this.titleEl.setText(this.prompts.length === 1 ? 'Condition' : `${this.prompts.length} conditions`);
		const list = this.contentEl.createDiv({ cls: 'ev-effect-list' });
		for (const p of this.prompts) this.drawPrompt(list, p);
		const foot = this.contentEl.createDiv({ cls: 'ev-effect-foot' });
		pill(foot, { tag: 'button', text: 'Done', cls: 'ev-effect-done' }).onclick = () => this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private drawPrompt(list: HTMLElement, p: EffectPrompt): void {
		const t = p.trigger;
		const words = this.h.words ?? {};
		const who = this.h.label(p.bearerId);
		const card = list.createDiv({ cls: `ev-effect is-${t.kind}` });
		const head = card.createDiv({ cls: 'ev-effect-head' });
		setIcon(head.createSpan({ cls: 'ev-effect-icon', attr: { 'aria-hidden': 'true' } }), t.kind === 'damage' ? 'flame' : 'dices');
		const title = head.createDiv({ cls: 'ev-effect-title' });
		title.createSpan({ cls: 'ev-effect-who', text: who });
		title.appendText(t.kind === 'damage' ? ' is ' : ', ');
		title.createSpan({ cls: 'ev-effect-cond', text: p.condition });
		card.createDiv({ cls: 'ev-effect-what', text: `${describeTrigger({ ...t, endsOnSave: false }, words)}${t.kind === 'save' && t.endsOnSave ? `; a success ends ${p.condition}` : ''}` });
		const actions = card.createDiv({ cls: 'ev-effect-actions' });
		const result = card.createDiv({ cls: 'ev-effect-result' });
		result.hide();
		const done = (text: string) => {
			actions.remove();
			result.show();
			result.setText(text);
			card.addClass('is-done');
		};

		if (t.kind === 'damage') {
			const dmg = damageRoll(t);
			const apply = (amount: number) => {
				const said = this.h.damage(p.bearerId, amount, t.damageType);
				return said ?? `${who} takes ${amount}`;
			};
			if (dmg.flat !== undefined) {
				const flat = dmg.flat;
				pill(actions, { tag: 'button', icon: 'check', text: `Apply ${flat}`, cls: 'mod-cta ev-effect-roll' }).onclick = () => done(apply(flat));
			} else if (dmg.dice) {
				const dice = dmg.dice;
				pill(actions, { tag: 'button', icon: 'dices', text: `Roll ${dice} and apply`, cls: 'mod-cta ev-effect-roll' }).onclick = () => {
					const entry = this.plugin.rollDice(dice, `${who}: ${p.condition}`, 'effect');
					if (entry?.total === undefined) return;
					done(`Rolled ${entry.total}. ${apply(entry.total)}`);
				};
			}
			pill(actions, { tag: 'button', text: 'Skip', cls: 'ev-effect-skip' }).onclick = () => done('Skipped');
			return;
		}

		// A save: roll it when the bonus is known, or say how it went.
		const resolve = (passed: boolean, rolled?: number) => {
			const ends = saveEnds(t, passed);
			if (ends) this.h.endCondition(p.bearerId, p.condition);
			const save = [t.ability, words.save ?? 'save'].filter(Boolean).join(' ');
			this.h.log?.(`${who} ${passed ? 'passes' : 'fails'} the ${save}${ends ? `; ${p.condition} ends` : ''}`);
			done(`${rolled !== undefined ? `Rolled ${rolled}. ` : ''}${passed ? 'Passed' : 'Failed'}${ends ? `: ${p.condition} ends` : passed ? '' : `: still ${p.condition}`}`);
		};
		const bonus = this.h.saveBonus?.(p.bearerId, t.ability);
		if (bonus !== undefined) {
			const expr = `1d20${signed(bonus)}`;
			pill(actions, { tag: 'button', icon: 'dices', text: `Roll the save (${signed(bonus)})`, cls: 'mod-cta ev-effect-roll' }).onclick = () => {
				const entry = this.plugin.rollDice(expr, `${who}: ${t.ability ? `${t.ability} ` : ''}${words.save ?? 'save'}`, 'effect');
				if (entry?.total === undefined) return;
				const passed = savePassed(entry.total, t.dc);
				if (passed !== undefined) { resolve(passed, entry.total); return; }
				result.show();
				result.setText(`Rolled ${entry.total}`);
			};
		}
		pill(actions, { tag: 'button', icon: 'check', text: 'Passed', cls: 'ev-effect-pass' }).onclick = () => resolve(true);
		pill(actions, { tag: 'button', icon: 'x', text: 'Failed', cls: 'ev-effect-fail' }).onclick = () => resolve(false);
	}
}
