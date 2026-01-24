// ============================================
// Climate Display Component
// ============================================

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProceduralClimate, Climate, DaylightPhase, BuildingType } from '@/types/state';
import { getConditionIcon, getWeatherIcon } from '@/ui/icons';
import { formatTemperature, type TemperatureUnit } from '@/utils/temperatures';
import { isLegacyClimate } from '@/weather';

// ============================================
// Types
// ============================================

interface ClimateDisplayProps {
	climate: ProceduralClimate | Climate;
	temperatureUnit: TemperatureUnit;
}

interface TooltipState {
	visible: boolean;
	x: number;
	y: number;
}

// ============================================
// Constants
// ============================================

const DAYLIGHT_ICONS: Record<DaylightPhase, string> = {
	dawn: 'fa-sun-haze',
	day: 'fa-sun',
	dusk: 'fa-sunset',
	night: 'fa-moon',
};

const DAYLIGHT_LABELS: Record<DaylightPhase, string> = {
	dawn: 'Dawn',
	day: 'Daytime',
	dusk: 'Dusk',
	night: 'Nighttime',
};

const BUILDING_TYPE_LABELS: Record<BuildingType, string> = {
	modern: 'Climate controlled',
	heated: 'Heated building',
	unheated: 'Unheated structure',
	underground: 'Underground',
	tent: 'Tent/minimal shelter',
	vehicle: 'Vehicle',
};

// ============================================
// Helpers
// ============================================

function getWindDescription(speed: number): string {
	if (speed < 1) return 'Calm';
	if (speed < 8) return 'Light breeze';
	if (speed < 13) return 'Gentle breeze';
	if (speed < 19) return 'Moderate breeze';
	if (speed < 25) return 'Fresh breeze';
	if (speed < 32) return 'Strong breeze';
	if (speed < 39) return 'High wind';
	if (speed < 47) return 'Gale';
	if (speed < 55) return 'Strong gale';
	return 'Storm force';
}

function getHumidityDescription(humidity: number): string {
	if (humidity < 30) return 'Very dry';
	if (humidity < 45) return 'Dry';
	if (humidity < 65) return 'Comfortable';
	if (humidity < 80) return 'Humid';
	return 'Very humid';
}

function getUVDescription(uv: number): string {
	if (uv < 3) return 'Low';
	if (uv < 6) return 'Moderate';
	if (uv < 8) return 'High';
	if (uv < 11) return 'Very high';
	return 'Extreme';
}

// ============================================
// Component
// ============================================

