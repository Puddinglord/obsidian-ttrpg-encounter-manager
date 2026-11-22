// A sliding highlight behind a row of equal-width segment buttons, the way
// iOS segmented controls move to the picked segment instead of jumping.

/**
 * Put (or move) the thumb behind segment `index` of `count`. Pass `from` when
 * the control was just re-rendered, so the thumb slides from where it was.
 */
export function slideThumb(container: HTMLElement, index: number, count: number, from?: number): void {
	container.addClass('has-thumb');
	let thumb = container.querySelector<HTMLElement>(':scope > .seg-thumb');
	if (!thumb) thumb = container.createDiv({ cls: 'seg-thumb', attr: { 'aria-hidden': 'true' }, prepend: true });
	container.setCssProps({ '--seg-n': String(count) });
	if (from !== undefined && from !== index && from >= 0) {
		thumb.addClass('no-slide');
		container.setCssProps({ '--seg-i': String(from) });
		void thumb.offsetWidth; // apply the start position before sliding
		thumb.removeClass('no-slide');
	}
	container.setCssProps({ '--seg-i': String(index) });
}
