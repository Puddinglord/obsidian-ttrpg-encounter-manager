// Which game systems the plugin knows, and which one applies where. A campaign
// names its system in its home note (`system: nimble`); everything outside a
// campaign, and any campaign naming a system the plugin doesn't have, uses the
// default. Pure: no Obsidian imports.

import type { GameSystem } from './contract';

export class SystemRegistry {
	private readonly systems = new Map<string, GameSystem>();

	constructor(private readonly defaultId: string) {}

	register(system: GameSystem): void {
		if (this.systems.has(system.id)) throw new Error(`Game system "${system.id}" is already registered`);
		this.systems.set(system.id, system);
	}

	get(id: string): GameSystem | undefined {
		return this.systems.get(normalizeSystemId(id));
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

/** `Nimble`, ` nimble ` and `NIMBLE` all mean `nimble`. */
export function normalizeSystemId(id: string): string {
	return id.trim().toLowerCase();
}
