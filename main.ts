import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, ItemView, TFile, MarkdownPostProcessorContext } from 'obsidian';

// ============================================================================
// TYPES
// ============================================================================

type ArmorType = 'none' | 'medium' | 'heavy';
type MonsterType = 'regular' | 'solo';

interface NimbleAttack {
	raw: string;
}

interface NimbleAbility {
	name: string;
	description: string;
	isLegendary?: boolean;
	recharge?: string;
}

interface NimbleMonster {
	name: string;
	type?: string;
	size?: string;
	alignment?: string;
	cr?: number | string;
	level?: number | string;
	armor: ArmorType;
	hp: number;
	movement: string;
	str?: string;
	dex?: string;
	will?: string;
	attacks?: NimbleAttack[];
	multiattack?: string;
	actionText?: string;
	abilities?: NimbleAbility[];
	resistances?: string[];
	immunities?: string[];
	senses?: string;
	languages?: string;
	monsterType?: MonsterType;
	legendaryResistances?: number;
	description?: string;
	bloodied?: string;
	lastStand?: string;
}

interface EncounterCreature {
	id: string;
	monster: NimbleMonster;
	label: string;
	currentHp: number;
	maxHp: number;
	sourceFile?: string;
	conditions: string[];
}

interface MonsterIndexEntry {
	name: string;
	filePath: string;
	monster: NimbleMonster;
}

interface NimbleCondition {
	name: string;
	description: string;
	auto?: boolean;
}

const NIMBLE_CONDITIONS: NimbleCondition[] = [
	{ name: 'Bloodied', description: 'At half HP or less.', auto: true },
	{ name: 'Blinded', description: "Can't see. Attacks against you have advantage, and your attacks have disadvantage." },
	{ name: 'Charmed', description: 'Sees the charmer as an ally. Charmer has advantage on social interactions with you.' },
	{ name: 'Dazed', description: 'Heroes: lose 1 action; monsters: can perform one less action on their next turn.' },
	{ name: 'Dying', description: 'At 0 HP. Taking damage while dying causes 2 Wounds, a crit causes 3 instead.' },
	{ name: 'Frightened', description: 'Disadvantage on rolls when source of fear is nearby; speed halved when moving closer to it.' },
	{ name: 'Grappled', description: 'Cannot move. Attacks against you have advantage.' },
	{ name: 'Hampered', description: 'Any creature with their actions or movement reduced (e.g., Dazed, Grappled, Prone, Difficult Terrain).' },
	{ name: 'Incapacitated', description: "Can't do anything. Attacks against you have advantage, and melee attacks that hit, crit." },
	{ name: 'Invisible', description: 'Cannot be seen. Your attacks have advantage, and attacks against you have disadvantage.' },
	{ name: 'Petrified', description: 'Incapacitated. You have all the benefits and drawbacks of being a rock! Immune to most damage except from large explosions, picks, or similar tools.' },
	{ name: 'Poisoned', description: 'Disadvantage on rolls.' },
	{ name: 'Prone', description: 'Movement costs twice as much, and disadvantage on attacks. Melee attacks against you have advantage; Ranged have disadvantage. Spend 3 spaces of your Speed to stand up.' },
	{ name: 'Restrained', description: 'Cannot move. Attacks against you have advantage.' },
	{ name: 'Riding', description: 'You move with the creature you are riding. Any attacks that miss you, strike them.' },
	{ name: 'Slowed', description: 'Speed halved during your next turn.' },
	{ name: 'Taunted', description: 'Disadvantage on attacks except against the most recent taunter.' },
	{ name: 'Wounded', description: 'Has any Wounds (typically 6 Wounds and a hero is dead).' },
	{ name: 'Smoldering', description: 'Minor status. Does nothing on its own; ends when combat does. Some abilities have additional effects against such targets.' },
	{ name: 'Charged', description: 'Minor status. Does nothing on its own; ends when combat does. Some abilities have additional effects against such targets.' },
	{ name: 'Distracted', description: 'Minor status. Does nothing on its own; ends when combat does. Some abilities have additional effects against such targets.' },
];

interface Encounter {
	id: string;
	name: string;
	creatures: EncounterCreature[];
}

interface NimbleStatblocksSettings {
	statblockStyle: 'book' | 'compact';
	encounters: Encounter[];
	activeEncounterId: string | null;
	multipleEncounters: boolean;
	customConditions: NimbleCondition[];
}

const DEFAULT_SETTINGS: NimbleStatblocksSettings = {
	statblockStyle: 'book',
	encounters: [],
	activeEncounterId: null,
	multipleEncounters: false,
	customConditions: []
};

// ============================================================================
// ENCOUNTER TRACKER VIEW
// ============================================================================

const ENCOUNTER_VIEW_TYPE = 'nimble-encounter-tracker';

class EncounterTrackerView extends ItemView {
	plugin: NimbleStatblocksPlugin;
	viewingCreatureId: string | null = null;
	viewingCondition: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: NimbleStatblocksPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getAllConditions(): NimbleCondition[] {
		const customConditions = this.plugin.settings.customConditions || [];
		return [...NIMBLE_CONDITIONS, ...customConditions];
	}

	getViewType(): string {
		return ENCOUNTER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Nimble Encounters';
	}

