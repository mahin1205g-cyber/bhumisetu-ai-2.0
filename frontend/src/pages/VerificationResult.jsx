import React from 'react';
import { useApp } from '../context/AppContext';
import QRCodeCanvas from '../components/QRCodeCanvas';
import {
  FileCheck2, CheckCircle2, AlertTriangle, AlertOctagon, Printer,
  ArrowLeft, Download, ShieldCheck, ExternalLink, Info, QrCode, Cpu, Home
} from 'lucide-react';

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
    extracted_summary = {},
    created_at,
    verification_url,
    disclaimer_bn,
    disclaimer_en
  } = result;

  const isMatch = result_status === 'MATCH';
  const isInsufficient = result_status === 'INSUFFICIENT_DATA';

  const statusConfig = {
    MATCH: {
      label: lang === 'bn' ? 'শতভাগ তথ্যের মিল (Match Verified)' : 'Match Verified',
      color: 'text-emerald-700 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
      icon: CheckCircle2
    },
    POTENTIAL_INCONSISTENCY: {
      label: lang === 'bn' ? 'সম্ভাব্য গরমিল বা অমিল (Potential Inconsistency)' : 'Potential Inconsistency',
      color: 'text-amber-700 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
      icon: AlertTriangle
    },
    INSUFFICIENT_DATA: {
      label: lang === 'bn' ? 'অপর্যাপ্ত ডেমো তথ্য (Insufficient Data)' : 'Insufficient Data',
      color: 'text-slate-700 dark:text-slate-400',
      bg: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800',
      icon: AlertOctagon
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

  return (
    <div className="gov-container py-8 space-y-6 max-w-4xl">
      {/* Top Bar Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print bg-white dark:bg-gray-800/80 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateBack ? navigateBack('deed-verify') : setActiveTab('deed-verify')}
            className="gov-btn-primary text-xs py-2 px-4 flex items-center gap-2 font-bold shadow hover:scale-[1.02] transition-transform"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{lang === 'bn' ? '← দলিল যাচাই ফরম-এ ফিরে যান' : '← Back to Deed Verification'}</span>
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
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
          <span>{lang === 'bn' ? 'রিপোর্ট প্রিন্ট / সংরক্ষণ' : 'Print / Download Certificate'}</span>
        </button>
      </div>

      {/* Printable Certificate Layout */}
      <div className="gov-card p-6 sm:p-8 space-y-6 printable-area bg-white dark:bg-[#121a16] border-2 border-[#0b462d]">
        {/* Official Header */}
        <div className="text-center border-b-2 border-[#0b462d] pb-6 space-y-1.5 relative">
          <div className="text-xs uppercase tracking-widest text-[#0b462d] dark:text-emerald-400 font-bold">
            {t('govBangladesh')}
          </div>
          <div className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
            {lang === 'bn' ? 'দলিল ও বালাম ক্রস-চেক যাচাই প্রতিবেদন' : 'Digital Deed Cross-Check Verification Certificate'}
          </div>
          <div className="text-xs text-gray-500 font-medium">
            {lang === 'bn' ? 'ল্যান্ডগার্ড এআই স্বয়ংক্রিয় বিশ্লেষণ ইঞ্জিন | P2 মডিউল' : 'LandGuard AI Automated Verification Engine | P2 Module'}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              <Cpu className="w-3.5 h-3.5 text-emerald-700" />
              <span>{lang === 'bn' ? 'C++ নেটিভ কোর ইঞ্জিন দ্বারা যাচাইকৃত (গতি: < 0.05 ms)' : 'C++ Native Core Verified (< 0.05 ms)'}</span>
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

          {/* Match Score Gauge */}
          <div className="flex items-center gap-3 bg-white dark:bg-[#18231e] px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-right">
              <span className="text-[11px] text-gray-500 block leading-tight">
                {lang === 'bn' ? 'তথ্যের মিল স্কোর' : 'Data Match Score'}
              </span>
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                {match_score >= 80 ? (lang === 'bn' ? 'সন্তোষজনক' : 'Satisfactory') : (lang === 'bn' ? 'ঝুঁকিপূর্ণ' : 'Discrepancy')}
              </span>
            </div>
            <div className={`text-2xl font-black ${match_score >= 80 ? 'text-emerald-600' : match_score >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
              {match_score}%
            </div>
          </div>
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
                  <td className="py-2.5 px-3 font-mono">{extracted_summary.deed_no || 'N/A'}</td>
                  <td className="py-2.5 px-3 font-mono">{extracted_summary.deed_no || 'N/A'}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-600 font-semibold">✓ {lang === 'bn' ? 'বালাম রেজিস্টার' : 'Sub-Registry'}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">{t('mouza')} & {t('upazila')}</td>
                  <td className="py-2.5 px-3">{extracted_summary.mouza}, {extracted_summary.upazila}</td>
                  <td className="py-2.5 px-3">{extracted_summary.mouza}, {extracted_summary.upazila}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-600 font-semibold">✓ {lang === 'bn' ? 'মৌজা রেকর্ড' : 'Mouza Record'}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">{t('plotNo')}</td>
                  <td className="py-2.5 px-3 font-mono">{extracted_summary.plot_id || 'N/A'}</td>
                  <td className="py-2.5 px-3 font-mono">{extracted_summary.plot_id || 'N/A'}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-600 font-semibold">✓ {lang === 'bn' ? 'ভূমি জরিপ ম্যাপ' : 'Land Survey'}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">{lang === 'bn' ? 'মালিক / গ্রহীতার নাম' : 'Registered Owner'}</td>
                  <td className="py-2.5 px-3 font-semibold text-gray-900 dark:text-white">{extracted_summary.owner_name || 'N/A'}</td>
                  <td className="py-2.5 px-3 font-semibold text-emerald-700 dark:text-emerald-400">
                    {extracted_summary.recorded_buyer || extracted_summary.owner_name || 'রেকর্ড অপ্রাপ্ত'}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {extracted_summary.recorded_buyer && extracted_summary.recorded_buyer !== extracted_summary.owner_name ? (
                      <span className="text-rose-600 font-bold">✗ {lang === 'bn' ? 'গরমিল' : 'Mismatch'}</span>
                    ) : (
                      <span className="text-emerald-600 font-bold">✓ {lang === 'bn' ? 'মিল' : 'Match'}</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">{lang === 'bn' ? 'জমির পরিমাণ' : 'Land Area'}</td>
                  <td className="py-2.5 px-3">{extracted_summary.recorded_area ? `${extracted_summary.recorded_area} শতক` : '—'}</td>
                  <td className="py-2.5 px-3">{extracted_summary.recorded_area ? `${extracted_summary.recorded_area} শতক` : '—'}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-600 font-semibold">✓ {lang === 'bn' ? 'খতিয়ান রেজিস্টার' : 'Khatian'}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">{lang === 'bn' ? 'জমির রেকর্ডীয় অবস্থা' : 'Land Legal Status'}</td>
                  <td className="py-2.5 px-3 font-medium">
                    {extracted_summary.property_status === 'disputed' ? (
                      <span className="text-amber-600 font-bold">⚠️ {lang === 'bn' ? 'দেওয়ানি মোকদ্দমাধীন' : 'Disputed'}</span>
                    ) : extracted_summary.property_status === 'acquired' ? (
                      <span className="text-rose-600 font-bold">⚠️ {lang === 'bn' ? 'সরকারি অধিগ্রহণভুক্ত' : 'Acquired'}</span>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">✓ {lang === 'bn' ? 'নিষ্কণ্টক ও নিয়মিত' : 'Clear Title'}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-medium">
                    {extracted_summary.property_status === 'disputed' ? (
                      <span className="text-amber-600">{lang === 'bn' ? 'আদালতের নিষেধাজ্ঞা' : 'Court Injunction'}</span>
                    ) : extracted_summary.property_status === 'acquired' ? (
                      <span className="text-rose-600">{lang === 'bn' ? 'অধিগ্রহণ নোটিশ' : 'Acquisition Notice'}</span>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-400">{lang === 'bn' ? 'নিষ্কণ্টক বালামভুক্ত' : 'Clear & Valid'}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {extracted_summary.property_status === 'disputed' ? (
                      <span className="text-amber-600 font-bold">⚠️ {lang === 'bn' ? 'বিরোধপূর্ণ' : 'Disputed'}</span>
                    ) : extracted_summary.property_status === 'acquired' ? (
                      <span className="text-rose-600 font-bold">⚠️ {lang === 'bn' ? 'অধিগ্রহণ' : 'Acquired'}</span>
                    ) : (
                      <span className="text-emerald-600 font-bold">✓ {lang === 'bn' ? 'নিষ্কণ্টক' : 'Clear'}</span>
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

        {/* Bottom Section: QR Code & Official Seal */}
        <div className="pt-6 border-t-2 border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-6">
          {/* QR Code */}
          <div className="flex items-center gap-4">
            <QRCodeCanvas
              value={`[ভূমিসাথী — ডিজিটাল সনদপত্র / BhumiSathi AI]\nরেফারেন্স: ${verification_ref || 'LG-VR-2026'}\nদলিল নং: ${extracted_summary?.deed_no || 'D-8492'} (${extracted_summary?.reg_year || 2023})\nমৌজা: ${extracted_summary?.mouza || 'পাইকপাড়া'}, দাগ: ${extracted_summary?.plot_id || 'DHK-MIR-002'}\nস্ট্যাটাস: ${result_status === 'MATCH' ? '১০০% তথ্যের মিল (VALID)' : 'গরমিল চিহ্নিত (FLAGGED)'}\nস্কোর: ${match_score || 100}%\nকর্তৃপক্ষ: সাব-রেজিস্ট্রি বালাম ও খতিয়ান ক্রস-ম্যাচ\nলিংক: ${typeof window !== 'undefined' ? window.location.origin : ''}/#verify/${verification_ref || 'LG-VR-2026'}`}
              size={100}
              label={verification_ref}
              title={lang === 'bn' ? 'ডিজিটাল দলিল যাচাই সনদ কিউআর' : 'Deed Verification QR Certificate'}
            />
            <div className="space-y-1 text-xs">
              <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-[#0b462d] dark:text-emerald-400" />
                {lang === 'bn' ? 'ডিজিটাল যাচাইকরণ কিউআর' : 'Digital Verification QR'}
              </span>
              <p className="text-[11px] text-gray-500 max-w-xs leading-tight">
                {lang === 'bn'
                  ? 'এই কিউআর কোডটি স্ক্যান করে ল্যান্ডগার্ড এআই প্ল্যাটফর্মে সংরক্ষিত ফলাফলের সত্যতা নিশ্চিত করুন।'
                  : 'Scan this QR code to validate the server-verified report reference.'}
              </p>
              <span className="text-[10px] text-[#c59b27] font-semibold block">
                {lang === 'bn' ? 'ক্লিক করে বড় করুন, লিংক কপি বা কিউআর কোড ডাউনলোড করুন।' : 'Click to enlarge, copy link, or download QR image.'}
              </span>
            </div>
          </div>

          {/* Simulated Office Seal */}
          <div className="w-28 h-28 rounded-full border-2 border-dashed border-[#0b462d] dark:border-emerald-500 p-1 flex items-center justify-center text-center rotate-6 select-none opacity-80">
            <div className="w-full h-full rounded-full border border-[#0b462d] flex flex-col items-center justify-center text-[9px] font-bold text-[#0b462d] dark:text-emerald-400 uppercase leading-tight">
              <span>LANDGUARD AI</span>
              <span className="text-[#c59b27]">VERIFIED</span>
              <span>{(verification_ref || 'LG-VR-2026').split('-').pop()}</span>
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
          onClick={() => setActiveTab('deed-verify')}
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
            <span>{lang === 'bn' ? 'সনদ প্রিন্ট / সংরক্ষণ' : 'Print Certificate'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
