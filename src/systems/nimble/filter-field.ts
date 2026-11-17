// Nimble's filter field: core's (core/compendium/filter-field.ts) with Nimble's search words.

import { FilterField as CoreFilterField, FilterFieldOptions } from '../../core/compendium/filter-field';
import { NIMBLE_QUERY } from './compendium-query';

export class FilterField extends CoreFilterField {
	constructor(o: Omit<FilterFieldOptions, 'query'>) {
		super({ ...o, query: NIMBLE_QUERY });
	}
}
