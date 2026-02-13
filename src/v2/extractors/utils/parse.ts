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

const PROMPT_MAX_TOKEN_CAPS: Record<string, number> = {
	location_change: 320,
	tension_change: 384,
	presence_change: 384,
	chapter_ended: 320,
};

function resolveMaxTokens(promptName: string, defaultMaxTokens: number): number {
	const cap = PROMPT_MAX_TOKEN_CAPS[promptName];
	if (typeof cap !== 'number' || cap <= 0) {
		return defaultMaxTokens;
	}
	return Math.min(defaultMaxTokens, cap);
}

interface FailureDetails {
	summary: string;
	details?: Record<string, unknown>;
}

function toStringIfPresent(value: unknown): string | undefined {
	if (typeof value === 'string' && value.trim().length > 0) {
		return value;
	}
	return undefined;
}

function snapshotObject(
	value: unknown,
	depth: number = 0,
	seen: WeakSet<object> = new WeakSet(),
): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
		return value;
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'function') return '[Function]';
	if (typeof value !== 'object') return String(value);
	if (seen.has(value as object)) return '[Circular]';
	if (depth >= 2) return '[MaxDepth]';

	seen.add(value as object);
	if (Array.isArray(value)) {
		return value.slice(0, 20).map(item => snapshotObject(item, depth + 1, seen));
	}

	const out: Record<string, unknown> = {};
	const obj = value as Record<string, unknown>;
	for (const key of Object.getOwnPropertyNames(obj)) {
		const field = obj[key];
		if (typeof field === 'function') continue;
		out[key] = snapshotObject(field, depth + 1, seen);
	}
	return out;
}

function simplifyError(error: unknown): FailureDetails {
	if (error instanceof Error) {
		const baseDetails: Record<string, unknown> = {
			name: error.name,
			message: error.message,
		};

		const errorObj = error as Error & {
			status?: unknown;
			statusText?: unknown;
			code?: unknown;
			type?: unknown;
			cause?: unknown;
		};

		if (errorObj.status !== undefined) baseDetails.status = errorObj.status;
		if (errorObj.statusText !== undefined)
			baseDetails.statusText = errorObj.statusText;
		if (errorObj.code !== undefined) baseDetails.code = errorObj.code;
		if (errorObj.type !== undefined) baseDetails.type = errorObj.type;
		if ('details' in errorObj) {
			baseDetails.details = snapshotObject(
				(errorObj as Error & { details?: unknown }).details,
			);
		}
		baseDetails.raw = snapshotObject(errorObj);

		const causeObj = errorObj.cause as
			| {
					message?: unknown;
					name?: unknown;
					status?: unknown;
					statusText?: unknown;
					code?: unknown;
					type?: unknown;
					responseText?: unknown;
					response?: unknown;
					details?: unknown;
			  }
			| undefined;
		const causeMessage = causeObj ? toStringIfPresent(causeObj.message) : undefined;
		const causeCode = causeObj ? toStringIfPresent(causeObj.code) : undefined;
		const causeStatus =
			causeObj && typeof causeObj.status === 'number'
				? causeObj.status
				: undefined;
		const causeStatusText = causeObj
			? toStringIfPresent(causeObj.statusText)
			: undefined;

		if (causeObj) {
			baseDetails.cause = {
				name: causeObj.name,
				message: causeObj.message,
				status: causeObj.status,
				statusText: causeObj.statusText,
				code: causeObj.code,
				type: causeObj.type,
				response: snapshotObject(causeObj.response),
				details: snapshotObject(causeObj.details),
				raw: snapshotObject(causeObj),
			};
		}

		const statusText = toStringIfPresent(errorObj.statusText);
		const code = toStringIfPresent(errorObj.code);
		const status =
			typeof errorObj.status === 'number' ? errorObj.status : undefined;
		const parts = [
			error.name,
			status ? `HTTP ${status}` : undefined,
			statusText,
			code,
			error.message,
			causeStatus ? `cause HTTP ${causeStatus}` : undefined,
			causeStatusText,
			causeCode,
			causeMessage,
		].filter(Boolean);

		return {
			summary: parts.join(' | '),
			details: baseDetails,
		};
	}

	return {
		summary: String(error),
		details: { value: error },
	};
}

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
	let lastErrorDetails: Record<string, unknown> | undefined;
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
				maxTokens: resolveMaxTokens(prompt.name, settings.v2MaxTokens),
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
			const simplified = simplifyError(error);
			lastError = simplified.summary;
			lastErrorDetails = simplified.details;
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
			if (lastErrorDetails) {
				debugWarn(`${prompt.name} failure details:`, lastErrorDetails);
			}
		}
	}

	// All attempts failed
	errorLog(`${prompt.name} failed after ${maxRetries + 1} attempts:`, lastError);
	recordLlmResult(prompt.name, false, lastError);
	recordPromptBackoffFailure(prompt.name);
	if (lastErrorDetails) {
		errorLog(`${prompt.name} last failure details:`, lastErrorDetails);
	}
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
