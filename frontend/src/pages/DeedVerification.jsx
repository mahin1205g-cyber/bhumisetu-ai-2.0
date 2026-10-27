import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import {
  FileCheck2, UploadCloud, Search, AlertTriangle, CheckCircle,
  FileText, Sparkles, RefreshCw, ArrowRight, Info, Cpu, CheckCircle2
} from 'lucide-react';

export default function DeedVerification({ setActiveTab, setVerificationResult, navigateBack }) {
  const { lang, t, user } = useApp();

  const [formData, setFormData] = useState({
    deed_no: '',
    reg_year: 2025,
    district: 'ঢাকা',
    upazila: 'মিরপুর',
    mouza: 'পাইকপাড়া',
    plot_id: '',
    khatian_no: '',
    owner_name: '',
    notes: ''
  });

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verifyStage, setVerifyStage] = useState(0);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  // Preset demo fillers for quick hackathon presentation!
  const loadScenario = (type) => {
    if (type === 'match') {
      // Clean Deed D-8492 on DHK-MIR-002
      setFormData({
        deed_no: 'D-8492',
        reg_year: 2023,
        district: 'ঢাকা',
        upazila: 'মিরপুর',
        mouza: 'পাইকপাড়া',
        plot_id: 'DHK-MIR-002',
        khatian_no: 'BS-1046',
        owner_name: 'মোহাম্মদ রফিক',
        notes: 'নমুনা যাচাই ১: সঠিক দলিল ও শতভাগ তথ্যের মিল'
      });
    } else if (type === 'mismatch_owner') {
      // Inconsistent owner name vs D-1001
      setFormData({
        deed_no: 'D-1001',
        reg_year: 2025,
        district: 'ঢাকা',
        upazila: 'মিরপুর',
        mouza: 'পাইকপাড়া',
        plot_id: 'DHK-MIR-001',
        khatian_no: 'BS-1045',
        owner_name: 'হারুনুর রশীদ (ভুল দাবিদার)',
        notes: 'নমুনা যাচাই ২: মালিকানা গরমিল ও নাম অমিল শনাক্তকরণ'
      });
    } else if (type === 'dispute') {
      // Parcel under active civil court dispute / multiple sales
      setFormData({
        deed_no: 'D-1003',
        reg_year: 2025,
        district: 'ঢাকা',
        upazila: 'মিরপুর',
        mouza: 'পাইকপাড়া',
        plot_id: 'DHK-MIR-001',
        khatian_no: 'BS-1045',
        owner_name: 'জাহিদ হাসান',
        notes: 'নমুনা যাচাই ৩: দেওয়ানি আদালতের স্বত্ব বিরোধ ও দ্বৈত বিক্রি'
      });
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!formData.deed_no && !formData.plot_id) {
      setError(lang === 'bn' ? 'অনুগ্রহ করে দলিল নম্বর অথবা দাগ/প্লট নম্বর লিখুন।' : 'Please provide either Deed Number or Plot ID.');
      return;
    }

    setLoading(true);
    setError('');
    setVerifyStage(1);

    try {
      await new Promise(r => setTimeout(r, 280));
      setVerifyStage(2);

      const resultPromise = api.verifyDeed(formData, user?.id);
      await new Promise(r => setTimeout(r, 320));
      setVerifyStage(3);

      const result = await resultPromise;
      await new Promise(r => setTimeout(r, 260));
      setVerifyStage(4);

      setVerificationResult(result);
      setActiveTab('verification-result');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setVerifyStage(0);
    }
  };

  const handleFileUpload = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setLoading(true);
    setError('');
    setVerifyStage(1);

    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      if (user?.id) fd.append('user_id', user.id);

      await new Promise(r => setTimeout(r, 280));
      setVerifyStage(2);

      const resultPromise = api.uploadDeed(fd);
      await new Promise(r => setTimeout(r, 320));
      setVerifyStage(3);

      const result = await resultPromise;
      await new Promise(r => setTimeout(r, 260));
      setVerifyStage(4);

      setVerificationResult(result);
      setActiveTab('verification-result');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setVerifyStage(0);
    }
  };

  return (
    <div className="gov-container py-6 space-y-6 max-w-4xl">
      {/* Top Page Header with Universal Back Button & Breadcrumbs */}
      <PageHeader
        title={lang === 'bn' ? 'ডিজিটাল দলিল ও মালিকানা যাচাই' : 'Digital Deed & Land Ownership Verification'}
        subtitle={
          lang === 'bn'
            ? 'দলিলের তথ্য বা স্ক্যান কপি আপলোড করে সাব-রেজিস্ট্রি বালাম রেকর্ডের সাথে স্বত্ব ও তথ্যের অমিল শনাক্ত করুন।'
            : 'Cross-reference submitted deed parameters or uploaded scans against registry demo records for title consistency.'
        }
        icon={FileCheck2}
        badge={lang === 'bn' ? 'C++ নেটিভ ভেরিফাইড' : 'C++ Accelerated'}
        badgeColor="emerald"
        breadcrumbs={[
          { label: lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }
        ]}
        setActiveTab={setActiveTab}
        onBack={() => navigateBack ? navigateBack('dashboard') : (setActiveTab && setActiveTab('dashboard'))}
        fallbackTab="dashboard"
      />

      {/* Staged Multi-Phase Verification Overlay */}
      {loading && (
        <div className="p-5 rounded-xl bg-slate-900 text-white border border-emerald-500/30 shadow-xl space-y-4 animate-page-enter">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-400 animate-pulse" />
              <span className="font-bold text-sm">
                {lang === 'bn' ? 'দলিল বিশ্লেষণ ও বালাম ক্রস-চেক চলছে...' : 'Cross-Checking Deed with Sub-Registry Balam...'}
              </span>
            </div>
            <span className="text-xs font-mono text-emerald-400 font-bold">
              {verifyStage === 1 ? 'Phase 1/3' : verifyStage === 2 ? 'Phase 2/3' : 'Phase 3/3'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className={`p-3 rounded-lg border transition-all ${
              verifyStage >= 1
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800/50 border-slate-700 text-slate-400'
            }`}>
              <div className="font-semibold flex items-center gap-1.5">
                {verifyStage > 1 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />}
                <span>1. {lang === 'bn' ? 'দলিল ও তথ্য প্রক্রিয়াকরণ' : 'Deed Parsing'}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {lang === 'bn' ? 'দলিল নং ও দাগ শনাক্তকরণ' : 'Parsing deed & plot tags'}
              </p>
            </div>

            <div className={`p-3 rounded-lg border transition-all ${
              verifyStage >= 2
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800/50 border-slate-700 text-slate-400'
            }`}>
              <div className="font-semibold flex items-center gap-1.5">
                {verifyStage > 2 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : verifyStage === 2 ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-600 inline-block" />}
                <span>2. {lang === 'bn' ? 'বালাম বই ক্রস-ম্যাচ' : 'Balam Registry Match'}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {lang === 'bn' ? 'সাব-রেজিস্ট্রি বালাম যাচাই' : 'Sub-registry record match'}
              </p>
            </div>

            <div className={`p-3 rounded-lg border transition-all ${
              verifyStage >= 3
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800/50 border-slate-700 text-slate-400'
            }`}>
              <div className="font-semibold flex items-center gap-1.5">
                {verifyStage >= 3 ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-600 inline-block" />}
                <span>3. {lang === 'bn' ? 'C++ জালিয়াতি ও কার্টেল' : 'C++ Native Graph Engine'}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {lang === 'bn' ? 'সাইকেল ও নাম গরমিল এআই' : 'Cartel cycle & fraud graph'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Test Scenario Loaders */}
      <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#c59b27]" />
            {lang === 'bn' ? 'দ্রুত টেস্ট নমুনা লোড করুন' : 'Quick Test Scenarios'}
          </span>
          <span className="text-[11px] text-gray-500">{lang === 'bn' ? '১-ক্লিকে পূরণ' : '1-Click Preset'}</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => loadScenario('match')}
            className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 transition shadow-sm flex items-center gap-1.5"
          >
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            <span>{lang === 'bn' ? 'নমুনা ১: শতভাগ মিল (Clear Title)' : 'Scenario 1: Full Match'}</span>
          </button>

          <button
            type="button"
            onClick={() => loadScenario('mismatch_owner')}
            className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 transition shadow-sm flex items-center gap-1.5"
          >
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>{lang === 'bn' ? 'নমুনা ২: বিক্রেতার নাম গরমিল' : 'Scenario 2: Owner Mismatch'}</span>
          </button>

          <button
            type="button"
            onClick={() => loadScenario('dispute')}
            className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-800 dark:text-rose-300 hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5"
          >
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>{lang === 'bn' ? 'নমুনা ৩: দেওয়ানি আদালতের বিরোধ' : 'Scenario 3: Title Litigation'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Dual Grid: Form & File Upload */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Structured Input Form */}
        <div className="md:col-span-2 gov-card p-6 space-y-5">
          <h2 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
            <Search className="w-4 h-4 text-[#0b462d] dark:text-emerald-400" />
            <span>{lang === 'bn' ? '১. দলিলের পরিচিতি ও বিবরণ দিন' : '1. Enter Deed Identification Details'}</span>
          </h2>

          <form onSubmit={handleVerify} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('deedNo')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="deed_no"
                  value={formData.deed_no}
                  onChange={handleChange}
                  placeholder={lang === 'bn' ? 'যেমন: D-8492 অথবা D-1001' : 'e.g., D-8492 or D-1001'}
                  className="gov-input"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('regYear')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  name="reg_year"
                  value={formData.reg_year}
                  onChange={handleChange}
                  min="1950"
                  max="2026"
                  className="gov-input"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('district')}
                </label>
                <select name="district" value={formData.district} onChange={handleChange} className="gov-select">
                  <option value="ঢাকা">ঢাকা (Dhaka)</option>
                  <option value="চট্টগ্রাম">চট্টগ্রাম (Chattogram)</option>
                  <option value="রাজশাহী">রাজশাহী (Rajshahi)</option>
                  <option value="সিলেট">সিলেট (Sylhet)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('upazila')}
                </label>
                <input
                  type="text"
                  name="upazila"
                  value={formData.upazila}
                  onChange={handleChange}
                  placeholder="মিরপুর / সদর"
                  className="gov-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('mouza')}
                </label>
                <input
                  type="text"
                  name="mouza"
                  value={formData.mouza}
                  onChange={handleChange}
                  placeholder="পাইকপাড়া"
                  className="gov-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('plotNo')}
                </label>
                <input
                  type="text"
                  name="plot_id"
                  value={formData.plot_id}
                  onChange={handleChange}
                  placeholder="DHK-MIR-002"
                  className="gov-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('khatianNo')}
                </label>
                <input
                  type="text"
                  name="khatian_no"
                  value={formData.khatian_no}
                  onChange={handleChange}
                  placeholder="BS-1046"
                  className="gov-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {lang === 'bn' ? 'মালিক / গ্রহীতার নাম' : 'Owner / Transferee Name'}
                </label>
                <input
                  type="text"
                  name="owner_name"
                  value={formData.owner_name}
                  onChange={handleChange}
                  placeholder="মোহাম্মদ রফিক"
                  className="gov-input"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {lang === 'bn' ? 'অতিরিক্ত মন্তব্য বা পর্যবেক্ষণ (ঐচ্ছিক)' : 'Additional Notes (Optional)'}
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows="2"
                placeholder={lang === 'bn' ? 'যাচাই সম্পর্কিত কোনো বিশেষ তথ্য...' : 'Any special notes for review...'}
                className="gov-input resize-none"
              ></textarea>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full gov-btn-primary justify-center text-xs py-3 font-bold shadow"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{lang === 'bn' ? 'বালাম রেকর্ডের সাথে তুলনা হচ্ছে...' : 'Comparing against demo records...'}</span>
                </>
              ) : (
                <>
                  <FileCheck2 className="w-4 h-4" />
                  <span>{lang === 'bn' ? 'দলিল ও বালাম ক্রস-চেক করুন' : 'Verify Deed & Cross-Check Balam'}</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right 1 Col: Document Upload / OCR Extraction */}
        <div className="gov-card p-6 flex flex-col justify-between space-y-4">
          <div>
            <h2 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
              <UploadCloud className="w-4 h-4 text-[#c59b27]" />
              <span>{lang === 'bn' ? '২. স্ক্যান দলিল আপলোড (OCR)' : '2. Scan Document Upload'}</span>
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
              {lang === 'bn'
                ? 'পিডিএফ বা দলিলের ছবি আপলোড করলে সিস্টেম স্বয়ংক্রিয়ভাবে টেক্সট এক্সট্রাক্ট করে বালাম রেকর্ডের সাথে মিলিয়ে নেবে।'
                : 'Upload scanned deed PDF. Our parser automatically extracts parties and parcel identifiers.'}
            </p>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${
              dragActive
                ? 'border-[#0b462d] bg-emerald-50 dark:bg-emerald-950/40'
                : 'border-gray-300 dark:border-gray-700 hover:border-[#0b462d] bg-gray-50/50 dark:bg-gray-800/20'
            }`}
            onClick={() => document.getElementById('deed-file-input').click()}
          >
            <input
              id="deed-file-input"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
            <UploadCloud className="w-10 h-10 text-[#0b462d] dark:text-emerald-400 mx-auto mb-2" />
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 block">
              {file ? file.name : (lang === 'bn' ? 'ফাইল নির্বাচন বা ড্রপ করুন' : 'Drop or Select File')}
            </span>
            <span className="text-[10px] text-gray-400 block mt-1">
              PDF, JPG, PNG (Max 10MB)
            </span>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
            <div className="flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                {lang === 'bn'
                  ? 'স্বচ্ছতা নোট: অপটিক্যাল টেক্সট এক্সট্রাকশন pypdf ও রেগুলার এক্সপ্রেশন অ্যালগরিদম ভিত্তিক। স্ক্যান কোয়ালিটি খারাপ হলে ম্যানুয়াল রিভিউ আবশ্যক।'
                  : 'Transparency notice: Text extraction operates via pypdf and rule-based regex parsing. Low resolution scans require manual clerk review.'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
