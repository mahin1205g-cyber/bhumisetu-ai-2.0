export const DISTRIBUTION_STATUS_ORDER = [
  'MATCHED',
  'MISMATCH',
  'PARTIAL_MATCH',
  'UNAVAILABLE',
];

export const VERIFICATION_STATUS_COLORS = {
  MATCHED: '#6B95D6',
  MISMATCH: '#FFFFFF',
  PARTIAL_MATCH: '#D9955B',
  UNAVAILABLE: '#D6B84F',
  PENDING: '#CBD5E1',
  NOT_PROVIDED: '#CBD5E1',
  AVAILABLE: '#64748B',
};

export const VERIFICATION_STATUS_TEXT_COLORS = {
  MATCHED: '#365F9F',
  MISMATCH: '#475569',
  PARTIAL_MATCH: '#9A4D10',
  UNAVAILABLE: '#7A5A00',
  PENDING: '#64748B',
  NOT_PROVIDED: '#64748B',
  AVAILABLE: '#64748B',
};

const safeCount = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
};

export const percentOf = (count, total) => {
  const denominator = safeCount(total);
  return denominator > 0 ? (safeCount(count) / denominator) * 100 : null;
};

export const formatPercent = (value, lang = 'en') => {
  if (!Number.isFinite(value)) return '—';
  const formatted = `${value.toFixed(2)}%`;
  return lang === 'bn' ? formatted.replace(/\d/g, (digit) => '০১২৩৪৫৬৭৮৯'[Number(digit)]) : formatted;
};

export function calculateStatusDistribution(fields, statusForField) {
  const counts = Object.fromEntries(DISTRIBUTION_STATUS_ORDER.map((status) => [status, 0]));
  let pending = 0;
  let notProvided = 0;
  let available = 0;

  for (const field of Array.isArray(fields) ? fields : []) {
    const status = statusForField(field);
    if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
    else if (status === 'PENDING') pending += 1;
    else if (status === 'NOT_PROVIDED') notProvided += 1;
    else if (status === 'AVAILABLE') available += 1;
    else pending += 1;
  }

  const total = DISTRIBUTION_STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0);
  const percentages = Object.fromEntries(DISTRIBUTION_STATUS_ORDER.map((status) => [
    status,
    percentOf(counts[status], total),
  ]));

  return { counts, percentages, total, pending, notProvided, available };
}

export function calculateMatchPercentage(fields, statusForField) {
  let matched = 0;
  let partial = 0;
  let mismatched = 0;

  for (const field of Array.isArray(fields) ? fields : []) {
    const status = statusForField(field);
    if (status === 'MATCHED') matched += 1;
    else if (status === 'PARTIAL_MATCH') partial += 1;
    else if (status === 'MISMATCH') mismatched += 1;
  }

  const eligibleCount = matched + partial + mismatched;
  const effectiveMatched = matched + (partial * 0.5);
  return {
    matched,
    partial,
    mismatched,
    eligibleCount,
    effectiveMatched,
    percentage: eligibleCount > 0 ? (effectiveMatched / eligibleCount) * 100 : null,
  };
}

export function classifyRiskFromMatch(percentage) {
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;
  if (percentage === 100) return 'NO_RISK';
  if (percentage >= 91) return 'LOW_RISK';
  if (percentage >= 71) return 'LOW_MEDIUM_RISK';
  if (percentage >= 51) return 'MEDIUM_RISK';
  if (percentage >= 36) return 'HIGH_MEDIUM_RISK';
  if (percentage >= 16) return 'HIGH_RISK';
  return 'EXTREME_RISK';
}

export function formatEffectiveCount(value, lang = 'en') {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US', { maximumFractionDigits: 1 });
}

export function calculateCategoryDistributions(categories, fields, statusForField) {
  return (Array.isArray(categories) ? categories : []).map((category) => {
    const keys = new Set(Array.isArray(category.keys) ? category.keys : []);
    const categoryFields = (Array.isArray(fields) ? fields : []).filter((field) => keys.has(field.key));
    const distribution = calculateStatusDistribution(categoryFields, statusForField);
    return { ...category, fields: categoryFields, ...distribution };
  });
}
