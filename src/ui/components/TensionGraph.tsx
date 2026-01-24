// ============================================
// Tension Graph Component
// ============================================

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { TimestampedEvent, TensionLevel } from '../../types/state';
import { getTensionColor, getTensionValue, getTensionLevelIcon } from '../icons';

// ============================================
// Types
// ============================================

interface TensionGraphProps {
	events: TimestampedEvent[];
	/** If not provided, graph will fill its container */
	width?: number;
	/** If not provided, defaults to 250 or fills container */
	height?: number;
}

interface TooltipState {
	visible: boolean;
	x: number;
	y: number;
	event: TimestampedEvent | null;
}

// ============================================
// Constants
// ============================================

const PADDING = { top: 25, right: 20, bottom: 30, left: 50 };
const TENSION_LEVELS: TensionLevel[] = [
	'relaxed',
	'aware',
	'guarded',
	'tense',
	'charged',
	'volatile',
	'explosive',
];

// ============================================
// Helpers
// ============================================

/**
 * Calculate the time span in minutes between first and last event.
 */
function getTimeSpanMinutes(events: TimestampedEvent[]): number {
	if (events.length < 2) return 0;
	const first = events[0].timestamp;
	const last = events[events.length - 1].timestamp;

	// Convert to minutes since midnight for comparison
	const firstMinutes = first.hour * 60 + first.minute;
	const lastMinutes = last.hour * 60 + last.minute;

	// Handle day boundaries (simple approach - assume same day or next day)
	let diff = lastMinutes - firstMinutes;
	if (diff < 0) diff += 24 * 60; // Crossed midnight

	return diff;
}

/**
 * Format time based on span - show minutes if the span is short.
 */
function formatTimeForSpan(event: TimestampedEvent, spanMinutes: number): string {
	const dt = event.timestamp;
	const hour12 = dt.hour % 12 || 12;
	const ampm = dt.hour < 12 ? 'a' : 'p';
	const minute = dt.minute.toString().padStart(2, '0');

	// If span is less than 2 hours, show minutes
	if (spanMinutes < 120) {
		return `${hour12}:${minute}${ampm}`;
	}
	// If span is less than 6 hours, show minutes on the hour boundaries
	if (spanMinutes < 360) {
		return dt.minute === 0 ? `${hour12}${ampm}` : `${hour12}:${minute}${ampm}`;
	}
	// Otherwise just show hour
	return `${hour12}${ampm}`;
}

// ============================================
// Component
// ============================================

