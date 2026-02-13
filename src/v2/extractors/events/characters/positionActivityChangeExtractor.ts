/**
 * Combined Position and Activity Change Event Extractor
 *
 * Extracts both position and activity changes in a single LLM call for efficiency.
 * This is a per-character extractor that runs once for each present character.
 */

import type { Generator } from '../../../generator';
import type {
	Event,
	CharacterPositionChangedEvent,
	CharacterActivityChangedEvent,
	MessageAndSwipe,
} from '../../../types';
import type { ExtractedPositionActivityChange } from '../../../types/extraction';
import type {
	PerCharacterExtractor,
	ExtractionContext,
	ExtractionSettings,
	RunStrategyContext,
} from '../../types';
import { getMessageCount } from '../../types';
import { positionActivityChangePrompt } from '../../../prompts/events/positionActivityChangePrompt';
import type { PromptTemplate } from '../../../prompts/types';
import { PLACEHOLDERS } from '../../../prompts/placeholders';
import {
	buildExtractorPrompt,
	generateAndParse,
	evaluateRunStrategy,
	projectWithTurnEvents,
	mapPositionActivityChange,
	getExtractorTemperature,
	limitMessageRange,
	getMaxMessages,
	formatCharacterState,
} from '../../utils';
import type { EventStore } from '../../../store';
import { debugWarn } from '../../../../utils/debug';
import { parseJsonResponse } from '../../../../utils/json';

interface ExtractedBatchPositionActivityChange {
	reasoning: string;
	characters: ExtractedPositionActivityChange[];
}

const batchPositionActivityChangePrompt: PromptTemplate<ExtractedBatchPositionActivityChange> = {
	name: 'position_activity_change_batch',
	description: 'Extract position/activity changes for multiple characters in one call',
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
			example: '## Elena\\nPosition: ...\\nActivity: ...',
		},
	],
	systemPrompt: `You analyze roleplay messages and detect position/activity changes for MULTIPLE target characters.

Return strict JSON:
{
  "reasoning": "short summary",
  "characters": [
    {
      "character": "Name",
      "positionChanged": true/false,
      "newPosition": "required when positionChanged=true",
      "activityChanged": true/false,
      "newActivity": "string or null, required when activityChanged=true"
    }
  ]
}

Rules:
- Include one object per target character from the provided list.
- If no change for a character, set both changed flags to false.
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
						positionChanged: { type: 'boolean' },
						newPosition: { type: 'string' },
						activityChanged: { type: 'boolean' },
						newActivity: { type: 'string' },
					},
					required: ['character', 'positionChanged', 'activityChanged'],
				},
			},
		},
		required: ['reasoning', 'characters'],
	},
	defaultTemperature: 0.5,
	parseResponse(response: string): ExtractedBatchPositionActivityChange | null {
		try {
			const parsed = parseJsonResponse<ExtractedBatchPositionActivityChange>(response, {
				shape: 'object',
				moduleName: 'position_activity_change_batch',
			});
			if (!parsed || !Array.isArray(parsed.characters)) return null;
			return parsed;
		} catch {
			return null;
		}
	},
};

/**
 * Combined position and activity change per-character extractor.
 *
 * Detects when a character's position and/or activity changes,
 * extracting both in a single LLM call for better performance.
 */
export const positionActivityChangeExtractor: PerCharacterExtractor<ExtractedPositionActivityChange> =
	{
		name: 'positionActivityChange',
		displayName: 'position & activity',
		category: 'characters',
		defaultTemperature: 0.5,
		prompt: positionActivityChangePrompt,

		// Messages since last position/activity event
		messageStrategy: {
			strategy: 'sinceLastEventOfKind',
			kinds: [
				{ kind: 'character', subkind: 'position_changed' },
				{ kind: 'character', subkind: 'activity_changed' },
			],
		},
		// Every 2 messages starting at 1 (assistant messages in normal chat)
		runStrategy: { strategy: 'everyNMessages', n: 2, offset: 1 },

		shouldRun(context: RunStrategyContext): boolean {
			// Run if character tracking is enabled AND run strategy allows it
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
			// Get current state by projecting including turn events
			const projection = projectWithTurnEvents(
				store,
				turnEvents,
				currentMessage.messageId,
				context,
			);

			// Get the character's current state from the projection
			const characterState = projection.characters[targetCharacter];
			if (!characterState) {
				debugWarn(
					`positionActivityChange: Character "${targetCharacter}" not found in projection`,
				);
				return [];
			}

			// Calculate message range based on strategy (since last position/activity event)
			const messageCount = getMessageCount(
				this.messageStrategy,
				store,
				currentMessage,
			);
			let messageStart = Math.max(0, currentMessage.messageId - messageCount + 1);
			let messageEnd = currentMessage.messageId;

			// Apply message limiting
			const maxMessages = getMaxMessages(settings, this.name);
			({ messageStart, messageEnd } = limitMessageRange(
				messageStart,
				messageEnd,
				maxMessages,
			));

			// Build the prompt with target character context
			const builtPrompt = buildExtractorPrompt(
				positionActivityChangePrompt,
				context,
				projection,
				settings,
				messageStart,
				messageEnd,
				{
					targetCharacter,
				},
			);

			// Get temperature (prompt override → category → default)
			const temperature = getExtractorTemperature(
				settings,
				this.prompt.name,
				'characters',
				this.defaultTemperature,
			);

			// Generate and parse the response
			const result = await generateAndParse(
				generator,
				positionActivityChangePrompt,
				builtPrompt,
				temperature,
				{ abortSignal },
			);

			// If parsing failed, return empty array
			if (!result.success || !result.data) {
				debugWarn(
					'positionActivityChange extraction failed:',
					result.error,
				);
				return [];
			}

			// If no changes detected, return empty
			if (!result.data.positionChanged && !result.data.activityChanged) {
				return [];
			}

			// Map the extraction to events
			const events = mapPositionActivityChange(result.data, currentMessage);

			// Add previous values to events for context
			for (const event of events) {
				if (
					event.kind === 'character' &&
					event.subkind === 'position_changed' &&
					characterState.position
				) {
					(event as CharacterPositionChangedEvent).previousValue =
						characterState.position;
				}
				if (
					event.kind === 'character' &&
					event.subkind === 'activity_changed' &&
					characterState.activity
				) {
					(event as CharacterActivityChangedEvent).previousValue =
						characterState.activity;
				}
			}

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
				batchPositionActivityChangePrompt,
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
				batchPositionActivityChangePrompt,
				builtPrompt,
				temperature,
				{ abortSignal },
			);

			if (!result.success || !result.data) {
				debugWarn('positionActivityChange batch extraction failed, falling back');
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
				if (!extracted.positionChanged && !extracted.activityChanged) continue;

				const mapped = mapPositionActivityChange(extracted, currentMessage);
				const characterState = projection.characters[extracted.character];

				for (const event of mapped) {
					if (
						event.kind === 'character' &&
						event.subkind === 'position_changed' &&
						characterState?.position
					) {
						(event as CharacterPositionChangedEvent).previousValue =
							characterState.position;
					}
					if (
						event.kind === 'character' &&
						event.subkind === 'activity_changed' &&
						characterState?.activity
					) {
						(event as CharacterActivityChangedEvent).previousValue =
							characterState.activity;
					}
				}

				events.push(...mapped);
			}

			return events;
		},
	};
