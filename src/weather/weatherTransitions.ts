/**
 * Weather Transitions
 *
 * Generates narrative text when weather changes significantly.
 */

import type { WeatherCondition, ProceduralClimate } from './types';

// ============================================
// Transition Templates
// ============================================

interface WeatherTransition {
	from: WeatherCondition;
	to: WeatherCondition;
	templates: string[];
}

const TRANSITIONS: WeatherTransition[] = [
	// Clear to precipitation
	{
		from: 'clear',
		to: 'overcast',
		templates: [
			'Clouds drift across the sky, dimming the light',
			'The sky grows gray as clouds gather overhead',
			'A blanket of clouds slowly obscures the sun',
		],
	},
	{
		from: 'sunny',
		to: 'overcast',
		templates: [
			'The bright sunshine fades as clouds roll in',
			'Dark clouds begin to gather, blocking out the sun',
			'The sunny skies give way to gathering clouds',
		],
	},
	{
		from: 'overcast',
		to: 'rain',
		templates: [
			'The first drops of rain begin to fall',
			'Rain starts to patter down from the gray sky',
			'The clouds finally release their burden as rain begins',
		],
	},
	{
		from: 'clear',
		to: 'rain',
		templates: [
			'Dark clouds roll in quickly, and rain begins to fall',
			'The weather turns suddenly as rain sweeps across the area',
		],
	},
	{
		from: 'partly_cloudy',
		to: 'rain',
		templates: [
			'The scattered clouds thicken and rain begins to fall',
			'What started as a few clouds has turned to steady rain',
		],
	},
	{
		from: 'rain',
		to: 'heavy_rain',
		templates: [
			'The rain intensifies into a downpour',
			'The steady rain becomes a torrential downpour',
		],
	},
	{
		from: 'rain',
		to: 'thunderstorm',
		templates: [
			'Thunder rumbles in the distance as the rain intensifies',
			'Lightning flashes across the sky as the storm picks up',
			'The rain turns to a full thunderstorm',
		],
	},
	{
		from: 'rain',
		to: 'snow',
		templates: [
			'The rain turns to sleet, then thick snowflakes',
			'As the temperature drops, the rain becomes snow',
		],
	},

	// Precipitation clearing
	{
		from: 'rain',
		to: 'clear',
		templates: [
			'The rain tapers off as patches of blue appear',
			'The clouds part and sunlight breaks through',
			'The storm passes, leaving fresh air in its wake',
		],
	},
	{
		from: 'rain',
		to: 'partly_cloudy',
		templates: [
			'The rain stops, leaving behind scattered clouds',
			'The precipitation ends but clouds remain',
		],
	},
	{
		from: 'heavy_rain',
		to: 'rain',
		templates: [
			'The downpour eases to a steady rain',
			'The torrential rain lessens somewhat',
		],
	},
	{
		from: 'thunderstorm',
		to: 'rain',
		templates: [
			'The thunder fades into the distance, leaving just rain',
			'The storm passes but the rain continues',
		],
	},
	{
		from: 'snow',
		to: 'clear',
		templates: [
			'The snowfall gradually stops, revealing clear skies',
			'The last snowflakes drift down as the clouds disperse',
		],
	},
	{
		from: 'heavy_snow',
		to: 'snow',
		templates: [
			'The heavy snowfall eases to light flurries',
			'The blanketing snow becomes a gentler fall',
		],
	},
	{
		from: 'blizzard',
		to: 'snow',
		templates: [
			'The blizzard conditions ease, though snow continues',
			'The whiteout conditions clear somewhat',
		],
	},

	// Temperature-related
	{
		from: 'clear',
		to: 'hot',
		templates: [
			'The heat intensifies as the sun beats down',
			'A wave of oppressive heat settles in',
			'The temperature climbs to sweltering levels',
		],
	},
	{
		from: 'hot',
		to: 'clear',
		templates: [
			'The oppressive heat begins to ease',
			'The temperature becomes more bearable',
		],
	},
	{
		from: 'clear',
		to: 'cold',
		templates: [
			'A bitter chill settles over the area',
			'The temperature plummets as a cold front moves in',
			'An icy wind brings freezing temperatures',
		],
	},
	{
		from: 'cold',
		to: 'clear',
		templates: [
			'The bitter cold begins to moderate',
			'The freezing temperatures ease somewhat',
		],
	},

	// Fog
	{
		from: 'clear',
		to: 'foggy',
		templates: [
			'A thick fog rolls in, obscuring visibility',
			'Mist begins to gather, shrouding the surroundings',
		],
	},
	{
		from: 'foggy',
		to: 'clear',
		templates: [
			'The fog begins to lift, revealing the surroundings',
			'The mist burns off as visibility improves',
		],
	},

	// Wind
	{
		from: 'clear',
		to: 'windy',
		templates: [
			'Strong winds pick up, rustling through everything',
			'Gusts of wind begin to sweep across the area',
		],
	},
	{
		from: 'windy',
		to: 'clear',
		templates: [
			'The strong winds die down to a gentle breeze',
			'The gusts subside and calm returns',
		],
	},
];

