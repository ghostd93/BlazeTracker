import React, { useState } from 'react';

export interface TagInputProps {
	tags: string[];
	onChange: (tags: string[]) => void;
	placeholder?: string;
}

/** Tag input for arrays of strings (mood, physicalState, etc.) */
export function TagInput({ tags, onChange, placeholder = 'Add...' }: TagInputProps) {
	const [input, setInput] = useState('');

	const addTag = () => {
		const trimmed = input.trim();
		if (trimmed && !tags.includes(trimmed)) {
			onChange([...tags, trimmed]);
			setInput('');
		}
	};

	const removeTag = (tag: string) => {
		onChange(tags.filter(t => t !== tag));
	};

	return (
		<div className="bt-tag-input">
			<div className="bt-tags">
				{tags.map(tag => (
					<span key={tag} className="bt-tag">
						{tag}
						<button
							type="button"
							onClick={() => removeTag(tag)}
							className="bt-tag-x"
						>
							&times;
						</button>
					</span>
				))}
			</div>
			<div className="bt-tag-add">
				<input
					type="text"
					value={input}
					onChange={e => setInput(e.target.value)}
					onKeyDown={e =>
						e.key === 'Enter' && (e.preventDefault(), addTag())
					}
					placeholder={placeholder}
				/>
				<button type="button" onClick={addTag}>
					+
				</button>
			</div>
		</div>
	);
}
