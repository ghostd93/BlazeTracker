// ============================================
// Shared UI Formatters
// ============================================

import type { NarrativeDateTime, LocationState, CharacterOutfit } from '../types/state';
import { MONTH_NAMES } from './constants';
import { applyTimeFormat, type TimeFormat } from '../utils/timeFormat';

/**
 * Format a narrative datetime for display.
 */
export function formatTime(time: NarrativeDateTime, timeFormat: TimeFormat = '24h'): string {
	const month = MONTH_NAMES[time.month - 1];
	// "Mon, Jan 15 2024, 14:30"
	return `${time.dayOfWeek.slice(0, 3)}, ${month} ${time.day} ${time.year}, ${applyTimeFormat(time.hour, time.minute, timeFormat)}`;
}

/**
 * Format a location for display.
 */
export function formatLocation(location: LocationState): string {
	const parts = [location.position, location.place, location.area];
	return parts.filter(Boolean).join(' \u00B7 ');
}

/**
 * Format an outfit for display.
 */
export function formatOutfit(outfit: CharacterOutfit): string {
	const outfitParts = [
		outfit.torso || 'topless',
		outfit.legs || 'bottomless',
		outfit.underwear || 'no underwear',
		outfit.head || null,
		outfit.neck || null,
		outfit.jacket || null,
		outfit.back || null,
		outfit.footwear || null,
	];
	return outfitParts.filter((v: string | null) => v !== null).join(', ');
}

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(str: string): string {
	if (!str) return str;
	return str.charAt(0).toUpperCase() + str.slice(1);
}
