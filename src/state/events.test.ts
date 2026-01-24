import { describe, it, expect } from 'vitest';
import {
	createEvent,
	formatEventsForInjection,
	formatEventTimestamp,
	getAbsentWitnesses,
	getAllWitnesses,
	filterEventsByTensionType,
	filterEventsByTensionLevel,
	getRelationshipEvents,
	getEventsForPair,
} from './events';
import type { TimestampedEvent, NarrativeDateTime } from '../types/state';

const baseTimestamp: NarrativeDateTime = {
	year: 2024,
	month: 6,
	day: 15,
	hour: 14,
	minute: 30,
	second: 0,
	dayOfWeek: 'Saturday',
};

describe('createEvent', () => {
	it('creates event with all fields populated', () => {
		const event = createEvent({
			timestamp: baseTimestamp,
			summary: 'Alice revealed her secret',
			tensionType: 'vulnerable',
			tensionLevel: 'charged',
			witnesses: ['Alice', 'Bob'],
			location: {
				area: 'Downtown',
				place: 'Coffee Shop',
				position: 'Corner',
				props: [],
			},
			relationshipSignal: {
				pair: ['Alice', 'Bob'],
				changes: [{ from: 'Alice', toward: 'Bob', feeling: 'trust' }],
			},
		});

		expect(event.timestamp).toEqual(baseTimestamp);
		expect(event.summary).toBe('Alice revealed her secret');
		expect(event.tensionType).toBe('vulnerable');
		expect(event.tensionLevel).toBe('charged');
		expect(event.witnesses).toEqual(['Alice', 'Bob']);
		expect(event.location).toBe('Downtown - Coffee Shop');
		expect(event.relationshipSignal).toBeDefined();
	});

	it('creates event with string location', () => {
		const event = createEvent({
			timestamp: baseTimestamp,
			summary: 'Something happened',
			tensionType: 'conversation',
			tensionLevel: 'relaxed',
			witnesses: [],
			location: 'The Park',
		});

		expect(event.location).toBe('The Park');
	});

	it('creates event without relationship signal', () => {
		const event = createEvent({
			timestamp: baseTimestamp,
			summary: 'Something happened',
			tensionType: 'conversation',
			tensionLevel: 'relaxed',
			witnesses: [],
			location: 'The Park',
		});

		expect(event.relationshipSignal).toBeUndefined();
	});

	it('creates event with empty witnesses', () => {
		const event = createEvent({
			timestamp: baseTimestamp,
			summary: 'Something happened alone',
			tensionType: 'suspense',
			tensionLevel: 'guarded',
			witnesses: [],
			location: 'Forest',
		});

		expect(event.witnesses).toEqual([]);
	});
});

describe('formatEventsForInjection', () => {
	const createTestEvent = (
		summary: string,
		witnesses: string[] = ['Alice', 'Bob'],
	): TimestampedEvent => ({
		timestamp: baseTimestamp,
		summary,
		eventTypes: ['conversation'],
		tensionType: 'conversation',
		tensionLevel: 'relaxed',
		witnesses,
		location: 'Downtown - Coffee Shop',
	});

	it('returns message for empty events', () => {
		expect(formatEventsForInjection([])).toBe('No recent events.');
	});

	it('formats single event', () => {
		const events = [createTestEvent('Alice met Bob')];
		const result = formatEventsForInjection(events);

		expect(result).toContain('Alice met Bob');
		expect(result).toContain('Sat 2:30 PM');
		expect(result).toContain('relaxed conversation');
		expect(result).toContain('Witnesses: Alice, Bob');
		expect(result).toContain('Location: Downtown - Coffee Shop');
	});

	it('respects limit', () => {
		const events = [
			createTestEvent('First event'),
			createTestEvent('Second event'),
			createTestEvent('Third event'),
		];
		const result = formatEventsForInjection(events, 2);

		expect(result).not.toContain('First event');
		expect(result).toContain('Second event');
		expect(result).toContain('Third event');
	});

	it('includes witness absence notes', () => {
		const events = [createTestEvent('Secret meeting', ['Alice', 'Bob'])];
		const result = formatEventsForInjection(events, undefined, ['Alice']);

		expect(result).toContain('Alice');
		expect(result).toContain('Bob (not present)');
	});
});

