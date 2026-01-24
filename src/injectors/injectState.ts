import type {
	CharacterOutfit,
	TrackedState,
	Scene,
	NarrativeDateTime,
	NarrativeState,
	TimestampedEvent,
	Climate,
	ProceduralClimate,
} from '../types/state';
import type { STContext } from '../types/st';
import { getMessageState } from '../utils/messageState';
import { getSettings } from '../settings';
import { formatTemperature } from '../utils/temperatures';
import { getNarrativeState } from '../state/narrativeState';
import { formatChaptersForInjection } from '../state/chapters';
import { formatEventsForInjection } from '../state/events';
import { formatRelationshipsForPrompt } from '../state/relationships';
import { isLegacyClimate } from '../weather';

// ============================================
// Helper Functions for Knowledge Gaps
// ============================================

/**
 * Build knowledge gaps - events that present characters missed.
 * Returns formatted strings describing what each present character doesn't know.
 */
function buildKnowledgeGaps(events: TimestampedEvent[], presentCharacters: string[]): string[] {
	const gaps = new Map<string, string[]>();

	// For each present character, find events they weren't witnesses to
	for (const character of presentCharacters) {
		const charLower = character.toLowerCase();
		for (const event of events) {
			const witnessLower = event.witnesses.map(w => w.toLowerCase());
			if (!witnessLower.includes(charLower)) {
				if (!gaps.has(character)) {
					gaps.set(character, []);
				}
				gaps.get(character)!.push(event.summary);
			}
		}
	}

	// Format as strings
	const result: string[] = [];
	for (const [character, missedEvents] of gaps) {
		if (missedEvents.length > 0) {
			result.push(`${character} was not present for: ${missedEvents.join('; ')}`);
		}
	}

	return result;
}

const EXTENSION_KEY = 'blazetracker';

const MONTH_NAMES = [
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
];

function formatOutfit(outfit: CharacterOutfit): string {
	const outfitParts = [
		outfit.torso || 'topless',
		outfit.legs || 'bottomless',
		outfit.underwear || 'no underwear',
		outfit.head || null,
		outfit.jacket || null,
		outfit.socks || null,
		outfit.footwear || null,
	];

	return outfitParts.filter((v: string | null) => v !== null).join(', ');
}

function formatClimate(climate: Climate | ProceduralClimate): string {
	const settings = getSettings();

	if (isLegacyClimate(climate)) {
		// Legacy format: simple weather + temperature
		return `${formatTemperature(climate.temperature, settings.temperatureUnit)}, ${climate.weather}`;
	}

	// Procedural format: more detailed
	const parts: string[] = [];

	// Temperature with feels like if significantly different
	const tempStr = formatTemperature(climate.temperature, settings.temperatureUnit);
	if (Math.abs(climate.feelsLike - climate.temperature) > 5) {
		const feelsLikeStr = formatTemperature(climate.feelsLike, settings.temperatureUnit);
		parts.push(`${tempStr} (feels like ${feelsLikeStr})`);
	} else {
		parts.push(tempStr);
	}

	// Conditions
	parts.push(climate.conditions);

	// Wind if notable
	if (climate.windSpeed >= 15) {
		parts.push(
			`${Math.round(climate.windSpeed)} mph winds from ${climate.windDirection}`,
		);
	}

	// Indoor note
	if (climate.isIndoors && climate.indoorTemperature !== undefined) {
		const outdoorStr = formatTemperature(
			climate.outdoorTemperature,
			settings.temperatureUnit,
		);
		parts.push(`(${outdoorStr} outside)`);
	}

	return parts.join(', ');
}

function formatScene(scene: Scene): string {
	const tensionParts = [
		scene.tension.type,
		scene.tension.level,
		scene.tension.direction !== 'stable' ? scene.tension.direction : null,
	].filter(Boolean);

	return `Topic: ${scene.topic}
Tone: ${scene.tone}
Tension: ${tensionParts.join(', ')}`;
}

function formatNarrativeDateTime(time: NarrativeDateTime): string {
	const hour12 = time.hour % 12 || 12;
	const ampm = time.hour < 12 ? 'AM' : 'PM';
	const minuteStr = String(time.minute).padStart(2, '0');

	// "Monday, June 15th, 2024 at 2:30 PM"
	const dayOrdinal = getDayOrdinal(time.day);

	return `${time.dayOfWeek}, ${MONTH_NAMES[time.month - 1]} ${time.day}${dayOrdinal}, ${time.year} at ${hour12}:${minuteStr} ${ampm}`;
}

function getDayOrdinal(day: number): string {
	if (day >= 11 && day <= 13) return 'th';
	switch (day % 10) {
		case 1:
			return 'st';
		case 2:
			return 'nd';
		case 3:
			return 'rd';
		default:
			return 'th';
	}
}

export interface InjectionOptions {
	weatherTransition?: string;
}

