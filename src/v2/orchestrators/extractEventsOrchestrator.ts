import type { Generator } from '../generator';
import type { EventStore } from '../store';
import type {
	ExtractionContext,
	ExtractionSettings,
	ExtractionResult,
	RunStrategyContext,
	ExtractorState,
	EventExtractor,
	PerCharacterExtractor,
	PerPairExtractor,
} from '../extractors/types';
import { createExtractorState } from '../extractors/types';
import type { Event, MessageAndSwipe } from '../types';
import { isCharacterAppearedEvent, isCharacterAkasAddEvent } from '../types';
import { sortPair } from '../types/snapshot';
import { buildSwipeContextFromExtraction } from '../extractors/utils';
import {
	buildAkaLookup,
	resolveNamesInEvents,
	applyUserMappings,
} from '../extractors/utils/resolveEventNames';
import { showUnresolvedNamePopup } from '../ui/unresolvedNamePopup';
import { generateEventId } from '../store/serialization';
import {
	coreEventExtractors,
	propsEventExtractors,
	narrativeEventExtractors,
	chapterEventExtractors,
	globalCharacterExtractors,
	perCharacterExtractors,
	globalRelationshipExtractors,
	perPairExtractors,
} from '../extractors/events';
import {
	startSection,
	completeSection,
	updateSectionLabel,
	recordSkippedExtractor,
} from '../extractors/progressTracker';
import { debugLog, errorLog } from '../../utils/debug';

/** State tracked for each extractor across turns */
const extractorStates: Map<string, ExtractorState> = new Map();

function getExtractorState(name: string): ExtractorState {
	if (!extractorStates.has(name)) {
		extractorStates.set(name, createExtractorState());
	}
	return extractorStates.get(name)!;
}

/**
 * Run asynchronous work with a fixed concurrency limit while preserving result order.
 */
async function mapWithConcurrency<T, R>(
	items: T[],
	maxConcurrency: number,
	worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];

	const concurrency = Math.min(Math.max(1, maxConcurrency), items.length);
	const results = new Array<R>(items.length);
	let nextIndex = 0;

	const runWorker = async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await worker(items[current], current);
		}
	};

	await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
	return results;
}

export function buildUniqueSortedPairs(characters: string[]): [string, string][] {
	const seen = new Set<string>();
	const pairs: [string, string][] = [];

	for (let i = 0; i < characters.length; i++) {
		for (let j = i + 1; j < characters.length; j++) {
			if (characters[i] === characters[j]) continue;
			const pair = sortPair(characters[i], characters[j]);
			const key = `${pair[0]}|${pair[1]}`;
			if (seen.has(key)) continue;
			seen.add(key);
			pairs.push(pair);
		}
	}

	return pairs;
}

/**
 * Run event extraction for a turn.
 */
