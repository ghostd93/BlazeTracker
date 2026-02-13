import { describe, it, expect, beforeEach } from 'vitest';
import {
	shouldSkipPromptByBackoff,
	recordPromptBackoffFailure,
	recordPromptBackoffSuccess,
	resetPromptBackoffState,
} from './promptBackoff';

describe('promptBackoff', () => {
	beforeEach(() => {
		resetPromptBackoffState();
	});

	it('does not apply backoff to prompts without config', () => {
		recordPromptBackoffFailure('time_change', 1000);
		const decision = shouldSkipPromptByBackoff('time_change', 1001);
		expect(decision.skip).toBe(false);
	});

	it('enables cooldown for topic_tone_change after repeated failures', () => {
		recordPromptBackoffFailure('topic_tone_change', 1000);
		let decision = shouldSkipPromptByBackoff('topic_tone_change', 1001);
		expect(decision.skip).toBe(false);

		recordPromptBackoffFailure('topic_tone_change', 2000);
		decision = shouldSkipPromptByBackoff('topic_tone_change', 2001);
		expect(decision.skip).toBe(true);
		expect(decision.remainingMs).toBeGreaterThan(0);
	});

	it('clears cooldown after success', () => {
		recordPromptBackoffFailure('topic_tone_change', 1000);
		recordPromptBackoffFailure('topic_tone_change', 2000);

		let decision = shouldSkipPromptByBackoff('topic_tone_change', 2001);
		expect(decision.skip).toBe(true);

		recordPromptBackoffSuccess('topic_tone_change');
		decision = shouldSkipPromptByBackoff('topic_tone_change', 2002);
		expect(decision.skip).toBe(false);
	});
});

