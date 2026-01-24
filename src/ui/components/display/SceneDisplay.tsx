import React from 'react';
import type { Scene } from '@/types/state';
import {
	TENSION_LEVEL_ICONS,
	TENSION_DIRECTION_ICONS,
	TENSION_TYPE_ICONS,
	getTensionTypeColor,
	getTensionColor,
} from '../../icons';

export interface SceneDisplayProps {
	scene: Scene;
	onMoreInfoClick?: () => void;
}

export function SceneDisplay({ scene, onMoreInfoClick }: SceneDisplayProps) {
	const { tension } = scene;
	const typeColor = getTensionTypeColor(tension.type);
	const levelColor = getTensionColor(tension.level);

	// Direction colors
	const directionColors: Record<string, string> = {
		escalating: '#ef4444', // red
		stable: '#6b7280', // gray
		decreasing: '#22c55e', // green
	};
	const directionColor = directionColors[tension.direction] || '#6b7280';

	return (
		<div className="bt-scene">
			<div className="bt-scene-header">
				<span className="bt-scene-topic">{scene.topic}</span>
				<span className="bt-scene-tone">{scene.tone}</span>
				{onMoreInfoClick && (
					<button
						className="bt-more-info-btn"
						onClick={onMoreInfoClick}
						title="View narrative overview"
					>
						<i className="fa-solid fa-book-open"></i>
					</button>
				)}
			</div>
			<div className="bt-scene-tension">
				<span className="bt-tension-type" title={tension.type}>
					<i
						className={`fa-solid ${TENSION_TYPE_ICONS[tension.type]}`}
						style={{ color: typeColor }}
					></i>
					{tension.type}
				</span>
				<span className="bt-tension-level" title={tension.level}>
					<i
						className={`fa-solid ${TENSION_LEVEL_ICONS[tension.level]}`}
						style={{ color: levelColor }}
					></i>
					{tension.level}
				</span>
				<span className="bt-tension-direction" title={tension.direction}>
					<i
						className={`fa-solid ${TENSION_DIRECTION_ICONS[tension.direction]}`}
						style={{ color: directionColor }}
					></i>
					{tension.direction}
				</span>
			</div>
		</div>
	);
}
