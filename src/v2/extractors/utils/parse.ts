/**
 * Parse LLM responses with retry logic.
 */

import type { Generator } from '../../generator';
import { buildPrompt } from '../../generator';
import type { PromptTemplate, BuiltPrompt } from '../../prompts';
import { debugLog, debugWarn, errorLog } from '../../../utils/debug';
import { getV2Settings } from '../../settings';
import { recordLlmAttempt, recordLlmResult, recordSkippedExtractor } from '../progressTracker';
import {
	shouldSkipPromptByBackoff,
	recordPromptBackoffFailure,
	recordPromptBackoffSuccess,
} from './promptBackoff';
import { getCachedPromptResult, setCachedPromptResult } from './promptResultCache';

const isVitestEnv =
	typeof process !== 'undefined' &&
	typeof process.env !== 'undefined' &&
	process.env.VITEST === 'true';

/**
 * Options for parsing with retry.
 */
export interface ParseOptions {
	/** Maximum number of retry attempts */
	maxRetries?: number;
	/** Temperature for retries (usually lower) */
	retryTemperature?: number;
	/** Log reasoning to console */
	logReasoning?: boolean;
	/** Abort signal for cancellation */
	abortSignal?: AbortSignal;
}

/**
 * Result of a parse attempt.
 */
export interface ParseResult<T> {
	success: boolean;
	data?: T;
	reasoning?: string;
	rawResponse?: string;
	error?: string;
	/** Whether the request was aborted */
	aborted?: boolean;
}

/**
 * Extract reasoning from a parsed response if present.
 */
export function extractReasoning(parsed: unknown): string | undefined {
	if (typeof parsed === 'object' && parsed !== null && 'reasoning' in parsed) {
		const reasoning = (parsed as { reasoning: unknown }).reasoning;
		if (typeof reasoning === 'string') {
			return reasoning;
		}
	}
	return undefined;
}

/**
 * Generate and parse a response with retry logic.
 *
 * @param generator - The generator to use
 * @param prompt - The prompt template
 * @param builtPrompt - The built prompt with placeholders filled
 * @param temperature - Initial temperature
 * @param options - Parse options
 * @returns Parse result with data or error
 */
export async function generateAndParse<T>(
	generator: Generator,
	prompt: PromptTemplate<T>,
	builtPrompt: BuiltPrompt,
	temperature: number,
	options: ParseOptions = {},
): Promise<ParseResult<T>> {
	const {
		maxRetries = 2,
		retryTemperature = 0.1,
		logReasoning = true,
		abortSignal,
	} = options;
	const settings = getV2Settings();

	// Check if already aborted before starting
	if (abortSignal?.aborted) {
		return {
			success: false,
			aborted: true,
		};
	}

	// Prompt cache for unchanged windows: reuse prior successful parse.
	let cacheKey = '';
	if (!isVitestEnv) {
		const cacheLookup = getCachedPromptResult<T>(
			prompt.name,
			builtPrompt.system,
			builtPrompt.user,
			temperature,
			settings.v2ProfileId,
		);
		cacheKey = cacheLookup.key;
		if (cacheLookup.cached) {
			recordSkippedExtractor(prompt.name, 'prompt-cache-hit');
			return {
				success: true,
				data: cacheLookup.cached.data,
				reasoning: cacheLookup.cached.reasoning,
				rawResponse: cacheLookup.cached.rawResponse,
			};
		}
	}

	// Prompt-level cooldown/backoff for repeatedly failing prompts.
	const backoff = shouldSkipPromptByBackoff(prompt.name);
	if (backoff.skip) {
		recordSkippedExtractor(prompt.name, `prompt-cooldown:${backoff.remainingMs}ms`);
		debugWarn(
			`${prompt.name} skipped due to cooldown (${Math.ceil(backoff.remainingMs / 1000)}s remaining)`,
		);
		return {
			success: false,
			error: `cooldown active (${backoff.remainingMs}ms remaining)`,
		};
	}

	let lastError: string | undefined;
	let lastResponse: string | undefined;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		const currentTemp = attempt === 0 ? temperature : retryTemperature;
		recordLlmAttempt(prompt.name, attempt > 0);

		try {
			const generatorPrompt = buildPrompt(
				builtPrompt.system,
				builtPrompt.user,
				prompt.name,
			);

			const response = await generator.generate(generatorPrompt, {
				temperature: currentTemp,
				maxTokens: settings.v2MaxTokens,
				abortSignal,
			});

			lastResponse = response;

			// Try to parse the response
			const parsed = prompt.parseResponse(response);

			if (parsed !== null) {
				const reasoning = extractReasoning(parsed);
				recordLlmResult(prompt.name, true);
				recordPromptBackoffSuccess(prompt.name);
				if (!isVitestEnv && cacheKey) {
					setCachedPromptResult(cacheKey, parsed, reasoning, response);
				}

				if (logReasoning && reasoning) {
					debugLog(`${prompt.name} reasoning:`, reasoning);
				}

				return {
					success: true,
					data: parsed,
					reasoning,
					rawResponse: response,
				};
			}

			lastError = 'parseResponse returned null';
		} catch (error) {
			// Check if this was an abort
			if (abortSignal?.aborted) {
				return {
					success: false,
					aborted: true,
				};
			}
			lastError = error instanceof Error ? error.message : String(error);
		}

		// Check if aborted between retries
		if (abortSignal?.aborted) {
			return {
				success: false,
				aborted: true,
			};
		}

		// If we're going to retry, log the failure
		if (attempt < maxRetries) {
			debugWarn(
				`${prompt.name} parse failed (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError}`,
			);
		}
	}

	// All attempts failed
	errorLog(`${prompt.name} failed after ${maxRetries + 1} attempts:`, lastError);
	recordLlmResult(prompt.name, false);
	recordPromptBackoffFailure(prompt.name);
	if (lastResponse) {
		errorLog(`Last response:`, lastResponse.substring(0, 500));
	}

	return {
		success: false,
		error: lastError,
		rawResponse: lastResponse,
	};
}

/**
 * Simple parse without retry - for cases where we don't want to retry.
 */
export async function generateAndParseOnce<T>(
	generator: Generator,
	prompt: PromptTemplate<T>,
	builtPrompt: BuiltPrompt,
	temperature: number,
	logReasoning = true,
): Promise<ParseResult<T>> {
	return generateAndParse(generator, prompt, builtPrompt, temperature, {
		maxRetries: 0,
		logReasoning,
	});
}
