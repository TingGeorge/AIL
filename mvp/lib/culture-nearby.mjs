const clean = (value) => String(value ?? '').trim();

export function cultureTaipeiDateTime(value) {
  const text = clean(value);
  if (!text) return null;

  const localDateTime = text.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (localDateTime) {
    const [, year, month, day, hour, minute, second = '00'] = localDateTime;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`;
  }

  const localDate = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (localDate) {
    const [, year, month, day] = localDate;
    return `${year}-${month}-${day}T00:00:00+08:00`;
  }

  return text;
}

export function assessCultureTicket({ onSales, price }) {
  const salesFlag = clean(onSales).toUpperCase();
  const priceText = clean(price).replace(/\s+/g, ' ').slice(0, 2_000);
  const hasFreeLanguage =
    /免費|免票|自由入場|free/i.test(priceText) ||
    /(^|\D)0\s*元/.test(priceText);
  const positiveCurrencyAmounts = [
    ...priceText.matchAll(/(?:NT\$|NTD|\$)\s*([\d,]+)|([\d,]+)\s*元/gi),
  ]
    .map((match) => Number(String(match[1] ?? match[2]).replace(/,/g, '')))
    .filter((amount) => Number.isFinite(amount) && amount > 0);
  const hasPaidCondition =
    positiveCurrencyAmounts.length > 0 ||
    /收費|另(?:行)?付費|需(?:先)?購票|門票另計|低消|必要購買/.test(priceText);
  const hasAdmissionDependency = /憑.{0,16}(?:門票|票券)|含於.{0,12}門票/.test(
    priceText,
  );
  const conflicted =
    hasFreeLanguage && (hasPaidCondition || hasAdmissionDependency);
  const clearlyZeroAdmission =
    hasFreeLanguage && !hasPaidCondition && !hasAdmissionDependency;

  return {
    salesFlag: salesFlag === 'Y' || salesFlag === 'N' ? salesFlag : null,
    priceText: priceText || null,
    directCostTwd: clearlyZeroAdmission ? 0 : null,
    admissionCostTwd: clearlyZeroAdmission ? 0 : null,
    registrationRequired: /免報名|無需.{0,4}報名/.test(priceText)
      ? 0
      : /報名|預約|索票|QR\s*Code/i.test(priceText)
        ? 1
        : null,
    membershipRequired: /會員限定|限會員|會員專屬/.test(priceText) ? 1 : null,
    verificationStatus: conflicted ? 'CONFLICTED' : 'UNVERIFIED',
    conflicted,
  };
}
