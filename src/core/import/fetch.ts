// The one network request an import makes: the data behind a link the user
// pasted and then chose to fetch (Import… names the site first). Only https,
// only for links an importer says it reads, and never more than a few MB.

import { requestUrl } from 'obsidian';

const MAX_BYTES = 8 * 1024 * 1024;

export type Fetched = { ok: true; text: string } | { ok: false; error: string };

export async function fetchImport(url: string): Promise<Fetched> {
	let host = url;
	try {
		const u = new URL(url);
		if (u.protocol !== 'https:') return { ok: false, error: 'Only https links can be fetched.' };
		host = u.host;
	} catch {
		return { ok: false, error: 'That isn\'t a link Ember Vault can fetch.' };
	}
	try {
		const res = await requestUrl({ url, method: 'GET', headers: { Accept: 'application/json, application/vnd.api+json;q=0.9, */*;q=0.5' }, throw: false });
		if (res.status === 404) return { ok: false, error: `${host} says there's nothing at that link.` };
		if (res.status === 401 || res.status === 403) return { ok: false, error: `${host} didn't share that. Check that it's public.` };
		if (res.status >= 400) return { ok: false, error: `${host} answered with an error (${res.status}). Try again later, or download the export and choose the file.` };
		if (res.arrayBuffer.byteLength > MAX_BYTES) return { ok: false, error: 'That\'s too big to import from a link. Download it and choose the file.' };
		return { ok: true, text: res.text };
	} catch (e) {
		console.error('Ember Vault: could not fetch', url, e);
		return { ok: false, error: `Couldn't reach ${host}. Check your connection, or download the export and choose the file.` };
	}
}