describe('formatEventTimestamp', () => {
	it('formats morning time', () => {
		const dt: NarrativeDateTime = { ...baseTimestamp, hour: 9, minute: 15 };
		expect(formatEventTimestamp(dt)).toBe('Sat 9:15 AM');
	});

	it('formats afternoon time', () => {
		expect(formatEventTimestamp(baseTimestamp)).toBe('Sat 2:30 PM');
	});

	it('formats midnight', () => {
		const dt: NarrativeDateTime = { ...baseTimestamp, hour: 0, minute: 0 };
		expect(formatEventTimestamp(dt)).toBe('Sat 12:00 AM');
	});

	it('formats noon', () => {
		const dt: NarrativeDateTime = { ...baseTimestamp, hour: 12, minute: 0 };
		expect(formatEventTimestamp(dt)).toBe('Sat 12:00 PM');
	});

	it('handles different days of week', () => {
		const monday: NarrativeDateTime = { ...baseTimestamp, dayOfWeek: 'Monday' };
		expect(formatEventTimestamp(monday)).toBe('Mon 2:30 PM');

		const wednesday: NarrativeDateTime = { ...baseTimestamp, dayOfWeek: 'Wednesday' };
		expect(formatEventTimestamp(wednesday)).toBe('Wed 2:30 PM');
	});
});

describe('getAbsentWitnesses', () => {
	const event: TimestampedEvent = {
		timestamp: baseTimestamp,
		summary: 'Event',
		eventTypes: ['conversation'],
		tensionType: 'conversation',
		tensionLevel: 'relaxed',
		witnesses: ['Alice', 'Bob', 'Charlie'],
		location: 'Place',
	};

	it('returns all witnesses when none present', () => {
		const result = getAbsentWitnesses(event, []);
		expect(result).toEqual(['Alice', 'Bob', 'Charlie']);
	});

	it('returns empty when all present', () => {
		const result = getAbsentWitnesses(event, ['Alice', 'Bob', 'Charlie']);
		expect(result).toEqual([]);
	});

	it('returns only absent witnesses', () => {
		const result = getAbsentWitnesses(event, ['Alice']);
		expect(result).toEqual(['Bob', 'Charlie']);
	});

	it('is case-insensitive', () => {
		const result = getAbsentWitnesses(event, ['ALICE', 'bob']);
		expect(result).toEqual(['Charlie']);
	});
});

describe('getAllWitnesses', () => {
	it('returns empty for no events', () => {
		expect(getAllWitnesses([])).toEqual([]);
	});

	it('returns unique witnesses', () => {
		const events: TimestampedEvent[] = [
			{
				timestamp: baseTimestamp,
				summary: 'Event 1',
				eventTypes: ['conversation'],
				tensionType: 'conversation',
				tensionLevel: 'relaxed',
				witnesses: ['Alice', 'Bob'],
				location: 'Place',
			},
			{
				timestamp: baseTimestamp,
				summary: 'Event 2',
				eventTypes: ['conversation'],
				tensionType: 'conversation',
				tensionLevel: 'relaxed',
				witnesses: ['Bob', 'Charlie'],
				location: 'Place',
			},
		];

		const result = getAllWitnesses(events);
		expect(result).toHaveLength(3);
		expect(result).toContain('Alice');
		expect(result).toContain('Bob');
		expect(result).toContain('Charlie');
	});
});

describe('filterEventsByTensionType', () => {
	function createBaseEvent(): TimestampedEvent {
		return {
			timestamp: baseTimestamp,
			summary: 'Event',
			eventTypes: ['conversation'],
			tensionType: 'conversation',
			tensionLevel: 'relaxed',
			witnesses: [],
			location: 'Place',
		};
	}

	const events: TimestampedEvent[] = [
		{ ...createBaseEvent(), tensionType: 'conversation' },
		{ ...createBaseEvent(), tensionType: 'intimate' },
		{ ...createBaseEvent(), tensionType: 'confrontation' },
		{ ...createBaseEvent(), tensionType: 'intimate' },
	];

	it('filters by single type', () => {
		const result = filterEventsByTensionType(events, ['intimate']);
		expect(result).toHaveLength(2);
		expect(result.every(e => e.tensionType === 'intimate')).toBe(true);
	});

	it('filters by multiple types', () => {
		const result = filterEventsByTensionType(events, ['intimate', 'confrontation']);
		expect(result).toHaveLength(3);
	});

	it('returns empty for no matches', () => {
		const result = filterEventsByTensionType(events, ['suspense']);
		expect(result).toHaveLength(0);
	});
});

