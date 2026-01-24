// ============================================
// Event Extractor Tests
// ============================================

import { describe, it, expect } from 'vitest';
import type { Relationship, MilestoneType, EventType, NarrativeDateTime } from '../types/state';

// Test timestamp for milestone creation
const testTimestamp: NarrativeDateTime = {
	year: 2024,
	month: 6,
	day: 15,
	hour: 14,
	minute: 30,
	second: 0,
	dayOfWeek: 'Saturday',
};

// Helper to create a test relationship
function createTestRelationship(
	char1: string,
	char2: string,
	milestoneTypes: MilestoneType[] = [],
): Relationship {
	return {
		pair: [char1, char2] as [string, string],
		status: 'friendly',
		aToB: { feelings: [], secrets: [], wants: [] },
		bToA: { feelings: [], secrets: [], wants: [] },
		milestones: milestoneTypes.map(type => ({
			type,
			description: `Test milestone for ${type}`,
			timestamp: testTimestamp,
			location: 'Test Location, Test Area',
		})),
		history: [],
		versions: [],
	};
}

// Map from extractEvent.ts
const EVENT_TYPE_TO_MILESTONE: Partial<Record<EventType, MilestoneType>> = {
	// Bonding
	laugh: 'first_laugh',
	gift: 'first_gift',
	date: 'first_date',
	i_love_you: 'first_i_love_you',
	sleepover: 'first_sleepover',
	shared_meal: 'first_shared_meal',
	// Physical intimacy
	intimate_touch: 'first_touch',
	intimate_kiss: 'first_kiss',
	intimate_embrace: 'first_embrace',
	intimate_heated: 'first_heated',
	// Sexual milestones (atomic)
	intimate_foreplay: 'first_foreplay',
	intimate_oral: 'first_oral',
	intimate_manual: 'first_manual',
	intimate_penetrative: 'first_penetrative',
	intimate_climax: 'first_climax',
	// Emotional
	confession: 'confession',
	secret_shared: 'secret_shared',
	secret_revealed: 'secret_revealed',
	// Commitment
	promise: 'promise_made',
	betrayal: 'betrayal',
	// Life events
	exclusivity: 'promised_exclusivity',
	marriage: 'marriage',
	pregnancy: 'pregnancy',
	childbirth: 'had_child',
	// Conflicts
	argument: 'first_conflict',
	combat: 'first_conflict',
};

// Simulate the milestone inference logic from extractEvent.ts (returns array now)
function inferMilestoneTypes(
	eventTypes: EventType[],
	existingMilestones: MilestoneType[],
	hasExistingRelationship: boolean,
): MilestoneType[] {
	const existingSet = new Set(existingMilestones);
	const milestones: MilestoneType[] = [];
	const addedTypes = new Set<MilestoneType>();

	// Check for first_meeting if no existing relationship
	if (!hasExistingRelationship && !existingSet.has('first_meeting')) {
		milestones.push('first_meeting');
		addedTypes.add('first_meeting');
	}

	// Check all event types for potential milestones
	for (const eventType of eventTypes) {
		const milestoneType = EVENT_TYPE_TO_MILESTONE[eventType];
		if (!milestoneType) continue;

		// Skip if already have this milestone in the relationship
		if (existingSet.has(milestoneType)) continue;

		// Skip if we've already added this milestone type in this batch
		if (addedTypes.has(milestoneType)) continue;

		milestones.push(milestoneType);
		addedTypes.add(milestoneType);
	}

	return milestones;
}