export function TensionGraph({ events, width: propWidth, height: propHeight }: TensionGraphProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [dimensions, setDimensions] = useState({
		width: propWidth ?? 400,
		height: propHeight ?? 250,
	});
	const [tooltip, setTooltip] = useState<TooltipState>({
		visible: false,
		x: 0,
		y: 0,
		event: null,
	});

	// Use ResizeObserver to track container size when no fixed dimensions provided
	useEffect(() => {
		if (propWidth && propHeight) {
			setDimensions({ width: propWidth, height: propHeight });
			return;
		}

		const container = containerRef.current;
		if (!container) return;

		const observer = new ResizeObserver(entries => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (width > 0 && height > 0) {
					setDimensions({
						width: propWidth ?? width,
						height: propHeight ?? Math.max(250, height),
					});
				}
			}
		});

		observer.observe(container);
		return () => observer.disconnect();
	}, [propWidth, propHeight]);

	const width = dimensions.width;
	const height = dimensions.height;

	// Calculate dimensions
	const graphWidth = width - PADDING.left - PADDING.right;
	const graphHeight = height - PADDING.top - PADDING.bottom;

	// Calculate time span for smart formatting
	const timeSpanMinutes = useMemo(() => getTimeSpanMinutes(events), [events]);

	// Generate points for the line
	const points = useMemo(() => {
		if (events.length === 0) return [];

		return events.map((event, index) => {
			const x =
				PADDING.left +
				(index / Math.max(events.length - 1, 1)) * graphWidth;
			const tensionValue = getTensionValue(event.tensionLevel);
			const y =
				PADDING.top + graphHeight - ((tensionValue - 1) / 6) * graphHeight;
			return { x, y, event };
		});
	}, [events, graphWidth, graphHeight]);

	// Generate path for the line
	const linePath = useMemo(() => {
		if (points.length === 0) return '';
		if (points.length === 1) return '';

		return points
			.map((point, i) => {
				return `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
			})
			.join(' ');
	}, [points]);

	// Handle mouse events - use viewport coordinates for portal positioning
	const handlePointEnter = (point: (typeof points)[0], e: React.MouseEvent) => {
		setTooltip({
			visible: true,
			x: e.clientX,
			y: e.clientY - 10,
			event: point.event,
		});
	};

	const handlePointLeave = () => {
		setTooltip(prev => ({ ...prev, visible: false }));
	};

	if (events.length === 0) {
		return (
			<div className="bt-tension-graph bt-empty" ref={containerRef}>
				<p>No events to graph.</p>
			</div>
		);
	}

	return (
		<div className="bt-tension-graph" ref={containerRef}>
			<svg width={width} height={height} className="bt-tension-svg">
				{/* Y-axis labels with icons */}
				{TENSION_LEVELS.map((level, i) => {
					const y = PADDING.top + graphHeight - (i / 6) * graphHeight;
					const iconClass = getTensionLevelIcon(level);
					const color = getTensionColor(level);
					return (
						<g key={level}>
							<line
								x1={PADDING.left - 5}
								y1={y}
								x2={PADDING.left}
								y2={y}
								stroke="#666"
								strokeWidth={1}
							/>
							{/* Use foreignObject to render HTML icon */}
							<foreignObject
								x={PADDING.left - 40}
								y={y - 10}
								width={35}
								height={20}
							>
								<i
									className={iconClass}
									style={{
										color,
										fontSize: '14px',
										display: 'block',
									}}
									title={level}
								/>
							</foreignObject>
							{/* Grid line */}
							<line
								x1={PADDING.left}
								y1={y}
								x2={width - PADDING.right}
								y2={y}
								stroke="#333"
								strokeWidth={1}
								strokeDasharray="2,2"
							/>
						</g>
					);
				})}

				{/* X-axis */}
				<line
					x1={PADDING.left}
					y1={height - PADDING.bottom}
					x2={width - PADDING.right}
					y2={height - PADDING.bottom}
					stroke="#666"
					strokeWidth={1}
				/>

				{/* Y-axis */}
				<line
					x1={PADDING.left}
					y1={PADDING.top}
					x2={PADDING.left}
					y2={height - PADDING.bottom}
					stroke="#666"
					strokeWidth={1}
				/>

				{/* Line path */}
				{linePath && (
					<path
						d={linePath}
						fill="none"
						stroke="#888"
						strokeWidth={2}
						strokeLinejoin="round"
						strokeLinecap="round"
					/>
				)}

				{/* Data points */}
				{points.map((point, i) => (
					<circle
						key={i}
						cx={point.x}
						cy={point.y}
						r={6}
						fill={getTensionColor(point.event.tensionLevel)}
						stroke="#fff"
						strokeWidth={2}
						className="bt-graph-point"
						onMouseEnter={e => handlePointEnter(point, e)}
						onMouseLeave={handlePointLeave}
					/>
				))}

				{/* X-axis time labels (show first, middle, last) */}
				{events.length > 0 && (
					<>
						<text
							x={PADDING.left}
							y={height - PADDING.bottom + 15}
							textAnchor="start"
							className="bt-graph-label"
							fontSize={10}
							fill="#999"
						>
							{formatTimeForSpan(
								events[0],
								timeSpanMinutes,
							)}
						</text>
						{events.length > 2 && (
							<text
								x={PADDING.left + graphWidth / 2}
								y={height - PADDING.bottom + 15}
								textAnchor="middle"
								className="bt-graph-label"
								fontSize={10}
								fill="#999"
							>
								{formatTimeForSpan(
									events[
										Math.floor(
											events.length /
												2,
										)
									],
									timeSpanMinutes,
								)}
							</text>
						)}
						{events.length > 1 && (
							<text
								x={width - PADDING.right}
								y={height - PADDING.bottom + 15}
								textAnchor="end"
								className="bt-graph-label"
								fontSize={10}
								fill="#999"
							>
								{formatTimeForSpan(
									events[events.length - 1],
									timeSpanMinutes,
								)}
							</text>
						)}
					</>
				)}
			</svg>

			{/* Tooltip - rendered via portal to escape overflow clipping */}
			{tooltip.visible &&
				tooltip.event &&
				createPortal(
					<div
						className="bt-graph-tooltip"
						style={{
							position: 'fixed',
							left: tooltip.x,
							top: tooltip.y,
							transform: 'translate(-50%, -100%)',
						}}
					>
						<div
							className="bt-tooltip-level"
							style={{
								color: getTensionColor(
									tooltip.event.tensionLevel,
								),
							}}
						>
							{tooltip.event.tensionLevel}{' '}
							{tooltip.event.tensionType}
						</div>
						<div className="bt-tooltip-summary">
							{tooltip.event.summary}
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}
