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
