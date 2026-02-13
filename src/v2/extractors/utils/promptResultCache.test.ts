import { describe, it, expect, beforeEach } from 'vitest';
import {
	clearPromptResultCache,
	getCachedPromptResult,
	setCachedPromptResult,
} from './promptResultCache';

describe('promptResultCache', () => {
	beforeEach(() => {
		clearPromptResultCache();
	});

	it('returns null cache miss and hit after set', () => {
		const miss = getCachedPromptResult(
			'topic_tone_change',
			'system',
			'user',
			0.5,
			'profile-a',
			1000,
		);
		expect(miss.cached).toBeNull();

		setCachedPromptResult(miss.key, { ok: true }, 'reason', '{"ok":true}', 1000);
		const hit = getCachedPromptResult<{ ok: boolean }>(
			'topic_tone_change',
			'system',
			'user',
			0.5,
			'profile-a',
			1001,
		);
		expect(hit.cached).not.toBeNull();
		expect(hit.cached?.data.ok).toBe(true);
		expect(hit.cached?.reasoning).toBe('reason');
	});

	it('uses temperature/profile in key', () => {
		const keyA = getCachedPromptResult(
			'topic_tone_change',
			'system',
			'user',
			0.5,
			'profile-a',
			1000,
		).key;
		setCachedPromptResult(keyA, { v: 1 }, undefined, undefined, 1000);

		const differentTemp = getCachedPromptResult(
			'topic_tone_change',
			'system',
			'user',
			0.6,
			'profile-a',
			1001,
		);
		expect(differentTemp.cached).toBeNull();

		const differentProfile = getCachedPromptResult(
			'topic_tone_change',
			'system',
			'user',
			0.5,
			'profile-b',
			1001,
		);
		expect(differentProfile.cached).toBeNull();
	});

	it('expires entries older than max age', () => {
		const base = 1000;
		const key = getCachedPromptResult(
			'topic_tone_change',
			'system',
			'user',
			0.5,
			'profile-a',
			base,
		).key;
		setCachedPromptResult(key, { ok: true }, undefined, undefined, base);

		const hit = getCachedPromptResult(
			'topic_tone_change',
			'system',
			'user',
			0.5,
			'profile-a',
			base + 1000,
		);
		expect(hit.cached).not.toBeNull();

		const expired = getCachedPromptResult(
			'topic_tone_change',
			'system',
			'user',
			0.5,
			'profile-a',
			base + 16 * 60_000,
		);
		expect(expired.cached).toBeNull();
	});
});

