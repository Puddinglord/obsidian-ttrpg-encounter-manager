// Buttons that belong together sit in one cluster: Damage | Heal, Roll | Spend, Condition and the
// stat block. A cluster never wraps into a ragged row; clusters wrap as whole units instead.
// The look is `.ev-cluster` in styles.css; each button keeps its own class for colours.

export interface ClusterOptions {
	/** One joined control: shared borders, rounded only at the ends. */
	joined?: boolean;
	/** Every button the same width, sharing the cluster's width (a pair like Damage | Heal is 50/50). */
	fill?: boolean;
	/** Pushed to the end of its row. */
	end?: boolean;
	/** The group's accessible name. */
	label?: string;
	cls?: string;
}

/** A cluster in `parent`. Add the buttons to the returned element. */
export function cluster(parent: HTMLElement, opts: ClusterOptions = {}): HTMLElement {
	const cls = ['ev-cluster'];
	if (opts.joined) cls.push('is-joined');
	if (opts.fill) cls.push('is-fill');
	if (opts.end) cls.push('is-end');
	if (opts.cls) cls.push(...opts.cls.split(/\s+/).filter(Boolean));
	const el = parent.createDiv({ cls });
	el.setAttr('role', 'group');
	if (opts.label) el.setAttr('aria-label', opts.label);
	return el;
}

/** A row that holds clusters and lets them wrap as units. */
export function clusters(parent: HTMLElement, cls?: string): HTMLElement {
	return parent.createDiv({ cls: ['ev-clusters', ...(cls ? [cls] : [])] });
}
