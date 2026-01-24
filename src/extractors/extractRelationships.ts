// ============================================
// Relationship Extractor
// ============================================

import { getSettings, getTemperature } from '../settings';
import { getPrompt } from './prompts';
import { makeGeneratorRequest, buildExtractionMessages } from '../utils/generator';
import { parseJsonResponse, asStringArray, isObject } from '../utils/json';
import type {
	Relationship,
	RelationshipStatus,
	RelationshipAttitude,
	RelationshipSignal,
	TimestampedEvent,
	NarrativeDateTime,
} from '../types/state';
import { RELATIONSHIP_STATUSES } from '../types/state';
import {
	sortPair,
	createRelationship,
	createEmptyAttitude,
	addRelationshipVersion,
	addMilestone,
} from '../state/relationships';
import { formatEventsForInjection } from '../state/events';
import type { LocationState } from './extractLocation';

// ============================================
// Schema & Examples
// ============================================

export const RELATIONSHIP_SCHEMA = {
	type: 'object',
	description: 'Relationship state between two characters',
	additionalProperties: false,
	properties: {
		status: {
			type: 'string',
			enum: [...RELATIONSHIP_STATUSES],
			description: 'Current relationship status',
		},
		attitudes: {
			type: 'object',
			description:
				"Each character's attitude toward the other. Keys are character names.",
			additionalProperties: {
				type: 'object',
				properties: {
					toward: {
						type: 'string',
						description:
							'The other character this attitude is directed at',
					},
					feelings: {
						type: 'array',
						items: { type: 'string' },
						description:
							'Current feelings toward the other character',
					},
					secrets: {
						type: 'array',
						items: { type: 'string' },
						description:
							'Things they know that the other character does not',
					},
					wants: {
						type: 'array',
						items: { type: 'string' },
						description:
							'What they want from this relationship',
					},
				},
			},
		},
		// Support legacy aToB/bToA format for backwards compatibility
		aToB: {
			type: 'object',
			description:
				'How the first character (alphabetically) feels about the second',
			properties: {
				feelings: {
					type: 'array',
					items: { type: 'string' },
				},
				secrets: {
					type: 'array',
					items: { type: 'string' },
				},
				wants: {
					type: 'array',
					items: { type: 'string' },
				},
			},
		},
		bToA: {
			type: 'object',
			description:
				'How the second character (alphabetically) feels about the first',
			properties: {
				feelings: {
					type: 'array',
					items: { type: 'string' },
				},
				secrets: {
					type: 'array',
					items: { type: 'string' },
				},
				wants: {
					type: 'array',
					items: { type: 'string' },
				},
			},
		},
	},
	required: ['status'],
};

function createRelationshipExample(char1: string, char2: string): string {
	return JSON.stringify(
		{
			status: 'friendly',
			attitudes: {
				[char1]: {
					toward: char2,
					feelings: ['trusting', 'curious'],
					secrets: ['knows about their hidden talent'],
					wants: ['friendship', 'adventure together'],
				},
				[char2]: {
					toward: char1,
					feelings: ['grateful', 'protective'],
					secrets: [],
					wants: ['loyalty', 'emotional support'],
				},
			},
		},
		null,
		2,
	);
}

// ============================================
// Constants
// ============================================

const SYSTEM_PROMPT =
	'You are a relationship analysis agent for roleplay. Extract and track character relationships with attention to asymmetry. Return only valid JSON.';

/**
 * Get a descriptive time of day phrase from hour.
 */
function getTimeOfDay(hour: number): string {
	if (hour >= 5 && hour < 12) return 'in the morning';
	if (hour >= 12 && hour < 17) return 'in the afternoon';
	if (hour >= 17 && hour < 21) return 'in the evening';
	return 'at night';
}

// ============================================
// Public API
// ============================================

export interface ExtractInitialRelationshipParams {
	char1: string;
	char2: string;
	messages: string;
	characterInfo: string;
	messageId?: number;
	currentTime?: NarrativeDateTime;
	currentLocation?: LocationState;
	abortSignal?: AbortSignal;
}

export interface UpdateRelationshipParams {
	relationship: Relationship;
	events: TimestampedEvent[];
	messages: string;
	messageId?: number;
	isChapterBoundary?: boolean;
	abortSignal?: AbortSignal;
}

