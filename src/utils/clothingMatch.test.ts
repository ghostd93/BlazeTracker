import { describe, it, expect } from 'vitest';
import {
	extractClothingType,
	extractColors,
	buildItemSearchTerms,
	extractPropCore,
	propMatchesItem,
	propAlreadyExists,
} from './clothingMatch';

describe('extractClothingType', () => {
	it('extracts common clothing types', () => {
		expect(extractClothingType('white sneakers')).toBe('sneakers');
		expect(extractClothingType('blue jeans')).toBe('jeans');
		expect(extractClothingType('black dress')).toBe('dress');
		expect(extractClothingType('red hoodie')).toBe('hoodie');
	});

	it('handles brand names and modifiers', () => {
		expect(extractClothingType("dark blue Levi's jeans")).toBe('jeans');
		expect(extractClothingType('white Nike sneakers')).toBe('sneakers');
		expect(extractClothingType('Victoria Secret bra')).toBe('bra');
	});

	it('prefers more specific terms', () => {
		// "sneakers" should match before "shoes"
		expect(extractClothingType('running sneakers')).toBe('sneakers');
		// "stockings" should match before "socks"
		expect(extractClothingType('black stockings')).toBe('stockings');
		// "sports bra" should match before "bra"
		expect(extractClothingType('pink sports bra')).toBe('sports bra');
	});

	it('returns null for unknown items', () => {
		expect(extractClothingType('onesie')).toBe(null);
		expect(extractClothingType('watch')).toBe(null);
		expect(extractClothingType('necklace')).toBe(null);
	});
});

describe('extractColors', () => {
	it('extracts single colors', () => {
		expect(extractColors('white sneakers')).toEqual(['white']);
		expect(extractColors('black dress')).toEqual(['black']);
	});

	it('extracts multiple colors', () => {
		expect(extractColors('dark blue jeans')).toContain('dark');
		expect(extractColors('dark blue jeans')).toContain('blue');
	});

	it('returns empty array for no colors', () => {
		expect(extractColors("Levi's jeans")).toEqual([]);
		expect(extractColors('Nike sneakers')).toEqual([]);
	});

	it('handles color modifiers', () => {
		expect(extractColors('pale pink dress')).toContain('pale');
		expect(extractColors('pale pink dress')).toContain('pink');
		expect(extractColors('bright red shoes')).toContain('bright');
		expect(extractColors('bright red shoes')).toContain('red');
	});
});

describe('buildItemSearchTerms', () => {
	it('includes full item name', () => {
		const terms = buildItemSearchTerms('White Nike sneakers');
		expect(terms).toContain('white nike sneakers');
	});

	it('includes clothing type', () => {
		const terms = buildItemSearchTerms('White Nike sneakers');
		expect(terms).toContain('sneakers');
	});

	it('includes color + type combinations', () => {
		const terms = buildItemSearchTerms('White Nike sneakers');
		expect(terms).toContain('white sneakers');
	});

	it('handles multiple colors', () => {
		const terms = buildItemSearchTerms('dark blue jeans');
		expect(terms).toContain('dark blue jeans');
		expect(terms).toContain('jeans');
		expect(terms).toContain('dark jeans');
		expect(terms).toContain('blue jeans');
	});

	it('falls back to words for unknown clothing types', () => {
		const terms = buildItemSearchTerms('pink onesie');
		expect(terms).toContain('pink onesie');
		expect(terms).toContain('onesie'); // word fallback
		expect(terms).not.toContain('pink'); // colors filtered out
	});

	it('filters out short words and stopwords', () => {
		const terms = buildItemSearchTerms('the fancy romper');
		expect(terms).not.toContain('the');
		expect(terms).toContain('fancy');
		expect(terms).toContain('romper');
	});
});

describe('extractPropCore', () => {
	it('removes character prefix', () => {
		expect(extractPropCore("John's sneakers", 'John')).toBe('sneakers');
		expect(extractPropCore("Lucy's blue dress", 'Lucy')).toBe('blue dress');
	});

	it('handles missing apostrophe', () => {
		expect(extractPropCore('Johns sneakers', 'John')).toBe('sneakers');
	});

	it('removes state suffixes', () => {
		expect(extractPropCore('sneakers (removed)', 'John')).toBe('sneakers');
		expect(extractPropCore('jeans (on the floor)', 'John')).toBe('jeans');
	});

	it('removes location info', () => {
		expect(extractPropCore('sneakers on the floor', 'John')).toBe('sneakers');
		expect(extractPropCore('dress on the bed', 'John')).toBe('dress');
		expect(extractPropCore('shirt on the chair', 'John')).toBe('shirt');
	});

	it('removes belonging/from suffixes', () => {
		expect(extractPropCore('sneakers belonging to John', 'John')).toBe('sneakers');
		expect(extractPropCore('dress from Lucy', 'Lucy')).toBe('dress');
	});

	it('handles combined patterns', () => {
		expect(extractPropCore("John's sneakers on the floor", 'John')).toBe('sneakers');
		expect(extractPropCore("Lucy's dress (removed)", 'Lucy')).toBe('dress');
	});
});