	getIcon(): string {
		return 'swords';
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	render(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('nimble-encounter-tracker');

		const multiMode = this.plugin.settings.multipleEncounters;

		// Ensure single encounter exists in single mode
		if (!multiMode) {
			this.ensureSingleEncounter();
		}

		// Check if we're viewing a creature's stat block or condition
		const activeEnc = this.getActiveEncounter();
		const viewingCreature = activeEnc?.creatures.find(c => c.id === this.viewingCreatureId);
		const viewingCond = this.viewingCondition ? this.getAllConditions().find(c => c.name === this.viewingCondition) : null;

		// Condition viewer
		if (viewingCond) {
			const condViewer = container.createEl('div', { cls: 'condition-viewer' });

			const condHeader = condViewer.createEl('div', { cls: 'viewer-header' });
			condHeader.createEl('span', { text: viewingCond.name, cls: 'viewer-title condition-title' });
			const closeCondBtn = condHeader.createEl('button', { text: '✕', cls: 'close-viewer-btn small' });
			closeCondBtn.onclick = () => {
				this.viewingCondition = null;
				this.render();
			};

			condViewer.createEl('p', { text: viewingCond.description, cls: 'condition-description' });
			condViewer.createEl('hr', { cls: 'viewer-divider' });
		}

		// Stat block viewer
		if (viewingCreature) {
			const viewer = container.createEl('div', { cls: 'statblock-viewer' });

			const viewerHeader = viewer.createEl('div', { cls: 'viewer-header' });
			viewerHeader.createEl('span', { text: viewingCreature.label, cls: 'viewer-title' });
			const closeBtn = viewerHeader.createEl('button', { text: '✕', cls: 'close-viewer-btn small' });
			closeBtn.onclick = () => {
				this.viewingCreatureId = null;
				this.render();
			};

			// Render the stat block
			const statblockContainer = viewer.createEl('div', { cls: 'viewer-statblock' });
			this.renderInlineStatblock(statblockContainer, viewingCreature.monster, viewingCreature.sourceFile);

			viewer.createEl('hr', { cls: 'viewer-divider' });
		}

		// Header
		const header = container.createEl('div', { cls: 'encounter-header' });
		header.createEl('h3', { text: 'Encounter Tracker' });

		// Multiple encounters mode: show create form and selector
		if (multiMode) {
			// New encounter form
			const newForm = container.createEl('div', { cls: 'new-encounter-form' });
			const input = newForm.createEl('input', {
				type: 'text',
				placeholder: 'New encounter name...'
			});
			input.addClass('encounter-name-input');

			const addBtn = newForm.createEl('button', { text: '+' });
			addBtn.addClass('add-encounter-btn');

			addBtn.onclick = () => {
				if (input.value.trim()) {
					this.createEncounter(input.value.trim());
					input.value = '';
				}
			};

			input.onkeydown = (e) => {
				if (e.key === 'Enter' && input.value.trim()) {
					this.createEncounter(input.value.trim());
					input.value = '';
				}
			};

			// Encounter selector
			const selector = container.createEl('div', { cls: 'encounter-selector' });
			const select = selector.createEl('select');
			select.addClass('encounter-select');

			select.createEl('option', { text: 'Select encounter...', value: '' });
			for (const enc of this.plugin.settings.encounters) {
				const opt = select.createEl('option', { text: enc.name, value: enc.id });
				if (enc.id === this.plugin.settings.activeEncounterId) {
					opt.selected = true;
				}
			}

			select.onchange = () => {
				this.plugin.settings.activeEncounterId = select.value || null;
				this.viewingCreatureId = null;
				this.viewingCondition = null;
				this.plugin.saveSettings();
				this.render();
			};
		}

		// Active encounter content
		if (activeEnc) {
			const content = container.createEl('div', { cls: 'encounter-content' });

			// Delete encounter button (only in multiple mode)
			if (multiMode) {
				const deleteBtn = content.createEl('button', { text: '🗑️ Delete Encounter' });
				deleteBtn.addClass('delete-encounter-btn');
				deleteBtn.onclick = () => this.deleteEncounter(activeEnc.id);
			} else {
				// Clear all button in single mode
				if (activeEnc.creatures.length > 0) {
					const clearContainer = content.createEl('div', { cls: 'clear-btn-container' });
					const clearBtn = clearContainer.createEl('button', { text: '🗑️ Clear All' });
					clearBtn.addClass('delete-encounter-btn');
					clearBtn.onclick = () => {
						// Replace with confirm/cancel buttons
						clearContainer.empty();
						const confirmBtn = clearContainer.createEl('button', { text: '✓ Confirm' });
						confirmBtn.addClass('confirm-btn');
						const cancelBtn = clearContainer.createEl('button', { text: '✕ Cancel' });
						cancelBtn.addClass('cancel-btn');

						confirmBtn.onclick = () => {
							activeEnc.creatures = [];
							this.viewingCreatureId = null;
							this.viewingCondition = null;
							this.plugin.saveSettings();
							this.render();
						};

						cancelBtn.onclick = () => {
							this.render();
						};
					};
				}
			}

			if (activeEnc.creatures.length === 0) {
				content.createEl('p', {
					text: 'No creatures yet. Add monsters from stat blocks.',
					cls: 'empty-message'
				});
			} else {
				this.renderCreatureList(container, activeEnc);
			}
		} else if (multiMode) {
			// Only show this message in multi mode when no encounter selected
			container.createEl('p', {
				text: 'Create or select an encounter to get started.',
				cls: 'empty-message'
			});
		}
	}

	ensureSingleEncounter(): void {
		if (this.plugin.settings.encounters.length === 0) {
			const enc: Encounter = {
				id: 'single-encounter',
				name: 'Current Encounter',
				creatures: []
			};
			this.plugin.settings.encounters = [enc];
			this.plugin.settings.activeEncounterId = enc.id;
			this.plugin.saveSettings();
		} else if (!this.plugin.settings.activeEncounterId) {
			this.plugin.settings.activeEncounterId = this.plugin.settings.encounters[0].id;
			this.plugin.saveSettings();
		}
	}

	renderCreatureList(container: HTMLElement, activeEnc: Encounter): void {
		const list = container.createEl('ul', { cls: 'creature-list' });

		for (let i = 0; i < activeEnc.creatures.length; i++) {
			const creature = activeEnc.creatures[i];
			const item = list.createEl('li', { cls: 'creature-item' });
			item.addClass(this.getHpClass(creature.currentHp, creature.maxHp));

			// Make draggable
			item.setAttribute('draggable', 'true');
			item.dataset.creatureId = creature.id;
			item.dataset.index = i.toString();

			item.ondragstart = (e) => {
				item.addClass('dragging');
				e.dataTransfer?.setData('text/plain', creature.id);
			};

			item.ondragend = () => {
				item.removeClass('dragging');
				list.querySelectorAll('.drag-over').forEach(el => el.removeClass('drag-over'));
			};

			item.ondragover = (e) => {
				e.preventDefault();
				const dragging = list.querySelector('.dragging');
				if (dragging && dragging !== item) {
					item.addClass('drag-over');
				}
			};

			item.ondragleave = () => {
				item.removeClass('drag-over');
			};

			item.ondrop = (e) => {
				e.preventDefault();
				item.removeClass('drag-over');
				const draggedId = e.dataTransfer?.getData('text/plain');
				if (draggedId && draggedId !== creature.id) {
					this.reorderCreature(activeEnc.id, draggedId, creature.id);
				}
			};

			// Header row
			const headerRow = item.createEl('div', { cls: 'creature-header' });

			// Drag handle
			const dragHandle = headerRow.createEl('span', { cls: 'drag-handle', text: '⋮⋮' });
			dragHandle.setAttribute('title', 'Drag to reorder');

			// Label - click to view stat block
			const labelContainer = headerRow.createEl('div', { cls: 'label-container' });
			const labelSpan = labelContainer.createEl('span', { text: creature.label, cls: 'creature-label' });
			labelSpan.setAttribute('title', 'Click to view stat block');
			if (this.viewingCreatureId === creature.id) {
				labelSpan.addClass('viewing');
			}

			// Click label to view stat block (always replace, never close)
			labelSpan.onclick = () => {
				this.viewingCreatureId = creature.id;
				this.render();
			};

			// Buttons container
			const buttonsContainer = headerRow.createEl('div', { cls: 'creature-buttons' });

			// Edit label button (pencil SVG)
			const pencilSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
			const editBtn = buttonsContainer.createEl('button', { cls: 'edit-btn' });
			editBtn.innerHTML = pencilSvg;
			editBtn.setAttribute('title', 'Edit label');
			editBtn.onclick = () => {
				const input = document.createElement('input');
				input.type = 'text';
				input.value = creature.label;
				input.className = 'label-edit-input';

				const saveLabel = () => {
					const newLabel = input.value.trim();
					if (newLabel && newLabel !== creature.label) {
						creature.label = newLabel;
						this.plugin.saveSettings();
					}
					this.render();
				};

				input.onblur = saveLabel;
				input.onkeydown = (e) => {
					if (e.key === 'Enter') {
						saveLabel();
					} else if (e.key === 'Escape') {
						this.render();
					}
				};

				labelContainer.empty();
				labelContainer.appendChild(input);
				input.focus();
				input.select();
			};

			const removeBtn = buttonsContainer.createEl('button', { text: '✕', cls: 'remove-btn' });
			removeBtn.onclick = () => this.removeCreature(activeEnc.id, creature.id);

			// HP controls
			const hpRow = item.createEl('div', { cls: 'hp-controls' });

			const minus5 = hpRow.createEl('button', { text: '-5', cls: 'hp-btn' });
			minus5.onclick = () => this.updateHp(activeEnc.id, creature.id, -5);

			const minus1 = hpRow.createEl('button', { text: '-1', cls: 'hp-btn' });
			minus1.onclick = () => this.updateHp(activeEnc.id, creature.id, -1);

			hpRow.createEl('span', {
				text: `${creature.currentHp} / ${creature.maxHp}`,
				cls: 'hp-display'
			});

			const plus1 = hpRow.createEl('button', { text: '+1', cls: 'hp-btn' });
			plus1.onclick = () => this.updateHp(activeEnc.id, creature.id, 1);

			const plus5 = hpRow.createEl('button', { text: '+5', cls: 'hp-btn' });
			plus5.onclick = () => this.updateHp(activeEnc.id, creature.id, 5);

			// Conditions row
			const conditionsRow = item.createEl('div', { cls: 'conditions-row' });

			// Calculate if bloodied (auto condition)
			const isBloodied = creature.currentHp <= creature.maxHp / 2 && creature.currentHp > 0;
			const isDying = creature.currentHp === 0;

			// Ensure conditions array exists
			if (!creature.conditions) creature.conditions = [];

			// Get all conditions to display
			const displayConditions: string[] = [];
			if (isDying && !creature.conditions.includes('Dying')) {
				displayConditions.push('Dying');
			}
			if (isBloodied && !creature.conditions.includes('Bloodied')) {
				displayConditions.push('Bloodied');
			}
			displayConditions.push(...creature.conditions.filter(c => c !== 'Bloodied' && c !== 'Dying'));

			// Display conditions as tags
			for (const condName of displayConditions) {
				const cond = this.getAllConditions().find(c => c.name === condName);
				const tag = conditionsRow.createEl('span', {
					text: condName,
					cls: 'condition-tag'
				});

				// Add tooltip
				if (cond) {
					tag.setAttribute('title', cond.description);
				}

				// Auto conditions get special styling
				if ((condName === 'Bloodied' && isBloodied && !creature.conditions.includes('Bloodied')) ||
					(condName === 'Dying' && isDying && !creature.conditions.includes('Dying'))) {
					tag.addClass('auto-condition');
				} else {
					// Add remove button for manually added conditions
					const removeCondBtn = tag.createEl('span', { text: '×', cls: 'remove-condition' });
					removeCondBtn.onclick = (e) => {
						e.stopPropagation();
						this.removeCondition(activeEnc.id, creature.id, condName);
					};
				}

				// Click to view in panel
				tag.onclick = () => {
					this.viewingCondition = this.viewingCondition === condName ? null : condName;
					this.render();
				};
			}

			// Add condition button
			const addCondBtn = conditionsRow.createEl('button', { text: '+', cls: 'add-condition-btn' });
			addCondBtn.setAttribute('title', 'Add condition');
			addCondBtn.onclick = (e) => {
				e.stopPropagation();
				this.showConditionPicker(addCondBtn, activeEnc.id, creature.id, creature.conditions);
			};
		}
	}

	getActiveEncounter(): Encounter | null {
		if (!this.plugin.settings.activeEncounterId) return null;
		return this.plugin.settings.encounters.find(e => e.id === this.plugin.settings.activeEncounterId) || null;
	}

	getHpClass(current: number, max: number): string {
		const ratio = current / max;
		if (ratio > 0.5) return 'hp-healthy';
		if (ratio > 0.25) return 'hp-wounded';
		if (ratio > 0) return 'hp-critical';
		return 'hp-dead';
	}

	createEncounter(name: string): void {
		const encounter: Encounter = {
			id: Date.now().toString(36),
			name,
			creatures: []
		};
		this.plugin.settings.encounters.push(encounter);
		this.plugin.settings.activeEncounterId = encounter.id;
		this.plugin.saveSettings();
		this.render();
	}

	deleteEncounter(id: string): void {
		this.plugin.settings.encounters = this.plugin.settings.encounters.filter(e => e.id !== id);
		if (this.plugin.settings.activeEncounterId === id) {
			this.plugin.settings.activeEncounterId = this.plugin.settings.encounters[0]?.id || null;
		}
		this.viewingCreatureId = null;
		this.viewingCondition = null;
		this.plugin.saveSettings();
		this.render();
	}

	addCreature(monster: NimbleMonster, sourceFile?: string): void {
		const enc = this.getActiveEncounter();
		if (!enc) {
			new Notice('Create or select an encounter first');
			return;
		}

		const count = enc.creatures.filter(c => c.monster.name === monster.name).length;
		const creature: EncounterCreature = {
			id: Date.now().toString(36),
			monster,
			label: `${monster.name}-${count + 1}`,
			currentHp: monster.hp,
			maxHp: monster.hp,
			sourceFile,
			conditions: []
		};

		enc.creatures.push(creature);
		this.plugin.saveSettings();
		this.render();
		new Notice(`Added ${creature.label}`);
	}

	removeCreature(encId: string, creatureId: string): void {
		const enc = this.plugin.settings.encounters.find(e => e.id === encId);
		if (enc) {
			enc.creatures = enc.creatures.filter(c => c.id !== creatureId);
			if (this.viewingCreatureId === creatureId) {
				this.viewingCreatureId = null;
			}
			this.viewingCondition = null;
			this.plugin.saveSettings();
			this.render();
		}
	}

	updateHp(encId: string, creatureId: string, delta: number): void {
		const enc = this.plugin.settings.encounters.find(e => e.id === encId);
		if (enc) {
			const creature = enc.creatures.find(c => c.id === creatureId);
			if (creature) {
				creature.currentHp = Math.max(0, Math.min(creature.maxHp, creature.currentHp + delta));
				this.plugin.saveSettings();
				this.render();
			}
		}
	}

	showConditionPicker(button: HTMLElement, encId: string, creatureId: string, existingConditions: string[]): void {
		// Remove any existing picker
		const existingPicker = document.querySelector('.condition-picker');
		if (existingPicker) existingPicker.remove();

		const picker = document.createElement('div');
		picker.className = 'condition-picker';

		// Get available conditions (exclude already applied ones), sorted alphabetically
		const allConditions = this.getAllConditions();
		const available = allConditions
			.filter(c => !c.auto && !existingConditions.includes(c.name))
			.sort((a, b) => a.name.localeCompare(b.name));

		if (available.length === 0) {
			const emptyDiv = document.createElement('div');
			emptyDiv.className = 'picker-empty';
			emptyDiv.textContent = 'All conditions applied';
			picker.appendChild(emptyDiv);
		} else {
			for (const cond of available) {
				const option = document.createElement('div');
				option.className = 'picker-option';
				option.textContent = cond.name;
				option.setAttribute('title', cond.description);
				option.onclick = () => {
					this.addCondition(encId, creatureId, cond.name);
					picker.remove();
				};
				picker.appendChild(option);
			}
		}

		// Position near button
		document.body.appendChild(picker);
		const rect = button.getBoundingClientRect();
		picker.style.position = 'fixed';
		picker.style.left = `${rect.left}px`;
		picker.style.top = `${rect.bottom + 4}px`;
		picker.style.zIndex = '1000';

		// Close when clicking outside
		const closeHandler = (e: MouseEvent) => {
			if (!picker.contains(e.target as Node) && e.target !== button) {
				picker.remove();
				document.removeEventListener('click', closeHandler);
			}
		};
		setTimeout(() => document.addEventListener('click', closeHandler), 0);
	}

	addCondition(encId: string, creatureId: string, conditionName: string): void {
		const enc = this.plugin.settings.encounters.find(e => e.id === encId);
		if (enc) {
			const creature = enc.creatures.find(c => c.id === creatureId);
			if (creature) {
				if (!creature.conditions) creature.conditions = [];
				if (!creature.conditions.includes(conditionName)) {
					creature.conditions.push(conditionName);
					this.plugin.saveSettings();
					this.render();
				}
			}
		}
	}

	removeCondition(encId: string, creatureId: string, conditionName: string): void {
		const enc = this.plugin.settings.encounters.find(e => e.id === encId);
		if (enc) {
			const creature = enc.creatures.find(c => c.id === creatureId);
			if (creature && creature.conditions) {
				creature.conditions = creature.conditions.filter(c => c !== conditionName);
				this.plugin.saveSettings();
				this.render();
			}
		}
	}

	reorderCreature(encId: string, draggedId: string, targetId: string): void {
		const enc = this.plugin.settings.encounters.find(e => e.id === encId);
		if (enc) {
			const draggedIndex = enc.creatures.findIndex(c => c.id === draggedId);
			const targetIndex = enc.creatures.findIndex(c => c.id === targetId);

			if (draggedIndex !== -1 && targetIndex !== -1) {
				// Remove dragged item
				const [dragged] = enc.creatures.splice(draggedIndex, 1);
				// Insert at target position
				enc.creatures.splice(targetIndex, 0, dragged);

				this.plugin.saveSettings();
				this.render();
			}
		}
	}

	renderInlineStatblock(container: HTMLElement, monster: NimbleMonster, sourceFile?: string): void {
		const block = container.createEl('div', { cls: 'nimble-statblock inline' });
		const isSolo = monster.monsterType === 'solo';
		if (isSolo) block.addClass('solo-monster');

		if (isSolo) {
			// Use solo layout
			this.renderInlineSolo(block, monster);
		} else {
			// Use regular layout
			this.renderInlineRegular(block, monster);
		}

		// Description
		if (monster.description) {
			block.createEl('hr');
			block.createEl('p', { text: monster.description, cls: 'monster-description' });
		}

		// Process WikiLinks
		processWikiLinks(block, this.plugin, sourceFile || '');
	}

	renderInlineSolo(block: HTMLElement, monster: NimbleMonster): void {
		// Solo Header Row
		const headerRow = block.createEl('div', { cls: 'solo-header-row' });

		const headerLeft = headerRow.createEl('div', { cls: 'solo-header-left' });
		const levelParts = [];
		if (monster.level) levelParts.push(`Level ${monster.level}`);
		if (monster.size) levelParts.push(monster.size);
		if (monster.type) levelParts.push(monster.type);
		headerLeft.createEl('span', { text: levelParts.join(' '), cls: 'solo-level-type' });

		const headerRight = headerRow.createEl('div', { cls: 'solo-header-right' });

		// SVG Icons
		const heartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
		const shieldSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`;
		const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

		const hpBadge = headerRight.createEl('span', { cls: 'solo-stat-badge hp-badge' });
		hpBadge.innerHTML = `${heartSvg}<span class="badge-value">${monster.hp}</span>`;

		// Armor badge (only show if medium or heavy)
		if (monster.armor !== 'none') {
			const armorLetter = monster.armor === 'medium' ? 'M' : 'H';
			const armorBadge = headerRight.createEl('span', { cls: 'solo-stat-badge armor-badge' });
			armorBadge.innerHTML = `${shieldSvg}<span class="badge-value">${armorLetter}</span>`;
		}

		const savesParts: string[] = [];
		if (monster.str) savesParts.push(`STR${monster.str}`);
		if (monster.dex) savesParts.push(`DEX${monster.dex}`);
		if (monster.will) savesParts.push(`WIL${monster.will}`);
		if (savesParts.length > 0) {
			const savesBadge = headerRight.createEl('span', { cls: 'solo-stat-badge saves-badge' });
			savesBadge.innerHTML = `${starSvg}<span class="badge-value">${savesParts.join(' ')}</span>`;
		}

		block.createEl('h2', { text: monster.name, cls: 'monster-name solo-name' });

		// Abilities (all in ONE box)
		if (monster.abilities?.length) {
			const abilitiesBox = block.createEl('div', { cls: 'solo-abilities-box' });
			for (const ab of monster.abilities) {
				const abilityDiv = abilitiesBox.createEl('div', { cls: 'solo-ability-item' });
				let name = ab.name;
				if (ab.isLegendary) name += ' (L)';
				abilityDiv.innerHTML = `<strong class="ability-name">${name}.</strong> ${markdownToHtml(ab.description)}`;
			}
		}

		block.createEl('hr');

		// Actions
		if (monster.attacks?.length || monster.multiattack) {
			const actionsSection = block.createEl('div', { cls: 'solo-actions-section' });

			const actionHeader = actionsSection.createEl('p', { cls: 'solo-action-header' });
			const actionText = monster.actionText || 'After each hero\'s turn, choose one:';
			actionHeader.innerHTML = `<strong>ACTIONS:</strong> ${actionText}`;

			if (monster.multiattack) {
				const p = actionsSection.createEl('p');
				p.innerHTML = markdownToHtml(monster.multiattack);
			}

			const actionsList = actionsSection.createEl('ul', { cls: 'solo-actions-list' });
			for (const atk of monster.attacks || []) {
				const li = actionsList.createEl('li');
				li.innerHTML = markdownToHtml(atk.raw);
			}
		}

		// Bloodied
		if (monster.bloodied) {
			const bloodiedSection = block.createEl('div', { cls: 'solo-phase-section bloodied-section' });
			bloodiedSection.innerHTML = `<strong class="phase-label">BLOODIED:</strong> ${markdownToHtml(monster.bloodied)}`;
		}

		// Last Stand
		if (monster.lastStand) {
			const lastStandSection = block.createEl('div', { cls: 'solo-phase-section laststand-section' });
			lastStandSection.innerHTML = `<strong class="phase-label">LAST STAND:</strong> ${markdownToHtml(monster.lastStand)}`;
		}

		if (monster.legendaryResistances) {
			const lrSection = block.createEl('div', { cls: 'solo-phase-section' });
			lrSection.innerHTML = `<strong>Legendary Resistances (${monster.legendaryResistances}/Day).</strong> Can choose to succeed on a failed save.`;
		}
	}

	renderInlineRegular(block: HTMLElement, monster: NimbleMonster): void {
		// SVG Icons
		const skullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 512 512" fill="white" stroke="none"><path d="M437.914,74.078C392.43,27,326.117,0,255.992,0C185.883,0,119.57,27,74.102,74.063c-42.5,44-64.703,102.828-62.531,165.688l6.609,83.875c6.031,84.75,55.234,93.906,76.094,93.906c7.563,0,15.531-1.094,23.625-3.188c1.094,7.938,1,21.859,0.922,32.688l-0.078,15.063c-0.141,10.938-0.359,27.5,11.234,39.234c4.797,4.875,13.563,10.672,28,10.672h196.047c14.438,0,23.188-5.797,28-10.656c11.578-11.75,11.375-28.297,11.234-39.25l-0.094-15.031c-0.063-10.844-0.172-24.781,0.938-32.719c8.172,2.109,16.094,3.188,23.625,3.188c20.859,0,70.047-9.156,76.094-93.75l6.563-83.156l0.047-0.875C502.602,176.891,480.398,118.063,437.914,74.078z M459.961,237.906l-6.516,82.844c-2.672,37.344-14.703,56.281-35.719,56.281c-4.844,0-10.266-0.891-16.297-2.688c-14.406-4.156-26.891-1.375-35.703,7.5c-13.406,13.5-13.266,35.313-13.047,65.5l0.078,15.281c0.031,2.5,0.078,6.188-0.141,8.875h-42.75v-50.016h-32.406V471.5h-42.938v-50.016h-32.391V471.5h-42.766c-0.203-2.688-0.156-6.375-0.125-8.906l0.078-15.297c0.219-30.156,0.359-51.953-13.047-65.453c-8.766-8.844-20.953-11.75-35.875-7.453c-5.859,1.75-11.281,2.641-16.125,2.641c-21.031,0-33.031-18.938-35.719-56.438l-6.531-82.688c-1.656-51.609,16.5-99.781,51.203-135.688C141.117,63,196.805,40.5,255.992,40.5c59.203,0,114.891,22.5,152.781,61.719C443.477,138.125,461.648,186.297,459.961,237.906z"/><path d="M256.008,309.656c-9.719,0-31.125,46.688-35.031,54.469c-3.875,7.781,3.906,19.469,15.578,15.563c11.672-3.875,19.453-13.609,19.453-13.609s7.781,9.734,19.453,13.609c11.656,3.906,19.453-7.781,15.563-15.563C287.117,356.344,265.742,309.656,256.008,309.656z"/><path d="M171.586,183.281c-30.891-3.25-58.578,19.188-61.828,50.094l-4.188,29.422c-3.25,30.922,19.188,58.578,50.078,61.828c30.922,3.25,58.609-19.172,61.844-50.094l4.188-29.422C224.914,214.188,202.508,186.531,171.586,183.281z"/><path d="M402.242,233.375c-3.234-30.906-30.938-53.344-61.828-50.094c-30.922,3.25-53.328,30.906-50.094,61.828l4.172,29.422c3.25,30.922,30.938,53.344,61.844,50.094s53.344-30.906,50.094-61.828L402.242,233.375z"/></svg>`;
		const sizeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 32 32" fill="white" stroke="none"><path d="M21.434 11.975l8.602-8.549-0.028 4.846c-0.009 0.404 0.311 0.755 0.716 0.746l0.513-0.001c0.404-0.009 0.739-0.25 0.748-0.654l0.021-7.219c0-0.007-0.027-0.012-0.027-0.019l0.040-0.366c0.004-0.203-0.044-0.384-0.174-0.513-0.13-0.131-0.311-0.21-0.512-0.204l-0.366 0.009c-0.007 0-0.012 0.003-0.020 0.004l-7.172-0.032c-0.404 0.009-0.738 0.343-0.747 0.748l-0.001 0.513c0.061 0.476 0.436 0.755 0.84 0.746l4.726 0.013-8.572 8.52c-0.39 0.39-0.39 1.024 0 1.415s1.023 0.39 1.414 0zM10.597 20.025l-8.602 8.523 0.027-4.82c0.010-0.404-0.312-0.756-0.716-0.747l-0.544 0.001c-0.405 0.010-0.739 0.25-0.748 0.654l-0.021 7.219c0 0.007 0.028 0.011 0.028 0.019l-0.040 0.365c-0.005 0.203 0.043 0.385 0.174 0.514 0.129 0.131 0.311 0.21 0.512 0.205l0.366-0.009c0.007 0 0.012-0.003 0.020-0.003l7.203 0.032c0.404-0.010 0.738-0.344 0.748-0.748l0.001-0.514c-0.062-0.476-0.436-0.755-0.840-0.746l-4.726-0.012 8.571-8.518c0.39-0.39 0.39-1.023 0-1.414s-1.023-0.391-1.413-0zM32.007 30.855l-0.021-7.219c-0.009-0.404-0.343-0.645-0.747-0.654l-0.513-0.001c-0.404-0.009-0.725 0.343-0.716 0.747l0.028 4.846-8.602-8.549c-0.39-0.39-1.023-0.39-1.414 0s-0.39 1.023 0 1.414l8.571 8.518-4.726 0.012c-0.404-0.009-0.779 0.27-0.840 0.746l0.001 0.514c0.009 0.404 0.344 0.739 0.747 0.748l7.172-0.032c0.008 0 0.013 0.003 0.020 0.003l0.366 0.009c0.201 0.005 0.384-0.074 0.512-0.205 0.131-0.129 0.178-0.311 0.174-0.514l-0.040-0.365c0-0.008 0.027-0.012 0.027-0.019zM3.439 2.041l4.727-0.012c0.404 0.009 0.778-0.27 0.840-0.746l-0.001-0.513c-0.010-0.405-0.344-0.739-0.748-0.748l-7.204 0.031c-0.008-0.001-0.013-0.004-0.020-0.004l-0.366-0.009c-0.201-0.005-0.383 0.074-0.512 0.204-0.132 0.13-0.179 0.31-0.174 0.514l0.040 0.366c0 0.007-0.028 0.012-0.028 0.020l0.021 7.219c0.009 0.404 0.343 0.645 0.748 0.654l0.545 0.001c0.404 0.009 0.724-0.342 0.715-0.746l-0.028-4.819 8.602 8.523c0.39 0.39 1.024 0.39 1.414 0s0.39-1.024 0-1.415z"/></svg>`;
		const heartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
		const shieldSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`;
		const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
		const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>`;

		// Header Row: Name + Type on left, badges on right
		const headerRow = block.createEl('div', { cls: 'monster-header-row' });

		const headerLeft = headerRow.createEl('div', { cls: 'monster-header-left' });
		headerLeft.createEl('span', { text: monster.name, cls: 'monster-name-inline' });

		// Build type string (size and level now in badges)
		const infoParts = [];
		if (monster.type) infoParts.push(monster.type);
		if (monster.cr) infoParts.push(`CR ${monster.cr}`);
		if (infoParts.length > 0) {
			headerLeft.createEl('span', { text: infoParts.join(', '), cls: 'monster-info-inline' });
		}

		// Right side badges - Order: Level, Size, HP, Armor, Movement, Saves
		const headerRight = headerRow.createEl('div', { cls: 'monster-header-right' });

		// Level badge (skull icon)
		if (monster.level) {
			const levelBadge = headerRight.createEl('span', { cls: 'stat-badge level-badge' });
			levelBadge.innerHTML = `${skullSvg}<span class="badge-value">${monster.level}</span>`;
		}

		// Size badge (person icon) - only show if not medium
		if (monster.size && monster.size.toLowerCase() !== 'medium') {
			const sizeBadge = headerRight.createEl('span', { cls: 'stat-badge size-badge' });
			sizeBadge.innerHTML = `${sizeSvg}<span class="badge-value">${monster.size.toUpperCase()}</span>`;
		}

		const hpBadge = headerRight.createEl('span', { cls: 'stat-badge hp-badge' });
		hpBadge.innerHTML = `${heartSvg}<span class="badge-value">${monster.hp}</span>`;

		// Armor badge (only show if medium or heavy)
		if (monster.armor !== 'none') {
			const armorLetter = monster.armor === 'medium' ? 'M' : 'H';
			const armorBadge = headerRight.createEl('span', { cls: 'stat-badge armor-badge' });
			armorBadge.innerHTML = `${shieldSvg}<span class="badge-value">${armorLetter}</span>`;
		}

		// Movement badge (only show if different from default walk 6)
		const movementInfo = parseMovement(monster.movement);
		if (movementInfo.display) {
			const moveBadge = headerRight.createEl('span', { cls: 'stat-badge move-badge' });
			moveBadge.innerHTML = `${arrowSvg}<span class="badge-value">${movementInfo.display}</span>`;
		}

		// Saves badge (if any) - always rightmost
		const savesParts: string[] = [];
		if (monster.str) savesParts.push(`STR${monster.str}`);
		if (monster.dex) savesParts.push(`DEX${monster.dex}`);
		if (monster.will) savesParts.push(`WIL${monster.will}`);
		if (savesParts.length > 0) {
			const savesBadge = headerRight.createEl('span', { cls: 'stat-badge saves-badge' });
			savesBadge.innerHTML = `${starSvg}<span class="badge-value">${savesParts.join(' ')}</span>`;
		}

		if (monster.resistances?.length || monster.immunities?.length) {
			const defenses = block.createEl('div', { cls: 'monster-defenses' });
			if (monster.resistances?.length) {
				defenses.createEl('p').innerHTML = `<strong>Resistances:</strong> ${monster.resistances.join(', ')}`;
			}
			if (monster.immunities?.length) {
				defenses.createEl('p').innerHTML = `<strong>Immunities:</strong> ${monster.immunities.join(', ')}`;
			}
		}

		if (monster.senses || monster.languages) {
			const sensesLang = block.createEl('div', { cls: 'monster-senses' });
			if (monster.senses) sensesLang.createEl('p').innerHTML = `<strong>Senses:</strong> ${monster.senses}`;
			if (monster.languages) sensesLang.createEl('p').innerHTML = `<strong>Languages:</strong> ${monster.languages}`;
		}

		if (monster.abilities?.length) {
			const abilitiesBox = block.createEl('div', { cls: 'monster-abilities-box' });
			for (const ab of monster.abilities) {
				const abilityDiv = abilitiesBox.createEl('div', { cls: 'ability-item' });
				let name = ab.name;
				if (ab.isLegendary) name += ' (L)';
				abilityDiv.innerHTML = `<strong class="ability-name">${name}.</strong> ${markdownToHtml(ab.description)}`;
			}
		}

		if (monster.attacks?.length || monster.multiattack) {
			// Only show HR if there are no abilities
			if (!monster.abilities?.length) {
				block.createEl('hr');
			}
			const actionsSection = block.createEl('div', { cls: 'monster-actions-section' });

			if (monster.multiattack) {
				actionsSection.createEl('p').innerHTML = markdownToHtml(monster.multiattack);
			}

			const actionsList = actionsSection.createEl('ul', { cls: 'actions-list' });
			for (const atk of monster.attacks || []) {
				const li = actionsList.createEl('li');
				li.innerHTML = markdownToHtml(atk.raw);
			}
		}
	}
}

// ============================================================================
// MOVEMENT HELPER
// ============================================================================

interface MovementInfo {
	display: string | null;  // null means don't show badge
	type: string | null;
	speed: number | null;
}

function parseMovement(movement: string | undefined): MovementInfo {
	if (!movement) return { display: null, type: null, speed: null };

	const trimmed = movement.trim().toLowerCase();

	// Try to extract type and speed
	// Patterns: "6", "Fly 10", "Fly", "walk 6", etc.
	const match = trimmed.match(/^([a-z]+)?\s*(\d+)?$/i);

	if (!match) {
		// Complex movement string, just show as-is if not default
		if (trimmed === '6' || trimmed === 'walk 6' || trimmed === 'walk') {
			return { display: null, type: 'walk', speed: 6 };
		}
		return { display: movement.trim(), type: null, speed: null };
	}

	let type = match[1] || null;
	const speed = match[2] ? parseInt(match[2]) : null;

	// Normalize type
	if (type) {
		type = type.toLowerCase();
	}

	// Check if it's the default (walk 6 or just 6 with implied walk)
	const isDefaultType = !type || type === 'walk';
	const isDefaultSpeed = speed === 6 || speed === null;

	if (isDefaultType && isDefaultSpeed && speed === 6) {
		return { display: null, type: 'walk', speed: 6 };
	}

	// Build display string
	const parts: string[] = [];

	// Show type if it's not walk
	if (type && type !== 'walk') {
		parts.push(type.toUpperCase());
	}

	// Show speed if it's not 6 (or if we're showing a non-walk type)
	if (speed !== null && (speed !== 6 || (type && type !== 'walk'))) {
		parts.push(speed.toString());
	}

	// If we only have speed and it's 6, don't show
	if (parts.length === 0) {
		return { display: null, type: type || 'walk', speed: speed };
	}

	return {
		display: parts.join(' '),
		type: type || 'walk',
		speed: speed
	};
}

// ============================================================================
// PARSER
// ============================================================================

function parseStatblock(content: string): NimbleMonster | null {
	try {
		const monster: Partial<NimbleMonster> = {};
		const lines = content.split('\n');

		let currentSection: string | null = null;
		let currentList: string[] = [];

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			// Section header (e.g., "abilities:" or "attacks:")
			if (/^[a-z]+:$/i.test(trimmed)) {
				if (currentSection && currentList.length > 0) {
					processSection(monster, currentSection, currentList);
					currentList = [];
				}
				currentSection = trimmed.slice(0, -1).toLowerCase();
				continue;
			}

			// List item - check BEFORE key-value to handle "- Name: description" format
			if (trimmed.startsWith('-')) {
				currentList.push(trimmed.slice(1).trim());
				continue;
			}

			// Key: value
			const match = trimmed.match(/^([^:]+):\s*(.+)$/);
			if (match) {
				// If we were in a section, process it first
				if (currentSection && currentList.length > 0) {
					processSection(monster, currentSection, currentList);
					currentList = [];
					currentSection = null;
				}
				processKeyValue(monster, match[1].trim().toLowerCase(), match[2].trim());
				continue;
			}
		}

		if (currentSection && currentList.length > 0) {
			processSection(monster, currentSection, currentList);
		}

		if (!monster.name) return null;

		monster.armor = monster.armor || 'none';
		monster.hp = monster.hp || 10;
		monster.movement = monster.movement || '6';

		return monster as NimbleMonster;
	} catch (e) {
		console.error('Parse error:', e);
		return null;
	}
}

