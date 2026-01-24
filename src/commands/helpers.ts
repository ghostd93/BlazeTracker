// ============================================
// Slash Command Helper Functions (Pure/Testable)
// ============================================

import type { STContext } from '../types/st';
import type { TrackedState } from '../types/state';
import { getMessageState } from '../utils/messageState';

/**
 * Get the most recent message ID from the chat.
 */
export function getMostRecentMessageId(context: STContext): number {
	return context.chat.length - 1;
}

/**
 * Get stored state for a message by ID.
 */
export function getStateForMessage(context: STContext, messageId: number): TrackedState | null {
	const message = context.chat[messageId];
	if (!message) return null;
	const stateData = getMessageState(message);
	return stateData?.state ?? null;
}

/**
 * Count messages that have extracted state.
 */
export function countExtractedMessages(context: STContext): { extracted: number; total: number } {
	let extracted = 0;
	const total = context.chat.length;

	for (let i = 0; i < total; i++) {
		const message = context.chat[i];
		if (getMessageState(message)) {
			extracted++;
		}
	}

	return { extracted, total };
}
