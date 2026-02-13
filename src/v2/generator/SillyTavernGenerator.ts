/**
 * V2 SillyTavern Generator
 *
 * Production implementation using SillyTavern's generation API.
 */

import type { ExtractedData } from 'sillytavern-utils-lib/types';
import { Generator as STGenerator } from 'sillytavern-utils-lib';
import type { Generator } from './Generator';
import { GeneratorAbortError, GeneratorError } from './Generator';
import type { GeneratorPrompt, GeneratorSettings, GeneratorConfig } from './types';
import { RateLimiter } from '../utils/rateLimiter';
import { getV2Settings } from '../settings';

// Module-level rate limiter instance
let rateLimiter: RateLimiter | null = null;
let lastMaxReqsPerMinute: number | null = null;

function toStringIfPresent(value: unknown): string | undefined {
	if (typeof value === 'string' && value.trim().length > 0) {
		return value;
	}
	return undefined;
}

function copyOwnFields(error: unknown): Record<string, unknown> {
	if (!error || typeof error !== 'object') {
		return {};
	}
	const source = error as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const key of Object.getOwnPropertyNames(source)) {
		const value = source[key];
		if (typeof value === 'function') continue;
		out[key] = value;
	}
	return out;
}

function summarizeGeneratorError(error: unknown): string {
	if (!error || typeof error !== 'object') {
		return String(error);
	}
	const source = error as Record<string, unknown>;
	const response = source.response as Record<string, unknown> | undefined;
	const nestedError = source.error as Record<string, unknown> | undefined;
	const cause = source.cause as Record<string, unknown> | undefined;

	const msg = toStringIfPresent(source.message);
	const code = toStringIfPresent(source.code);
	const type = toStringIfPresent(source.type);
	const status =
		typeof source.status === 'number'
			? source.status
			: typeof response?.status === 'number'
				? response.status
				: undefined;
	const statusText =
		toStringIfPresent(source.statusText) ??
		toStringIfPresent(response?.statusText) ??
		toStringIfPresent(response?.status_message);
	const providerMessage =
		toStringIfPresent(source.responseText) ??
		toStringIfPresent(source.body) ??
		toStringIfPresent(source.reason) ??
		toStringIfPresent(response?.message) ??
		toStringIfPresent(response?.error as unknown) ??
		toStringIfPresent((response?.data as Record<string, unknown> | undefined)?.message) ??
		toStringIfPresent(
			((response?.data as Record<string, unknown> | undefined)?.error as Record<
				string,
				unknown
			>)?.message,
		) ??
		toStringIfPresent(nestedError?.message) ??
		toStringIfPresent(cause?.message);

	const parts = [
		status ? `HTTP ${status}` : undefined,
		statusText,
		code,
		type,
		msg,
		providerMessage,
	].filter(Boolean);

	return parts.length > 0 ? parts.join(' | ') : 'API request failed';
}

/**
 * Get or create the rate limiter instance.
 * Re-creates if settings have changed.
 */
function getRateLimiter(): RateLimiter {
	const settings = getV2Settings();
	const maxReqs = settings.v2MaxReqsPerMinute;

	if (!rateLimiter || lastMaxReqsPerMinute !== maxReqs) {
		rateLimiter = new RateLimiter(maxReqs);
		lastMaxReqsPerMinute = maxReqs;
	}

	return rateLimiter;
}

/**
 * Production generator using SillyTavern's API.
 */
export class SillyTavernGenerator implements Generator {
	private readonly generator: STGenerator;
	private readonly config: GeneratorConfig;
	private abortController: AbortController | null = null;

	constructor(config: GeneratorConfig) {
		this.config = config;
		this.generator = new STGenerator();
	}

	async generate(prompt: GeneratorPrompt, settings: GeneratorSettings): Promise<string> {
		const { maxTokens, temperature = 0.5, abortSignal } = settings;

		// Check if already aborted
		if (abortSignal?.aborted) {
			throw new GeneratorAbortError('Generation aborted before start');
		}

		// Wait for rate limit slot
		try {
			await getRateLimiter().waitForSlot(abortSignal);
		} catch (e) {
			if (e instanceof Error && e.message === 'Aborted') {
				throw new GeneratorAbortError(
					'Generation aborted while waiting for rate limit',
				);
			}
			throw e;
		}

		return new Promise<string>((resolve, reject) => {
			// Create abort controller for this request
			this.abortController = new AbortController();

			// Link external abort signal
			if (abortSignal) {
				abortSignal.addEventListener('abort', () => {
					this.abortController?.abort();
				});
			}

			this.generator.generateRequest(
				{
					profileId: this.config.profileId,
					prompt: prompt.messages,
					maxTokens,
					custom: { signal: this.abortController.signal },
					overridePayload: {
						temperature,
					},
				},
				{
					abortController: this.abortController,
					onFinish: (_requestId, data, error) => {
						this.abortController = null;

						if (error) {
							if (error.name === 'AbortError') {
								return reject(
									new GeneratorAbortError(
										'Generation aborted',
									),
								);
							}
							const details = copyOwnFields(error);
							return reject(
								new GeneratorError(
									summarizeGeneratorError(error),
									error,
									details,
								),
							);
						}

						if (!data) {
							return reject(
								new GeneratorAbortError(
									'Generation aborted',
								),
							);
						}

						// Record successful request for rate limiting
						getRateLimiter().recordRequest();

						const content = (data as ExtractedData).content;
						if (typeof content === 'string') {
							resolve(content);
						} else {
							resolve(JSON.stringify(content));
						}
					},
				},
			);
		});
	}

	abort(): void {
		this.abortController?.abort();
		this.abortController = null;
	}
}

/**
 * Create a SillyTavern generator with the given profile ID.
 */
export function createSillyTavernGenerator(profileId: string): SillyTavernGenerator {
	return new SillyTavernGenerator({ profileId });
}