function processKeyValue(monster: Partial<NimbleMonster>, key: string, value: string): void {
	switch (key) {
		case 'name': monster.name = value; break;
		case 'type': monster.type = value; break;
		case 'size': monster.size = value; break;
		case 'level': monster.level = value; break;
		case 'armor': case 'ac':
			monster.armor = normalizeArmor(value);
			break;
		case 'hp': case 'hitpoints':
			monster.hp = parseInt(value) || 10;
			break;
		case 'movement': case 'speed':
			monster.movement = value;
			break;
		case 'str':
			monster.str = value.trim();
			break;
		case 'dex':
			monster.dex = value.trim();
			break;
		case 'will':
			monster.will = value.trim();
			break;
		case 'cr':
			monster.cr = value;
			break;
		case 'senses':
			monster.senses = value;
			break;
		case 'languages':
			monster.languages = value;
			break;
		case 'multiattack':
			monster.multiattack = value;
			break;
		case 'monstertype':
			monster.monsterType = value.toLowerCase().includes('solo') ? 'solo' : 'regular';
			break;
		case 'legendaryresistances':
			monster.legendaryResistances = parseInt(value) || 3;
			break;
		case 'description': case 'desc':
			monster.description = value;
			break;
		case 'bloodied':
			monster.bloodied = value;
			break;
		case 'laststand':
			monster.lastStand = value;
			break;
		case 'actiontext':
			monster.actionText = value;
			break;
	}
}

