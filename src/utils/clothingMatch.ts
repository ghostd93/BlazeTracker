/**
 * Utility functions for matching clothing items in props.
 * Used to detect duplicate items when moving removed clothing to location props.
 */

// ============================================
// Constants
// ============================================

/**
 * Common clothing type keywords to extract for fuzzy matching.
 * Order matters - more specific terms should come first.
 */
export const CLOTHING_KEYWORDS = [
	// Footwear
	'sneakers',
	'trainers',
	'boots',
	'heels',
	'sandals',
	'loafers',
	'flats',
	'shoes',
	'slippers',
	// Legwear
	'stockings',
	'tights',
	'thigh-highs',
	'knee-highs',
	'socks',
	'jeans',
	'trousers',
	'pants',
	'shorts',
	'skirt',
	'leggings',
	'sweatpants',
	// Underwear
	'panties',
	'knickers',
	'thong',
	'boxers',
	'briefs',
	'underwear',
	'sports bra',
	'bralette',
	'bra',
	// Tops
	'blouse',
	't-shirt',
	'tshirt',
	'shirt',
	'top',
	'tank top',
	'vest',
	'camisole',
	'sweater',
	'jumper',
	'hoodie',
	'cardigan',
	'pullover',
	// Outerwear
	'jacket',
	'coat',
	'blazer',
	'parka',
	'windbreaker',
	// Dresses
	'dress',
	'gown',
	'sundress',
	// Headwear
	'hat',
	'cap',
	'beanie',
	'hood',
];

/**
 * Common color words to extract from item descriptions.
 */
export const COLOR_KEYWORDS = [
	'black',
	'white',
	'red',
	'blue',
	'green',
	'yellow',
	'purple',
	'pink',
	'orange',
	'brown',
	'grey',
	'gray',
	'navy',
	'cream',
	'beige',
	'tan',
	'maroon',
	'burgundy',
	'teal',
	'cyan',
	'silver',
	'gold',
	'dark',
	'light',
	'pale',
	'bright',
	'pastel',
];

/**
 * Patterns for PREFIX [item] - character name before the item.
 */
export const CHAR_PREFIX_PATTERNS = [
	(char: string) => `${char}'s `,
	(char: string) => `${char}s `, // Without apostrophe
];

/**
 * Patterns for [item] SUFFIX - character name after the item.
 */
export const CHAR_SUFFIX_PATTERNS = [
	(char: string) => ` belonging to ${char}`,
	(char: string) => ` ${char} removed`,
	(char: string) => ` ${char} took off`,
	(char: string) => ` ${char} dropped`,
	(char: string) => ` ${char} discarded`,
	(char: string) => ` from ${char}`,
	(char: string) => ` (${char}'s)`,
];

// ============================================
// Extraction Functions
// ============================================

/**
 * Extract the core clothing type from a descriptive item name.
 * e.g., "dark blue Levi's jeans" -> "jeans"
 */
export function extractClothingType(itemName: string): string | null {
	const lower = itemName.toLowerCase();
	for (const keyword of CLOTHING_KEYWORDS) {
		if (lower.includes(keyword)) {
			return keyword;
		}
	}
	return null;
}

/**
 * Extract color(s) from an item description.
 * e.g., "dark blue Levi's jeans" -> ["dark", "blue"]
 */
export function extractColors(itemName: string): string[] {
	const lower = itemName.toLowerCase();
	const colors: string[] = [];
	for (const color of COLOR_KEYWORDS) {
		if (lower.includes(color)) {
			colors.push(color);
		}
	}
	return colors;
}

/**
 * Build search terms for an item. Returns variations we should look for.
 * e.g., "White Nike sneakers" ->
 *   ["white nike sneakers", "sneakers", "white sneakers"]
 */
export function buildItemSearchTerms(itemName: string): string[] {
	const terms: string[] = [];
	const lower = itemName.toLowerCase();

	// Full item name
	terms.push(lower);

	// Just the clothing type
	const clothingType = extractClothingType(itemName);
	if (clothingType) {
		terms.push(clothingType);

		// Color + type combinations
		const colors = extractColors(itemName);
		for (const color of colors) {
			terms.push(`${color} ${clothingType}`);
		}
	} else {
		// No known clothing type - add individual words as fallback
		// This helps match "onesie" when item is "pink onesie"
		const words = lower
			.split(/\s+/)
			.filter(
				w =>
					w.length > 2 &&
					!COLOR_KEYWORDS.includes(w) &&
					!['the', 'and', 'with'].includes(w),
			);
		terms.push(...words);
	}

	return [...new Set(terms)]; // Dedupe
}

