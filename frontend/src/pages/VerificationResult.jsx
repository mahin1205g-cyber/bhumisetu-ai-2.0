import React from 'react';
import { useApp } from '../context/AppContext';
import QRCodeCanvas from '../components/QRCodeCanvas';
import {
  FileCheck2, CheckCircle2, AlertTriangle, Printer,
  ArrowLeft, Home, Search, Info, QrCode, Cpu,
  FileX, RotateCcw, ClipboardList
} from 'lucide-react';

const hasValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== '';

const sameValue = (a, b) =>
  hasValue(a) && hasValue(b) &&
  String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

export default function VerificationResult({ result, setActiveTab, navigateBack }) {
  const { lang, t } = useApp();

  if (!result) {
    return (
      <div className="gov-container py-16 text-center space-y-4">
        <p className="text-sm text-gray-500">
          {lang === 'bn' ? 'কোনো ফলাফল পাওয়া যায়নি। অনুগ্রহ করে পুনরায় দলিল যাচাই করুন।' : 'No verification result found. Please submit a deed to verify.'}
        </p>
        <button
          onClick={() => navigateBack ? navigateBack('deed-verify') : setActiveTab('deed-verify')}
          className="gov-btn-primary text-xs"
        >
          {lang === 'bn' ? 'দলিল যাচাই ফরম' : 'Deed Verification Form'}
        </button>
      </div>
    );
  }

  const {
    verification_ref,
    result_status,
    match_score,
    discrepancies = [],
    extracted_summary = null,
    submitted_summary = null,
    created_at,
    disclaimer_bn,
    disclaimer_en
  } = result;

  const numericScore = Number(match_score);
  const hasScore = match_score !== null && match_score !== undefined && match_score !== '' && Number.isFinite(numericScore);

  const isRecordNotFound = result_status === 'RECORD_NOT_FOUND';
  const isLegacyInsufficient = result_status === 'INSUFFICIENT_DATA';

  const goToForm = () => {
    if (navigateBack) navigateBack('deed-verify');
    else setActiveTab('deed-verify');
  };

  const goToDashboard = () => {
    setActiveTab('dashboard');
  };

  if (isRecordNotFound || isLegacyInsufficient) {
    const steps = lang === 'bn'
      ? [
          'দলিল নম্বর ও নিবন্ধন সাল সঠিক আছে কি না যাচাই করুন।',
          'নম্বর সঠিক হলে মূল দলিলসহ সংশ্লিষ্ট সাব-রেজিস্ট্রি অফিসে যোগাযোগ করুন।',
          'প্রয়োজনে স্থানীয় ভূমি অফিসে রেকর্ড যাচাই করুন।'
        ]
      : [
          'Verify that the deed number and registration year are correct.',
          'If they are correct, contact the relevant Sub-Registry Office with the original deed.',
          'If needed, verify the record at your local land office.'
        ];

    return (
      <div className="gov-container py-8 max-w-3xl">
        <div className="gov-card overflow-hidden bg-white dark:bg-[#121a16] border border-emerald-200/80 dark:border-emerald-900/60 shadow-lg">
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-800 via-emerald-600 to-emerald-300" aria-hidden="true" />

          <div className="p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-2.5">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center">
                <FileX className="w-7 h-7 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              </div>
              <div className="text-[11px] uppercase tracking-widest font-bold text-emerald-700 dark:text-emerald-400">
                {t('govBangladesh')} • {lang === 'bn' ? 'ভূমিসেতু' : 'Bhumisetu'}
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
                {lang === 'bn' ? 'দলিলের রেকর্ড পাওয়া যায়নি' : 'Deed record not found'}
              </h1>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                {lang === 'bn'
                  ? 'আপনার দেওয়া দলিল নম্বরটি আমাদের ডেমো ডাটাবেজে খুঁজে পাওয়া যায়নি। তাই কোনো Match Score বা মালিকানা যাচাইয়ের ফলাফল দেখানো সম্ভব নয়।'
                  : 'The deed number you submitted could not be found in our demo database. Therefore, no match score or ownership verification result can be shown.'}
              </p>
            </div>

            {(verification_ref || created_at) && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40 px-3.5 py-2.5 text-[11px] text-gray-500 dark:text-gray-400">
                {verification_ref && (
                  <span>
                    <strong>{lang === 'bn' ? 'রেফারেন্স আইডি:' : 'Reference ID:'}</strong>{' '}
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{verification_ref}</span>
                  </span>
                )}
                {created_at && (
                  <span>
                    <strong>{lang === 'bn' ? 'তারিখ ও সময়:' : 'Generated at:'}</strong>{' '}
                    {new Date(created_at).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}
                  </span>
                )}
              </div>
            )}

            <section className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/30 p-4 sm:p-5 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-200">
                <ClipboardList className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span>{lang === 'bn' ? 'পরবর্তী করণীয়' : 'Next steps'}</span>
              </h2>
              <ol className="space-y-2.5">
                {steps.map((step, index) => (
                  <li key={index} className="flex items-start gap-2.5 text-xs sm:text-[13px] leading-relaxed text-emerald-900/90 dark:text-emerald-100/90">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-emerald-900/60 text-[11px] font-bold text-emerald-800 dark:text-emerald-200">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="flex items-start gap-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/40 p-3.5 text-[11px] sm:text-xs leading-relaxed text-gray-600 dark:text-gray-300">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <p>
                {lang === 'bn'
                  ? 'এটি ডেমো ডাটাবেজের ফলাফল। ডেমো ডাটাবেজে রেকর্ড না পাওয়া মানেই সরকারি রেকর্ডে দলিল নেই—এমন সিদ্ধান্ত নয়।'
                  : 'This is a result from the demo database. A missing record in the demo database does not mean the deed is absent from official records.'}
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-4 border-t border-gray-100 dark:border-gray-800 no-print">
              <button
                onClick={goToDashboard}
                className="gov-btn-secondary justify-center py-2.5 px-5 w-full sm:w-auto text-xs font-semibold"
              >
                <Home className="w-4 h-4" />
                <span>{lang === 'bn' ? 'ড্যাশবোর্ডে ফিরুন' : 'Return to dashboard'}</span>
              </button>
              <button
                onClick={goToForm}
                className="gov-btn-primary justify-center py-2.5 px-5 w-full sm:w-auto text-xs font-bold"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{lang === 'bn' ? 'আবার যাচাই করুন' : 'Verify again'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isMatch = result_status === 'MATCH';
  const registry = extracted_summary || {};
  const submitted = submitted_summary || {};
  const recordedOwner = registry.recorded_buyer || registry.owner_name || null;

  const statusConfig = {
    MATCH: {
      label: lang === 'bn' ? 'তথ্যের মিল পাওয়া গেছে (Match Verified)' : 'Match Verified',
      color: 'text-emerald-700 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
      icon: CheckCircle2
    },
    POTENTIAL_INCONSISTENCY: {
      label: lang === 'bn' ? 'সম্ভাব্য গরমিল বা অমিল (Potential Inconsistency)' : 'Potential Inconsistency',
      color: 'text-amber-700 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
      icon: AlertTriangle
    }
  }[result_status] || {
    label: result_status,
    color: 'text-gray-700',
    bg: 'bg-gray-50',
    icon: Info
  };

  const StatusIcon = statusConfig.icon;

  const handlePrint = () => {
    window.print();
  };

  const notProvided = lang === 'bn' ? 'প্রদান করা হয়নি' : 'Not provided';
  const noRecord = lang === 'bn' ? 'রেকর্ড নেই' : 'No record';
  const valueOr = (value, fallback) => (hasValue(value) ? value : fallback);

  const Verdict = ({ submittedValue, recordedValue }) => {
    if (!hasValue(recordedValue)) {
      return <span className="text-gray-400 font-semibold">— {noRecord}</span>;
    }
    if (!hasValue(submittedValue)) {
      return <span className="text-gray-500 font-semibold">— {lang === 'bn' ? 'যাচাই হয়নি' : 'Not checked'}</span>;
    }
    return sameValue(submittedValue, recordedValue) ? (
      <span className="text-emerald-600 font-bold">✓ {lang === 'bn' ? 'মিল' : 'Match'}</span>
    ) : (
      <span className="text-rose-600 font-bold">✗ {lang === 'bn' ? 'গরমিল' : 'Mismatch'}</span>
    );
  };

  const locationSubmitted = [submitted.mouza, submitted.upazila].filter(hasValue);
  const locationPairs = [
    [submitted.mouza, registry.mouza],
    [submitted.upazila, registry.upazila]
  ].filter(([submittedValue]) => hasValue(submittedValue));
  const hasLocationRecord = hasValue(registry.mouza) || hasValue(registry.upazila);
  const locationVerdict = !hasLocationRecord ? (
    <span className="text-gray-400 font-semibold">— {noRecord}</span>
  ) : locationSubmitted.length === 0 ? (
    <span className="text-gray-500 font-semibold">— {lang === 'bn' ? 'যাচাই হয়নি' : 'Not checked'}</span>
  ) : locationPairs.every(([submittedValue, recordedValue]) => sameValue(submittedValue, recordedValue)) ? (
    <span className="text-emerald-600 font-bold">✓ {lang === 'bn' ? 'মিল' : 'Match'}</span>
  ) : (
    <span className="text-rose-600 font-bold">✗ {lang === 'bn' ? 'গরমিল' : 'Mismatch'}</span>
  );

  const landStatus = registry.property_status;
  const landStatusCell = !hasValue(landStatus) ? (
    <span className="text-gray-400 font-semibold">— {noRecord}</span>
  ) : landStatus === 'disputed' ? (
    <span className="text-amber-600 font-bold">⚠️ {lang === 'bn' ? 'দেওয়ানি মোকদ্দমাধীন' : 'Disputed'}</span>
  ) : landStatus === 'acquired' ? (
    <span className="text-rose-600 font-bold">⚠️ {lang === 'bn' ? 'সরকারি অধিগ্রহণভুক্ত' : 'Acquired'}</span>
  ) : (
    <span className="text-emerald-700 dark:text-emerald-400 font-bold">✓ {lang === 'bn' ? 'নিষ্কণ্টক' : 'Clear'}</span>
  );

  return (
    <div className="gov-container py-8 space-y-6 max-w-4xl">
      {/* Top Bar Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print bg-white dark:bg-gray-800/80 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={goToForm}
            className="gov-btn-primary text-xs py-2 px-4 flex items-center gap-2 font-bold shadow hover:scale-[1.02] transition-transform"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{lang === 'bn' ? '← দলিল যাচাই ফরম-এ ফিরে যান' : '← Back to Deed Verification'}</span>
          </button>

          <button
            onClick={() => setActiveTab('deed-search')}
            className="gov-btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'দলিল নম্বর খুঁজুন' : 'Search Deed Number'}</span>
          </button>

          <button
            onClick={goToDashboard}
            className="gov-btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <Home className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard'}</span>
          </button>
        </div>

        <button
          onClick={handlePrint}
          className="gov-btn-gold text-xs py-2 px-4 flex items-center gap-1.5 font-bold shadow"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>{lang === 'bn' ? 'রিপোর্ট প্রিন্ট / সংরক্ষণ' : 'Print / Download Report'}</span>
        </button>
      </div>

      {/* Printable Report Layout */}
      <div className="gov-card p-6 sm:p-8 space-y-6 printable-area bg-white dark:bg-[#121a16] border-2 border-[#047857]">
        {/* Official Header */}
        <div className="text-center border-b-2 border-[#047857] pb-6 space-y-1.5 relative">
          <div className="text-xs uppercase tracking-widest text-[#047857] dark:text-emerald-400 font-bold">
            {t('govBangladesh')}
          </div>
          <div className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
            {lang === 'bn' ? 'দলিল ও বালাম ক্রস-চেক যাচাই প্রতিবেদন' : 'Digital Deed Cross-Check Verification Report'}
          </div>
          <div className="text-xs text-gray-500 font-medium">
            {lang === 'bn' ? 'ভূমিসেতু (Bhumisetu) স্বয়ংক্রিয় বিশ্লেষণ ইঞ্জিন | P2 মডিউল' : 'Bhumisetu AI Automated Verification Engine | P2 Module'}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              <Cpu className="w-3.5 h-3.5 text-emerald-700" />
              <span>{lang === 'bn' ? 'C++ নেটিভ ফাজি ম্যাচিং ইঞ্জিন' : 'C++ Native Fuzzy Match Engine'}</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
              <span>{lang === 'bn' ? 'অ্যালগরিদম: UTF-8 Levenshtein & Graph Anomaly Check' : 'Algorithm: UTF-8 Levenshtein & Graph Anomaly Check'}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100 dark:border-gray-800">
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
        <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${statusConfig.bg}`}>
          <div className="flex items-center gap-3">
            <StatusIcon className={`w-8 h-8 ${statusConfig.color} flex-shrink-0`} />
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">
                {lang === 'bn' ? 'সার্বিক যাচাই ফলাফল' : 'Overall Verification Status'}
              </div>
              <div className={`text-base sm:text-lg font-black ${statusConfig.color}`}>
                {statusConfig.label}
              </div>
            </div>
          </div>

          {hasScore ? (
            <div className="flex items-center gap-3 bg-white dark:bg-[#18231e] px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="text-right">
                <span className="text-[11px] text-gray-500 block leading-tight">
                  {lang === 'bn' ? 'তথ্যের মিল স্কোর' : 'Data Match Score'}
                </span>
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  {numericScore >= 80 ? (lang === 'bn' ? 'সন্তোষজনক' : 'Satisfactory') : (lang === 'bn' ? 'ঝুঁকিপূর্ণ' : 'Discrepancy')}
                </span>
              </div>
              <div className={`text-2xl font-black ${numericScore >= 80 ? 'text-emerald-600' : numericScore >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                {numericScore}%
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 bg-white dark:bg-[#18231e] px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 max-w-sm">
              <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <span className="text-[11px] leading-snug text-gray-600 dark:text-gray-300">
                {lang === 'bn'
                  ? 'দলিল রেকর্ড পাওয়া যায়নি, তাই ম্যাচ স্কোর গণনা করা সম্ভব নয়। নিচে শুধু পাওয়া যাওয়া রেকর্ডের তথ্য দেখানো হচ্ছে।'
                  : 'The deed record was not found, so a match score cannot be calculated. Only the records that were found are shown below.'}
              </span>
            </div>
          )}
        </div>

        {/* Structured Field-by-Field Comparison Table */}
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-[#0b462d] dark:text-emerald-400" />
            <span>{lang === 'bn' ? 'প্রদত্ত তথ্য বনাম সাব-রেজিস্ট্রি বালাম রেকর্ডের তুলনা' : 'Submitted Information vs. Registry Balam Records'}</span>
          </h3>

          <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="py-2.5 px-3">{lang === 'bn' ? 'তথ্যাবলি ফিল্ড' : 'Field'}</th>
                  <th className="py-2.5 px-3">{lang === 'bn' ? 'আবেদনে প্রদত্ত তথ্য' : 'Submitted Value'}</th>
                  <th className="py-2.5 px-3">{lang === 'bn' ? 'বালাম / রেকর্ডীয় তথ্য' : 'Recorded in Balam'}</th>
                  <th className="py-2.5 px-3 text-right">{lang === 'bn' ? 'উৎস ও মিল' : 'Source & Match'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">{t('deedNo')}</td>
                  <td className="py-2.5 px-3 font-mono">{valueOr(submitted.deed_no, notProvided)}</td>
                  <td className="py-2.5 px-3 font-mono">{valueOr(registry.deed_no, noRecord)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <Verdict submittedValue={submitted.deed_no} recordedValue={registry.deed_no} />
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">{t('mouza')} & {t('upazila')}</td>
                  <td className="py-2.5 px-3">
                    {valueOr(submitted.mouza, '—')}, {valueOr(submitted.upazila, '—')}
                  </td>
                  <td className="py-2.5 px-3">
                    {valueOr(registry.mouza, '—')}, {valueOr(registry.upazila, '—')}
                  </td>
                  <td className="py-2.5 px-3 text-right">{locationVerdict}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">{t('plotNo')}</td>
                  <td className="py-2.5 px-3 font-mono">{valueOr(submitted.plot_id, notProvided)}</td>
                  <td className="py-2.5 px-3 font-mono">{valueOr(registry.plot_id, noRecord)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <Verdict submittedValue={submitted.plot_id} recordedValue={registry.plot_id} />
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">{lang === 'bn' ? 'মালিক / গ্রহীতার নাম' : 'Registered Owner'}</td>
                  <td className="py-2.5 px-3 font-semibold text-gray-900 dark:text-white">{valueOr(submitted.owner_name, notProvided)}</td>
                  <td className="py-2.5 px-3 font-semibold text-emerald-700 dark:text-emerald-400">{valueOr(recordedOwner, noRecord)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <Verdict submittedValue={submitted.owner_name} recordedValue={recordedOwner} />
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">{lang === 'bn' ? 'জমির পরিমাণ' : 'Land Area'}</td>
                  <td className="py-2.5 px-3">{valueOr(submitted.area, '—')}</td>
                  <td className="py-2.5 px-3">{hasValue(registry.recorded_area) ? `${registry.recorded_area} ${lang === 'bn' ? 'শতক' : 'decimal'}` : '—'}</td>
                  <td className="py-2.5 px-3 text-right">
                    <Verdict submittedValue={submitted.area} recordedValue={registry.recorded_area} />
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">{lang === 'bn' ? 'জমির রেকর্ডীয় অবস্থা' : 'Land Legal Status'}</td>
                  <td className="py-2.5 px-3 text-gray-500">—</td>
                  <td className="py-2.5 px-3 font-medium">{landStatusCell}</td>
                  <td className="py-2.5 px-3 text-right">
                    {hasValue(landStatus) ? (
                      <span className="text-gray-500 font-semibold">{lang === 'bn' ? 'ভূমি রেকর্ড' : 'Land record'}</span>
                    ) : (
                      <span className="text-gray-400 font-semibold">— {noRecord}</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Discrepancies and Tampering Analysis Section */}
        {discrepancies.length > 0 && (
          <div className="space-y-3 p-4 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
            <h4 className="font-bold text-xs text-rose-900 dark:text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>{lang === 'bn' ? 'শনাক্তকৃত গরমিল ও অসঙ্গতি বিশ্লেষণ:' : 'Identified Inconsistencies & Tampering Flags:'}</span>
            </h4>
            <div className="space-y-2">
              {discrepancies.map((d, i) => (
                <div key={i} className="text-xs p-2.5 rounded bg-white dark:bg-[#15201b] border border-rose-200 dark:border-rose-900/40 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-rose-800 dark:text-rose-300">
                      {lang === 'bn' ? d.field : (d.field_en || d.field)}
                    </strong>
                    <span className="text-[10px] text-gray-500 font-mono text-right">
                      {lang === 'bn' ? 'উৎস:' : 'Source:'} {d.source}
                    </span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 leading-snug">
                    {lang === 'bn' ? d.message_bn : (d.message_en || d.message_bn)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Section: QR Code & Official Seal */}
        <div className="pt-6 border-t-2 border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-6">
          {/* QR Code */}
          <div className="flex items-center gap-4">
            <QRCodeCanvas
              value={`[ভূমিসেতু — ডিজিটাল যাচাই প্রতিবেদন / Bhumisetu]\nরেফারেন্স: ${verification_ref}\nদলিল নং: ${registry.deed_no || 'N/A'} (${registry.reg_year || 'N/A'})\nমৌজা: ${registry.mouza || 'N/A'}, দাগ: ${registry.plot_id || 'N/A'}\nস্ট্যাটাস: ${isMatch ? 'তথ্যের মিল পাওয়া গেছে (MATCH)' : 'গরমিল চিহ্নিত (FLAGGED)'}\nস্কোর: ${hasScore ? `${numericScore}%` : 'N/A'}\nলিংক: ${typeof window !== 'undefined' ? window.location.origin : ''}/#verify/${verification_ref}`}
              size={100}
              label={verification_ref}
              title={lang === 'bn' ? 'ডিজিটাল দলিল যাচাই প্রতিবেদন কিউআর' : 'Deed Verification Report QR'}
            />
            <div className="space-y-1 text-xs">
              <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-[#0b462d] dark:text-emerald-400" />
                {lang === 'bn' ? 'ডিজিটাল যাচাইকরণ কিউআর' : 'Digital Verification QR'}
              </span>
              <p className="text-[11px] text-gray-500 max-w-xs leading-tight">
                {lang === 'bn'
                  ? 'এই কিউআর কোডটি স্ক্যান করে প্ল্যাটফর্মে সংরক্ষিত ফলাফলের সত্যতা নিশ্চিত করুন।'
                  : 'Scan this QR code to validate the server-verified report reference.'}
              </p>
              <span className="text-[10px] text-[#c59b27] font-semibold block">
                {lang === 'bn' ? 'ক্লিক করে বড় করুন, লিংক কপি বা কিউআর কোড ডাউনলোড করুন।' : 'Click to enlarge, copy link, or download QR image.'}
              </span>
            </div>
          </div>

          {/* Report reference seal */}
          <div className="w-28 h-28 rounded-full border-2 border-dashed border-[#047857] dark:border-emerald-500 p-1 flex items-center justify-center text-center rotate-6 select-none opacity-80">
            <div className="w-full h-full rounded-full border border-[#047857] flex flex-col items-center justify-center text-[9px] font-bold text-[#047857] dark:text-emerald-400 uppercase leading-tight">
              <span>BHUMISETU</span>
              <span className="text-[#F5B544]">{isMatch ? 'MATCHED' : 'FLAGGED'}</span>
              <span>{(verification_ref || '').split('-').pop()}</span>
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
      <div className="gov-card p-4 flex flex-wrap items-center justify-between gap-4 no-print border-2 border-emerald-600/30 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-md">
        <button
          onClick={goToForm}
          className="gov-btn-primary text-xs py-2.5 px-5 flex items-center gap-2 font-bold shadow hover:scale-[1.02] transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === 'bn' ? '← পূর্ববর্তী পেজে ফিরে যান (নতুন দলিল যাচাই)' : '← Back to Verify Another Deed'}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('mutation')}
            className="gov-btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 font-semibold"
          >
            <span>{lang === 'bn' ? 'ই-নামজারি আবেদন করুন' : 'Apply for E-Namjari'}</span>
          </button>
          <button
            onClick={() => setActiveTab('due-diligence')}
            className="gov-btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 font-semibold"
          >
            <span>{lang === 'bn' ? 'স্বত্ব ও ঝুঁকি যাচাই' : 'Due Diligence Check'}</span>
          </button>
          <button
            onClick={handlePrint}
            className="gov-btn-gold text-xs py-2 px-4 flex items-center gap-1.5 font-bold shadow"
          >
            <Printer className="w-4 h-4" />
            <span>{lang === 'bn' ? 'রিপোর্ট প্রিন্ট / সংরক্ষণ' : 'Print Report'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
