/**
 * Keep report statistics derived from the report records themselves. This
 * prevents the count shown on the detail page from drifting away from the
 * history shown on the report page.
 */
export function reportsForSubject(reports, subjectId) {
  if (!Array.isArray(reports)) return [];
  return reports.filter((report) => report.subjectId === subjectId);
}

export function summarizeCommunityReports(reports) {
  const safeReports = Array.isArray(reports) ? reports : [];
  /** @type {Record<string, number>} */
  const byType = {};

  for (const report of safeReports) {
    const type = typeof report.type === 'string' && report.type
      ? report.type
      : '其他';
    byType[type] = (byType[type] ?? 0) + 1;
  }

  return {
    total: safeReports.length,
    received: safeReports.filter((report) => report.status === 'received').length,
    resolved: safeReports.filter((report) => report.status === 'resolved').length,
    byType,
  };
}
