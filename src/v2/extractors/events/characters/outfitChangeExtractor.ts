/**
 * Character Outfit Change Event Extractor
 *
 * A PerCharacterExtractor that detects when a specific character has clothing
 * items added or removed. Runs once for EACH present character.
 */

import type { Generator } from '../../../generator';
import type {
	PerCharacterExtractor,
	ExtractionContext,
	ExtractionSettings,
	RunStrategyContext,
} from '../../types';
import type { Event, MessageAndSwipe, ExtractedOutfitChange, OutfitSlot } from '../../../types';
import { outfitChangePrompt } from '../../../prompts/events/outfitChangePrompt';
import type { PromptTemplate } from '../../../prompts/types';
import { PLACEHOLDERS } from '../../../prompts/placeholders';
import {
	buildExtractorPrompt,
	generateAndParse,
	mapOutfitChange,
	evaluateRunStrategy,
	getPriorProjection,
	filterOutfitSlotsToRemove,
	filterOutfitSlotsToAdd,
	projectWithTurnEvents,
	getExtractorTemperature,
	limitMessageRange,
	getMaxMessages,
	formatCharacterState,
} from '../../utils';
import type { EventStore } from '../../../store';
import { debugWarn } from '../../../../utils/debug';
import { parseJsonResponse } from '../../../../utils/json';

interface ExtractedBatchOutfitChange {
	reasoning: string;
	characters: ExtractedOutfitChange[];
}

const batchOutfitChangePrompt: PromptTemplate<ExtractedBatchOutfitChange> = {
	name: 'outfit_change_batch',
	description: 'Extract outfit changes for multiple characters in one call',
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
			example: '## Elena\\nOutfit: ...',
		},
	],
	systemPrompt: `Detect outfit slot changes for MULTIPLE target characters.

Return strict JSON:
{
  "reasoning": "short summary",
  "characters": [
    {
      "character": "Name",
      "removed": ["slotName"],
      "added": {
        "torso": "item",
        "footwear": "item"
      }
    }
  ]
}

Rules:
- Include one object per target character.
- Use empty arrays/objects when no change.
- Slots must be one of: head, neck, jacket, back, torso, legs, footwear, socks, underwear.
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
						removed: { type: 'array', items: { type: 'string' } },
						added: { type: 'object', additionalProperties: { type: 'string' } },
					},
					required: ['character', 'removed', 'added'],
				},
			},
		},
		required: ['reasoning', 'characters'],
	},
	defaultTemperature: 0.5,
	parseResponse(response: string): ExtractedBatchOutfitChange | null {
		try {
			const parsed = parseJsonResponse<ExtractedBatchOutfitChange>(response, {
				shape: 'object',
				moduleName: 'outfit_change_batch',
			});
			if (!parsed || !Array.isArray(parsed.characters)) return null;
			return parsed;
		} catch {
			return null;
		}
	},
};

/**
 * Outfit change event extractor.
 * Detects clothing changes for a specific character and produces CharacterOutfitChangedEvent events.
 */
export const outfitChangeExtractor: PerCharacterExtractor<ExtractedOutfitChange> = {
	name: 'outfitChange',
	displayName: 'outfit',
	category: 'characters',
	defaultTemperature: 0.5,
	prompt: outfitChangePrompt,

	messageStrategy: { strategy: 'fixedNumber', n: 2 },
	runStrategy: { strategy: 'everyMessage' },

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

		// Calculate message range (last 2 messages)
		const messageCount = 2;
		let messageStart = Math.max(0, currentMessage.messageId - messageCount + 1);
		let messageEnd = currentMessage.messageId;

		// Apply message limiting
		const maxMessages = getMaxMessages(settings, this.name);
		({ messageStart, messageEnd } = limitMessageRange(
			messageStart,
			messageEnd,
			maxMessages,
		));

		// Build the prompt with target character and their current outfit
		const builtPrompt = buildExtractorPrompt(
			outfitChangePrompt,
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

		// Generate and parse the response
		const result = await generateAndParse(
			generator,
			outfitChangePrompt,
			builtPrompt,
			temperature,
			{ abortSignal },
		);

		// If parsing failed, return empty array
		if (!result.success || !result.data) {
			debugWarn(
				`outfitChange extraction failed for ${targetCharacter}:`,
				result.error,
			);
			return [];
		}

		const extraction = result.data;

		// Post-process to intercept common LLM mistakes:
		// If "added" values contain removal suffixes, move them to "removed" instead
		const removalSuffixes = [
			'(removed)',
			'(taken off)',
			'(undressed)',
			'(off)',
			'(discarded)',
			'(shed)',
			'(stripped)',
			'(gone)',
			'(pulled off)',
			'(slipped off)',
			'(tossed aside)',
		];

		const slotsToMoveToRemoved: OutfitSlot[] = [];
		const cleanedAdded: Partial<Record<OutfitSlot, string>> = {};

		if (extraction.added) {
			for (const [slot, value] of Object.entries(extraction.added)) {
				if (value && typeof value === 'string') {
					const lowerValue = value.toLowerCase();
					const hasRemovalSuffix = removalSuffixes.some(suffix =>
						lowerValue.includes(suffix),
					);
					if (hasRemovalSuffix) {
						// This was meant to be a removal, not an addition
						slotsToMoveToRemoved.push(slot as OutfitSlot);
					} else {
						cleanedAdded[slot as OutfitSlot] = value;
					}
				} else if (value !== null && value !== undefined) {
					cleanedAdded[slot as OutfitSlot] = value;
				}
			}
		}

		// Merge moved slots into removed array (avoiding duplicates)
		const mergedRemoved = [...(extraction.removed || [])];
		for (const slot of slotsToMoveToRemoved) {
			if (!mergedRemoved.includes(slot)) {
				mergedRemoved.push(slot);
			}
		}

		// Update extraction with cleaned data
		extraction.added = cleanedAdded;
		extraction.removed = mergedRemoved;

		// Validate and deduplicate against prior state
		const validatedRemoved = filterOutfitSlotsToRemove(
			extraction.removed,
			priorCharacterState,
		);
		const validatedAdded = filterOutfitSlotsToAdd(
			extraction.added,
			priorCharacterState,
		);

		// If no valid outfit changes after validation, return empty array
		if (validatedRemoved.length === 0 && Object.keys(validatedAdded).length === 0) {
			return [];
		}

		// Map validated extraction to events
		const validatedExtraction: ExtractedOutfitChange = {
			...extraction,
			removed: validatedRemoved,
			added: validatedAdded,
		};

		const events = mapOutfitChange(validatedExtraction, currentMessage);

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

		const messageCount = 2;
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
			batchOutfitChangePrompt,
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
			batchOutfitChangePrompt,
			builtPrompt,
			temperature,
			{ abortSignal },
		);

		if (!result.success || !result.data) {
			debugWarn('outfitChange batch extraction failed, falling back');
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

			const validatedRemoved = filterOutfitSlotsToRemove(
				extracted.removed,
				priorCharacterState,
			);
			const validatedAdded = filterOutfitSlotsToAdd(
				extracted.added,
				priorCharacterState,
			);

			if (validatedRemoved.length === 0 && Object.keys(validatedAdded).length === 0) {
				continue;
			}

			const validatedExtraction: ExtractedOutfitChange = {
				...extracted,
				removed: validatedRemoved,
				added: validatedAdded,
			};

			events.push(...mapOutfitChange(validatedExtraction, currentMessage));
		}

		return events;
	},
};
