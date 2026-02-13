/**
 * Combined Mood and Physical State Change Event Extractor
 *
 * Extracts both mood and physical state changes in a single LLM call for efficiency.
 * This is a per-character extractor that runs once for each present character.
 */

import type { Generator } from '../../../generator';
import type { EventStore } from '../../../store';
import type {
	Event,
	CharacterMoodAddedEvent,
	CharacterMoodRemovedEvent,
	CharacterPhysicalAddedEvent,
	CharacterPhysicalRemovedEvent,
	MessageAndSwipe,
} from '../../../types';
import type { ExtractedMoodPhysicalChange } from '../../../types/extraction';
import type {
	PerCharacterExtractor,
	ExtractionContext,
	ExtractionSettings,
	RunStrategyContext,
} from '../../types';
import { getMessageCount } from '../../types';
import { moodPhysicalChangePrompt } from '../../../prompts/events/moodPhysicalChangePrompt';
import type { PromptTemplate } from '../../../prompts/types';
import { PLACEHOLDERS } from '../../../prompts/placeholders';
import {
	buildExtractorPrompt,
	generateAndParse,
	evaluateRunStrategy,
	getPriorProjection,
	filterMoodsToAdd,
	filterMoodsToRemove,
	filterPhysicalToAdd,
	filterPhysicalToRemove,
	mapMoodPhysicalChange,
	projectWithTurnEvents,
	getExtractorTemperature,
	limitMessageRange,
	getMaxMessages,
	formatCharacterState,
} from '../../utils';
import { debugWarn } from '../../../../utils/debug';
import { parseJsonResponse } from '../../../../utils/json';

interface ExtractedBatchMoodPhysicalChange {
	reasoning: string;
	characters: ExtractedMoodPhysicalChange[];
}

const batchMoodPhysicalChangePrompt: PromptTemplate<ExtractedBatchMoodPhysicalChange> = {
	name: 'mood_physical_change_batch',
	description: 'Extract mood/physical changes for multiple characters in one call',
	placeholders: [
		PLACEHOLDERS.messages,
		PLACEHOLDERS.targetCharacter,
		{
			name: 'targetCharacters',
			description: 'Comma-separated list of target characters',
			example: 'Elena, Marcus',
		},
		{
			name: 'targetCharacterStates',
			description: 'Current states for all target characters',
			example: '## Elena\\nMood: ...\\nPhysical State: ...',
		},
	],
	systemPrompt: `Detect mood and physical-state changes for MULTIPLE target characters.

Return strict JSON:
{
  "reasoning": "short summary",
  "characters": [
    {
      "character": "Name",
      "moodAdded": ["..."],
      "moodRemoved": ["..."],
      "physicalAdded": ["..."],
      "physicalRemoved": ["..."]
    }
  ]
}

Rules:
- Include one object per target character.
- Use empty arrays when no change.
- Do not include non-target characters.`,
	userTemplate: `Target characters: {{targetCharacters}}

Current states:
{{targetCharacterStates}}

Messages:
{{messages}}

Return JSON only.`,
	responseSchema: {
		type: 'object',
		properties: {
			reasoning: { type: 'string' },
			characters: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						character: { type: 'string' },
						moodAdded: { type: 'array', items: { type: 'string' } },
						moodRemoved: { type: 'array', items: { type: 'string' } },
						physicalAdded: { type: 'array', items: { type: 'string' } },
						physicalRemoved: { type: 'array', items: { type: 'string' } },
					},
					required: [
						'character',
						'moodAdded',
						'moodRemoved',
						'physicalAdded',
						'physicalRemoved',
					],
				},
			},
		},
		required: ['reasoning', 'characters'],
	},
	defaultTemperature: 0.5,
	parseResponse(response: string): ExtractedBatchMoodPhysicalChange | null {
		try {
			const parsed = parseJsonResponse<ExtractedBatchMoodPhysicalChange>(response, {
				shape: 'object',
				moduleName: 'mood_physical_change_batch',
			});
			if (!parsed || !Array.isArray(parsed.characters)) return null;
			return parsed;
		} catch {
			return null;
		}
	},
};

/**
 * Combined mood and physical state change per-character event extractor.
 *
 * Analyzes messages to detect changes in a specific character's emotional
 * and physical state, extracting both in a single LLM call for efficiency.
 */
