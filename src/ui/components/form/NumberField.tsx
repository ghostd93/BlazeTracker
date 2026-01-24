import React from 'react';

export interface NumberFieldProps {
	id: string;
	label: string;
	description: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => void;
}

export function NumberField({
	id,
	label,
	description,
	value,
	min,
	max,
	step,
	onChange,
}: NumberFieldProps) {
	return (
		<div className="flex-container flexFlowColumn">
			<label htmlFor={id}>{label}</label>
			<small>{description}</small>
			<input
				type="number"
				id={id}
				className="text_pole"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={e => onChange(parseInt(e.target.value) || min)}
			/>
		</div>
	);
}
