import { describe, it, expect } from 'vitest';
import {
	FALLBACK_PROFILES,
	getClimateNormalsFromFallback,
	getFallbackProfile,
	inferBaseClimateType,
} from './fallbackProfiles';
import type { BaseClimateType } from './types';

// ============================================
// FALLBACK_PROFILES constant
// ============================================

describe('FALLBACK_PROFILES', () => {
	const climateTypes: BaseClimateType[] = [
		'temperate',
		'desert',
		'arctic',
		'tropical',
		'mediterranean',
		'continental',
		'oceanic',
	];

	it('has all 7 base climate types', () => {
		for (const type of climateTypes) {
			expect(FALLBACK_PROFILES[type]).toBeDefined();
		}
	});

	it('has 12 months of data for each profile', () => {
		for (const type of climateTypes) {
			const profile = FALLBACK_PROFILES[type];
			expect(profile.monthlyHighs).toHaveLength(12);
			expect(profile.monthlyLows).toHaveLength(12);
			expect(profile.monthlyPrecipDays).toHaveLength(12);
			expect(profile.monthlyHumidity).toHaveLength(12);
		}
	});

	it('has highs greater than lows for all months', () => {
		for (const type of climateTypes) {
			const profile = FALLBACK_PROFILES[type];
			for (let i = 0; i < 12; i++) {
				expect(profile.monthlyHighs[i]).toBeGreaterThan(
					profile.monthlyLows[i],
				);
			}
		}
	});

	it('has condition weights for all seasons', () => {
		const seasons = ['winter', 'spring', 'summer', 'fall'] as const;
		for (const type of climateTypes) {
			const profile = FALLBACK_PROFILES[type];
			for (const season of seasons) {
				expect(profile.conditionWeights[season]).toBeDefined();
				const weights = Object.values(profile.conditionWeights[season]);
				expect(weights.length).toBeGreaterThan(0);
				// Weights should sum close to 1
				const sum = weights.reduce((a, b) => a + b, 0);
				expect(sum).toBeCloseTo(1, 1);
			}
		}
	});

	describe('temperature ranges are climate-appropriate', () => {
		it('arctic has freezing temperatures', () => {
			const arctic = FALLBACK_PROFILES.arctic;
			// January should be very cold
			expect(arctic.monthlyHighs[0]).toBeLessThan(20);
			expect(arctic.monthlyLows[0]).toBeLessThan(0);
		});

		it('tropical has consistent warm temperatures', () => {
			const tropical = FALLBACK_PROFILES.tropical;
			// All months should be warm
			for (let i = 0; i < 12; i++) {
				expect(tropical.monthlyHighs[i]).toBeGreaterThan(80);
				expect(tropical.monthlyLows[i]).toBeGreaterThan(70);
			}
			// Temperature variance should be low
			const highVariance =
				Math.max(...tropical.monthlyHighs) -
				Math.min(...tropical.monthlyHighs);
			expect(highVariance).toBeLessThan(10);
		});

		it('desert has hot summers and large daily swings', () => {
			const desert = FALLBACK_PROFILES.desert;
			// July (index 6) should be very hot
			expect(desert.monthlyHighs[6]).toBeGreaterThan(105);
			// Daily range (high - low) should be large
			const dailyRange = desert.monthlyHighs[6] - desert.monthlyLows[6];
			expect(dailyRange).toBeGreaterThan(20);
		});

		it('continental has hot summers and cold winters', () => {
			const continental = FALLBACK_PROFILES.continental;
			// July should be warm
			expect(continental.monthlyHighs[6]).toBeGreaterThan(80);
			// January should be cold
			expect(continental.monthlyHighs[0]).toBeLessThan(40);
		});

		it('oceanic has mild temperatures year-round', () => {
			const oceanic = FALLBACK_PROFILES.oceanic;
			// No extreme heat
			expect(Math.max(...oceanic.monthlyHighs)).toBeLessThan(80);
			// No extreme cold
			expect(Math.min(...oceanic.monthlyLows)).toBeGreaterThan(30);
		});
	});

	describe('precipitation patterns are climate-appropriate', () => {
		it('desert has very few precipitation days', () => {
			const desert = FALLBACK_PROFILES.desert;
			const totalPrecipDays = desert.monthlyPrecipDays.reduce((a, b) => a + b, 0);
			expect(totalPrecipDays).toBeLessThan(30);
		});

		it('oceanic has frequent precipitation', () => {
			const oceanic = FALLBACK_PROFILES.oceanic;
			const totalPrecipDays = oceanic.monthlyPrecipDays.reduce(
				(a, b) => a + b,
				0,
			);
			expect(totalPrecipDays).toBeGreaterThan(100);
		});

		it('mediterranean has dry summers', () => {
			const mediterranean = FALLBACK_PROFILES.mediterranean;
			// July (index 6) should have almost no rain days
			expect(mediterranean.monthlyPrecipDays[6]).toBeLessThanOrEqual(1);
		});

		it('tropical has wet season', () => {
			const tropical = FALLBACK_PROFILES.tropical;
			// Summer months should have high precipitation
			expect(tropical.monthlyPrecipDays[6]).toBeGreaterThan(15);
		});
	});
});

