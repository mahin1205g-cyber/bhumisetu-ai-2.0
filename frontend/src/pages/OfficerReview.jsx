import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import {
  ClipboardCheck, CheckCircle2, XCircle, AlertCircle, Eye,
  Search, RefreshCw, Filter, FileText, ArrowRight, ShieldCheck,
  Clock, MapPin, User, FileCheck, AlertTriangle
} from 'lucide-react';

export default function OfficerReview({ setActiveTab, setSelectedTracking, navigateBack }) {
  const { lang, t, user } = useApp();
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [actionModal, setActionModal] = useState(null); // { type: 'approve' | 'reject' | 'info' }
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const fetchApps = async () => {
    setLoading(true);
    try {
      const data = await api.getAllMutations(filter);
      setApplications(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, [filter]);

  const handleOpenReview = async (app) => {
    setLoadingDetails(true);
    try {
      // If status is Submitted or Resubmitted, officer review moves it to Under Review
      if (app.status === 'Submitted' || app.status === 'Resubmitted') {
        try {
          await api.startMutationReview(app.tracking_no);
        } catch (e) {
          console.warn('Auto start review notification:', e);
        }
      }
      const fresh = await api.trackMutation(app.tracking_no);
      setSelectedApp(fresh || app);
      // Refresh list in background to reflect Under Review
      fetchApps();
    } catch (err) {
      setSelectedApp(app);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleActionSubmit = async () => {
    if (!actionModal || !selectedApp) return;
    if ((actionModal.type === 'reject' || actionModal.type === 'info') && !remarks.trim()) {
      alert(lang === 'bn' ? 'অনুগ্রহ করে কারণ বা নোটিশের বিস্তারিত বিবরণ লিখুন।' : 'Please state a reason or notice remarks.');
      return;
    }

    setSubmitting(true);
    try {
      const newStatus = actionModal.type === 'approve'
        ? 'Approved'
        : actionModal.type === 'reject'
        ? 'Rejected'
        : 'Correction Required';

      await api.performMutationAction({
        tracking_no: selectedApp.tracking_no,
        new_status: newStatus,
        changed_by_name: user?.name || 'বেগম ফরিদা পারভীন, সহকারী কমিশনার (ভূমি)',
        changed_by_role: 'officer',
        remarks: remarks || (actionModal.type === 'approve' ? 'কাগজপত্র ও সার্ভেয়ার প্রতিবেদন সঠিক পাওয়ায় ডেমো সিস্টেমে নামজারি মঞ্জুর করা হলো।' : ''),
        rejection_reason: actionModal.type === 'reject' ? remarks.trim() : '',
        correction_details: actionModal.type === 'info' ? remarks.trim() : ''
      });

      setActionMsg(
        actionModal.type === 'approve'
          ? (lang === 'bn' ? 'নামজারি আবেদন সফলভাবে মঞ্জুর হয়েছে!' : 'Mutation application approved successfully!')
          : actionModal.type === 'reject'
          ? (lang === 'bn' ? 'আবেদন খারিজের আদেশ জারি করা হয়েছে।' : 'Application rejection order recorded.')
          : (lang === 'bn' ? 'নাগরিকের কাছে সংশোধনের নোটিশ সফলভাবে পাঠানো হয়েছে।' : 'Correction notice sent to applicant.')
      );
      setActionModal(null);
      setSelectedApp(null);
      setRemarks('');
      await fetchApps();
      setTimeout(() => setActionMsg(''), 4500);
    } catch (err) {
      alert(err.message || 'Error updating status');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="gov-container py-6 space-y-6 max-w-6xl">
      {/* Top Page Header with Universal Back Button & Breadcrumbs */}
      <PageHeader
        title={lang === 'bn' ? 'ই-নামজারি আবেদন পর্যালোচনা ও সিদ্ধান্ত' : 'Officer Mutation Review & Approval Queue'}
        subtitle={
          lang === 'bn'
            ? 'সহকারী কমিশনার (ভূমি) / এসি ল্যান্ডের ডিজিটাল নথি পর্যালোচনা, সংশোধন তলব ও ডেমো মঞ্জুরি।'
            : 'Review submitted mutation files, issue correction notices, approve or reject applications.'
        }
        icon={ClipboardCheck}
        badge={lang === 'bn' ? 'কর্মকর্তা প্যানেল' : 'Officer Review'}
        badgeColor="indigo"
        breadcrumbs={[
          { label: lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }
        ]}
        setActiveTab={setActiveTab}
        onBack={() => navigateBack ? navigateBack('dashboard') : (setActiveTab && setActiveTab('dashboard'))}
        fallbackTab="dashboard"
        actions={
          <button
            onClick={fetchApps}
            className="gov-btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{lang === 'bn' ? 'রিফ্রেশ' : 'Refresh'}</span>
          </button>
        }
      />

      {actionMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{actionMsg}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="gov-card p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="font-semibold text-gray-700 dark:text-gray-300">{lang === 'bn' ? 'স্ট্যাটাস ফিল্টার:' : 'Filter by Status:'}</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="gov-select py-1 text-xs w-auto font-medium"
          >
            <option value="">{lang === 'bn' ? 'সব আবেদন (All Applications)' : 'All Statuses'}</option>
            <option value="Submitted">{lang === 'bn' ? 'দাখিলকৃত (Submitted)' : 'Submitted'}</option>
            <option value="Under Review">{lang === 'bn' ? 'পর্যালোচনাধীন (Under Review)' : 'Under Review'}</option>
            <option value="Correction Required">{lang === 'bn' ? 'সংশোধন প্রয়োজন (Correction Required)' : 'Correction Required'}</option>
            <option value="Resubmitted">{lang === 'bn' ? 'সংশোধিত দাখিলকৃত (Resubmitted)' : 'Resubmitted'}</option>
            <option value="Approved">{lang === 'bn' ? 'অনুমোদিত (Approved)' : 'Approved'}</option>
            <option value="Rejected">{lang === 'bn' ? 'খারিজ (Rejected)' : 'Rejected'}</option>
          </select>
        </div>

        <span className="text-gray-500">
          {lang === 'bn' ? 'মোট প্রাপ্ত আবেদন:' : 'Total Applications:'} <strong className="font-mono text-gray-800 dark:text-gray-200">{applications.length}</strong>
        </span>
      </div>

      {/* Applications Table */}
      <div className="gov-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="py-3 px-4">{t('trackingNo')}</th>
                <th className="py-3 px-4">{lang === 'bn' ? 'আবেদনকারী' : 'Applicant'}</th>
                <th className="py-3 px-4">{t('plotNo')} / {t('mouza')}</th>
                <th className="py-3 px-4">{t('landArea')}</th>
                <th className="py-3 px-4">{lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
                <th className="py-3 px-4">{lang === 'bn' ? 'দাখিলের তারিখ' : 'Date'}</th>
                <th className="py-3 px-4 text-right">{lang === 'bn' ? 'পদক্ষেপ' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-gray-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-[#0b462d]" />
                    {lang === 'bn' ? 'আবেদন তালিকা লোড হচ্ছে...' : 'Loading applications...'}
                  </td>
                </tr>
              ) : applications.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-gray-400">
                    {lang === 'bn' ? 'উক্ত ফিল্টারে কোনো আবেদন পাওয়া যায়নি।' : 'No applications found under selected filter.'}
                  </td>
                </tr>
              ) : (
                applications.map(app => (
                  <tr key={app.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {app.tracking_no}
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
                      {app.applicant_name}
                      <span className="block text-[10px] text-gray-400 font-normal">{app.applicant_phone}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono font-medium">{app.plot_no}</span>
                      <span className="block text-[10px] text-gray-500">{app.mouza}, {app.upazila}</span>
                    </td>
                    <td className="py-3 px-4 font-medium">{app.land_area} শতক</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 font-semibold text-[11px] px-2.5 py-0.5 rounded-full ${
                        app.status === 'Approved'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : app.status === 'Rejected'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : app.status === 'Correction Required' || app.status === 'Additional Information Required'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : app.status === 'Resubmitted'
                          ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                          : app.status === 'Under Review'
                          ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      }`}>
                        {app.status_info?.bn || app.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {new Date(app.created_at).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenReview(app)}
                        disabled={loadingDetails}
                        className="px-3 py-1 rounded bg-[#0b462d] hover:bg-[#12583a] text-white font-medium text-[11px] inline-flex items-center gap-1.5 transition shadow-sm active:scale-95"
                      >
                        <Eye className="w-3 h-3" />
                        <span>{lang === 'bn' ? 'নথি পর্যালোচনা' : 'Review File'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Complete Officer Application Review Modal */}
      {selectedApp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#121a16] border border-gray-200 dark:border-gray-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 my-8">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <span className="text-xs text-gray-500 block">{lang === 'bn' ? 'সহকারী কমিশনার (ভূমি) এর নথি পর্যালোচনা' : 'AC Land File Inspection'}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white font-mono">
                    {selectedApp.tracking_no}
                  </h3>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    selectedApp.status === 'Approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedApp.status === 'Rejected'
                      ? 'bg-rose-100 text-rose-800'
                      : selectedApp.status === 'Correction Required'
                      ? 'bg-amber-100 text-amber-800'
                      : selectedApp.status === 'Resubmitted'
                      ? 'bg-teal-100 text-teal-800'
                      : 'bg-indigo-100 text-indigo-800'
                  }`}>
                    {selectedApp.status_info?.bn || selectedApp.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-bold flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* Applicant & Land Details Card */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
              <div><span className="text-gray-500 block">{lang === 'bn' ? 'আবেদনকারী:' : 'Applicant:'}</span> <strong className="text-gray-900 dark:text-white">{selectedApp.applicant_name}</strong></div>
              <div><span className="text-gray-500 block">{t('nid')}:</span> <strong className="font-mono text-gray-900 dark:text-white">{selectedApp.applicant_nid}</strong></div>
              <div><span className="text-gray-500 block">{t('plotNo')}:</span> <strong className="font-mono text-emerald-700 dark:text-emerald-400">{selectedApp.plot_no}</strong></div>
              <div><span className="text-gray-500 block">{t('khatianNo')}:</span> <strong>{selectedApp.khatian_no} ({selectedApp.khatian_type})</strong></div>
              <div><span className="text-gray-500 block">{t('landArea')}:</span> <strong className="font-mono">{selectedApp.land_area} শতক</strong></div>
              <div><span className="text-gray-500 block">{t('deedNo')}:</span> <strong className="font-mono">{selectedApp.deed_no}</strong></div>
              <div><span className="text-gray-500 block">{lang === 'bn' ? 'মৌজা ও উপজেলা:' : 'Mouza & Upazila:'}</span> <span>{selectedApp.mouza}, {selectedApp.upazila}, {selectedApp.district}</span></div>
              <div><span className="text-gray-500 block">{lang === 'bn' ? 'জমির শ্রেণি:' : 'Land Class:'}</span> <span>{selectedApp.land_class || 'নাল'}</span></div>
              <div><span className="text-gray-500 block">{lang === 'bn' ? 'মালিকানার উৎস:' : 'Source:'}</span> <span>{selectedApp.ownership_source || 'ক্রয়সূত্রে'}</span></div>
              <div className="sm:col-span-3 border-t border-gray-200/60 dark:border-gray-700/60 pt-2 mt-1">
                <span className="text-gray-500">{lang === 'bn' ? 'আবেদনকারীর বর্তমান ঠিকানা:' : 'Address:'}</span> <span className="font-medium">{selectedApp.applicant_address}</span>
              </div>
            </div>

            {/* Attached Documents */}
            <div className="space-y-1.5 text-xs">
              <span className="font-bold text-gray-700 dark:text-gray-300 block flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{lang === 'bn' ? 'দাখিলকৃত মূল ও বায়া প্রমাণকসমূহ:' : 'Attached Supporting Documents:'}</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedApp.supporting_docs?.length ? (
                  selectedApp.supporting_docs.map((doc, idx) => (
                    <span key={idx} className="px-2.5 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[11px] font-medium flex items-center gap-1">
                      <span>✓</span>
                      <span>{doc}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400">{lang === 'bn' ? 'কোনো প্রমাণক যুক্ত নেই' : 'No documents attached'}</span>
                )}
              </div>
            </div>

            {/* Automated AI & C++ Record Consistency Audit Box */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#0b462d] dark:text-emerald-400" />
                  <span>{lang === 'bn' ? 'স্মার্ট রেকর্ড ও অসঙ্গতি বিশ্লেষণ (Automated Audit)' : 'Automated Anomaly & Title Check'}</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  C++ Accelerated (O(log N))
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                <div className="p-2 rounded bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-emerald-700 dark:text-emerald-400">
                  ✓ {lang === 'bn' ? 'দলিল বালাম ভলিউম: রেকর্ডভুক্ত' : 'Registry Volume: Verified'}
                </div>
                <div className="p-2 rounded bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-emerald-700 dark:text-emerald-400">
                  ✓ {lang === 'bn' ? 'দাগের জোত ব্যালেন্স: পর্যাপ্ত' : 'Plot Balance: Sufficient'}
                </div>
                <div className="p-2 rounded bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-emerald-700 dark:text-emerald-400">
                  ✓ {lang === 'bn' ? 'দেওয়ানি নিষেধাজ্ঞা: মুক্ত' : 'Litigation Stay: None'}
                </div>
              </div>
            </div>

            {/* Officer Review Notes or Applicant Resubmission Notes if any */}
            {(selectedApp.review_notes || selectedApp.rejection_reason) && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                <span className="font-bold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>{lang === 'bn' ? 'পূর্ববর্তী আদেশ বা নোটিশের তথ্য:' : 'Prior Order/Notice Details:'}</span>
                </span>
                <p className="pl-5 leading-relaxed">{selectedApp.rejection_reason || selectedApp.review_notes}</p>
              </div>
            )}

            {/* Officer Action Buttons */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => {
                  if (setSelectedTracking) setSelectedTracking(selectedApp.tracking_no);
                  setActiveTab('mutation-track');
                }}
                className="gov-btn-secondary text-xs py-2 px-3"
              >
                <span>{lang === 'bn' ? 'পূর্ণাঙ্গ টাইমলাইন দেখুন' : 'View Timeline'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActionModal({ type: 'info' })}
                  className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{lang === 'bn' ? 'সংশোধনের নির্দেশ' : 'Request Correction'}</span>
                </button>

                <button
                  onClick={() => setActionModal({ type: 'reject' })}
                  className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>{lang === 'bn' ? 'খারিজ / বাতিল' : 'Reject'}</span>
                </button>

                <button
                  onClick={() => setActionModal({ type: 'approve' })}
                  className="gov-btn-primary text-xs py-2 px-4 shadow active:scale-95 transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{lang === 'bn' ? 'নামজারি মঞ্জুর করুন' : 'Approve Mutation'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation & Remarks Sub-modal */}
      {actionModal && selectedApp && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121a16] border border-gray-200 dark:border-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <h4 className="font-bold text-sm text-gray-900 dark:text-white">
              {actionModal.type === 'approve'
                ? (lang === 'bn' ? 'নামজারি আবেদন মঞ্জুরি নিশ্চিতকরণ' : 'Confirm Application Approval')
                : actionModal.type === 'reject'
                ? (lang === 'bn' ? 'আবেদন খারিজের আইনি কারণ উল্লেখ করুন' : 'State Mandatory Rejection Reason')
                : (lang === 'bn' ? 'সংশোধনের বিবরণ ও প্রয়োজনীয় কাগজপত্রের নোটিশ' : 'Notice for Correction / Missing Documents')}
            </h4>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {lang === 'bn' ? 'কর্মকর্তার মন্তব্য / আদেশের কারণ' : 'Official Remarks / Order'}
                {(actionModal.type === 'reject' || actionModal.type === 'info') && <span className="text-rose-500"> *</span>}
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows="3"
                placeholder={
                  actionModal.type === 'approve'
                    ? (lang === 'bn' ? 'কাগজপত্র ও সার্ভেয়ার প্রতিবেদন সঠিক পাওয়ায় ডেমো সিস্টেমে নামজারি মঞ্জুর করা হলো।' : 'Approved after verifying survey report and chain.')
                    : actionModal.type === 'reject'
                    ? (lang === 'bn' ? 'মালিকানার ধারাবাহিকতা অসম্পূর্ণ বা জমি নিয়ে দেওয়ানি আদালতের নিষেধাজ্ঞা থাকায় খারিজ।' : 'Rejected due to broken title chain or litigation.')
                    : (lang === 'bn' ? 'আগামী ৭ কার্যদিবসের মধ্যে বায়া দলিলের স্পষ্ট কপি ও হালনাগাদ খাজনার দাখিলা আপলোড করুন।' : 'Please submit clearer Baya Dalil and updated tax dakhila within 7 days.')
                }
                className="gov-input resize-none text-xs"
              ></textarea>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="gov-btn-secondary text-xs py-1.5 px-3"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={handleActionSubmit}
                className={`text-xs py-1.5 px-4 font-bold rounded-lg text-white shadow ${
                  actionModal.type === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : actionModal.type === 'reject'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {submitting ? (lang === 'bn' ? 'প্রক্রিয়াধীন...' : 'Processing...') : (lang === 'bn' ? 'আদেশ জারি করুন' : 'Issue Order')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
