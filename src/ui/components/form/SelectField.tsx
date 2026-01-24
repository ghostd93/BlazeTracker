import React from 'react';

export interface SelectFieldProps {
	id: string;
	label: string;
	description: string;
	value: string;
	options: Array<{ value: string; label: string }>;
	onChange: (value: string) => void;
}

export function SelectField({
	id,
	label,
	description,
	value,
	options,
	onChange,
}: SelectFieldProps) {
	return (
		<div className="flex-container flexFlowColumn">
			<label htmlFor={id}>{label}</label>
			<small>{description}</small>
			<select
				id={id}
				className="text_pole"
				value={value}
				onChange={e => onChange(e.target.value)}
			>
				{options.map(opt => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		</div>
	);
}