export function ClimateDisplay({ climate, temperatureUnit }: ClimateDisplayProps) {
	const [tooltip, setTooltip] = useState<TooltipState>({
		visible: false,
		x: 0,
		y: 0,
	});

	const isLegacy = isLegacyClimate(climate);
	const procedural = isLegacy ? null : (climate as ProceduralClimate);

	// Get condition icon
	const conditionIcon = isLegacy
		? getWeatherIcon((climate as Climate).weather)
		: getConditionIcon((climate as ProceduralClimate).conditionType);

	// Get temperature to display
	const displayTemp = climate.temperature;

	// Check if indoors
	const isIndoors = procedural?.isIndoors ?? false;

	// Check if feels like is significantly different (>5°F difference)
	const feelsLikeDiff = procedural
		? Math.abs(procedural.feelsLike - procedural.outdoorTemperature)
		: 0;
	const showFeelsLike = !isIndoors && feelsLikeDiff > 5;

	// Handle mouse events
	const handleMouseEnter = (e: React.MouseEvent) => {
		setTooltip({
			visible: true,
			x: e.clientX,
			y: e.clientY - 10,
		});
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		setTooltip(prev => ({
			...prev,
			x: e.clientX,
			y: e.clientY - 10,
		}));
	};

	const handleMouseLeave = () => {
		setTooltip(prev => ({ ...prev, visible: false }));
	};

	return (
		<>
			<span
				className="bt-climate"
				onMouseEnter={handleMouseEnter}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
			>
				{/* Condition icon */}
				<i className={`fa-solid ${conditionIcon}`}></i>

				{/* Temperature */}
				{displayTemp !== undefined && (
					<span className="bt-climate-temp">
						{formatTemperature(displayTemp, temperatureUnit)}
					</span>
				)}

				{/* Indoor indicator */}
				{isIndoors && (
					<i
						className="fa-solid fa-house bt-climate-indoor"
						title="Indoors"
					></i>
				)}

				{/* Feels like indicator (when significantly different outdoors) */}
				{showFeelsLike && procedural && (
					<span className="bt-climate-feels">
						<i className="fa-solid fa-temperature-half"></i>
						<span className="bt-feels-value">
							{formatTemperature(
								procedural.feelsLike,
								temperatureUnit,
							)}
						</span>
					</span>
				)}

				{/* Wind indicator (when notable) */}
				{procedural && procedural.windSpeed >= 15 && !isIndoors && (
					<i
						className="fa-solid fa-wind bt-climate-wind"
						title={`${Math.round(procedural.windSpeed)} mph ${procedural.windDirection}`}
					></i>
				)}

				{/* Humidity indicator (when high) */}
				{procedural && procedural.humidity >= 75 && !isIndoors && (
					<i
						className="fa-solid fa-droplet bt-climate-humidity"
						title={`${Math.round(procedural.humidity)}% humidity`}
					></i>
				)}
			</span>

			{/* Detailed tooltip */}
			{tooltip.visible &&
				procedural &&
				createPortal(
					<div
						className="bt-climate-tooltip"
						style={{
							position: 'fixed',
							left: tooltip.x,
							top: tooltip.y,
							transform: 'translate(-50%, -100%)',
						}}
					>
						{/* Conditions */}
						<div className="bt-climate-tooltip-row bt-climate-conditions">
							<i
								className={`fa-solid ${conditionIcon}`}
							></i>
							<span>{procedural.conditions}</span>
						</div>

						{/* Daylight */}
						<div className="bt-climate-tooltip-row">
							<i
								className={`fa-solid ${DAYLIGHT_ICONS[procedural.daylight]}`}
							></i>
							<span>
								{
									DAYLIGHT_LABELS[
										procedural.daylight
									]
								}
							</span>
						</div>

						{/* Temperatures section */}
						<div className="bt-climate-tooltip-section">
							{isIndoors &&
								procedural.indoorTemperature !==
									undefined && (
									<div className="bt-climate-tooltip-row">
										<i className="fa-solid fa-house"></i>
										<span>
											Indoor:{' '}
											{formatTemperature(
												procedural.indoorTemperature,
												temperatureUnit,
											)}
											{procedural.buildingType && (
												<span className="bt-climate-building">
													{' '}
													(
													{
														BUILDING_TYPE_LABELS[
															procedural
																.buildingType
														]
													}

													)
												</span>
											)}
										</span>
									</div>
								)}
							<div className="bt-climate-tooltip-row">
								<i className="fa-solid fa-tree"></i>
								<span>
									Outdoor:{' '}
									{formatTemperature(
										procedural.outdoorTemperature,
										temperatureUnit,
									)}
								</span>
							</div>
							{feelsLikeDiff > 2 && (
								<div className="bt-climate-tooltip-row">
									<i className="fa-solid fa-temperature-half"></i>
									<span>
										Feels like:{' '}
										{formatTemperature(
											procedural.feelsLike,
											temperatureUnit,
										)}
									</span>
								</div>
							)}
						</div>

						{/* Atmospheric section */}
						<div className="bt-climate-tooltip-section">
							<div className="bt-climate-tooltip-row">
								<i className="fa-solid fa-droplet"></i>
								<span>
									{Math.round(
										procedural.humidity,
									)}
									% humidity (
									{getHumidityDescription(
										procedural.humidity,
									)}
									)
								</span>
							</div>
							<div className="bt-climate-tooltip-row">
								<i className="fa-solid fa-wind"></i>
								<span>
									{getWindDescription(
										procedural.windSpeed,
									)}
									{procedural.windSpeed >=
										5 && (
										<>
											{' '}
											(
											{Math.round(
												procedural.windSpeed,
											)}{' '}
											mph{' '}
											{
												procedural.windDirection
											}
											)
										</>
									)}
								</span>
							</div>
							{procedural.daylight === 'day' &&
								procedural.uvIndex > 0 && (
									<div className="bt-climate-tooltip-row">
										<i className="fa-solid fa-sun"></i>
										<span>
											UV Index:{' '}
											{
												procedural.uvIndex
											}{' '}
											(
											{getUVDescription(
												procedural.uvIndex,
											)}
											)
										</span>
									</div>
								)}
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}
