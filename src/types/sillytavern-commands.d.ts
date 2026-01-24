// ============================================
// SillyTavern Slash Command Type Declarations
// ============================================

/**
 * Properties for creating a slash command.
 */
interface SlashCommandProps {
	name: string;
	callback: (args: Record<string, string>, value: string) => Promise<string>;
	namedArgumentList?: SlashCommandNamedArgumentInstance[];
	helpString?: string;
	returns?: string;
}

/**
 * Properties for creating a named argument.
 */
interface SlashCommandNamedArgumentProps {
	name: string;
	description: string;
	typeList: string[];
	isRequired?: boolean;
	defaultValue?: string;
}

/**
 * A slash command object.
 */
interface SlashCommandObject {
	name: string;
}

/**
 * A named argument object.
 */
interface SlashCommandNamedArgumentInstance {
	name: string;
}

// ============================================
// Global Declarations for SillyTavern Modules
// ============================================

declare global {
	/**
	 * SillyTavern's slash command parser.
	 */
	const SlashCommandParser: {
		addCommandObject(command: SlashCommandObject): void;
	};

	/**
	 * Factory for creating slash commands.
	 */
	const SlashCommand: {
		fromProps(props: SlashCommandProps): SlashCommandObject;
	};

	/**
	 * Argument types for slash command arguments.
	 */
	const ARGUMENT_TYPE: {
		STRING: string;
		NUMBER: string;
		BOOLEAN: string;
	};

	/**
	 * Factory for creating named arguments.
	 */
	const SlashCommandNamedArgument: {
		fromProps(props: SlashCommandNamedArgumentProps): SlashCommandNamedArgumentInstance;
	};

	interface Window {
		toastr?: {
			info: (message: string, title?: string, options?: object) => void;
			warning: (message: string, title?: string, options?: object) => void;
			error: (message: string, title?: string, options?: object) => void;
			success: (message: string, title?: string, options?: object) => void;
		};
	}
}

export {};
