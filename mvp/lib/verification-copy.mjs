const VERIFIED_OPPORTUNITY_STATUSES = new Set([
  'OFFICIAL_CONFIRMED',
  'PROVIDER_CONFIRMED',
  'CORROBORATED',
]);

export function opportunityVerificationPresentation(status) {
  const verified = VERIFIED_OPPORTUNITY_STATUSES.has(status);

  switch (status) {
    case 'OFFICIAL_CONFIRMED':
      return {
        verified,
        label: '活動已由官方確認',
        condition:
          '官方來源已確認活動資訊；報名、會員資格及現場消費仍以來源頁為準。',
        tags: ['官方確認活動'],
      };
    case 'PROVIDER_CONFIRMED':
      return {
        verified,
        label: '活動已由提供者確認',
        condition:
          '活動提供者已確認活動資訊；報名、會員資格及現場消費仍以來源頁為準。',
        tags: ['提供者確認活動'],
      };
    case 'CORROBORATED':
      return {
        verified,
        label: '活動已交叉確認',
        condition: '活動資訊已由多個來源交叉確認；使用前請再次查看來源頁。',
        tags: ['交叉確認活動'],
      };
    case 'UNVERIFIED':
      return {
        verified,
        label: '公開資料候選',
        condition:
          '資料來自官方開放資料平臺，但活動內容尚未交叉確認；使用前請查看主辦方來源。',
        tags: ['公開資料候選'],
      };
    case 'CONFLICTED':
      return {
        verified,
        label: '來源資訊有衝突',
        condition: '來源資訊互有衝突；請查看原始來源，勿視為已確認。',
        tags: ['來源待釐清'],
      };
    case 'EXPIRED':
      return {
        verified,
        label: '驗證資料已過期',
        condition: '先前資料已超過驗證期限；使用前請重新查看來源頁。',
        tags: ['來源待更新'],
      };
    case 'REJECTED':
      return {
        verified,
        label: '資料未通過驗證',
        condition: '資料未通過驗證，不應視為可行活動。',
        tags: ['資料未通過驗證'],
      };
    default:
      return {
        verified,
        label: '來源待驗證',
        condition: '來源存在，但活動內容尚未完成驗證；使用前請查看來源頁。',
        tags: ['來源待驗證'],
      };
  }
}

export function verifiedFieldsSummary(provenance, verifiedFields) {
  if (Array.isArray(verifiedFields) && verifiedFields.length > 0) {
    return verifiedFields.join('、');
  }
  return provenance === 'simulated' ? '估算依據待確認' : '尚無已驗證欄位';
}

export function evidenceTimestampPresentation(provenance, timestamp) {
  if (provenance === 'simulated') {
    return { label: '更新狀態', value: '前往前請確認' };
  }

  const value = typeof timestamp === 'string' ? timestamp.slice(0, 10) : '';
  if (provenance === 'real') {
    return { label: '資料擷取日期', value: value || '未標示' };
  }

  return { label: '確認日期', value: value || '未標示' };
}