function processSection(monster: Partial<NimbleMonster>, section: string, items: string[]): void {
	switch (section) {
		case 'attacks':
			monster.attacks = items.map(parseAttack);
			break;
		case 'abilities': case 'traits':
			monster.abilities = items.map(parseAbility);
			break;
		case 'resistances':
			monster.resistances = items;
			break;
		case 'immunities':
			monster.immunities = items;
			break;
	}
}

function parseAttack(line: string): NimbleAttack {
	return { raw: line };
}

function markdownToHtml(text: string): string {
	// Convert markdown to HTML
	// Order matters: do bold-italic first, then bold, then italic
	return text
		.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.+?)\*/g, '<em>$1</em>')
		.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
		.replace(/__(.+?)__/g, '<strong>$1</strong>')
		.replace(/_(.+?)_/g, '<em>$1</em>')
		// WikiLinks: [[Page|Display]] or [[Page]]
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<a class="nimble-wikilink" data-link="$1">$2</a>')
		.replace(/\[\[([^\]]+)\]\]/g, '<a class="nimble-wikilink" data-link="$1">$1</a>');
}

function processWikiLinks(container: HTMLElement, plugin: NimbleStatblocksPlugin, sourcePath: string): void {
	const wikilinks = container.querySelectorAll('a.nimble-wikilink');
	wikilinks.forEach((link) => {
		const anchor = link as HTMLAnchorElement;
		const target = anchor.dataset.link || anchor.textContent || '';

		// Resolve the link to get the actual file path
		const resolvedFile = plugin.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
		const resolvedPath = resolvedFile ? resolvedFile.path : target;

		// Set up attributes for Obsidian's hover preview system
		anchor.href = resolvedPath;
		anchor.dataset.href = resolvedPath;
		anchor.classList.add('internal-link');

		// Set the target attribute for proper link behavior
		anchor.setAttr('target', '_blank');
		anchor.setAttr('rel', 'noopener');

		anchor.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			plugin.app.workspace.openLinkText(target, sourcePath);
		};

		// Register hover link event for Obsidian's native preview
		anchor.addEventListener('mouseover', (event) => {
			plugin.app.workspace.trigger('hover-link', {
				event,
				source: 'nimble-statblock',
				hoverParent: container,
				targetEl: anchor,
				linktext: target,
				sourcePath: sourcePath
			});
		});
	});
}

function parseAbility(line: string): NimbleAbility {
	const ability: NimbleAbility = { name: 'Ability', description: '' };

	if (line.includes('(L)')) {
		ability.isLegendary = true;
		line = line.replace('(L)', '').trim();
	}

	// Remove markdown formatting for parsing (***text*** or **text** or *text*)
	let cleanLine = line.replace(/\*+/g, '');

	// Find the colon separator
	const idx = cleanLine.indexOf(':');
	if (idx !== -1) {
		ability.name = cleanLine.slice(0, idx).trim();
		ability.description = cleanLine.slice(idx + 1).trim();
	} else {
		ability.name = cleanLine;
	}

	return ability;
}