// ============================================
// getFallbackProfile
// ============================================

describe('getFallbackProfile', () => {
	it('returns the correct profile for each type', () => {
		expect(getFallbackProfile('temperate').type).toBe('temperate');
		expect(getFallbackProfile('desert').type).toBe('desert');
		expect(getFallbackProfile('arctic').type).toBe('arctic');
		expect(getFallbackProfile('tropical').type).toBe('tropical');
		expect(getFallbackProfile('mediterranean').type).toBe('mediterranean');
		expect(getFallbackProfile('continental').type).toBe('continental');
		expect(getFallbackProfile('oceanic').type).toBe('oceanic');
	});
});

// ============================================
// getClimateNormalsFromFallback
// ============================================

describe('getClimateNormalsFromFallback', () => {
	it('returns correct avgHigh and avgLow for the month', () => {
		const normals = getClimateNormalsFromFallback('temperate', 7); // July
		expect(normals.avgHigh).toBe(FALLBACK_PROFILES.temperate.monthlyHighs[6]);
		expect(normals.avgLow).toBe(FALLBACK_PROFILES.temperate.monthlyLows[6]);
	});

	it('includes tempStdDev from profile', () => {
		const normals = getClimateNormalsFromFallback('continental', 1);
		expect(normals.tempStdDev).toBe(FALLBACK_PROFILES.continental.tempStdDev);
	});

	it('calculates avgPrecipitation from precip days', () => {
		const normals = getClimateNormalsFromFallback('oceanic', 12); // December
		expect(normals.avgPrecipitation).toBeGreaterThan(0);
	});

	it('includes avgPrecipDays', () => {
		const normals = getClimateNormalsFromFallback('desert', 6); // June
		expect(normals.avgPrecipDays).toBe(FALLBACK_PROFILES.desert.monthlyPrecipDays[5]);
	});

	it('includes humidity from profile', () => {
		const normals = getClimateNormalsFromFallback('tropical', 8);
		expect(normals.avgHumidity).toBe(FALLBACK_PROFILES.tropical.monthlyHumidity[7]);
	});

	it('has default wind speed and cloud cover', () => {
		const normals = getClimateNormalsFromFallback('temperate', 3);
		expect(normals.avgWindSpeed).toBe(8);
		expect(normals.avgCloudCover).toBe(50);
	});

	it('sets latitude/longitude to 0 (unknown)', () => {
		const normals = getClimateNormalsFromFallback('arctic', 1);
		expect(normals.latitude).toBe(0);
		expect(normals.longitude).toBe(0);
	});

	it('calculates appropriate sunrise/sunset times', () => {
		// Summer in arctic should have long days
		const arcticSummer = getClimateNormalsFromFallback('arctic', 6); // June
		expect(arcticSummer.avgSunsetHour - arcticSummer.avgSunriseHour).toBeGreaterThan(
			14,
		);

		// Winter in arctic should have short days
		const arcticWinter = getClimateNormalsFromFallback('arctic', 12); // December
		expect(arcticWinter.avgSunsetHour - arcticWinter.avgSunriseHour).toBeLessThan(10);

		// Tropical should have consistent day length
		const tropicalJune = getClimateNormalsFromFallback('tropical', 6);
		const tropicalDec = getClimateNormalsFromFallback('tropical', 12);
		const juneDayLength = tropicalJune.avgSunsetHour - tropicalJune.avgSunriseHour;
		const decDayLength = tropicalDec.avgSunsetHour - tropicalDec.avgSunriseHour;
		expect(Math.abs(juneDayLength - decDayLength)).toBeLessThan(2);
	});

	it('includes condition probabilities', () => {
		const normals = getClimateNormalsFromFallback('temperate', 7);
		expect(normals.conditionProbabilities).toBeDefined();
		expect(normals.conditionProbabilities.clear).toBeGreaterThanOrEqual(0);
		expect(normals.conditionProbabilities.rain).toBeGreaterThanOrEqual(0);
	});

	it('handles month correctly (1-indexed)', () => {
		// January is month 1, which should map to index 0
		const jan = getClimateNormalsFromFallback('temperate', 1);
		expect(jan.month).toBe(1);
		expect(jan.avgHigh).toBe(FALLBACK_PROFILES.temperate.monthlyHighs[0]);

		// December is month 12, which should map to index 11
		const dec = getClimateNormalsFromFallback('temperate', 12);
		expect(dec.month).toBe(12);
		expect(dec.avgHigh).toBe(FALLBACK_PROFILES.temperate.monthlyHighs[11]);
	});
});

