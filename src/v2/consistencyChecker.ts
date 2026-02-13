import { errorLog } from '../utils/debug';
import { buildPrompt } from './generator/types';
import { SillyTavernGenerator } from './generator/SillyTavernGenerator';
import { getV2Settings } from './settings/manager';
import type { Event, ChapterEvent, LocationEvent, NarrativeDescriptionEvent, RelationshipEvent, TimeEvent, TopicToneEvent, TensionEvent, CharacterEvent, ForecastGeneratedEvent } from './types/event';
import { getV2EventStore } from '../v2Bridge';
import type { STContext } from '../types/st';

const MAX_MESSAGES_TO_INCLUDE = 6;
const MAX_EVENTS_TO_INCLUDE = 12;
const SYSTEM_PROMPT = `You are BlazeTracker's internal QA assistant. Your job is to compare the tracker events with the most recent conversation lines and report whether the tracker state appears consistent with what happened in the story.`;
const VERDICT_PROMPT = `Instructions:
1. List any mismatches between tracker events and the provided messages.
2. Describe each mismatch clearly.
3. End with a one-line verdict: either "Tracker is consistent" or "Tracker may be inconsistent".`;

export interface TrackerConsistencyCheckResult {
	success: boolean;
	summary: string;
	error?: string;
}

export async function runTrackerConsistencyCheck(
	profileId?: string,
	abortSignal?: AbortSignal,
): Promise<TrackerConsistencyCheckResult> {
	try {
		const settings = getV2Settings();
		const profileToUse =
			profileId || settings.v2ConsistencyProfileId || settings.v2ProfileId;
		if (!profileToUse) {
			throw new Error('No connection profile configured');
		}

		const context = SillyTavern.getContext();
		if (!context || !context.chat) {
			throw new Error('SillyTavern context is unavailable');
		}

		const messages = formatRecentMessages(context.chat, context);
		const events = formatRecentEvents(context.chat.length - 1);

		const userPrompt = [
			'Recent conversation (oldest to newest):',
			messages || '(no messages available)',
			'Tracker events:',
			events || '(no tracker events recorded)',
			VERDICT_PROMPT,
		].join('\n\n');

		const generator = new SillyTavernGenerator({ profileId: profileToUse });
		const response = await generator.generate(
			buildPrompt(SYSTEM_PROMPT, userPrompt, 'TrackerConsistencyCheck'),
			{
				maxTokens: Math.min(1024, settings.v2MaxTokens),
				temperature: 0.25,
				abortSignal,
			},
		);

		return {
			success: true,
			summary: response.trim(),
		};
	} catch (error: any) {
		errorLog('Consistency check failed:', error);
		return {
			success: false,
			summary: 'Failed to run tracker consistency check.',
			error: error?.message ?? 'Unknown error',
		};
	}
}

function formatRecentMessages(chat: Array<{ is_user: boolean; name?: string; mes: string }>, context: STContext) {
	const recent = chat.slice(-MAX_MESSAGES_TO_INCLUDE);
	return recent
		.map((msg, index) => {
			const speaker = msg.is_user ? context.name1 || 'User' : msg.name || context.name2 || 'NPC';
			const text = (msg.mes ?? '').replace(/\s+/g, ' ').trim();
			return `${index + 1}. ${speaker}: ${text || '[no text]'}`;
		})
		.join('\n');
}

function formatRecentEvents(lastMessageId: number) {
	const store = getV2EventStore();
	if (!store || !store.hasInitialSnapshot) {
		return '';
	}

	const events = store
		.getActiveEvents()
		.filter(evt => evt.source.messageId <= lastMessageId)
		.sort((a, b) => {
			if (a.source.messageId === b.source.messageId) {
				return a.timestamp - b.timestamp;
			}
			return a.source.messageId - b.source.messageId;
		})
		.slice(-MAX_EVENTS_TO_INCLUDE);

	return events
		.map((event, index) => `${index + 1}. ${describeEvent(event)}`)
		.join('\n');
}

function describeEvent(event: Event): string {
	const base = `${event.kind}/${(event as { subkind?: string }).subkind ?? 'unknown'} @ msg ${event.source.messageId}`;
	const details: string[] = [];

	const push = (key: string, value: unknown) => {
		if (value === undefined || value === null) return;
		const safe = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : String(value);
		details.push(`${key}=${safe}`);
	};

	if ('swipeId' in event.source) {
		push('swipe', event.source.swipeId);
	}

	switch (event.kind) {
		case 'time': {
			const timeEvent = event as TimeEvent;
			if (timeEvent.subkind === 'initial') {
				push('time', (timeEvent as { time?: string }).time);
			} else {
				const delta = (timeEvent as { delta?: { days?: number; hours?: number; minutes?: number } }).delta;
				if (delta) {
					push('delta', `${delta.days ?? 0}d ${delta.hours ?? 0}h ${delta.minutes ?? 0}m`);
				}
			}
			break;
		}
		case 'location': {
			const location = event as LocationEvent;
			if (location.subkind === 'moved') {
				push('area', (location as { newArea?: string }).newArea);
				push('place', (location as { newPlace?: string }).newPlace);
			} else {
				push('prop', (location as { prop?: string }).prop);
			}
			break;
		}
		case 'character': {
			const character = event as CharacterEvent;
			push('character', (character as { character?: string }).character);
			push('detail', getCharacterDetail(character));
			break;
		}
		case 'relationship': {
			const relationship = event as RelationshipEvent;
			push('from', (relationship as { fromCharacter?: string }).fromCharacter);
			push('toward', (relationship as { towardCharacter?: string }).towardCharacter);
			push('value', (relationship as { value?: string }).value);
			break;
		}
		case 'topic_tone': {
			const topic = event as TopicToneEvent;
			push('topic', (topic as { topic?: string }).topic);
			push('tone', (topic as { tone?: string }).tone);
			break;
		}
		case 'tension': {
			const tension = event as TensionEvent;
			push('level', tension.level);
			push('type', tension.type);
			break;
		}
		case 'narrative_description': {
			const narrative = event as NarrativeDescriptionEvent;
			push('description', narrative.description);
			break;
		}
		case 'chapter': {
			const chapter = event as ChapterEvent;
			push('chapter', chapter.chapterIndex);
			if (chapter.subkind === 'described') {
				push('title', (chapter as { title?: string }).title);
			} else {
				push('reason', (chapter as { reason?: string }).reason);
			}
			break;
		}
		case 'forecast_generated': {
			const forecast = event as ForecastGeneratedEvent;
			push('area', forecast.areaName);
			push('start', forecast.startDate);
			break;
		}
	}

	return `${base}${details.length ? ' [' + details.join(', ') + ']' : ''}`;
}

function getCharacterDetail(event: CharacterEvent) {
	if (event.subkind === 'position_changed' || event.subkind === 'activity_changed') {
		return `${(event as { newValue?: string }).newValue ?? 'unchanged'}`;
	}
	if (event.subkind === 'mood_added' || event.subkind === 'mood_removed') {
		return `${(event as { mood?: string }).mood ?? 'mood'}`;
	}
	if (event.subkind === 'outfit_changed') {
		return `${(event as { slot?: string }).slot ?? 'outfit'}`;
	}
	if (event.subkind === 'physical_added' || event.subkind === 'physical_removed') {
		return `${(event as { physicalState?: string }).physicalState ?? 'physical'}`;
	}
	return event.subkind;
}
