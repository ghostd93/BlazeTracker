import { describe, it, expect } from 'vitest';
import {
	shouldMentionTransition,
	getTransitionText,
	generateTransitionInjection,
} from './weatherTransitions';
import type { ProceduralClimate, WeatherCondition } from './types';

// ============================================
// Test Helpers
// ============================================

function createClimate(
	conditionType: WeatherCondition,
	overrides: Partial<ProceduralClimate> = {},
): ProceduralClimate {
	return {
		temperature: 70,
		outdoorTemperature: 70,
		feelsLike: 70,
		humidity: 50,
		windSpeed: 10,
		windDirection: 'S',
		precipitation: 0,
		cloudCover: 30,
		conditions: 'test',
		conditionType,
		uvIndex: 5,
		daylight: 'day',
		isIndoors: false,
		...overrides,
	};
}

// ============================================
// shouldMentionTransition
// ============================================

describe('shouldMentionTransition', () => {
	describe('condition type changes', () => {
		it('returns true for significant condition changes', () => {
			const prev = createClimate('clear');
			const next = createClimate('rain');
			expect(shouldMentionTransition(prev, next)).toBe(true);
		});

		it('returns true for weather turning severe', () => {
			const prev = createClimate('rain');
			const next = createClimate('thunderstorm');
			expect(shouldMentionTransition(prev, next)).toBe(true);
		});

		it('returns false for minor transitions (clear/sunny)', () => {
			const prev = createClimate('clear');
			const next = createClimate('sunny');
			expect(shouldMentionTransition(prev, next)).toBe(false);
		});

		it('returns false for minor transitions (partly_cloudy/overcast)', () => {
			const prev = createClimate('partly_cloudy');
			const next = createClimate('overcast');
			expect(shouldMentionTransition(prev, next)).toBe(false);
		});

		it('handles minor transitions in both directions', () => {
			expect(
				shouldMentionTransition(
					createClimate('sunny'),
					createClimate('clear'),
				),
			).toBe(false);
			expect(
				shouldMentionTransition(
					createClimate('overcast'),
					createClimate('partly_cloudy'),
				),
			).toBe(false);
		});
	});

	describe('temperature changes', () => {
		it('returns true for large temperature change (>10°F)', () => {
			const prev = createClimate('clear', { temperature: 70 });
			const next = createClimate('clear', { temperature: 55 });
			expect(shouldMentionTransition(prev, next)).toBe(true);
		});

		it('returns false for small temperature change', () => {
			const prev = createClimate('clear', { temperature: 70 });
			const next = createClimate('clear', { temperature: 75 });
			expect(shouldMentionTransition(prev, next)).toBe(false);
		});

		it('considers exactly 10°F change as not significant', () => {
			const prev = createClimate('clear', { temperature: 70 });
			const next = createClimate('clear', { temperature: 80 });
			expect(shouldMentionTransition(prev, next)).toBe(false);
		});
	});

	describe('precipitation changes', () => {
		it('returns true when precipitation starts', () => {
			const prev = createClimate('clear', { precipitation: 0 });
			const next = createClimate('rain', { precipitation: 0.1 });
			expect(shouldMentionTransition(prev, next)).toBe(true);
		});

		it('returns true when precipitation stops', () => {
			const prev = createClimate('rain', { precipitation: 0.1 });
			const next = createClimate('clear', { precipitation: 0 });
			expect(shouldMentionTransition(prev, next)).toBe(true);
		});

		it('uses threshold of 0.02 inches', () => {
			// Both below threshold - no significant change
			const prev = createClimate('clear', { precipitation: 0.01 });
			const next = createClimate('clear', { precipitation: 0.015 });
			expect(shouldMentionTransition(prev, next)).toBe(false);
		});
	});

	describe('wind changes', () => {
		it('returns true for significant wind increase', () => {
			const prev = createClimate('clear', { windSpeed: 10 });
			const next = createClimate('windy', { windSpeed: 35 });
			expect(shouldMentionTransition(prev, next)).toBe(true);
		});

		it('returns true for significant wind decrease', () => {
			const prev = createClimate('windy', { windSpeed: 35 });
			const next = createClimate('clear', { windSpeed: 10 });
			expect(shouldMentionTransition(prev, next)).toBe(true);
		});

		it('requires >15 mph change AND one value >20 mph', () => {
			// 15 mph change but neither over 20 - not significant
			const prev = createClimate('clear', { windSpeed: 5 });
			const next = createClimate('clear', { windSpeed: 18 });
			expect(shouldMentionTransition(prev, next)).toBe(false);

			// 15 mph change but with one over 20 - significant
			const prev2 = createClimate('clear', { windSpeed: 10 });
			const next2 = createClimate('windy', { windSpeed: 26 });
			expect(shouldMentionTransition(prev2, next2)).toBe(true);
		});
	});

	describe('combined changes', () => {
		it('returns false when nothing significant changes', () => {
			const prev = createClimate('clear', {
				temperature: 70,
				precipitation: 0,
				windSpeed: 10,
			});
			const next = createClimate('clear', {
				temperature: 72,
				precipitation: 0,
				windSpeed: 12,
			});
			expect(shouldMentionTransition(prev, next)).toBe(false);
		});
	});
});

