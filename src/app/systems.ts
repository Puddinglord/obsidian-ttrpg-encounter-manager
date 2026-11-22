// Every game system the plugin ships. The first is the default: used outside
// campaigns and by campaigns that name no system (or one the plugin doesn't have).

import type { GameSystem } from '../systems/contract';
import { SystemRegistry } from '../systems/registry';
import { nimbleSystem } from '../systems/nimble/system';
import { dnd5eSystem } from '../systems/dnd5e/system';

export const SHIPPED_SYSTEMS: readonly GameSystem[] = [nimbleSystem, dnd5eSystem];

export function createSystems(): SystemRegistry {
	const systems = new SystemRegistry(SHIPPED_SYSTEMS[0].id);
	for (const s of SHIPPED_SYSTEMS) systems.register(s);
	return systems;
}
