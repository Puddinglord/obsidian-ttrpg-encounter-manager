// Putting a compendium entry's reference into a note, for every game system.

import { App, MarkdownView, Notice } from 'obsidian';

/** Copy a reference (`5e:spell:Fireball`, [[Marta]]), ready to paste into any note. */
export function copyReference(ref: string | undefined, name: string): void {
	if (!ref) { new Notice(`${name} can't be referenced from a note.`); return; }
	void navigator.clipboard.writeText(ref).then(
		() => new Notice(`Copied ${ref}`),
		() => new Notice(`Couldn't copy the reference to ${name}`),
	);
}

/** Put a reference into the note you were last editing; with no note open, copy it instead. Focus stays where it is. */
export function insertReference(app: App, ref: string | undefined, name: string): void {
	if (!ref) { new Notice(`${name} can't be referenced from a note.`); return; }
	const view = app.workspace.getMostRecentLeaf()?.view;
	const md = view instanceof MarkdownView ? view : app.workspace.getLeavesOfType('markdown').map(l => l.view).find((v): v is MarkdownView => v instanceof MarkdownView);
	if (!md) { copyReference(ref, name); return; }
	md.editor.replaceSelection(ref);
	new Notice(`Inserted ${name} into ${md.file?.basename ?? 'the note'}`);
}