/**
 * Extract the initial relationship state between two characters.
 */
export async function extractInitialRelationship(
	params: ExtractInitialRelationshipParams,
): Promise<Relationship | null> {
	const settings = getSettings();

	const pair = sortPair(params.char1, params.char2);
	const schemaStr = JSON.stringify(RELATIONSHIP_SCHEMA, null, 2);
	const exampleStr = createRelationshipExample(pair[0], pair[1]);

	const prompt = getPrompt('relationship_initial')
		.replace('{{messages}}', params.messages)
		.replace('{{characterInfo}}', params.characterInfo)
		.replace('{{schema}}', schemaStr)
		.replace('{{schemaExample}}', exampleStr);

	const llmMessages = buildExtractionMessages(SYSTEM_PROMPT, prompt);

	try {
		const response = await makeGeneratorRequest(llmMessages, {
			profileId: settings.profileId,
			maxTokens: settings.maxResponseTokens,
			temperature: getTemperature('relationship_initial'),
			abortSignal: params.abortSignal,
		});

		const parsed = parseJsonResponse(response, {
			shape: 'object',
			moduleName: 'BlazeTracker/Relationship',
		});

		const relationship = buildRelationship(pair, parsed, undefined, params.messageId);

		// Automatically add first_meeting milestone for new relationships
		if (relationship && params.messageId !== undefined && params.currentTime && params.currentLocation) {
			const locationStr = [params.currentLocation.place, params.currentLocation.area]
				.filter(Boolean)
				.join(', ');
			const timeOfDay = getTimeOfDay(params.currentTime.hour);
			const description = `${pair[0]} and ${pair[1]} first appear together ${timeOfDay} at ${locationStr}.`;

			addMilestone(relationship, {
				type: 'first_meeting',
				description,
				timestamp: params.currentTime,
				location: locationStr,
				messageId: params.messageId,
			});
		}

		return relationship;
	} catch (error) {
		console.warn('[BlazeTracker] Initial relationship extraction failed:', error);
		return null;
	}
}

/**
 * Update a relationship based on recent events.
 */
export async function refreshRelationship(
	params: UpdateRelationshipParams,
): Promise<Relationship | null> {
	const settings = getSettings();

	const pair = params.relationship.pair;
	const schemaStr = JSON.stringify(RELATIONSHIP_SCHEMA, null, 2);
	const exampleStr = createRelationshipExample(pair[0], pair[1]);
	const eventsStr = formatEventsForInjection(params.events);
	const previousStr = formatPreviousRelationship(params.relationship);

	const prompt = getPrompt('relationship_update')
		.replace('{{previousState}}', previousStr)
		.replace('{{currentEvents}}', eventsStr)
		.replace('{{messages}}', params.messages)
		.replace('{{schema}}', schemaStr)
		.replace('{{schemaExample}}', exampleStr);

	const llmMessages = buildExtractionMessages(SYSTEM_PROMPT, prompt);

	try {
		const response = await makeGeneratorRequest(llmMessages, {
			profileId: settings.profileId,
			maxTokens: settings.maxResponseTokens,
			temperature: getTemperature('relationship_update'),
			abortSignal: params.abortSignal,
		});

		const parsed = parseJsonResponse(response, {
			shape: 'object',
			moduleName: 'BlazeTracker/Relationship',
		});

		// Build updated relationship, preserving history
		const updated = buildRelationship(
			pair,
			parsed,
			params.relationship,
			params.messageId,
		);

		// If this is a chapter boundary, add a history snapshot
		if (params.isChapterBoundary && updated) {
			// Note: Chapter index should be provided by caller if needed
			// For now we skip the snapshot creation here
		}

		return updated;
	} catch (error) {
		console.warn('[BlazeTracker] Relationship refresh failed:', error);
		return null;
	}
}

/**
 * Apply a relationship signal from event extraction to update the relationship.
 * This is a lighter-weight update that doesn't require an LLM call.
 */
