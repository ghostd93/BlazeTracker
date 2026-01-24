import React from 'react';
import type { CharacterOutfit } from '@/types/state';
import { OUTFIT_SLOTS } from '../../constants';

export interface OutfitEditorProps {
	outfit: CharacterOutfit;
	onChange: (outfit: CharacterOutfit) => void;
}

/** Outfit editor with nullable slots */
export function OutfitEditor({ outfit, onChange }: OutfitEditorProps) {
	const update = (slot: keyof CharacterOutfit, value: string | null) => {
		onChange({ ...outfit, [slot]: value || null });
	};

	return (
		<div className="bt-outfit-grid">
			{OUTFIT_SLOTS.map(slot => (
				<div key={slot} className="bt-outfit-slot">
					<label>{slot}</label>
					<div className="bt-outfit-row">
						<input
							type="text"
							value={outfit[slot] || ''}
							onChange={e => update(slot, e.target.value)}
							placeholder="None"
						/>
						{outfit[slot] && (
							<button
								type="button"
								onClick={() => update(slot, null)}
								className="bt-x"
							>
								&times;
							</button>
						)}
					</div>
				</div>
			))}
		</div>
	);
}