export async function extractEvents(
	generator: Generator,
	context: ExtractionContext,
	settings: ExtractionSettings,
	store: EventStore,
	currentMessage: MessageAndSwipe,
	setStatus?: (status: string) => void,
	abortSignal?: AbortSignal,
): Promise<ExtractionResult> {
	const errors: Array<{ extractor: string; error: Error }> = [];
	const turnEvents: Event[] = [];
	let chapterEnded = false;

	// Build run strategy context
	const buildContext = (extractor: EventExtractor): RunStrategyContext => {
		const state = getExtractorState(extractor.name);
		return {
			store,
			context,
			settings,
			currentMessage,
			turnEvents,
			ranAtMessages: state.ranAtMessages,
			producedAtMessages: state.producedAtMessages,
		};
	};

	// Helper to run an extractor (progress is tracked at section level)
	async function runExtractor(extractor: EventExtractor): Promise<void> {
		const strategyContext = buildContext(extractor);
		if (!extractor.shouldRun(strategyContext)) {
			debugLog(`Skipping ${extractor.name} - shouldRun returned false`);
			recordSkippedExtractor(extractor.name, 'shouldRun=false');
			return;
		}

		const label = `Extracting ${extractor.displayName}...`;
		updateSectionLabel(label);
		setStatus?.(label);

		try {
			const events = await extractor.run(
				generator,
				context,
				settings,
				store,
				currentMessage,
				turnEvents,
				abortSignal,
			);

			// Update extractor state
			const state = getExtractorState(extractor.name);
			state.ranAtMessages.push(currentMessage);
			if (events.length > 0) {
				state.producedAtMessages.push(currentMessage);
				debugLog(`${extractor.name} produced ${events.length} events`);
			} else {
				debugLog(`${extractor.name} produced no events`);
			}

			// Add events to turn
			turnEvents.push(...events);
		} catch (error) {
			errorLog(`${extractor.name} failed:`, error);
			errors.push({
				extractor: extractor.name,
				error: error instanceof Error ? error : new Error(String(error)),
			});
		}
	}

	// Helper to run per-character extractor for all present characters
	async function runPerCharacter(extractor: PerCharacterExtractor): Promise<boolean> {
		const swipeContext = buildSwipeContextFromExtraction(context);
		const projection = store.projectStateAtMessage(
			currentMessage.messageId,
			swipeContext,
		);
		const characters = projection.charactersPresent;
		const maxConcurrent = Math.max(1, settings.maxConcurrentRequests ?? 1);

		// If extractor supports batch mode, prefer one call for all present characters
		if (extractor.runBatch && characters.length > 1) {
			const strategyContext = buildContext(extractor as any);
			if (!extractor.shouldRun(strategyContext)) {
				return false;
			}

			const label = `Extracting ${extractor.displayName} for ${characters.length} characters...`;
			updateSectionLabel(label);
			setStatus?.(label);

			try {
				const events = await extractor.runBatch(
					generator,
					context,
					settings,
					store,
					currentMessage,
					turnEvents,
					characters,
					abortSignal,
				);
				turnEvents.push(...events);
			} catch (error) {
				errorLog(`${extractor.name} (batch) failed:`, error);
				errors.push({
					extractor: `${extractor.name}:batch`,
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}

			if (abortSignal?.aborted) {
				return true;
			}
			return false;
		}

		if (maxConcurrent <= 1) {
			for (const character of characters) {
				// Check if aborted before each character
				if (abortSignal?.aborted) {
					return true; // Signal that we aborted
				}

				const strategyContext = buildContext(extractor as any);
				if (!extractor.shouldRun(strategyContext)) continue;

				const label = `Extracting ${extractor.displayName} for ${character}...`;
				updateSectionLabel(label);
				setStatus?.(label);

				try {
					const events = await extractor.run(
						generator,
						context,
						settings,
						store,
						currentMessage,
						turnEvents,
						character,
						abortSignal,
					);
					turnEvents.push(...events);
				} catch (error) {
					errorLog(`${extractor.name} (${character}) failed:`, error);
					errors.push({
						extractor: `${extractor.name}:${character}`,
						error:
							error instanceof Error
								? error
								: new Error(String(error)),
					});
				}
			}
			return false; // Not aborted
		}

		const strategyContext = buildContext(extractor as any);
		if (!extractor.shouldRun(strategyContext)) {
			recordSkippedExtractor(extractor.name, 'shouldRun=false');
			return false;
		}

		const snapshotTurnEvents = [...turnEvents];
		const results = await mapWithConcurrency(
			characters,
			maxConcurrent,
			async character => {
				const label = `Extracting ${extractor.displayName} for ${character}...`;
				updateSectionLabel(label);
				setStatus?.(label);

				try {
					const events = await extractor.run(
						generator,
						context,
						settings,
						store,
						currentMessage,
						snapshotTurnEvents,
						character,
						abortSignal,
					);
					return { character, events, error: null as Error | null };
				} catch (error) {
					return {
						character,
						events: [] as Event[],
						error: error instanceof Error ? error : new Error(String(error)),
					};
				}
			},
		);

		for (const result of results) {
			if (result.error) {
				errorLog(`${extractor.name} (${result.character}) failed:`, result.error);
				errors.push({
					extractor: `${extractor.name}:${result.character}`,
					error: result.error,
				});
				continue;
			}
			turnEvents.push(...result.events);
		}

		if (abortSignal?.aborted) {
			return true;
	}
	return false; // Not aborted
}

	// Helper to run per-pair extractor for all present pairs
	async function runPerPair(extractor: PerPairExtractor): Promise<boolean> {
		const swipeContext = buildSwipeContextFromExtraction(context);
		const projection = store.projectStateAtMessage(
			currentMessage.messageId,
			swipeContext,
		);
		const characters = projection.charactersPresent;
		const maxConcurrent = Math.max(1, settings.maxConcurrentRequests ?? 1);

	// Generate all unique sorted pairs and avoid duplicates
	const pairs = buildUniqueSortedPairs(characters);

		if (maxConcurrent <= 1) {
			for (const pair of pairs) {
				// Check if aborted before each pair
				if (abortSignal?.aborted) {
					return true; // Signal that we aborted
				}

				const strategyContext = buildContext(extractor as any);
				if (!extractor.shouldRun(strategyContext)) continue;

				const label = `Extracting ${extractor.displayName} for ${pair[0]} & ${pair[1]}...`;
				updateSectionLabel(label);
				setStatus?.(label);

				try {
					const events = await extractor.run(
						generator,
						context,
						settings,
						store,
						currentMessage,
						turnEvents,
						pair,
						abortSignal,
					);
					turnEvents.push(...events);
				} catch (error) {
					errorLog(`${extractor.name} (${pair.join('/')}) failed:`, error);
					errors.push({
						extractor: `${extractor.name}:${pair.join('/')}`,
						error:
							error instanceof Error
								? error
								: new Error(String(error)),
					});
				}
			}
			return false; // Not aborted
		}

		const strategyContext = buildContext(extractor as any);
		if (!extractor.shouldRun(strategyContext)) {
			recordSkippedExtractor(extractor.name, 'shouldRun=false');
			return false;
		}

		const snapshotTurnEvents = [...turnEvents];
		const results = await mapWithConcurrency(
			pairs,
			maxConcurrent,
			async pair => {
				const label = `Extracting ${extractor.displayName} for ${pair[0]} & ${pair[1]}...`;
				updateSectionLabel(label);
				setStatus?.(label);

				try {
					const events = await extractor.run(
						generator,
						context,
						settings,
						store,
						currentMessage,
						snapshotTurnEvents,
						pair,
						abortSignal,
					);
					return { pair, events, error: null as Error | null };
				} catch (error) {
					return {
						pair,
						events: [] as Event[],
						error: error instanceof Error ? error : new Error(String(error)),
					};
				}
			},
		);

		for (const result of results) {
			if (result.error) {
				errorLog(`${extractor.name} (${result.pair.join('/')}) failed:`, result.error);
				errors.push({
					extractor: `${extractor.name}:${result.pair.join('/')}`,
					error: result.error,
				});
				continue;
			}
			turnEvents.push(...result.events);
		}

		if (abortSignal?.aborted) {
			return true;
		}
		return false; // Not aborted
	}

	// Helper to create aborted result (no events saved)
	const abortedResult = (): ExtractionResult => ({
		store,
		newEvents: [],
		chapterEnded: false,
		errors,
		aborted: true,
	});

	// Run extractors in phases (sections)

	// Section: Core extractors (time, location, climate, topic/tone, tension)
	if (abortSignal?.aborted) return abortedResult();
	startSection('core', 'Extracting core state...');
	for (const extractor of coreEventExtractors) {
		await runExtractor(extractor);
		if (abortSignal?.aborted) {
			completeSection('core');
			return abortedResult();
		}
	}
	completeSection('core');

	// Section: Character presence (global)
	if (abortSignal?.aborted) return abortedResult();
	startSection('characterPresence', 'Detecting character presence...');
	for (const extractor of globalCharacterExtractors) {
		await runExtractor(extractor);
		if (abortSignal?.aborted) {
			completeSection('characterPresence');
			return abortedResult();
		}
	}
	completeSection('characterPresence');

	// Section: Per-character extractors (includes outfit changes)
	if (abortSignal?.aborted) return abortedResult();
	startSection('perCharacter', 'Extracting character states...');
	for (const extractor of perCharacterExtractors) {
		const wasAborted = await runPerCharacter(extractor);
		if (wasAborted || abortSignal?.aborted) {
			completeSection('perCharacter');
			return abortedResult();
		}
	}
	completeSection('perCharacter');

	// Section: Props extractors (runs AFTER outfit changes to integrate clothing as props)
	if (abortSignal?.aborted) return abortedResult();
	startSection('props', 'Extracting props changes...');
	for (const extractor of propsEventExtractors) {
		await runExtractor(extractor);
		if (abortSignal?.aborted) {
			completeSection('props');
			return abortedResult();
		}
	}
	completeSection('props');

	// Section: Relationship subjects (global)
	if (abortSignal?.aborted) return abortedResult();
	startSection('relationshipSubjects', 'Extracting relationship subjects...');
	for (const extractor of globalRelationshipExtractors) {
		await runExtractor(extractor);
		if (abortSignal?.aborted) {
			completeSection('relationshipSubjects');
			return abortedResult();
		}
	}
	completeSection('relationshipSubjects');

	// Section: Per-pair relationship extractors
	if (abortSignal?.aborted) return abortedResult();
	startSection('perPair', 'Extracting relationship details...');
	for (const extractor of perPairExtractors) {
		const wasAborted = await runPerPair(extractor);
		if (wasAborted || abortSignal?.aborted) {
			completeSection('perPair');
			return abortedResult();
		}
	}
	completeSection('perPair');

	// Section: Narrative extractors
	if (abortSignal?.aborted) return abortedResult();
	startSection('narrative', 'Extracting narrative...');
	for (const extractor of narrativeEventExtractors) {
		await runExtractor(extractor);
		if (abortSignal?.aborted) {
			completeSection('narrative');
			return abortedResult();
		}
	}
	completeSection('narrative');

	// Section: Chapter extractors
	if (abortSignal?.aborted) return abortedResult();
	startSection('chapter', 'Checking chapter boundaries...');
	for (const extractor of chapterEventExtractors) {
		await runExtractor(extractor);
		if (abortSignal?.aborted) {
			completeSection('chapter');
			return abortedResult();
		}
	}
	completeSection('chapter');

	// Check if chapter ended
	chapterEnded = turnEvents.some(
		e => e.kind === 'chapter' && 'subkind' in e && e.subkind === 'ended',
	);

	// --- Post-extraction name resolution ---
	// Build AKA lookup from current projection + new characters in turnEvents
	const swipeContext = buildSwipeContextFromExtraction(context);
	const projection = store.projectStateAtMessage(currentMessage.messageId, swipeContext);
	const akaLookup = buildAkaLookup(projection.characters);

	// Add AKAs from akas_add events in turnEvents (not yet applied to projection)
	for (const event of turnEvents) {
		if (isCharacterAkasAddEvent(event)) {
			for (const aka of event.akas) {
				akaLookup.set(aka.toLowerCase(), event.character);
			}
			akaLookup.set(event.character.toLowerCase(), event.character);
		}
	}

	// Also include newly appeared character names
	const allCanonicalNames = Object.keys(projection.characters);
	for (const event of turnEvents) {
		if (
			isCharacterAppearedEvent(event) &&
			!allCanonicalNames.includes(event.character)
		) {
			allCanonicalNames.push(event.character);
			akaLookup.set(event.character.toLowerCase(), event.character);
		}
	}

	const { unresolvedNames } = resolveNamesInEvents(turnEvents, akaLookup, allCanonicalNames);

	if (unresolvedNames.length > 0) {
		const mappings = await showUnresolvedNamePopup(unresolvedNames, allCanonicalNames);
		applyUserMappings(turnEvents, mappings);

		// Persist user-mapped names as AKAs for future resolution
		for (const mapping of mappings) {
			if (mapping.resolvedTo) {
				const existingChar = projection.characters[mapping.resolvedTo];
				const existingAkas = existingChar?.akas ?? [];
				turnEvents.push({
					id: generateEventId(),
					source: currentMessage,
					timestamp: Date.now(),
					kind: 'character',
					subkind: 'akas_add',
					character: mapping.resolvedTo,
					akas: [
						...new Set([
							...existingAkas,
							mapping.unresolvedName,
						]),
					],
				});
			}
		}
	}

	// Debug: Log extracted events by kind
	const eventsByKind: Record<string, number> = {};
	for (const e of turnEvents) {
		const key = 'subkind' in e ? `${e.kind}:${e.subkind}` : e.kind;
		eventsByKind[key] = (eventsByKind[key] || 0) + 1;
	}
	debugLog(
		`extractEvents: ${turnEvents.length} events extracted for msg ${currentMessage.messageId} swipe ${currentMessage.swipeId}:`,
		eventsByKind,
	);

	// Add events to store
	store.appendEvents(turnEvents);

	return {
		store,
		newEvents: turnEvents,
		chapterEnded,
		errors,
	};
}

/**
 * Reset extractor states (for testing or fresh start).
 */
export function resetExtractorStates(): void {
	extractorStates.clear();
}