export function updateRelationshipFromSignal(
	relationship: Relationship,
	signal: RelationshipSignal,
): Relationship {
	// Create a copy to modify
	const updated = { ...relationship };
	updated.aToB = { ...updated.aToB };
	updated.bToA = { ...updated.bToA };
	updated.milestones = [...updated.milestones];

	const [charA, charB] = updated.pair;

	// Apply directional changes
	if (signal.changes) {
		for (const change of signal.changes) {
			const fromLower = change.from.toLowerCase();
			const towardLower = change.toward.toLowerCase();

			// Determine direction
			if (
				fromLower === charA.toLowerCase() &&
				towardLower === charB.toLowerCase()
			) {
				// A's feeling toward B changed
				if (!updated.aToB.feelings.includes(change.feeling)) {
					updated.aToB.feelings = [
						...updated.aToB.feelings,
						change.feeling,
					];
				}
			} else if (
				fromLower === charB.toLowerCase() &&
				towardLower === charA.toLowerCase()
			) {
				// B's feeling toward A changed
				if (!updated.bToA.feelings.includes(change.feeling)) {
					updated.bToA.feelings = [
						...updated.bToA.feelings,
						change.feeling,
					];
				}
			}
		}
	}

	// Add milestones if provided and not duplicates
	if (signal.milestones && signal.milestones.length > 0) {
		for (const milestone of signal.milestones) {
			const hasMilestone = updated.milestones.some(
				m => m.type === milestone.type,
			);
			if (!hasMilestone) {
				updated.milestones = [...updated.milestones, milestone];
			}
		}
	}

	return updated;
}

// ============================================
// Helpers
// ============================================

function formatPreviousRelationship(relationship: Relationship): string {
	const [charA, charB] = relationship.pair;

	const lines = [
		`Characters: ${charA} & ${charB}`,
		`Status: ${relationship.status}`,
		'',
		`${charA}'s attitude toward ${charB}:`,
		`  Feelings: ${relationship.aToB.feelings.join(', ') || 'none'}`,
		`  Secrets: ${relationship.aToB.secrets.join('; ') || 'none'}`,
		`  Wants: ${relationship.aToB.wants.join(', ') || 'none'}`,
		'',
		`${charB}'s attitude toward ${charA}:`,
		`  Feelings: ${relationship.bToA.feelings.join(', ') || 'none'}`,
		`  Secrets: ${relationship.bToA.secrets.join('; ') || 'none'}`,
		`  Wants: ${relationship.bToA.wants.join(', ') || 'none'}`,
	];

	if (relationship.milestones.length > 0) {
		lines.push('');
		lines.push('Milestones:');
		for (const m of relationship.milestones) {
			lines.push(`  - ${m.type}: ${m.description}`);
		}
	}

	return lines.join('\n');
}

/**
 * Find an attitude by character name (case-insensitive).
 */
function findAttitudeByName(attitudes: Record<string, unknown>, name: string): unknown {
	const lowerName = name.toLowerCase();
	for (const [key, value] of Object.entries(attitudes)) {
		if (key.toLowerCase() === lowerName) {
			return value;
		}
	}
	return null;
}

/**
 * Infer minimum relationship status based on feelings.
 */
function inferMinimumStatus(feelings: string[]): RelationshipStatus | null {
	const lower = feelings.map(f => f.toLowerCase()).join(' ');

	if (/love|passionate|romantic|desire|intimate|adore/.test(lower)) return 'intimate';
	if (/trust|care|protective|devoted|loyal|deep/.test(lower)) return 'close';
	if (/like|enjoy|comfortable|fond|friendly|warm/.test(lower)) return 'friendly';
	if (/hate|despise|enemy|loathe/.test(lower)) return 'hostile';
	if (/suspicious|resentful|angry|bitter|distrust/.test(lower)) return 'strained';

	return null;
}

/**
 * Milestones that indicate a romantic relationship has begun.
 * Without at least one of these, "intimate" status is not appropriate.
 */
const ROMANTIC_GATE_MILESTONES = new Set([
	'first_kiss',
	'first_date',
	'first_i_love_you',
	'promised_exclusivity',
	'marriage',
	// Sexual milestones
	'first_foreplay',
	'first_oral',
	'first_manual',
	'first_penetrative',
	'first_climax',
]);

/**
 * Infer maximum relationship status based on milestones.
 * This caps status to prevent models from over-estimating relationship depth.
 */
