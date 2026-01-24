/**
 * Forecast Generator
 *
 * Generates a 4-week weather forecast with realistic day-to-day variation
 * using autocorrelated temperature generation and Markov chain precipitation.
 */

import seedrandom from 'seedrandom';
import type {
	ClimateNormals,
	DailyForecast,
	HourlyWeather,
	LocationForecast,
	WeatherCondition,
} from './types';
import type { NarrativeDateTime } from '../types/state';
import { deriveCondition, calculateFeelsLike, getDominantCondition } from './weatherDeriver';

// ============================================
// Types
// ============================================

export interface ForecastGeneratorParams {
	climateNormals: ClimateNormals;
	startDate: NarrativeDateTime;
	initialConditions?: {
		temperature: number;
		condition: string;
	} | null;
	seed: string;
	days?: number; // Default 28
}

interface DayGeneratorState {
	prevDayMeanTemp: number;
	wasRaining: boolean;
	rng: () => number;
}

// ============================================
// Random Utilities
// ============================================

/**
 * Box-Muller transform for Gaussian random numbers
 */
function gaussianRandom(rng: () => number): number {
	let u = 0,
		v = 0;
	while (u === 0) u = rng(); // Avoid 0
	while (v === 0) v = rng();
	return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

// ============================================
// Date Utilities
// ============================================

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Add days to a date
 */
function addDays(
	year: number,
	month: number,
	day: number,
	daysToAdd: number,
): { year: number; month: number; day: number } {
	const date = new Date(year, month - 1, day + daysToAdd);
	return {
		year: date.getFullYear(),
		month: date.getMonth() + 1,
		day: date.getDate(),
	};
}

// ============================================
// Temperature Generation
// ============================================

/**
 * Generate daily high/low temperatures using AR(1) process
 * This creates realistic day-to-day correlation
 */
function generateDailyTemps(
	normals: ClimateNormals,
	state: DayGeneratorState,
	dayIndex: number,
	initialAnchor?: { temperature: number } | null,
): { high: number; low: number; meanTemp: number } {
	const phi = 0.75; // Autocorrelation coefficient
	const mean = (normals.avgHigh + normals.avgLow) / 2;
	const range = normals.avgHigh - normals.avgLow;

	let todayMean: number;

	// For day 0 with initial anchor, use the anchor
	if (dayIndex === 0 && initialAnchor) {
		todayMean = initialAnchor.temperature;
	}
	// For days 1-2 with anchor, blend toward normals
	else if (dayIndex <= 2 && initialAnchor) {
		const blendFactor = dayIndex / 3;
		const noise =
			gaussianRandom(state.rng) *
			normals.tempStdDev *
			Math.sqrt(1 - phi * phi) *
			blendFactor;
		todayMean =
			state.prevDayMeanTemp * (1 - blendFactor) +
			(mean + phi * (state.prevDayMeanTemp - mean) + noise) * blendFactor;
	}
	// Normal AR(1) process
	else {
		const noise =
			gaussianRandom(state.rng) * normals.tempStdDev * Math.sqrt(1 - phi * phi);
		todayMean = mean + phi * (state.prevDayMeanTemp - mean) + noise;
	}

	// Calculate high and low from mean
	const high = todayMean + range / 2;
	const low = todayMean - range / 2;

	return {
		high: Math.round(high),
		low: Math.round(low),
		meanTemp: todayMean,
	};
}

/**
 * Generate hourly temperatures using sinusoidal interpolation
 */
function generateHourlyTemp(
	hour: number,
	high: number,
	low: number,
	sunrise: number,
	sunset: number,
): number {
	// Temperature minimum occurs near sunrise
	// Temperature maximum occurs ~2-3 hours after solar noon
	const solarNoon = (sunrise + sunset) / 2;
	const peakHour = solarNoon + 2;

	// Use sinusoidal model
	// Minimum at sunrise, maximum at peak hour
	const range = high - low;

	if (hour < sunrise) {
		// Pre-dawn: gradually cooling toward minimum
		const nightLength = 24 - sunset + sunrise;
		const hoursFromSunset = hour + (24 - sunset);
		const progress = hoursFromSunset / nightLength;
		return low + range * 0.3 * (1 - progress);
	} else if (hour < peakHour) {
		// Morning: warming toward peak
		const morningLength = peakHour - sunrise;
		const progress = (hour - sunrise) / morningLength;
		// Sinusoidal ease-in
		const factor = Math.sin((progress * Math.PI) / 2);
		return low + range * factor;
	} else if (hour < sunset) {
		// Afternoon: cooling from peak
		const afternoonLength = sunset - peakHour;
		const progress = (hour - peakHour) / afternoonLength;
		// Sinusoidal ease-out
		const factor = Math.cos((progress * Math.PI) / 2);
		return low + range * factor;
	} else {
		// Evening: continued cooling
		const eveningLength = 24 - sunset + sunrise;
		const progress = (hour - sunset) / eveningLength;
		return low + range * 0.3 * (1 - progress);
	}
}

// ============================================
// Precipitation Generation
// ============================================

/**
 * Determine if it's raining today using Markov chain
 */
function willRainToday(normals: ClimateNormals, state: DayGeneratorState): boolean {
	const baseProbability = normals.avgPrecipDays / 30;

	// Persistence: if it rained yesterday, more likely today
	const persistence = 0.6;
	const probability = state.wasRaining
		? baseProbability + (1 - baseProbability) * persistence
		: baseProbability * (1 - persistence * 0.5);

	return state.rng() < probability;
}

/**
 * Generate hourly precipitation amounts
 */
function generateHourlyPrecip(
	isRaining: boolean,
	normals: ClimateNormals,
	rng: () => number,
): number[] {
	const hourly = new Array(24).fill(0);

	if (!isRaining) return hourly;

	// Determine rain pattern
	// 60% chance of sustained rain, 40% chance of scattered showers
	const sustained = rng() < 0.6;

	if (sustained) {
		// Pick a start hour and duration
		const startHour = Math.floor(rng() * 18); // Start between 0-17
		const duration = Math.floor(rng() * 8) + 4; // 4-12 hours

		for (let h = startHour; h < Math.min(startHour + duration, 24); h++) {
			// Base intensity with some variation
			const intensity = (0.05 + rng() * 0.15) * (normals.avgPrecipitation * 30);
			hourly[h] = Math.max(0.01, intensity);
		}
	} else {
		// Scattered showers - 2-4 short bursts
		const numBursts = Math.floor(rng() * 3) + 2;
		for (let i = 0; i < numBursts; i++) {
			const burstHour = Math.floor(rng() * 24);
			const burstDuration = Math.floor(rng() * 2) + 1;
			for (let h = burstHour; h < Math.min(burstHour + burstDuration, 24); h++) {
				const intensity =
					(0.02 + rng() * 0.1) * (normals.avgPrecipitation * 30);
				hourly[h] = Math.max(0.01, intensity);
			}
		}
	}

	return hourly;
}

// ============================================
// Cloud Cover Generation
// ============================================

/**
 * Generate hourly cloud cover
 */
function generateHourlyClouds(
	isRaining: boolean,
	precipHourly: number[],
	normals: ClimateNormals,
	rng: () => number,
): number[] {
	// Base cloud cover from normals
	const baseClouds = normals.avgCloudCover;

	return precipHourly.map((precip, hour) => {
		// If raining, clouds are high
		if (precip > 0.01) {
			return clamp(80 + rng() * 20, 70, 100);
		}

		// Otherwise, use base with variation
		const variation = (rng() - 0.5) * 30;
		let clouds = baseClouds + variation;

		// Morning tends to be clearer
		if (hour >= 6 && hour <= 10) {
			clouds -= 10;
		}

		// Afternoon buildup (especially in summer)
		if (hour >= 14 && hour <= 17) {
			clouds += 10;
		}

		return clamp(clouds, 0, 100);
	});
}

// ============================================
// Wind Generation
// ============================================

/**
 * Generate hourly wind speed and direction
 */
function generateHourlyWind(
	normals: ClimateNormals,
	rng: () => number,
): { speed: number[]; direction: number[] } {
	const baseSpeed = normals.avgWindSpeed;
	const speed: number[] = [];
	const direction: number[] = [];

	// Pick a prevailing direction for the day
	const prevailingDir = rng() * 360;

	for (let h = 0; h < 24; h++) {
		// Wind is typically lighter at night, stronger in afternoon
		let timeMultiplier = 1;
		if (h >= 0 && h < 6) timeMultiplier = 0.6;
		else if (h >= 12 && h < 18) timeMultiplier = 1.3;

		// Random variation
		const variation = 0.7 + rng() * 0.6; // 0.7 to 1.3

		speed.push(Math.max(0, Math.round(baseSpeed * timeMultiplier * variation)));

		// Direction varies around prevailing
		const dirVariation = (rng() - 0.5) * 60; // ±30 degrees
		direction.push((prevailingDir + dirVariation + 360) % 360);
	}

	return { speed, direction };
}

// ============================================
// Humidity Generation
// ============================================

/**
 * Generate hourly humidity
 */
function generateHourlyHumidity(
	hourlyTemp: number[],
	precipHourly: number[],
	high: number,
	low: number,
	normals: ClimateNormals,
	rng: () => number,
): number[] {
	const baseHumidity = normals.avgHumidity;

	return hourlyTemp.map((temp, hour) => {
		let humidity = baseHumidity;

		// Humidity inversely related to temperature (warmer = drier)
		const tempRange = high - low;
		const tempPosition = tempRange > 0 ? (temp - low) / tempRange : 0.5;
		humidity -= tempPosition * 15; // Up to 15% drop at peak temp

		// Rain increases humidity
		if (precipHourly[hour] > 0.01) {
			humidity += 20;
		}

		// Early morning tends to be more humid
		if (hour >= 4 && hour <= 7) {
			humidity += 10;
		}

		// Random variation
		humidity += (rng() - 0.5) * 10;

		return clamp(Math.round(humidity), 20, 100);
	});
}

// ============================================
// UV Index Generation
// ============================================

/**
 * Generate hourly UV index
 */
function generateHourlyUV(
	hourlyTemp: number[],
	hourlyClouds: number[],
	sunrise: number,
	sunset: number,
	normals: ClimateNormals,
): number[] {
	return hourlyTemp.map((_, hour) => {
		// No UV at night
		if (hour < sunrise || hour > sunset) return 0;

		// Peak UV at solar noon
		const solarNoon = (sunrise + sunset) / 2;
		const hoursFromNoon = Math.abs(hour - solarNoon);
		const dayLength = sunset - sunrise;

		// Base UV curve (peaks at 10-11 at solar noon in summer)
		const maxUV = 8 + (normals.avgHigh - 60) / 10; // Higher temp = higher max UV
		const timeFactor = Math.cos((hoursFromNoon / (dayLength / 2)) * Math.PI * 0.5);
		let uv = maxUV * Math.max(0, timeFactor);

		// Clouds reduce UV
		const cloudReduction = hourlyClouds[hour] / 100;
		uv *= 1 - cloudReduction * 0.7;

		return clamp(Math.round(uv), 0, 11);
	});
}

// ============================================
// Main Generator
// ============================================

/**
 * Generate a complete day forecast
 */
function generateDay(
	dateStr: string,
	normals: ClimateNormals,
	state: DayGeneratorState,
	dayIndex: number,
	initialConditions?: { temperature: number; condition: string } | null,
): DailyForecast {
	// Generate daily temps
	const { high, low, meanTemp } = generateDailyTemps(
		normals,
		state,
		dayIndex,
		initialConditions,
	);
	state.prevDayMeanTemp = meanTemp;

	// Determine precipitation
	const isRaining = willRainToday(normals, state);
	state.wasRaining = isRaining;

	// Generate hourly data
	const precipHourly = generateHourlyPrecip(isRaining, normals, state.rng);
	const cloudHourly = generateHourlyClouds(isRaining, precipHourly, normals, state.rng);
	const { speed: windSpeed, direction: windDir } = generateHourlyWind(normals, state.rng);

	const hourly: HourlyWeather[] = [];
	const conditions: WeatherCondition[] = [];

	for (let h = 0; h < 24; h++) {
		const temp = generateHourlyTemp(
			h,
			high,
			low,
			normals.avgSunriseHour,
			normals.avgSunsetHour,
		);

		const humidity = generateHourlyHumidity(
			[temp],
			[precipHourly[h]],
			high,
			low,
			normals,
			state.rng,
		)[0];

		const hourData: HourlyWeather = {
			hour: h,
			temperature: Math.round(temp),
			feelsLike: calculateFeelsLike(temp, humidity, windSpeed[h]),
			humidity,
			precipitation: Math.round(precipHourly[h] * 100) / 100,
			precipProbability:
				precipHourly[h] > 0.01
					? 80 + state.rng() * 20
					: 10 + state.rng() * 20,
			cloudCover: Math.round(cloudHourly[h]),
			windSpeed: windSpeed[h],
			windDirection: Math.round(windDir[h]),
			uvIndex: 0, // Will be set below
		};

		// Derive condition
		const condition = deriveCondition(hourData);
		conditions.push(condition);

		hourly.push(hourData);
	}

	// Generate UV after we have all hourly data
	const uvIndex = generateHourlyUV(
		hourly.map(h => h.temperature),
		hourly.map(h => h.cloudCover),
		normals.avgSunriseHour,
		normals.avgSunsetHour,
		normals,
	);

	// Apply UV to hourly data
	hourly.forEach((h, i) => {
		h.uvIndex = uvIndex[i];
	});

	// Determine dominant condition for the day
	const dominantCondition = getDominantCondition(
		conditions,
		normals.avgSunriseHour,
		normals.avgSunsetHour,
	);

	return {
		date: dateStr,
		high,
		low,
		sunrise: Math.round(normals.avgSunriseHour * 10) / 10,
		sunset: Math.round(normals.avgSunsetHour * 10) / 10,
		hourly,
		dominantCondition,
	};
}

/**
 * Generate a complete forecast
 */
export function generateForecast(params: ForecastGeneratorParams): LocationForecast {
	const { climateNormals, startDate, initialConditions, seed, days = 28 } = params;

	// Create seeded RNG
	const rng = seedrandom(seed);

	// Initialize state
	const initialMean = initialConditions
		? initialConditions.temperature
		: (climateNormals.avgHigh + climateNormals.avgLow) / 2;

	const state: DayGeneratorState = {
		prevDayMeanTemp: initialMean,
		wasRaining: false,
		rng,
	};

	// Generate each day
	const forecastDays: DailyForecast[] = [];

	for (let i = 0; i < days; i++) {
		const { year, month, day } = addDays(
			startDate.year,
			startDate.month,
			startDate.day,
			i,
		);
		const dateStr = formatDate(year, month, day);

		// Only use initial conditions for first 3 days (anchor period)
		const anchor = i < 3 ? initialConditions : null;

		forecastDays.push(generateDay(dateStr, climateNormals, state, i, anchor));
	}

	return {
		locationId: seed.split('-')[0] || 'unknown',
		startDate: formatDate(startDate.year, startDate.month, startDate.day),
		generatedFrom: initialConditions || undefined,
		days: forecastDays,
	};
}

/**
 * Look up weather for a specific date/time in a forecast
 */
export function lookupWeather(
	forecast: LocationForecast,
	date: NarrativeDateTime,
): HourlyWeather | null {
	const dateStr = formatDate(date.year, date.month, date.day);

	const day = forecast.days.find(d => d.date === dateStr);
	if (!day) return null;

	const hour = clamp(date.hour, 0, 23);
	return day.hourly[hour];
}

/**
 * Get the day forecast for a specific date
 */
export function lookupDay(
	forecast: LocationForecast,
	date: NarrativeDateTime,
): DailyForecast | null {
	const dateStr = formatDate(date.year, date.month, date.day);
	return forecast.days.find(d => d.date === dateStr) || null;
}

/**
 * Calculate the day index for a date within a forecast
 */
export function getDayIndex(forecastStartDate: string, currentDate: NarrativeDateTime): number {
	const [startYear, startMonth, startDay] = forecastStartDate.split('-').map(Number);
	const start = new Date(startYear, startMonth - 1, startDay);
	const current = new Date(currentDate.year, currentDate.month - 1, currentDate.day);

	const diffTime = current.getTime() - start.getTime();
	const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

	return diffDays;
}