describe('propMatchesItem', () => {
	describe('Strategy 1: Direct term matching', () => {
		it('matches exact prop', () => {
			const terms = buildItemSearchTerms('sneakers');
			expect(propMatchesItem('sneakers', terms, 'John', 'sneakers')).toBe(true);
		});

		it('matches prop containing term with char name', () => {
			const terms = buildItemSearchTerms('white sneakers');
			expect(propMatchesItem("John's white sneakers", terms, 'John', 'white sneakers')).toBe(true);
		});

		it('matches generic prop without possessive', () => {
			const terms = buildItemSearchTerms('white sneakers');
			expect(propMatchesItem('sneakers on the floor', terms, 'John', 'white sneakers')).toBe(true);
		});

		it('does not match other character possessive', () => {
			const terms = buildItemSearchTerms('white sneakers');
			expect(propMatchesItem("Lucy's sneakers", terms, 'John', 'white sneakers')).toBe(false);
		});
	});

	describe('Strategy 2: PREFIX patterns', () => {
		it("matches char's item pattern", () => {
			const terms = buildItemSearchTerms('sneakers');
			expect(propMatchesItem("John's sneakers", terms, 'John', 'sneakers')).toBe(true);
		});

		it('matches without apostrophe', () => {
			const terms = buildItemSearchTerms('sneakers');
			expect(propMatchesItem('Johns sneakers', terms, 'John', 'sneakers')).toBe(true);
		});

		it('matches with additional description after prefix', () => {
			const terms = buildItemSearchTerms('sneakers');
			expect(propMatchesItem("John's sneakers on the floor", terms, 'John', 'sneakers')).toBe(true);
		});
	});

	describe('Strategy 3: SUFFIX patterns', () => {
		it('matches "belonging to" pattern', () => {
			const terms = buildItemSearchTerms('sneakers');
			expect(propMatchesItem('sneakers belonging to John', terms, 'John', 'sneakers')).toBe(true);
		});

		it('matches "removed" pattern', () => {
			const terms = buildItemSearchTerms('sneakers');
			expect(propMatchesItem('sneakers John removed', terms, 'John', 'sneakers')).toBe(true);
		});

		it('matches "from" pattern', () => {
			const terms = buildItemSearchTerms('sneakers');
			expect(propMatchesItem('sneakers from John', terms, 'John', 'sneakers')).toBe(true);
		});
	});

	describe('Strategy 4: Substring fallback', () => {
		it('matches unknown item type by substring', () => {
			const terms = buildItemSearchTerms('pink onesie');
			expect(propMatchesItem('onesie', terms, 'John', 'pink onesie')).toBe(true);
		});

		it('matches char prefix with unknown type', () => {
			const terms = buildItemSearchTerms('pink onesie');
			expect(propMatchesItem("John's onesie", terms, 'John', 'pink onesie')).toBe(true);
		});

		it('does not match other character for unknown type', () => {
			const terms = buildItemSearchTerms('pink onesie');
			expect(propMatchesItem("Lucy's onesie", terms, 'John', 'pink onesie')).toBe(false);
		});
	});
});

describe('propAlreadyExists', () => {
	it('finds exact match', () => {
		const props = new Set(['sneakers', 'jacket']);
		expect(propAlreadyExists('sneakers', 'John', props)).toBe(true);
	});

	it('finds character prefixed match', () => {
		const props = new Set(["John's sneakers", 'jacket']);
		expect(propAlreadyExists('White Nike sneakers', 'John', props)).toBe(true);
	});

	it('finds clothing type match', () => {
		const props = new Set(['sneakers on the floor']);
		expect(propAlreadyExists('White Nike sneakers', 'John', props)).toBe(true);
	});

	it('finds color + type match', () => {
		const props = new Set(['white sneakers']);
		expect(propAlreadyExists('White Nike sneakers', 'John', props)).toBe(true);
	});

	it('does not match different character', () => {
		const props = new Set(["Lucy's sneakers"]);
		expect(propAlreadyExists('White Nike sneakers', 'John', props)).toBe(false);
	});

	it('handles unknown clothing types', () => {
		const props = new Set(['onesie']);
		expect(propAlreadyExists('pink onesie', 'John', props)).toBe(true);
	});

	it('handles character prefix with unknown type', () => {
		const props = new Set(["John's onesie"]);
		expect(propAlreadyExists('pink onesie', 'John', props)).toBe(true);
	});

	it('returns false for no match', () => {
		const props = new Set(['jacket', 'hat']);
		expect(propAlreadyExists('sneakers', 'John', props)).toBe(false);
	});

	it('handles empty props set', () => {
		const props = new Set<string>();
		expect(propAlreadyExists('sneakers', 'John', props)).toBe(false);
	});

	describe('real-world scenarios', () => {
		it('John removes white Nike sneakers, props has "John\'s sneakers"', () => {
			const props = new Set(["John's sneakers"]);
			expect(propAlreadyExists('White Nike sneakers', 'John', props)).toBe(true);
		});

		it('John removes jeans, props has "jeans on the floor"', () => {
			const props = new Set(['jeans on the floor']);
			expect(propAlreadyExists("Levi's blue jeans", 'John', props)).toBe(true);
		});

		it('Lucy removes dress, props has "Lucy\'s red dress (removed)"', () => {
			const props = new Set(["Lucy's red dress (removed)"]);
			expect(propAlreadyExists('red dress', 'Lucy', props)).toBe(true);
		});

		it('John removes sneakers, props has "sneakers belonging to John"', () => {
			const props = new Set(['sneakers belonging to John']);
			expect(propAlreadyExists('white sneakers', 'John', props)).toBe(true);
		});

		it('two characters, only matches correct owner', () => {
			const props = new Set(["Lucy's sneakers", "John's jacket"]);
			expect(propAlreadyExists('white sneakers', 'John', props)).toBe(false);
			expect(propAlreadyExists('white sneakers', 'Lucy', props)).toBe(true);
		});
	});
});
