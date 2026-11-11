// "Balance for the party": pick a target difficulty, see the smallest edits that
// get there, click one to apply it. Used by encounter blocks and the builder.

import type NimbleStatblocksPlugin from '../main';
import { EncounterDef } from './encounter-def';
import { BALANCE_TARGETS, BalanceGroup, BalanceTarget, balanceEncounter, describeChange, monsterRole, rateEncounter, shiftMonster } from './rules';
import { partyLevels } from './encounter-block';

const TARGETS = Object.keys(BALANCE_TARGETS) as BalanceTarget[];

/** Minion types from the same families as the monsters already in the fight. */
function familyMinions(plugin: NimbleStatblocksPlugin, groups: BalanceGroup[]): BalanceGroup[] {
	const families = new Set(groups.map(g => g.monster.group).filter(Boolean));
	if (!families.size || groups.some(g => monsterRole(g.monster) === 'minion')) return [];
	return plugin.index.all()
		.filter(e => monsterRole(e.monster) === 'minion' && e.monster.group && families.has(e.monster.group) && !/\(GM Guide\)$/.test(e.name))
		.slice(0, 2)
		.map(e => ({ name: e.name, monster: e.monster, count: 0 }));
}

export function renderBalance(el: HTMLElement, plugin: NimbleStatblocksPlugin, def: EncounterDef, apply: (next: EncounterDef) => void, opts: { initial?: BalanceTarget; onTarget?: (t: BalanceTarget) => void; hideTitle?: boolean } = {}): void {
	const groups: BalanceGroup[] = def.monsters
		// As they'll be run: a tougher or weaker monster counts as its shifted level.
		.map(m => { const e = plugin.index.get(m.name); return { name: m.name, monster: e ? shiftMonster(e.monster, m.shift ?? 0) : undefined, count: m.count }; })
		.filter((g): g is BalanceGroup => !!g.monster);
	const levels = partyLevels(plugin);
	const current = rateEncounter(groups, levels);
	let target: BalanceTarget = opts.initial ?? (current.label === 'Hard' ? 'Medium' : 'Hard');

	el.addClass('nimble-balance');
	const head = el.createDiv({ cls: 'balance-head' });
	if (opts.hideTitle) head.hide();
	head.createSpan({ cls: 'balance-title', text: `Balance for ${levels.length} level-${Math.round(levels.reduce((a, b) => a + b, 0) / levels.length)} heroes` });
	const seg = el.createDiv({ cls: 'nimble-segmented balance-targets', attr: { role: 'radiogroup', 'aria-label': 'Target difficulty' } });
	const list = el.createDiv({ cls: 'balance-list' });

	const draw = () => {
		seg.querySelectorAll('button').forEach(b => {
			const on = b.dataset.target === target;
			b.toggleClass('is-active', on);
			b.setAttr('aria-checked', String(on));
		});
		list.empty();
		if (!groups.length) { list.createDiv({ cls: 'balance-empty', text: 'Add some monsters first.' }); return; }
		if (current.label === target) { list.createDiv({ cls: 'balance-empty', text: `Already ${target} (${Math.round(current.pct * 100)}%).` }); return; }
		const suggestions = balanceEncounter(groups, levels, target, familyMinions(plugin, groups));
		if (!suggestions.length) { list.createDiv({ cls: 'balance-empty', text: `No small change reaches ${target}.` }); return; }
		for (const s of suggestions) {
			const b = list.createEl('button', { cls: 'balance-option' });
			b.createSpan({ cls: 'balance-option-text', text: s.changes.map((c, i) => { const t = describeChange(c); return i ? t[0].toLowerCase() + t.slice(1) : t; }).join(', ') });
			b.createSpan({ cls: `nimble-difficulty diff-${s.rating.label.toLowerCase().replace(/\s+/g, '-')}`, text: `${s.rating.label} · ${Math.round(s.rating.pct * 100)}%` });
			b.addEventListener('click', () => {
				const next: EncounterDef = { ...def, monsters: def.monsters.map(m => ({ ...m })) };
				for (const c of s.changes) {
					const ex = next.monsters.find(m => m.name === c.name);
					if (ex) ex.count = c.to;
					else next.monsters.push({ name: c.name, count: c.to });
				}
				next.monsters = next.monsters.filter(m => m.count > 0);
				apply(next);
			});
		}
	};
	for (const t of TARGETS) {
		const b = seg.createEl('button', { text: t, attr: { role: 'radio', 'data-target': t } });
		b.addEventListener('click', () => { target = t; opts.onTarget?.(t); draw(); });
	}
	draw();
}
