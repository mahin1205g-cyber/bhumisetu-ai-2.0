import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import {
  GitBranchPlus, User, MapPin, FileText, CheckCircle2, Save,
  Send, ArrowRight, ArrowLeft, AlertTriangle, Sparkles, RefreshCw
} from 'lucide-react';

export default function SmartMutation({ setActiveTab, setSelectedTracking, navigateBack }) {
  const { lang, t, user } = useApp();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successApp, setSuccessApp] = useState(null);

  const [form, setForm] = useState({
    applicant_name: user?.name || 'মোঃ রফিকুল ইসলাম',
    applicant_nid: user?.nid || '19902692518000123',
    applicant_phone: user?.phone || '01711002233',
    applicant_address: 'বাড়ি-১২, রোড-৪, ব্লক-বি, মিরপুর-১, ঢাকা',
    applicant_relation: 'Self',
    district: 'ঢাকা',
    upazila: 'মিরপুর',
    mouza: 'পাইকপাড়া',
    jl_no: '১০২',
    khatian_type: 'BS',
    khatian_no: 'BS-1046',
    plot_no: 'DHK-MIR-002',
    land_area: 6.5,
    land_class: 'বাড়ি (Homestead)',
    ownership_source: 'ক্রয়সূত্রে (Purchase)',
    deed_no: 'D-8492',
    deed_date: '2023-04-18',
    supporting_docs: ['মূল সাফা কবলা দলিল D-8492', 'হালনাগাদ দাখিলা ও খাজনা রশিদ', 'জাতীয় পরিচয়পত্র কপি']
  });

  const availableDocs = [
    'মূল সাফা কবলা দলিল D-8492',
    'ওয়ারিশান সনদপত্র (প্রযোজ্য ক্ষেত্রে)',
    'সর্বশেষ আরএস/বিএস খতিয়ান কপি',
    'হালনাগাদ দাখিলা ও খাজনা রশিদ',
    'জাতীয় পরিচয়পত্র কপি',
    'জমির হাতনকশা বা সীমানা স্কেচ'
  ];

  const handleDocToggle = (docName) => {
    setForm(prev => {
      const exists = prev.supporting_docs.includes(docName);
      return {
        ...prev,
        supporting_docs: exists
          ? prev.supporting_docs.filter(d => d !== docName)
          : [...prev.supporting_docs, docName]
      };
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePresetFill = () => {
    setForm({
      applicant_name: 'মোঃ জাহিদ হাসান',
      applicant_nid: '19942692518000888',
      applicant_phone: '01819991122',
      applicant_address: 'মিরপুর-২, ঢাকা',
      applicant_relation: 'Self',
      district: 'ঢাকা',
      upazila: 'মিরপুর',
      mouza: 'পাইকপাড়া',
      jl_no: '১০২',
      khatian_type: 'BS',
      khatian_no: 'BS-1045',
      plot_no: 'DHK-MIR-001',
      land_area: 5.0,
      land_class: 'বাণিজ্যিক (Commercial)',
      ownership_source: 'ক্রয়সূত্রে (Purchase)',
      deed_no: 'D-1003',
      deed_date: '2025-09-15',
      supporting_docs: ['মূল সাফা কবলা দলিল D-8492', 'হালনাগাদ দাখিলা ও খাজনা রশিদ']
    });
  };

  const handleSubmit = async (isDraft = false) => {
    setError('');
    setLoading(true);

    try {
      const payload = {
        ...form,
        land_area: parseFloat(form.land_area) || 0,
        is_draft: isDraft
      };

      const result = await api.applyMutation(payload, user?.id);
      setSuccessApp(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (successApp) {
    return (
      <div className="gov-container py-12 max-w-2xl text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-[#0b462d] dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {successApp.status === 'Draft'
              ? (lang === 'bn' ? 'আবেদন খসড়া হিসেবে সংরক্ষিত হয়েছে!' : 'Application Saved as Draft!')
              : (lang === 'bn' ? 'ই-নামজারি আবেদন সফলভাবে দাখিল হয়েছে!' : 'E-Namjari Application Submitted Successfully!')}
          </h2>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            {lang === 'bn'
              ? 'আপনার আবেদনটি সহকারী কমিশনার (ভূমি) কার্যালয়ের ডিজিটাল রিভিউ কিউতে প্রেরণ করা হয়েছে।'
              : 'Your application has been routed to the AC Land office demo review queue.'}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 inline-block text-left space-y-2 min-w-[300px]">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">{t('trackingNo')}:</span>
            <strong className="font-mono text-emerald-700 dark:text-emerald-400">{successApp.tracking_no}</strong>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">{lang === 'bn' ? 'স্ট্যাটাস:' : 'Status:'}</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">{successApp.status}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">{lang === 'bn' ? 'প্লট / দাগ:' : 'Plot ID:'}</span>
            <span className="font-semibold">{successApp.plot_no}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={() => {
              if (setSelectedTracking) setSelectedTracking(successApp.tracking_no);
              setActiveTab('mutation-track');
            }}
            className="gov-btn-primary text-xs py-2 px-5"
          >
            <GitBranchPlus className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'অগ্রগতি ট্র্যাক করুন (Visual Timeline)' : 'Track Application Progress'}</span>
          </button>

          <button
            onClick={() => {
              setSuccessApp(null);
              setStep(1);
            }}
            className="gov-btn-secondary text-xs py-2 px-4"
          >
            {lang === 'bn' ? 'নতুন আরেকটি আবেদন' : 'Apply Another'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gov-container py-6 space-y-6 max-w-3xl">
      {/* Top Page Header with Universal Back Button & Breadcrumbs */}
      <PageHeader
        title={lang === 'bn' ? 'স্মার্ট ই-নামজারি ও জমাভাগ আবেদন' : 'Smart E-Namjari & Mutation Application'}
        subtitle={
          lang === 'bn'
            ? 'অনলাইনে আবেদন ফরম পূরণ করুন, খসড়া সংরক্ষণ করুন অথবা সরাসরি দাখিল করে ট্র্যাকিং নম্বর সংগ্রহ করুন।'
            : 'Guided e-mutation application with instant tracking and automated document validation.'
        }
        icon={GitBranchPlus}
        badge={lang === 'bn' ? `ধাপ ${step} / ৪` : `Step ${step} of 4`}
        badgeColor="emerald"
        breadcrumbs={[
          { label: lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }
        ]}
        setActiveTab={setActiveTab}
        onBack={() => {
          if (step > 1) {
            setStep(s => s - 1);
          } else {
            navigateBack ? navigateBack('dashboard') : (setActiveTab && setActiveTab('dashboard'));
          }
        }}
        fallbackTab="dashboard"
        actions={
          <button
            type="button"
            onClick={handlePresetFill}
            className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-[#0b462d] dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold hover:bg-emerald-100 flex items-center gap-1.5 shadow-xs transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{lang === 'bn' ? 'ডেমো তথ্য পূরণ' : 'Load Demo Preset'}</span>
          </button>
        }
      />

      {/* Progress Steps Header */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {[
          { num: 1, label: lang === 'bn' ? '১. আবেদনকারী' : '1. Applicant', icon: User },
          { num: 2, label: lang === 'bn' ? '২. জমির তফসিল' : '2. Property', icon: MapPin },
          { num: 3, label: lang === 'bn' ? '৩. দলিল ও কাগজ' : '3. Documents', icon: FileText },
          { num: 4, label: lang === 'bn' ? '৪. দাখিল ও যাচাই' : '4. Submit', icon: Send }
        ].map(s => {
          const isActive = step === s.num;
          const isDone = step > s.num;
          return (
            <div
              key={s.num}
              onClick={() => setStep(s.num)}
              className={`p-2.5 rounded-xl border transition cursor-pointer ${
                isActive
                  ? 'border-[#0b462d] bg-[#0b462d]/10 dark:bg-emerald-950/50 font-bold text-[#0b462d] dark:text-emerald-400'
                  : isDone
                  ? 'border-emerald-300 text-emerald-800 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'border-gray-200 dark:border-gray-800 text-gray-400'
              }`}
            >
              <div className="text-[11px] font-semibold">{s.label}</div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Wizard Form Cards */}
      <div className="gov-card p-6 space-y-5">
        {/* Step 1: Applicant Details */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
              <User className="w-4 h-4 text-[#0b462d] dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'ধাপ ১: আবেদনকারীর ব্যক্তিগত তথ্য' : 'Step 1: Applicant Information'}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {lang === 'bn' ? 'আবেদনকারীর পুরো নাম' : 'Applicant Full Name'} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="applicant_name"
                  value={form.applicant_name}
                  onChange={handleChange}
                  className="gov-input"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('nid')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="applicant_nid"
                  value={form.applicant_nid}
                  onChange={handleChange}
                  placeholder="১০ বা ১৭ ডিজিটের এনআইডি"
                  className="gov-input"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {lang === 'bn' ? 'মোবাইল নম্বর' : 'Mobile Phone'} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="applicant_phone"
                  value={form.applicant_phone}
                  onChange={handleChange}
                  placeholder="017xxxxxxxx"
                  className="gov-input"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {lang === 'bn' ? 'আবেদনকারীর সম্পর্ক' : 'Applicant Relation'}
                </label>
                <select name="applicant_relation" value={form.applicant_relation} onChange={handleChange} className="gov-select">
                  <option value="Self">{lang === 'bn' ? 'নিজে (মালিক)' : 'Self (Owner)'}</option>
                  <option value="Heir">{lang === 'bn' ? 'ওয়ারিশ সূত্রে' : 'Legal Heir'}</option>
                  <option value="Representative">{lang === 'bn' ? 'ক্ষমতাপ্রাপ্ত প্রতিনিধি (আমমোক্তার)' : 'Authorized Representative'}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {lang === 'bn' ? 'বর্তমান ও যোগাযোগের ঠিকানা' : 'Address'}
              </label>
              <textarea
                name="applicant_address"
                value={form.applicant_address}
                onChange={handleChange}
                rows="2"
                className="gov-input resize-none"
              ></textarea>
            </div>
          </div>
        )}

        {/* Step 2: Property Details */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
              <MapPin className="w-4 h-4 text-[#0b462d] dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'ধাপ ২: আবেদনকৃত জমির তফসিল ও অবস্থান' : 'Step 2: Property Schedule & Location'}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('district')}</label>
                <select name="district" value={form.district} onChange={handleChange} className="gov-select">
                  <option value="ঢাকা">ঢাকা (Dhaka)</option>
                  <option value="চট্টগ্রাম">চট্টগ্রাম (Chattogram)</option>
                  <option value="রাজশাহী">রাজশাহী (Rajshahi)</option>
                  <option value="সিলেট">সিলেট (Sylhet)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('upazila')}</label>
                <input type="text" name="upazila" value={form.upazila} onChange={handleChange} className="gov-input" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('mouza')}</label>
                <input type="text" name="mouza" value={form.mouza} onChange={handleChange} className="gov-input" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('khatianType')}</label>
                <select name="khatian_type" value={form.khatian_type} onChange={handleChange} className="gov-select">
                  <option value="BS">বিএস (BS / City Survey)</option>
                  <option value="RS">আরএস (RS)</option>
                  <option value="SA">এসএ (SA)</option>
                  <option value="CS">সিএস (CS)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('khatianNo')} *</label>
                <input type="text" name="khatian_no" value={form.khatian_no} onChange={handleChange} className="gov-input" required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('plotNo')} *</label>
                <input type="text" name="plot_no" value={form.plot_no} onChange={handleChange} className="gov-input" required />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('landArea')} *</label>
                <input type="number" step="0.01" name="land_area" value={form.land_area} onChange={handleChange} className="gov-input" required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('landClass')}</label>
                <select name="land_class" value={form.land_class} onChange={handleChange} className="gov-select">
                  <option value="বাড়ি (Homestead)">বাড়ি (Homestead)</option>
                  <option value="নাল (Nal / Agricultural)">নাল (Nal / Agricultural)</option>
                  <option value="বাণিজ্যিক (Commercial)">বাণিজ্যিক (Commercial)</option>
                  <option value="ভিটি (Highland)">ভিটি (Highland)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Supporting Documents & Deeds */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
              <FileText className="w-4 h-4 text-[#0b462d] dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'ধাপ ৩: মালিকানা সূত্র ও সহায়ক কাগজপত্র' : 'Step 3: Ownership Source & Documents'}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {lang === 'bn' ? 'মালিকানা অর্জনের সূত্র' : 'Source of Ownership'}
                </label>
                <select name="ownership_source" value={form.ownership_source} onChange={handleChange} className="gov-select">
                  <option value="ক্রয়সূত্রে (Purchase)">ক্রয়সূত্রে (Purchase)</option>
                  <option value="ওয়ারিশসূত্রে (Inheritance)">ওয়ারিশসূত্রে (Inheritance)</option>
                  <option value="হেবা / দানসূত্রে (Gift / Heba)">হেবা / দানসূত্রে (Gift / Heba)</option>
                  <option value="বন্দোবস্তসূত্রে (Settlement)">বন্দোবস্তসূত্রে (Settlement)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {lang === 'bn' ? 'মূল বালাম দলিল নং' : 'Registered Deed No'} *
                </label>
                <input type="text" name="deed_no" value={form.deed_no} onChange={handleChange} className="gov-input" required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {lang === 'bn' ? 'দলিল সম্পাদনের তারিখ' : 'Deed Date'}
                </label>
                <input type="date" name="deed_date" value={form.deed_date} onChange={handleChange} className="gov-input" />
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                {lang === 'bn' ? 'সংযুক্ত সহায়ক কাগজপত্র টিক দিন:' : 'Check Available Supporting Documents:'}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableDocs.map((doc, idx) => {
                  const isChecked = form.supporting_docs.includes(doc);
                  return (
                    <div
                      key={idx}
                      onClick={() => handleDocToggle(doc)}
                      className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition ${
                        isChecked
                          ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 font-semibold text-emerald-900 dark:text-emerald-200'
                          : 'border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <span>{doc}</span>
                      <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold ${
                        isChecked ? 'bg-emerald-600 text-white' : 'border border-gray-300'
                      }`}>
                        {isChecked ? '✓' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review & Submit */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
              <CheckCircle2 className="w-4 h-4 text-[#0b462d] dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'ধাপ ৪: চূড়ান্ত পর্যালোচনা ও দাখিল' : 'Step 4: Review & Submission'}</span>
            </h3>

            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 text-xs space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">{lang === 'bn' ? 'আবেদনকারী:' : 'Applicant:'}</span> <strong>{form.applicant_name}</strong></div>
                <div><span className="text-gray-500">{t('nid')}:</span> <strong>{form.applicant_nid}</strong></div>
                <div><span className="text-gray-500">{t('district')} ও {t('upazila')}:</span> <strong>{form.district}, {form.upazila}</strong></div>
                <div><span className="text-gray-500">{t('mouza')}:</span> <strong>{form.mouza} (জে.এল {form.jl_no})</strong></div>
                <div><span className="text-gray-500">{t('khatianNo')}:</span> <strong>{form.khatian_no} ({form.khatian_type})</strong></div>
                <div><span className="text-gray-500">{t('plotNo')}:</span> <strong>{form.plot_no}</strong></div>
                <div><span className="text-gray-500">{t('landArea')}:</span> <strong>{form.land_area} শতক</strong></div>
                <div><span className="text-gray-500">{t('deedNo')}:</span> <strong>{form.deed_no}</strong></div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 text-xs text-emerald-800 dark:text-emerald-300">
              {lang === 'bn'
                ? `সংযুক্ত দলিলপত্র: ${form.supporting_docs.length}টি নথি চিহ্নিত করা হয়েছে।`
                : `Attached documents: ${form.supporting_docs.length} files attached.`}
            </div>
          </div>
        )}

        {/* Wizard Footer Controls */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="gov-btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('btnBack')}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSubmit(true)}
              className="px-3.5 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 text-xs font-semibold flex items-center gap-1.5 border border-gray-300 dark:border-gray-700"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t('btnSaveDraft')}</span>
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="gov-btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
              >
                <span>{t('btnNext')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSubmit(false)}
                className="gov-btn-gold text-xs py-2 px-5 flex items-center gap-1.5 shadow"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{lang === 'bn' ? 'দাখিল হচ্ছে...' : 'Submitting...'}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'চূড়ান্ত আবেদন দাখিল করুন' : 'Submit Application'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
