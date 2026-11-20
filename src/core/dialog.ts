// A dialog drawn for one game (the roll dialog, Add several, the encounter builder, the party editor): Obsidian's
// modal on the game's paper, its title in the game's type, labels above their controls, and one footer, the HP
// keypad's: Cancel beside the main button. A compact dialog (a keypad's width) fills its footer, Cancel a third and
// the main button two; a wide one keeps Cancel on the left and its actions on the right, as the builder does.
// The look is `.ev-dialog` (GAME DIALOGS in styles.css); each dialog keeps its own class for its body.

import type { Modal } from 'obsidian';
import { applyLook } from './look';
import { pill } from './pill';

export interface DialogOptions {
	/** The dialog's own class (`nimble-roll-dialog`). */
	cls: string;
	/** A keypad-sized dialog: a full-width footer, Cancel | main as 1 : 2. */
	compact?: boolean;
}

/** Dress `modal` as a dialog for this game (its tokens, paper and type). */
export function gameDialog(modal: Modal, systemId: string | undefined, o: DialogOptions): void {
	const el = modal.modalEl;
	el.addClass('ev-dialog', ...o.cls.split(/\s+/).filter(Boolean));
	el.toggleClass('is-compact', !!o.compact);
	applyLook(el, systemId);
}

export interface DialogButton {
	text: string;
	/** An icon id (evIcon(…) for a game's surface). */
	icon?: string;
	onClick: () => void;
	/** Classes the dialog keeps for its tests and styles (`rd-roll`). */
	cls?: string;
	title?: string;
}

/**
 * The footer: Cancel (unless `cancel` is false), any second actions, then the main one. Returns the buttons drawn,
 * main last, so a dialog can relabel or disable them as its state changes.
 */
export function dialogFoot(parent: HTMLElement, o: { cancel?: (() => void) | false; cancelText?: string; second?: DialogButton[]; main: DialogButton }): { foot: HTMLElement; main: HTMLButtonElement; second: HTMLButtonElement[] } {
	const foot = parent.createDiv({ cls: 'ev-dialog-foot' });
	const button = (b: DialogButton, kind: string): HTMLButtonElement => {
		const el = pill(foot, { tag: 'button', icon: b.icon, text: b.text, title: b.title, cls: `ev-dialog-btn ${kind} ${b.cls ?? ''}` }) as HTMLButtonElement;
		el.addEventListener('click', () => b.onClick());
		return el;
	};
	if (o.cancel !== false) {
		const close = o.cancel;
		const cancel = pill(foot, { tag: 'button', text: o.cancelText ?? 'Cancel', cls: 'ev-dialog-btn is-cancel' });
		if (close) cancel.addEventListener('click', () => close());
	}
	const second = (o.second ?? []).map(b => button(b, 'is-second'));
	const main = button(o.main, 'is-main mod-cta');
	return { foot, main, second };
}

/** A label over its control (never stretched away from it): "Advantage", with its value beside it when it has one. */
export function dialogLabel(parent: HTMLElement, text: string, value?: string, valueCls = ''): { el: HTMLElement; value: HTMLElement | null } {
	const el = parent.createDiv({ cls: 'ev-dialog-label' });
	el.createSpan({ cls: 'ev-dialog-label-text', text });
	const v = value !== undefined ? el.createSpan({ cls: `ev-dialog-label-value ${valueCls}`.trim(), text: value }) : null;
	return { el, value: v };
}
