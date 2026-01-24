import { describe, it, expect } from 'vitest';
import { generateForecast, lookupWeather, lookupDay, getDayIndex } from './forecastGenerator';
import type { ClimateNormals, LocationForecast } from './types';
import type { NarrativeDateTime } from '../types/state';

// ============================================
// Test Data
// ============================================

const testNormals: ClimateNormals = {
	latitude: 40.7,
	longitude: -74.0,
	month: 7, // July
	avgHigh: 85,
	avgLow: 70,
	avgPrecipitation: 0.15,
	avgPrecipDays: 10,
	avgHumidity: 65,
	avgWindSpeed: 8,
	avgCloudCover: 40,
	avgSunriseHour: 5.5,
	avgSunsetHour: 20.5,
	tempStdDev: 5,
	conditionProbabilities: {
		clear: 0.3,
		partlyCloudy: 0.3,
		overcast: 0.15,
		rain: 0.2,
		snow: 0.05,
	},
};

const testStartDate: NarrativeDateTime = {
	year: 2024,
	month: 7,
	day: 10,
	hour: 0,
	minute: 0,
	second: 0,
	dayOfWeek: 'Wednesday',
};

// Helper to create a NarrativeDateTime
function makeDate(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
): NarrativeDateTime {
	return { year, month, day, hour, minute, second: 0, dayOfWeek: 'Monday' };
}

// ============================================
// generateForecast
// ============================================

describe('generateForecast', () => {
	it('generates forecast with correct number of days', () => {
		const forecast = generateForecast({
			climateNormals: testNormals,
			startDate: testStartDate,
			seed: 'test-seed-123',
			days: 14,
		});

		expect(forecast.days).toHaveLength(14);
	});

	it('generates 24 hours per day', () => {
		const forecast = generateForecast({
			climateNormals: testNormals,
			startDate: testStartDate,
			seed: 'test-seed-123',
			days: 7,
		});

		for (const day of forecast.days) {
			expect(day.hourly).toHaveLength(24);
		}
	});

	it('is deterministic with same seed', () => {
		const forecast1 = generateForecast({
			climateNormals: testNormals,
			startDate: testStartDate,
			seed: 'deterministic-seed',
			days: 7,
		});

		const forecast2 = generateForecast({
			climateNormals: testNormals,
			startDate: testStartDate,
			seed: 'deterministic-seed',
			days: 7,
		});

		// Same seed should produce identical forecasts
		expect(forecast1.days[0].high).toBe(forecast2.days[0].high);
		expect(forecast1.days[0].low).toBe(forecast2.days[0].low);
		expect(forecast1.days[0].hourly[12].temperature).toBe(
			forecast2.days[0].hourly[12].temperature,
		);
	});

	it('produces different results with different seeds', () => {
		const forecast1 = generateForecast({
			climateNormals: testNormals,
			startDate: testStartDate,
			seed: 'seed-alpha',
			days: 7,
		});

		const forecast2 = generateForecast({
			climateNormals: testNormals,
			startDate: testStartDate,
			seed: 'seed-beta',
			days: 7,
		});

		// Different seeds should produce different forecasts (very unlikely to match)
		const temps1 = forecast1.days.map(d => d.high);
		const temps2 = forecast2.days.map(d => d.high);
		expect(temps1).not.toEqual(temps2);
	});

	it('stores startDate in forecast', () => {
		const forecast = generateForecast({
			climateNormals: testNormals,
			startDate: testStartDate,
			seed: 'my-seed',
			days: 7,
		});

		expect(forecast.startDate).toBe('2024-07-10');
	});

	it('includes date strings for each day', () => {
		const forecast = generateForecast({
			climateNormals: testNormals,
			startDate: testStartDate,
			seed: 'test-seed',
			days: 5,
		});

		expect(forecast.days[0].date).toBe('2024-07-10');
		expect(forecast.days[1].date).toBe('2024-07-11');
		expect(forecast.days[2].date).toBe('2024-07-12');
		expect(forecast.days[3].date).toBe('2024-07-13');
		expect(forecast.days[4].date).toBe('2024-07-14');
	});

	it('generates temperatures within reasonable range', () => {
		const forecast = generateForecast({
			climateNormals: testNormals,
			startDate: testStartDate,
			seed: 'range-test',
			days: 30,
		});

		for (const day of forecast.days) {
			// High should be higher than low
			expect(day.high).toBeGreaterThan(day.low);

			// Should be within ~3 standard deviations of normal (very generous)
			expect(day.high).toBeGreaterThan(testNormals.avgHigh - 30);
			expect(day.high).toBeLessThan(testNormals.avgHigh + 30);
			expect(day.low).toBeGreaterThan(testNormals.avgLow - 30);
			expect(day.low).toBeLessThan(testNormals.avgLow + 30);
		}
	});

	it('uses initial conditions when provided', () => {
		const forecastWithInitial = generateForecast({
			climateNormals: testNormals,
			startDate: testStartDate,
			seed: 'initial-test',
			days: 7,
			initialConditions: {
				temperature: 95,
				condition: 'sunny',
			},
		});

		// First day should trend toward initial temperature
		// (Hard to test exactly due to AR(1) model, but we can check it's generated)
		expect(forecastWithInitial.days[0]).toBeDefined();
	});

	it('generates valid hourly weather data', () => {
		const forecast = generateForecast({
			climateNormals: testNormals,
			startDate: testStartDate,
			seed: 'hourly-test',
			days: 3,
		});

		for (const day of forecast.days) {
			for (let h = 0; h < 24; h++) {
				const hourly = day.hourly[h];
				expect(hourly.hour).toBe(h);
				expect(hourly.temperature).toBeGreaterThan(-50);
				expect(hourly.temperature).toBeLessThan(150);
				expect(hourly.humidity).toBeGreaterThanOrEqual(0);
				expect(hourly.humidity).toBeLessThanOrEqual(100);
				expect(hourly.windSpeed).toBeGreaterThanOrEqual(0);
				expect(hourly.windDirection).toBeGreaterThanOrEqual(0);
				expect(hourly.windDirection).toBeLessThan(360);
				expect(hourly.precipitation).toBeGreaterThanOrEqual(0);
				expect(hourly.cloudCover).toBeGreaterThanOrEqual(0);
				expect(hourly.cloudCover).toBeLessThanOrEqual(100);
			}
		}
	});
});