// ============================================
// inferBaseClimateType
// ============================================

describe('inferBaseClimateType', () => {
	describe('condition-based inference', () => {
		it('returns arctic for snow with very cold temps', () => {
			expect(inferBaseClimateType(10, 50, 'heavy snow')).toBe('arctic');
		});

		it('returns continental for snow with moderately cold temps', () => {
			expect(inferBaseClimateType(30, 50, 'light snow')).toBe('continental');
		});

		it('returns arctic for blizzard conditions', () => {
			expect(inferBaseClimateType(5, 60, 'blizzard')).toBe('arctic');
		});

		it('returns desert for hot with low humidity', () => {
			expect(inferBaseClimateType(100, 25, 'hot')).toBe('desert');
		});

		it('returns tropical for hot with high humidity', () => {
			expect(inferBaseClimateType(100, 80, 'hot and humid')).toBe('tropical');
		});
	});

	describe('temperature-based inference', () => {
		it('returns arctic for very cold temperatures', () => {
			expect(inferBaseClimateType(20, 50, 'clear')).toBe('arctic');
		});

		it('returns tropical for hot and humid', () => {
			expect(inferBaseClimateType(90, 80, 'clear')).toBe('tropical');
		});

		it('returns desert for hot and dry', () => {
			expect(inferBaseClimateType(90, 30, 'clear')).toBe('desert');
		});

		it('returns oceanic for high humidity', () => {
			expect(inferBaseClimateType(60, 80, 'cloudy')).toBe('oceanic');
		});

		it('defaults to temperate for moderate conditions', () => {
			expect(inferBaseClimateType(65, 55, 'partly cloudy')).toBe('temperate');
		});
	});

	describe('edge cases', () => {
		it('handles boundary temperatures', () => {
			// Just below 32°F - should be arctic
			expect(inferBaseClimateType(31, 50, 'clear')).toBe('arctic');

			// Exactly 32°F and above - should not be arctic (uses < 32 check)
			expect(inferBaseClimateType(32, 50, 'clear')).toBe('temperate');
		});

		it('handles boundary humidity', () => {
			// Exactly 75% - should not trigger oceanic
			expect(inferBaseClimateType(60, 75, 'cloudy')).toBe('temperate');

			// Above 75% - should be oceanic
			expect(inferBaseClimateType(60, 76, 'cloudy')).toBe('oceanic');
		});

		it('is case insensitive for conditions', () => {
			expect(inferBaseClimateType(10, 50, 'HEAVY SNOW')).toBe('arctic');
			expect(inferBaseClimateType(100, 25, 'HOT')).toBe('desert');
		});
	});
});