// ============================================
// getTransitionText
// ============================================

describe('getTransitionText', () => {
	describe('predefined transitions', () => {
		it('returns text for clear to overcast', () => {
			const text = getTransitionText('clear', 'overcast');
			expect(text).toBeTruthy();
			expect(text?.toLowerCase()).toContain('cloud');
		});

		it('returns text for overcast to rain', () => {
			const text = getTransitionText('overcast', 'rain');
			expect(text).toBeTruthy();
			expect(text?.toLowerCase()).toContain('rain');
		});

		it('returns text for rain to clear', () => {
			const text = getTransitionText('rain', 'clear');
			expect(text).toBeTruthy();
		});

		it('returns text for rain to thunderstorm', () => {
			const text = getTransitionText('rain', 'thunderstorm');
			expect(text).toBeTruthy();
			expect(text?.toLowerCase()).toMatch(/thunder|lightning|storm/);
		});

		it('returns text for snow transitions', () => {
			expect(getTransitionText('snow', 'clear')).toBeTruthy();
			expect(getTransitionText('heavy_snow', 'snow')).toBeTruthy();
			expect(getTransitionText('blizzard', 'snow')).toBeTruthy();
		});

		it('returns text for fog transitions', () => {
			expect(getTransitionText('clear', 'foggy')).toBeTruthy();
			expect(getTransitionText('foggy', 'clear')).toBeTruthy();
		});

		it('returns text for wind transitions', () => {
			expect(getTransitionText('clear', 'windy')).toBeTruthy();
			expect(getTransitionText('windy', 'clear')).toBeTruthy();
		});

		it('returns text for temperature transitions', () => {
			expect(getTransitionText('clear', 'hot')).toBeTruthy();
			expect(getTransitionText('hot', 'clear')).toBeTruthy();
			expect(getTransitionText('clear', 'cold')).toBeTruthy();
			expect(getTransitionText('cold', 'clear')).toBeTruthy();
		});
	});

	describe('reverse transitions', () => {
		it('generates generic text for reverse of known transitions', () => {
			// sunny to clear is not explicitly defined but clear to sunny might be
			// Test a reverse that uses the generic "shifts to" pattern
			const text = getTransitionText('snow', 'rain');
			expect(text).toBeTruthy();
		});
	});

	describe('unmapped transitions', () => {
		it('generates generic text for unknown transitions', () => {
			const text = getTransitionText('humid', 'blizzard');
			expect(text).toBeTruthy();
			expect(text).toContain('humid');
			expect(text).toContain('blizzard');
		});
	});

	describe('same condition (temperature only)', () => {
		it('returns warming text for positive temp change', () => {
			const text = getTransitionText('clear', 'clear', 15);
			expect(text).toBeTruthy();
			expect(text?.toLowerCase()).toContain('warm');
		});

		it('returns cooling text for negative temp change', () => {
			const text = getTransitionText('clear', 'clear', -15);
			expect(text).toBeTruthy();
			expect(text?.toLowerCase()).toContain('chill');
		});

		it('returns null for small temperature changes', () => {
			const text = getTransitionText('clear', 'clear', 5);
			expect(text).toBeNull();
		});

		it('returns null for no change', () => {
			const text = getTransitionText('clear', 'clear');
			expect(text).toBeNull();
		});
	});
});

// ============================================
// generateTransitionInjection
// ============================================

describe('generateTransitionInjection', () => {
	it('returns null for insignificant transitions', () => {
		const prev = createClimate('clear');
		const next = createClimate('sunny');
		expect(generateTransitionInjection(prev, next)).toBeNull();
	});

	it('returns text for significant transitions', () => {
		const prev = createClimate('clear');
		const next = createClimate('rain', { precipitation: 0.1 });
		const text = generateTransitionInjection(prev, next);
		expect(text).toBeTruthy();
	});

	it('returns text for temperature-only changes', () => {
		const prev = createClimate('clear', { temperature: 70 });
		const next = createClimate('clear', { temperature: 55 });
		const text = generateTransitionInjection(prev, next);
		expect(text).toBeTruthy();
	});

	it('combines condition and temperature context', () => {
		const prev = createClimate('sunny', { temperature: 80 });
		const next = createClimate('cold', { temperature: 10 });
		const text = generateTransitionInjection(prev, next);
		expect(text).toBeTruthy();
	});
});