/**
 * Strip a prop string down to its core item description.
 * Removes character prefixes, state suffixes like "(removed)", location info.
 */
export function extractPropCore(prop: string, charName: string): string {
	const charLower = charName.toLowerCase();
	let propCore = prop.toLowerCase();

	// Remove character prefix
	for (const prefixFn of CHAR_PREFIX_PATTERNS) {
		const prefix = prefixFn(charLower);
		if (propCore.startsWith(prefix)) {
			propCore = propCore.slice(prefix.length);
			break;
		}
	}

	// Strip common suffixes like "on the floor", "(removed)" etc.
	propCore = propCore
		.replace(/\s*\(.*\)\s*$/, '')
		.replace(/\s+on the (?:floor|ground|bed|chair|table|sofa|couch).*$/, '')
		.replace(/\s+(?:removed|discarded|dropped|tossed|thrown).*$/, '')
		.replace(/\s+belonging to \w+.*$/, '')
		.replace(/\s+from \w+.*$/, '')
		.trim();

	return propCore;
}

// ============================================
// Matching Functions
// ============================================

/**
 * Check if a prop matches an item for a given character.
 * Uses PREFIX [item] SUFFIX pattern matching.
 */
export function propMatchesItem(
	prop: string,
	itemSearchTerms: string[],
	charName: string,
	fullItemName: string,
): boolean {
	const propLower = prop.toLowerCase();
	const charLower = charName.toLowerCase();
	const itemLower = fullItemName.toLowerCase();

	// Strategy 1: Check if prop contains any search term AND the character name
	const hasCharName = propLower.includes(charLower);

	for (const term of itemSearchTerms) {
		// Direct match on full prop
		if (propLower === term) return true;

		// Prop contains the search term
		if (propLower.includes(term)) {
			// If char name is also present, definitely a match
			if (hasCharName) return true;

			// If no possessive marker at all, it's probably a generic prop that matches
			// e.g., "sneakers on the floor" matches anyone's sneakers
			if (!propLower.includes("'s") && !propLower.includes('belonging to')) {
				return true;
			}
		}
	}

	// Strategy 2: Check PREFIX patterns - "Elena's [term]"
	for (const prefixFn of CHAR_PREFIX_PATTERNS) {
		const prefix = prefixFn(charLower);
		if (propLower.startsWith(prefix)) {
			// Check if any search term appears after the prefix
			const afterPrefix = propLower.slice(prefix.length);
			for (const term of itemSearchTerms) {
				if (
					afterPrefix.includes(term) ||
					term.includes(afterPrefix.split(' ')[0])
				) {
					return true;
				}
			}
			// Fallback: check if the afterPrefix is substring of item or vice versa
			if (
				afterPrefix.length > 2 &&
				(itemLower.includes(afterPrefix) || afterPrefix.includes(itemLower))
			) {
				return true;
			}
		}
	}

	// Strategy 3: Check SUFFIX patterns - "[term] belonging to Elena"
	for (const suffixFn of CHAR_SUFFIX_PATTERNS) {
		const suffix = suffixFn(charLower);
		if (propLower.includes(suffix)) {
			for (const term of itemSearchTerms) {
				if (propLower.includes(term)) {
					return true;
				}
			}
		}
	}

	// Strategy 4: Substring fallback for unknown item types
	// If prop (without char prefix) is substring of item or vice versa
	// e.g., prop "onesie" matches item "pink onesie"
	const propCore = extractPropCore(prop, charName);

	if (propCore.length > 2) {
		if (itemLower.includes(propCore) || propCore.includes(itemLower)) {
			// But make sure it's not a different character's item
			if (hasCharName || !propLower.includes("'s")) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Check if a prop already exists in the set using multiple matching strategies.
 */
export function propAlreadyExists(
	itemName: string,
	charName: string,
	existingProps: Set<string>,
): boolean {
	const searchTerms = buildItemSearchTerms(itemName);

	for (const prop of existingProps) {
		if (propMatchesItem(prop, searchTerms, charName, itemName)) {
			return true;
		}
	}

	return false;
}