function normalizeArmor(value: string): ArmorType {
	const v = value.toLowerCase().trim();
	if (v === 'n' || v === 'none' || v === 'l' || v === 'light') return 'none';
	if (v === 'm' || v === 'medium') return 'medium';
	if (v === 'h' || v === 'heavy') return 'heavy';

	const num = parseInt(v);
	if (!isNaN(num)) {
		if (num <= 13) return 'none';
		if (num <= 17) return 'medium';
		return 'heavy';
	}
	return 'none';
}

// ============================================================================
// RENDERER
// ============================================================================

function renderStatblock(el: HTMLElement, monster: NimbleMonster, plugin: NimbleStatblocksPlugin, sourceFile?: string): void {
	const block = el.createEl('div', { cls: 'nimble-statblock' });
	const isSolo = monster.monsterType === 'solo';
	if (isSolo) block.addClass('solo-monster');

	if (isSolo) {
		// SOLO MONSTER LAYOUT
		renderSoloStatblock(block, monster);
	} else {
		// REGULAR MONSTER LAYOUT
		renderRegularStatblock(block, monster);
	}

	// Description (small muted text at bottom)
	if (monster.description) {
		block.createEl('hr');
		block.createEl('p', { text: monster.description, cls: 'monster-description' });
	}

	// Process WikiLinks in the stat block
	processWikiLinks(block, plugin, sourceFile || '');

	// Add button
	block.createEl('hr');
	const btn = block.createEl('button', { text: '+ Add to Encounter', cls: 'add-btn' });
	btn.onclick = () => {
		const view = plugin.getEncounterView();
		if (view) {
			view.addCreature(monster, sourceFile);
		} else {
			plugin.activateEncounterView().then(() => {
				setTimeout(() => {
					const v = plugin.getEncounterView();
					if (v) v.addCreature(monster, sourceFile);
				}, 100);
			});
		}
	};
}

function renderSoloStatblock(block: HTMLElement, monster: NimbleMonster): void {
	// Solo Header Row: "Level X Solo Size Type" | HP | Armor | Saves
	const headerRow = block.createEl('div', { cls: 'solo-header-row' });

	// Left side: Level/Size/Type
	const headerLeft = headerRow.createEl('div', { cls: 'solo-header-left' });
	const levelParts = [];
	if (monster.level) levelParts.push(`Level ${monster.level}`);
	if (monster.size) levelParts.push(monster.size);
	if (monster.type) levelParts.push(monster.type);
	headerLeft.createEl('span', { text: levelParts.join(' '), cls: 'solo-level-type' });

	// Right side: HP, Armor, Saves
	const headerRight = headerRow.createEl('div', { cls: 'solo-header-right' });

	// SVG Icons
	const heartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
	const shieldSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`;
	const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

	// HP badge
	const hpBadge = headerRight.createEl('span', { cls: 'solo-stat-badge hp-badge' });
	hpBadge.innerHTML = `${heartSvg}<span class="badge-value">${monster.hp}</span>`;

	// Armor badge (only show if medium or heavy)
	if (monster.armor !== 'none') {
		const armorLetter = monster.armor === 'medium' ? 'M' : 'H';
		const armorBadge = headerRight.createEl('span', { cls: 'solo-stat-badge armor-badge' });
		armorBadge.innerHTML = `${shieldSvg}<span class="badge-value">${armorLetter}</span>`;
	}

	// Saves badge (if any)
	const savesParts: string[] = [];
	if (monster.str) savesParts.push(`STR${monster.str}`);
	if (monster.dex) savesParts.push(`DEX${monster.dex}`);
	if (monster.will) savesParts.push(`WIL${monster.will}`);
	if (savesParts.length > 0) {
		const savesBadge = headerRight.createEl('span', { cls: 'solo-stat-badge saves-badge' });
		savesBadge.innerHTML = `${starSvg}<span class="badge-value">${savesParts.join(' ')}</span>`;
	}

	// Name
	block.createEl('h2', { text: monster.name, cls: 'monster-name solo-name' });

	// Abilities (all in ONE box)
	if (monster.abilities?.length) {
		const abilitiesBox = block.createEl('div', { cls: 'solo-abilities-box' });
		for (const ab of monster.abilities) {
			const abilityDiv = abilitiesBox.createEl('div', { cls: 'solo-ability-item' });
			let name = ab.name;
			if (ab.isLegendary) name += ' (L)';
			abilityDiv.innerHTML = `<strong class="ability-name">${name}.</strong> ${markdownToHtml(ab.description)}`;
		}
	}

	block.createEl('hr');

	// Actions section
	if (monster.attacks?.length || monster.multiattack) {
		const actionsSection = block.createEl('div', { cls: 'solo-actions-section' });

		// Action header with custom text
		const actionHeader = actionsSection.createEl('p', { cls: 'solo-action-header' });
		const actionText = monster.actionText || 'After each hero\'s turn, choose one:';
		actionHeader.innerHTML = `<strong>ACTIONS:</strong> ${actionText}`;

		if (monster.multiattack) {
			const p = actionsSection.createEl('p');
			p.innerHTML = markdownToHtml(monster.multiattack);
		}

		const actionsList = actionsSection.createEl('ul', { cls: 'solo-actions-list' });
		for (const atk of monster.attacks || []) {
			const li = actionsList.createEl('li');
			li.innerHTML = markdownToHtml(atk.raw);
		}
	}

	// Bloodied section
	if (monster.bloodied) {
		const bloodiedSection = block.createEl('div', { cls: 'solo-phase-section bloodied-section' });
		bloodiedSection.innerHTML = `<strong class="phase-label">BLOODIED:</strong> ${markdownToHtml(monster.bloodied)}`;
	}

	// Last Stand section
	if (monster.lastStand) {
		const lastStandSection = block.createEl('div', { cls: 'solo-phase-section laststand-section' });
		lastStandSection.innerHTML = `<strong class="phase-label">LAST STAND:</strong> ${markdownToHtml(monster.lastStand)}`;
	}

	// Legendary Resistances (if specified)
	if (monster.legendaryResistances) {
		const lrSection = block.createEl('div', { cls: 'solo-phase-section' });
		lrSection.innerHTML = `<strong>Legendary Resistances (${monster.legendaryResistances}/Day).</strong> Can choose to succeed on a failed save.`;
	}
}

function renderRegularStatblock(block: HTMLElement, monster: NimbleMonster): void {
	// SVG Icons
	const skullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 512 512" fill="white" stroke="none"><path d="M437.914,74.078C392.43,27,326.117,0,255.992,0C185.883,0,119.57,27,74.102,74.063c-42.5,44-64.703,102.828-62.531,165.688l6.609,83.875c6.031,84.75,55.234,93.906,76.094,93.906c7.563,0,15.531-1.094,23.625-3.188c1.094,7.938,1,21.859,0.922,32.688l-0.078,15.063c-0.141,10.938-0.359,27.5,11.234,39.234c4.797,4.875,13.563,10.672,28,10.672h196.047c14.438,0,23.188-5.797,28-10.656c11.578-11.75,11.375-28.297,11.234-39.25l-0.094-15.031c-0.063-10.844-0.172-24.781,0.938-32.719c8.172,2.109,16.094,3.188,23.625,3.188c20.859,0,70.047-9.156,76.094-93.75l6.563-83.156l0.047-0.875C502.602,176.891,480.398,118.063,437.914,74.078z M459.961,237.906l-6.516,82.844c-2.672,37.344-14.703,56.281-35.719,56.281c-4.844,0-10.266-0.891-16.297-2.688c-14.406-4.156-26.891-1.375-35.703,7.5c-13.406,13.5-13.266,35.313-13.047,65.5l0.078,15.281c0.031,2.5,0.078,6.188-0.141,8.875h-42.75v-50.016h-32.406V471.5h-42.938v-50.016h-32.391V471.5h-42.766c-0.203-2.688-0.156-6.375-0.125-8.906l0.078-15.297c0.219-30.156,0.359-51.953-13.047-65.453c-8.766-8.844-20.953-11.75-35.875-7.453c-5.859,1.75-11.281,2.641-16.125,2.641c-21.031,0-33.031-18.938-35.719-56.438l-6.531-82.688c-1.656-51.609,16.5-99.781,51.203-135.688C141.117,63,196.805,40.5,255.992,40.5c59.203,0,114.891,22.5,152.781,61.719C443.477,138.125,461.648,186.297,459.961,237.906z"/><path d="M256.008,309.656c-9.719,0-31.125,46.688-35.031,54.469c-3.875,7.781,3.906,19.469,15.578,15.563c11.672-3.875,19.453-13.609,19.453-13.609s7.781,9.734,19.453,13.609c11.656,3.906,19.453-7.781,15.563-15.563C287.117,356.344,265.742,309.656,256.008,309.656z"/><path d="M171.586,183.281c-30.891-3.25-58.578,19.188-61.828,50.094l-4.188,29.422c-3.25,30.922,19.188,58.578,50.078,61.828c30.922,3.25,58.609-19.172,61.844-50.094l4.188-29.422C224.914,214.188,202.508,186.531,171.586,183.281z"/><path d="M402.242,233.375c-3.234-30.906-30.938-53.344-61.828-50.094c-30.922,3.25-53.328,30.906-50.094,61.828l4.172,29.422c3.25,30.922,30.938,53.344,61.844,50.094s53.344-30.906,50.094-61.828L402.242,233.375z"/></svg>`;
	const sizeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 32 32" fill="white" stroke="none"><path d="M21.434 11.975l8.602-8.549-0.028 4.846c-0.009 0.404 0.311 0.755 0.716 0.746l0.513-0.001c0.404-0.009 0.739-0.25 0.748-0.654l0.021-7.219c0-0.007-0.027-0.012-0.027-0.019l0.040-0.366c0.004-0.203-0.044-0.384-0.174-0.513-0.13-0.131-0.311-0.21-0.512-0.204l-0.366 0.009c-0.007 0-0.012 0.003-0.020 0.004l-7.172-0.032c-0.404 0.009-0.738 0.343-0.747 0.748l-0.001 0.513c0.061 0.476 0.436 0.755 0.84 0.746l4.726 0.013-8.572 8.52c-0.39 0.39-0.39 1.024 0 1.415s1.023 0.39 1.414 0zM10.597 20.025l-8.602 8.523 0.027-4.82c0.010-0.404-0.312-0.756-0.716-0.747l-0.544 0.001c-0.405 0.010-0.739 0.25-0.748 0.654l-0.021 7.219c0 0.007 0.028 0.011 0.028 0.019l-0.040 0.365c-0.005 0.203 0.043 0.385 0.174 0.514 0.129 0.131 0.311 0.21 0.512 0.205l0.366-0.009c0.007 0 0.012-0.003 0.020-0.003l7.203 0.032c0.404-0.010 0.738-0.344 0.748-0.748l0.001-0.514c-0.062-0.476-0.436-0.755-0.840-0.746l-4.726-0.012 8.571-8.518c0.39-0.39 0.39-1.023 0-1.414s-1.023-0.391-1.413-0zM32.007 30.855l-0.021-7.219c-0.009-0.404-0.343-0.645-0.747-0.654l-0.513-0.001c-0.404-0.009-0.725 0.343-0.716 0.747l0.028 4.846-8.602-8.549c-0.39-0.39-1.023-0.39-1.414 0s-0.39 1.023 0 1.414l8.571 8.518-4.726 0.012c-0.404-0.009-0.779 0.27-0.840 0.746l0.001 0.514c0.009 0.404 0.344 0.739 0.747 0.748l7.172-0.032c0.008 0 0.013 0.003 0.020 0.003l0.366 0.009c0.201 0.005 0.384-0.074 0.512-0.205 0.131-0.129 0.178-0.311 0.174-0.514l-0.040-0.365c0-0.008 0.027-0.012 0.027-0.019zM3.439 2.041l4.727-0.012c0.404 0.009 0.778-0.27 0.840-0.746l-0.001-0.513c-0.010-0.405-0.344-0.739-0.748-0.748l-7.204 0.031c-0.008-0.001-0.013-0.004-0.020-0.004l-0.366-0.009c-0.201-0.005-0.383 0.074-0.512 0.204-0.132 0.13-0.179 0.31-0.174 0.514l0.040 0.366c0 0.007-0.028 0.012-0.028 0.020l0.021 7.219c0.009 0.404 0.343 0.645 0.748 0.654l0.545 0.001c0.404 0.009 0.724-0.342 0.715-0.746l-0.028-4.819 8.602 8.523c0.39 0.39 1.024 0.39 1.414 0s0.39-1.024 0-1.415z"/></svg>`;
	const heartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
	const shieldSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`;
	const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
	const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>`;

	// Header Row: Name + Type on left, badges on right (wraps when needed)
	const headerRow = block.createEl('div', { cls: 'monster-header-row' });

	// Left side: Name + Type inline
	const headerLeft = headerRow.createEl('div', { cls: 'monster-header-left' });
	headerLeft.createEl('span', { text: monster.name, cls: 'monster-name-inline' });

	// Build type string (size and level now in badges)
	const infoParts = [];
	if (monster.type) infoParts.push(monster.type);
	if (monster.cr) infoParts.push(`CR ${monster.cr}`);
	if (infoParts.length > 0) {
		headerLeft.createEl('span', { text: infoParts.join(', '), cls: 'monster-info-inline' });
	}

	// Right side badges - Order: Level, Size, HP, Armor, Movement, Saves
	const headerRight = headerRow.createEl('div', { cls: 'monster-header-right' });

	// Level badge (skull icon)
	if (monster.level) {
		const levelBadge = headerRight.createEl('span', { cls: 'stat-badge level-badge' });
		levelBadge.innerHTML = `${skullSvg}<span class="badge-value">${monster.level}</span>`;
	}

	// Size badge (person icon) - only show if not medium
	if (monster.size && monster.size.toLowerCase() !== 'medium') {
		const sizeBadge = headerRight.createEl('span', { cls: 'stat-badge size-badge' });
		sizeBadge.innerHTML = `${sizeSvg}<span class="badge-value">${monster.size.toUpperCase()}</span>`;
	}

	// HP badge
	const hpBadge = headerRight.createEl('span', { cls: 'stat-badge hp-badge' });
	hpBadge.innerHTML = `${heartSvg}<span class="badge-value">${monster.hp}</span>`;

	// Armor badge (only show if medium or heavy)
	if (monster.armor !== 'none') {
		const armorLetter = monster.armor === 'medium' ? 'M' : 'H';
		const armorBadge = headerRight.createEl('span', { cls: 'stat-badge armor-badge' });
		armorBadge.innerHTML = `${shieldSvg}<span class="badge-value">${armorLetter}</span>`;
	}

	// Movement badge (only show if different from default walk 6)
	const movementInfo = parseMovement(monster.movement);
	if (movementInfo.display) {
		const moveBadge = headerRight.createEl('span', { cls: 'stat-badge move-badge' });
		moveBadge.innerHTML = `${arrowSvg}<span class="badge-value">${movementInfo.display}</span>`;
	}

	// Saves badge (if any) - always rightmost
	const savesParts: string[] = [];
	if (monster.str) savesParts.push(`STR${monster.str}`);
	if (monster.dex) savesParts.push(`DEX${monster.dex}`);
	if (monster.will) savesParts.push(`WIL${monster.will}`);
	if (savesParts.length > 0) {
		const savesBadge = headerRight.createEl('span', { cls: 'stat-badge saves-badge' });
		savesBadge.innerHTML = `${starSvg}<span class="badge-value">${savesParts.join(' ')}</span>`;
	}

	// Defenses (resistances/immunities)
	if (monster.resistances?.length || monster.immunities?.length) {
		const defenses = block.createEl('div', { cls: 'monster-defenses' });
		if (monster.resistances?.length) {
			defenses.createEl('p').innerHTML = `<strong>Resistances:</strong> ${monster.resistances.join(', ')}`;
		}
		if (monster.immunities?.length) {
			defenses.createEl('p').innerHTML = `<strong>Immunities:</strong> ${monster.immunities.join(', ')}`;
		}
	}

	// Senses/Languages
	if (monster.senses || monster.languages) {
		const sensesLang = block.createEl('div', { cls: 'monster-senses' });
		if (monster.senses) sensesLang.createEl('p').innerHTML = `<strong>Senses:</strong> ${monster.senses}`;
		if (monster.languages) sensesLang.createEl('p').innerHTML = `<strong>Languages:</strong> ${monster.languages}`;
	}

	// Abilities (single combined box, like solo)
	if (monster.abilities?.length) {
		const abilitiesBox = block.createEl('div', { cls: 'monster-abilities-box' });
		for (const ab of monster.abilities) {
			const abilityDiv = abilitiesBox.createEl('div', { cls: 'ability-item' });
			let name = ab.name;
			if (ab.isLegendary) name += ' (L)';
			abilityDiv.innerHTML = `<strong class="ability-name">${name}.</strong> ${markdownToHtml(ab.description)}`;
		}
	}

	// Attacks
	if (monster.attacks?.length || monster.multiattack) {
		// Only show HR if there are no abilities (divider between name and attacks)
		if (!monster.abilities?.length) {
			block.createEl('hr');
		}
		const actionsSection = block.createEl('div', { cls: 'monster-actions-section' });

		if (monster.multiattack) {
			actionsSection.createEl('p').innerHTML = markdownToHtml(monster.multiattack);
		}

		const actionsList = actionsSection.createEl('ul', { cls: 'actions-list' });
		for (const atk of monster.attacks || []) {
			const li = actionsList.createEl('li');
			li.innerHTML = markdownToHtml(atk.raw);
		}
	}
}

