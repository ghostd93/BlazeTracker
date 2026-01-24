import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
	getLocationId,
	getCachedForecast,
	cacheForecast,
	touchCacheEntry,
	removeCacheEntry,
	cleanupCache,
	getCacheStats,
	forecastCoversRange,
	getDaysRemaining,
	shouldRegenerateForecast,
} from './forecastCache';
import type { ForecastCacheEntry, LocationForecast, DailyForecast, HourlyWeather } from './types';
import type { NarrativeDateTime } from '../types/state';

// ============================================
// Test Helpers
// ============================================

function makeDate(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
): NarrativeDateTime {
	return { year, month, day, hour, minute, second: 0, dayOfWeek: 'Monday' };
}

function createHourlyWeather(hour: number): HourlyWeather {
	return {
		hour,
		temperature: 70,
		feelsLike: 70,
		humidity: 50,
		windSpeed: 10,
		windDirection: 180,
		precipitation: 0,
		precipProbability: 0,
		cloudCover: 30,
		uvIndex: 5,
	};
}

function createMockForecast(startDate: string, days: number): LocationForecast {
	const dailyForecasts: DailyForecast[] = [];
	const [year, month, day] = startDate.split('-').map(Number);
	const start = new Date(year, month - 1, day);

	for (let i = 0; i < days; i++) {
		const date = new Date(start);
		date.setDate(start.getDate() + i);
		const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

		dailyForecasts.push({
			date: dateStr,
			high: 80 + i,
			low: 60 + i,
			hourly: Array(24)
				.fill(null)
				.map((_, h) => createHourlyWeather(h)),
			dominantCondition: 'sunny',
			sunrise: 6,
			sunset: 20,
		});
	}

	return {
		locationId: 'test-location',
		startDate,
		days: dailyForecasts,
	};
}

function createCacheEntry(area: string, startDate: string, days: number): ForecastCacheEntry {
	return {
		areaName: area,
		forecast: createMockForecast(startDate, days),
		lastAccessedDate: new Date().toISOString(),
	};
}

// ============================================
// getLocationId
// ============================================

describe('getLocationId', () => {
	it('converts to lowercase', () => {
		expect(getLocationId('New York')).toBe('new-york');
	});

	it('trims whitespace', () => {
		expect(getLocationId('  London  ')).toBe('london');
	});

	it('replaces spaces with hyphens', () => {
		expect(getLocationId('Los Angeles')).toBe('los-angeles');
	});

	it('collapses multiple spaces', () => {
		expect(getLocationId('San   Francisco')).toBe('san-francisco');
	});

	it('handles single-word names', () => {
		expect(getLocationId('Tokyo')).toBe('tokyo');
	});
});

// ============================================
// getCachedForecast
// ============================================

describe('getCachedForecast', () => {
	const currentDate = makeDate(2024, 7, 15, 12, 0);

	it('returns null for empty cache', () => {
		const result = getCachedForecast([], 'New York', currentDate);
		expect(result).toBeNull();
	});

	it('returns forecast when date is covered', () => {
		const cache: ForecastCacheEntry[] = [
			createCacheEntry('New York', '2024-07-10', 14),
		];

		const result = getCachedForecast(cache, 'New York', currentDate);
		expect(result).not.toBeNull();
		expect(result?.startDate).toBe('2024-07-10');
	});

	it('matches area names case-insensitively', () => {
		const cache: ForecastCacheEntry[] = [
			createCacheEntry('new york', '2024-07-10', 14),
		];

		const result = getCachedForecast(cache, 'NEW YORK', currentDate);
		expect(result).not.toBeNull();
	});

	it('returns null when current date is before forecast', () => {
		const cache: ForecastCacheEntry[] = [
			createCacheEntry('New York', '2024-07-20', 14),
		];

		const result = getCachedForecast(cache, 'New York', currentDate);
		expect(result).toBeNull();
	});

	it('returns null when current date is after forecast', () => {
		const cache: ForecastCacheEntry[] = [createCacheEntry('New York', '2024-07-01', 7)];

		const result = getCachedForecast(cache, 'New York', currentDate);
		expect(result).toBeNull();
	});

	it('returns null for non-matching area', () => {
		const cache: ForecastCacheEntry[] = [createCacheEntry('London', '2024-07-10', 14)];

		const result = getCachedForecast(cache, 'New York', currentDate);
		expect(result).toBeNull();
	});
});

// ============================================
// cacheForecast
// ============================================

