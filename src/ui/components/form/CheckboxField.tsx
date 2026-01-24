import React from 'react';

export interface CheckboxFieldProps {
	id: string;
	label: string;
	description: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}

export function CheckboxField({ id, label, description, checked, onChange }: CheckboxFieldProps) {
	return (
		<div className="flex-container flexFlowColumn">
			<label className="checkbox_label">
				<input
					type="checkbox"
					id={id}
					checked={checked}
					onChange={e => onChange(e.target.checked)}
				/>
				<span>{label}</span>
			</label>
			<small>{description}</small>
		</div>
	);
}
