// Tables: DC columns get their numbers as pills (in reading view and inside
// boxes). The rest of the table styling is CSS (see "Tables" in styles.css).

import type NimbleStatblocksPlugin from '../main';

const DC_HEADER = /^(dc|difficulty|target)$/i;

/**
 * Turns the plain numbers (and dashes) in a table's DC column into pills. Cells
 * holding anything else (a link, bold text, words) are left exactly as written.
 */
export function dcPills(el: HTMLElement): void {
	el.querySelectorAll('table').forEach((table) => {
		const heads = [...table.querySelectorAll('thead th')];
		const col = heads.findIndex(th => DC_HEADER.test(th.textContent?.trim() ?? ''));
		if (col < 0) return;
		let any = false;
		table.querySelectorAll('tbody tr').forEach((tr) => {
			const td = tr.children[col] as HTMLElement | undefined;
			if (!td) return;
			if (td.querySelector('.nimble-dc')) { any = true; return; }
			if (td.childElementCount) return;
			const text = td.textContent?.trim() ?? '';
			const dash = /^[—–-]$/.test(text);
			if (!dash && !/^\d+$/.test(text)) return;
			any = true;
			td.addClass('nimble-dc-cell');
			td.empty();
			td.createSpan({ cls: `nimble-dc${dash ? ' is-none' : ''}`, text });
		});
		if (any) heads[col].addClass('nimble-dc-cell');
	});
}

/** Documents (main window, pop-outs) that carry the "Styled tables" body class. */
const styledDocs = new Set<Document>();

/** Puts the "Styled tables" class on a window's body, per the setting. Call for each pop-out window. */
export function styleTablesIn(plugin: NimbleStatblocksPlugin, doc: Document): void {
	styledDocs.add(doc);
	doc.body.toggleClass('nimble-tables', plugin.settings.styleTables);
}

export function registerTables(plugin: NimbleStatblocksPlugin): void {
	plugin.registerMarkdownPostProcessor((el) => {
		// Tables in boxes are always styled; tables in notes only with "Styled tables" on.
		if (plugin.settings.styleTables || el.closest('.nimble-box-body')) dcPills(el);
	});
	// Every window open now: the main one (the settings tab toggles it there too) and pop-outs.
	const docs = () => {
		const all = new Set<Document>([activeDocument, ...styledDocs]);
		plugin.app.workspace.iterateAllLeaves((leaf) => { all.add(leaf.view.containerEl.doc); });
		return all;
	};
	const apply = () => docs().forEach(doc => { if (doc.defaultView) styleTablesIn(plugin, doc); else styledDocs.delete(doc); });
	apply();
	plugin.app.workspace.onLayoutReady(apply);
	plugin.register(() => { styledDocs.forEach(doc => doc.body?.removeClass('nimble-tables')); styledDocs.clear(); });
	(plugin as unknown as { applyTableStyle: () => void }).applyTableStyle = apply;
}
