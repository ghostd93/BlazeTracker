// ============================================
// Chapter Extractor
// ============================================

import { getSettings, getTemperature } from '../settings';
import { getPrompt } from './prompts';
import { makeGeneratorRequest, buildExtractionMessages } from '../utils/generator';
import { parseJsonResponse, asString, asStringArray, asBoolean, isObject } from '../utils/json';
import type {
	Chapter,
	ChapterOutcomes,
	NarrativeDateTime,
	TimestampedEvent,
	NarrativeState,
} from '../types/state';
import { createEmptyChapter, createEmptyOutcomes, finalizeChapter } from '../state/chapters';
import { formatEventsForInjection } from '../state/events';
import { formatRelationshipsForPrompt } from '../state/relationships';

// ============================================
// Schema & Example
// ============================================

export const CHAPTER_BOUNDARY_SCHEMA = {
	type: 'object',
	description: 'Chapter boundary analysis result',
	additionalProperties: false,
	properties: {
		isChapterBoundary: {
			type: 'boolean',
			description: 'Whether this represents a true narrative chapter boundary',
		},
		title: {
			type: 'string',
			description: 'A short, evocative title for the chapter (3-6 words)',
		},
		summary: {
			type: 'string',
			description: '2-3 sentence summary of what happened in the chapter',
		},
		outcomes: {
			type: 'object',
			properties: {
				relationshipChanges: {
					type: 'array',
					items: { type: 'string' },
					description: 'Brief descriptions of relationship shifts',
				},
				secretsRevealed: {
					type: 'array',
					items: { type: 'string' },
					description: 'Secrets that came to light',
				},
				newComplications: {
					type: 'array',
					items: { type: 'string' },
					description: 'New problems or tensions introduced',
				},
			},
		},
	},
	required: ['isChapterBoundary', 'title', 'summary'],
};

const CHAPTER_EXAMPLE = JSON.stringify(
	{
		isChapterBoundary: true,
		title: 'The Midnight Confession',
		summary: 'Elena revealed her past to Marcus under the stars, leading to an unexpected moment of vulnerability. Their relationship deepened as secrets were shared and trust was established.',
		outcomes: {
			relationshipChanges: [
				'Elena and Marcus grew closer through shared vulnerability',
			],
			secretsRevealed: ["Elena's criminal past"],
			newComplications: ["Marcus must now decide whether to keep Elena's secret"],
		},
	},
	null,
	2,
);

// ============================================
// Constants
// ============================================

const SYSTEM_PROMPT =
	'You are a narrative analysis agent for roleplay. Analyze chapter boundaries and summarize story progression. Return only valid JSON.';

// ============================================
// Public API
// ============================================

export interface ExtractChapterParams {
	events: TimestampedEvent[];
	narrativeState: NarrativeState;
	chapterIndex: number;
	startTime: NarrativeDateTime;
	endTime: NarrativeDateTime;
	primaryLocation: string;
	/** If true, always create a chapter regardless of LLM's boundary assessment */
	forceCreate?: boolean;
	abortSignal?: AbortSignal;
}

export interface ChapterExtractionResult {
	isChapterBoundary: boolean;
	chapter?: Chapter;
}

/**
 * Extract chapter information when a potential boundary is detected.
 * Returns the chapter if it's a true boundary, null otherwise.
 */
export async function extractChapterBoundary(
	params: ExtractChapterParams,
): Promise<ChapterExtractionResult> {
	const settings = getSettings();

	const schemaStr = JSON.stringify(CHAPTER_BOUNDARY_SCHEMA, null, 2);
	const eventsStr = formatEventsForInjection(params.events);
	const relationshipsStr = formatRelationshipsForPrompt(params.narrativeState.relationships);

	const prompt = getPrompt('chapter_boundary')
		.replace('{{currentEvents}}', eventsStr)
		.replace('{{currentRelationships}}', relationshipsStr)
		.replace('{{schema}}', schemaStr)
		.replace('{{schemaExample}}', CHAPTER_EXAMPLE);

	const llmMessages = buildExtractionMessages(SYSTEM_PROMPT, prompt);

	try {
		const response = await makeGeneratorRequest(llmMessages, {
			profileId: settings.profileId,
			maxTokens: settings.maxResponseTokens,
			temperature: getTemperature('chapter_boundary'),
			abortSignal: params.abortSignal,
		});

		const parsed = parseJsonResponse(response, {
			shape: 'object',
			moduleName: 'BlazeTracker/Chapter',
		});

		const result = validateChapterData(parsed);

		// If not forcing and LLM says it's not a boundary, return false
		if (!params.forceCreate && !result.isChapterBoundary) {
			return { isChapterBoundary: false };
		}

		// Create the chapter with extracted data (either forced or natural boundary)
		const chapter = createEmptyChapter(params.chapterIndex);
		chapter.title = result.title;
		chapter.summary = result.summary;
		chapter.outcomes = result.outcomes;

		// Finalize with time range and events
		const finalizedChapter = finalizeChapter(
			chapter,
			params.events,
			params.startTime,
			params.endTime,
			params.primaryLocation,
		);

		return {
			isChapterBoundary: true,
			chapter: finalizedChapter,
		};
	} catch (error) {
		console.warn('[BlazeTracker] Chapter extraction failed:', error);
		// On error, assume it's not a chapter boundary
		return { isChapterBoundary: false };
	}
}

// ============================================
// Validation
// ============================================

interface ValidatedChapterData {
	isChapterBoundary: boolean;
	title: string;
	summary: string;
	outcomes: ChapterOutcomes;
}

function validateChapterData(data: unknown): ValidatedChapterData {
	if (!isObject(data)) {
		return {
			isChapterBoundary: false,
			title: '',
			summary: '',
			outcomes: createEmptyOutcomes(),
		};
	}

	const isChapterBoundary = asBoolean(data.isChapterBoundary, false);
	const title = asString(data.title, 'Untitled Chapter');
	const summary = asString(data.summary, '');
	const outcomes = validateOutcomes(data.outcomes);

	return {
		isChapterBoundary,
		title,
		summary,
		outcomes,
	};
}

function validateOutcomes(data: unknown): ChapterOutcomes {
	if (!isObject(data)) {
		return createEmptyOutcomes();
	}

	return {
		relationshipChanges: asStringArray(data.relationshipChanges),
		secretsRevealed: asStringArray(data.secretsRevealed),
		newComplications: asStringArray(data.newComplications),
	};
}
