/**
 * Per-prompt cooldown/backoff state for unstable prompts.
 *
 * This is intentionally conservative and currently enabled only for
 * prompt names that are known to fail frequently in real usage.
 */

interface PromptBackoffConfig {
	failureThreshold: number;
	baseCooldownMs: number;
	maxCooldownMs: number;
}

interface PromptBackoffState {
	consecutiveFailures: number;
	cooldownUntil: number;
}

interface PromptBackoffDecision {
	skip: boolean;
	remainingMs: number;
}

const PROMPT_BACKOFF_CONFIG: Record<string, PromptBackoffConfig> = {
	// First target: unstable scene topic/tone extraction.
	topic_tone_change: {
		failureThreshold: 2,
		baseCooldownMs: 30_000,
		maxCooldownMs: 5 * 60_000,
	},
};

const promptBackoffState = new Map<string, PromptBackoffState>();

function getConfig(promptName: string): PromptBackoffConfig | null {
	return PROMPT_BACKOFF_CONFIG[promptName] ?? null;
}

function getOrCreateState(promptName: string): PromptBackoffState {
	const existing = promptBackoffState.get(promptName);
	if (existing) {
		return existing;
	}
	const created: PromptBackoffState = {
		consecutiveFailures: 0,
		cooldownUntil: 0,
	};
	promptBackoffState.set(promptName, created);
	return created;
}

function computeCooldownMs(state: PromptBackoffState, config: PromptBackoffConfig): number {
	const overThreshold = Math.max(0, state.consecutiveFailures - config.failureThreshold);
	const multiplier = 2 ** overThreshold;
	return Math.min(config.baseCooldownMs * multiplier, config.maxCooldownMs);
}

export function shouldSkipPromptByBackoff(promptName: string, now = Date.now()): PromptBackoffDecision {
	const config = getConfig(promptName);
	if (!config) {
		return { skip: false, remainingMs: 0 };
	}

	const state = getOrCreateState(promptName);
	if (state.cooldownUntil > now) {
		return {
			skip: true,
			remainingMs: state.cooldownUntil - now,
		};
	}

	return { skip: false, remainingMs: 0 };
}

export function recordPromptBackoffSuccess(promptName: string): void {
	const config = getConfig(promptName);
	if (!config) return;
	const state = getOrCreateState(promptName);
	state.consecutiveFailures = 0;
	state.cooldownUntil = 0;
}

export function recordPromptBackoffFailure(promptName: string, now = Date.now()): void {
	const config = getConfig(promptName);
	if (!config) return;
	const state = getOrCreateState(promptName);
	state.consecutiveFailures += 1;
	if (state.consecutiveFailures >= config.failureThreshold) {
		state.cooldownUntil = now + computeCooldownMs(state, config);
	}
}

export function resetPromptBackoffState(): void {
	promptBackoffState.clear();
}

