/**
 * Fallback Climate Profiles
 *
 * Hardcoded climate data for when API/geocoding fails.
 * All temperatures in Fahrenheit.
 */

import type { BaseClimateType, FallbackClimateProfile, ClimateNormals } from './types';

// ============================================
// Profiles
// ============================================

export const FALLBACK_PROFILES: Record<BaseClimateType, FallbackClimateProfile> = {
	temperate: {
		type: 'temperate',
		monthlyHighs: [40, 43, 52, 62, 72, 80, 85, 83, 76, 64, 52, 43],
		monthlyLows: [25, 27, 34, 43, 53, 62, 67, 65, 57, 46, 36, 28],
		monthlyPrecipDays: [10, 9, 11, 11, 12, 10, 9, 9, 8, 8, 9, 10],
		monthlyHumidity: [70, 68, 62, 58, 62, 65, 68, 70, 72, 70, 72, 72],
		tempStdDev: 8,
		precipPersistence: 0.6,
		conditionWeights: {
			winter: { clear: 0.3, overcast: 0.35, snow: 0.2, rain: 0.15 },
			spring: { clear: 0.35, partly_cloudy: 0.3, rain: 0.25, overcast: 0.1 },
			summer: { sunny: 0.45, partly_cloudy: 0.3, thunderstorm: 0.15, clear: 0.1 },
			fall: { clear: 0.35, overcast: 0.3, rain: 0.2, partly_cloudy: 0.15 },
		},
	},
	desert: {
		type: 'desert',
		monthlyHighs: [67, 72, 80, 89, 99, 109, 111, 109, 103, 91, 77, 67],
		monthlyLows: [45, 49, 55, 63, 72, 81, 87, 85, 78, 65, 53, 45],
		monthlyPrecipDays: [3, 3, 2, 1, 1, 0, 2, 3, 2, 2, 2, 3],
		monthlyHumidity: [35, 30, 25, 18, 15, 12, 25, 30, 28, 25, 30, 38],
		tempStdDev: 6,
		precipPersistence: 0.3,
		conditionWeights: {
			winter: { sunny: 0.6, clear: 0.3, partly_cloudy: 0.1 },
			spring: { sunny: 0.7, clear: 0.2, windy: 0.1 },
			summer: { hot: 0.5, sunny: 0.3, thunderstorm: 0.15, clear: 0.05 },
			fall: { sunny: 0.6, clear: 0.3, partly_cloudy: 0.1 },
		},
	},
	arctic: {
		type: 'arctic',
		monthlyHighs: [5, 8, 18, 32, 45, 55, 60, 57, 47, 32, 18, 8],
		monthlyLows: [-12, -10, 0, 18, 32, 42, 47, 45, 36, 22, 8, -5],
		monthlyPrecipDays: [8, 7, 7, 6, 7, 8, 10, 11, 10, 10, 9, 8],
		monthlyHumidity: [75, 73, 70, 68, 70, 75, 80, 82, 80, 78, 76, 75],
		tempStdDev: 10,
		precipPersistence: 0.7,
		conditionWeights: {
			winter: { snow: 0.4, overcast: 0.3, cold: 0.2, clear: 0.1 },
			spring: { overcast: 0.3, snow: 0.3, partly_cloudy: 0.25, clear: 0.15 },
			summer: { partly_cloudy: 0.35, overcast: 0.3, rain: 0.2, clear: 0.15 },
			fall: { overcast: 0.35, snow: 0.25, cold: 0.2, partly_cloudy: 0.2 },
		},
	},
	tropical: {
		type: 'tropical',
		monthlyHighs: [87, 88, 89, 90, 90, 89, 88, 88, 88, 88, 87, 87],
		monthlyLows: [73, 73, 74, 75, 76, 76, 75, 75, 75, 75, 74, 73],
		monthlyPrecipDays: [8, 6, 7, 10, 15, 18, 20, 19, 17, 15, 12, 9],
		monthlyHumidity: [78, 75, 74, 76, 82, 85, 86, 86, 85, 84, 82, 80],
		tempStdDev: 3,
		precipPersistence: 0.7,
		conditionWeights: {
			winter: { sunny: 0.4, partly_cloudy: 0.35, rain: 0.2, humid: 0.05 },
			spring: { partly_cloudy: 0.35, rain: 0.3, thunderstorm: 0.2, humid: 0.15 },
			summer: { rain: 0.35, thunderstorm: 0.25, humid: 0.25, overcast: 0.15 },
			fall: { partly_cloudy: 0.3, rain: 0.3, humid: 0.2, thunderstorm: 0.2 },
		},
	},
	mediterranean: {
		type: 'mediterranean',
		monthlyHighs: [55, 58, 63, 70, 78, 87, 93, 93, 86, 75, 63, 55],
		monthlyLows: [40, 42, 45, 50, 57, 64, 70, 70, 64, 55, 47, 41],
		monthlyPrecipDays: [9, 8, 7, 5, 2, 1, 0, 1, 2, 5, 7, 9],
		monthlyHumidity: [72, 68, 62, 55, 48, 42, 38, 40, 48, 58, 68, 73],
		tempStdDev: 5,
		precipPersistence: 0.5,
		conditionWeights: {
			winter: { rain: 0.35, overcast: 0.3, partly_cloudy: 0.2, clear: 0.15 },
			spring: { sunny: 0.4, partly_cloudy: 0.35, clear: 0.15, rain: 0.1 },
			summer: { sunny: 0.6, hot: 0.25, clear: 0.1, partly_cloudy: 0.05 },
			fall: { partly_cloudy: 0.35, sunny: 0.3, rain: 0.2, overcast: 0.15 },
		},
	},
	continental: {
		type: 'continental',
		monthlyHighs: [32, 37, 48, 62, 73, 82, 87, 85, 76, 63, 48, 35],
		monthlyLows: [17, 21, 30, 40, 51, 61, 66, 64, 55, 43, 32, 22],
		monthlyPrecipDays: [9, 8, 10, 11, 12, 10, 9, 9, 8, 8, 9, 9],
		monthlyHumidity: [72, 70, 65, 58, 60, 62, 65, 68, 70, 68, 72, 74],
		tempStdDev: 12,
		precipPersistence: 0.55,
		conditionWeights: {
			winter: { snow: 0.35, overcast: 0.3, cold: 0.2, clear: 0.15 },
			spring: { partly_cloudy: 0.3, rain: 0.3, clear: 0.25, thunderstorm: 0.15 },
			summer: { sunny: 0.35, hot: 0.25, thunderstorm: 0.25, partly_cloudy: 0.15 },
			fall: { clear: 0.35, overcast: 0.3, rain: 0.2, partly_cloudy: 0.15 },
		},
	},
	oceanic: {
		type: 'oceanic',
		monthlyHighs: [47, 49, 53, 58, 64, 69, 73, 73, 68, 59, 52, 47],
		monthlyLows: [38, 38, 41, 44, 50, 55, 59, 59, 55, 48, 43, 39],
		monthlyPrecipDays: [15, 12, 13, 11, 10, 9, 8, 9, 10, 13, 14, 15],
		monthlyHumidity: [85, 82, 78, 75, 76, 78, 80, 82, 83, 85, 86, 86],
		tempStdDev: 4,
		precipPersistence: 0.65,
		conditionWeights: {
			winter: { overcast: 0.4, rain: 0.35, drizzle: 0.15, foggy: 0.1 },
			spring: { partly_cloudy: 0.35, rain: 0.3, overcast: 0.2, drizzle: 0.15 },
			summer: { partly_cloudy: 0.4, overcast: 0.25, rain: 0.2, sunny: 0.15 },
			fall: { overcast: 0.35, rain: 0.35, drizzle: 0.15, foggy: 0.15 },
		},
	},
};