export const moodPhysicalChangeExtractor: PerCharacterExtractor<ExtractedMoodPhysicalChange> = {
	name: 'moodPhysicalChange',
	displayName: 'mood & physical',
	category: 'characters',
	defaultTemperature: 0.5,
	prompt: moodPhysicalChangePrompt,

	// Messages since last mood/physical event
	messageStrategy: {
		strategy: 'sinceLastEventOfKind',
		kinds: [
			{ kind: 'character', subkind: 'mood_added' },
			{ kind: 'character', subkind: 'mood_removed' },
			{ kind: 'character', subkind: 'physical_added' },
			{ kind: 'character', subkind: 'physical_removed' },
		],
	},
	// Every 2 messages, offset=0 (default) fires on messageId 1, 3, 5... (user messages in normal chat)
	runStrategy: { strategy: 'everyNMessages', n: 2 },

	shouldRun(context: RunStrategyContext): boolean {
		// Run if characters tracking is enabled AND the run strategy permits
		return (
			context.settings.track.characters &&
			evaluateRunStrategy(this.runStrategy, context)
		);
	},

	async run(
		generator: Generator,
		context: ExtractionContext,
		settings: ExtractionSettings,
		store: EventStore,
		currentMessage: MessageAndSwipe,
		turnEvents: Event[],
		targetCharacter: string,
		abortSignal?: AbortSignal,
	): Promise<Event[]> {
		// Get current state projection including turn events
		const projection = projectWithTurnEvents(
			store,
			turnEvents,
			currentMessage.messageId,
			context,
		);

		// Get prior projection for validation (state before this message)
		const priorProjection = getPriorProjection(store, currentMessage, context);
		const priorCharacterState = priorProjection?.characters[targetCharacter];

		// Calculate message range based on strategy (since last mood/physical event)
		const messageCount = getMessageCount(this.messageStrategy, store, currentMessage);
		let messageStart = Math.max(0, currentMessage.messageId - messageCount + 1);
		let messageEnd = currentMessage.messageId;

		// Apply message limiting
		const maxMessages = getMaxMessages(settings, this.name);
		({ messageStart, messageEnd } = limitMessageRange(
			messageStart,
			messageEnd,
			maxMessages,
		));

		// Build prompt with target character context
		const builtPrompt = buildExtractorPrompt(
			moodPhysicalChangePrompt,
			context,
			projection,
			settings,
			messageStart,
			messageEnd,
			{ targetCharacter },
		);

		// Get temperature (prompt override → category → default)
		const temperature = getExtractorTemperature(
			settings,
			this.prompt.name,
			'characters',
			this.defaultTemperature,
		);

		// Generate and parse response
		const result = await generateAndParse(
			generator,
			moodPhysicalChangePrompt,
			builtPrompt,
			temperature,
			{ abortSignal },
		);

		// Handle parsing failure
		if (!result.success || !result.data) {
			debugWarn(`moodPhysicalChange extraction failed for ${targetCharacter}`);
			return [];
		}

		const extraction = result.data;

		// Validate and deduplicate against prior state
		const validatedMoodAdded = filterMoodsToAdd(
			extraction.moodAdded,
			priorCharacterState,
		);
		const validatedMoodRemoved = filterMoodsToRemove(
			extraction.moodRemoved,
			priorCharacterState,
		);
		const validatedPhysicalAdded = filterPhysicalToAdd(
			extraction.physicalAdded,
			priorCharacterState,
		);
		const validatedPhysicalRemoved = filterPhysicalToRemove(
			extraction.physicalRemoved,
			priorCharacterState,
		);

		// If no valid changes, return empty array
		if (
			validatedMoodAdded.length === 0 &&
			validatedMoodRemoved.length === 0 &&
			validatedPhysicalAdded.length === 0 &&
			validatedPhysicalRemoved.length === 0
		) {
			return [];
		}

		// Map validated extraction to events
		const validatedExtraction: ExtractedMoodPhysicalChange = {
			...extraction,
			moodAdded: validatedMoodAdded,
			moodRemoved: validatedMoodRemoved,
			physicalAdded: validatedPhysicalAdded,
			physicalRemoved: validatedPhysicalRemoved,
		};

		const events: (
			| CharacterMoodAddedEvent
			| CharacterMoodRemovedEvent
			| CharacterPhysicalAddedEvent
			| CharacterPhysicalRemovedEvent
		)[] = mapMoodPhysicalChange(validatedExtraction, currentMessage);

		return events;
	},
	async runBatch(
		generator: Generator,
		context: ExtractionContext,
		settings: ExtractionSettings,
		store: EventStore,
		currentMessage: MessageAndSwipe,
		turnEvents: Event[],
		targetCharacters: string[],
		abortSignal?: AbortSignal,
	): Promise<Event[]> {
		const customPromptOverride = settings.customPrompts[this.prompt.name];
		if (
			customPromptOverride?.systemPrompt ||
			customPromptOverride?.userTemplate
		) {
			const fallbackEvents: Event[] = [];
			for (const character of targetCharacters) {
				const events = await this.run(
					generator,
					context,
					settings,
					store,
					currentMessage,
					turnEvents,
					character,
					abortSignal,
				);
				fallbackEvents.push(...events);
			}
			return fallbackEvents;
		}

		const projection = projectWithTurnEvents(
			store,
			turnEvents,
			currentMessage.messageId,
			context,
		);
		const priorProjection = getPriorProjection(store, currentMessage, context);

		const messageCount = getMessageCount(this.messageStrategy, store, currentMessage);
		let messageStart = Math.max(0, currentMessage.messageId - messageCount + 1);
		let messageEnd = currentMessage.messageId;
		const maxMessages = getMaxMessages(settings, this.name);
		({ messageStart, messageEnd } = limitMessageRange(
			messageStart,
			messageEnd,
			maxMessages,
		));

		const targetCharacterStates = targetCharacters
			.map(name => `## ${name}\n${formatCharacterState(projection, name)}`)
			.join('\n\n');

		const builtPrompt = buildExtractorPrompt(
			batchMoodPhysicalChangePrompt,
			context,
			projection,
			settings,
			messageStart,
			messageEnd,
			{
				targetCharacter: targetCharacters[0] ?? '',
				additionalValues: {
					targetCharacters: targetCharacters.join(', '),
					targetCharacterStates,
				},
			},
		);

		const temperature = getExtractorTemperature(
			settings,
			this.prompt.name,
			'characters',
			this.defaultTemperature,
		);

		const result = await generateAndParse(
			generator,
			batchMoodPhysicalChangePrompt,
			builtPrompt,
			temperature,
			{ abortSignal },
		);

		if (!result.success || !result.data) {
			debugWarn('moodPhysicalChange batch extraction failed, falling back');
			const fallbackEvents: Event[] = [];
			for (const character of targetCharacters) {
				const events = await this.run(
					generator,
					context,
					settings,
					store,
					currentMessage,
					turnEvents,
					character,
					abortSignal,
				);
				fallbackEvents.push(...events);
			}
			return fallbackEvents;
		}

		const targetSet = new Set(targetCharacters.map(c => c.toLowerCase()));
		const events: Event[] = [];

		for (const extracted of result.data.characters) {
			if (!targetSet.has(extracted.character.toLowerCase())) continue;
			const priorCharacterState = priorProjection?.characters[extracted.character];

			const validatedMoodAdded = filterMoodsToAdd(
				extracted.moodAdded,
				priorCharacterState,
			);
			const validatedMoodRemoved = filterMoodsToRemove(
				extracted.moodRemoved,
				priorCharacterState,
			);
			const validatedPhysicalAdded = filterPhysicalToAdd(
				extracted.physicalAdded,
				priorCharacterState,
			);
			const validatedPhysicalRemoved = filterPhysicalToRemove(
				extracted.physicalRemoved,
				priorCharacterState,
			);

			if (
				validatedMoodAdded.length === 0 &&
				validatedMoodRemoved.length === 0 &&
				validatedPhysicalAdded.length === 0 &&
				validatedPhysicalRemoved.length === 0
			) {
				continue;
			}

			const validatedExtraction: ExtractedMoodPhysicalChange = {
				...extracted,
				moodAdded: validatedMoodAdded,
				moodRemoved: validatedMoodRemoved,
				physicalAdded: validatedPhysicalAdded,
				physicalRemoved: validatedPhysicalRemoved,
			};

			events.push(...mapMoodPhysicalChange(validatedExtraction, currentMessage));
		}

		return events;
	},
};
