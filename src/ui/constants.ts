// ============================================
// Shared UI Constants
// ============================================

import type {
	TensionLevel,
	TensionType,
	TensionDirection,
	Climate,
	WeatherCondition,
	BuildingType,
} from '../types/state';

/**
 * Month names for display.
 */
export const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
] as const;

/**
 * Days of the week.
 */
export const DAYS_OF_WEEK = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
] as const;

/**
 * Valid weather options (legacy).
 */
export const WEATHER_OPTIONS: readonly Climate['weather'][] = [
	'sunny',
	'cloudy',
	'rainy',
	'snowy',
	'windy',
	'thunderstorm',
] as const;

/**
 * Weather condition options (procedural system).
 */
export const WEATHER_CONDITIONS: readonly WeatherCondition[] = [
	'clear',
	'sunny',
	'partly_cloudy',
	'overcast',
	'foggy',
	'drizzle',
	'rain',
	'heavy_rain',
	'thunderstorm',
	'sleet',
	'snow',
	'heavy_snow',
	'blizzard',
	'windy',
	'hot',
	'cold',
	'humid',
] as const;

/**
 * Weather condition display names.
 */
export const WEATHER_CONDITION_LABELS: Record<WeatherCondition, string> = {
	clear: 'Clear',
	sunny: 'Sunny',
	partly_cloudy: 'Partly Cloudy',
	overcast: 'Overcast',
	foggy: 'Foggy',
	drizzle: 'Drizzle',
	rain: 'Rain',
	heavy_rain: 'Heavy Rain',
	thunderstorm: 'Thunderstorm',
	sleet: 'Sleet',
	snow: 'Snow',
	heavy_snow: 'Heavy Snow',
	blizzard: 'Blizzard',
	windy: 'Windy',
	hot: 'Hot',
	cold: 'Cold',
	humid: 'Humid',
};

/**
 * Building types for indoor temperature.
 */
export const BUILDING_TYPES: readonly BuildingType[] = [
	'modern',
	'heated',
	'unheated',
	'underground',
	'tent',
	'vehicle',
] as const;

/**
 * Building type display names.
 */
export const BUILDING_TYPE_LABELS: Record<BuildingType, string> = {
	modern: 'Modern (HVAC)',
	heated: 'Heated (Fireplace)',
	unheated: 'Unheated (Barn/Warehouse)',
	underground: 'Underground (Cave/Basement)',
	tent: 'Tent',
	vehicle: 'Vehicle',
};

/**
 * Tension levels in ascending order.
 */
export const TENSION_LEVELS: readonly TensionLevel[] = [
	'relaxed',
	'aware',
	'guarded',
	'tense',
	'charged',
	'volatile',
	'explosive',
] as const;

/**
 * Tension types.
 */
export const TENSION_TYPES: readonly TensionType[] = [
	'confrontation',
	'intimate',
	'vulnerable',
	'celebratory',
	'negotiation',
	'suspense',
	'conversation',
] as const;

/**
 * Tension directions.
 */
export const TENSION_DIRECTIONS: readonly TensionDirection[] = [
	'escalating',
	'stable',
	'decreasing',
] as const;

/**
 * Outfit slots in order.
 */
export const OUTFIT_SLOTS = [
	'head',
	'neck',
	'jacket',
	'back',
	'torso',
	'legs',
	'underwear',
	'socks',
	'footwear',
] as const;

export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];