export function formatStateForInjection(
	state: TrackedState,
	narrativeState?: NarrativeState | null,
	options?: InjectionOptions,
): string {
	const settings = getSettings();

	// Check what's enabled AND what data exists
	const hasTime = settings.trackTime !== false && state.time;
	const hasLocation = settings.trackLocation !== false && state.location;
	const hasClimate = settings.trackClimate !== false && state.climate;
	const hasScene = settings.trackScene !== false && state.scene;
	const hasCharacters =
		settings.trackCharacters !== false &&
		state.characters &&
		state.characters.length > 0;
	const hasEvents =
		settings.trackEvents !== false &&
		state.currentEvents &&
		state.currentEvents.length > 0;
	const hasRelationships =
		settings.trackRelationships !== false &&
		narrativeState &&
		narrativeState.relationships.length > 0;
	const hasChapters = narrativeState && narrativeState.chapters.length > 0;

	// If nothing is tracked/available, return empty
	if (
		!hasTime &&
		!hasLocation &&
		!hasClimate &&
		!hasScene &&
		!hasCharacters &&
		!hasEvents &&
		!hasRelationships &&
		!hasChapters
	) {
		return '';
	}

	const sections: string[] = [];

	// ========================================
	// Previous Chapters (Story So Far)
	// ========================================
	if (hasChapters && narrativeState) {
		const chapterLimit = settings.injectedChapters ?? 3;
		const chaptersStr = formatChaptersForInjection(
			narrativeState.chapters,
			chapterLimit,
		);
		if (chaptersStr !== 'No previous chapters.') {
			sections.push(`[Story So Far]\n${chaptersStr}\n[/Story So Far]`);
		}
	}

	// ========================================
	// Current Scene State
	// ========================================
	let sceneOutput = `[Scene State]`;

	// Scene info first - it's the narrative context
	if (hasScene && state.scene) {
		sceneOutput += `\n${formatScene(state.scene)}`;
	}

	// Time (if enabled and available)
	if (hasTime && state.time) {
		const timeStr = formatNarrativeDateTime(state.time);
		sceneOutput += `\nTime: ${timeStr}`;
	}

	// Location (if enabled and available)
	if (hasLocation && state.location) {
		const location = [
			state.location.area,
			state.location.place,
			state.location.position,
		]
			.filter(Boolean)
			.join(' - ');
		sceneOutput += `\nLocation: ${location}`;

		// Props are part of location
		if (state.location.props && state.location.props.length > 0) {
			const props = state.location.props.join(', ');
			sceneOutput += `\nNearby objects: ${props}`;
		}
	}

	// Climate (if enabled and available)
	if (hasClimate && state.climate) {
		const climate = formatClimate(state.climate);
		sceneOutput += `\nClimate: ${climate}`;
	}

	// Characters (if enabled and available)
	if (hasCharacters && state.characters) {
		const characters = state.characters
			.map(char => {
				const parts = [`${char.name}: ${char.position}`];
				if (char.activity) parts.push(`doing: ${char.activity}`);
				if (char.mood?.length) parts.push(`mood: ${char.mood.join(', ')}`);
				if (char.physicalState?.length)
					parts.push(`physical: ${char.physicalState.join(', ')}`);
				if (char.outfit)
					parts.push(`wearing: ${formatOutfit(char.outfit)}`);
				return parts.join('; ');
			})
			.join('\n');

		sceneOutput += `\nCharacters present:\n${characters}`;
	}

	sceneOutput += `\n[/Scene State]`;
	sections.push(sceneOutput);

	// ========================================
	// Weather Transition (if procedural weather with change)
	// ========================================
	if (
		options?.weatherTransition &&
		settings.useProceduralWeather &&
		settings.injectWeatherTransitions
	) {
		sections.push(`[Weather Change]\n${options.weatherTransition}\n[/Weather Change]`);
	}

	// ========================================
	// Recent Events in Current Chapter
	// ========================================
	if (hasEvents && state.currentEvents) {
		const eventsStr = formatEventsForInjection(state.currentEvents);
		sections.push(`[Recent Events]\n${eventsStr}\n[/Recent Events]`);

		// Add witness absence notes for dramatic irony (if characters are tracked)
		if (hasCharacters && state.characters) {
			const presentCharacters = state.characters.map(c => c.name);
			const knowledgeGaps = buildKnowledgeGaps(
				state.currentEvents,
				presentCharacters,
			);

			if (knowledgeGaps.length > 0) {
				sections.push(
					`[Knowledge Gaps]\n${knowledgeGaps.join('\n')}\n[/Knowledge Gaps]`,
				);
			}
		}
	}

	// ========================================
	// Relationships (filtered for present characters)
	// ========================================
	if (hasRelationships && narrativeState) {
		const presentCharacters =
			hasCharacters && state.characters
				? state.characters.map(c => c.name)
				: undefined;

		const relationshipsStr = formatRelationshipsForPrompt(
			narrativeState.relationships,
			presentCharacters,
			settings.includeRelationshipSecrets ?? true,
		);

		if (relationshipsStr !== 'No established relationships yet.') {
			sections.push(`[Relationships]\n${relationshipsStr}\n[/Relationships]`);
		}
	}

	return sections.join('\n\n');
}

export function injectState(
	state: TrackedState | null,
	narrativeState?: NarrativeState | null,
	options?: InjectionOptions,
) {
	const context = SillyTavern.getContext() as STContext;

	if (!state) {
		context.setExtensionPrompt(EXTENSION_KEY, '', 0, 0);
		return;
	}

	const formatted = formatStateForInjection(state, narrativeState, options);

	// If nothing to inject, clear the prompt
	if (!formatted) {
		context.setExtensionPrompt(EXTENSION_KEY, '', 0, 0);
		return;
	}

	// Inject at depth 0 (with most recent messages), position IN_CHAT
	// Position 1 = after main prompt, before chat
	// Depth 0 = at the end (near most recent messages)
	context.setExtensionPrompt(
		EXTENSION_KEY,
		formatted,
		1, // extension_prompt_types.IN_CHAT or similar
		0, // depth - 0 means at the bottom
	);
}

export function updateInjectionFromChat() {
	const context = SillyTavern.getContext() as STContext;

	// Get narrative state
	const narrativeState = getNarrativeState();

	// Find most recent tracked state
	for (let i = context.chat.length - 1; i >= 0; i--) {
		const message = context.chat[i];
		const stateData = getMessageState(message) as { state?: TrackedState } | undefined;
		if (stateData?.state) {
			injectState(stateData.state, narrativeState);
			return;
		}
	}

	// No state found, clear injection
	injectState(null);
}