describe('cacheForecast', () => {
	it('adds forecast to empty cache', () => {
		const forecast = createMockForecast('2024-07-10', 14);
		const result = cacheForecast([], 'New York', forecast);

		expect(result).toHaveLength(1);
		expect(result[0].areaName).toBe('New York');
	});

	it('replaces existing entry for same location', () => {
		const cache: ForecastCacheEntry[] = [createCacheEntry('New York', '2024-07-01', 7)];
		const newForecast = createMockForecast('2024-07-15', 14);

		const result = cacheForecast(cache, 'New York', newForecast);

		expect(result).toHaveLength(1);
		expect(result[0].forecast.startDate).toBe('2024-07-15');
	});

	it('preserves other locations when updating', () => {
		const cache: ForecastCacheEntry[] = [
			createCacheEntry('New York', '2024-07-01', 7),
			createCacheEntry('London', '2024-07-05', 14),
		];
		const newForecast = createMockForecast('2024-07-15', 14);

		const result = cacheForecast(cache, 'New York', newForecast);

		expect(result).toHaveLength(2);
		expect(result.find(e => e.areaName === 'London')).toBeDefined();
	});

	it('handles case-insensitive replacement', () => {
		const cache: ForecastCacheEntry[] = [createCacheEntry('New York', '2024-07-01', 7)];
		const newForecast = createMockForecast('2024-07-15', 14);

		const result = cacheForecast(cache, 'NEW YORK', newForecast);

		expect(result).toHaveLength(1);
		expect(result[0].areaName).toBe('NEW YORK');
	});
});

// ============================================
// touchCacheEntry
// ============================================

describe('touchCacheEntry', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('updates lastAccessedDate for matching entry', () => {
		const oldDate = '2024-01-01T00:00:00.000Z';
		const cache: ForecastCacheEntry[] = [
			{
				...createCacheEntry('New York', '2024-07-10', 14),
				lastAccessedDate: oldDate,
			},
		];

		vi.setSystemTime(new Date('2024-07-15T12:00:00.000Z'));
		const result = touchCacheEntry(cache, 'New York');

		expect(result[0].lastAccessedDate).not.toBe(oldDate);
	});

	it('does not modify non-matching entries', () => {
		const oldDate = '2024-01-01T00:00:00.000Z';
		const cache: ForecastCacheEntry[] = [
			{
				...createCacheEntry('New York', '2024-07-10', 14),
				lastAccessedDate: oldDate,
			},
			{
				...createCacheEntry('London', '2024-07-10', 14),
				lastAccessedDate: oldDate,
			},
		];

		vi.setSystemTime(new Date('2024-07-15T12:00:00.000Z'));
		const result = touchCacheEntry(cache, 'New York');

		expect(result.find(e => e.areaName === 'London')?.lastAccessedDate).toBe(oldDate);
	});
});

// ============================================
// removeCacheEntry
// ============================================

describe('removeCacheEntry', () => {
	it('removes matching entry', () => {
		const cache: ForecastCacheEntry[] = [
			createCacheEntry('New York', '2024-07-10', 14),
			createCacheEntry('London', '2024-07-10', 14),
		];

		const result = removeCacheEntry(cache, 'New York');

		expect(result).toHaveLength(1);
		expect(result[0].areaName).toBe('London');
	});

	it('handles case-insensitive removal', () => {
		const cache: ForecastCacheEntry[] = [
			createCacheEntry('New York', '2024-07-10', 14),
		];

		const result = removeCacheEntry(cache, 'NEW YORK');

		expect(result).toHaveLength(0);
	});

	it('returns unchanged cache if no match', () => {
		const cache: ForecastCacheEntry[] = [
			createCacheEntry('New York', '2024-07-10', 14),
		];

		const result = removeCacheEntry(cache, 'London');

		expect(result).toHaveLength(1);
	});
});

// ============================================
// cleanupCache
// ============================================

describe('cleanupCache', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('removes entries older than maxAge', () => {
		const oldDate = new Date('2024-01-01T00:00:00.000Z');
		const recentDate = new Date('2024-07-01T00:00:00.000Z');

		const cache: ForecastCacheEntry[] = [
			{
				...createCacheEntry('Old City', '2024-01-01', 7),
				lastAccessedDate: oldDate.toISOString(),
			},
			{
				...createCacheEntry('New City', '2024-07-01', 7),
				lastAccessedDate: recentDate.toISOString(),
			},
		];

		vi.setSystemTime(new Date('2024-07-15T00:00:00.000Z'));
		const result = cleanupCache(cache, 30 * 24 * 60 * 60 * 1000); // 30 days

		expect(result).toHaveLength(1);
		expect(result[0].areaName).toBe('New City');
	});

	it('keeps all entries if none are old', () => {
		const recentDate = new Date('2024-07-10T00:00:00.000Z');

		const cache: ForecastCacheEntry[] = [
			{
				...createCacheEntry('City A', '2024-07-01', 7),
				lastAccessedDate: recentDate.toISOString(),
			},
			{
				...createCacheEntry('City B', '2024-07-05', 7),
				lastAccessedDate: recentDate.toISOString(),
			},
		];

		vi.setSystemTime(new Date('2024-07-15T00:00:00.000Z'));
		const result = cleanupCache(cache, 30 * 24 * 60 * 60 * 1000);

		expect(result).toHaveLength(2);
	});
});

