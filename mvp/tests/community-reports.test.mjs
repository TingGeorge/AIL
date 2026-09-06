import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reportsForSubject,
  summarizeCommunityReports,
} from '../lib/community-reports.mjs';

const reports = [
  { id: '1', subjectId: 'a', type: '價格不同', status: 'resolved' },
  { id: '2', subjectId: 'a', type: '營業時間不同', status: 'received' },
  { id: '3', subjectId: 'b', type: '價格不同', status: 'received' },
];

test('filters report records by their subject', () => {
  assert.deepEqual(
    reportsForSubject(reports, 'a').map((report) => report.id),
    ['1', '2'],
  );
});

test('derives report totals, statuses, and types from the records', () => {
  assert.deepEqual(summarizeCommunityReports(reportsForSubject(reports, 'a')), {
    total: 2,
    received: 1,
    resolved: 1,
    byType: { '價格不同': 1, '營業時間不同': 1 },
  });
});

test('a new report changes only the matching subject summary', () => {
  const next = [
    ...reports,
    { id: '4', subjectId: 'a', type: '價格不同', status: 'received' },
  ];

  assert.equal(summarizeCommunityReports(reportsForSubject(next, 'a')).total, 3);
  assert.equal(summarizeCommunityReports(reportsForSubject(next, 'b')).total, 1);
});
