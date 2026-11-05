import Button from '../components/Button';
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import QRCodeCanvas from '../components/QRCodeCanvas';
import {
  AlertOctagon, Printer, ArrowLeft, ShieldAlert, CheckCircle2, ShieldCheck,
  AlertTriangle, FileText, Info, HelpCircle, Home
} from 'lucide-react';
import { classifyRiskFromMatch, formatPercent } from '../utils/verificationChartData';

const LOCATION_FIELDS = new Set(['division', 'district', 'upazila', 'mouza', 'union_ward']);
const RISK_SCORE_RADIUS = 44;
const RISK_SCORE_CIRCUMFERENCE = 2 * Math.PI * RISK_SCORE_RADIUS;

const MATCH_RISK_PRESENTATIONS = {
  NO_RISK: {
    color: '#0F9D78', label_bn: 'কোনো ঝুঁকি নেই', label_en: 'No Risk',
    status_bn: 'সব মূল্যায়নযোগ্য ফিল্ডে পূর্ণ মিল আছে।',
    status_en: 'All evaluated fields match.',
    Icon: ShieldCheck,
  },
  LOW_RISK: {
    color: '#2878B5', label_bn: 'কম ঝুঁকি', label_en: 'Low Risk',
    status_bn: 'অধিকাংশ মূল্যায়নযোগ্য তথ্য মিলেছে; কিছু অমিল বা আংশিক মিল আছে।',
    status_en: 'Most eligible fields match; some mismatches or partial matches remain.',
    Icon: Info,
  },
  LOW_MEDIUM_RISK: {
    color: '#5B8DB8', label_bn: 'নিম্ন-মাঝারি ঝুঁকি', label_en: 'Low-Medium Risk',
    status_bn: 'তথ্যের একটি অংশ আংশিক মিলেছে বা মেলেনি।',
    status_en: 'A portion of the evaluated information is partial or mismatched.',
    Icon: Info,
  },
  MEDIUM_RISK: {
    color: '#D98A35', label_bn: 'মাঝারি ঝুঁকি', label_en: 'Medium Risk',
    status_bn: 'মূল্যায়নযোগ্য তথ্যে উল্লেখযোগ্য অমিল আছে।',
    status_en: 'There are notable mismatches in the evaluated information.',
    Icon: AlertTriangle,
  },
  HIGH_MEDIUM_RISK: {
    color: '#E47732', label_bn: 'উচ্চ-মাঝারি ঝুঁকি', label_en: 'High-Medium Risk',
    status_bn: 'মূল্যায়নযোগ্য তথ্যে বড় অংশের অমিল বা আংশিক মিল আছে।',
    status_en: 'A substantial share of evaluated information is partial or mismatched.',
    Icon: AlertOctagon,
  },
  HIGH_RISK: {
    color: '#D9485F', label_bn: 'উচ্চ ঝুঁকি', label_en: 'High Risk',
    status_bn: 'প্রদত্ত তথ্যের সঙ্গে ডেটাবেজের অনেক তথ্য মেলেনি।',
    status_en: 'Many evaluated fields do not match the application record.',
    Icon: AlertOctagon,
  },
  EXTREME_RISK: {
    color: '#B42336', label_bn: 'চরম ঝুঁকি', label_en: 'Extreme Risk',
    status_bn: 'প্রদত্ত তথ্যের সঙ্গে ডেটাবেজের অধিকাংশ তথ্য মেলেনি।',
    status_en: 'Most evaluated fields do not match the application record.',
    Icon: AlertOctagon,
  },
};

