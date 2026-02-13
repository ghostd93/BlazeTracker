/**
 * Prompt result cache for unchanged extraction windows.
 *
 * Caches successful parse results keyed by prompt payload + settings so
 * repeated runs can skip redundant LLM calls when context is unchanged.
 */

interface CachedPromptResult {
	data: unknown;
	reasoning?: string;
	rawResponse?: string;
	cachedAt: number;
	hits: number;
}

const MAX_CACHE_ENTRIES = 500;
const MAX_CACHE_AGE_MS = 15 * 60_000;

const promptResultCache = new Map<string, CachedPromptResult>();

function hashString(input: string): string {
	let hash = 5381;
	for (let i = 0; i < input.length; i++) {
		hash = (hash * 33) ^ input.charCodeAt(i);
	}
	return (hash >>> 0).toString(16);
}

function buildRawCacheKey(
	promptName: string,
	systemPrompt: string,
	userPrompt: string,
	temperature: number,
	profileId: string,
): string {
	return [
		promptName,
		profileId,
		String(temperature),
		hashString(systemPrompt),
		hashString(userPrompt),
	].join('|');
}

function pruneCache(now = Date.now()): void {
	for (const [key, value] of promptResultCache) {
		if (now - value.cachedAt > MAX_CACHE_AGE_MS) {
			promptResultCache.delete(key);
		}
	}

	if (promptResultCache.size <= MAX_CACHE_ENTRIES) {
		return;
	}

	const entries = Array.from(promptResultCache.entries()).sort(
		(a, b) => a[1].cachedAt - b[1].cachedAt,
	);
	const toRemove = promptResultCache.size - MAX_CACHE_ENTRIES;
	for (let i = 0; i < toRemove; i++) {
		promptResultCache.delete(entries[i][0]);
	}
}

export function getCachedPromptResult<T>(
	promptName: string,
	systemPrompt: string,
	userPrompt: string,
	temperature: number,
	profileId: string,
	now = Date.now(),
): { key: string; cached: { data: T; reasoning?: string; rawResponse?: string } | null } {
	pruneCache(now);
	const key = buildRawCacheKey(
		promptName,
		systemPrompt,
		userPrompt,
		temperature,
		profileId,
	);
	const cached = promptResultCache.get(key);
	if (!cached) {
		return { key, cached: null };
	}

	cached.hits += 1;
	return {
		key,
		cached: {
			data: cached.data as T,
			reasoning: cached.reasoning,
			rawResponse: cached.rawResponse,
		},
	};
}

export function setCachedPromptResult(
	key: string,
	data: unknown,
	reasoning?: string,
	rawResponse?: string,
	now = Date.now(),
): void {
	promptResultCache.set(key, {
		data,
		reasoning,
		rawResponse,
		cachedAt: now,
		hits: 0,
	});
	pruneCache(now);
}

export function clearPromptResultCache(): void {
	promptResultCache.clear();
}

