// Tables: DC columns get their numbers as pills (in reading view and inside
// boxes). The rest of the table styling is CSS (see "Tables" in styles.css).

import type NimbleStatblocksPlugin from '../main';

const DC_HEADER = /^(dc|difficulty|target)$/i;

export function registerTables(plugin: NimbleStatblocksPlugin): void {
	plugin.registerMarkdownPostProcessor((el) => {
		el.querySelectorAll('table').forEach((table) => {
			const heads = [...table.querySelectorAll('thead th')];
			const col = heads.findIndex(th => DC_HEADER.test(th.textContent?.trim() ?? ''));
			if (col < 0) return;
			heads[col].addClass('nimble-dc-cell');
			table.querySelectorAll('tbody tr').forEach((tr) => {
				const td = tr.children[col] as HTMLElement | undefined;
				if (!td || td.querySelector('.nimble-dc')) return;
				const text = td.textContent?.trim() ?? '';
				if (text.length > 12) return; // a sentence, not a DC
				td.addClass('nimble-dc-cell');
				td.empty();
				td.createSpan({ cls: `nimble-dc${/^\d+$/.test(text) ? '' : ' is-none'}`, text: text || '—' });
			});
		});
	});
	// The main window's body (the settings tab toggles it there too).
	const body = activeDocument.body;
	const apply = () => body.toggleClass('nimble-tables', plugin.settings.styleTables);
	apply();
	plugin.register(() => body.removeClass('nimble-tables'));
	(plugin as unknown as { applyTableStyle: () => void }).applyTableStyle = apply;
}