// ============================================
// Transition Detection
// ============================================

/**
 * Determine if a weather transition is significant enough to mention
 */
export function shouldMentionTransition(
	prevClimate: ProceduralClimate,
	newClimate: ProceduralClimate,
): boolean {
	// Condition type changed
	if (prevClimate.conditionType !== newClimate.conditionType) {
		// Some transitions are minor (e.g., clear to sunny)
		const minorTransitions: Array<[WeatherCondition, WeatherCondition]> = [
			['clear', 'sunny'],
			['sunny', 'clear'],
			['partly_cloudy', 'overcast'],
			['overcast', 'partly_cloudy'],
		];

		const isMinor = minorTransitions.some(
			([from, to]) =>
				(prevClimate.conditionType === from &&
					newClimate.conditionType === to) ||
				(prevClimate.conditionType === to &&
					newClimate.conditionType === from),
		);

		if (!isMinor) {
			return true;
		}
	}

	// Large temperature change (>10°F)
	if (Math.abs(prevClimate.temperature - newClimate.temperature) > 10) {
		return true;
	}

	// Precipitation started/stopped
	const wasRaining = prevClimate.precipitation > 0.02;
	const isRaining = newClimate.precipitation > 0.02;
	if (wasRaining !== isRaining) {
		return true;
	}

	// Significant wind change
	if (
		Math.abs(prevClimate.windSpeed - newClimate.windSpeed) > 15 &&
		(prevClimate.windSpeed > 20 || newClimate.windSpeed > 20)
	) {
		return true;
	}

	return false;
}

// ============================================
// Transition Text Generation
// ============================================

/**
 * Get transition text for a weather change
 */
export function getTransitionText(
	from: WeatherCondition,
	to: WeatherCondition,
	tempChange?: number,
): string | null {
	// Find matching transition
	const transition = TRANSITIONS.find(t => t.from === from && t.to === to);

	if (transition) {
		const templates = transition.templates;
		return templates[Math.floor(Math.random() * templates.length)];
	}

	// Try reverse direction with modified text
	const reverseTransition = TRANSITIONS.find(t => t.from === to && t.to === from);
	if (reverseTransition) {
		// Use a generic transition for the reverse
		const conditions = formatCondition(to);
		return `The weather shifts to ${conditions}`;
	}

	// Generic fallback for unmapped transitions
	if (from !== to) {
		const fromStr = formatCondition(from);
		const toStr = formatCondition(to);
		return `The weather changes from ${fromStr} to ${toStr}`;
	}

	// Temperature-only change
	if (tempChange && Math.abs(tempChange) > 10) {
		if (tempChange > 0) {
			return 'The air grows noticeably warmer';
		} else {
			return 'A distinct chill creeps into the air';
		}
	}

	return null; // No significant change
}

/**
 * Format a condition for display
 */
function formatCondition(condition: WeatherCondition): string {
	return condition.replace(/_/g, ' ');
}

// ============================================
// Full Transition Description
// ============================================

/**
 * Generate a complete transition description for injection
 */
export function generateTransitionInjection(
	prevClimate: ProceduralClimate,
	newClimate: ProceduralClimate,
): string | null {
	if (!shouldMentionTransition(prevClimate, newClimate)) {
		return null;
	}

	const tempChange = newClimate.temperature - prevClimate.temperature;
	const transitionText = getTransitionText(
		prevClimate.conditionType,
		newClimate.conditionType,
		tempChange,
	);

	return transitionText;
}
