import React from 'react';

export interface LoadingIndicatorProps {
	stepLabel: string;
}

export function LoadingIndicator({ stepLabel }: LoadingIndicatorProps) {
	return (
		<div className="bt-state-container bt-extracting">
			<div className="bt-loading-indicator">
				<i className="fa-solid fa-fire fa-beat-fade"></i>
				<span>{stepLabel}</span>
			</div>
		</div>
	);
}
