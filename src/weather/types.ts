/**
 * Weather System Types
 *
 * All temperatures in Fahrenheit, distances in mph, precipitation in inches.
 */

// ============================================
// Weather Conditions
// ============================================

export type WeatherCondition =
	| 'clear'
	| 'sunny'
	| 'partly_cloudy'
	| 'overcast'
	| 'foggy'
	| 'drizzle'
	| 'rain'
	| 'heavy_rain'
	| 'thunderstorm'
	| 'sleet'
	| 'snow'
	| 'heavy_snow'
	| 'blizzard'
	| 'windy'
	| 'hot'
	| 'cold'
	| 'humid';

export type DaylightPhase = 'dawn' | 'day' | 'dusk' | 'night';

// ============================================
// Building Types (for indoor temperature)
// ============================================

export type BuildingType =
	| 'modern' // HVAC, 65-75°F
	| 'heated' // Fireplace/hearth, dampened outdoor
	| 'unheated' // Barn, warehouse, near outdoor
	| 'underground' // Cave, basement, stable ~55°F
	| 'tent' // Minimal shelter
	| 'vehicle'; // Car, carriage, slight shelter

// ============================================
// Base Climate Types (for fallback)
// ============================================

export type BaseClimateType =
	| 'temperate' // Mild seasons, moderate precipitation
	| 'desert' // Hot/dry, large day/night swings
	| 'arctic' // Cold year-round, polar day/night
	| 'tropical' // Hot/humid, consistent temps, monsoons
	| 'mediterranean' // Warm dry summers, mild wet winters
	| 'continental' // Hot summers, cold winters, variable
	| 'oceanic'; // Mild, wet, small temp variations

// ============================================
// Hourly Weather Data
// ============================================

export interface HourlyWeather {
	hour: number; // 0-23
	temperature: number; // Fahrenheit
	feelsLike: number; // Wind chill / heat index (°F)
	humidity: number; // 0-100%
	precipitation: number; // inches
	precipProbability: number; // 0-100%
	cloudCover: number; // 0-100%
	windSpeed: number; // mph
	windDirection: number; // degrees (0-360)
	uvIndex: number; // 0-11+
}

// ============================================
// Daily Forecast
// ============================================

export interface DailyForecast {
	date: string; // YYYY-MM-DD
	high: number; // °F
	low: number; // °F
	sunrise: number; // hour (e.g., 6.5 = 6:30 AM)
	sunset: number; // hour (e.g., 18.25 = 6:15 PM)
	hourly: HourlyWeather[]; // 24 entries
	dominantCondition: WeatherCondition;
}

// ============================================
// Location Forecast
// ============================================

export interface LocationForecast {
	locationId: string; // Unique ID for this area
	realWorldAnalog?: {
		name: string; // "Phoenix, Arizona"
		latitude: number;
		longitude: number;
	};
	baseClimateType?: BaseClimateType; // Fallback if no real-world match
	startDate: string; // YYYY-MM-DD when forecast begins
	generatedFrom?: {
		// Initial conditions that seeded this forecast
		temperature: number;
		condition: string;
	};
	days: DailyForecast[]; // 28 days
}

// ============================================
// Location Mapping
// ============================================

export interface LocationMapping {
	fantasyLocation: string;
	// One of these will be set:
	realWorldAnalog?: string; // e.g., "Phoenix, Arizona"
	latitude?: number;
	longitude?: number;
	baseClimateType?: BaseClimateType; // Fallback if no real-world match
	isFantasy: boolean;
	reasoning: string;
}

// ============================================
// Forecast Cache
// ============================================

export interface ForecastCacheEntry {
	areaName: string; // "Whiterun", "London"
	forecast: LocationForecast;
	lastAccessedDate: string; // ISO date for cleanup
}

// ============================================
// Extended Climate Type (replaces old Climate)
// ============================================

export interface ProceduralClimate {
	// Temperatures
	temperature: number; // Effective temp (indoor if inside) °F
	outdoorTemperature: number; // Always outside temp °F
	indoorTemperature?: number; // Set when indoors °F
	feelsLike: number; // Wind chill / heat index °F

	// Atmospheric
	humidity: number; // 0-100%
	precipitation: number; // inches
	cloudCover: number; // 0-100%

	// Wind
	windSpeed: number; // mph
	windDirection: string; // "NW", "SE", etc.

	// Conditions
	conditions: string; // Human-readable description
	conditionType: WeatherCondition;

	// Other
	uvIndex: number;
	daylight: DaylightPhase;

	// Indoor tracking
	isIndoors: boolean;
	buildingType?: BuildingType;
}

// ============================================
// Climate Normals (from API or fallback)
// ============================================

export interface ClimateNormals {
	latitude: number;
	longitude: number;
	month: number;
	avgHigh: number; // °F
	avgLow: number; // °F
	avgPrecipitation: number; // inches/day
	avgPrecipDays: number; // days with >0.04" precip
	avgHumidity: number; // %
	avgWindSpeed: number; // mph
	avgCloudCover: number; // %
	avgSunriseHour: number;
	avgSunsetHour: number;
	tempStdDev: number; // For jitter calculation

	// Distribution of conditions for this month
	conditionProbabilities: {
		clear: number;
		partlyCloudy: number;
		overcast: number;
		rain: number;
		snow: number;
	};
}

// ============================================
// Fallback Profile Type
// ============================================

export interface FallbackClimateProfile {
	type: BaseClimateType;
	// Monthly averages (index 0 = January)
	monthlyHighs: number[]; // °F
	monthlyLows: number[]; // °F
	monthlyPrecipDays: number[]; // days with precipitation
	monthlyHumidity: number[]; // %
	tempStdDev: number; // day-to-day variation
	precipPersistence: number; // Markov chain probability
	// Condition probabilities by season
	conditionWeights: {
		winter: Record<string, number>;
		spring: Record<string, number>;
		summer: Record<string, number>;
		fall: Record<string, number>;
	};
}

// ============================================
// Weather Settings
// ============================================

export interface WeatherSettings {
	useProceduralWeather: boolean;
	forecastDays: number; // Default 28
	injectWeatherTransitions: boolean;
	cacheFantasyMappings: boolean;
}

// ============================================
// Extraction Result
// ============================================

export interface ClimateExtractionResult {
	climate: ProceduralClimate;
	forecast: LocationForecast;
	transition: string | null;
}
