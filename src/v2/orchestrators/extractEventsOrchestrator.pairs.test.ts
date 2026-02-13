import { describe, expect, it } from 'vitest';
import { buildUniqueSortedPairs } from './extractEventsOrchestrator';

describe('buildUniqueSortedPairs', () => {
	it('returns sorted pairs without duplicates', () => {
		const characters = ['Luna', 'User', 'Luna', 'Carol'];
		const pairs = buildUniqueSortedPairs(characters);
		expect(pairs).toEqual([
			['Luna', 'User'],
			['Carol', 'Luna'],
			['Carol', 'User'],
		]);
	});

	it('returns empty array when there are fewer than two characters', () => {
		expect(buildUniqueSortedPairs(['Solo'])).toEqual([]);
		expect(buildUniqueSortedPairs([])).toEqual([]);
	});
});
