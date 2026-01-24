// ============================================
// Relationships Tab Component
// ============================================

import React, { useState, useMemo } from 'react';
import type {
	Relationship,
	RelationshipStatus,
	RelationshipAttitude,
	NarrativeDateTime,
} from '../../types/state';
import { RELATIONSHIP_STATUSES } from '../../types/state';
import { TagInput } from '../components/form/TagInput';

// ============================================
// Helpers
// ============================================

function formatMilestoneDate(dt: NarrativeDateTime | undefined): string {
	if (!dt) return '';
	const months = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec',
	];
	const month = months[dt.month - 1] || 'Jan';
	return `${month} ${dt.day}, ${dt.year}`;
}

// ============================================
// Types
// ============================================

interface RelationshipsTabProps {
	relationships: Relationship[];
	presentCharacters?: string[];
	editMode?: boolean;
	onUpdate?: (relationships: Relationship[]) => void;
}

interface RelationshipCardProps {
	relationship: Relationship;
	isExpanded: boolean;
	onToggle: () => void;
	editMode?: boolean;
	isEditing?: boolean;
	onStartEdit?: () => void;
	onUpdateRelationship?: (relationship: Relationship) => void;
	onDeleteRelationship?: () => void;
}

// ============================================
// Constants
// ============================================

const STATUS_COLORS: Record<RelationshipStatus, string> = {
	strangers: '#6b7280',
	acquaintances: '#3b82f6',
	friendly: '#22c55e',
	close: '#f59e0b',
	intimate: '#ec4899',
	strained: '#f97316',
	hostile: '#ef4444',
	complicated: '#8b5cf6',
};

const STATUS_ICONS: Record<RelationshipStatus, string> = {
	strangers: 'fa-user-secret',
	acquaintances: 'fa-handshake',
	friendly: 'fa-users',
	close: 'fa-user-group',
	intimate: 'fa-heart',
	strained: 'fa-face-frown',
	hostile: 'fa-skull',
	complicated: 'fa-question',
};

// ============================================
// Components
// ============================================