describe('programmatic milestone inference (array)', () => {
	describe('first_meeting detection', () => {
		it('should infer first_meeting when no existing relationship', () => {
			const milestones = inferMilestoneTypes(['conversation'], [], false);
			expect(milestones).toContain('first_meeting');
		});

		it('should not infer first_meeting when relationship exists', () => {
			const milestones = inferMilestoneTypes(['conversation'], [], true);
			expect(milestones).not.toContain('first_meeting');
		});

		it('should not duplicate first_meeting', () => {
			const milestones = inferMilestoneTypes(
				['conversation'],
				['first_meeting'],
				false,
			);
			expect(milestones).not.toContain('first_meeting');
		});
	});

	describe('intimacy milestone inference', () => {
		it('should infer first_kiss from intimate_kiss event', () => {
			const milestones = inferMilestoneTypes(['intimate_kiss'], [], true);
			expect(milestones).toContain('first_kiss');
		});

		it('should infer first_embrace from intimate_embrace event', () => {
			const milestones = inferMilestoneTypes(['intimate_embrace'], [], true);
			expect(milestones).toContain('first_embrace');
		});

		it('should infer first_penetrative from intimate_penetrative event', () => {
			const milestones = inferMilestoneTypes(['intimate_penetrative'], [], true);
			expect(milestones).toContain('first_penetrative');
		});

		it('should infer atomic sexual milestones from each sexual activity type', () => {
			// Each sexual event type maps to its own milestone now
			expect(inferMilestoneTypes(['intimate_foreplay'], [], true)).toContain(
				'first_foreplay',
			);
			expect(inferMilestoneTypes(['intimate_oral'], [], true)).toContain(
				'first_oral',
			);
			expect(inferMilestoneTypes(['intimate_manual'], [], true)).toContain(
				'first_manual',
			);
			expect(inferMilestoneTypes(['intimate_penetrative'], [], true)).toContain(
				'first_penetrative',
			);
			expect(inferMilestoneTypes(['intimate_climax'], [], true)).toContain(
				'first_climax',
			);
		});

		it('should not duplicate intimacy milestones', () => {
			const milestones = inferMilestoneTypes(
				['intimate_kiss'],
				['first_kiss'],
				true,
			);
			expect(milestones).not.toContain('first_kiss');
		});

		it('should allow different intimacy milestones for same pair', () => {
			// Already have first_kiss, should allow first_embrace
			const milestones = inferMilestoneTypes(
				['intimate_embrace'],
				['first_kiss'],
				true,
			);
			expect(milestones).toContain('first_embrace');
		});
	});

	describe('other milestone inference', () => {
		it('should infer confession from confession event', () => {
			const milestones = inferMilestoneTypes(['confession'], [], true);
			expect(milestones).toContain('confession');
		});

		it('should infer first_conflict from argument event', () => {
			const milestones = inferMilestoneTypes(['argument'], [], true);
			expect(milestones).toContain('first_conflict');
		});

		it('should infer first_conflict from combat event', () => {
			const milestones = inferMilestoneTypes(['combat'], [], true);
			expect(milestones).toContain('first_conflict');
		});

		it('should infer secret_shared from secret_shared event', () => {
			const milestones = inferMilestoneTypes(['secret_shared'], [], true);
			expect(milestones).toContain('secret_shared');
		});

		it('should infer promise_made from promise event', () => {
			const milestones = inferMilestoneTypes(['promise'], [], true);
			expect(milestones).toContain('promise_made');
		});

		it('should infer betrayal from betrayal event', () => {
			const milestones = inferMilestoneTypes(['betrayal'], [], true);
			expect(milestones).toContain('betrayal');
		});
	});

	describe('bonding milestone inference', () => {
		it('should infer first_laugh from laugh event', () => {
			const milestones = inferMilestoneTypes(['laugh'], [], true);
			expect(milestones).toContain('first_laugh');
		});

		it('should infer first_gift from gift event', () => {
			const milestones = inferMilestoneTypes(['gift'], [], true);
			expect(milestones).toContain('first_gift');
		});

		it('should infer first_date from date event', () => {
			const milestones = inferMilestoneTypes(['date'], [], true);
			expect(milestones).toContain('first_date');
		});

		it('should infer first_i_love_you from i_love_you event', () => {
			const milestones = inferMilestoneTypes(['i_love_you'], [], true);
			expect(milestones).toContain('first_i_love_you');
		});

		it('should infer first_sleepover from sleepover event', () => {
			const milestones = inferMilestoneTypes(['sleepover'], [], true);
			expect(milestones).toContain('first_sleepover');
		});

		it('should infer first_shared_meal from shared_meal event', () => {
			const milestones = inferMilestoneTypes(['shared_meal'], [], true);
			expect(milestones).toContain('first_shared_meal');
		});

		it('should not duplicate bonding milestones', () => {
			const milestones = inferMilestoneTypes(['laugh'], ['first_laugh'], true);
			expect(milestones).not.toContain('first_laugh');
		});
	});

	describe('multiple milestones from one event', () => {
		it('should return both first_kiss and first_embrace when event has both', () => {
			const milestones = inferMilestoneTypes(
				['intimate_kiss', 'intimate_embrace'],
				[],
				true,
			);
			expect(milestones).toContain('first_kiss');
			expect(milestones).toContain('first_embrace');
			expect(milestones).toHaveLength(2);
		});

		it('should return first_meeting plus other milestones for new relationships', () => {
			const milestones = inferMilestoneTypes(
				['intimate_kiss', 'confession'],
				[],
				false, // no existing relationship
			);
			expect(milestones).toContain('first_meeting');
			expect(milestones).toContain('first_kiss');
			expect(milestones).toContain('confession');
			expect(milestones).toHaveLength(3);
		});

		it('should return all applicable intimacy milestones from a romantic scene', () => {
			const milestones = inferMilestoneTypes(
				[
					'intimate_touch',
					'intimate_kiss',
					'intimate_embrace',
					'intimate_heated',
				],
				[],
				true,
			);
			expect(milestones).toContain('first_touch');
			expect(milestones).toContain('first_kiss');
			expect(milestones).toContain('first_embrace');
			expect(milestones).toContain('first_heated');
			expect(milestones).toHaveLength(4);
		});

		it('should create separate milestones for each sexual event type', () => {
			// Each sexual event type now maps to its own milestone
			const milestones = inferMilestoneTypes(
				[
					'intimate_foreplay',
					'intimate_oral',
					'intimate_penetrative',
					'intimate_climax',
				],
				[],
				true,
			);
			expect(milestones).toContain('first_foreplay');
			expect(milestones).toContain('first_oral');
			expect(milestones).toContain('first_penetrative');
			expect(milestones).toContain('first_climax');
			expect(milestones).toHaveLength(4);
		});

		it('should skip already existing milestones in multi-milestone events', () => {
			const milestones = inferMilestoneTypes(
				['intimate_kiss', 'intimate_embrace', 'confession'],
				['first_kiss'], // already have first_kiss
				true,
			);
			expect(milestones).not.toContain('first_kiss');
			expect(milestones).toContain('first_embrace');
			expect(milestones).toContain('confession');
			expect(milestones).toHaveLength(2);
		});
	});

	describe('empty results', () => {
		it('should return empty array for conversation-only events with existing relationship', () => {
			const milestones = inferMilestoneTypes(['conversation'], [], true);
			expect(milestones).toHaveLength(0);
		});

		it('should return empty array when all potential milestones already exist', () => {
			const milestones = inferMilestoneTypes(
				['intimate_kiss', 'intimate_embrace'],
				['first_kiss', 'first_embrace'],
				true,
			);
			expect(milestones).toHaveLength(0);
		});
	});
});