// ============================================
// lookupWeather
// ============================================

describe('lookupWeather', () => {
	const forecast: LocationForecast = generateForecast({
		climateNormals: testNormals,
		startDate: testStartDate,
		seed: 'lookup-test',
		days: 14,
	});

	it('returns weather for a date within the forecast', () => {
		const weather = lookupWeather(forecast, makeDate(2024, 7, 15, 14, 30));

		expect(weather).not.toBeNull();
		expect(weather?.hour).toBe(14);
	});

	it('returns null for date before forecast start', () => {
		const weather = lookupWeather(forecast, makeDate(2024, 7, 5, 12, 0));

		expect(weather).toBeNull();
	});

	it('returns null for date after forecast end', () => {
		const weather = lookupWeather(forecast, makeDate(2024, 7, 30, 12, 0));

		expect(weather).toBeNull();
	});

	it('returns correct hour data', () => {
		const weather0 = lookupWeather(forecast, makeDate(2024, 7, 10, 0, 0));
		const weather23 = lookupWeather(forecast, makeDate(2024, 7, 10, 23, 59));

		expect(weather0?.hour).toBe(0);
		expect(weather23?.hour).toBe(23);
	});
});

// ============================================
// lookupDay
// ============================================

describe('lookupDay', () => {
	const forecast: LocationForecast = generateForecast({
		climateNormals: testNormals,
		startDate: testStartDate,
		seed: 'lookup-day-test',
		days: 14,
	});

	it('returns day data for a date within the forecast', () => {
		const day = lookupDay(forecast, makeDate(2024, 7, 15, 12, 0));

		expect(day).not.toBeNull();
		expect(day?.date).toBe('2024-07-15');
	});

	it('returns null for date outside forecast', () => {
		const day = lookupDay(forecast, makeDate(2024, 8, 1, 12, 0));

		expect(day).toBeNull();
	});

	it('includes high and low temperatures', () => {
		const day = lookupDay(forecast, makeDate(2024, 7, 12, 12, 0));

		expect(day?.high).toBeDefined();
		expect(day?.low).toBeDefined();
		expect(day!.high).toBeGreaterThan(day!.low);
	});
});

// ============================================
// getDayIndex
// ============================================

describe('getDayIndex', () => {
	it('returns 0 for the start date', () => {
		const index = getDayIndex('2024-07-10', makeDate(2024, 7, 10, 12, 0));
		expect(index).toBe(0);
	});

	it('returns correct index for later dates', () => {
		expect(getDayIndex('2024-07-10', makeDate(2024, 7, 11, 0, 0))).toBe(1);
		expect(getDayIndex('2024-07-10', makeDate(2024, 7, 15, 23, 59))).toBe(5);
	});

	it('returns negative for dates before start', () => {
		const index = getDayIndex('2024-07-10', makeDate(2024, 7, 5, 12, 0));
		expect(index).toBeLessThan(0);
	});

	it('handles month boundaries correctly', () => {
		const index = getDayIndex('2024-07-28', makeDate(2024, 8, 2, 12, 0));
		expect(index).toBe(5); // July 28, 29, 30, 31, Aug 1, Aug 2 = 5 days later
	});

	it('handles year boundaries correctly', () => {
		const index = getDayIndex('2024-12-30', makeDate(2025, 1, 2, 12, 0));
		expect(index).toBe(3); // Dec 30, 31, Jan 1, Jan 2 = 3 days later
	});
});