// ============================================
// getCacheStats
// ============================================

describe('getCacheStats', () => {
	it('returns zeros for empty cache', () => {
		const stats = getCacheStats([]);

		expect(stats.entryCount).toBe(0);
		expect(stats.totalDays).toBe(0);
		expect(stats.oldestAccess).toBeNull();
		expect(stats.newestAccess).toBeNull();
	});

	it('calculates correct entry count', () => {
		const cache: ForecastCacheEntry[] = [
			createCacheEntry('New York', '2024-07-10', 14),
			createCacheEntry('London', '2024-07-10', 7),
		];

		const stats = getCacheStats(cache);
		expect(stats.entryCount).toBe(2);
	});

	it('calculates total forecast days', () => {
		const cache: ForecastCacheEntry[] = [
			createCacheEntry('New York', '2024-07-10', 14),
			createCacheEntry('London', '2024-07-10', 7),
		];

		const stats = getCacheStats(cache);
		expect(stats.totalDays).toBe(21);
	});

	it('identifies oldest and newest access dates', () => {
		const cache: ForecastCacheEntry[] = [
			{
				...createCacheEntry('New York', '2024-07-10', 14),
				lastAccessedDate: '2024-07-01T00:00:00.000Z',
			},
			{
				...createCacheEntry('London', '2024-07-10', 7),
				lastAccessedDate: '2024-07-15T00:00:00.000Z',
			},
		];

		const stats = getCacheStats(cache);
		expect(stats.oldestAccess).toBe('2024-07-01T00:00:00.000Z');
		expect(stats.newestAccess).toBe('2024-07-15T00:00:00.000Z');
	});
});

// ============================================
// forecastCoversRange
// ============================================

describe('forecastCoversRange', () => {
	const forecast = createMockForecast('2024-07-10', 14);

	it('returns true when range is fully covered', () => {
		const startDate = makeDate(2024, 7, 12, 0, 0);
		const endDate = makeDate(2024, 7, 20, 0, 0);

		expect(forecastCoversRange(forecast, startDate, endDate)).toBe(true);
	});

	it('returns false when start is before forecast', () => {
		const startDate = makeDate(2024, 7, 5, 0, 0);
		const endDate = makeDate(2024, 7, 15, 0, 0);

		expect(forecastCoversRange(forecast, startDate, endDate)).toBe(false);
	});

	it('returns false when end is after forecast', () => {
		const startDate = makeDate(2024, 7, 15, 0, 0);
		const endDate = makeDate(2024, 7, 30, 0, 0);

		expect(forecastCoversRange(forecast, startDate, endDate)).toBe(false);
	});
});

// ============================================
// getDaysRemaining
// ============================================

describe('getDaysRemaining', () => {
	const forecast = createMockForecast('2024-07-10', 14);

	it('returns correct days remaining from start', () => {
		const currentDate = makeDate(2024, 7, 10, 0, 0);
		expect(getDaysRemaining(forecast, currentDate)).toBe(14);
	});

	it('returns correct days remaining from middle', () => {
		const currentDate = makeDate(2024, 7, 15, 0, 0);
		expect(getDaysRemaining(forecast, currentDate)).toBe(9);
	});

	it('returns 0 when past forecast end', () => {
		const currentDate = makeDate(2024, 8, 1, 0, 0);
		expect(getDaysRemaining(forecast, currentDate)).toBe(0);
	});
});

// ============================================
// shouldRegenerateForecast
// ============================================

describe('shouldRegenerateForecast', () => {
	it('returns true when forecast is null', () => {
		const currentDate = makeDate(2024, 7, 15, 0, 0);
		expect(shouldRegenerateForecast(null, currentDate)).toBe(true);
	});

	it('returns true when less than minDaysRemaining', () => {
		const forecast = createMockForecast('2024-07-10', 14);
		const currentDate = makeDate(2024, 7, 22, 0, 0);

		expect(shouldRegenerateForecast(forecast, currentDate, 3)).toBe(true);
	});

	it('returns false when enough days remaining', () => {
		const forecast = createMockForecast('2024-07-10', 14);
		const currentDate = makeDate(2024, 7, 15, 0, 0);

		expect(shouldRegenerateForecast(forecast, currentDate, 3)).toBe(false);
	});

	it('uses default minDaysRemaining of 3', () => {
		const forecast = createMockForecast('2024-07-10', 14);
		const currentDate = makeDate(2024, 7, 22, 0, 0);

		expect(shouldRegenerateForecast(forecast, currentDate)).toBe(true);
	});
});
