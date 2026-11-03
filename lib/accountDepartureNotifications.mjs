// Build notification candidates only after deletion is independently verified.
// This module does not send notifications or delete accounts.
export function planWorkerDepartureNotifications({ deletionVerified, subjectId, relationships }) {
  if (deletionVerified !== true) return [];
  if (typeof subjectId !== 'string' || !subjectId.trim() || !Array.isArray(relationships)) throw new Error('Invalid departure input');
  const companies = new Set();
  for (const rel of relationships) {
    if (!rel || rel.userId !== subjectId || rel.endedAt != null || typeof rel.companyId !== 'string' || !rel.companyId.trim()) continue;
    companies.add(rel.companyId);
  }
  return [...companies].map(companyId => ({
    companyId,
    recipientType: 'owner',
    title: '시공자 계정 탈퇴 안내',
    message: '연결된 시공자의 계정이 삭제되어 업체와의 연결이 종료되었습니다.',
  }));
}
