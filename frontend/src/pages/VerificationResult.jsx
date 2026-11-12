import Button from '../components/Button';
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import QRCodeCanvas from '../components/QRCodeCanvas';
import {
  DISTRIBUTION_STATUS_ORDER,
  VERIFICATION_STATUS_COLORS,
  VERIFICATION_STATUS_TEXT_COLORS,
  calculateMatchPercentage,
  calculateCategoryDistributions,
  calculateStatusDistribution,
  formatEffectiveCount,
  formatPercent,
} from '../utils/verificationChartData';
import {
  FileCheck2, CheckCircle2, AlertTriangle, AlertOctagon, Printer,
  ArrowLeft, ShieldCheck, Info, QrCode, Cpu, Home
} from 'lucide-react';

export default function VerificationResult({ result, setActiveTab, navigateBack, onFindDeed }) {
  const { lang, user } = useApp();
  const [recoveredResult, setRecoveredResult] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [chartsReady, setChartsReady] = useState(false);
  const [selectedStatusKey, setSelectedStatusKey] = useState(null);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState(null);
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (result) {
      setRecoveredResult(null);
      setRecovering(false);
      setRecoveryError('');
      return undefined;
    }

    let verificationRef = '';
    try {
      const hashQuery = window.location.hash.split('?').slice(1).join('?');
      verificationRef = new URLSearchParams(hashQuery).get('ref') || '';
      if (verificationRef) sessionStorage.setItem('bhumisetu:lastVerificationRef', verificationRef);
      else verificationRef = sessionStorage.getItem('bhumisetu:lastVerificationRef') || '';
    } catch { /* storage or URL parsing may be unavailable */ }
    if (!verificationRef || !user) {
      setRecovering(false);
      return undefined;
    }

    let active = true;
    setRecovering(true);
    setRecoveryError('');
    api.getVerificationReport(verificationRef).then((report) => {
      if (!active) return;
      const extractedSummary = report.extracted_data && typeof report.extracted_data === 'object'
        ? report.extracted_data
        : null;
      const storedFieldChecks = Array.isArray(extractedSummary?.verification_fields)
        ? extractedSummary.verification_fields
        : [];
      setRecoveredResult({
        ...report,
        extracted_summary: extractedSummary,
        field_checks: storedFieldChecks,
        record_found: Boolean(extractedSummary?.record_found),
        property_found: Boolean(extractedSummary?.property_found),
        overall_category: extractedSummary?.overall_category || null,
        coverage: extractedSummary?.coverage || null,
        submitted_summary: {
          deed_no: report.deed_no,
          deed_type: report.deed_type,
          reg_year: report.reg_year,
          division: report.division,
          division_id: report.division_id,
          district: report.district,
          upazila: report.upazila,
          mouza: report.mouza,
          mouza_id: report.mouza_id,
          mouza_input_mode: extractedSummary?.submitted_mouza_input_mode || (report.mouza_id ? 'catalog' : 'unknown'),
          mouza_source: extractedSummary?.submitted_mouza_source || (report.mouza_id ? 'official_catalog' : 'unknown'),
          union_ward: report.union_ward,
          union_id: report.union_id,
          plot_id: report.plot_id,
          khatian_no: report.khatian_no,
          buyer_name: report.buyer_name,
          seller_name: report.seller_name,
        },
      });
    }).catch((error) => {
      if (!active) return;
      setRecoveryError(error.message || 'Could not load the saved verification report.');
    }).finally(() => {
      if (active) setRecovering(false);
    });
    return () => { active = false; };
  }, [result, user]);

  const activeResult = result || recoveredResult;

  useEffect(() => {
    if (!activeResult) return undefined;
    setSelectedStatusKey(null);
    setSelectedCategoryKey(null);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setChartsReady(true);
      return undefined;
    }
    setChartsReady(false);
    const frame = window.requestAnimationFrame(() => setChartsReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [activeResult]);

  if (!activeResult) {
    return (
      <div className="gov-container py-16 text-center space-y-4">
        {recovering ? (
          <p className="text-sm text-gray-500" role="status">{lang === 'bn' ? 'সংরক্ষিত যাচাই প্রতিবেদন লোড হচ্ছে…' : 'Loading the saved verification report…'}</p>
        ) : (
          <p className="text-sm text-gray-500">
            {recoveryError || (lang === 'bn' ? 'কোনো ফলাফল পাওয়া যায়নি। অনুগ্রহ করে পুনরায় দলিল যাচাই করুন।' : 'No verification result found. Please submit a deed to verify.')}
          </p>
        )}
        <Button
          disabled={recovering}
          onClick={() => navigateBack ? navigateBack('deed-verify') : setActiveTab('deed-verify')}
          className="gov-btn-primary text-xs"
        >
          {lang === 'bn' ? 'দলিল যাচাই ফরম' : 'Deed Verification Form'}
        </Button>
      </div>
    );
  }

  const isDeedNotFound = activeResult.lookup_status === 'DEED_NOT_FOUND'
    || ((activeResult.result_status === 'RECORD_NOT_FOUND'
      || activeResult.overall_category === 'RECORD_NOT_FOUND')
      && !(activeResult.record_found ?? activeResult.extracted_summary?.record_found));
  if (isDeedNotFound) {
    const deedNo = activeResult.submitted_summary?.deed_no || activeResult.deed_no || '';
    return (
      <div className="gov-container py-8 sm:py-12 max-w-3xl">
        <section className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-gray-900 p-6 sm:p-8 shadow-sm space-y-5" role="status" aria-live="polite">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 shrink-0 rounded-2xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center">
              <AlertOctagon className="w-7 h-7 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-rose-700 dark:text-rose-300">{lang === 'bn' ? 'ভূমিসেতু • অ্যাপ ডেটাবেজ' : 'BHUMISETU • APPLICATION DATABASE'}</div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">{lang === 'bn' ? 'দলিল নম্বরটি পাওয়া যায়নি' : 'Deed number not found'}</h1>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                {lang === 'bn'
                  ? 'আপনার দেওয়া দলিল নম্বরটি আমাদের ডেটাবেজে পাওয়া যায়নি। এটি দলিলটি জাল বা আইনগতভাবে অবৈধ—এমন প্রমাণ নয়।'
                  : 'Your submitted deed number was not found in our database. This does not establish that the deed is fake or legally invalid.'}
              </p>
              {deedNo && <p className="text-xs text-gray-500">{lang === 'bn' ? 'খোঁজা নম্বর:' : 'Searched number:'} <strong className="text-gray-800 dark:text-gray-200">{deedNo}</strong></p>}
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{lang === 'bn' ? 'উৎস: ভূমিসেতুর PostgreSQL ডেটাবেজ; সরকারি বালাম যাচাই নয়।' : 'Source: Bhumisetu PostgreSQL database; not an official registry lookup.'}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 border-t border-gray-100 dark:border-gray-800 pt-4">
            <Button onClick={() => navigate('deed-verify')} className="gov-btn-primary justify-center text-xs">
              <ArrowLeft className="w-4 h-4" />
              <span>{lang === 'bn' ? 'আবার চেষ্টা করুন' : 'Try Again'}</span>
            </Button>
            <Button onClick={() => onFindDeed?.(deedNo)} className="gov-btn-secondary justify-center text-xs">
              <Info className="w-4 h-4" />
              <span>{lang === 'bn' ? 'দলিল খুঁজুন' : 'Find Deed'}</span>
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const {
    verification_ref,
    result_status,
    discrepancies: rawDiscrepancies,
    extracted_summary: rawExtractedSummary,
    submitted_summary: submittedSummary = {},
    field_checks: fieldChecks = [],
    created_at,
    verification_url,
    disclaimer_bn,
    disclaimer_en
  } = activeResult;

  const discrepancies = Array.isArray(rawDiscrepancies) ? rawDiscrepancies : [];
  const extracted_summary = rawExtractedSummary && typeof rawExtractedSummary === 'object'
    ? rawExtractedSummary
    : {};
  const safeSubmittedSummary = submittedSummary && typeof submittedSummary === 'object'
    ? submittedSummary
    : {};
  const safeFieldChecks = Array.isArray(fieldChecks) ? fieldChecks : [];
  const nameComparisons = Array.isArray(activeResult.name_comparisons)
    ? activeResult.name_comparisons
    : Array.isArray(extracted_summary.name_comparisons) ? extracted_summary.name_comparisons : [];
  const ownershipHistory = activeResult.ownership_history || extracted_summary.ownership_history || {};
  const ownershipItems = Array.isArray(ownershipHistory.items)
    ? ownershipHistory.items.filter((item) => item && typeof item === 'object' && item.evidence_ref)
    : [];
  const cppGraphAnalysis = activeResult.cpp_graph_analysis || extracted_summary.cpp_graph_analysis || {};
  const graphAnomalies = Array.isArray(activeResult.anomalies)
    ? activeResult.anomalies
    : Array.isArray(cppGraphAnalysis.anomalies) ? cppGraphAnalysis.anomalies : [];
  const graphAnalysisAvailable = Boolean(cppGraphAnalysis.engine || cppGraphAnalysis.engine_version)
    && !cppGraphAnalysis.error;
  const hasDeedRecord = Boolean(
    activeResult.record_found ?? extracted_summary.record_found ?? false
  );
  const hasPropertyRecord = Boolean(
    activeResult.property_found ?? extracted_summary.property_found ?? false
  );
  const hasStructuredFieldChecks = safeFieldChecks.length > 0;
  const legacySafeStatus = !hasDeedRecord && result_status === 'MATCH'
    ? 'RECORD_NOT_FOUND'
    : result_status === 'MATCH' && !hasStructuredFieldChecks
      ? 'INSUFFICIENT_DATA'
      : result_status;
  const displayStatus = activeResult.overall_category || extracted_summary.overall_category
    || legacySafeStatus;
  const locationFieldKeys = new Set(['division', 'district', 'upazila', 'mouza', 'union_ward']);
  const normalizeComparison = (value) => String(value || '')
    .normalize('NFKC')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
  const fallbackFieldRows = [
    { key: 'deed_no', label_bn: 'দলিল নম্বর', label_en: 'Deed Number', required: true, submitted: safeSubmittedSummary.deed_no, recorded: extracted_summary.deed_no, available: hasDeedRecord, source_bn: 'অ্যাপের deeds রেকর্ড', source_en: 'Application deeds record' },
    { key: 'reg_year', label_bn: 'নিবন্ধনের বছর', label_en: 'Registration Year', required: true, submitted: safeSubmittedSummary.reg_year, recorded: extracted_summary.reg_year, available: hasDeedRecord, source_bn: 'অ্যাপের deeds রেকর্ড', source_en: 'Application deeds record' },
    { key: 'deed_type', label_bn: 'দলিলের ধরন', label_en: 'Deed Type', required: false, optional: true, submitted: safeSubmittedSummary.deed_type, recorded: extracted_summary.deed_type, submitted_names: safeSubmittedSummary.deed_type_names, recorded_names: extracted_summary.deed_type_names, available: hasDeedRecord, source_bn: 'অ্যাপের deeds রেকর্ড', source_en: 'Application deeds record' },
    { key: 'seller_name', label_bn: 'বিক্রেতার নাম', label_en: 'Seller Name', required: true, submitted: safeSubmittedSummary.seller_name, recorded: extracted_summary.recorded_seller, available: hasDeedRecord, source_bn: 'অ্যাপের deeds রেকর্ড', source_en: 'Application deeds record' },
    { key: 'buyer_name', label_bn: 'দলিলে ক্রেতার নাম', label_en: 'Buyer Named in Deed', required: true, submitted: safeSubmittedSummary.buyer_name || safeSubmittedSummary.owner_name, recorded: extracted_summary.recorded_buyer, available: hasDeedRecord, source_bn: 'অ্যাপের deeds রেকর্ড', source_en: 'Application deeds record' },
    { key: 'recorded_owner', label_bn: 'রেকর্ডভুক্ত বর্তমান মালিক', label_en: 'Recorded Current Owner', submitted: null, recorded: hasPropertyRecord ? extracted_summary.recorded_owner : null, available: hasPropertyRecord, reference_only: true, source_bn: 'অ্যাপের properties রেকর্ড', source_en: 'Application properties record' },
    { key: 'division', label_bn: 'বিভাগ', label_en: 'Division', required: true, submitted: safeSubmittedSummary.division, recorded: extracted_summary.division, available: hasDeedRecord, source_bn: 'অ্যাপের deeds রেকর্ড', source_en: 'Application deeds record' },
    { key: 'district', label_bn: 'জেলা', label_en: 'District', required: true, submitted: safeSubmittedSummary.district, recorded: extracted_summary.district, available: hasDeedRecord || hasPropertyRecord, source_bn: 'অ্যাপের জমির রেকর্ড', source_en: 'Application land record' },
    { key: 'upazila', label_bn: 'উপজেলা / থানা', label_en: 'Upazila / Thana', required: true, submitted: safeSubmittedSummary.upazila, recorded: extracted_summary.upazila, available: hasDeedRecord || hasPropertyRecord, source_bn: 'অ্যাপের জমির রেকর্ড', source_en: 'Application land record' },
    { key: 'mouza', label_bn: 'মৌজা', label_en: 'Mouza', required: true, submitted: safeSubmittedSummary.mouza, recorded: extracted_summary.mouza, available: hasDeedRecord || hasPropertyRecord, input_source: safeSubmittedSummary.mouza_source || extracted_summary.submitted_mouza_source, source_bn: 'অ্যাপের জমির রেকর্ড', source_en: 'Application land record' },
    { key: 'plot_id', label_bn: 'দাগ / প্লট নম্বর', label_en: 'Dag / Plot Number', required: true, submitted: safeSubmittedSummary.plot_id, recorded: extracted_summary.plot_id, available: hasDeedRecord || hasPropertyRecord, source_bn: 'অ্যাপের জমির রেকর্ড', source_en: 'Application land record' },
    { key: 'khatian_no', label_bn: 'খতিয়ান নম্বর', label_en: 'Khatian Number', required: true, submitted: safeSubmittedSummary.khatian_no, recorded: extracted_summary.khatian_no, available: hasDeedRecord || hasPropertyRecord, source_bn: 'অ্যাপের জমির রেকর্ড', source_en: 'Application land record' },
    { key: 'union_ward', label_bn: 'ইউনিয়ন / ওয়ার্ড', label_en: 'Union / Ward', submitted: safeSubmittedSummary.union_ward, recorded: extracted_summary.union_ward, available: hasDeedRecord, optional: true, source_bn: 'অ্যাপের deeds রেকর্ড', source_en: 'Application deeds record' },
    { key: 'property_status', label_bn: 'অ্যাপের জমি রেকর্ডের অবস্থা', label_en: 'Application Property Record Status', submitted: null, recorded: hasPropertyRecord ? extracted_summary.property_status : null, available: hasPropertyRecord, reference_only: true, source_bn: 'অ্যাপের properties রেকর্ড; আইনি স্বত্ব নয়', source_en: 'Application properties record; not legal title' },
  ];
  const fieldLabelOverrides = {
    deed_no: ['দলিল নম্বর', 'Deed Number'],
    reg_year: ['নিবন্ধনের বছর', 'Registration Year'],
    seller_name: ['বিক্রেতার নাম', 'Seller Name'],
    buyer_name: ['দলিলে ক্রেতার নাম', 'Buyer Named in Deed'],
    recorded_owner: ['রেকর্ডভুক্ত বর্তমান মালিক', 'Recorded Current Owner'],
    division: ['বিভাগ', 'Division'],
    district: ['জেলা', 'District'],
    upazila: ['উপজেলা / থানা', 'Upazila / Thana'],
    mouza: ['মৌজা', 'Mouza'],
    plot_id: ['দাগ / প্লট নম্বর', 'Dag / Plot Number'],
    khatian_no: ['খতিয়ান নম্বর', 'Khatian Number'],
    union_ward: ['ইউনিয়ন / ওয়ার্ড', 'Union / Ward'],
    property_status: ['অ্যাপের জমি রেকর্ডের অবস্থা', 'Application Property Record Status'],
  };
  const fallbackLocationIds = {
    division: 'division_id', district: 'district_id', upazila: 'location_id',
    mouza: 'mouza_id', union_ward: 'union_id',
  };
  const fieldRows = safeFieldChecks.length > 0
    ? safeFieldChecks.map((check, index) => {
      const labels = fieldLabelOverrides[check.key] || [check.field || `Field ${index + 1}`, check.field_en || check.key || `Field ${index + 1}`];
      return {
        ...check,
        key: check.key || `field-${index}`,
        label_bn: labels[0],
        label_en: labels[1],
        source_bn: check.source_bn || check.source || 'অ্যাপের ডেটাবেজ',
        source_en: check.source_en || check.source || 'Application database',
      };
    })
    : fallbackFieldRows.map((field) => {
      if (!locationFieldKeys.has(field.key)) return field;
      const summaryKey = fallbackLocationIds[field.key];
      return {
        ...field,
        submitted_location_id: safeSubmittedSummary[summaryKey],
        recorded_location_id: extracted_summary[summaryKey],
        submitted_location_names: safeSubmittedSummary.location_names?.[field.key],
        recorded_location_names: extracted_summary.location_names?.[field.key],
      };
    });

  const statusForField = (field) => {
    const knownStatuses = ['MATCHED', 'PARTIAL_MATCH', 'MISMATCH', 'UNAVAILABLE', 'NOT_PROVIDED', 'AVAILABLE', 'PENDING'];
    const hasCanonicalLocationIds = field.submitted_location_id !== null
      && field.submitted_location_id !== undefined
      && field.recorded_location_id !== null
      && field.recorded_location_id !== undefined;
    const isManualMouza = field.key === 'mouza'
      && (field.official_verification_status === 'NOT_VERIFIED' || field.input_source === 'manual_unverified');
    if (isManualMouza && normalizeComparison(field.submitted) && normalizeComparison(field.submitted) === normalizeComparison(field.recorded)) {
      return 'MATCHED';
    }
    if (locationFieldKeys.has(field.key) && field.status === 'MISMATCH' && !hasCanonicalLocationIds && !isManualMouza) {
      return 'UNAVAILABLE';
    }
    if (knownStatuses.includes(field.status)) {
      return field.status;
    }
    if (field.key === 'deed_type' && field.submitted_names?.code && field.recorded_names?.code) {
      return field.submitted_names.code === field.recorded_names.code ? 'MATCHED' : 'MISMATCH';
    }
    if (field.optional && !field.submitted) return 'NOT_PROVIDED';
    if (!field.available || field.recorded === null || field.recorded === undefined || field.recorded === '') return 'UNAVAILABLE';
    if (field.reference_only) return 'AVAILABLE';
    if (!field.submitted) return 'NOT_PROVIDED';
    if (locationFieldKeys.has(field.key)) {
      if (!hasCanonicalLocationIds) return 'UNAVAILABLE';
      return String(field.submitted_location_id) === String(field.recorded_location_id)
        ? 'MATCHED'
        : 'MISMATCH';
    }
    return normalizeComparison(field.submitted) === normalizeComparison(field.recorded)
      ? 'MATCHED'
      : 'MISMATCH';
  };

  const fieldDisplayValue = (field, side) => {
    const raw = field[side];
    if (field.key === 'deed_type') {
      const names = field[`${side}_names`];
      if (names) return names[lang] || names.bn || names.en || raw;
    }
    const names = field[`${side}_location_names`];
    if (!locationFieldKeys.has(field.key) || !names) return raw;
    return names[lang] || names.en || names.bn || raw;
  };
  const summaryLocationValue = (key, raw) => {
    const field = fieldRows.find((item) => item.key === key);
    return field ? (fieldDisplayValue(field, 'submitted') || raw) : raw;
  };
  const statusLabels = {
    MATCHED: { bn: 'মিলেছে', en: 'Matched', className: 'text-[#365F9F]' },
    PARTIAL_MATCH: { bn: 'আংশিক মিল', en: 'Partial match', className: 'text-[#9A4D10]' },
    MISMATCH: { bn: 'মেলেনি', en: 'Mismatch', className: 'text-slate-600 dark:text-slate-300' },
    UNAVAILABLE: { bn: 'রেকর্ড নেই', en: 'Unavailable', className: 'text-[#7A5A00]' },
    PENDING: { bn: 'অপেক্ষমাণ', en: 'Pending', className: 'text-[#64748B]' },
    NOT_PROVIDED: { bn: 'দেওয়া হয়নি', en: 'Not provided', className: 'text-[#64748B]' },
    AVAILABLE: { bn: 'রেকর্ডে আছে; তুলনা নয়', en: 'Available; not compared', className: 'text-[#64748B]' },
  };
  const statusAppearance = {
    MATCHED: { Icon: CheckCircle2 },
    PARTIAL_MATCH: { Icon: Info },
    MISMATCH: { Icon: AlertTriangle },
    UNAVAILABLE: { Icon: AlertOctagon },
    PENDING: { Icon: Info },
    NOT_PROVIDED: { Icon: Info },
    AVAILABLE: { Icon: ShieldCheck },
  };
  const chartStatuses = DISTRIBUTION_STATUS_ORDER.map((key) => ({
    key,
    color: VERIFICATION_STATUS_COLORS[key],
    bn: statusLabels[key].bn,
    en: statusLabels[key].en,
  }));
  const categoryRingColors = ['#8FB4E5', '#D8A47B', '#D9C36F', '#A8C1E2', '#E0B38C', '#E4D18B', '#B9CBE5'];
  const chartFields = fieldRows.filter((field) => field.key !== 'property_status'
    && !(field.optional && statusForField(field) === 'NOT_PROVIDED'));
  const distributionFields = chartFields.filter((field) => !field.reference_only);
  const overallDistribution = calculateStatusDistribution(distributionFields, statusForField);
  const overallMatch = calculateMatchPercentage(distributionFields, statusForField);
  const hasMatchScore = hasDeedRecord && overallMatch.percentage !== null;
  const numericMatchScore = hasMatchScore ? overallMatch.percentage : null;
  const overallCounts = overallDistribution.counts;
  const overallCountTotal = overallDistribution.total;
  const omittedFields = fieldRows.filter((field) => field.key !== 'property_status' && !field.reference_only);
  const omittedNotProvided = omittedFields.filter((field) => statusForField(field) === 'NOT_PROVIDED').length;
  const pendingCount = omittedFields.filter((field) => statusForField(field) === 'PENDING').length;
  const availableCount = fieldRows.filter((field) => statusForField(field) === 'AVAILABLE').length;
  const fieldCategoryDefinitions = [
    { key: 'deed', keys: ['deed_no', 'deed_type', 'reg_year'], bn: 'দলিলের তথ্য', en: 'Deed Information' },
    { key: 'seller', keys: ['seller_name'], bn: 'বিক্রেতার তথ্য', en: 'Seller Information' },
    { key: 'ownership', keys: ['buyer_name', 'recorded_owner'], bn: 'ক্রেতা ও মালিকানা রেকর্ড', en: 'Buyer and Ownership Record' },
    { key: 'location', keys: ['division', 'district', 'upazila', 'mouza'], bn: 'জমির অবস্থান', en: 'Land Location' },
    { key: 'khatian', keys: ['khatian_no'], bn: 'খতিয়ান', en: 'Khatian' },
    { key: 'dag', keys: ['plot_id'], bn: 'দাগ / প্লট', en: 'Dag / Plot' },
    { key: 'union', keys: ['union_ward'], bn: 'ইউনিয়ন / ওয়ার্ড', en: 'Union / Ward' },
  ];
  const fieldCategories = calculateCategoryDistributions(fieldCategoryDefinitions, distributionFields, statusForField);
  const radialCategories = fieldCategories.map((category, index) => {
    const radius = 105 - index * 10.5;
    const circumference = 2 * Math.PI * radius;
    const arcLength = circumference * 0.75;
    const matchStats = calculateMatchPercentage(category.fields, statusForField);
    const matchedPercent = matchStats.percentage;
    const progressLength = matchedPercent === null
      ? 0
      : Math.max(0, (arcLength * matchedPercent / 100) - 8);
    return {
      ...category,
      radius,
      circumference,
      arcLength,
      matchStats,
      matchedPercent,
      progressLength,
      color: categoryRingColors[index % categoryRingColors.length],
    };
  });
  const donutRadius = 66;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let donutCursor = 0;
  const donutSegments = chartStatuses.filter(({ key }) => overallCounts[key] > 0).map((item) => {
    const proportion = overallCountTotal > 0 ? overallCounts[item.key] / overallCountTotal : 0;
    const length = proportion * donutCircumference;
    const segment = { ...item, length, proportion, percent: overallDistribution.percentages[item.key], offset: donutCursor };
    donutCursor += length;
    return segment;
  });
  const overallChartDescription = chartStatuses
    .filter(({ key }) => overallCounts[key] > 0)
    .map((item) => `${lang === 'bn' ? item.bn : item.en}: ${overallCounts[item.key]} (${formatPercent(overallDistribution.percentages[item.key], lang)})`)
    .join(' · ');
  const verificationInsights = fieldRows
    .filter((field) => field.key !== 'property_status' && statusForField(field) !== 'MATCHED')
    .map((field) => ({
      key: field.key,
      label: lang === 'bn' ? field.label_bn : field.label_en,
      message: lang === 'bn' ? field.message_bn : field.message_en,
      status: statusForField(field),
    }));
  const sellerOwnerComparison = nameComparisons.find((item) => item.key === 'seller_vs_recorded_owner');

  const statusConfig = {
    MATCH: {
      label: lang === 'bn' ? 'অ্যাপের ডেটাবেজ রেকর্ডের সঙ্গে মিল' : 'Matched in application database records',
      color: 'text-[#365F9F]',
      bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
      icon: CheckCircle2
    },
    POTENTIAL_INCONSISTENCY: {
      label: lang === 'bn' ? 'সম্ভাব্য গরমিল বা অমিল (Potential Inconsistency)' : 'Potential Inconsistency',
      color: 'text-[#9A4D10]',
      bg: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800',
      icon: AlertTriangle
    },
    MISMATCH: {
      label: lang === 'bn' ? 'প্রদত্ত তথ্যের সঙ্গে রেকর্ডের অমিল' : 'Mismatch with application records',
      color: 'text-slate-600 dark:text-slate-300',
      bg: 'bg-white dark:bg-gray-900 border-slate-200 dark:border-slate-700',
      icon: AlertTriangle
    },
    PARTIAL_MATCH: {
      label: lang === 'bn' ? 'আংশিক মিল; হাতে পর্যালোচনা প্রয়োজন' : 'Partial match; manual review needed',
      color: 'text-[#7A5A00]',
      bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
      icon: AlertTriangle
    },
    INSUFFICIENT_DATA: {
      label: lang === 'bn' ? 'অ্যাপের ডেটাবেজে তথ্য অপর্যাপ্ত' : 'Insufficient application database data',
      color: 'text-slate-700 dark:text-slate-400',
      bg: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800',
      icon: AlertOctagon
    },
    RECORD_NOT_FOUND: {
      label: lang === 'bn' ? 'অ্যাপের ডেটাবেজে দলিল পাওয়া যায়নি' : 'Deed not found in application database',
      color: 'text-slate-700 dark:text-slate-300',
      bg: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800',
      icon: AlertOctagon
    }
  }[displayStatus] || {
    label: displayStatus,
    color: 'text-gray-700',
    bg: 'bg-gray-50',
    icon: Info
  };

  const StatusIcon = statusConfig.icon;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="gov-container py-6 sm:py-8 space-y-5 max-w-6xl">
      {/* Top Bar Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigateBack ? navigateBack('deed-verify') : setActiveTab('deed-verify')}
            className="gov-btn-primary text-xs py-2 px-4 flex items-center gap-2 font-bold shadow hover:scale-[1.02] transition-transform"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{lang === 'bn' ? '← দলিল যাচাই ফরম-এ ফিরে যান' : '← Back to Deed Verification'}</span>
          </Button>

          <Button
            onClick={() => setActiveTab('dashboard')}
            className="gov-btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <Home className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard'}</span>
          </Button>
        </div>

        <Button
          onClick={handlePrint}
          className="gov-btn-gold text-xs py-2 px-4 flex items-center gap-1.5 font-bold shadow"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>{lang === 'bn' ? 'রিপোর্ট প্রিন্ট / সংরক্ষণ' : 'Print / Save Report'}</span>
        </Button>
      </div>

        {/* Printable preliminary report */}
      <div className="gov-card p-4 sm:p-6 lg:p-8 space-y-6 printable-area bg-white dark:bg-[#121a16] border border-emerald-200 dark:border-emerald-900/70 rounded-3xl shadow-[0_18px_55px_-38px_rgba(4,120,87,0.38)]">
        {/* Application record comparison header */}
        <div className="relative space-y-4 border-b border-emerald-100 dark:border-emerald-900/60 pb-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center shadow-sm">
                <FileCheck2 className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-[10px] sm:text-xs uppercase tracking-[0.14em] text-[#047857] dark:text-emerald-400 font-bold">
                  {lang === 'bn' ? 'ভূমিসেতু • অ্যাপ ডেটাবেজ' : 'BHUMISETU • APPLICATION DATABASE'}
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
                  {lang === 'bn' ? 'দলিল যাচাইয়ের প্রাথমিক ফলাফল' : 'Preliminary Deed Verification'}
                </h1>
                <p className="text-xs text-gray-500 font-medium">
                  {lang === 'bn' ? 'এটি অ্যাপের ডেটাবেজের সঙ্গে প্রাথমিক তুলনা; সরকারি বালাম যাচাই নয়।' : 'A preliminary comparison with the application database; not an official registry check.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
              <Cpu className="w-3.5 h-3.5 text-emerald-700" />
              <span>{lang === 'bn' ? (hasDeedRecord ? 'অ্যাপের ডেটাবেজে দলিল রেকর্ড পাওয়া গেছে' : 'অ্যাপের ডেটাবেজে দলিল রেকর্ড পাওয়া যায়নি') : (hasDeedRecord ? 'Deed record found in application database' : 'Deed record not found in application database')}</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <span>{lang === 'bn' ? 'উৎস: অ্যাপের PostgreSQL ডেটাবেজ' : 'Source: application PostgreSQL database'}</span>
            </span>
          </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-left text-xs">
            {[
              { key: 'deed', label: lang === 'bn' ? 'দলিল নম্বর' : 'Deed Number', value: safeSubmittedSummary.deed_no },
              { key: 'year', label: lang === 'bn' ? 'নিবন্ধনের বছর' : 'Registration Year', value: safeSubmittedSummary.reg_year },
              { key: 'seller', label: lang === 'bn' ? 'বিক্রেতা' : 'Seller', value: safeSubmittedSummary.seller_name },
              { key: 'buyer', label: lang === 'bn' ? 'ক্রেতা' : 'Buyer', value: safeSubmittedSummary.buyer_name || safeSubmittedSummary.owner_name },
              {
                key: 'location',
                label: lang === 'bn' ? 'জমির অবস্থান' : 'Land Location',
                value: [
                  summaryLocationValue('division', safeSubmittedSummary.division),
                  summaryLocationValue('district', safeSubmittedSummary.district),
                  summaryLocationValue('upazila', safeSubmittedSummary.upazila),
                  summaryLocationValue('mouza', safeSubmittedSummary.mouza),
                ]
                  .filter(Boolean).join(' · '),
              },
            ].filter((item) => item.value).map((item) => (
              <div key={item.key} className="min-w-0 rounded-xl bg-slate-50/80 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 px-3 py-2.5">
                <span className="block text-[10px] text-gray-500">{item.label}</span>
                <strong className="block text-gray-800 dark:text-gray-200 break-words">{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span>
              <strong>{lang === 'bn' ? 'রেফারেন্স আইডি:' : 'Reference ID:'}</strong>{' '}
              <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">{verification_ref}</span>
            </span>
            <span>
              <strong>{lang === 'bn' ? 'তারিখ ও সময়:' : 'Generated At:'}</strong>{' '}
              {new Date(created_at).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}
            </span>
          </div>
        </div>

        {/* Status & Match Score Gauge */}
        <div
          className={`relative overflow-hidden p-4 sm:p-5 rounded-2xl border flex flex-wrap items-center justify-between gap-4 shadow-sm transition-shadow duration-300 ${statusConfig.bg}`}
          style={{ opacity: chartsReady ? 1 : 0.96, transition: 'opacity 360ms ease' }}
        >
          <div className="pointer-events-none absolute -right-8 -top-12 w-40 h-40 rounded-full border-[24px] border-white/30 dark:border-white/5" />
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/75 dark:bg-gray-900/50 border border-white/70 dark:border-white/10 flex items-center justify-center shadow-sm">
              <StatusIcon className={`w-7 h-7 ${statusConfig.color} flex-shrink-0`} />
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">
                {lang === 'bn' ? 'সার্বিক যাচাই ফলাফল' : 'Overall Verification Status'}
              </div>
              <div className={`text-base sm:text-lg font-black ${statusConfig.color}`}>
                {statusConfig.label}
              </div>
            </div>
          </div>

          <div className="relative inline-flex items-center gap-2 rounded-xl border border-white/80 dark:border-white/10 bg-white/70 dark:bg-gray-900/40 px-3 py-2 text-[10px] font-semibold text-gray-600 dark:text-gray-300">
            <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>{lang === 'bn' ? 'অ্যাপের রেকর্ডভিত্তিক প্রাথমিক ফল' : 'Preliminary result from application records'}</span>
          </div>
        </div>

        <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3" aria-label={lang === 'bn' ? 'যাচাইয়ের মূল সংখ্যা' : 'Verification key figures'}>
          {[
            { key: 'eligible', label: lang === 'bn' ? 'চার্টে গণ্য ফিল্ড' : 'Fields in distribution', count: overallCountTotal, detail: lang === 'bn' ? 'মিল · আংশিক · অমিল · অনুপলব্ধ' : 'Matched · partial · mismatched · unavailable', color: 'text-slate-700 dark:text-slate-200', accent: 'bg-slate-100 dark:bg-slate-800' },
            { key: 'matched', label: lang === 'bn' ? 'মিলেছে' : 'Matched', count: overallCounts.MATCHED, detail: formatPercent(overallDistribution.percentages.MATCHED, lang), color: 'text-[#365F9F]', accent: 'bg-blue-50 dark:bg-blue-950/50' },
            { key: 'partial', label: lang === 'bn' ? 'আংশিক মিল' : 'Partial match', count: overallCounts.PARTIAL_MATCH, detail: formatPercent(overallDistribution.percentages.PARTIAL_MATCH, lang), color: 'text-[#9A4D10]', accent: 'bg-orange-50 dark:bg-orange-950/50' },
            { key: 'mismatch', label: lang === 'bn' ? 'অমিল' : 'Mismatch', count: overallCounts.MISMATCH, detail: formatPercent(overallDistribution.percentages.MISMATCH, lang), color: 'text-slate-600 dark:text-slate-300', accent: 'bg-slate-50 dark:bg-slate-900/60' },
            { key: 'unavailable', label: lang === 'bn' ? 'তথ্য অনুপলব্ধ' : 'Unavailable', count: overallCounts.UNAVAILABLE, detail: formatPercent(overallDistribution.percentages.UNAVAILABLE, lang), color: 'text-[#7A5A00]', accent: 'bg-amber-50 dark:bg-amber-950/50' },
            { key: 'not-provided', label: lang === 'bn' ? 'দেওয়া হয়নি' : 'Not provided', count: omittedNotProvided, detail: lang === 'bn' ? 'যাচাইয়ের শতাংশে গণনা নয়' : 'Excluded from percentages', color: 'text-slate-600 dark:text-slate-300', accent: 'bg-slate-100 dark:bg-slate-800' },
            { key: 'pending', label: lang === 'bn' ? 'অপেক্ষমাণ' : 'Pending', count: pendingCount, detail: lang === 'bn' ? 'যাচাইয়ের শতাংশে গণনা নয়' : 'Excluded from percentages', color: 'text-slate-600 dark:text-slate-300', accent: 'bg-slate-100 dark:bg-slate-800' },
          ].map((item, index) => (
            <article
              key={item.key}
              className="min-w-0 rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-3.5 py-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              style={{ opacity: chartsReady ? 1 : 0.96, transition: 'opacity 360ms ease, transform 200ms ease, box-shadow 200ms ease', transitionDelay: `${index * 45}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 leading-snug">{item.label}</span>
                <span className={`w-2 h-2 shrink-0 rounded-full ${item.accent}`} />
              </div>
              <strong className={`mt-1 block text-2xl sm:text-3xl leading-none font-black tabular-nums ${item.color}`}>{item.count}</strong>
              <span className="mt-1 block text-[9px] sm:text-[10px] text-gray-500 leading-snug">{item.detail}</span>
            </article>
          ))}
        </section>

        <section
          className="space-y-4"
          aria-labelledby="verification-graphs-title"
          style={{ opacity: chartsReady ? 1 : 0.96, transform: chartsReady ? 'translateY(0)' : 'translateY(3px)', transition: 'opacity 360ms ease, transform 360ms ease' }}
        >
          <h3 id="verification-graphs-title" className="font-bold text-sm text-gray-900 dark:text-white">
            {lang === 'bn' ? 'যাচাই ফলাফলের সারাংশ' : 'Verification Result Summary'}
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-blue-50/50 dark:from-gray-900/70 dark:to-blue-950/20 p-4 sm:p-5 space-y-4 shadow-sm">
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {lang === 'bn' ? 'সার্বিক যাচাই' : 'Overall Verification'}
                </h4>
                <p className="mt-1 text-[10px] text-gray-500">
                  {lang === 'bn' ? 'প্রদর্শিত ফিল্ডের প্রকৃত স্ট্যাটাস বণ্টন' : 'Actual status distribution across displayed fields'}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 sm:gap-5">
                <div
                  className="relative w-40 h-40 shrink-0"
                  role="group"
                  aria-label={`${lang === 'bn' ? 'ফিল্ড ফলাফল' : 'Field results'}: ${overallChartDescription || (lang === 'bn' ? 'তথ্য নেই' : 'No field data')}`}
                >
                  <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
                    <circle cx="80" cy="80" r={donutRadius} fill="none" stroke="#e5e7eb" strokeWidth="17" className="dark:stroke-gray-800" />
                    {donutSegments.map((segment) => (
                      <circle
                        key={segment.key}
                        role="img"
                        tabIndex={0}
                        aria-label={`${lang === 'bn' ? segment.bn : segment.en}: ${overallCounts[segment.key]} · ${formatPercent(segment.percent, lang)}`}
                        cx="80"
                        cy="80"
                        r={donutRadius}
                        fill="none"
                        stroke={segment.color}
                        strokeWidth={selectedStatusKey === segment.key ? '22' : '17'}
                        strokeLinecap="butt"
                        strokeDasharray={`${chartsReady ? segment.length : 0} ${donutCircumference}`}
                        strokeDashoffset={-segment.offset}
                        className="cursor-pointer focus-visible:outline-none"
                        onMouseEnter={() => setSelectedStatusKey(segment.key)}
                        onMouseLeave={() => setSelectedStatusKey(null)}
                        onFocus={() => setSelectedStatusKey(segment.key)}
                        onBlur={() => setSelectedStatusKey(null)}
                        style={{
                          opacity: selectedStatusKey && selectedStatusKey !== segment.key ? 0.28 : 1,
                          filter: selectedStatusKey === segment.key ? 'drop-shadow(0 1px 2px rgba(37, 99, 235, .28))' : 'none',
                          transition: prefersReducedMotion ? 'none' : 'stroke-dasharray 850ms cubic-bezier(0.22, 1, 0.36, 1), stroke-width 220ms ease, opacity 220ms ease, filter 220ms ease',
                        }}
                      >
                        <title>{`${lang === 'bn' ? segment.bn : segment.en}: ${overallCounts[segment.key]} · ${formatPercent(segment.percent, lang)}`}</title>
                      </circle>
                    ))}
                  </svg>
                  <div className="pointer-events-none absolute inset-[24px] rounded-full bg-white dark:bg-gray-900 flex flex-col items-center justify-center text-center shadow-inner">
                    <strong className="text-[24px] leading-none font-black tabular-nums text-gray-900 dark:text-white">
                      {formatPercent(overallMatch.percentage, lang)}
                    </strong>
                    <span className="mt-1 max-w-[92px] text-[9px] leading-tight text-gray-500">
                      {overallMatch.eligibleCount
                        ? (lang === 'bn'
                          ? `${formatEffectiveCount(overallMatch.effectiveMatched, lang)}/${overallMatch.eligibleCount} কার্যকর মিল`
                          : `${formatEffectiveCount(overallMatch.effectiveMatched, lang)}/${overallMatch.eligibleCount} effective matches`)
                        : (lang === 'bn' ? 'তুলনার তথ্য নেই' : 'No comparable field data')}
                    </span>
                  </div>
                </div>
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2.5 text-[11px]">
                  {chartStatuses.map((item) => (
                    <div
                      key={item.key}
                      role="img"
                      tabIndex={overallCounts[item.key] > 0 ? 0 : -1}
                      aria-label={`${lang === 'bn' ? item.bn : item.en}: ${overallCounts[item.key]} · ${formatPercent(overallDistribution.percentages[item.key], lang)}`}
                      onMouseEnter={() => overallCounts[item.key] > 0 && setSelectedStatusKey(item.key)}
                      onMouseLeave={() => setSelectedStatusKey(null)}
                      onFocus={() => overallCounts[item.key] > 0 && setSelectedStatusKey(item.key)}
                      onBlur={() => setSelectedStatusKey(null)}
                      className={`min-w-0 flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-all duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400 ${selectedStatusKey === item.key ? 'border-blue-200 bg-blue-50/80 shadow-sm dark:border-blue-800 dark:bg-blue-950/40' : 'border-transparent hover:bg-slate-50 dark:hover:bg-gray-800/60'} ${selectedStatusKey && selectedStatusKey !== item.key ? 'opacity-50' : ''}`}
                    >
                      <span className={`w-2.5 h-2.5 shrink-0 rounded-full ${item.key === 'MISMATCH' ? 'border border-slate-400' : ''}`} style={{ backgroundColor: item.color }} />
                      <span className="shrink-0">{lang === 'bn' ? item.bn : item.en}</span>
                      <strong className="shrink-0 tabular-nums text-gray-900 dark:text-white">{overallCounts[item.key]} · {formatPercent(overallDistribution.percentages[item.key], lang)}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-gray-500 border-t border-gray-100 dark:border-gray-800 pt-3">
                {overallCountTotal
                  ? (lang === 'bn'
                    ? `শতাংশের মোট ${formatPercent(chartStatuses.reduce((sum, item) => sum + (overallDistribution.percentages[item.key] || 0), 0), lang)}; দেওয়া হয়নি ${omittedNotProvided}, অপেক্ষমাণ ${pendingCount}, রেফারেন্সমাত্র ${availableCount} আলাদা রাখা হয়েছে।`
                    : `Percentages total ${formatPercent(chartStatuses.reduce((sum, item) => sum + (overallDistribution.percentages[item.key] || 0), 0), lang)}; ${omittedNotProvided} not-provided, ${pendingCount} pending, and ${availableCount} reference-only fields are tracked separately.`)
                  : (lang === 'bn' ? 'তুলনাযোগ্য ফিল্ডের তথ্য নেই; শতাংশ গণনা করা হয়নি।' : 'No comparable fields; percentages are not calculated.')}
              </p>

            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-4 sm:p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {lang === 'bn' ? 'ফিল্ডভিত্তিক ফলাফল' : 'Field-by-Field Status'}
                </h4>
                <span className="rounded-full px-2 py-1 bg-slate-50 dark:bg-gray-800 text-[9px] text-gray-500">{chartFields.length} {lang === 'bn' ? 'ফিল্ড' : 'fields'}</span>
              </div>
              <div className="space-y-1.5">
                {chartFields.map((field) => {
                  const fieldStatus = statusForField(field);
                  const statusItem = chartStatuses.find(({ key }) => key === fieldStatus);
                  return (
                    <div key={field.key} className="flex items-center justify-between gap-3 text-[11px] rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-gray-800/60 transition-colors">
                      <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">{lang === 'bn' ? field.label_bn : field.label_en}</span>
                      <span className={`shrink-0 inline-flex items-center gap-1.5 font-semibold ${statusLabels[fieldStatus]?.className || 'text-slate-600 dark:text-slate-300'}`}>
                        <span className={`w-2 h-2 rounded-full ${fieldStatus === 'MISMATCH' ? 'border border-slate-400' : ''}`} style={{ backgroundColor: statusItem?.color || '#64748b' }} />
                        {lang === 'bn' ? statusLabels[fieldStatus]?.bn : statusLabels[fieldStatus]?.en}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <article className="min-w-0 h-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-4 sm:p-5 space-y-4 shadow-sm">
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{lang === 'bn' ? 'ক্যাটাগরিভিত্তিক যাচাই' : 'Program overview'}</h4>
                <p className="mt-1 text-[10px] text-gray-500">{lang === 'bn' ? 'প্রতিটি রিংয়ে আংশিক মিল অর্ধেক ধরে মূল্যায়নযোগ্য ফিল্ডের মিল দেখানো হয়।' : 'Each ring applies half credit to partial matches and excludes unevaluated fields.'}</p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="relative order-1 w-full max-w-[250px] shrink-0 aspect-square sm:order-2" role="group" aria-label={lang === 'bn' ? 'ক্যাটাগরি রিং নির্বাচন করুন' : 'Select a category ring'}>
                  <svg viewBox="0 0 260 260" className="w-full h-full">
                    {radialCategories.map((item, index) => {
                      const selected = selectedCategoryKey === item.key;
                      return (
                      <g
                        key={item.key}
                        role="img"
                        tabIndex={0}
                        aria-label={`${lang === 'bn' ? item.bn : item.en}: ${item.matchedPercent === null ? (lang === 'bn' ? 'তথ্য নেই' : 'No Data') : formatPercent(item.matchedPercent, lang)}`}
                          className="cursor-pointer focus-visible:opacity-70"
                        onMouseEnter={() => setSelectedCategoryKey(item.key)}
                        onMouseLeave={() => setSelectedCategoryKey(null)}
                        onFocus={() => setSelectedCategoryKey(item.key)}
                        onBlur={() => setSelectedCategoryKey(null)}
                      >
                        <circle
                          cx="130"
                          cy="130"
                          r={item.radius}
                          fill="none"
                          stroke={item.matchStats.eligibleCount === 0 ? '#FAFBFC' : '#F2F5F9'}
                          strokeWidth={selected ? '10' : '8'}
                          strokeDasharray={`${item.arcLength} ${item.circumference - item.arcLength}`}
                          strokeLinecap="round"
                          transform="rotate(225 130 130)"
                          opacity={item.matchStats.eligibleCount > 0 ? 1 : 0.38}
                          style={{ transition: prefersReducedMotion ? 'none' : 'stroke 220ms ease, stroke-width 220ms ease' }}
                        />
                        {item.matchStats.eligibleCount > 0 && item.matchedPercent > 0 && (
                          <circle
                            cx="130"
                            cy="130"
                            r={item.radius}
                            fill="none"
                            stroke={item.color}
                            strokeWidth={selected ? '10' : '8'}
                            strokeDasharray={`${chartsReady ? item.progressLength : 0} ${item.circumference - item.progressLength}`}
                            strokeDashoffset="0"
                            strokeLinecap="round"
                            transform="rotate(225 130 130)"
                            style={{
                              opacity: selected ? 1 : 0.82,
                              filter: selected ? 'drop-shadow(0 1px 2px rgba(37, 99, 235, .24))' : 'none',
                              transition: prefersReducedMotion ? 'none' : 'stroke-dasharray 850ms cubic-bezier(0.22, 1, 0.36, 1), stroke-width 220ms ease, opacity 220ms ease, filter 220ms ease',
                            }}
                          >
                            <title>{`${lang === 'bn' ? item.bn : item.en}: ${formatEffectiveCount(item.matchStats.effectiveMatched, lang)}/${item.matchStats.eligibleCount} ${lang === 'bn' ? 'কার্যকর মিল' : 'effective matches'} (${formatPercent(item.matchedPercent, lang)})`}</title>
                          </circle>
                        )}
                      </g>
                    );})}
                  </svg>
                  <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-[66px] w-[66px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white dark:bg-gray-900 text-center shadow-sm">
                    <strong className="text-base font-black tabular-nums text-slate-800 dark:text-white">{formatPercent(overallMatch.percentage, lang)}</strong>
                    <span className="text-[8px] leading-tight text-gray-500">{lang === 'bn' ? 'সার্বিক কার্যকর মিল' : 'Effective match'}</span>
                  </div>
                </div>

                <div className="order-2 w-full min-w-0 divide-y divide-gray-100 dark:divide-gray-800 sm:order-1">
                  {radialCategories.map((item) => {
                    const selected = selectedCategoryKey === item.key;
                    return (
                    <div key={item.key} role="img" tabIndex={0} aria-label={`${lang === 'bn' ? item.bn : item.en}: ${item.matchStats.eligibleCount > 0 ? `${formatEffectiveCount(item.matchStats.effectiveMatched, lang)}/${item.matchStats.eligibleCount} ${formatPercent(item.matchedPercent, lang)}` : (lang === 'bn' ? 'তথ্য নেই' : 'No Data')}`} onMouseEnter={() => setSelectedCategoryKey(item.key)} onMouseLeave={() => setSelectedCategoryKey(null)} onFocus={() => setSelectedCategoryKey(item.key)} onBlur={() => setSelectedCategoryKey(null)} className={`flex w-full items-center gap-2 rounded-md border px-1.5 py-1.5 text-left transition-all duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400 first:pt-0 last:pb-0 ${selected ? 'border-blue-200 bg-blue-50 shadow-sm dark:border-blue-800 dark:bg-blue-950/40' : 'border-transparent hover:bg-slate-50 dark:hover:bg-gray-800/60'}`} title={item.matchStats.eligibleCount > 0 ? `${formatEffectiveCount(item.matchStats.effectiveMatched, lang)} / ${item.matchStats.eligibleCount} effective matches` : 'No comparable fields'}>
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.matchStats.eligibleCount === 0 ? 'border border-slate-300 dark:border-gray-600' : ''}`} style={{ backgroundColor: item.matchStats.eligibleCount > 0 ? item.color : '#FFFFFF' }} />
                      <span className={`min-w-0 flex-1 truncate text-[10px] font-medium ${selected ? 'text-blue-800 dark:text-blue-200' : 'text-gray-700 dark:text-gray-300'}`}>{lang === 'bn' ? item.bn : item.en}</span>
                      <span className="shrink-0 text-[9px] tabular-nums text-gray-500">{item.matchStats.eligibleCount > 0 ? `${formatEffectiveCount(item.matchStats.effectiveMatched, lang)}/${item.matchStats.eligibleCount}` : (lang === 'bn' ? 'তথ্য নেই' : 'No Data')}</span>
                      <strong className="w-12 shrink-0 text-right text-[10px] tabular-nums text-gray-800 dark:text-gray-200">{item.matchedPercent === null ? '—' : formatPercent(item.matchedPercent, lang)}</strong>
                    </div>
                  );})}
                </div>
              </div>
            </article>

            <article className="min-w-0 h-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{lang === 'bn' ? 'ক্যাটাগরিভিত্তিক ১০০% যাচাই' : 'Category-wise 100% Verification'}</h4>
                  <p className="mt-1 text-[10px] text-gray-500">{lang === 'bn' ? 'প্রতিটি bar-এর ভেতরে status, সংখ্যা ও শতাংশ দেখুন।' : 'Each bar labels the status, count, and percentage inside its segments.'}</p>
                </div>
                <span className="rounded-full border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/70 px-2.5 py-1 text-[9px] text-gray-600 dark:text-gray-300">
                  {lang === 'bn' ? `${fieldCategories.length}টি ক্যাটাগরি` : `${fieldCategories.length} categories`}
                </span>
              </div>

              <div className="grid flex-1 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-x-3 gap-y-5">
                {fieldCategories.map((category, index) => {
                  const breakdown = chartStatuses.map((item) => ({
                    ...item,
                    count: category.counts[item.key],
                    percent: category.percentages[item.key],
                  }));
                  const tooltip = category.total > 0
                    ? breakdown.map((item) => `${lang === 'bn' ? item.bn : item.en}: ${item.count} (${formatPercent(item.percent, lang)})`).join(' · ')
                    : (lang === 'bn' ? 'কোনো তুলনাযোগ্য ফিল্ড নেই' : 'No comparable fields');
                  const highlighted = selectedCategoryKey === category.key;
                  return (
                    <div key={category.key} role="group" tabIndex={0} aria-label={`${lang === 'bn' ? category.bn : category.en}: ${tooltip}`} onMouseEnter={() => setSelectedCategoryKey(category.key)} onMouseLeave={() => setSelectedCategoryKey(null)} onFocus={() => setSelectedCategoryKey(category.key)} onBlur={() => setSelectedCategoryKey(null)} className={`min-w-0 flex flex-col items-center gap-2 rounded-xl border border-transparent px-1.5 py-1.5 text-center transition-all duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-300 ${highlighted ? 'bg-blue-50/40 shadow-sm -translate-y-0.5' : 'hover:bg-slate-50/70'}`} title={tooltip}>
                      <span className={`min-h-8 flex items-end justify-center text-[10px] font-semibold leading-tight transition-colors duration-200 ${highlighted ? 'text-blue-800 dark:text-blue-200' : 'text-gray-800 dark:text-gray-200'}`}>{lang === 'bn' ? category.bn : category.en}</span>
                      {category.total > 0 ? (
                        <div
                          className={`flex h-36 w-14 sm:w-16 flex-col-reverse overflow-hidden rounded-xl border-2 bg-slate-100 transition-all duration-200 ease-out dark:bg-gray-800 ${highlighted ? 'border-blue-400/65 shadow-md shadow-blue-200/40 dark:border-blue-300/55' : 'border-blue-300/40 dark:border-blue-300/30'}`}
                          role="img"
                          aria-label={`${lang === 'bn' ? category.bn : category.en}: ${tooltip}`}
                        >
                          {breakdown.filter((item) => item.count > 0).map((item, segmentIndex) => (
                            <div
                              key={item.key}
                              className="flex w-full shrink-0 min-h-0 items-center justify-center overflow-hidden text-[7px] font-bold text-slate-800"
                              style={{
                                height: chartsReady ? `${(item.count / category.total) * 100}%` : '0%',
                                backgroundColor: item.color,
                                backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,.24), rgba(255,255,255,.05))',
                                boxShadow: item.key === 'MISMATCH'
                                  ? 'inset 0 0 0 1px #94A3B8'
                                  : 'inset 0 1px 1px rgba(255,255,255,.28)',
                                transition: prefersReducedMotion ? 'none' : 'height 700ms cubic-bezier(0.22, 1, 0.36, 1)',
                                transitionDelay: prefersReducedMotion ? '0ms' : `${index * 45 + segmentIndex * 35}ms`,
                              }}
                              title={`${lang === 'bn' ? item.bn : item.en}: ${item.count} (${formatPercent(item.percent, lang)})`}
                            >
                              {(item.count / category.total) * 100 >= 22 ? (
                                <span className="min-w-0 px-0.5 text-center leading-[1.05]">
                                  <span className="block whitespace-nowrap">{lang === 'bn' ? item.bn : item.en}</span>
                                  <span className="block whitespace-nowrap tabular-nums">{item.count} · {formatPercent(item.percent, lang)}</span>
                                </span>
                              ) : ''}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={`flex h-36 w-14 sm:w-16 items-center justify-center rounded-xl border border-dashed bg-slate-50/70 px-1 text-[8px] leading-tight text-gray-500 transition-all duration-200 ease-out dark:bg-gray-800/40 ${highlighted ? 'border-blue-300/80 ring-2 ring-blue-200/40 shadow-sm' : 'border-blue-200/70 dark:border-blue-300/30'}`}>{lang === 'bn' ? 'তথ্য নেই' : 'No Data'}</div>
                      )}
                      <span className={`text-xs font-bold tabular-nums transition-colors duration-200 ${highlighted ? 'text-blue-800 dark:text-blue-200' : 'text-gray-900 dark:text-gray-100'}`}>{category.total || '—'}</span>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                {chartStatuses.map((item) => (
                  <span key={item.key} className="inline-flex items-center gap-1.5 text-[10px] text-gray-600 dark:text-gray-300">
                    <span className={`h-2.5 w-2.5 rounded-sm ${item.key === 'MISMATCH' ? 'border border-slate-400' : ''}`} style={{ backgroundColor: item.color }} />
                    {lang === 'bn' ? item.bn : item.en}
                  </span>
                ))}
                {(omittedNotProvided > 0 || pendingCount > 0) && (
                  <span className="text-[10px] text-gray-500">
                    {lang === 'bn' ? `অন্তর্ভুক্ত নয়—দেওয়া হয়নি: ${omittedNotProvided}, অপেক্ষমাণ: ${pendingCount}` : `Excluded—Not provided: ${omittedNotProvided}, Pending: ${pendingCount}`}
                  </span>
                )}
              </div>
            </article>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="verification-insights-title">
          <h3 id="verification-insights-title" className="font-bold text-sm text-gray-900 dark:text-white">
            {lang === 'bn' ? 'যাচাই বিশ্লেষণ ও পরামর্শ' : 'Verification Insights and Guidance'}
          </h3>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-2 text-xs">
            {verificationInsights.length > 0 ? verificationInsights.map((insight) => (
              <p key={insight.key} className="text-gray-700 dark:text-gray-300">
                <strong>{insight.label}:</strong> {insight.message || (lang === 'bn' ? 'এই তথ্যটি হাতে পর্যালোচনা করুন।' : 'Review this field manually.')}
              </p>
            )) : (
              <p className="text-gray-700 dark:text-gray-300">
                {lang === 'bn'
                  ? 'পরীক্ষা করা বাধ্যতামূলক ফিল্ডগুলো অ্যাপের ডেটাবেজের সঙ্গে মিলে গেছে; এটি সরকারি বা আইনি মালিকানা যাচাই নয়।'
                  : 'All evaluated required fields match the application database; this is not an official or legal ownership determination.'}
              </p>
            )}
            <p className="text-[11px] text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-800">
              {ownershipItems.length > 0
                ? (lang === 'bn'
                  ? `অ্যাপের deeds রেকর্ডে ${ownershipItems.length}টি হস্তান্তর পাওয়া গেছে। এই তালিকা পূর্ণ সরকারি মালিকানা ইতিহাস নয়।`
                  : `${ownershipItems.length} transfer(s) were found in application deed records. This is not a complete official ownership history.`)
                : (lang === 'bn'
                  ? 'মালিকানা ইতিহাসের নির্ভরযোগ্য রেকর্ড পাওয়া যায়নি; কোনো timeline তৈরি করা হয়নি।'
                  : 'No sourced ownership history is available; no timeline has been generated.')}
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4" aria-label={lang === 'bn' ? 'বিক্রেতা ও রেকর্ডভুক্ত মালিক তুলনা' : 'Seller and recorded owner comparison'}>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">
              {lang === 'bn' ? 'বিক্রেতা বনাম রেকর্ডভুক্ত বর্তমান মালিক' : 'Seller vs. Recorded Current Owner'}
            </h3>
            {sellerOwnerComparison ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-gray-50 dark:bg-gray-800/60 p-2">
                    <span className="block text-[10px] text-gray-500">{lang === 'bn' ? 'দলিলে দেওয়া বিক্রেতা' : 'Seller submitted for deed'}</span>
                    <strong className="break-words text-gray-800 dark:text-gray-200">{sellerOwnerComparison.submitted || (lang === 'bn' ? 'দেওয়া হয়নি' : 'Not provided')}</strong>
                  </div>
                  <div className="rounded-md bg-gray-50 dark:bg-gray-800/60 p-2">
                    <span className="block text-[10px] text-gray-500">{lang === 'bn' ? 'রেকর্ডভুক্ত বর্তমান মালিক' : 'Recorded current owner'}</span>
                    <strong className="break-words text-gray-800 dark:text-gray-200">{sellerOwnerComparison.recorded || (lang === 'bn' ? 'রেকর্ড নেই' : 'No record')}</strong>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={`font-bold ${statusLabels[sellerOwnerComparison.status]?.className || statusLabels.UNAVAILABLE.className}`}>
                    {lang === 'bn'
                      ? (statusLabels[sellerOwnerComparison.status]?.bn || statusLabels.UNAVAILABLE.bn)
                      : (statusLabels[sellerOwnerComparison.status]?.en || statusLabels.UNAVAILABLE.en)}
                    {sellerOwnerComparison.similarity_score !== null && sellerOwnerComparison.similarity_score !== undefined
                      ? ` · ${lang === 'bn' ? 'সাদৃশ্য' : 'similarity'} ${sellerOwnerComparison.similarity_score}%`
                      : ''}
                  </span>
                  {sellerOwnerComparison.evidence_ref && <span className="font-mono text-[10px] text-gray-500">{sellerOwnerComparison.evidence_ref}</span>}
                </div>
                <p className="text-[10px] text-gray-500">
                  {lang === 'bn'
                    ? 'এটি নামের সাদৃশ্য-সংকেত; পরিচয় বা আইনগত মালিকানা নিশ্চিত করে না।'
                    : 'This is a name-similarity signal; it does not verify identity or legal ownership.'}
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-500">
                {lang === 'bn' ? 'এই সংরক্ষিত রিপোর্টে বিক্রেতা ও বর্তমান মালিকের তুলনা নেই।' : 'This saved report does not contain a seller-to-owner comparison.'}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-2 text-xs">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">
              {lang === 'bn' ? 'প্রমাণভিত্তিক পরবর্তী যাচাই' : 'Evidence-Based Follow-up'}
            </h3>
            {graphAnomalies.length > 0 ? graphAnomalies.map((anomaly, index) => (
              <div key={`${anomaly.type || 'anomaly'}-${index}`} className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 text-gray-700 dark:text-gray-300">
                <p>{lang === 'bn'
                  ? ({
                    POTENTIAL_OWNERSHIP_CYCLE: 'একই জমির দলিল রেকর্ডে চক্রাকার পক্ষ-পরিবর্তনের সংকেত আছে; উল্লিখিত দলিলগুলো ধারাবাহিকভাবে হাতে যাচাই করুন।',
                    POTENTIAL_DOUBLE_SALE: 'একই বিক্রেতার নামে একাধিক ক্রেতার কাছে হস্তান্তরের রেকর্ড আছে; দলিলের ক্রম ও বাতিলের তথ্য যাচাই করুন।',
                    RAPID_TRANSFER_OBSERVATION: 'দলিল রেকর্ডে স্বল্প ব্যবধানে ধারাবাহিক হস্তান্তর আছে; তারিখ ও দলিল হাতে যাচাই করুন।',
                  }[anomaly.type] || 'রেকর্ডের ধারাবাহিকতা হাতে পর্যালোচনা করুন.')
                  : (anomaly.explanation || 'Review the recorded transfer sequence manually.')}</p>
                {Array.isArray(anomaly.evidence_refs) && anomaly.evidence_refs.length > 0 && (
                  <p className="mt-1 font-mono text-[10px]">{lang === 'bn' ? 'প্রমাণ:' : 'Evidence:'} {anomaly.evidence_refs.join(', ')}</p>
                )}
              </div>
            )) : graphAnalysisAvailable ? (
              <p className="text-gray-700 dark:text-gray-300">
                {lang === 'bn'
                  ? 'এই ফলাফলে দলিল-ইতিহাসের কোনো graph সংকেত পাওয়া যায়নি; এটি মালিকানা নিরাপদ প্রমাণ করে না।'
                  : 'No deed-history graph signal was returned; this does not prove clear ownership.'}
              </p>
            ) : (
              <p className="text-gray-700 dark:text-gray-300">
                {lang === 'bn' ? 'দলিল-ইতিহাস বিশ্লেষণ পাওয়া যায়নি।' : 'Deed-history analysis is unavailable for this report.'}
              </p>
            )}
            {verificationInsights.length > 0 && (
              <p className="pt-2 border-t border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400">
                {lang === 'bn'
                  ? 'যে বাধ্যতামূলক ফিল্ডে অমিল বা তথ্যের ঘাটতি আছে, মূল দলিল ও সংশ্লিষ্ট সাব-রেজিস্ট্রি রেকর্ডে মিলিয়ে নিন।'
                  : 'Review required-field differences or missing values against the original deed and the relevant sub-registry record.'}
              </p>
            )}
          </div>
        </section>

        {ownershipItems.length > 0 && (
          <section className="space-y-3" aria-labelledby="ownership-timeline-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="ownership-timeline-title" className="font-bold text-sm text-gray-900 dark:text-white">
                {lang === 'bn' ? 'রেকর্ডে পাওয়া দলিল হস্তান্তরের সময়রেখা' : 'Recorded Deed Transfer Timeline'}
              </h3>
              <span className="text-[10px] text-gray-500">{ownershipHistory.source || 'application_database.deeds'}</span>
            </div>
            <ol className="space-y-2 border-l-2 border-emerald-200 dark:border-emerald-900 pl-4">
              {ownershipItems.map((item, index) => {
                const parsedDate = item.transfer_date ? new Date(item.transfer_date) : null;
                const dateLabel = parsedDate && !Number.isNaN(parsedDate.getTime())
                  ? parsedDate.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US')
                  : (item.transfer_date || item.reg_year || (lang === 'bn' ? 'তারিখ নেই' : 'Date unavailable'));
                return (
                  <li key={item.evidence_ref} className="relative rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-xs">
                    <span className="absolute -left-[1.35rem] top-4 w-2.5 h-2.5 rounded-full bg-emerald-600 ring-4 ring-white dark:ring-[#121a16]" />
                    <div className="flex flex-wrap justify-between gap-2 text-gray-500">
                      <time>{dateLabel}</time>
                      <span className="font-mono text-[10px]">{item.evidence_ref}</span>
                    </div>
                    <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100 break-words">
                      {item.seller_name || '—'} <span className="text-emerald-700 dark:text-emerald-400">→</span> {item.buyer_name || '—'}
                    </p>
                    {item.deed_no && <p className="mt-1 text-gray-500">{lang === 'bn' ? 'দলিল নম্বর:' : 'Deed No:'} {item.deed_no}</p>}
                  </li>
                );
              })}
            </ol>
            {ownershipHistory.complete === false && (
              <p className="text-[10px] text-gray-500">
                {lang === 'bn' ? 'এটি অ্যাপের উপলভ্য রেকর্ডের আংশিক তালিকা; সম্পূর্ণ title search নয়।' : 'This is a partial list of available application records, not a complete title search.'}
              </p>
            )}
          </section>
        )}

        {/* Structured field comparison against application records */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="font-bold text-xl sm:text-2xl text-gray-900 dark:text-white flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-[#0b462d] dark:text-emerald-400" />
                <span>{lang === 'bn' ? 'প্রদত্ত তথ্য বনাম অ্যাপের ডেটাবেজ রেকর্ড' : 'Submitted Information vs. Application Database'}</span>
              </h3>
              <p className="mt-1 ml-7 text-xs sm:text-[13px] text-gray-500">
                {lang === 'bn' ? 'প্রতিটি ফিল্ডে জমা দেওয়া তথ্য ও রেকর্ডের মান পাশাপাশি দেখুন।' : 'Compare submitted values with the available record, field by field.'}
              </p>
            </div>
            <span className="rounded-full border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/60 px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300">
              {fieldRows.length} {lang === 'bn' ? 'টি ফিল্ড' : 'fields'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {fieldRows.map((field, index) => {
              const fieldStatus = statusForField(field);
              const statusLabel = statusLabels[fieldStatus] || statusLabels.UNAVAILABLE;
              const appearance = statusAppearance[fieldStatus] || statusAppearance.UNAVAILABLE;
              const FieldStatusIcon = appearance.Icon;
              const localizedSubmittedValue = fieldDisplayValue(field, 'submitted');
              const localizedRecordedValue = fieldDisplayValue(field, 'recorded');
              const submittedValue = localizedSubmittedValue === null || localizedSubmittedValue === undefined || localizedSubmittedValue === ''
                ? (lang === 'bn' ? 'দেওয়া হয়নি' : 'Not provided')
                : localizedSubmittedValue;
              const recordedValue = localizedRecordedValue === null || localizedRecordedValue === undefined || localizedRecordedValue === ''
                ? (lang === 'bn' ? 'রেকর্ড পাওয়া যায়নি' : 'No database value')
                : field.key === 'property_status'
                  ? (lang === 'bn'
                    ? ({ clear: 'নথিতে clear লেখা আছে', disputed: 'নথিতে disputed লেখা আছে', acquired: 'নথিতে acquired লেখা আছে' }[localizedRecordedValue] || localizedRecordedValue)
                    : localizedRecordedValue)
                  : localizedRecordedValue;
              return (
                <article
                  key={field.key}
                  className="group min-w-0 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-white via-white to-emerald-50/50 dark:from-gray-900 dark:via-gray-900/90 dark:to-emerald-950/20 p-4 sm:p-5 space-y-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 dark:hover:border-emerald-800 hover:shadow-md"
                  style={{ opacity: chartsReady ? 1 : 0.97, transition: 'opacity 360ms ease, transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease', transitionDelay: `${Math.min(index, 8) * 35}ms` }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <h4 className="min-w-0 font-bold text-[15px] sm:text-base text-gray-900 dark:text-gray-100 leading-snug break-words">
                      {lang === 'bn' ? field.label_bn : field.label_en}
                      {field.required && <span className="ml-1 text-rose-600" aria-label={lang === 'bn' ? 'বাধ্যতামূলক' : 'Required'}>*</span>}
                      {field.optional && <span className="ml-1 text-xs font-normal text-gray-500">({lang === 'bn' ? 'ঐচ্ছিক' : 'optional'})</span>}
                      {field.key === 'mouza' && (field.official_verification_status === 'NOT_VERIFIED' || (!field.official_verification_status && field.input_source === 'manual_unverified')) && (
                        <span className="mt-1 block text-[11px] font-medium text-amber-700 dark:text-amber-300">
                         
                        </span>
                      )}
                      {field.key === 'mouza' && (field.official_verification_status === 'VERIFIED' || (!field.official_verification_status && field.input_source === 'official_catalog')) && (
                        <span className="mt-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          {lang === 'bn' ? 'সরকারি মৌজা তালিকায় যাচাইকৃত · মালিকানার যাচাই নয়' : 'Verified in official Mouza list · not ownership verification'}
                        </span>
                      )}
                      {field.key === 'mouza' && field.official_verification_status === 'UNAVAILABLE' && (
                        <span className="mt-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {lang === 'bn' ? 'সরকারি মৌজা যাচাইয়ের তথ্য অনুপলব্ধ' : 'Official Mouza verification is unavailable'}
                        </span>
                      )}
                    </h4>
                    <span
                      className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-bold leading-tight"
                      style={{
                        borderColor: fieldStatus === 'MISMATCH'
                          ? '#94A3B8'
                          : (VERIFICATION_STATUS_COLORS[fieldStatus] || VERIFICATION_STATUS_COLORS.UNAVAILABLE),
                        color: VERIFICATION_STATUS_TEXT_COLORS[fieldStatus] || VERIFICATION_STATUS_TEXT_COLORS.UNAVAILABLE,
                        backgroundColor: fieldStatus === 'MISMATCH'
                          ? '#FFFFFF'
                          : `${VERIFICATION_STATUS_COLORS[fieldStatus] || VERIFICATION_STATUS_COLORS.UNAVAILABLE}18`,
                      }}
                      aria-label={`${lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}: ${lang === 'bn' ? statusLabel.bn : statusLabel.en}`}
                    >
                      <FieldStatusIcon className="h-4 w-4" aria-hidden="true" />
                      <span>{lang === 'bn' ? statusLabel.bn : statusLabel.en}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                    <div className="min-w-0 min-h-[92px] rounded-xl border border-emerald-100 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50/90 to-white dark:from-emerald-950/45 dark:to-gray-900/60 p-3 sm:p-3.5 transition-all duration-300">
                      <span className="block text-xs sm:text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">{lang === 'bn' ? 'আবেদনে দেওয়া তথ্য' : 'Submitted value'}</span>
                      <span className="mt-1.5 block break-words text-[15px] sm:text-base font-semibold leading-relaxed text-gray-900 dark:text-gray-100">{submittedValue}</span>
                    </div>
                    <div className={`min-w-0 min-h-[92px] rounded-xl border p-3 sm:p-3.5 transition-all duration-300 ${fieldStatus === 'UNAVAILABLE' || fieldStatus === 'NOT_PROVIDED' ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50' : 'border-sky-100 dark:border-sky-900/60 bg-gradient-to-br from-sky-50/70 to-white dark:from-sky-950/30 dark:to-gray-900/60'}`}>
                      <span className="block text-xs sm:text-[13px] font-semibold text-sky-800 dark:text-sky-300">{lang === 'bn' ? 'ডেটাবেজে থাকা মান' : 'Database value'}</span>
                      <span className="mt-1.5 block break-words text-[15px] sm:text-base font-semibold leading-relaxed text-gray-900 dark:text-gray-100">{recordedValue}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-gray-100 dark:border-gray-800 pt-2">
                    <p className="min-w-0 text-xs text-gray-500 break-words">
                      {lang === 'bn' ? field.source_bn : field.source_en}
                    </p>
                    {field.evidence_ref && <span className="min-w-0 max-w-full font-mono text-[10px] sm:text-[11px] text-gray-500 break-all">{field.evidence_ref}</span>}
                  </div>
                  {field.similarity_score !== null && field.similarity_score !== undefined && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {lang === 'bn' ? 'সাদৃশ্য' : 'Similarity'}: <strong className="tabular-nums">{field.similarity_score}%</strong>
                    </p>
                  )}
                  {(field.message_bn || field.message_en) && (
                    <p className="text-xs sm:text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                      {lang === 'bn' ? field.message_bn : field.message_en}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {/* Database comparison warnings */}
        {discrepancies.length > 0 && (
          <div className="space-y-3 p-4 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
            <h4 className="font-bold text-xs text-rose-900 dark:text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>{lang === 'bn' ? 'শনাক্তকৃত গরমিল ও পর্যালোচনার বিষয়:' : 'Inconsistencies and Items for Review:'}</span>
            </h4>
            <div className="space-y-2">
              {discrepancies.map((d, i) => (
                <div key={i} className="text-xs p-2.5 rounded bg-white dark:bg-[#15201b] border border-rose-200 dark:border-rose-900/40 space-y-1">
                  <div className="flex items-center justify-between">
                    <strong className="text-rose-800 dark:text-rose-300">
                      {lang === 'bn' ? d.field : d.field_en}
                    </strong>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {lang === 'bn' ? 'উৎস:' : 'Source:'} {d.source}
                    </span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 leading-snug">
                    {lang === 'bn' ? d.message_bn : d.message_en}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Report reference QR */}
        <div className="pt-6 border-t-2 border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-6">
          {/* QR Code */}
          <div className="flex items-center gap-4">
            <QRCodeCanvas
              value={[
                'BHUMISETU — Preliminary Deed Record Comparison',
                `Reference: ${verification_ref || 'N/A'}`,
                `Deed: ${safeSubmittedSummary.deed_no || extracted_summary.deed_no || 'N/A'} (${safeSubmittedSummary.reg_year || extracted_summary.reg_year || 'N/A'})`,
                `Status: ${statusConfig.label}`,
                `Application deed record: ${hasDeedRecord ? 'FOUND' : 'NOT FOUND'}`,
                `Score: ${hasMatchScore ? `${numericMatchScore}%` : 'N/A'}`,
                `Source: ${hasDeedRecord || hasPropertyRecord ? 'Application database records' : 'No matching application record'}`,
                `Report link: ${typeof window !== 'undefined' ? window.location.origin : ''}/#/verification-result?ref=${encodeURIComponent(verification_ref || '')}`,
              ].join('\n')}
              size={100}
              label={verification_ref}
              lang={lang}
              title={lang === 'bn' ? 'যাচাই রিপোর্ট রেফারেন্স কিউআর' : 'Verification Report Reference QR'}
            />
            <div className="space-y-1 text-xs">
              <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-[#0b462d] dark:text-emerald-400" />
                {lang === 'bn' ? 'রিপোর্ট রেফারেন্স কিউআর' : 'Report Reference QR'}
              </span>
              <p className="text-[11px] text-gray-500 max-w-xs leading-tight">
                {lang === 'bn'
                  ? 'এটি সংরক্ষিত রিপোর্টের রেফারেন্স। এটি সরকারি মালিকানা বা দলিলের সত্যতা সনদ নয়।'
                  : 'This points to the saved report. It is not an official deed or ownership certificate.'}
              </p>
              <span className="text-[10px] text-[#c59b27] font-semibold block">
                {lang === 'bn' ? 'ক্লিক করে বড় করুন, লিংক কপি বা কিউআর কোড ডাউনলোড করুন।' : 'Click to enlarge, copy link, or download QR image.'}
              </span>
            </div>
          </div>

          {/* Non-official application record marker */}
          <div className="w-28 h-28 rounded-full border-2 border-dashed border-slate-400 dark:border-slate-600 p-1 flex items-center justify-center text-center rotate-6 select-none opacity-80">
            <div className="w-full h-full rounded-full border border-slate-400 dark:border-slate-600 flex flex-col items-center justify-center text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase leading-tight">
              <span>BHUMISETU</span>
              <span>{lang === 'bn' ? 'অ্যাপ ডেটা' : 'APP DATA'}</span>
              <span>{hasDeedRecord ? (lang === 'bn' ? 'রেকর্ড আছে' : 'RECORD FOUND') : (lang === 'bn' ? 'রেকর্ড নেই' : 'NOT FOUND')}</span>
              <span>{(verification_ref || 'BS-VR-2026').split('-').pop()}</span>
            </div>
          </div>
        </div>

        {/* Legal Disclaimer Box */}
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
          <strong>{lang === 'bn' ? 'আইনি সতর্কতা:' : 'Legal Notice:'}</strong>{' '}
          {lang === 'bn' ? disclaimer_bn : disclaimer_en}{' '}
          {lang === 'bn'
            ? 'ডেমো ডেটাবেজে তথ্যের মিল থাকা মানেই চূড়ান্ত আইনি স্বত্ব প্রতিষ্ঠিত হওয়া নয়। যেকোনো ক্রয় বা বায়নার আগে সাব-রেজিস্ট্রি অফিসে বিগত ২৫ বছরের তল্লাশ সম্পন্ন করতে হবে।'
            : 'A matching record in the demonstration database does not prove conclusive legal ownership.'}
        </div>
      </div>

      {/* Bottom Sticky-style Action Bar */}
      <div className="gov-card p-4 flex flex-wrap items-center justify-between gap-4 no-print border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 shadow-md">
        <Button
          onClick={() => setActiveTab('deed-verify')}
          className="gov-btn-primary text-xs py-2.5 px-5 flex items-center gap-2 font-bold shadow hover:scale-[1.02] transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === 'bn' ? '← পূর্ববর্তী পেজে ফিরে যান (নতুন দলিল যাচাই)' : '← Back to Verify Another Deed'}</span>
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setActiveTab('mutation')}
            className="gov-btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 font-semibold"
          >
            <span>{lang === 'bn' ? 'ই-নামজারি আবেদন করুন' : 'Apply for E-Namjari'}</span>
          </Button>
          <Button
            onClick={() => setActiveTab('due-diligence')}
            className="gov-btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 font-semibold"
          >
            <span>{lang === 'bn' ? 'স্বত্ব ও ঝুঁকি যাচাই' : 'Due Diligence Check'}</span>
          </Button>
          <Button
            onClick={handlePrint}
            className="gov-btn-gold text-xs py-2 px-4 flex items-center gap-1.5 font-bold shadow"
          >
            <Printer className="w-4 h-4" />
            <span>{lang === 'bn' ? 'রিপোর্ট প্রিন্ট / সংরক্ষণ' : 'Print Report'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
