// Typed access to the few undocumented Obsidian internals the plugin uses.
// Each one is optional: if Obsidian changes them, the feature quietly does nothing.

import type { App, Editor, Workspace } from 'obsidian';
import type { EditorView } from '@codemirror/view';

interface AppInternals {
	setting?: { open?: () => void; openTabById?: (id: string) => void };
}

interface WorkspaceInternals {
	editorSuggest?: { suggests?: unknown[] };
}

interface EditorInternals {
	cm?: EditorView;
}

/** Open Obsidian's settings on this plugin's tab. */
export function openPluginSettings(app: App, pluginId: string): void {
	const setting = (app as unknown as AppInternals).setting;
	setting?.open?.();
	setting?.openTabById?.(pluginId);
}

/** The live list of registered editor suggesters (order decides priority). */
export function editorSuggests(workspace: Workspace): unknown[] | undefined {
	return (workspace as unknown as WorkspaceInternals).editorSuggest?.suggests;
}

/** The CodeMirror 6 view behind an editor. */
export function editorView(editor: Editor | undefined): EditorView | undefined {
	return (editor as unknown as EditorInternals | undefined)?.cm;
}