// ============================================================================
// SETTINGS
// ============================================================================

class NimbleSettingsTab extends PluginSettingTab {
	plugin: NimbleStatblocksPlugin;

	constructor(app: App, plugin: NimbleStatblocksPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Nimble Statblocks' });

		new Setting(containerEl)
			.setName('Multiple Encounters')
			.setDesc('Enable to create and manage multiple named encounters. Disable for a single, simple encounter tracker.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.multipleEncounters)
				.onChange(async (value) => {
					this.plugin.settings.multipleEncounters = value;
					await this.plugin.saveSettings();
					// Refresh the encounter view if open
					const view = this.plugin.getEncounterView();
					if (view) view.render();
				}));

		new Setting(containerEl)
			.setName('Statblock Style')
			.addDropdown(d => d
				.addOption('book', 'Book')
				.addOption('compact', 'Compact')
				.setValue(this.plugin.settings.statblockStyle)
				.onChange(async (v: 'book' | 'compact') => {
					this.plugin.settings.statblockStyle = v;
					await this.plugin.saveSettings();
				}));

		// Custom Conditions Section
		containerEl.createEl('h3', { text: 'Custom Conditions' });
		containerEl.createEl('p', {
			text: 'Add custom conditions that can be applied to creatures in encounters.',
			cls: 'setting-item-description'
		});

		// Add new condition form
		const addConditionContainer = containerEl.createEl('div', { cls: 'custom-condition-add' });

		let newConditionName = '';
		let newConditionDesc = '';

		const nameInput = new Setting(addConditionContainer)
			.setName('Condition Name')
			.addText(text => text
				.setPlaceholder('e.g., Burning')
				.onChange(value => { newConditionName = value; }));

		const descInput = new Setting(addConditionContainer)
			.setName('Description')
			.addTextArea(text => text
				.setPlaceholder('e.g., Takes 1d6 fire damage at the start of each turn.')
				.onChange(value => { newConditionDesc = value; }));

		new Setting(addConditionContainer)
			.addButton(btn => btn
				.setButtonText('Add Condition')
				.setCta()
				.onClick(async () => {
					if (!newConditionName.trim()) {
						new Notice('Please enter a condition name');
						return;
					}
					// Check for duplicates
					const customConds = this.plugin.settings.customConditions || [];
					const allConditions = [...NIMBLE_CONDITIONS, ...customConds];
					if (allConditions.some(c => c.name.toLowerCase() === newConditionName.trim().toLowerCase())) {
						new Notice('A condition with this name already exists');
						return;
					}
					if (!this.plugin.settings.customConditions) {
						this.plugin.settings.customConditions = [];
					}
					this.plugin.settings.customConditions.push({
						name: newConditionName.trim(),
						description: newConditionDesc.trim() || 'No description provided.'
					});
					await this.plugin.saveSettings();
					this.display(); // Refresh the settings view
					new Notice(`Added condition: ${newConditionName.trim()}`);
				}));

		// List existing custom conditions
		const customConds = this.plugin.settings.customConditions || [];
		if (customConds.length > 0) {
			const listContainer = containerEl.createEl('div', { cls: 'custom-conditions-list' });
			listContainer.createEl('h4', { text: 'Your Custom Conditions' });

			for (let i = 0; i < customConds.length; i++) {
				const condition = customConds[i];
				const conditionSetting = new Setting(listContainer)
					.setName(condition.name)
					.setDesc(condition.description)
					.addButton(btn => btn
						.setIcon('pencil')
						.setTooltip('Edit')
						.onClick(() => {
							this.openEditModal(i);
						}))
					.addButton(btn => btn
						.setIcon('trash')
						.setTooltip('Delete')
						.onClick(async () => {
							this.plugin.settings.customConditions.splice(i, 1);
							await this.plugin.saveSettings();
							this.display();
							new Notice(`Deleted condition: ${condition.name}`);
						}));
			}
		}
	}

	openEditModal(index: number): void {
		const customConds = this.plugin.settings.customConditions || [];
		const condition = customConds[index];
		if (!condition) return;
		const modal = new EditConditionModal(this.app, condition, async (name, desc) => {
			// Check for duplicates (excluding current)
			const otherConditions = [
				...NIMBLE_CONDITIONS,
				...customConds.filter((_, i) => i !== index)
			];
			if (otherConditions.some(c => c.name.toLowerCase() === name.toLowerCase())) {
				new Notice('A condition with this name already exists');
				return;
			}
			this.plugin.settings.customConditions[index] = { name, description: desc };
			await this.plugin.saveSettings();
			this.display();
			new Notice(`Updated condition: ${name}`);
		});
		modal.open();
	}
}

class EditConditionModal extends Modal {
	condition: NimbleCondition;
	onSave: (name: string, description: string) => void;
	nameValue: string;
	descValue: string;

