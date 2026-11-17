// Which game systems the plugin knows, and which one applies where. A campaign
// names its system in its home note (`system: nimble`); everything outside a
// campaign, and any campaign naming a system the plugin doesn't have, uses the
// default. Pure: no Obsidian imports.

import type { GameSystem } from './contract';

export class SystemRegistry {
	private readonly systems = new Map<string, GameSystem>();

	constructor(private readonly defaultId: string) {}

	/** Every name (id and aliases, normalised) → its system. */
	private readonly names = new Map<string, GameSystem>();

	register(system: GameSystem): void {
		if (this.systems.has(system.id)) throw new Error(`Game system "${system.id}" is already registered`);
		const names = [system.id, ...(system.aliases ?? [])].map(normalizeSystemId);
		const taken = names.find(n => this.names.has(n));
		if (taken) throw new Error(`"${taken}" already names the ${this.names.get(taken)?.name} system`);
		this.systems.set(system.id, system);
		for (const n of names) this.names.set(n, system);
	}

	get(id: string): GameSystem | undefined {
		return this.names.get(normalizeSystemId(id));
	}

	all(): GameSystem[] {
		return [...this.systems.values()];
	}

	get default(): GameSystem {
		const s = this.systems.get(this.defaultId);
		if (!s) throw new Error(`The default game system "${this.defaultId}" isn't registered`);
		return s;
	}

	/** The system a campaign asked for, or the default when it named none (or one we don't have). */
	resolve(id: string | undefined): GameSystem {
		return (id && this.get(id)) || this.default;
	}
}

/** `Nimble`, ` nimble ` and `NIMBLE` all mean `nimble`; `D&D 5e` and `d&d  5E` are the same name. */
export function normalizeSystemId(id: string): string {
	return id.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The edition a campaign asked for, if the system has it (`2024`, ` 2024 `),
 * else the system's default (its first). Undefined for a system with one version.
 */
export function resolveEdition(system: GameSystem, edition: string | number | undefined): string | undefined {
	const editions = system.editions;
	if (!editions?.length) return undefined;
	const want = String(edition ?? '').trim().toLowerCase();
	return (editions.find(e => e.id.toLowerCase() === want) ?? editions[0]).id;
}