function RelationshipCard({
	relationship,
	isExpanded,
	onToggle,
	editMode,
	isEditing,
	onStartEdit,
	onUpdateRelationship,
	onDeleteRelationship,
}: RelationshipCardProps) {
	const [char1, char2] = relationship.pair;
	const statusColor = STATUS_COLORS[relationship.status] || '#6b7280';
	const statusIcon = STATUS_ICONS[relationship.status] || 'fa-circle';

	const handleStatusChange = (newStatus: RelationshipStatus) => {
		onUpdateRelationship?.({ ...relationship, status: newStatus });
	};

	const handleAToBChange = (field: keyof RelationshipAttitude, values: string[]) => {
		onUpdateRelationship?.({
			...relationship,
			aToB: { ...relationship.aToB, [field]: values },
		});
	};

	const handleBToAChange = (field: keyof RelationshipAttitude, values: string[]) => {
		onUpdateRelationship?.({
			...relationship,
			bToA: { ...relationship.bToA, [field]: values },
		});
	};

	const handleDeleteMilestone = (index: number) => {
		const newMilestones = relationship.milestones.filter((_, i) => i !== index);
		onUpdateRelationship?.({ ...relationship, milestones: newMilestones });
	};

	return (
		<div
			className={`bt-relationship-card ${isExpanded ? 'bt-expanded' : ''} ${isEditing ? 'bt-editing' : ''}`}
		>
			<div
				className="bt-relationship-header"
				onClick={isEditing ? undefined : onToggle}
			>
				<div className="bt-relationship-pair">
					<span className="bt-char-name">{char1}</span>
					<i
						className={`fa-solid ${statusIcon}`}
						style={{ color: statusColor }}
					/>
					<span className="bt-char-name">{char2}</span>
				</div>
				{isEditing ? (
					<select
						className="bt-status-select"
						value={relationship.status}
						onChange={e =>
							handleStatusChange(
								e.target
									.value as RelationshipStatus,
							)
						}
						onClick={e => e.stopPropagation()}
					>
						{RELATIONSHIP_STATUSES.map(status => (
							<option key={status} value={status}>
								{status}
							</option>
						))}
					</select>
				) : (
					<div
						className="bt-relationship-status"
						style={{ color: statusColor }}
					>
						{relationship.status}
					</div>
				)}
				{editMode && !isEditing && (
					<div className="bt-relationship-actions">
						<button
							type="button"
							className="bt-edit-btn-small"
							onClick={e => {
								e.stopPropagation();
								onStartEdit?.();
							}}
							title="Edit relationship"
						>
							<i className="fa-solid fa-pen"></i>
						</button>
						<button
							type="button"
							className="bt-delete-btn-small"
							onClick={e => {
								e.stopPropagation();
								onDeleteRelationship?.();
							}}
							title="Delete relationship"
						>
							<i className="fa-solid fa-trash"></i>
						</button>
					</div>
				)}
				{isEditing && (
					<button
						type="button"
						className="bt-delete-btn-small"
						onClick={e => {
							e.stopPropagation();
							onDeleteRelationship?.();
						}}
						title="Delete relationship"
					>
						<i className="fa-solid fa-trash"></i>
					</button>
				)}
				<i
					className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} bt-expand-icon`}
					onClick={isEditing ? onToggle : undefined}
				/>
			</div>

			{isExpanded && (
				<div className="bt-relationship-details">
					{/* Attitudes - A towards B */}
					<div className="bt-attitude-section">
						<div className="bt-attitude-header">
							{char1} → {char2}
						</div>
						<div className="bt-attitude-content">
							{isEditing ? (
								<>
									<div className="bt-attitude-row-edit">
										<span className="bt-label">
											Feels:
										</span>
										<TagInput
											tags={
												relationship
													.aToB
													.feelings
											}
											onChange={v =>
												handleAToBChange(
													'feelings',
													v,
												)
											}
											placeholder="Add feeling..."
										/>
									</div>
									<div className="bt-attitude-row-edit">
										<span className="bt-label">
											Wants:
										</span>
										<TagInput
											tags={
												relationship
													.aToB
													.wants
											}
											onChange={v =>
												handleAToBChange(
													'wants',
													v,
												)
											}
											placeholder="Add want..."
										/>
									</div>
									<div className="bt-attitude-row-edit">
										<span className="bt-label">
											Secrets:
										</span>
										<TagInput
											tags={
												relationship
													.aToB
													.secrets
											}
											onChange={v =>
												handleAToBChange(
													'secrets',
													v,
												)
											}
											placeholder="Add secret..."
										/>
									</div>
								</>
							) : (
								<>
									{relationship.aToB.feelings
										.length > 0 && (
										<div className="bt-attitude-row">
											<span className="bt-label">
												Feels:
											</span>
											<span className="bt-value">
												{relationship.aToB.feelings.join(
													', ',
												)}
											</span>
										</div>
									)}
									{relationship.aToB.wants
										.length > 0 && (
										<div className="bt-attitude-row">
											<span className="bt-label">
												Wants:
											</span>
											<span className="bt-value">
												{relationship.aToB.wants.join(
													', ',
												)}
											</span>
										</div>
									)}
									{relationship.aToB.secrets
										.length > 0 && (
										<div className="bt-attitude-row">
											<span className="bt-label">
												Secrets:
											</span>
											<span className="bt-value">
												{relationship.aToB.secrets.join(
													', ',
												)}
											</span>
										</div>
									)}
								</>
							)}
						</div>
					</div>

					{/* Attitudes - B towards A */}
					<div className="bt-attitude-section">
						<div className="bt-attitude-header">
							{char2} → {char1}
						</div>
						<div className="bt-attitude-content">
							{isEditing ? (
								<>
									<div className="bt-attitude-row-edit">
										<span className="bt-label">
											Feels:
										</span>
										<TagInput
											tags={
												relationship
													.bToA
													.feelings
											}
											onChange={v =>
												handleBToAChange(
													'feelings',
													v,
												)
											}
											placeholder="Add feeling..."
										/>
									</div>
									<div className="bt-attitude-row-edit">
										<span className="bt-label">
											Wants:
										</span>
										<TagInput
											tags={
												relationship
													.bToA
													.wants
											}
											onChange={v =>
												handleBToAChange(
													'wants',
													v,
												)
											}
											placeholder="Add want..."
										/>
									</div>
									<div className="bt-attitude-row-edit">
										<span className="bt-label">
											Secrets:
										</span>
										<TagInput
											tags={
												relationship
													.bToA
													.secrets
											}
											onChange={v =>
												handleBToAChange(
													'secrets',
													v,
												)
											}
											placeholder="Add secret..."
										/>
									</div>
								</>
							) : (
								<>
									{relationship.bToA.feelings
										.length > 0 && (
										<div className="bt-attitude-row">
											<span className="bt-label">
												Feels:
											</span>
											<span className="bt-value">
												{relationship.bToA.feelings.join(
													', ',
												)}
											</span>
										</div>
									)}
									{relationship.bToA.wants
										.length > 0 && (
										<div className="bt-attitude-row">
											<span className="bt-label">
												Wants:
											</span>
											<span className="bt-value">
												{relationship.bToA.wants.join(
													', ',
												)}
											</span>
										</div>
									)}
									{relationship.bToA.secrets
										.length > 0 && (
										<div className="bt-attitude-row">
											<span className="bt-label">
												Secrets:
											</span>
											<span className="bt-value">
												{relationship.bToA.secrets.join(
													', ',
												)}
											</span>
										</div>
									)}
								</>
							)}
						</div>
					</div>

					{/* Milestones */}
					{(relationship.milestones.length > 0 || isEditing) && (
						<div className="bt-milestones-section">
							<div className="bt-milestones-header">
								<i className="fa-solid fa-star" />{' '}
								Milestones
							</div>
							{relationship.milestones.length > 0 ? (
								<ul className="bt-milestones-list">
									{relationship.milestones.map(
										(milestone, i) => {
											const dateStr =
												formatMilestoneDate(
													milestone.timestamp,
												);
											return (
												<li
													key={
														i
													}
												>
													<span className="bt-milestone-type">
														{milestone.type.replace(
															/_/g,
															' ',
														)}
													</span>
													{dateStr && (
														<span className="bt-milestone-date">
															{' '}
															(
															{
																dateStr
															}

															)
														</span>
													)}
													{milestone.description && (
														<span className="bt-milestone-desc">
															{' '}
															-{' '}
															{
																milestone.description
															}
														</span>
													)}
													{isEditing && (
														<button
															type="button"
															className="bt-delete-btn-small bt-inline"
															onClick={() =>
																handleDeleteMilestone(
																	i,
																)
															}
															title="Delete milestone"
														>
															<i className="fa-solid fa-times"></i>
														</button>
													)}
												</li>
											);
										},
									)}
								</ul>
							) : (
								<p className="bt-empty-message">
									No milestones yet.
								</p>
							)}
						</div>
					)}

					{/* History */}
					{relationship.history.length > 0 && (
						<div className="bt-history-section">
							<div className="bt-history-header">
								<i className="fa-solid fa-clock-rotate-left" />{' '}
								History
							</div>
							<ul className="bt-history-list">
								{relationship.history.map(
									(snapshot, i) => (
										<li key={i}>
											<span className="bt-history-chapter">
												Ch.{' '}
												{snapshot.chapterIndex +
													1}
												:
											</span>
											<span className="bt-history-status">
												{
													snapshot.status
												}
											</span>
											{snapshot.summary && (
												<span className="bt-history-summary">
													{' '}
													-{' '}
													{
														snapshot.summary
													}
												</span>
											)}
										</li>
									),
								)}
							</ul>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export function RelationshipsTab({
	relationships,
	presentCharacters,
	editMode,
	onUpdate,
}: RelationshipsTabProps) {
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
	const [filterCharacter, setFilterCharacter] = useState<string>('');
	const [editingPairKey, setEditingPairKey] = useState<string | null>(null);

	// Get unique characters for filter dropdown
	const allCharacters = useMemo(() => {
		const chars = new Set<string>();
		for (const rel of relationships) {
			chars.add(rel.pair[0]);
			chars.add(rel.pair[1]);
		}
		return Array.from(chars).sort();
	}, [relationships]);

	// Filter relationships
	const filteredRelationships = useMemo(() => {
		if (!filterCharacter) return relationships;
		return relationships.filter(
			rel =>
				rel.pair[0].toLowerCase() === filterCharacter.toLowerCase() ||
				rel.pair[1].toLowerCase() === filterCharacter.toLowerCase(),
		);
	}, [relationships, filterCharacter]);

	// Sort: present characters first, then by status
	const sortedRelationships = useMemo(() => {
		const presentSet = presentCharacters
			? new Set(presentCharacters.map(c => c.toLowerCase()))
			: null;

		const statusOrder: RelationshipStatus[] = [
			'intimate',
			'close',
			'friendly',
			'acquaintances',
			'strangers',
			'strained',
			'hostile',
			'complicated',
		];

		return [...filteredRelationships].sort((a, b) => {
			// Present characters first
			if (presentSet) {
				const aPresent = a.pair.some(p => presentSet.has(p.toLowerCase()));
				const bPresent = b.pair.some(p => presentSet.has(p.toLowerCase()));
				if (aPresent && !bPresent) return -1;
				if (!aPresent && bPresent) return 1;
			}

			// Then by status (closer = higher)
			const aStatus = statusOrder.indexOf(a.status);
			const bStatus = statusOrder.indexOf(b.status);
			return aStatus - bStatus;
		});
	}, [filteredRelationships, presentCharacters]);

	const toggleExpanded = (pairKey: string) => {
		setExpandedIds(prev => {
			const next = new Set(prev);
			if (next.has(pairKey)) {
				next.delete(pairKey);
			} else {
				next.add(pairKey);
			}
			return next;
		});
	};

	const getPairKey = (rel: Relationship) => rel.pair.join('|');

	const handleStartEdit = (pairKey: string) => {
		// Expand the card when starting to edit
		setExpandedIds(prev => {
			const next = new Set(prev);
			next.add(pairKey);
			return next;
		});
		setEditingPairKey(pairKey);
	};

	const handleUpdateRelationship = (pairKey: string, updated: Relationship) => {
		if (onUpdate) {
			const newRelationships = relationships.map(rel =>
				getPairKey(rel) === pairKey ? updated : rel,
			);
			onUpdate(newRelationships);
		}
	};

	const handleDeleteRelationship = (pairKey: string) => {
		if (onUpdate) {
			const newRelationships = relationships.filter(
				rel => getPairKey(rel) !== pairKey,
			);
			onUpdate(newRelationships);
			// Clear editing if we deleted the one being edited
			if (editingPairKey === pairKey) {
				setEditingPairKey(null);
			}
		}
	};

	// Clear editing state when leaving edit mode
	React.useEffect(() => {
		if (!editMode) {
			setEditingPairKey(null);
		}
	}, [editMode]);

	if (relationships.length === 0) {
		return (
			<div className="bt-relationships-tab bt-empty">
				<p>No relationships established yet.</p>
			</div>
		);
	}

	return (
		<div className="bt-relationships-tab">
			{/* Filter */}
			{allCharacters.length > 2 && (
				<div className="bt-filter-bar">
					<label htmlFor="bt-char-filter">Filter by character:</label>
					<select
						id="bt-char-filter"
						value={filterCharacter}
						onChange={e => setFilterCharacter(e.target.value)}
					>
						<option value="">All</option>
						{allCharacters.map(char => (
							<option key={char} value={char}>
								{char}
							</option>
						))}
					</select>
				</div>
			)}

			{/* Relationship cards */}
			<div className="bt-relationship-list">
				{sortedRelationships.map(rel => {
					const pairKey = getPairKey(rel);
					return (
						<RelationshipCard
							key={pairKey}
							relationship={rel}
							isExpanded={expandedIds.has(pairKey)}
							onToggle={() => toggleExpanded(pairKey)}
							editMode={editMode}
							isEditing={editingPairKey === pairKey}
							onStartEdit={() => handleStartEdit(pairKey)}
							onUpdateRelationship={updated =>
								handleUpdateRelationship(
									pairKey,
									updated,
								)
							}
							onDeleteRelationship={() =>
								handleDeleteRelationship(pairKey)
							}
						/>
					);
				})}
			</div>

			{filteredRelationships.length === 0 && filterCharacter && (
				<p className="bt-no-results">
					No relationships found for {filterCharacter}.
				</p>
			)}
		</div>
	);
}
