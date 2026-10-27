import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import {
  AlertOctagon, Search, ShieldAlert, Sparkles, CheckCircle2,
  AlertTriangle, RefreshCw, ArrowRight, Info
} from 'lucide-react';

export default function DueDiligence({ setActiveTab, setDueDiligenceResult, navigateBack }) {
  const { lang, t, user } = useApp();

  const [form, setForm] = useState({
    seller_name: '',
    seller_nid: '',
    deed_no: '',
    reg_year: 2025,
    district: 'ঢাকা',
    upazila: 'মিরপুর',
    mouza: 'পাইকপাড়া',
    khatian_no: 'BS-1045',
    plot_no: '',
    recorded_area: 5.0,
    proposed_area: 5.0,
    documents_held: ['মূল সাফা কবলা দলিল', 'সর্বশেষ আরএস/বিএস খতিয়ান'],
    has_court_dispute: false
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const docOptions = [
    'মূল সাফা কবলা দলিল',
    'সর্বশেষ আরএস/বিএস খতিয়ান',
    'নামজারি ও জমাভাগ খতিয়ান (ডিসিআরসহ)',
    'চলতি বাংলা সনের খাজনা/দাখিলা রশিদ',
    'ওয়ারিশান সনদপত্র',
    'জমির বাস্তব দখল প্রত্যয়ন'
  ];

  const handleDocToggle = (d) => {
    setForm(prev => {
      const exists = prev.documents_held.includes(d);
      return {
        ...prev,
        documents_held: exists
          ? prev.documents_held.filter(x => x !== d)
          : [...prev.documents_held, d]
      };
    });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // 1-Click Scenarios for Hackathon Demo
  const loadScenario = (type) => {
    if (type === 'clean') {
      // Clean low-risk parcel: DHK-MIR-002 owned by মোহাম্মদ রফিক
      setForm({
        seller_name: 'মোহাম্মদ রফিক',
        seller_nid: '19852692518000777',
        deed_no: 'D-8492',
        reg_year: 2023,
        district: 'ঢাকা',
        upazila: 'মিরপুর',
        mouza: 'পাইকপাড়া',
        khatian_no: 'BS-1046',
        plot_no: 'DHK-MIR-002',
        recorded_area: 6.5,
        proposed_area: 6.5,
        documents_held: [
          'মূল সাফা কবলা দলিল',
          'সর্বশেষ আরএস/বিএস খতিয়ান',
          'নামজারি ও জমাভাগ খতিয়ান (ডিসিআরসহ)',
          'চলতি বাংলা সনের খাজনা/দাখিলা রশিদ'
        ],
        has_court_dispute: false
      });
    } else if (type === 'duplicate') {
      // High-risk duplicate sale: Karim Hossain selling DHK-MIR-001 again
      setForm({
        seller_name: 'করিম হোসেন',
        seller_nid: '19752692518000111',
        deed_no: 'D-1002',
        reg_year: 2025,
        district: 'ঢাকা',
        upazila: 'মিরপুর',
        mouza: 'পাইকপাড়া',
        khatian_no: 'BS-1045',
        plot_no: 'DHK-MIR-001',
        recorded_area: 5.0,
        proposed_area: 7.5, // excess area anomaly!
        documents_held: ['মূল সাফা কবলা দলিল'],
        has_court_dispute: true
      });
    } else if (type === 'acquired') {
      // Acquired parcel: DHK-DHN-005
      setForm({
        seller_name: 'সোহরাব আলী',
        seller_nid: '19702692518000333',
        deed_no: 'D-3301',
        reg_year: 2024,
        district: 'ঢাকা',
        upazila: 'ধানমন্ডি',
        mouza: 'ধানমন্ডি',
        khatian_no: 'BS-3301',
        plot_no: 'DHK-DHN-005',
        recorded_area: 10.0,
        proposed_area: 10.0,
        documents_held: ['মূল সাফা কবলা দলিল'],
        has_court_dispute: true
      });
    }
  };

  const handleAssess = async (e) => {
    e.preventDefault();
    if (!form.seller_name || !form.plot_no) {
      setError(lang === 'bn' ? 'অনুগ্রহ করে বিক্রেতার নাম ও প্লট/দাগ নম্বর লিখুন।' : 'Please specify seller name and plot number.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        ...form,
        recorded_area: parseFloat(form.recorded_area) || 0,
        proposed_area: parseFloat(form.proposed_area) || 0
      };
      const result = await api.assessDueDiligence(payload, user?.id);
      setDueDiligenceResult(result);
      setActiveTab('due-diligence-report');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gov-container py-6 space-y-6 max-w-4xl">
      {/* Top Page Header with Universal Back Button & Breadcrumbs */}
      <PageHeader
        title={lang === 'bn' ? 'প্রাক-ক্রয় নাগরিক যাচাই ও ঝুঁকি রিপোর্ট' : 'Pre-Purchase Risk Assessment'}
        subtitle={
          lang === 'bn'
            ? 'বায়না বা ক্রয়ের চুক্তির আগে বিক্রেতার স্বত্ব, হস্তান্তরের ধারা, মামলার নিষেধাজ্ঞা বা দ্বৈত বিক্রির ঝুঁকি মূল্যায়ন করুন।'
            : 'Screen land titles for broken ownership chains, duplicate sales, rapid flipping, and litigation warnings.'
        }
        icon={AlertOctagon}
        badge={lang === 'bn' ? 'স্বত্ব ঝুঁকি নিরূপণ' : 'Due Diligence'}
        badgeColor="amber"
        breadcrumbs={[
          { label: lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }
        ]}
        setActiveTab={setActiveTab}
        onBack={() => navigateBack ? navigateBack('dashboard') : (setActiveTab && setActiveTab('dashboard'))}
        fallbackTab="dashboard"
      />

      {/* Preset 1-Click Demo Scenarios */}
      <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#c59b27]" />
            {lang === 'bn' ? 'প্রেজেন্টেশন ডেমো সিনারিও (১-ক্লিক)' : 'Demo Scenarios for Quick Evaluation:'}
          </span>
          <span className="text-[11px] text-gray-500">{lang === 'bn' ? 'সরাসরি পূরণ' : '1-Click Auto Fill'}</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => loadScenario('clean')}
            className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 transition shadow-sm flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>{lang === 'bn' ? 'দৃশ্যকল্প ১: নিষ্কণ্টক জমি (Low Risk)' : 'Scenario 1: Clean Title (Low)'}</span>
          </button>

          <button
            type="button"
            onClick={() => loadScenario('duplicate')}
            className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-800 dark:text-rose-300 hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3 h-3 text-rose-600" />
            <span>{lang === 'bn' ? 'দৃশ্যকল্প ২: একাধিকবার বিক্রি ও মামলা (High Risk)' : 'Scenario 2: Duplicate Sale & Dispute (High)'}</span>
          </button>

          <button
            type="button"
            onClick={() => loadScenario('acquired')}
            className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-purple-300 dark:border-purple-800 text-xs font-semibold text-purple-800 dark:text-purple-300 hover:bg-purple-100 transition shadow-sm flex items-center gap-1.5"
          >
            <AlertTriangle className="w-3 h-3 text-purple-600" />
            <span>{lang === 'bn' ? 'দৃশ্যকল্প ৩: সরকারি অধিগ্রহণাধীন জমি (Acquired)' : 'Scenario 3: Govt Acquisition'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Assessment Form */}
      <div className="gov-card p-6 space-y-6">
        <form onSubmit={handleAssess} className="space-y-5">
          {/* Section 1: Seller Details */}
          <div className="space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#0b462d] dark:text-emerald-400 border-b border-gray-100 dark:border-gray-800 pb-1.5">
              {lang === 'bn' ? '১. প্রস্তাবিত বিক্রেতার বিবরণ' : '1. Proposed Seller Details'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('sellerName')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="seller_name"
                  value={form.seller_name}
                  onChange={handleChange}
                  placeholder="যেমন: করিম হোসেন বা মোঃ রফিক"
                  className="gov-input"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {lang === 'bn' ? 'বিক্রেতার এনআইডি (ঐচ্ছিক)' : 'Seller NID (Optional)'}
                </label>
                <input
                  type="text"
                  name="seller_nid"
                  value={form.seller_nid}
                  onChange={handleChange}
                  placeholder="198xxxxxxxxxxxxxx"
                  className="gov-input"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Property & Land Area */}
          <div className="space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#0b462d] dark:text-emerald-400 border-b border-gray-100 dark:border-gray-800 pb-1.5">
              {lang === 'bn' ? '২. জমির তফসিল ও প্রস্তাবিত পরিমাপ' : '2. Parcel Details & Area Breakdown'}
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
                <input type="text" name="mouza" value={form.mouza} onChange={handleChange} className="gov-input" required />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('plotNo')} *</label>
                <input type="text" name="plot_no" value={form.plot_no} onChange={handleChange} placeholder="DHK-MIR-001" className="gov-input" required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('khatianNo')}</label>
                <input type="text" name="khatian_no" value={form.khatian_no} onChange={handleChange} placeholder="BS-1045" className="gov-input" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {lang === 'bn' ? 'খতিয়ানের মোট জমি' : 'Recorded Area'}
                </label>
                <input type="number" step="0.01" name="recorded_area" value={form.recorded_area} onChange={handleChange} className="gov-input" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {lang === 'bn' ? 'বিক্রির প্রস্তাবিত পরিমাণ' : 'Proposed Sale Area'} *
                </label>
                <input type="number" step="0.01" name="proposed_area" value={form.proposed_area} onChange={handleChange} className="gov-input" required />
              </div>
            </div>
          </div>

          {/* Section 3: Available Documents Checklist */}
          <div className="space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#0b462d] dark:text-emerald-400 border-b border-gray-100 dark:border-gray-800 pb-1.5">
              {lang === 'bn' ? '৩. বিক্রেতা কর্তৃক প্রদর্শিত কাগজপত্র' : '3. Documents Provided by Seller'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {docOptions.map((doc, idx) => {
                const isChecked = form.documents_held.includes(doc);
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

          {/* Section 4: Known Disputes */}
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-gray-900 dark:text-white block">
                {lang === 'bn' ? 'আদালতের নিষেধাজ্ঞা বা স্বত্ব বিরোধের কোনো তথ্য আছে?' : 'Any Known Civil Litigation / Injunction?'}
              </span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {lang === 'bn' ? 'স্থানীয়ভাবে জ্ঞাত কোনো মামলা বা নোটিশের তথ্য থাকলে চিহ্নিত করুন।' : 'Toggle if there are reported neighbor claims or court stays.'}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="has_court_dispute"
                checked={form.has_court_dispute}
                onChange={handleChange}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-rose-600"></div>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full gov-btn-gold justify-center text-xs py-3 font-bold shadow-md"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{lang === 'bn' ? 'এআই ঝুঁকি মডেল বিশ্লেষণ করছে...' : 'Analyzing Land Risk Indicators...'}</span>
              </>
            ) : (
              <>
                <AlertOctagon className="w-4 h-4" />
                <span>{lang === 'bn' ? 'প্রাক-ক্রয় ঝুঁকি বিশ্লেষণ করুন (Generate Due Diligence Report)' : 'Assess Land Purchase Risk'}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
