// ============================================
// Slash Commands Tests
// ============================================

import { describe, it, expect } from 'vitest';
import { getMostRecentMessageId, getStateForMessage, countExtractedMessages } from './helpers';
import type { STContext } from '../types/st';
import type { TrackedState } from '../types/state';

// ============================================
// Mock Helpers
// ============================================

function createMockContext(messageCount: number, extractedIndices: number[] = []): STContext {
	const chat: any[] = [];

	for (let i = 0; i < messageCount; i++) {
		const message: any = {
			is_user: i % 2 === 1, // Odd messages are user messages
			mes: `Message ${i}`,
			extra: {},
		};

		// Add extracted state for specified indices
		if (extractedIndices.includes(i)) {
			message.extra.blazetracker = {
				'0': {
					state: {
						time: {
							year: 2024,
							month: 1,
							day: 1,
							dayOfWeek: 'Monday',
							hour: 12,
							minute: 0,
							second: 0,
						},
					} as TrackedState,
					extractedAt: '2024-01-01T12:00:00Z',
				},
			};
			message.swipe_id = 0;
		}

		chat.push(message);
	}

	return { chat } as unknown as STContext;
}

// ============================================
// getMostRecentMessageId Tests
// ============================================

describe('getMostRecentMessageId', () => {
	it('returns -1 for empty chat', () => {
		const context = createMockContext(0);
		expect(getMostRecentMessageId(context)).toBe(-1);
	});

	it('returns 0 for single message', () => {
		const context = createMockContext(1);
		expect(getMostRecentMessageId(context)).toBe(0);
	});

	it('returns last index for multiple messages', () => {
		const context = createMockContext(5);
		expect(getMostRecentMessageId(context)).toBe(4);
	});

	it('returns last index for large chat', () => {
		const context = createMockContext(100);
		expect(getMostRecentMessageId(context)).toBe(99);
	});
});

// ============================================
// getStateForMessage Tests
// ============================================

describe('getStateForMessage', () => {
	it('returns null for invalid message ID', () => {
		const context = createMockContext(5);
		expect(getStateForMessage(context, -1)).toBeNull();
		expect(getStateForMessage(context, 10)).toBeNull();
	});

	it('returns null for message without state', () => {
		const context = createMockContext(5);
		expect(getStateForMessage(context, 0)).toBeNull();
		expect(getStateForMessage(context, 2)).toBeNull();
	});

	it('returns state for message with extracted state', () => {
		const context = createMockContext(5, [2]);
		const state = getStateForMessage(context, 2);

		expect(state).not.toBeNull();
		expect(state?.time?.year).toBe(2024);
	});

	it('returns correct state for specific message', () => {
		const context = createMockContext(10, [3, 7]);

		// Message 3 has state
		expect(getStateForMessage(context, 3)).not.toBeNull();

		// Message 5 doesn't have state
		expect(getStateForMessage(context, 5)).toBeNull();

		// Message 7 has state
		expect(getStateForMessage(context, 7)).not.toBeNull();
	});
});

// ============================================
// countExtractedMessages Tests
// ============================================

describe('countExtractedMessages', () => {
	it('returns 0 extracted for empty chat', () => {
		const context = createMockContext(0);
		const result = countExtractedMessages(context);

		expect(result.extracted).toBe(0);
		expect(result.total).toBe(0);
	});

	it('returns 0 extracted when no messages have state', () => {
		const context = createMockContext(5);
		const result = countExtractedMessages(context);

		expect(result.extracted).toBe(0);
		expect(result.total).toBe(5);
	});

	it('counts correctly when all messages have state', () => {
		const context = createMockContext(5, [0, 1, 2, 3, 4]);
		const result = countExtractedMessages(context);

		expect(result.extracted).toBe(5);
		expect(result.total).toBe(5);
	});

	it('counts correctly when some messages have state', () => {
		const context = createMockContext(10, [1, 3, 5, 7]);
		const result = countExtractedMessages(context);

		expect(result.extracted).toBe(4);
		expect(result.total).toBe(10);
	});

	it('handles single message correctly', () => {
		const context = createMockContext(1, [0]);
		const result = countExtractedMessages(context);

		expect(result.extracted).toBe(1);
		expect(result.total).toBe(1);
	});

	it('handles large chat correctly', () => {
		// Create chat with every 3rd message extracted
		const extractedIndices = [];
		for (let i = 0; i < 100; i += 3) {
			extractedIndices.push(i);
		}

		const context = createMockContext(100, extractedIndices);
		const result = countExtractedMessages(context);

		expect(result.extracted).toBe(34); // 0, 3, 6, ..., 99 = 34 messages
		expect(result.total).toBe(100);
	});
});

// ============================================
// Edge Cases
// ============================================

describe('edge cases', () => {
	it('handles message with empty extra object', () => {
		const context: STContext = {
			chat: [{ mes: 'test', extra: {} }],
		} as unknown as STContext;

		expect(getStateForMessage(context, 0)).toBeNull();
		expect(countExtractedMessages(context)).toEqual({ extracted: 0, total: 1 });
	});

	it('handles message with undefined extra', () => {
		const context: STContext = {
			chat: [{ mes: 'test' }],
		} as unknown as STContext;

		expect(getStateForMessage(context, 0)).toBeNull();
		expect(countExtractedMessages(context)).toEqual({ extracted: 0, total: 1 });
	});

	it('handles message with blazetracker but no state for current swipe', () => {
		const context: STContext = {
			chat: [
				{
					mes: 'test',
					swipe_id: 1, // Looking for swipe 1
					extra: {
						blazetracker: {
							'0': {
								state: { time: {} },
								extractedAt: '2024-01-01',
							}, // But only swipe 0 has state
						},
					},
				},
			],
		} as unknown as STContext;

		expect(getStateForMessage(context, 0)).toBeNull();
		expect(countExtractedMessages(context)).toEqual({ extracted: 0, total: 1 });
	});
});
