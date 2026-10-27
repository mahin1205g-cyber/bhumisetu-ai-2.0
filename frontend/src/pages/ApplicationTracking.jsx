import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import {
  Search, GitBranchPlus, Clock, CheckCircle2, XCircle, AlertCircle,
  FileText, User, MapPin, Calendar, RefreshCw, ArrowRight
} from 'lucide-react';

export default function ApplicationTracking({ initialTrackingNo, setActiveTab, navigateBack }) {
  const { lang, t } = useApp();
  const [trackingNo, setTrackingNo] = useState(initialTrackingNo || 'MUT-2026-DHK-4821');
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchApplication = async (searchNo) => {
    const num = searchNo || trackingNo;
    if (!num) return;
    setLoading(true);
    setError('');

    try {
      const data = await api.trackMutation(num.trim());
      setAppData(data);
    } catch (err) {
      setError(err.message);
      setAppData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialTrackingNo) {
      setTrackingNo(initialTrackingNo);
      fetchApplication(initialTrackingNo);
    } else {
      fetchApplication('MUT-2026-DHK-4821');
    }
  }, [initialTrackingNo]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchApplication();
  };

  const stages = [
    { key: 'Draft', label: lang === 'bn' ? 'খসড়া' : 'Draft' },
    { key: 'Submitted', label: lang === 'bn' ? 'দাখিলকৃত' : 'Submitted' },
    { key: 'Initial Review', label: lang === 'bn' ? 'প্রাথমিক পর্যালোচনা' : 'Initial Review' },
    { key: 'Document Verification', label: lang === 'bn' ? 'কাগজপত্র যাচাই' : 'Doc Verification' },
    { key: 'Decision Pending', label: lang === 'bn' ? 'সিদ্ধান্ত অপেক্ষমাণ' : 'Decision Pending' },
    { key: 'Approved', label: lang === 'bn' ? 'অনুমোদিত' : 'Approved' }
  ];

  const getStageIndex = (currentStatus) => {
    if (currentStatus === 'Rejected') return -1;
    if (currentStatus === 'Additional Information Required') return 3;
    const idx = stages.findIndex(s => s.key === currentStatus);
    return idx >= 0 ? idx : 1;
  };

  return (
    <div className="gov-container py-6 space-y-6 max-w-4xl">
      {/* Top Page Header with Universal Back Button & Breadcrumbs */}
      <PageHeader
        title={lang === 'bn' ? 'নামজারি আবেদন ট্র্যাকিং ও টাইমলাইন' : 'Track Mutation Application Status'}
        subtitle={
          lang === 'bn'
            ? 'আবেদন নম্বর দিয়ে রিয়েলটাইম টাইমলাইন, কর্মকর্তার মন্তব্য ও পরবর্তী করণীয় যাচাই করুন।'
            : 'Track status changes, review comments, and simulated officer decisions.'
        }
        icon={GitBranchPlus}
        badge={lang === 'bn' ? 'ই-নামজারি ট্র্যাকিং' : 'Mutation Tracking'}
        badgeColor="emerald"
        breadcrumbs={[
          { label: lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' },
          { label: lang === 'bn' ? 'নামজারি' : 'Mutation', tab: 'mutation' }
        ]}
        setActiveTab={setActiveTab}
        onBack={() => navigateBack ? navigateBack('mutation') : (setActiveTab && setActiveTab('mutation'))}
        fallbackTab="mutation"
      />

      {/* Quick Search & Preset Pills */}
      <div className="gov-card p-5 space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              value={trackingNo}
              onChange={(e) => setTrackingNo(e.target.value)}
              placeholder="e.g. MUT-2026-DHK-4821"
              className="gov-input pl-9"
              required
            />
          </div>
          <button type="submit" disabled={loading} className="gov-btn-primary text-xs px-5 font-bold">
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>{t('btnTrack')}</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-gray-500">
          <span>{lang === 'bn' ? 'ডেমো নমুনা আবেদনসমূহ:' : 'Demo Presets:'}</span>
          {[
            { id: 'MUT-2026-DHK-4821', label: lang === 'bn' ? 'যাচাই চলছে (Doc Verification)' : 'In Verification' },
            { id: 'MUT-2026-CTG-1904', label: lang === 'bn' ? 'অনুমোদিত (Approved)' : 'Approved' },
            { id: 'MUT-2026-DHK-9012', label: lang === 'bn' ? 'অতিরিক্ত তথ্য তলব (Notice)' : 'Info Required' }
          ].map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setTrackingNo(p.id);
                fetchApplication(p.id);
              }}
              className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-mono text-[11px]"
            >
              {p.id} ({p.label})
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 text-xs">
          {error}
        </div>
      )}

      {/* Main Tracking Details */}
      {appData && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="gov-card p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <span className="text-[11px] text-gray-500 block">{t('trackingNo')}</span>
                <span className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {appData.tracking_no}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-gray-500 block">{lang === 'bn' ? 'বর্তমান স্ট্যাটাস' : 'Status'}</span>
                <span className={`inline-flex items-center gap-1.5 font-bold text-xs px-3 py-1 rounded-full ${
                  appData.status === 'Approved'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : appData.status === 'Rejected'
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    : appData.status === 'Additional Information Required'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                }`}>
                  <span className="w-2 h-2 rounded-full bg-current"></span>
                  <span>{appData.status_info?.bn || appData.status}</span>
                </span>
              </div>
            </div>

            {/* Visual Timeline Progress Bar */}
            <div className="py-4">
              <div className="relative flex justify-between">
                {/* Horizontal line */}
                <div className="absolute top-3 left-4 right-4 h-1 bg-gray-200 dark:bg-gray-800 -z-0">
                  <div
                    className="h-full bg-[#0b462d] dark:bg-emerald-500 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, (getStageIndex(appData.status) / (stages.length - 1)) * 100))}%`
                    }}
                  />
                </div>

                {stages.map((st, i) => {
                  const currentIdx = getStageIndex(appData.status);
                  const isPassed = currentIdx >= i;
                  const isCurrent = currentIdx === i;

                  return (
                    <div key={st.key} className="flex flex-col items-center relative z-10 space-y-1.5 text-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                        isPassed
                          ? 'bg-[#0b462d] text-white shadow ring-2 ring-emerald-200 dark:ring-emerald-900'
                          : 'bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-700 text-gray-400'
                      }`}>
                        {isPassed ? '✓' : i + 1}
                      </div>
                      <span className={`text-[10px] max-w-[70px] leading-tight ${
                        isCurrent
                          ? 'font-bold text-[#0b462d] dark:text-emerald-400'
                          : isPassed
                          ? 'font-semibold text-gray-700 dark:text-gray-300'
                          : 'text-gray-400'
                      }`}>
                        {st.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Officer Review Notes Alert */}
            {appData.review_notes && (
              <div className="p-3.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                <span className="font-bold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  {lang === 'bn' ? 'ভূমি কর্মকর্তার পর্যবেক্ষণ ও মন্তব্য:' : 'Officer Review Notes:'}
                </span>
                <p className="leading-relaxed pl-5">{appData.review_notes}</p>
              </div>
            )}
          </div>

          {/* Application Details Summary */}
          <div className="gov-card p-6 space-y-4">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
              {lang === 'bn' ? 'আবেদনের সংক্ষিপ্ত তথ্যাবলি' : 'Application Summary'}
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-gray-500 block">{lang === 'bn' ? 'আবেদনকারী' : 'Applicant'}</span>
                <span className="font-semibold text-gray-900 dark:text-white">{appData.applicant_name}</span>
              </div>
              <div>
                <span className="text-gray-500 block">{t('plotNo')}</span>
                <span className="font-mono font-semibold">{appData.plot_no}</span>
              </div>
              <div>
                <span className="text-gray-500 block">{t('khatianNo')}</span>
                <span className="font-semibold">{appData.khatian_no} ({appData.khatian_type})</span>
              </div>
              <div>
                <span className="text-gray-500 block">{t('landArea')}</span>
                <span className="font-semibold">{appData.land_area} শতক</span>
              </div>
              <div>
                <span className="text-gray-500 block">{t('mouza')} & {t('upazila')}</span>
                <span>{appData.mouza}, {appData.upazila}</span>
              </div>
              <div>
                <span className="text-gray-500 block">{t('deedNo')}</span>
                <span className="font-mono">{appData.deed_no}</span>
              </div>
              <div>
                <span className="text-gray-500 block">{lang === 'bn' ? 'দাখিলের তারিখ' : 'Submitted Date'}</span>
                <span>{new Date(appData.created_at).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US')}</span>
              </div>
              <div>
                <span className="text-gray-500 block">{lang === 'bn' ? 'সংযুক্ত প্রমাণক' : 'Supporting Docs'}</span>
                <span>{appData.supporting_docs?.length || 0} টি ফাইল</span>
              </div>
            </div>
          </div>

          {/* Timestamped Audit Timeline */}
          <div className="gov-card p-6 space-y-4">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
              <Clock className="w-4 h-4 text-[#0b462d] dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'ওয়ার্কফ্লো অডিট ইতিহাস ও স্ট্যাটাস পরিবর্তন' : 'Status Change Audit History'}</span>
            </h3>

            <div className="space-y-4 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-gray-200 dark:before:bg-gray-800 pl-6">
              {appData.timeline?.map((item, idx) => (
                <div key={idx} className="relative text-xs space-y-1">
                  <span className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-[#0b462d] dark:bg-emerald-400 ring-4 ring-white dark:ring-gray-900" />
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-bold text-gray-900 dark:text-white">
                      {item.to_status}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {new Date(item.created_at).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}
                    </span>
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 text-[11px]">
                    {lang === 'bn' ? 'সম্পাদনকারী:' : 'Updated by:'} <strong>{item.changed_by_name}</strong> ({item.changed_by_role})
                  </div>
                  {item.remarks && (
                    <p className="p-2 rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300">
                      {item.remarks}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
