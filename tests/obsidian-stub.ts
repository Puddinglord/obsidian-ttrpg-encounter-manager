// Just enough of the Obsidian API for the pure modules under test.
type Handler = (...args: unknown[]) => unknown;
export class Events {
	private handlers = new Map<string, Handler[]>();
	on(name: string, fn: Handler) {
		this.handlers.set(name, [...(this.handlers.get(name) || []), fn]);
		return { name, fn };
	}
	trigger(name: string, ...args: unknown[]) {
		for (const fn of this.handlers.get(name) || []) fn(...args);
	}
}

// Empty stand-ins so modules that define views and dialogs can load in tests
// (the system conformance suite imports every shipped system). Nothing here
// draws anything; tests that need behaviour stub it themselves.
export class Component {}
export class Modal extends Component { constructor(public app?: unknown) { super(); } open() {} close() {} }
export class SuggestModal<T> extends Modal { declare _t?: T; }
export class FuzzySuggestModal<T> extends SuggestModal<T> {}
export class MarkdownRenderChild extends Component { constructor(public containerEl?: HTMLElement) { super(); } }
export class ItemView extends Component {}
export class PluginSettingTab extends Component {}
export class Setting {}
export class Menu {}
export class Notice { constructor(public message?: string) {} }
export class EditorSuggest<T> extends Component { declare _t?: T; }
export class AbstractInputSuggest<T> extends Component { declare _t?: T; constructor(public app?: unknown, public inputEl?: HTMLElement) { super(); } }
export class TAbstractFile {}
export class TFile extends TAbstractFile {}
export class TFolder extends TAbstractFile {}
export class MarkdownView extends ItemView {}
export class MarkdownRenderer {}
export const Platform = { isMobile: false, isPhone: false, isTablet: false, isDesktop: true, isMacOS: true };
export function setIcon(): void {}
export function setTooltip(): void {}
export function normalizePath(p: string): string { return p.replace(/\/+/g, '/').replace(/^\/|\/$/g, ''); }
export function requireApiVersion(): boolean { return true; }
export function debounce<T extends (...a: never[]) => unknown>(fn: T): T { return fn; }
