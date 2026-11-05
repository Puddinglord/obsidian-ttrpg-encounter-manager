// The ```nimble-npc block format. Pure: no Obsidian imports.
//
//   look: Tall, soot on her apron, one glass eye
//   wants: Her husband's mill back
//   voice: Clipped. Never finishes a sentence.
//   secret: She sold the water rights to Old Mother Silt.
//
// The name, role and portrait come from the note's properties (`role:`,
// `portrait: "[[Marta.png]]"`); `name:` and `role:` lines here override them.
// Any other "Label: text" line becomes a row. Lines that don't start with a
// label continue the row above, so a field can run over several lines.

export interface NpcCardField {
	/** Lowercase key, e.g. "wants". */
	key: string;
	/** As written, e.g. "Wants". */
	label: string;
	/** Markdown. */
	value: string;
}

export interface NpcCardDef {
	name?: string;
	role?: string;
	fields: NpcCardField[];
}

/** Rows that get special treatment when rendered. */
export const SECRET_KEYS = ['secret', 'secrets', 'gm', 'gm only'];

// "Look:", "**Wants:**", "- Voice:" — a short label at the start of a line.
const FIELD = /^\s*(?:[-*+]\s+)?(?:\*\*)?([A-Za-z][A-Za-z' ]{0,23}?)(?:\*\*)?\s*:(?:\*\*)?(?:\s+|$)(.*)$/;

export function parseNpcCard(source: string): NpcCardDef {
	const def: NpcCardDef = { fields: [] };
	let current: NpcCardField | null = null;
	for (const raw of source.split(/\r?\n/)) {
		const m = raw.match(FIELD);
		if (m) {
			const label = m[1].trim();
			const key = label.toLowerCase();
			const value = m[2].trim();
			if (key === 'name') { def.name = value || undefined; current = null; continue; }
			if (key === 'role') { def.role = value || undefined; current = null; continue; }
			current = { key, label: label[0].toUpperCase() + label.slice(1), value };
			def.fields.push(current);
			continue;
		}
		if (!raw.trim()) {
			if (current?.value) current.value += '\n';
			continue;
		}
		if (current) current.value = current.value ? `${current.value}\n${raw.trim()}` : raw.trim();
	}
	for (const f of def.fields) f.value = f.value.trim();
	return def;
}

/**
 * A portrait property's link text: "[[Marta.png]]", "![[Marta.png|200]]",
 * "Assets/Marta.png", or an https URL. Lists use their first entry.
 */
export function portraitLink(v: unknown): string | null {
	if (Array.isArray(v)) return portraitLink(v[0]);
	if (typeof v !== 'string') return null;
	const t = v.trim();
	if (!t) return null;
	const wiki = t.match(/^!?\[\[([^\]]+)\]\]$/);
	if (wiki) return wiki[1].split('|')[0].trim() || null;
	const md = t.match(/^!?\[[^\]]*\]\(([^)]+)\)$/);
	if (md) return decodeURI(md[1].trim());
	return t;
}

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg'];

export const isRemote = (link: string) => /^https?:\/\//i.test(link);

/** The new NPC card block, as inserted by the template and /npc-card. */
export const NPC_CARD_BLOCK = '```nimble-npc\nlook: \nwants: \nvoice: \nsecret: \n```';
