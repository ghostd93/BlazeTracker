// ============================================
// Event Utility Functions
// ============================================

import type {
	TimestampedEvent,
	NarrativeDateTime,
	TensionType,
	TensionLevel,
	RelationshipSignal,
	LocationState,
	EventType,
} from '../types/state';

// ============================================
// Event Creation
// ============================================

export interface CreateEventParams {
	timestamp: NarrativeDateTime;
	summary: string;
	eventTypes?: EventType[];
	tensionType: TensionType;
	tensionLevel: TensionLevel;
	witnesses: string[];
	location: LocationState | string;
	relationshipSignal?: RelationshipSignal;
}

/**
 * Create a TimestampedEvent from parameters.
 */
export function createEvent(params: CreateEventParams): TimestampedEvent {
	const locationStr =
		typeof params.location === 'string'
			? params.location
			: `${params.location.area} - ${params.location.place}`;

	return {
		timestamp: params.timestamp,
		summary: params.summary,
		eventTypes: params.eventTypes ?? ['conversation'],
		tensionType: params.tensionType,
		tensionLevel: params.tensionLevel,
		witnesses: params.witnesses,
		location: locationStr,
		relationshipSignal: params.relationshipSignal,
	};
}

// ============================================
// Formatting
// ============================================

/**
 * Format events for injection into prompts.
 * @param events Array of events to format
 * @param limit Maximum number of events to include (most recent)
 * @param presentCharacters Characters currently present (for witness absence notes)
 */
export function formatEventsForInjection(
	events: TimestampedEvent[],
	limit?: number,
	presentCharacters?: string[],
): string {
	if (events.length === 0) {
		return 'No recent events.';
	}

	const toFormat = limit ? events.slice(-limit) : events;
	const presentSet = presentCharacters
		? new Set(presentCharacters.map(c => c.toLowerCase()))
		: null;

	return toFormat
		.map((event, _index) => {
			const lines: string[] = [];

			// Event header with timestamp
			lines.push(`[${formatEventTimestamp(event.timestamp)}]`);

			// Summary
			lines.push(event.summary);

			// Tension info
			lines.push(`Tension: ${event.tensionLevel} ${event.tensionType}`);

			// Witnesses with absence notes
			if (event.witnesses.length > 0) {
				const witnessNotes: string[] = [];
				for (const witness of event.witnesses) {
					if (presentSet && !presentSet.has(witness.toLowerCase())) {
						witnessNotes.push(`${witness} (not present)`);
					} else {
						witnessNotes.push(witness);
					}
				}
				lines.push(`Witnesses: ${witnessNotes.join(', ')}`);
			}

			// Location
			lines.push(`Location: ${event.location}`);

			return lines.join('\n');
		})
		.join('\n\n');
}

/**
 * Format an event timestamp for display (compact format).
 */
export function formatEventTimestamp(dt: NarrativeDateTime): string {
	const hour12 = dt.hour % 12 || 12;
	const ampm = dt.hour < 12 ? 'AM' : 'PM';
	const minute = dt.minute.toString().padStart(2, '0');

	// Shorter day names
	const dayAbbrev: Record<string, string> = {
		Monday: 'Mon',
		Tuesday: 'Tue',
		Wednesday: 'Wed',
		Thursday: 'Thu',
		Friday: 'Fri',
		Saturday: 'Sat',
		Sunday: 'Sun',
	};

	const day = dayAbbrev[dt.dayOfWeek] || dt.dayOfWeek.slice(0, 3);

	return `${day} ${hour12}:${minute} ${ampm}`;
}

/**
 * Format a single event for display.
 */
export function formatEvent(event: TimestampedEvent): string {
	return `[${formatEventTimestamp(event.timestamp)}] ${event.summary} (${event.tensionLevel} ${event.tensionType})`;
}

// ============================================
// Event Analysis
// ============================================

/**
 * Get witnesses who are not currently present (for dramatic irony).
 */
export function getAbsentWitnesses(event: TimestampedEvent, presentCharacters: string[]): string[] {
	const presentSet = new Set(presentCharacters.map(c => c.toLowerCase()));
	return event.witnesses.filter(w => !presentSet.has(w.toLowerCase()));
}

/**
 * Get all unique witnesses across multiple events.
 */
export function getAllWitnesses(events: TimestampedEvent[]): string[] {
	const witnesses = new Set<string>();
	for (const event of events) {
		for (const witness of event.witnesses) {
			witnesses.add(witness);
		}
	}
	return Array.from(witnesses);
}

/**
 * Filter events by tension type.
 */
export function filterEventsByTensionType(
	events: TimestampedEvent[],
	types: TensionType[],
): TimestampedEvent[] {
	const typeSet = new Set(types);
	return events.filter(e => typeSet.has(e.tensionType));
}

/**
 * Filter events by tension level (at or above).
 */
export function filterEventsByTensionLevel(
	events: TimestampedEvent[],
	minLevel: TensionLevel,
): TimestampedEvent[] {
	const levels: TensionLevel[] = [
		'relaxed',
		'aware',
		'guarded',
		'tense',
		'charged',
		'volatile',
		'explosive',
	];

	const minIndex = levels.indexOf(minLevel);
	return events.filter(e => levels.indexOf(e.tensionLevel) >= minIndex);
}

/**
 * Get events with relationship signals.
 */
export function getRelationshipEvents(events: TimestampedEvent[]): TimestampedEvent[] {
	return events.filter(e => e.relationshipSignal !== undefined);
}

/**
 * Find events involving a specific character pair.
 */
export function getEventsForPair(
	events: TimestampedEvent[],
	char1: string,
	char2: string,
): TimestampedEvent[] {
	const pair = [char1.toLowerCase(), char2.toLowerCase()].sort();

	return events.filter(e => {
		if (!e.relationshipSignal) return false;
		const signalPair = e.relationshipSignal.pair.map(p => p.toLowerCase()).sort();
		return signalPair[0] === pair[0] && signalPair[1] === pair[1];
	});
}
