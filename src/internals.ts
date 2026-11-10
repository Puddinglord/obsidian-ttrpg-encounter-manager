// Typed access to the few undocumented Obsidian internals the plugin uses.
// Each one is optional: if Obsidian changes them, the feature quietly does nothing.

import type { App, Editor, TAbstractFile, TFile, Workspace } from 'obsidian';
import type { EditorView } from '@codemirror/view';

interface Draggable {
	type?: string;
	file?: TAbstractFile;
	files?: TAbstractFile[];
}

interface DragManager {
	draggable?: Draggable | null;
	dragFile?: (e: DragEvent, file: TFile, source?: string) => Draggable | null;
	onDragStart?: (e: DragEvent, draggable: Draggable | null) => void;
}

interface AppInternals {
	setting?: { open?: () => void; openTabById?: (id: string) => void };
	dragManager?: DragManager;
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

/**
 * Start Obsidian's own file drag from a row of ours, so the row can also be
 * dropped into a note (as a link) or onto the file explorer. Returns false if
 * the internals aren't there; the caller's own drag data still works.
 */
export function startFileDrag(app: App, e: DragEvent, file: TFile): boolean {
	const dm = (app as unknown as AppInternals).dragManager;
	if (!dm?.dragFile || !dm.onDragStart) return false;
	try {
		dm.onDragStart(e, dm.dragFile(e, file, 'nimble-campaign'));
		return true;
	} catch {
		return false;
	}
}

/** Paths of whatever Obsidian is dragging right now (a file, several files or a folder from the file explorer). */
export function draggedPaths(app: App): string[] {
	const d = (app as unknown as AppInternals).dragManager?.draggable;
	if (!d) return [];
	if (d.type === 'files' && Array.isArray(d.files)) return d.files.map(f => f.path);
	if ((d.type === 'file' || d.type === 'folder') && d.file) return [d.file.path];
	return [];
}
