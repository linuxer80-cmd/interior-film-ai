// A deletion request is not proof that records were deleted.
// Unknown ownership or legal retention requires a human review.
export function planDeletion({ subjectId, records }) {
  if (typeof subjectId !== 'string' || !subjectId.trim()) throw new Error('subjectId required');
  if (!Array.isArray(records)) throw new Error('records required');
  return records.map(record => {
    if (!record || typeof record.id !== 'string' || !record.id.trim()) throw new Error('record id required');
    if (record.ownerId !== subjectId) return { id: record.id, action: 'review', reason: 'ownership_not_confirmed' };
    if (record.legalHold === true) return { id: record.id, action: 'retain', reason: 'legal_hold' };
    if (record.legalHold !== false || record.shared !== false || record.category !== 'personal') {
      return { id: record.id, action: 'review', reason: 'scope_or_retention_uncertain' };
    }
    return { id: record.id, action: 'eligible', reason: 'personal_data_without_known_hold' };
  });
}