// ============================================
// Helpers
// ============================================

/**
 * Get season from month (Northern Hemisphere)
 */
function getSeason(month: number): 'winter' | 'spring' | 'summer' | 'fall' {
	if (month >= 3 && month <= 5) return 'spring';
	if (month >= 6 && month <= 8) return 'summer';
	if (month >= 9 && month <= 11) return 'fall';
	return 'winter';
}

/**
 * Get approximate sunrise/sunset for a month
 * Returns hours (e.g., 6.5 = 6:30 AM)
 */
function getApproxSunTimes(
	month: number,
	baseClimate: BaseClimateType,
): { sunrise: number; sunset: number } {
	// Base times vary by latitude approximation
	const latitudeEffect: Record<BaseClimateType, number> = {
		arctic: 3, // Extreme variation
		continental: 1.5,
		temperate: 1,
		oceanic: 0.8,
		mediterranean: 0.7,
		desert: 0.5,
		tropical: 0.3, // Minimal variation
	};

	const effect = latitudeEffect[baseClimate];

	// June = longest day (month 6), December = shortest (month 12)
	// Sinusoidal variation
	const dayOfYear = (month - 1) * 30 + 15; // Approximate
	const summerSolstice = 172; // ~June 21
	const variation = Math.cos(((dayOfYear - summerSolstice) * 2 * Math.PI) / 365);

	// Base: 6 AM sunrise, 6 PM sunset (equinox)
	const sunrise = 6 - variation * effect;
	const sunset = 18 + variation * effect;

	return { sunrise, sunset };
}

