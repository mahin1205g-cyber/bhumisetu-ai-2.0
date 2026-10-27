import React from 'react';
import { useApp } from '../context/AppContext';
import QRCodeCanvas from '../components/QRCodeCanvas';
import {
  AlertOctagon, Printer, ArrowLeft, ShieldAlert, CheckCircle2,
  AlertTriangle, FileText, Info, HelpCircle, Home
} from 'lucide-react';

export default function DueDiligenceReport({ result, setActiveTab, navigateBack }) {
  const { lang, t } = useApp();

  if (!result) {
    return (
      <div className="gov-container py-16 text-center space-y-4">
        <p className="text-sm text-gray-500">
          {lang === 'bn' ? 'কোনো ঝুঁকি রিপোর্ট পাওয়া যায়নি। অনুগ্রহ করে পূর্বে যাচাই সম্পন্ন করুন।' : 'No assessment report found. Please run a due diligence check.'}
        </p>
        <button
          onClick={() => navigateBack ? navigateBack('due-diligence') : setActiveTab('due-diligence')}
          className="gov-btn-primary text-xs"
        >
          {lang === 'bn' ? 'যাচাই ফরম খুলুন' : 'Open Due Diligence Form'}
        </button>
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="gov-container py-8 space-y-6 max-w-4xl">
      {/* Top Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print bg-white dark:bg-gray-800/80 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateBack ? navigateBack('due-diligence') : setActiveTab('due-diligence')}
            className="gov-btn-primary text-xs py-2 px-4 flex items-center gap-2 font-bold shadow hover:scale-[1.02] transition-transform"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{lang === 'bn' ? '← প্রাক-ক্রয় স্বত্ব যাচাই ফরম-এ ফিরে যান' : '← Back to Due Diligence Form'}</span>
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
          <span>{lang === 'bn' ? 'রিপোর্ট প্রিন্ট / সংরক্ষণ' : 'Print / Download Report'}</span>
        </button>
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

        {/* Risk Banner & Score */}
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
              value={`[ভূমিসাথী — নাগরিক প্রাক-ক্রয় স্বত্ব যাচাই / Due Diligence]\nরিপোর্ট রেফারেন্স: ${report_ref || 'LG-DD-2026'}\nঝুঁকি মূল্যায়ন স্তর: ${risk_level || 'HIGH'}\nমোট ঝুঁকি স্কোর: ${risk_score || 0}/100\nশনাক্তকৃত ঝুঁকি সূচক: ${(indicators || []).length} টি\nমডেল: Isolation Forest Anomaly Detection O(log N)\nযাচাই লিংক: ${typeof window !== 'undefined' ? window.location.origin : ''}/#due-diligence/${report_ref || 'LG-DD-2026'}`}
              size={100}
              label={report_ref}
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
        <button
          onClick={() => setActiveTab('due-diligence')}
          className="gov-btn-primary text-xs py-2.5 px-5 flex items-center gap-2 font-bold shadow hover:scale-[1.02] transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === 'bn' ? '← পূর্ববর্তী পেজে ফিরে যান (নতুন জমি যাচাই)' : '← Back to Due Diligence Form'}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('deed-verify')}
            className="gov-btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 font-semibold"
          >
            <span>{lang === 'bn' ? 'দলিল ক্রস-চেক করুন' : 'Verify Deed'}</span>
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className="gov-btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 font-semibold"
          >
            <span>{lang === 'bn' ? 'ড্যাশবোর্ডে ফিরে যান' : 'Go to Dashboard'}</span>
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
