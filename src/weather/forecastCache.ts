/**
 * Forecast Cache
 *
 * Manages per-location forecast storage and retrieval.
 */

import type { ForecastCacheEntry, LocationForecast } from './types';
import type { NarrativeDateTime } from '../types/state';

// ============================================
// Location ID
// ============================================

/**
 * Generate consistent location ID from area name
 */
export function getLocationId(area: string): string {
	return area.toLowerCase().trim().replace(/\s+/g, '-');
}

// ============================================
// Date Utilities
// ============================================

/**
 * Parse a YYYY-MM-DD date string
 */
function parseDate(dateStr: string): Date {
	const [year, month, day] = dateStr.split('-').map(Number);
	return new Date(year, month - 1, day);
}

/**
 * Convert NarrativeDateTime to Date
 */
function toDate(dt: NarrativeDateTime): Date {
	return new Date(dt.year, dt.month - 1, dt.day);
}

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

// ============================================
// Cache Operations
// ============================================

/**
 * Get a cached forecast for an area
 * Returns null if not found or expired
 */
export function getCachedForecast(
	cache: ForecastCacheEntry[],
	area: string,
	currentDate: NarrativeDateTime,
): LocationForecast | null {
	const locationId = getLocationId(area);
	const entry = cache.find(e => getLocationId(e.areaName) === locationId);

	if (!entry) {
		return null;
	}

	// Check if forecast covers current date
	const forecastStart = parseDate(entry.forecast.startDate);
	const forecastEnd = addDays(forecastStart, entry.forecast.days.length);
	const current = toDate(currentDate);

	if (current < forecastStart || current >= forecastEnd) {
		return null; // Forecast doesn't cover this date
	}

	return entry.forecast;
}

/**
 * Add or update a forecast in the cache
 */
export function cacheForecast(
	cache: ForecastCacheEntry[],
	area: string,
	forecast: LocationForecast,
): ForecastCacheEntry[] {
	const locationId = getLocationId(area);

	// Remove existing entry for this location
	const filtered = cache.filter(e => getLocationId(e.areaName) !== locationId);

	// Add new entry
	return [
		...filtered,
		{
			areaName: area,
			forecast,
			lastAccessedDate: new Date().toISOString(),
		},
	];
}

/**
 * Update the last accessed date for a cache entry
 */
export function touchCacheEntry(cache: ForecastCacheEntry[], area: string): ForecastCacheEntry[] {
	const locationId = getLocationId(area);

	return cache.map(entry => {
		if (getLocationId(entry.areaName) === locationId) {
			return {
				...entry,
				lastAccessedDate: new Date().toISOString(),
			};
		}
		return entry;
	});
}

/**
 * Remove a specific location from the cache
 */
export function removeCacheEntry(cache: ForecastCacheEntry[], area: string): ForecastCacheEntry[] {
	const locationId = getLocationId(area);
	return cache.filter(e => getLocationId(e.areaName) !== locationId);
}

/**
 * Clean up old cache entries
 */
export function cleanupCache(
	cache: ForecastCacheEntry[],
	maxAgeMs: number = 30 * 24 * 60 * 60 * 1000, // 30 days default
): ForecastCacheEntry[] {
	const cutoff = Date.now() - maxAgeMs;

	return cache.filter(entry => {
		const lastAccessed = new Date(entry.lastAccessedDate).getTime();
		return lastAccessed > cutoff;
	});
}

/**
 * Get cache statistics
 */
export function getCacheStats(cache: ForecastCacheEntry[]): {
	entryCount: number;
	totalDays: number;
	oldestAccess: string | null;
	newestAccess: string | null;
} {
	if (cache.length === 0) {
		return {
			entryCount: 0,
			totalDays: 0,
			oldestAccess: null,
			newestAccess: null,
		};
	}

	const accessDates = cache
		.map(e => new Date(e.lastAccessedDate).getTime())
		.sort((a, b) => a - b);

	return {
		entryCount: cache.length,
		totalDays: cache.reduce((sum, e) => sum + e.forecast.days.length, 0),
		oldestAccess: new Date(accessDates[0]).toISOString(),
		newestAccess: new Date(accessDates[accessDates.length - 1]).toISOString(),
	};
}

// ============================================
// Forecast Querying
// ============================================

/**
 * Check if a forecast covers a date range
 */
export function forecastCoversRange(
	forecast: LocationForecast,
	startDate: NarrativeDateTime,
	endDate: NarrativeDateTime,
): boolean {
	const forecastStart = parseDate(forecast.startDate);
	const forecastEnd = addDays(forecastStart, forecast.days.length);

	const rangeStart = toDate(startDate);
	const rangeEnd = toDate(endDate);

	return rangeStart >= forecastStart && rangeEnd < forecastEnd;
}

/**
 * Get the number of days remaining in a forecast from a given date
 */
export function getDaysRemaining(
	forecast: LocationForecast,
	currentDate: NarrativeDateTime,
): number {
	const forecastStart = parseDate(forecast.startDate);
	const forecastEnd = addDays(forecastStart, forecast.days.length);
	const current = toDate(currentDate);

	if (current >= forecastEnd) {
		return 0;
	}

	const diffMs = forecastEnd.getTime() - current.getTime();
	return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Determine if a forecast should be regenerated
 * (less than 3 days remaining or doesn't cover current date)
 */
export function shouldRegenerateForecast(
	forecast: LocationForecast | null,
	currentDate: NarrativeDateTime,
	minDaysRemaining: number = 3,
): boolean {
	if (!forecast) {
		return true;
	}

	const daysRemaining = getDaysRemaining(forecast, currentDate);
	return daysRemaining < minDaysRemaining;
}