/**
 * Convert a fallback profile to ClimateNormals for a given month
 */
export function getClimateNormalsFromFallback(
	baseClimate: BaseClimateType,
	month: number,
): ClimateNormals {
	const profile = FALLBACK_PROFILES[baseClimate];
	const monthIndex = month - 1;
	const season = getSeason(month);
	const { sunrise, sunset } = getApproxSunTimes(month, baseClimate);

	// Calculate condition probabilities from weights
	const weights = profile.conditionWeights[season];
	const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

	// Map to standard condition probabilities
	const conditionProbabilities = {
		clear: ((weights.clear || 0) + (weights.sunny || 0)) / totalWeight || 0.2,
		partlyCloudy: (weights.partly_cloudy || 0) / totalWeight || 0.2,
		overcast: (weights.overcast || 0) / totalWeight || 0.2,
		rain:
			((weights.rain || 0) +
				(weights.drizzle || 0) +
				(weights.thunderstorm || 0)) /
				totalWeight || 0.2,
		snow: (weights.snow || 0) / totalWeight || 0,
	};

	// Estimate precipitation (inches/day based on precip days)
	const avgPrecipitation = (profile.monthlyPrecipDays[monthIndex] / 30) * 0.15; // ~0.15" per rainy day

	return {
		latitude: 0, // Unknown for fallback
		longitude: 0,
		month,
		avgHigh: profile.monthlyHighs[monthIndex],
		avgLow: profile.monthlyLows[monthIndex],
		avgPrecipitation,
		avgPrecipDays: profile.monthlyPrecipDays[monthIndex],
		avgHumidity: profile.monthlyHumidity[monthIndex],
		avgWindSpeed: 8, // Default moderate wind
		avgCloudCover: 50, // Default moderate clouds
		avgSunriseHour: sunrise,
		avgSunsetHour: sunset,
		tempStdDev: profile.tempStdDev,
		conditionProbabilities,
	};
}

/**
 * Get a fallback profile by type
 */
export function getFallbackProfile(type: BaseClimateType): FallbackClimateProfile {
	return FALLBACK_PROFILES[type];
}

/**
 * Determine most likely base climate type from temperature and conditions
 */
export function inferBaseClimateType(
	avgTemp: number,
	humidity: number,
	condition: string,
): BaseClimateType {
	const conditionLower = condition.toLowerCase();

	// Check for obvious conditions
	if (conditionLower.includes('snow') || conditionLower.includes('blizzard')) {
		return avgTemp < 20 ? 'arctic' : 'continental';
	}

	if (conditionLower.includes('hot') || avgTemp > 95) {
		return humidity < 40 ? 'desert' : 'tropical';
	}

	// Temperature-based heuristics
	if (avgTemp < 32) return 'arctic';
	if (avgTemp > 85 && humidity > 70) return 'tropical';
	if (avgTemp > 85 && humidity < 40) return 'desert';
	if (humidity > 75) return 'oceanic';

	// Default to temperate
	return 'temperate';
}