describe('milestone deduplication with relationships', () => {
	it('should not create duplicate milestones', () => {
		const relationships = [createTestRelationship('Elena', 'Marcus', ['first_kiss'])];

		const existingMilestones = relationships[0].milestones.map(m => m.type);
		const milestones = inferMilestoneTypes(['intimate_kiss'], existingMilestones, true);

		expect(milestones).not.toContain('first_kiss');
		expect(milestones).toHaveLength(0);
	});

	it('should allow new milestone types', () => {
		const relationships = [
			createTestRelationship('Elena', 'Marcus', ['first_meeting', 'first_kiss']),
		];

		const existingMilestones = relationships[0].milestones.map(m => m.type);
		const milestones = inferMilestoneTypes(
			['intimate_embrace'],
			existingMilestones,
			true,
		);

		expect(milestones).toContain('first_embrace');
	});

	it('should add both milestones when event has 2 firsts', () => {
		// Relationship has no kiss or embrace milestones yet
		const relationships = [
			createTestRelationship('Elena', 'Marcus', ['first_meeting']),
		];

		const existingMilestones = relationships[0].milestones.map(m => m.type);
		const milestones = inferMilestoneTypes(
			['intimate_kiss', 'intimate_embrace'],
			existingMilestones,
			true,
		);

		expect(milestones).toContain('first_kiss');
		expect(milestones).toContain('first_embrace');
		expect(milestones).toHaveLength(2);
	});

	it('should add only the new milestone when event has 2 but one already exists', () => {
		// Relationship already has first_kiss, but not first_embrace
		const relationships = [
			createTestRelationship('Elena', 'Marcus', ['first_meeting', 'first_kiss']),
		];

		const existingMilestones = relationships[0].milestones.map(m => m.type);
		const milestones = inferMilestoneTypes(
			['intimate_kiss', 'intimate_embrace'],
			existingMilestones,
			true,
		);

		expect(milestones).not.toContain('first_kiss'); // Already exists
		expect(milestones).toContain('first_embrace'); // New
		expect(milestones).toHaveLength(1);
	});

	it('should add neither milestone when event has 2 but both already exist', () => {
		// Relationship already has both first_kiss and first_embrace
		const relationships = [
			createTestRelationship('Elena', 'Marcus', [
				'first_meeting',
				'first_kiss',
				'first_embrace',
			]),
		];

		const existingMilestones = relationships[0].milestones.map(m => m.type);
		const milestones = inferMilestoneTypes(
			['intimate_kiss', 'intimate_embrace'],
			existingMilestones,
			true,
		);

		expect(milestones).not.toContain('first_kiss');
		expect(milestones).not.toContain('first_embrace');
		expect(milestones).toHaveLength(0);
	});
});
