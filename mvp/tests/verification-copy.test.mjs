import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evidenceTimestampPresentation,
  opportunityVerificationPresentation,
  verifiedFieldsSummary,
} from '../lib/verification-copy.mjs';

test('UNVERIFIED activity is explicitly not described as corroborated', () => {
  const presentation = opportunityVerificationPresentation('UNVERIFIED');

  assert.equal(presentation.verified, false);
  assert.equal(presentation.label, '公開資料候選');
  assert.match(presentation.condition, /尚未交叉確認/);
  assert.doesNotMatch(presentation.condition, /^已由來源交叉確認/);
  assert.deepEqual(presentation.tags, ['公開資料候選']);
});

test('each verified activity status has precise copy', () => {
  assert.deepEqual(opportunityVerificationPresentation('OFFICIAL_CONFIRMED'), {
    verified: true,
    label: '活動已由官方確認',
    condition:
      '官方來源已確認活動資訊；報名、會員資格及現場消費仍以來源頁為準。',
    tags: ['官方確認活動'],
  });
  assert.match(
    opportunityVerificationPresentation('PROVIDER_CONFIRMED').condition,
    /活動提供者已確認/,
  );
  assert.match(
    opportunityVerificationPresentation('CORROBORATED').condition,
    /多個來源交叉確認/,
  );
});

test('estimated options disclose that their evidence still needs confirmation', () => {
  assert.equal(verifiedFieldsSummary('simulated', []), '估算依據待確認');
  assert.equal(verifiedFieldsSummary('real', []), '尚無已驗證欄位');
  assert.equal(
    verifiedFieldsSummary('verified-real', ['地點', '時段']),
    '地點、時段',
  );
});

test('unverified real timestamps are labelled as fetched, not confirmed', () => {
  assert.deepEqual(
    evidenceTimestampPresentation('real', '2026-09-05T14:45:06.408Z'),
    { label: '資料擷取日期', value: '2026-09-05' },
  );
  assert.deepEqual(
    evidenceTimestampPresentation('verified-real', '2026-09-05T14:45:06.408Z'),
    { label: '確認日期', value: '2026-09-05' },
  );
  assert.deepEqual(evidenceTimestampPresentation('simulated', ''), {
    label: '更新狀態',
    value: '前往前請確認',
  });
});
