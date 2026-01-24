import { describe, it, expect, vi } from 'vitest';
import {
	getTimeDeltaMinutes,
	formatTimeElapsed,
	checkChapterBoundary,
	createEmptyChapter,
	formatDateTime,
} from './chapters';
import type { NarrativeDateTime, LocationState } from '../types/state';

// Mock settings
vi.mock('../settings', () => ({
	getSettings: () => ({ chapterTimeThreshold: 60 }),
}));

describe('getTimeDeltaMinutes', () => {
	const baseTime: NarrativeDateTime = {
		year: 2024,
		month: 6,
		day: 15,
		hour: 12,
		minute: 0,
		second: 0,
		dayOfWeek: 'Saturday',
	};

	it('returns 0 for same time', () => {
		expect(getTimeDeltaMinutes(baseTime, baseTime)).toBe(0);
	});

	it('calculates minutes within same hour', () => {
		const later = { ...baseTime, minute: 30 };
		expect(getTimeDeltaMinutes(baseTime, later)).toBe(30);
	});

	it('calculates across hours', () => {
		const later = { ...baseTime, hour: 14, minute: 30 };
		expect(getTimeDeltaMinutes(baseTime, later)).toBe(150); // 2.5 hours
	});

	it('calculates across midnight', () => {
		const evening = { ...baseTime, hour: 23, minute: 30 };
		const morning = { ...baseTime, day: 16, hour: 1, minute: 30 };
		expect(getTimeDeltaMinutes(evening, morning)).toBe(120); // 2 hours
	});

	it('calculates across month boundary', () => {
		const endOfMonth = { ...baseTime, month: 6, day: 30, hour: 23 };
		const nextMonth = { ...baseTime, month: 7, day: 1, hour: 1 };
		const delta = getTimeDeltaMinutes(endOfMonth, nextMonth);
		// Should be about 2 hours (approximate since we use 30-day months)
		expect(delta).toBeGreaterThan(0);
		expect(delta).toBeLessThan(24 * 60); // Less than a day
	});

	it('returns negative delta when to is before from', () => {
		const earlier = { ...baseTime, hour: 10 };
		expect(getTimeDeltaMinutes(baseTime, earlier)).toBe(-120);
	});

	it('handles leap year (approximate)', () => {
		// Our implementation uses fixed 30-day months, so this is approximate
		const feb28 = { ...baseTime, year: 2024, month: 2, day: 28 };
		const mar1 = { ...baseTime, year: 2024, month: 3, day: 1 };
		const delta = getTimeDeltaMinutes(feb28, mar1);
		// Should be positive and represent a few days
		expect(delta).toBeGreaterThan(24 * 60); // More than a day
	});
});

describe('formatTimeElapsed', () => {
	it('formats minutes', () => {
		expect(formatTimeElapsed(1)).toBe('1 minute');
		expect(formatTimeElapsed(5)).toBe('5 minutes');
		expect(formatTimeElapsed(59)).toBe('59 minutes');
	});

	it('formats hours', () => {
		expect(formatTimeElapsed(60)).toBe('1 hour');
		expect(formatTimeElapsed(120)).toBe('2 hours');
	});

	it('formats hours and minutes', () => {
		expect(formatTimeElapsed(90)).toBe('1 hour, 30 minutes');
		expect(formatTimeElapsed(150)).toBe('2 hours, 30 minutes');
	});

	it('formats days', () => {
		expect(formatTimeElapsed(24 * 60)).toBe('1 day');
		expect(formatTimeElapsed(48 * 60)).toBe('2 days');
	});

	it('formats days and hours', () => {
		expect(formatTimeElapsed(26 * 60)).toBe('1 day, 2 hours');
	});

	it('formats weeks', () => {
		expect(formatTimeElapsed(7 * 24 * 60)).toBe('1 week');
		expect(formatTimeElapsed(14 * 24 * 60)).toBe('2 weeks');
	});

	it('formats weeks and days', () => {
		expect(formatTimeElapsed(9 * 24 * 60)).toBe('1 week, 2 days');
	});
});