describe('filterEventsByTensionLevel', () => {
	function createBaseEvent(): TimestampedEvent {
		return {
			timestamp: baseTimestamp,
			summary: 'Event',
			eventTypes: ['conversation'],
			tensionType: 'conversation',
			tensionLevel: 'relaxed',
			witnesses: [],
			location: 'Place',
		};
	}

	const events: TimestampedEvent[] = [
		{ ...createBaseEvent(), tensionLevel: 'relaxed' },
		{ ...createBaseEvent(), tensionLevel: 'guarded' },
		{ ...createBaseEvent(), tensionLevel: 'tense' },
		{ ...createBaseEvent(), tensionLevel: 'explosive' },
	];

	it('filters events at or above level', () => {
		const result = filterEventsByTensionLevel(events, 'guarded');
		expect(result).toHaveLength(3);
	});

	it('includes all for relaxed', () => {
		const result = filterEventsByTensionLevel(events, 'relaxed');
		expect(result).toHaveLength(4);
	});

	it('returns only explosive for explosive', () => {
		const result = filterEventsByTensionLevel(events, 'explosive');
		expect(result).toHaveLength(1);
	});
});

describe('getRelationshipEvents', () => {
	it('returns only events with relationship signals', () => {
		const events: TimestampedEvent[] = [
			{
				timestamp: baseTimestamp,
				summary: 'Event 1',
				eventTypes: ['conversation'],
				tensionType: 'conversation',
				tensionLevel: 'relaxed',
				witnesses: [],
				location: 'Place',
			},
			{
				timestamp: baseTimestamp,
				summary: 'Event 2',
				eventTypes: ['intimate_kiss'],
				tensionType: 'intimate',
				tensionLevel: 'charged',
				witnesses: [],
				location: 'Place',
				relationshipSignal: {
					pair: ['Alice', 'Bob'],
					changes: [],
				},
			},
		];

		const result = getRelationshipEvents(events);
		expect(result).toHaveLength(1);
		expect(result[0].summary).toBe('Event 2');
	});
});

describe('getEventsForPair', () => {
	const events: TimestampedEvent[] = [
		{
			timestamp: baseTimestamp,
			summary: 'Alice-Bob event',
			eventTypes: ['conversation'],
			tensionType: 'conversation',
			tensionLevel: 'relaxed',
			witnesses: [],
			location: 'Place',
			relationshipSignal: { pair: ['Alice', 'Bob'], changes: [] },
		},
		{
			timestamp: baseTimestamp,
			summary: 'Charlie-Bob event',
			eventTypes: ['conversation'],
			tensionType: 'conversation',
			tensionLevel: 'relaxed',
			witnesses: [],
			location: 'Place',
			relationshipSignal: { pair: ['Bob', 'Charlie'], changes: [] },
		},
		{
			timestamp: baseTimestamp,
			summary: 'No signal event',
			eventTypes: ['conversation'],
			tensionType: 'conversation',
			tensionLevel: 'relaxed',
			witnesses: [],
			location: 'Place',
		},
	];

	it('finds events for pair regardless of order', () => {
		const result1 = getEventsForPair(events, 'Alice', 'Bob');
		const result2 = getEventsForPair(events, 'Bob', 'Alice');

		expect(result1).toHaveLength(1);
		expect(result2).toHaveLength(1);
		expect(result1[0].summary).toBe('Alice-Bob event');
	});

	it('is case-insensitive', () => {
		const result = getEventsForPair(events, 'ALICE', 'bob');
		expect(result).toHaveLength(1);
	});

	it('returns empty for non-existent pair', () => {
		const result = getEventsForPair(events, 'Alice', 'Charlie');
		expect(result).toHaveLength(0);
	});
});