	constructor(app: App, condition: NimbleCondition, onSave: (name: string, description: string) => void) {
		super(app);
		this.condition = condition;
		this.onSave = onSave;
		this.nameValue = condition.name;
		this.descValue = condition.description;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Edit Condition' });

		new Setting(contentEl)
			.setName('Name')
			.addText(text => text
				.setValue(this.nameValue)
				.onChange(value => { this.nameValue = value; }));

		new Setting(contentEl)
			.setName('Description')
			.addTextArea(text => text
				.setValue(this.descValue)
				.onChange(value => { this.descValue = value; }));

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(() => this.close()))
			.addButton(btn => btn
				.setButtonText('Save')
				.setCta()
				.onClick(() => {
					if (!this.nameValue.trim()) {
						new Notice('Please enter a condition name');
						return;
					}
					this.onSave(this.nameValue.trim(), this.descValue.trim() || 'No description provided.');
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// ============================================================================
// PLUGIN
// ============================================================================

export default class NimbleStatblocksPlugin extends Plugin {
	settings: NimbleStatblocksSettings;
	private monsterIndex: Map<string, MonsterIndexEntry> = new Map();

	async onload() {
		await this.loadSettings();

		this.registerView(ENCOUNTER_VIEW_TYPE, (leaf) => new EncounterTrackerView(leaf, this));

		this.addRibbonIcon('swords', 'Nimble Encounters', () => this.activateEncounterView());

		this.registerMarkdownCodeBlockProcessor('nimble', (source, el, ctx) => {
			const monster = parseStatblock(source);
			if (monster) {
				renderStatblock(el, monster, this, ctx.sourcePath);
			} else {
				el.createEl('p', { text: 'Error: Invalid stat block syntax', cls: 'nimble-error' });
			}
		});

		// Register inline nimble reference processor
		this.registerMarkdownPostProcessor((el, ctx) => {
			const codeEls = el.querySelectorAll('code');
			codeEls.forEach((codeEl) => {
				const text = codeEl.textContent || '';
				if (text.startsWith('nimble:')) {
					const monsterName = text.slice(7).trim();
					if (monsterName) {
						this.renderInlineReference(codeEl as HTMLElement, monsterName, ctx.sourcePath);
					}
				}
			});
		});

		this.addCommand({
			id: 'open-tracker',
			name: 'Open Encounter Tracker',
			callback: () => this.activateEncounterView()
		});

		this.addCommand({
			id: 'insert-template',
			name: 'Insert Monster Template',
			editorCallback: (editor) => {
				editor.replaceSelection(`\`\`\`nimble
name: Monster
type: Beast
size: Medium
armor: none
hp: 20
movement: 6
str: +
dex: +
will: -
attacks:
- Bite 1d6 piercing
abilities:
- Keen Senses: Advantage on Perception
\`\`\``);
			}
		});

		this.addSettingTab(new NimbleSettingsTab(this.app, this));

		// Build monster index for inline references
		this.buildMonsterIndex();

		// Update index on file changes
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.updateIndexForFile(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.removeFileFromIndex(file.path);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.updateIndexForFile(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && file.extension === 'md') {
					// Remove entries from the old path
					this.removeFileFromIndex(oldPath);
					// Re-index at the new path
					this.updateIndexForFile(file);
				}
			})
		);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Ensure customConditions array exists (for upgrades from older versions)
		if (!this.settings.customConditions) {
			this.settings.customConditions = [];
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	getEncounterView(): EncounterTrackerView | null {
		const leaves = this.app.workspace.getLeavesOfType(ENCOUNTER_VIEW_TYPE);
		return leaves.length ? leaves[0].view as EncounterTrackerView : null;
	}

	async activateEncounterView() {
		let leaf = this.app.workspace.getLeavesOfType(ENCOUNTER_VIEW_TYPE)[0];
		if (!leaf) {
			const right = this.app.workspace.getRightLeaf(false);
			if (right) {
				await right.setViewState({ type: ENCOUNTER_VIEW_TYPE, active: true });
				leaf = right;
			}
		}
		if (leaf) this.app.workspace.revealLeaf(leaf);
	}

	// ========================================================================
	// MONSTER INDEX SYSTEM
	// ========================================================================

	async buildMonsterIndex(): Promise<void> {
		this.monsterIndex.clear();
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			await this.indexFile(file);
		}
	}

	private async indexFile(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.cachedRead(file);
			const regex = /```nimble\n([\s\S]*?)```/g;
			let match;

			while ((match = regex.exec(content)) !== null) {
				const statblockContent = match[1];
				const monster = parseStatblock(statblockContent);
				if (monster?.name) {
					const key = monster.name.toLowerCase();
					// Store first occurrence
					if (!this.monsterIndex.has(key)) {
						this.monsterIndex.set(key, {
							name: monster.name,
							filePath: file.path,
							monster: monster
						});
					}
				}
			}
		} catch (e) {
			console.error(`Error indexing file ${file.path}:`, e);
		}
	}

	getMonsterByName(name: string): MonsterIndexEntry | undefined {
		return this.monsterIndex.get(name.toLowerCase());
	}

	private async updateIndexForFile(file: TFile): Promise<void> {
		// Remove old entries from this file
		this.removeFileFromIndex(file.path);
		// Re-index this file
		await this.indexFile(file);
	}

	private removeFileFromIndex(filePath: string): void {
		for (const [key, entry] of this.monsterIndex.entries()) {
			if (entry.filePath === filePath) {
				this.monsterIndex.delete(key);
			}
		}
	}

	// ========================================================================
	// INLINE REFERENCE RENDERER
	// ========================================================================

	private renderInlineReference(codeEl: HTMLElement, monsterName: string, sourcePath: string): void {
		const entry = this.getMonsterByName(monsterName);

		// Create container span
		const container = document.createElement('span');
		container.className = 'nimble-inline-ref';

		if (entry) {
			// Monster found - create clickable link
			container.addClass('nimble-inline-found');

			// Monster name link
			const nameLink = container.createEl('a', {
				text: entry.name,
				cls: 'nimble-inline-name'
			});

			// Navigate to source file on click
			nameLink.onclick = (e) => {
				e.preventDefault();
				this.app.workspace.openLinkText(entry.filePath, sourcePath);
			};

			// Attach hover preview
			this.attachHoverPreview(nameLink, entry);

			// Add button
			const addBtn = container.createEl('button', {
				text: '+',
				cls: 'nimble-inline-add-btn',
				attr: { 'aria-label': 'Add to encounter' }
			});

			addBtn.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				const view = this.getEncounterView();
				if (view) {
					view.addCreature(entry.monster, entry.filePath);
				} else {
					this.activateEncounterView().then(() => {
						setTimeout(() => {
							const v = this.getEncounterView();
							if (v) v.addCreature(entry.monster, entry.filePath);
						}, 100);
					});
				}
			};
		} else {
			// Monster not found - show as unresolved
			container.addClass('nimble-inline-unresolved');
			container.createEl('span', {
				text: monsterName,
				cls: 'nimble-inline-name unresolved'
			});
			container.createEl('span', {
				text: '?',
				cls: 'nimble-inline-unknown',
				attr: { 'title': `Monster "${monsterName}" not found in vault` }
			});
		}

		// Replace the original code element
		codeEl.replaceWith(container);
	}

	// ========================================================================
	// HOVER PREVIEW SYSTEM
	// ========================================================================

	private attachHoverPreview(element: HTMLElement, entry: MonsterIndexEntry): void {
		let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
		let previewEl: HTMLElement | null = null;

		const showPreview = () => {
			// Remove any existing preview
			this.removeHoverPreview();

			// Create preview container
			previewEl = document.createElement('div');
			previewEl.className = 'nimble-hover-preview';
			previewEl.id = 'nimble-hover-preview-active';

			// Render the stat block
			this.renderStatblockForHover(previewEl, entry.monster, entry.filePath);

			// Position near element
			document.body.appendChild(previewEl);
			this.positionHoverPreview(previewEl, element);

			// Close on mouse leave from preview
			previewEl.onmouseleave = (e) => {
				const relatedTarget = e.relatedTarget as HTMLElement;
				if (relatedTarget !== element && !element.contains(relatedTarget)) {
					this.removeHoverPreview();
				}
			};
		};

		element.onmouseenter = () => {
			hoverTimeout = setTimeout(showPreview, 300);
		};

		element.onmouseleave = (e) => {
			if (hoverTimeout) {
				clearTimeout(hoverTimeout);
				hoverTimeout = null;
			}

			// Don't remove if mouse moved to preview
			const relatedTarget = e.relatedTarget as HTMLElement;
			if (relatedTarget?.closest?.('#nimble-hover-preview-active')) {
				return;
			}

			// Small delay to allow moving to preview
			setTimeout(() => {
				const preview = document.getElementById('nimble-hover-preview-active');
				if (preview && !preview.matches(':hover') && !element.matches(':hover')) {
					this.removeHoverPreview();
				}
			}, 100);
		};
	}

	private removeHoverPreview(): void {
		const existing = document.getElementById('nimble-hover-preview-active');
		if (existing) {
			existing.remove();
		}
	}

	private positionHoverPreview(preview: HTMLElement, anchor: HTMLElement): void {
		const rect = anchor.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		// Position below anchor by default
		let top = rect.bottom + 8;
		let left = rect.left;

		preview.style.position = 'fixed';
		preview.style.zIndex = '1000';
		preview.style.left = `${left}px`;
		preview.style.top = `${top}px`;

		// After rendering, check if it goes off screen and adjust
		requestAnimationFrame(() => {
			const previewRect = preview.getBoundingClientRect();

			// Adjust horizontal position
			if (previewRect.right > viewportWidth - 20) {
				preview.style.left = `${Math.max(20, viewportWidth - previewRect.width - 20)}px`;
			}

			// Adjust vertical - show above if not enough space below
			if (previewRect.bottom > viewportHeight - 20) {
				preview.style.top = `${rect.top - previewRect.height - 8}px`;
			}
		});
	}

	private renderStatblockForHover(container: HTMLElement, monster: NimbleMonster, sourcePath: string): void {
		const block = container.createEl('div', { cls: 'nimble-statblock inline hover-preview' });
		const isSolo = monster.monsterType === 'solo';
		if (isSolo) block.addClass('solo-monster');

		// Reuse the existing rendering logic
		if (isSolo) {
			this.renderSoloForHover(block, monster);
		} else {
			this.renderRegularForHover(block, monster);
		}

		// Description
		if (monster.description) {
			block.createEl('hr');
			block.createEl('p', { text: monster.description, cls: 'monster-description' });
		}

		// Process WikiLinks in the hover preview
		processWikiLinks(block, this, sourcePath);
	}

	private renderSoloForHover(block: HTMLElement, monster: NimbleMonster): void {
		// SVG Icons
		const heartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
		const shieldSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`;
		const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

		// Solo Header Row
		const headerRow = block.createEl('div', { cls: 'solo-header-row' });

		const headerLeft = headerRow.createEl('div', { cls: 'solo-header-left' });
		const levelParts = [];
		if (monster.level) levelParts.push(`Level ${monster.level}`);
		if (monster.size) levelParts.push(monster.size);
		if (monster.type) levelParts.push(monster.type);
		headerLeft.createEl('span', { text: levelParts.join(' '), cls: 'solo-level-type' });

		const headerRight = headerRow.createEl('div', { cls: 'solo-header-right' });

		const hpBadge = headerRight.createEl('span', { cls: 'solo-stat-badge hp-badge' });
		hpBadge.innerHTML = `${heartSvg}<span class="badge-value">${monster.hp}</span>`;

		if (monster.armor !== 'none') {
			const armorLetter = monster.armor === 'medium' ? 'M' : 'H';
			const armorBadge = headerRight.createEl('span', { cls: 'solo-stat-badge armor-badge' });
			armorBadge.innerHTML = `${shieldSvg}<span class="badge-value">${armorLetter}</span>`;
		}

		const savesParts: string[] = [];
		if (monster.str) savesParts.push(`STR${monster.str}`);
		if (monster.dex) savesParts.push(`DEX${monster.dex}`);
		if (monster.will) savesParts.push(`WIL${monster.will}`);
		if (savesParts.length > 0) {
			const savesBadge = headerRight.createEl('span', { cls: 'solo-stat-badge saves-badge' });
			savesBadge.innerHTML = `${starSvg}<span class="badge-value">${savesParts.join(' ')}</span>`;
		}

		block.createEl('h2', { text: monster.name, cls: 'monster-name solo-name' });

		// Abilities
		if (monster.abilities?.length) {
			const abilitiesBox = block.createEl('div', { cls: 'solo-abilities-box' });
			for (const ab of monster.abilities) {
				const abilityDiv = abilitiesBox.createEl('div', { cls: 'solo-ability-item' });
				let name = ab.name;
				if (ab.isLegendary) name += ' (L)';
				abilityDiv.innerHTML = `<strong class="ability-name">${name}.</strong> ${markdownToHtml(ab.description)}`;
			}
		}

		block.createEl('hr');

		// Actions
		if (monster.attacks?.length || monster.multiattack) {
			const actionsSection = block.createEl('div', { cls: 'solo-actions-section' });

			const actionHeader = actionsSection.createEl('p', { cls: 'solo-action-header' });
			const actionText = monster.actionText || 'After each hero\'s turn, choose one:';
			actionHeader.innerHTML = `<strong>ACTIONS:</strong> ${actionText}`;

			if (monster.multiattack) {
				const p = actionsSection.createEl('p');
				p.innerHTML = markdownToHtml(monster.multiattack);
			}

			const actionsList = actionsSection.createEl('ul', { cls: 'solo-actions-list' });
			for (const atk of monster.attacks || []) {
				const li = actionsList.createEl('li');
				li.innerHTML = markdownToHtml(atk.raw);
			}
		}

		// Bloodied
		if (monster.bloodied) {
			const bloodiedSection = block.createEl('div', { cls: 'solo-phase-section bloodied-section' });
			bloodiedSection.innerHTML = `<strong class="phase-label">BLOODIED:</strong> ${markdownToHtml(monster.bloodied)}`;
		}

		// Last Stand
		if (monster.lastStand) {
			const lastStandSection = block.createEl('div', { cls: 'solo-phase-section laststand-section' });
			lastStandSection.innerHTML = `<strong class="phase-label">LAST STAND:</strong> ${markdownToHtml(monster.lastStand)}`;
		}

		if (monster.legendaryResistances) {
			const lrSection = block.createEl('div', { cls: 'solo-phase-section' });
			lrSection.innerHTML = `<strong>Legendary Resistances (${monster.legendaryResistances}/Day).</strong> Can choose to succeed on a failed save.`;
		}
	}

	private renderRegularForHover(block: HTMLElement, monster: NimbleMonster): void {
		// SVG Icons
		const skullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 512 512" fill="white" stroke="none"><path d="M437.914,74.078C392.43,27,326.117,0,255.992,0C185.883,0,119.57,27,74.102,74.063c-42.5,44-64.703,102.828-62.531,165.688l6.609,83.875c6.031,84.75,55.234,93.906,76.094,93.906c7.563,0,15.531-1.094,23.625-3.188c1.094,7.938,1,21.859,0.922,32.688l-0.078,15.063c-0.141,10.938-0.359,27.5,11.234,39.234c4.797,4.875,13.563,10.672,28,10.672h196.047c14.438,0,23.188-5.797,28-10.656c11.578-11.75,11.375-28.297,11.234-39.25l-0.094-15.031c-0.063-10.844-0.172-24.781,0.938-32.719c8.172,2.109,16.094,3.188,23.625,3.188c20.859,0,70.047-9.156,76.094-93.75l6.563-83.156l0.047-0.875C502.602,176.891,480.398,118.063,437.914,74.078z M459.961,237.906l-6.516,82.844c-2.672,37.344-14.703,56.281-35.719,56.281c-4.844,0-10.266-0.891-16.297-2.688c-14.406-4.156-26.891-1.375-35.703,7.5c-13.406,13.5-13.266,35.313-13.047,65.5l0.078,15.281c0.031,2.5,0.078,6.188-0.141,8.875h-42.75v-50.016h-32.406V471.5h-42.938v-50.016h-32.391V471.5h-42.766c-0.203-2.688-0.156-6.375-0.125-8.906l0.078-15.297c0.219-30.156,0.359-51.953-13.047-65.453c-8.766-8.844-20.953-11.75-35.875-7.453c-5.859,1.75-11.281,2.641-16.125,2.641c-21.031,0-33.031-18.938-35.719-56.438l-6.531-82.688c-1.656-51.609,16.5-99.781,51.203-135.688C141.117,63,196.805,40.5,255.992,40.5c59.203,0,114.891,22.5,152.781,61.719C443.477,138.125,461.648,186.297,459.961,237.906z"/><path d="M256.008,309.656c-9.719,0-31.125,46.688-35.031,54.469c-3.875,7.781,3.906,19.469,15.578,15.563c11.672-3.875,19.453-13.609,19.453-13.609s7.781,9.734,19.453,13.609c11.656,3.906,19.453-7.781,15.563-15.563C287.117,356.344,265.742,309.656,256.008,309.656z"/><path d="M171.586,183.281c-30.891-3.25-58.578,19.188-61.828,50.094l-4.188,29.422c-3.25,30.922,19.188,58.578,50.078,61.828c30.922,3.25,58.609-19.172,61.844-50.094l4.188-29.422C224.914,214.188,202.508,186.531,171.586,183.281z"/><path d="M402.242,233.375c-3.234-30.906-30.938-53.344-61.828-50.094c-30.922,3.25-53.328,30.906-50.094,61.828l4.172,29.422c3.25,30.922,30.938,53.344,61.844,50.094s53.344-30.906,50.094-61.828L402.242,233.375z"/></svg>`;
		const sizeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 32 32" fill="white" stroke="none"><path d="M21.434 11.975l8.602-8.549-0.028 4.846c-0.009 0.404 0.311 0.755 0.716 0.746l0.513-0.001c0.404-0.009 0.739-0.25 0.748-0.654l0.021-7.219c0-0.007-0.027-0.012-0.027-0.019l0.040-0.366c0.004-0.203-0.044-0.384-0.174-0.513-0.13-0.131-0.311-0.21-0.512-0.204l-0.366 0.009c-0.007 0-0.012 0.003-0.020 0.004l-7.172-0.032c-0.404 0.009-0.738 0.343-0.747 0.748l-0.001 0.513c0.061 0.476 0.436 0.755 0.84 0.746l4.726 0.013-8.572 8.52c-0.39 0.39-0.39 1.024 0 1.415s1.023 0.39 1.414 0zM10.597 20.025l-8.602 8.523 0.027-4.82c0.010-0.404-0.312-0.756-0.716-0.747l-0.544 0.001c-0.405 0.010-0.739 0.25-0.748 0.654l-0.021 7.219c0 0.007 0.028 0.011 0.028 0.019l-0.040 0.365c-0.005 0.203 0.043 0.385 0.174 0.514 0.129 0.131 0.311 0.21 0.512 0.205l0.366-0.009c0.007 0 0.012-0.003 0.020-0.003l7.203 0.032c0.404-0.010 0.738-0.344 0.748-0.748l0.001-0.514c-0.062-0.476-0.436-0.755-0.840-0.746l-4.726-0.012 8.571-8.518c0.39-0.39 0.39-1.023 0-1.414s-1.023-0.391-1.413-0zM32.007 30.855l-0.021-7.219c-0.009-0.404-0.343-0.645-0.747-0.654l-0.513-0.001c-0.404-0.009-0.725 0.343-0.716 0.747l0.028 4.846-8.602-8.549c-0.39-0.39-1.023-0.39-1.414 0s-0.39 1.023 0 1.414l8.571 8.518-4.726 0.012c-0.404-0.009-0.779 0.27-0.840 0.746l0.001 0.514c0.009 0.404 0.344 0.739 0.747 0.748l7.172-0.032c0.008 0 0.013 0.003 0.020 0.003l0.366 0.009c0.201 0.005 0.384-0.074 0.512-0.205 0.131-0.129 0.178-0.311 0.174-0.514l-0.040-0.365c0-0.008 0.027-0.012 0.027-0.019zM3.439 2.041l4.727-0.012c0.404 0.009 0.778-0.27 0.840-0.746l-0.001-0.513c-0.010-0.405-0.344-0.739-0.748-0.748l-7.204 0.031c-0.008-0.001-0.013-0.004-0.020-0.004l-0.366-0.009c-0.201-0.005-0.383 0.074-0.512 0.204-0.132 0.13-0.179 0.31-0.174 0.514l0.040 0.366c0 0.007-0.028 0.012-0.028 0.020l0.021 7.219c0.009 0.404 0.343 0.645 0.748 0.654l0.545 0.001c0.404 0.009 0.724-0.342 0.715-0.746l-0.028-4.819 8.602 8.523c0.39 0.39 1.024 0.39 1.414 0s0.39-1.024 0-1.415z"/></svg>`;
		const heartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
		const shieldSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`;
		const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
		const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>`;

		// Header Row
		const headerRow = block.createEl('div', { cls: 'monster-header-row' });

		const headerLeft = headerRow.createEl('div', { cls: 'monster-header-left' });
		headerLeft.createEl('span', { text: monster.name, cls: 'monster-name-inline' });

		const infoParts = [];
		if (monster.type) infoParts.push(monster.type);
		if (monster.cr) infoParts.push(`CR ${monster.cr}`);
		if (infoParts.length > 0) {
			headerLeft.createEl('span', { text: infoParts.join(', '), cls: 'monster-info-inline' });
		}

		const headerRight = headerRow.createEl('div', { cls: 'monster-header-right' });

		if (monster.level) {
			const levelBadge = headerRight.createEl('span', { cls: 'stat-badge level-badge' });
			levelBadge.innerHTML = `${skullSvg}<span class="badge-value">${monster.level}</span>`;
		}

		if (monster.size && monster.size.toLowerCase() !== 'medium') {
			const sizeBadge = headerRight.createEl('span', { cls: 'stat-badge size-badge' });
			sizeBadge.innerHTML = `${sizeSvg}<span class="badge-value">${monster.size.toUpperCase()}</span>`;
		}

		const hpBadge = headerRight.createEl('span', { cls: 'stat-badge hp-badge' });
		hpBadge.innerHTML = `${heartSvg}<span class="badge-value">${monster.hp}</span>`;

		if (monster.armor !== 'none') {
			const armorLetter = monster.armor === 'medium' ? 'M' : 'H';
			const armorBadge = headerRight.createEl('span', { cls: 'stat-badge armor-badge' });
			armorBadge.innerHTML = `${shieldSvg}<span class="badge-value">${armorLetter}</span>`;
		}

		const movementInfo = parseMovement(monster.movement);
		if (movementInfo.display) {
			const moveBadge = headerRight.createEl('span', { cls: 'stat-badge move-badge' });
			moveBadge.innerHTML = `${arrowSvg}<span class="badge-value">${movementInfo.display}</span>`;
		}

		const savesParts: string[] = [];
		if (monster.str) savesParts.push(`STR${monster.str}`);
		if (monster.dex) savesParts.push(`DEX${monster.dex}`);
		if (monster.will) savesParts.push(`WIL${monster.will}`);
		if (savesParts.length > 0) {
			const savesBadge = headerRight.createEl('span', { cls: 'stat-badge saves-badge' });
			savesBadge.innerHTML = `${starSvg}<span class="badge-value">${savesParts.join(' ')}</span>`;
		}

		if (monster.resistances?.length || monster.immunities?.length) {
			const defenses = block.createEl('div', { cls: 'monster-defenses' });
			if (monster.resistances?.length) {
				defenses.createEl('p').innerHTML = `<strong>Resistances:</strong> ${monster.resistances.join(', ')}`;
			}
			if (monster.immunities?.length) {
				defenses.createEl('p').innerHTML = `<strong>Immunities:</strong> ${monster.immunities.join(', ')}`;
			}
		}

		if (monster.senses || monster.languages) {
			const sensesLang = block.createEl('div', { cls: 'monster-senses' });
			if (monster.senses) sensesLang.createEl('p').innerHTML = `<strong>Senses:</strong> ${monster.senses}`;
			if (monster.languages) sensesLang.createEl('p').innerHTML = `<strong>Languages:</strong> ${monster.languages}`;
		}

		if (monster.abilities?.length) {
			const abilitiesBox = block.createEl('div', { cls: 'monster-abilities-box' });
			for (const ab of monster.abilities) {
				const abilityDiv = abilitiesBox.createEl('div', { cls: 'ability-item' });
				let name = ab.name;
				if (ab.isLegendary) name += ' (L)';
				abilityDiv.innerHTML = `<strong class="ability-name">${name}.</strong> ${markdownToHtml(ab.description)}`;
			}
		}

		if (monster.attacks?.length || monster.multiattack) {
			if (!monster.abilities?.length) {
				block.createEl('hr');
			}
			const actionsSection = block.createEl('div', { cls: 'monster-actions-section' });

			if (monster.multiattack) {
				actionsSection.createEl('p').innerHTML = markdownToHtml(monster.multiattack);
			}

			const actionsList = actionsSection.createEl('ul', { cls: 'actions-list' });
			for (const atk of monster.attacks || []) {
				const li = actionsList.createEl('li');
				li.innerHTML = markdownToHtml(atk.raw);
			}
		}
	}
}
