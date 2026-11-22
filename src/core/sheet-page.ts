// A note whose page is a character sheet: the sheet is the page's title and
// its properties, so the note's inline title and Properties box step aside
// (styles.css, "Notes whose page is a sheet"). A sheet marks the view it's
// drawn in, so this works for notes written before `cssclasses:
// [nimble-sheet-note]` existed and for notes that never had it. The sheet's
// own button shows the properties again (`nimble-show-props`, the class
// Nimble's sheet uses for the same thing).

const PAGE = 'ev-sheet-page';
const SHOWN = 'nimble-show-props';
const HOST = 'ev-sheet-host';

/** Mark the note view around `host` as a sheet's page. Call on every draw (the block may not be attached on the first). */
export function markSheetPage(host: HTMLElement, propsShown: boolean): HTMLElement | null {
	host.addClass(HOST);
	const view = host.closest<HTMLElement>('.markdown-preview-view, .markdown-source-view');
	if (!view) return null;
	view.addClass(PAGE);
	view.toggleClass(SHOWN, propsShown);
	return view;
}

/** The sheet is gone: unmark its view, unless another sheet is still drawn in it. */
export function unmarkSheetPage(host: HTMLElement, view: HTMLElement | null): void {
	host.removeClass(HOST);
	if (!view) return;
	const others = Array.from(view.querySelectorAll(`.${HOST}`)).some(el => el !== host);
	if (others) return;
	view.removeClass(PAGE);
	view.removeClass(SHOWN);
}
