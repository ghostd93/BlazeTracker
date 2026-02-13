import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Generator } from '../../generator';
import type { PromptTemplate } from '../../prompts';
import { generateAndParse } from './parse';
import { getV2Settings } from '../../settings';

vi.mock('../../settings', () => ({
	getV2Settings: vi.fn(),
}));

const mockGetV2Settings = vi.mocked(getV2Settings);

function createPrompt(name: string): PromptTemplate<{ ok: boolean }> {
	return {
		name,
		description: `${name} test prompt`,
		placeholders: [],
		systemPrompt: 'system',
		userTemplate: 'user',
		responseSchema: { type: 'object' },
		defaultTemperature: 0.3,
		parseResponse: response => (response.includes('"ok":true') ? { ok: true } : null),
	};
}

describe('generateAndParse token caps', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetV2Settings.mockReturnValue({
			v2MaxTokens: 4096,
			v2ProfileId: 'test-profile',
		} as ReturnType<typeof getV2Settings>);
	});

	it('attempts strict JSON repair before retrying', async () => {
		const generator: Generator = {
			generate: vi.fn().mockResolvedValue('{"ok":true,'),
			abort: vi.fn(),
		};

		const repairPrompt: PromptTemplate<{ ok: boolean }> = {
			name: 'repair',
			description: 'repair test prompt',
			placeholders: [],
			systemPrompt: '',
			userTemplate: '',
			responseSchema: { type: 'object' },
			defaultTemperature: 0.5,
			parseResponse: vi.fn(response =>
				response.trim() === '{"ok":true}' ? { ok: true } : null,
			),
		};

		const result = await generateAndParse(
			generator,
			repairPrompt,
			{ system: 'sys', user: 'user' },
			0.5,
			{ maxRetries: 0 },
		);

		expect(result.success).toBe(true);
		expect(result.data).toEqual({ ok: true });
		expect(generator.generate).toHaveBeenCalledOnce();
		expect(repairPrompt.parseResponse).toHaveBeenCalledWith('{"ok":true,');
		expect(repairPrompt.parseResponse).toHaveBeenCalledWith('{"ok":true}');
	});

	it('applies conservative cap for short-output prompts', async () => {
		const generator: Generator = {
			generate: vi.fn().mockResolvedValue('{"ok":true}'),
			abort: vi.fn(),
		};

		await generateAndParse(
			generator,
			createPrompt('location_change'),
			{ system: 'sys', user: 'user' },
			0.4,
			{ maxRetries: 0 },
		);

		expect(generator.generate).toHaveBeenCalledTimes(1);
		const settingsArg = vi.mocked(generator.generate).mock.calls[0][1];
		expect(settingsArg.maxTokens).toBe(320);
	});

	it('keeps global token limit for prompts without a cap', async () => {
		const generator: Generator = {
			generate: vi.fn().mockResolvedValue('{"ok":true}'),
			abort: vi.fn(),
		};

		await generateAndParse(
			generator,
			createPrompt('narrative_description'),
			{ system: 'sys', user: 'user' },
			0.6,
			{ maxRetries: 0 },
		);

		expect(generator.generate).toHaveBeenCalledTimes(1);
		const settingsArg = vi.mocked(generator.generate).mock.calls[0][1];
		expect(settingsArg.maxTokens).toBe(4096);
	});

	it('never increases tokens when global max is lower than cap', async () => {
		mockGetV2Settings.mockReturnValue({
			v2MaxTokens: 200,
			v2ProfileId: 'test-profile',
		} as ReturnType<typeof getV2Settings>);

		const generator: Generator = {
			generate: vi.fn().mockResolvedValue('{"ok":true}'),
			abort: vi.fn(),
		};

		await generateAndParse(
			generator,
			createPrompt('chapter_ended'),
			{ system: 'sys', user: 'user' },
			0.2,
			{ maxRetries: 0 },
		);

		expect(generator.generate).toHaveBeenCalledTimes(1);
		const settingsArg = vi.mocked(generator.generate).mock.calls[0][1];
		expect(settingsArg.maxTokens).toBe(200);
	});
});
