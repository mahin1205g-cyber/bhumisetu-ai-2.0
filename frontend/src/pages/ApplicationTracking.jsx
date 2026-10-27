import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import {
  Search, GitBranchPlus, Clock, CheckCircle2, XCircle, AlertCircle,
  FileText, User, MapPin, Calendar, RefreshCw, ArrowRight, UploadCloud,
  Send, ShieldCheck, AlertTriangle, FileCheck
} from 'lucide-react';

export default function ApplicationTracking({ initialTrackingNo, setActiveTab, navigateBack }) {
  const { lang, t, user } = useApp();
  const [trackingNo, setTrackingNo] = useState(initialTrackingNo || 'MUT-2026-DHK-4821');
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Correction form state
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitSuccess, setResubmitSuccess] = useState('');
  const [correctionPhone, setCorrectionPhone] = useState('');
  const [correctionAddress, setCorrectionAddress] = useState('');
  const [correctionNotes, setCorrectionNotes] = useState('');
  const [newDocName, setNewDocName] = useState('');
  const [attachedDocs, setAttachedDocs] = useState([]);

  const fetchApplication = async (searchNo) => {
    const num = searchNo || trackingNo;
    if (!num) return;
    setLoading(true);
    setError('');
    setResubmitSuccess('');

    try {
      const data = await api.trackMutation(num.trim());
      setAppData(data);
      if (data) {
        setCorrectionPhone(data.applicant_phone || '');
        setCorrectionAddress(data.applicant_address || '');
        setAttachedDocs(data.supporting_docs || []);
      }
    } catch (err) {
      setError(err.message || 'Application not found');
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

  const handleAddDocument = () => {
    if (!newDocName.trim()) return;
    if (!attachedDocs.includes(newDocName.trim())) {
      setAttachedDocs([...attachedDocs, newDocName.trim()]);
    }
    setNewDocName('');
  };

  const handleRemoveDocument = (docToRemove) => {
    setAttachedDocs(attachedDocs.filter(d => d !== docToRemove));
  };

  const handleResubmit = async (e) => {
    e.preventDefault();
    if (!appData) return;

    setResubmitting(true);
    setResubmitSuccess('');
    try {
      const payload = {
        applicant_phone: correctionPhone.trim(),
        applicant_address: correctionAddress.trim(),
        supporting_docs: attachedDocs,
        correction_notes: correctionNotes.trim()
      };
      await api.resubmitMutation(appData.tracking_no, payload);
      setResubmitSuccess(lang === 'bn' ? 'সংশোধিত তথ্য ও প্রমাণক সফলভাবে দাখিল হয়েছে! আবেদনের স্ট্যাটাস "Resubmitted" এ আপডেট করা হয়েছে।' : 'Corrections resubmitted successfully! Status updated to Resubmitted.');
      setCorrectionNotes('');
      await fetchApplication(appData.tracking_no);
    } catch (err) {
      alert(err.message || 'Failed to resubmit application corrections');
    } finally {
      setResubmitting(false);
    }
  };

  const stages = [
    { key: 'Draft', label: lang === 'bn' ? 'খসড়া' : 'Draft' },
    { key: 'Submitted', label: lang === 'bn' ? 'দাখিলকৃত' : 'Submitted' },
    { key: 'Under Review', label: lang === 'bn' ? 'পর্যালোচনা' : 'Under Review' },
    { key: 'Correction Required', label: lang === 'bn' ? 'তথ্য সংশোধন' : 'Correction' },
    { key: 'Resubmitted', label: lang === 'bn' ? 'পুনঃদাখিলকৃত' : 'Resubmitted' },
    { key: 'Approved', label: lang === 'bn' ? 'অনুমোদিত' : 'Approved' }
  ];

  const getStageIndex = (currentStatus) => {
    if (currentStatus === 'Rejected') return -1;
    if (currentStatus === 'Additional Information Required' || currentStatus === 'Correction Required') return 3;
    if (currentStatus === 'Resubmitted') return 4;
    if (currentStatus === 'Approved') return 5;
    if (currentStatus === 'Under Review' || currentStatus === 'Document Verification' || currentStatus === 'Initial Review') return 2;
    if (currentStatus === 'Submitted') return 1;
    return 0;
  };

  const isCorrectionActive = appData?.status === 'Correction Required' || appData?.status === 'Additional Information Required';

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
              className="gov-input pl-9 font-mono"
              required
            />
          </div>
          <button type="submit" disabled={loading} className="gov-btn-primary text-xs px-5 font-bold flex items-center gap-1.5">
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>{t('btnTrack')}</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-gray-500">
          <span>{lang === 'bn' ? 'ডেমো নমুনা আবেদনসমূহ:' : 'Demo Presets:'}</span>
          {[
            { id: 'MUT-2026-DHK-4821', label: lang === 'bn' ? 'যাচাই চলছে (Under Review)' : 'Under Review' },
            { id: 'MUT-2026-CTG-1904', label: lang === 'bn' ? 'অনুমোদিত (Approved)' : 'Approved' },
            { id: 'MUT-2026-DHK-9012', label: lang === 'bn' ? 'সংশোধন প্রয়োজন (Correction Notice)' : 'Correction Notice' }
          ].map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setTrackingNo(p.id);
                fetchApplication(p.id);
              }}
              className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-mono text-[11px] transition"
            >
              {p.id} ({p.label})
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Tracking Details */}
      {appData && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="gov-card p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
              <div>
                <span className="text-[11px] text-gray-500 block">{t('trackingNo')}</span>
                <span className="text-xl font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {appData.tracking_no}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-gray-500 block">{lang === 'bn' ? 'বর্তমান স্ট্যাটাস' : 'Status'}</span>
                <span className={`inline-flex items-center gap-1.5 font-bold text-xs px-3.5 py-1 rounded-full shadow-sm ${
                  appData.status === 'Approved'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : appData.status === 'Rejected'
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    : appData.status === 'Correction Required' || appData.status === 'Additional Information Required'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 ring-2 ring-amber-300'
                    : appData.status === 'Resubmitted'
                    ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                    : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                }`}>
                  <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
                  <span>{appData.status_info?.bn || appData.status}</span>
                </span>
              </div>
            </div>

            {/* Visual Timeline Progress Bar */}
            <div className="py-2">
              <div className="relative flex justify-between">
                {/* Horizontal line */}
                <div className="absolute top-3.5 left-4 right-4 h-1 bg-gray-200 dark:bg-gray-800 -z-0">
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
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition shadow-sm ${
                        isPassed
                          ? 'bg-[#0b462d] text-white ring-2 ring-emerald-200 dark:ring-emerald-900'
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
              <div className="p-4 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                <span className="font-bold flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-600" />
                  {lang === 'bn' ? 'ভূমি কর্মকর্তার পর্যবেক্ষণ ও মন্তব্য:' : 'Officer Review Notes:'}
                </span>
                <p className="leading-relaxed pl-5 font-medium">{appData.review_notes}</p>
              </div>
            )}

            {/* Rejection Notice if rejected */}
            {appData.status === 'Rejected' && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-xs text-rose-800 dark:text-rose-200 space-y-1">
                <span className="font-bold flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  {lang === 'bn' ? 'আবেদন খারিজের আইনি কারণ:' : 'Rejection Reason:'}
                </span>
                <p className="pl-5 leading-relaxed">{appData.rejection_reason || 'কাগজপত্রে গরমিল বা মালিকানা প্রমাণের ঘাটতি।'}</p>
                <p className="text-[11px] text-rose-600 pl-5 pt-1">
                  {lang === 'bn' ? 'আইনি প্রতিকার: এই আদেশের বিরুদ্ধে ৩০ কার্যদিবসের মধ্যে অতিরিক্ত জেলা প্রশাসক (রাজস্ব) বরাবরে আপিল করতে পারবেন।' : 'Legal recourse: You may appeal within 30 days to the ADC (Revenue).'}
                </p>
              </div>
            )}
          </div>

          {/* ACTIVE CORRECTION / RESUBMISSION SECTION */}
          {isCorrectionActive && (
            <div className="gov-card p-6 space-y-4 border-2 border-amber-300 dark:border-amber-700/60 bg-amber-50/20 dark:bg-amber-950/10">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-sm">
                    {lang === 'bn' ? 'সংশোধিত তথ্য ও প্রমাণক দাখিল ফরম (Correction Resubmission)' : 'Resubmit Corrected Details & Documents'}
                  </h3>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {lang === 'bn'
                      ? 'কর্মকর্তার নির্দেশিকা অনুযায়ী আপনার ভুল তথ্য সংশোধন করুন বা অতিরিক্ত বায়া দলিল দাখিল করুন।'
                      : 'Update missing information or upload requested chain deeds as instructed.'}
                  </p>
                </div>
              </div>

              {resubmitSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{resubmitSuccess}</span>
                </div>
              )}

              <form onSubmit={handleResubmit} className="space-y-4 text-xs pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      {lang === 'bn' ? 'আবেদনকারীর যোগাযোগ নম্বর' : 'Applicant Phone'}
                    </label>
                    <input
                      type="text"
                      value={correctionPhone}
                      onChange={(e) => setCorrectionPhone(e.target.value)}
                      className="gov-input"
                      placeholder="017xxxxxxxx"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      {lang === 'bn' ? 'বর্তমান যোগাযোগের ঠিকানা' : 'Contact Address'}
                    </label>
                    <input
                      type="text"
                      value={correctionAddress}
                      onChange={(e) => setCorrectionAddress(e.target.value)}
                      className="gov-input"
                      placeholder="গ্রাম/রোড, ডাকঘর, উপজেলা, জেলা"
                    />
                  </div>
                </div>

                {/* Additional Documents Manager */}
                <div className="space-y-2">
                  <label className="block font-semibold text-gray-700 dark:text-gray-300">
                    {lang === 'bn' ? 'সংযুক্ত প্রমাণকসমূহ (নতুন বায়া দলিল/দাখিলা যোগ করুন):' : 'Attached Documents:'}
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {attachedDocs.map((doc, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 text-gray-800 dark:text-gray-200 text-[11px] font-medium shadow-sm">
                        <span>✓ {doc}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocument(doc)}
                          className="text-gray-400 hover:text-rose-500 font-bold ml-1"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDocName}
                      onChange={(e) => setNewDocName(e.target.value)}
                      placeholder={lang === 'bn' ? 'যেমন: বায়া দলিল নং-D-4091 এর স্পষ্ট কপি' : 'e.g. Clear Baya Deed Copy'}
                      className="gov-input text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddDocument}
                      className="gov-btn-secondary text-xs px-3 flex-shrink-0"
                    >
                      {lang === 'bn' ? 'ফাইল যোগ করুন' : 'Add File'}
                    </button>
                  </div>
                </div>

                {/* Applicant Remarks / Explanation */}
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {lang === 'bn' ? 'সংশোধনের বিবরণ ও ব্যাখ্যা' : 'Applicant Explanation / Notes'} *
                  </label>
                  <textarea
                    rows="3"
                    value={correctionNotes}
                    onChange={(e) => setCorrectionNotes(e.target.value)}
                    required
                    placeholder={lang === 'bn' ? 'তলবকৃত বায়া দলিলের স্পষ্ট কপি ও হালনাগাদ খাজনার রসিদ সংযুক্ত করা হলো।' : 'Attached the requested certified chain deed and updated tax receipts.'}
                    className="gov-input resize-none text-xs"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={resubmitting}
                    className="gov-btn-primary text-xs py-2 px-5 font-bold shadow-md flex items-center gap-2"
                  >
                    {resubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{lang === 'bn' ? 'দাখিল হচ্ছে...' : 'Submitting...'}</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>{lang === 'bn' ? 'সংশোধিত তথ্য দাখিল করুন (Resubmit)' : 'Resubmit Corrections'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

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
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">{appData.plot_no}</span>
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
                  <span className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-[#0b462d] dark:bg-emerald-400 ring-4 ring-white dark:ring-gray-900 shadow-sm" />
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-bold text-gray-900 dark:text-white text-xs">
                      {item.to_status}
                    </span>
                    <span className="text-[11px] text-gray-400 font-mono">
                      {new Date(item.created_at).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}
                    </span>
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 text-[11px]">
                    {lang === 'bn' ? 'সম্পাদনকারী:' : 'Updated by:'} <strong>{item.changed_by_name}</strong> ({item.changed_by_role})
                  </div>
                  {item.remarks && (
                    <p className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300">
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