function normalizeComparison(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function getVerificationRiskSummary(verificationResult, targetPlot) {
  if (!verificationResult) return { available: false, reason: 'missing' };

  const extracted = verificationResult.extracted_summary && typeof verificationResult.extracted_summary === 'object'
    ? verificationResult.extracted_summary
    : {};
  const submitted = verificationResult.submitted_summary && typeof verificationResult.submitted_summary === 'object'
    ? verificationResult.submitted_summary
    : {};
  const sourcePlot = submitted.plot_id || submitted.plot_no || verificationResult.plot_id || verificationResult.plot_no;
  if (!sourcePlot || normalizeComparison(sourcePlot) !== normalizeComparison(targetPlot)) {
    return { available: false, reason: 'different_plot' };
  }
  if (!(verificationResult.record_found ?? extracted.record_found)) {
    return { available: false, reason: 'record_missing' };
  }

  const checks = Array.isArray(verificationResult.field_checks)
    ? verificationResult.field_checks
    : Array.isArray(extracted.verification_fields) ? extracted.verification_fields : [];
  if (!checks.length) return { available: false, reason: 'fields_missing' };

  const rows = checks.filter((field) => field && field.key !== 'property_status' && !field.reference_only);
  let matched = 0;
  let partial = 0;
  let mismatched = 0;
  for (const field of rows) {
    let status = field.status;
    const hasLocationIds = field.submitted_location_id !== null
      && field.submitted_location_id !== undefined
      && field.recorded_location_id !== null
      && field.recorded_location_id !== undefined;
    if (LOCATION_FIELDS.has(field.key) && status === 'MISMATCH' && !hasLocationIds) status = 'UNAVAILABLE';

    if (!['MATCHED', 'PARTIAL_MATCH', 'MISMATCH', 'UNAVAILABLE', 'NOT_PROVIDED', 'AVAILABLE', 'PENDING'].includes(status)) {
      if (field.optional && !field.submitted) status = 'NOT_PROVIDED';
      else if (field.key === 'deed_type' && field.submitted_names?.code && field.recorded_names?.code) {
        status = field.submitted_names.code === field.recorded_names.code ? 'MATCHED' : 'MISMATCH';
      }
      else if (!field.available || field.recorded === null || field.recorded === undefined || field.recorded === '') status = 'UNAVAILABLE';
      else if (field.reference_only) status = 'AVAILABLE';
      else if (!field.submitted) status = 'NOT_PROVIDED';
      else if (LOCATION_FIELDS.has(field.key)) {
        status = !hasLocationIds
          ? 'UNAVAILABLE'
          : String(field.submitted_location_id) === String(field.recorded_location_id) ? 'MATCHED' : 'MISMATCH';
      } else {
        status = normalizeComparison(field.submitted) === normalizeComparison(field.recorded) ? 'MATCHED' : 'MISMATCH';
      }
    }

    if (field.optional && status === 'NOT_PROVIDED') continue;
    if (status === 'MATCHED') matched += 1;
    else if (status === 'PARTIAL_MATCH') partial += 1;
    else if (status === 'MISMATCH') mismatched += 1;
  }

  const eligibleCount = matched + partial + mismatched;
  const percentage = eligibleCount > 0 ? ((matched + partial * 0.5) / eligibleCount) * 100 : null;
  const classification = classifyRiskFromMatch(percentage);
  return {
    available: Boolean(classification),
    matched,
    partial,
    mismatched,
    eligibleCount,
    percentage,
    classification,
    presentation: MATCH_RISK_PRESENTATIONS[classification],
  };
}

export default function DueDiligenceReport({ result, verificationResult, setActiveTab, navigateBack }) {
  const { lang, t } = useApp();
  const [riskChartReady, setRiskChartReady] = useState(false);
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    setRiskChartReady(false);
    if (!result) return undefined;
    if (prefersReducedMotion) {
      setRiskChartReady(true);
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => setRiskChartReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [result?.report_ref, result?.risk_score, prefersReducedMotion]);

  if (!result) {
    return (
      <div className="gov-container py-16 text-center space-y-4">
        <p className="text-sm text-gray-500">
          {lang === 'bn' ? 'কোনো ঝুঁকি রিপোর্ট পাওয়া যায়নি। অনুগ্রহ করে পূর্বে যাচাই সম্পন্ন করুন।' : 'No assessment report found. Please run a due diligence check.'}
        </p>
        <Button
          onClick={() => navigateBack ? navigateBack('due-diligence') : setActiveTab('due-diligence')}
          className="gov-btn-primary text-xs"
        >
          {lang === 'bn' ? 'যাচাই ফরম খুলুন' : 'Open Due Diligence Form'}
        </Button>
      </div>
    );
  }

  const {
    report_ref,
    plot_no,
    mouza,
    district,
    seller_name,
    recorded_owner,
    recorded_area,
    proposed_area,
    risk_score,
    risk_level,
    indicators = [],
    evidence = [],
    recommendations = [],
    created_at,
    disclaimer_bn,
    disclaimer_en
  } = result;

  const levelStyles = {
    low: {
      label: lang === 'bn' ? 'নিম্ন ঝুঁকি (Low Risk)' : 'Low Risk',
      color: 'text-emerald-700 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
      badge: 'bg-emerald-600 text-white',
      icon: CheckCircle2
    },
    medium: {
      label: lang === 'bn' ? 'মাঝারি ঝুঁকি (Medium Risk)' : 'Medium Risk',
      color: 'text-amber-700 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
      badge: 'bg-amber-600 text-white',
      icon: AlertTriangle
    },
    high: {
      label: lang === 'bn' ? 'উচ্চ ঝুঁকি (High Risk)' : 'High Risk',
      color: 'text-rose-700 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
      badge: 'bg-rose-600 text-white',
      icon: ShieldAlert
    },
    insufficient_data: {
      label: lang === 'bn' ? 'অপর্যাপ্ত তথ্য (Insufficient Data)' : 'Insufficient Data',
      color: 'text-slate-700 dark:text-slate-400',
      bg: 'bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-800',
      badge: 'bg-slate-600 text-white',
      icon: AlertOctagon
    }
  }[risk_level] || {
    label: risk_level,
    color: 'text-gray-700',
    bg: 'bg-gray-50 border-gray-300',
    badge: 'bg-gray-600 text-white',
    icon: Info
  };

  const LevelIcon = levelStyles.icon;
  const parsedRiskScore = risk_score === null || risk_score === undefined || risk_score === ''
    ? null
    : Number(risk_score);
  const riskScoreValue = Number.isFinite(parsedRiskScore)
    ? Math.max(0, Math.min(100, parsedRiskScore))
    : null;
  const riskScoreOffset = riskScoreValue === null
    ? RISK_SCORE_CIRCUMFERENCE
    : RISK_SCORE_CIRCUMFERENCE * (1 - riskScoreValue / 100);
  const indicatorList = Array.isArray(indicators) ? indicators : [];
  const severityCategories = [
    { key: 'high', color: '#D9485F', label: lang === 'bn' ? 'উচ্চ' : 'High' },
    { key: 'medium', color: '#D98A35', label: lang === 'bn' ? 'মাঝারি' : 'Medium' },
    { key: 'low', color: '#6B95D6', label: lang === 'bn' ? 'কম' : 'Low' },
    { key: 'other', color: '#94A3B8', label: lang === 'bn' ? 'অন্যান্য' : 'Other' },
  ].map((category) => ({
    ...category,
    count: category.key === 'other'
      ? indicatorList.filter((indicator) => !['high', 'medium', 'low'].includes(String(indicator?.severity || '').toLowerCase())).length
      : indicatorList.filter((indicator) => String(indicator?.severity || '').toLowerCase() === category.key).length,
  }));
  const indicatorTotal = severityCategories.reduce((sum, category) => sum + category.count, 0);
  const matchRisk = getVerificationRiskSummary(verificationResult, plot_no);
  const MatchRiskIcon = matchRisk.presentation?.Icon || Info;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="gov-container py-8 space-y-6 max-w-4xl">
      {/* Top Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print bg-white dark:bg-gray-800/80 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigateBack ? navigateBack('due-diligence') : setActiveTab('due-diligence')}
            className="gov-btn-primary text-xs py-2 px-4 flex items-center gap-2 font-bold shadow hover:scale-[1.02] transition-transform"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{lang === 'bn' ? '← প্রাক-ক্রয় স্বত্ব যাচাই ফরম-এ ফিরে যান' : '← Back to Due Diligence Form'}</span>
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
          <span>{lang === 'bn' ? 'রিপোর্ট প্রিন্ট / সংরক্ষণ' : 'Print / Download Report'}</span>
        </Button>
      </div>

      {/* Printable Report Box */}
      <div className="gov-card p-6 sm:p-8 space-y-6 printable-area bg-white dark:bg-[#121a16] border-2 border-[#047857]">
        {/* Report Header */}
        <div className="text-center border-b-2 border-[#047857] pb-6 space-y-1.5">
          <div className="text-xs uppercase tracking-widest text-[#047857] dark:text-emerald-400 font-bold">
            {t('govBangladesh')}
          </div>
          <div className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
            {lang === 'bn' ? 'জমি ক্রয়ের প্রাক-মূল্যায়ন ডিউ ডিলিজেন্স রিপোর্ট' : 'Pre-Purchase Land Due Diligence & Risk Report'}
          </div>
          <div className="text-xs text-gray-500 font-medium">
            {lang === 'bn' ? 'ভূমিসেতু (Bhumisetu) স্বত্ব ঝুঁকি স্ক্রীনিং ব্যবস্থা | P5 মডিউল' : 'Bhumisetu AI Title Risk Engine | P5 Module'}
          </div>

          <div className="flex flex-wrap items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span>
              <strong>{lang === 'bn' ? 'রিপোর্ট রেফারেন্স:' : 'Report Reference:'}</strong>{' '}
              <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">{report_ref}</span>
            </span>
            <span>
              <strong>{lang === 'bn' ? 'বিশ্লেষণের সময়:' : 'Generated At:'}</strong>{' '}
              {new Date(created_at).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}
            </span>
          </div>
        </div>

        {/* Risk Cards: due diligence score and the moved deed-match risk */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className={`p-5 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${levelStyles.bg}`}>
            <div className="flex items-center gap-3">
              <LevelIcon className={`w-10 h-10 ${levelStyles.color} flex-shrink-0`} />
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">
                  {lang === 'bn' ? 'সার্বিক ঝুঁকি মাত্রা (Overall Preliminary Risk)' : 'Overall Preliminary Risk'}
                </div>
                <div className={`text-lg sm:text-xl font-black ${levelStyles.color}`}>
                  {levelStyles.label}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white dark:bg-[#18231e] px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="text-right">
                <span className="text-[11px] text-gray-500 block leading-tight">
                  {lang === 'bn' ? 'ঝুঁকি স্কোর (Risk Score)' : 'Risk Score'}
                </span>
                <span className="text-[10px] text-gray-400">সর্বোচ্চ ১০০</span>
              </div>
              <div className={`text-2xl font-black ${levelStyles.color}`}>
                {risk_score}/100
              </div>
            </div>
          </div>

          <article
            className="rounded-xl border border-l-4 bg-white p-5 shadow-sm dark:bg-gray-900/60 motion-safe:transition-all motion-safe:duration-300"
            style={{ borderColor: `${matchRisk.presentation?.color || '#64748B'}66`, borderLeftColor: matchRisk.presentation?.color || '#64748B' }}
            aria-label={lang === 'bn' ? 'দলিলের মিলভিত্তিক ঝুঁকি' : 'Deed match-based risk'}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ color: matchRisk.presentation?.color || '#64748B', backgroundColor: `${matchRisk.presentation?.color || '#64748B'}18` }}
                >
                  <MatchRiskIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {lang === 'bn' ? 'দলিল যাচাইয়ের ঝুঁকি' : 'Deed Verification Risk'}
                  </span>
                  <span
                    className="mt-1 inline-flex max-w-full items-center rounded-full border px-3 py-1 text-sm font-bold"
                    style={{ color: matchRisk.presentation?.color || '#64748B', borderColor: `${matchRisk.presentation?.color || '#64748B'}55`, backgroundColor: `${matchRisk.presentation?.color || '#64748B'}12` }}
                  >
                    {matchRisk.available
                      ? (lang === 'bn' ? matchRisk.presentation.label_bn : matchRisk.presentation.label_en)
                      : (lang === 'bn' ? 'ঝুঁকি মূল্যায়ন অনুপলব্ধ' : 'Risk Assessment Unavailable')}
                  </span>
                </div>
              </div>
              <div className="shrink-0 sm:text-right">
                <strong className="block text-3xl font-black leading-none tabular-nums text-slate-900 dark:text-white">
                  {formatPercent(matchRisk.percentage, lang)}
                </strong>
                <span className="mt-1 block text-[10px] font-medium text-slate-500">
                  {lang === 'bn' ? 'সার্বিক মিল' : 'Overall Match'}
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {matchRisk.available
                ? (lang === 'bn' ? matchRisk.presentation.status_bn : matchRisk.presentation.status_en)
                : (matchRisk.reason === 'record_missing'
                  ? (lang === 'bn' ? 'এই দাগের যাচাইয়ে কোনো দলিল রেকর্ড পাওয়া যায়নি; তাই মিলভিত্তিক ঝুঁকি নির্ধারণ করা যায়নি।' : 'No deed record was found for this parcel verification, so a match-based risk level is unavailable.')
                  : matchRisk.reason === 'different_plot'
                    ? (lang === 'bn' ? 'সর্বশেষ দলিল যাচাইটি এই রিপোর্টের দাগ নম্বরের জন্য নয়। একই দাগের দলিল যাচাই করলে এখানে ফল দেখাবে।' : 'The latest deed verification is for a different parcel. Verify this parcel to show its match-based result here.')
                    : (lang === 'bn' ? 'এই দাগের জন্য দলিল যাচাইয়ের ফল নেই; একই দাগের দলিল যাচাই করলে এখানে ফল দেখাবে।' : 'No deed verification is available for this parcel. Verify its deed to show the match-based result here.'))}
            </p>
            {matchRisk.available && (
              <p className="mt-2 text-[10px] text-slate-500">
                {lang === 'bn'
                  ? `মিলেছে ${matchRisk.matched}, আংশিক ${matchRisk.partial}, অমিল ${matchRisk.mismatched} · ${matchRisk.eligibleCount}টি মূল্যায়নযোগ্য ফিল্ড`
                  : `Matched ${matchRisk.matched}, partial ${matchRisk.partial}, mismatched ${matchRisk.mismatched} · ${matchRisk.eligibleCount} eligible fields`}
              </p>
            )}
          </article>
        </div>

        {/* Parcel Profile Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div>
            <span className="text-gray-500 block">{lang === 'bn' ? 'প্রস্তাবিত বিক্রেতা' : 'Seller'}</span>
            <strong className="text-gray-900 dark:text-white">{seller_name}</strong>
          </div>
          <div>
            <span className="text-gray-500 block">{lang === 'bn' ? 'রেকর্ডীয় বর্তমান মালিক' : 'Recorded Owner'}</span>
            <strong className="text-emerald-700 dark:text-emerald-400">{recorded_owner}</strong>
          </div>
          <div>
            <span className="text-gray-500 block">{t('plotNo')} / {t('mouza')}</span>
            <span className="font-mono font-bold">{plot_no}</span> ({mouza})
          </div>
          <div>
            <span className="text-gray-500 block">{lang === 'bn' ? 'প্রস্তাবিত জমি' : 'Proposed Area'}</span>
            <strong>{proposed_area} শতক</strong> {recorded_area ? `(রেকর্ড: ${recorded_area} শতক)` : ''}
          </div>
        </div>

        {/* Animated risk score and evidence severity chart */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900/50" aria-labelledby="dd-risk-chart-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="dd-risk-chart-title" className="text-sm font-bold text-gray-900 dark:text-white">
                {lang === 'bn' ? 'ঝুঁকি স্কোর ও সূচকের চার্ট' : 'Risk Score & Indicator Chart'}
              </h3>
              <p className="mt-1 text-[10px] text-gray-500">
                {lang === 'bn' ? 'রিংটি backend ঝুঁকি স্কোর / ১০০ এবং বারটি রিপোর্টের সূচকগুলোর severity দেখায়।' : 'The ring shows the backend risk score out of 100; the bar shows indicator severity counts from this report.'}
              </p>
            </div>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] text-gray-500 dark:border-gray-700 dark:bg-gray-800">
              {indicatorList.length} {lang === 'bn' ? 'টি সূচক' : 'indicators'}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-[150px_1fr] items-center gap-5">
            <div className="mx-auto w-36" role="img" aria-label={lang === 'bn' ? `ঝুঁকি স্কোর ${riskScoreValue ?? 'অনুপলব্ধ'} / ১০০` : `Risk score ${riskScoreValue ?? 'unavailable'} out of 100`}>
              <svg viewBox="0 0 112 112" className="w-full overflow-visible">
                <circle cx="56" cy="56" r={RISK_SCORE_RADIUS} fill="none" stroke="#E2E8F0" strokeWidth="10" className="dark:stroke-gray-700" />
                {riskScoreValue !== null && (
                  <circle
                    cx="56"
                    cy="56"
                    r={RISK_SCORE_RADIUS}
                    fill="none"
                    stroke={risk_level === 'high' ? '#D9485F' : risk_level === 'medium' ? '#D98A35' : risk_level === 'low' ? '#6B95D6' : '#94A3B8'}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={RISK_SCORE_CIRCUMFERENCE}
                    strokeDashoffset={riskChartReady ? riskScoreOffset : RISK_SCORE_CIRCUMFERENCE}
                    transform="rotate(-90 56 56)"
                    style={{ transition: prefersReducedMotion ? 'none' : 'stroke-dashoffset 1000ms cubic-bezier(0.22, 1, 0.36, 1)' }}
                  />
                )}
                <text x="56" y="53" textAnchor="middle" className="fill-slate-900 text-[22px] font-black dark:fill-white">
                  {riskScoreValue ?? '—'}
                </text>
                <text x="56" y="69" textAnchor="middle" className="fill-slate-500 text-[9px] font-semibold">
                  {lang === 'bn' ? '/ ১০০' : '/ 100'}
                </text>
              </svg>
            </div>

            <div className="min-w-0 space-y-3">
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800" role="img" aria-label={lang === 'bn' ? 'ঝুঁকি সূচকের severity বণ্টন' : 'Risk indicator severity distribution'}>
                <div className="flex h-full w-full">
                  {severityCategories.filter((category) => category.count > 0).map((category) => (
                    <span
                      key={category.key}
                      className="h-full motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-out motion-reduce:transition-none"
                      style={{
                        width: `${riskChartReady && indicatorTotal ? (category.count / indicatorTotal) * 100 : 0}%`,
                        backgroundColor: category.color,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {severityCategories.map((category) => (
                  <div key={category.key} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex min-w-0 items-center gap-2 text-gray-600 dark:text-gray-300">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                      <span className="truncate">{category.label}</span>
                    </span>
                    <strong className="tabular-nums text-gray-900 dark:text-white">
                      {category.count}{indicatorTotal ? ` · ${formatPercent((category.count / indicatorTotal) * 100, lang)}` : ` · ${formatPercent(0, lang)}`}
                    </strong>
                  </div>
                ))}
              </div>
              {indicatorTotal === 0 && (
                <p className="text-[10px] text-gray-500">
                  {lang === 'bn' ? 'এই রিপোর্টে কোনো ঝুঁকি সূচক রেকর্ড হয়নি।' : 'No risk indicators were recorded in this report.'}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Individual Risk Indicators with Transparent Scoring */}
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
            <span className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-600" />
              <span>{lang === 'bn' ? 'শনাক্তকৃত স্বতন্ত্র ঝুঁকি সূচক ও কারণ (Scored Evidence)' : 'Individual Risk Indicators & Rule Breakdown'}</span>
            </span>
            <span className="text-xs text-gray-500">
              {indicators.length} {lang === 'bn' ? 'টি সূচক চিহ্নিত' : 'indicators raised'}
            </span>
          </h3>

          {indicators.length === 0 ? (
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                {lang === 'bn'
                  ? 'কোনো সরাসরি গরমিল বা দ্বন্দ্ব রেকর্ড চিহ্নিত হয়নি। তবে এটি সম্পূর্ণ নিষ্কণ্টকতার নিশ্চয়তা দেয় না।'
                  : 'No direct title conflicts were detected in synthetic records. However, physical inspection remains essential.'}
              </span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {indicators.map((ind, i) => (
                <div
                  key={i}
                  className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                    ind.severity === 'high'
                      ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
                      : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${ind.severity === 'high' ? 'bg-rose-600' : 'bg-amber-600'}`}></span>
                      {lang === 'bn' ? ind.title_bn : ind.title_en}
                    </span>
                    <span className="font-mono font-bold text-rose-700 dark:text-rose-400 bg-white dark:bg-gray-900 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-800 text-[11px]">
                      +{ind.points} pts
                    </span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {lang === 'bn' ? ind.explanation_bn : ind.explanation_en}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Evidence Traces */}
        {evidence.length > 0 && (
          <div className="space-y-2 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 text-xs">
            <span className="font-bold text-gray-800 dark:text-gray-200 block">
              {lang === 'bn' ? 'সংশ্লিষ্ট বালাম ও ডেটাবেজ প্রমাণক সূত্র:' : 'Referenced Records & Evidence Traces:'}
            </span>
            <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300">
              {evidence.map((ev, i) => (
                <li key={i}>{ev}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 5 Crucial Actionable Recommendations before purchase */}
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
            <CheckCircle2 className="w-4 h-4 text-[#0b462d] dark:text-emerald-400" />
            <span>{lang === 'bn' ? 'জমি কেনার পূর্বে ৫টি জরুরি করণীয় (Pre-Purchase Checklist)' : '5 Crucial Pre-Purchase Verification Steps'}</span>
          </h3>

          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs text-gray-700 dark:text-gray-300">
                <span className="w-5 h-5 rounded-full bg-[#0b462d] text-[#ffd700] text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{typeof rec === 'string' ? rec : (lang === 'bn' ? (rec.bn || rec.en) : (rec.en || rec.bn))}</span>
              </div>
            ))}
          </div>
        </div>

        {/* QR & Verification Reference */}
        <div className="pt-6 border-t-2 border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <QRCodeCanvas
              value={`[ভূমিসাথী — নাগরিক প্রাক-ক্রয় স্বত্ব যাচাই / Due Diligence]\nরিপোর্ট রেফারেন্স: ${report_ref || '—'}\nঝুঁকি মূল্যায়ন স্তর: ${risk_level || '—'}\nমোট ঝুঁকি স্কোর: ${risk_score ?? '—'}/100\nশনাক্তকৃত ঝুঁকি সূচক: ${Array.isArray(indicators) ? indicators.length : '—'} টি\nমডেল: Isolation Forest risk screening\nযাচাই লিংক: ${typeof window !== 'undefined' ? window.location.origin : ''}/#due-diligence/${report_ref || ''}`}
              size={100}
              label={report_ref}
              lang={lang}
              title={lang === 'bn' ? 'ডিউ ডিলিজেন্স যাচাই সনদ কিউআর' : 'Due Diligence QR Certificate'}
            />
            <div className="space-y-1 text-xs">
              <span className="font-bold text-gray-900 dark:text-white block">
                {lang === 'bn' ? 'ডিজিটাল ডিউ ডিলিজেন্স কিউআর' : 'Due Diligence Validation QR'}
              </span>
              <p className="text-[11px] text-gray-500 max-w-xs leading-tight">
                {lang === 'bn'
                  ? 'এই কিউআর কোড স্ক্যান করে প্ল্যাটফর্মে সংরক্ষিত ঝুঁকি মূল্যায়ন রেফারেন্স যাচাই করা যাবে।'
                  : 'Scan to verify server-side risk assessment records on Bhumisetu.'}
              </p>
              <span className="text-[10px] text-[#F5B544] font-semibold block">
                {lang === 'bn' ? 'ক্লিক করে বড় করুন, লিংক কপি বা কিউআর কোড ডাউনলোড করুন।' : 'Click to enlarge, copy link, or download QR image.'}
              </span>
            </div>
          </div>

          <div className="text-right text-xs space-y-1">
            <div className="font-bold text-gray-900 dark:text-white">
              {lang === 'bn' ? 'ভূমিসেতু এআই নিরাপত্তা সেল' : 'Bhumisetu AI Security Cell'}
            </div>
            <div className="text-[11px] text-gray-500 font-mono">
              ALG-VER: 2026.P5.ML-IF
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="p-3.5 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
          <strong className="text-gray-700 dark:text-gray-300 block mb-0.5">
            {lang === 'bn' ? 'আইনি ও স্বচ্ছতা ডিসক্লেইমার:' : 'Legal & Transparency Disclaimer:'}
          </strong>
          {lang === 'bn' ? disclaimer_bn : disclaimer_en}{' '}
          {lang === 'bn'
            ? 'কোনো গরমিল শনাক্ত না হওয়ার অর্থ এই নয় যে জমিটি আইনিভাবে সম্পূর্ণ নিরাপদ। এটি প্রাথমিক স্ক্রীনিং ব্যবস্থা এবং কোনোভাবেই সাব-রেজিস্ট্রি বা ভূমি অফিসের আইনি দায়িত্ব বহন করে না।'
            : 'Absence of detected anomalies does not certify legal safety. Always consult qualified property attorneys and verify ground possession.'}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="gov-card p-4 flex flex-wrap items-center justify-between gap-4 no-print border-2 border-amber-600/30 bg-amber-50/40 dark:bg-amber-950/20 shadow-md">
        <Button
          onClick={() => setActiveTab('due-diligence')}
          className="gov-btn-primary text-xs py-2.5 px-5 flex items-center gap-2 font-bold shadow hover:scale-[1.02] transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === 'bn' ? '← পূর্ববর্তী পেজে ফিরে যান (নতুন জমি যাচাই)' : '← Back to Due Diligence Form'}</span>
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setActiveTab('deed-verify')}
            className="gov-btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 font-semibold"
          >
            <span>{lang === 'bn' ? 'দলিল ক্রস-চেক করুন' : 'Verify Deed'}</span>
          </Button>
          <Button
            onClick={() => setActiveTab('dashboard')}
            className="gov-btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 font-semibold"
          >
            <span>{lang === 'bn' ? 'ড্যাশবোর্ডে ফিরে যান' : 'Go to Dashboard'}</span>
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
