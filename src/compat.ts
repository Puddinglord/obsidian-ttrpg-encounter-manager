// Small bridges between Obsidian versions. The plugin supports 1.7.2 and up,
// and some calls changed name or meaning in 1.13.

import { requireApiVersion } from 'obsidian';
import type { ButtonComponent, SliderComponent } from 'obsidian';

/** A red "this deletes something" button. setWarning() did this before 1.13. */
export function setWarningButton(b: ButtonComponent): ButtonComponent {
	if (requireApiVersion('1.13.0')) return b.setDestructive().setCta();
	b.buttonEl.addClass('mod-warning');
	return b;
}

/** Show a slider's value. 1.13 always shows it; older versions need a tooltip. */
export function showSliderValue(slider: SliderComponent): SliderComponent {
	if (!requireApiVersion('1.13.0')) (slider as unknown as { setDynamicTooltip(): void }).setDynamicTooltip();
	return slider;
}