describe('checkChapterBoundary', () => {
	const baseLocation: LocationState = {
		area: 'Downtown',
		place: 'Coffee Shop',
		position: 'Corner booth',
		props: [],
	};

	const baseTime: NarrativeDateTime = {
		year: 2024,
		month: 6,
		day: 15,
		hour: 12,
		minute: 0,
		second: 0,
		dayOfWeek: 'Saturday',
	};

	it('returns not triggered for no change', () => {
		const result = checkChapterBoundary(baseLocation, baseLocation, baseTime, baseTime);
		expect(result.triggered).toBe(false);
	});

	it('triggers for location change only', () => {
		const newLocation = { ...baseLocation, place: 'Restaurant' };
		const result = checkChapterBoundary(baseLocation, newLocation, baseTime, baseTime);

		expect(result.triggered).toBe(true);
		expect(result.reason).toBe('location_change');
		expect(result.locationChange).toBeDefined();
		expect(result.timeJump).toBeUndefined();
	});

	it('triggers for area change', () => {
		const newLocation = { ...baseLocation, area: 'Uptown' };
		const result = checkChapterBoundary(baseLocation, newLocation, baseTime, baseTime);

		expect(result.triggered).toBe(true);
		expect(result.reason).toBe('location_change');
	});

	it('triggers for time jump only', () => {
		const laterTime = { ...baseTime, hour: 14 }; // 2 hours later (120 minutes > 60 threshold)
		const result = checkChapterBoundary(
			baseLocation,
			baseLocation,
			baseTime,
			laterTime,
		);

		expect(result.triggered).toBe(true);
		expect(result.reason).toBe('time_jump');
		expect(result.timeJump).toBeDefined();
		expect(result.locationChange).toBeUndefined();
	});

	it('triggers for both location and time', () => {
		const newLocation = { ...baseLocation, place: 'Restaurant' };
		const laterTime = { ...baseTime, hour: 14 };
		const result = checkChapterBoundary(baseLocation, newLocation, baseTime, laterTime);

		expect(result.triggered).toBe(true);
		expect(result.reason).toBe('both');
		expect(result.locationChange).toBeDefined();
		expect(result.timeJump).toBeDefined();
	});

	it('does not trigger for time below threshold', () => {
		const laterTime = { ...baseTime, minute: 30 }; // 30 minutes < 60 threshold
		const result = checkChapterBoundary(
			baseLocation,
			baseLocation,
			baseTime,
			laterTime,
		);

		expect(result.triggered).toBe(false);
	});

	it('triggers at exact threshold', () => {
		const laterTime = { ...baseTime, hour: 13 }; // 60 minutes = threshold
		const result = checkChapterBoundary(
			baseLocation,
			baseLocation,
			baseTime,
			laterTime,
		);

		expect(result.triggered).toBe(true);
	});

	it('handles undefined previous location', () => {
		const result = checkChapterBoundary(undefined, baseLocation, baseTime, baseTime);
		expect(result.triggered).toBe(false);
	});

	it('handles undefined current location', () => {
		const result = checkChapterBoundary(baseLocation, undefined, baseTime, baseTime);
		expect(result.triggered).toBe(false);
	});

	it('handles undefined times', () => {
		const newLocation = { ...baseLocation, place: 'Restaurant' };
		const result = checkChapterBoundary(
			baseLocation,
			newLocation,
			undefined,
			undefined,
		);

		// Should still trigger for location change
		expect(result.triggered).toBe(true);
		expect(result.reason).toBe('location_change');
	});

	it('is case-insensitive for location comparison', () => {
		const newLocation = { ...baseLocation, area: 'DOWNTOWN', place: 'COFFEE SHOP' };
		const result = checkChapterBoundary(baseLocation, newLocation, baseTime, baseTime);

		expect(result.triggered).toBe(false);
	});
});

describe('createEmptyChapter', () => {
	it('creates chapter with correct index', () => {
		const chapter = createEmptyChapter(0);
		expect(chapter.index).toBe(0);
		expect(chapter.title).toBe('Chapter 1');
	});

	it('creates chapter with incremented title', () => {
		const chapter = createEmptyChapter(5);
		expect(chapter.index).toBe(5);
		expect(chapter.title).toBe('Chapter 6');
	});

	it('creates chapter with empty outcomes', () => {
		const chapter = createEmptyChapter(0);
		expect(chapter.outcomes.relationshipChanges).toEqual([]);
		expect(chapter.outcomes.secretsRevealed).toEqual([]);
		expect(chapter.outcomes.newComplications).toEqual([]);
	});

	it('creates chapter with empty events', () => {
		const chapter = createEmptyChapter(0);
		expect(chapter.events).toEqual([]);
	});
});

describe('formatDateTime', () => {
	it('formats morning time correctly', () => {
		const dt: NarrativeDateTime = {
			year: 2024,
			month: 6,
			day: 15,
			hour: 9,
			minute: 30,
			second: 0,
			dayOfWeek: 'Saturday',
		};
		expect(formatDateTime(dt)).toBe('Saturday, June 15, 2024 at 9:30 AM');
	});

	it('formats afternoon time correctly', () => {
		const dt: NarrativeDateTime = {
			year: 2024,
			month: 6,
			day: 15,
			hour: 14,
			minute: 5,
			second: 0,
			dayOfWeek: 'Saturday',
		};
		expect(formatDateTime(dt)).toBe('Saturday, June 15, 2024 at 2:05 PM');
	});

	it('formats midnight correctly', () => {
		const dt: NarrativeDateTime = {
			year: 2024,
			month: 1,
			day: 1,
			hour: 0,
			minute: 0,
			second: 0,
			dayOfWeek: 'Monday',
		};
		expect(formatDateTime(dt)).toBe('Monday, January 1, 2024 at 12:00 AM');
	});

	it('formats noon correctly', () => {
		const dt: NarrativeDateTime = {
			year: 2024,
			month: 12,
			day: 25,
			hour: 12,
			minute: 0,
			second: 0,
			dayOfWeek: 'Wednesday',
		};
		expect(formatDateTime(dt)).toBe('Wednesday, December 25, 2024 at 12:00 PM');
	});
});