function inferMaximumStatus(milestones: Array<{ type: string }>): RelationshipStatus | null {
	const milestoneTypes = new Set(milestones.map(m => m.type));

	// Check for any romantic gate milestone
	const hasRomanticMilestone = [...ROMANTIC_GATE_MILESTONES].some(m => milestoneTypes.has(m));

	// If no romantic milestones at all, cap at "close" (deep friendship, not romantic)
	if (!hasRomanticMilestone) {
		return 'close';
	}

	return null; // No cap
}

/**
 * Get numeric rank for status to compare relative closeness.
 */
function getStatusRank(status: RelationshipStatus): number {
	const statusRank: Record<RelationshipStatus, number> = {
		hostile: -2,
		strained: -1,
		strangers: 0,
		acquaintances: 1,
		friendly: 2,
		close: 3,
		intimate: 4,
		complicated: 0,
	};
	return statusRank[status];
}

/**
 * Get status from rank.
 */
function getStatusFromRank(rank: number): RelationshipStatus {
	const rankToStatus: Record<number, RelationshipStatus> = {
		[-2]: 'hostile',
		[-1]: 'strained',
		0: 'strangers',
		1: 'acquaintances',
		2: 'friendly',
		3: 'close',
		4: 'intimate',
	};
	return rankToStatus[rank] ?? 'acquaintances';
}

function buildRelationship(
	pair: [string, string],
	data: unknown,
	existing?: Relationship,
	messageId?: number,
): Relationship | null {
	if (!isObject(data)) {
		return null;
	}

	const [charA, charB] = pair;
	let aToB: RelationshipAttitude;
	let bToA: RelationshipAttitude;

	// Try new attitudes format first
	if (isObject(data.attitudes)) {
		const attitudes = data.attitudes as Record<string, unknown>;
		const charAAttitude = findAttitudeByName(attitudes, charA);
		const charBAttitude = findAttitudeByName(attitudes, charB);

		aToB = validateAttitude(charAAttitude);
		bToA = validateAttitude(charBAttitude);
	} else {
		// Fall back to legacy aToB/bToA format
		aToB = validateAttitude(data.aToB);
		bToA = validateAttitude(data.bToA);
	}

	// Validate status
	let status = validateStatus(data.status);

	// Infer minimum status from feelings if status seems too low
	const minFromA = inferMinimumStatus(aToB.feelings);
	const minFromB = inferMinimumStatus(bToA.feelings);

	let currentRank = getStatusRank(status);
	const minRank = Math.max(
		minFromA ? getStatusRank(minFromA) : -999,
		minFromB ? getStatusRank(minFromB) : -999,
	);

	// Upgrade status if feelings suggest deeper connection
	if (minRank > currentRank && minRank !== -999) {
		currentRank = minRank;
		status = getStatusFromRank(currentRank);
	}

	// Apply maximum cap based on milestones (only for positive statuses)
	// We need the existing relationship's milestones to check this
	if (existing && currentRank > 0) {
		const maxStatus = inferMaximumStatus(existing.milestones);
		if (maxStatus) {
			const maxRank = getStatusRank(maxStatus);
			if (currentRank > maxRank) {
				status = maxStatus;
			}
		}
	}

	// Determine if status changed
	const statusChanged = !existing || existing.status !== status;

	// Start with existing or create new
	let relationship: Relationship;
	if (existing) {
		relationship = {
			...existing,
			status,
			aToB,
			bToA,
		};
		// Add a new version if status actually changed
		if (statusChanged && messageId !== undefined) {
			addRelationshipVersion(relationship, messageId);
		}
	} else {
		relationship = createRelationship(pair[0], pair[1], status, messageId);
		relationship.aToB = aToB;
		relationship.bToA = bToA;
	}

	return relationship;
}

function validateStatus(value: unknown): RelationshipStatus {
	if (
		typeof value === 'string' &&
		RELATIONSHIP_STATUSES.includes(value as RelationshipStatus)
	) {
		return value as RelationshipStatus;
	}
	return 'acquaintances';
}

function validateAttitude(value: unknown): RelationshipAttitude {
	if (!isObject(value)) {
		return createEmptyAttitude();
	}

	return {
		feelings: asStringArray(value.feelings),
		secrets: asStringArray(value.secrets),
		wants: asStringArray(value.wants),
	};
}
