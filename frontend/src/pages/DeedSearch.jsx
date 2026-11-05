import Input from '../components/Input';
import Button from '../components/Button';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import {
  Search, SlidersHorizontal, AlertTriangle, CheckCircle2, X, RefreshCw,
  ChevronLeft, ChevronRight, MapPin, Calendar, Building2, FileText, Info,
  Lock, Clock, Eye, Loader2, UserRound, Hash, Layers
} from 'lucide-react';

const EMPTY_FILTERS = {
  district: '',
  upazila: '',
  reg_year: '',
  deed_type: '',
  seller_name: '',
  buyer_name: '',
  mouza: '',
  plot_id: '',
  khatian_no: ''
};

const DISTRICTS = ['ঢাকা', 'চট্টগ্রাম', 'রাজশাহী', 'সিলেট'];

const NOT_FOUND_MESSAGE_BN =
  "দুঃখিত! আপনার প্রদত্ত দলিল নম্বরটি আমাদের উপলব্ধ ডেটাবেজে খুঁজে পাওয়া যায়নি। অনুগ্রহ করে সঠিক দলিল নম্বর প্রদান করুন অথবা নিচের 'দলিল নম্বর খুঁজুন' অপশন ব্যবহার করে প্রয়োজনীয় তথ্যের মাধ্যমে দলিল অনুসন্ধান করুন।";

const SCOPE_NOTE_BN =
  'এই ফলাফল শুধুমাত্র ভূমিসেতুতে উপলব্ধ ডেটাবেজ রেকর্ডের উপর ভিত্তি করে। ডেটাবেজে না পাওয়া মানে দলিলটি জাল, অবৈধ বা আইনগতভাবে অস্তিত্বহীন নয়।';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

function toBnDigits(value) {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

function formatCountdown(seconds, lang) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts = [];
  if (hours) parts.push(lang === 'bn' ? `${toBnDigits(hours)} ঘণ্টা` : `${hours} hr`);
  if (minutes) parts.push(lang === 'bn' ? `${toBnDigits(minutes)} মিনিট` : `${minutes} min`);
  if (!hours) parts.push(lang === 'bn' ? `${toBnDigits(secs)} সেকেন্ড` : `${secs} sec`);
  return parts.join(' ');
}

function isDeedNumberShaped(value) {
  return /^[0-9\u09E6-\u09EFA-Za-z\s\-/]+$/.test(value);
}

function formatArea(value, lang) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return lang === 'bn' ? `${toBnDigits(numeric)} শতক` : `${numeric} decimal`;
}

function getDeedTypeLabel(code, deedTypes, lang) {
  if (!code) return null;
  const normalize = (value) => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const selected = normalize(code);
  const item = (deedTypes || []).find((type) => (
    [type.code, type.name_bn, type.name_en].some((alias) => normalize(alias) === selected)
  ));
  return item ? (lang === 'bn' ? item.name_bn : item.name_en) : code;
}

function DeedCard({ deed, lang, onDetail, onSelect, index = 0, deedTypes = [] }) {
  const area = formatArea(deed.area, lang);
  const facts = [
    { label: lang === 'bn' ? 'দলিলের ধরন' : 'Deed Type', value: getDeedTypeLabel(deed.deed_type, deedTypes, lang), icon: FileText },
    { label: lang === 'bn' ? 'সাব-রেজিস্ট্রি অফিস' : 'Sub-registry Office', value: deed.sub_registry_office, icon: Building2 },
    { label: lang === 'bn' ? 'জেলা' : 'District', value: deed.district, icon: MapPin },
    { label: lang === 'bn' ? 'উপজেলা' : 'Upazila', value: deed.upazila, icon: MapPin },
    { label: lang === 'bn' ? 'মৌজা' : 'Mouza', value: deed.mouza, icon: Layers },
    { label: lang === 'bn' ? 'দাগ নম্বর' : 'Dag Number', value: deed.plot_id, icon: Hash },
    { label: lang === 'bn' ? 'খতিয়ান নম্বর' : 'Khatian Number', value: deed.khatian_no, icon: FileText },
    { label: lang === 'bn' ? 'জমির পরিমাণ' : 'Land Area', value: area, icon: Layers },
    { label: lang === 'bn' ? 'নিবন্ধন তারিখ' : 'Registration Date', value: deed.reg_date, icon: Calendar }
  ].filter((item) => item.value !== undefined && item.value !== null && item.value !== '');

  return (
    <article
      className="gov-card p-4 sm:p-5 space-y-4 animate-result-in"
      style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-[#17212B] dark:text-white break-words">
              {deed.deed_no}
            </h3>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F0FDF4] dark:bg-emerald-950/50 text-[#047857] dark:text-emerald-300 border border-[#D1FAE5] dark:border-emerald-800">
              {deed.reg_year ? (lang === 'bn' ? `${toBnDigits(deed.reg_year)} সাল` : String(deed.reg_year)) : ''}
            </span>
          </div>
          <p className="text-[11px] text-[#64748B] dark:text-slate-400 mt-1">
            {deed.is_synthetic_demo_record
              ? (lang === 'bn' ? 'ডেমো রেকর্ড • অ্যাপ্লিকেশন ডেটাবেজ' : 'Demo record • application database')
              : (lang === 'bn' ? 'অ্যাপ্লিকেশন ডেটাবেজ রেকর্ড' : 'Application database record')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => onDetail(deed.id)}
            className="gov-btn-secondary text-xs py-1.5 px-3 flex-shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'বিস্তারিত দেখুন' : 'View details'}</span>
          </Button>
          {onSelect && (
            <Button
              type="button"
              onClick={() => onSelect(deed)}
              className="gov-btn-primary text-xs py-1.5 px-3 flex-shrink-0"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'এই দলিল যাচাই করুন' : 'Verify this deed'}</span>
            </Button>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3">
        {facts.map((fact) => {
          const Icon = fact.icon;
          return (
            <div key={fact.label} className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wider font-semibold text-[#94A3B8] dark:text-slate-500 flex items-center gap-1">
                <Icon className="w-3 h-3" />
                <span>{fact.label}</span>
              </dt>
              <dd className="text-xs font-semibold text-[#17212B] dark:text-slate-200 mt-0.5 break-words leading-relaxed">
                {fact.value}
              </dd>
            </div>
          );
        })}
      </dl>

      {(deed.seller_name || deed.buyer_name || deed.price !== undefined) && (
        <div className="pt-3 border-t border-[#F1F5F9] dark:border-gray-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {deed.seller_name && (
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#94A3B8] dark:text-slate-500 flex items-center gap-1">
                <UserRound className="w-3 h-3" />
                <span>{lang === 'bn' ? 'বিক্রেতা' : 'Seller'}</span>
              </span>
              <p className="text-xs font-semibold text-[#17212B] dark:text-slate-200 break-words">{deed.seller_name}</p>
            </div>
          )}
          {deed.buyer_name && (
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#94A3B8] dark:text-slate-500 flex items-center gap-1">
                <UserRound className="w-3 h-3" />
                <span>{lang === 'bn' ? 'ক্রেতা' : 'Buyer'}</span>
              </span>
              <p className="text-xs font-semibold text-[#17212B] dark:text-slate-200 break-words">{deed.buyer_name}</p>
            </div>
          )}
          {deed.price !== undefined && (
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#94A3B8] dark:text-slate-500">
                {lang === 'bn' ? 'মূল্য' : 'Price'}
              </span>
              <p className="text-xs font-semibold text-[#17212B] dark:text-slate-200 break-words">
                {lang === 'bn' ? `৳ ${toBnDigits(Number(deed.price).toLocaleString('en-US'))}` : `BDT ${Number(deed.price).toLocaleString('en-US')}`}
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function CardSkeleton() {
  return (
    <div className="gov-card p-5 space-y-4" aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <div className="h-5 w-28 rounded bg-slate-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-7 w-24 rounded bg-slate-100 dark:bg-gray-800 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-2.5 w-16 rounded bg-slate-100 dark:bg-gray-800 animate-pulse" />
            <div className="h-3.5 w-24 rounded bg-slate-100 dark:bg-gray-800 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DeedSearch({ setActiveTab, navigateBack, initialDeedNo = '', onSelectDeed }) {
  const { lang } = useApp();
  const bn = lang === 'bn';

  const [numberQuery, setNumberQuery] = useState(String(initialDeedNo || ''));
  const [numberError, setNumberError] = useState('');
  const [numberResult, setNumberResult] = useState(null);
  const [numberLoading, setNumberLoading] = useState(false);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [advancedResult, setAdvancedResult] = useState(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [advancedError, setAdvancedError] = useState('');
  const [deedTypes, setDeedTypes] = useState([]);

  const [protection, setProtection] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [pageError, setPageError] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const numberInputRef = useRef(null);
  const advancedPanelRef = useRef(null);
  const resultRef = useRef(null);

  const locked = Boolean(protection?.locked);
  const isAdvancedNoMatch = advancedResult?.found === false;
  const reportedUnmatchedFields = Array.isArray(advancedResult?.unmatched_fields)
    ? advancedResult.unmatched_fields
    : [];
  const advancedWarningFieldKeys = isAdvancedNoMatch
    ? (reportedUnmatchedFields.length ? reportedUnmatchedFields : Object.keys(appliedFilters || {}))
    : [];
  const activeAdvancedWarningFields = advancedWarningFieldKeys.filter((key) => (
    String(filters[key] ?? '').trim()
    && String(filters[key]) === String(appliedFilters?.[key] ?? '')
  ));
  const advancedWarningLabels = {
    district: bn ? 'জেলা' : 'District',
    upazila: bn ? 'উপজেলা' : 'Upazila',
    reg_year: bn ? 'দলিলের সাল' : 'Registration year',
    deed_type: bn ? 'দলিলের ধরন' : 'Deed type',
    seller_name: bn ? 'বিক্রেতার নাম' : 'Seller name',
    buyer_name: bn ? 'ক্রেতার নাম' : 'Buyer name',
    mouza: bn ? 'মৌজার নাম' : 'Mouza name',
    plot_id: bn ? 'দাগ নম্বর' : 'Dag number',
    khatian_no: bn ? 'খতিয়ান নম্বর' : 'Khatian number',
  };
  const advancedFieldHasWarning = (key) => activeAdvancedWarningFields.includes(key);
  const advancedWarningValue = (key) => key === 'deed_type'
    ? (getDeedTypeLabel(appliedFilters?.[key], deedTypes, lang) || appliedFilters?.[key])
    : appliedFilters?.[key];
  const advancedFieldWarningId = (key) => `advanced-field-warning-${key}`;
  const advancedFieldClass = (key, baseClass) => (
    advancedFieldHasWarning(key)
      ? `${baseClass} !border-amber-500 !ring-1 !ring-amber-300/70`
      : baseClass
  );
  const advancedFieldLabel = (key, label) => (
    <>
      {label}
      {advancedFieldHasWarning(key) && <AlertTriangle aria-hidden="true" className="ml-1 inline h-3.5 w-3.5 text-amber-600" />}
    </>
  );
  const advancedFieldWarning = (key) => advancedFieldHasWarning(key) && (
    <p id={advancedFieldWarningId(key)} className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300" role="status">
      {reportedUnmatchedFields.includes(key)
        ? (bn ? 'এই মানে আলাদাভাবে কোনো রেকর্ড মেলেনি। সংশোধন করুন।' : 'No record matched this value by itself. Please correct it.')
        : (bn ? 'এই মান অন্য ফিল্টারের সঙ্গে মিলে রেকর্ড দেয়নি। অন্য ফিল্টার যাচাই বা খালি করে দেখুন।' : 'This value did not match when combined with the other filters. Review or clear some filters.')}
    </p>
  );
  const advancedFilterWarningMessage = reportedUnmatchedFields.length
    ? (bn
      ? 'চিহ্নিত ফিল্ডগুলোর দেওয়া মান আলাদাভাবে ডেটাবেজে মেলেনি। মান ঠিক করুন অথবা ফিল্টারটি খালি রেখে আবার খুঁজুন।'
      : 'The marked values did not match any database record individually. Correct them or clear those filters and search again.')
    : (bn
      ? 'সব ফিল্টার একসাথে দিলে কোনো রেকর্ড মেলেনি। চিহ্নিত ফিল্ডগুলো যাচাই করুন অথবা কিছু ফিল্টার খালি রেখে আবার খুঁজুন।'
      : 'No record matched all filters together. Review the marked fields or clear some filters and search again.');

  useEffect(() => {
    if (!initialDeedNo) return;
    setNumberQuery(String(initialDeedNo));
    setNumberError('');
    setNumberResult(null);
  }, [initialDeedNo]);

  useEffect(() => {
    let active = true;
    api.getVerificationDeedTypes().then((response) => {
      if (active) setDeedTypes(response.items || []);
    }).catch(() => {
      if (active) setDeedTypes([]);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    api.getDeedSearchProtection()
      .then((data) => {
        if (!active || !data) return;
        setProtection(data);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!protection?.locked) {
      setCountdown(0);
      return undefined;
    }
    setCountdown(Number(protection.remaining_seconds) || 0);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setProtection((current) => ({ ...current, locked: false, remaining_seconds: 0 }));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [protection?.locked, protection?.locked_until]);

  useEffect(() => {
    if (!detail) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setDetail(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detail]);

  const applyLock = (payload) => {
    setProtection({ ...payload, locked: true });
    setCountdown(Number(payload.remaining_seconds) || 0);
  };

  const handleApiError = (err, setInlineError) => {
    const payload = err?.payload;
    if (payload?.locked) {
      applyLock(payload);
      return;
    }
    const message = err?.message || (bn ? 'অনুরোধটি সম্পন্ন করা যায়নি।' : 'The request could not be completed.');
    if (setInlineError) setInlineError(message);
    else setPageError(message);
  };

  const scrollTo = (ref) => {
    if (!ref?.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  const handleNumberSearch = async (event) => {
    event?.preventDefault();
    const query = numberQuery.trim();
    setNumberError('');
    setPageError('');

    if (!query) {
      setNumberError(bn ? 'অনুগ্রহ করে দলিল নম্বর লিখুন।' : 'Please enter a deed number.');
      numberInputRef.current?.focus();
      return;
    }
    if (query.length > 60 || !isDeedNumberShaped(query)) {
      setNumberError(
        bn
          ? 'দলিল নম্বরে শুধু অক্ষর, সংখ্যা, স্পেস, হাইফেন ও স্ল্যাশ ব্যবহার করুন।'
          : 'Use only letters, digits, spaces, hyphens and slashes in a deed number.'
      );
      numberInputRef.current?.focus();
      return;
    }
    if (locked) return;

    setNumberLoading(true);
    setNumberResult(null);
    try {
      const data = await api.searchDeedByNumber(query);
      setNumberResult(data);
      setTimeout(() => scrollTo(resultRef), 60);
    } catch (err) {
      handleApiError(err, setNumberError);
    } finally {
      setNumberLoading(false);
    }
  };

  const updateFilter = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const runAdvancedSearch = async (rawFilters, page = 1) => {
    setAdvancedError('');
    setPageError('');
    const payload = { ...rawFilters, page, page_size: 10 };

    setAdvancedLoading(true);
    try {
      const data = await api.advancedDeedSearch(payload);
      setAppliedFilters({ ...rawFilters });
      setAdvancedResult(data);
      setTimeout(() => scrollTo(resultRef), 60);
    } catch (err) {
      handleApiError(err, setAdvancedError);
    } finally {
      setAdvancedLoading(false);
    }
  };

  const handleAdvancedSearch = (event) => {
    event.preventDefault();
    const cleaned = {};
    Object.entries(filters).forEach(([key, value]) => {
      const text = String(value ?? '').trim();
      if (text) cleaned[key] = text;
    });

    if (!Object.keys(cleaned).length) {
      setAdvancedError(bn ? 'অনুগ্রহ করে অন্তত একটি অনুসন্ধান তথ্য দিন।' : 'Please provide at least one search field.');
      return;
    }
    if (cleaned.reg_year) {
      const year = Number(cleaned.reg_year);
      const maxYear = new Date().getFullYear();
      if (!Number.isInteger(year) || year < 1950 || year > maxYear) {
        setAdvancedError(bn ? 'সঠিক নিবন্ধন সাল লিখুন (১৯৫০ থেকে চলতি বছর)।' : 'Enter a valid registration year (1950 to the current year).');
        return;
      }
    }

    runAdvancedSearch(cleaned, 1);
  };

  const handleResetAdvanced = () => {
    setFilters({ ...EMPTY_FILTERS });
    setAppliedFilters(null);
    setAdvancedResult(null);
    setAdvancedError('');
  };

  const openAdvancedFromNotFound = () => {
    setShowAdvanced(true);
    setTimeout(() => scrollTo(advancedPanelRef), 80);
  };

  const retryNumberSearch = () => {
    setNumberResult(null);
    setNumberError('');
    numberInputRef.current?.focus();
  };

  const openDetail = async (deedId) => {
    if (!deedId) return;
    setDetail({ open: true, result: null });
    setDetailError('');
    setDetailLoading(true);
    try {
      const data = await api.getDeedDetail(deedId);
      setDetail({ open: true, result: data?.result || null });
    } catch (err) {
      setDetailError(err?.message || (bn ? 'বিস্তারিত তথ্য আনা যায়নি।' : 'Could not load deed details.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailError('');
    setDetailLoading(false);
  };

  const renderResults = (result) => {
    if (!result) return null;

    if (result.found === false) {
      return (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-4 sm:p-5 space-y-3 animate-result-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {bn ? 'দলিলটি ডেটাবেজে পাওয়া যায়নি' : 'Deed not found in the database'}
              </h3>
              <p className="text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                {result.message_bn || NOT_FOUND_MESSAGE_BN}
              </p>
              {typeof result.remaining_attempts === 'number' && result.remaining_attempts > 0 && (
                <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  {bn
                    ? `আরও ${toBnDigits(result.remaining_attempts)}টি ভুল চেষ্টার পর অনুসন্ধান সাময়িকভাবে বন্ধ হবে।`
                    : `${result.remaining_attempts} more invalid attempts before the search is paused.`}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button type="button" onClick={retryNumberSearch} className="gov-btn-primary text-xs justify-center">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{bn ? 'আবার চেষ্টা করুন' : 'Try again'}</span>
            </Button>
            <Button type="button" onClick={openAdvancedFromNotFound} className="gov-btn-secondary text-xs justify-center">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{bn ? 'দলিল নম্বর খুঁজুন' : 'Search deed number'}</span>
            </Button>
          </div>
        </div>
      );
    }

    if (!result.found) return null;

    return (
      <div className="space-y-3" ref={resultRef}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#17212B] dark:text-white flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#047857] dark:text-emerald-400" />
            <span>
              {bn
                ? `${toBnDigits(result.count ?? result.results?.length ?? 0)}টি রেকর্ড পাওয়া গেছে`
                : `${result.count ?? result.results?.length ?? 0} record(s) found`}
            </span>
          </h3>
          {result.total > (result.results?.length || 0) && (
            <span className="text-[11px] text-[#64748B] dark:text-slate-400">
              {bn
                ? `মোট ${toBnDigits(result.total)}টির মধ্যে ${toBnDigits(result.results.length)}টি দেখানো হচ্ছে`
                : `Showing ${result.results.length} of ${result.total}`}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3">
          {result.results?.map((deed, index) => (
            <DeedCard key={`${deed.id ?? deed.deed_no}-${index}`} deed={deed} lang={lang} onDetail={openDetail} onSelect={onSelectDeed} index={index} deedTypes={deedTypes} />
          ))}
        </div>
      </div>
    );
  };

  const loading = numberLoading || advancedLoading;
  const detailResult = detail?.result;
  const detailArea = detailResult ? formatArea(detailResult.area, lang) : null;

  return (
    <div className="gov-container py-6 space-y-6 max-w-5xl">
      <PageHeader
        title={bn ? 'দলিল নম্বর খুঁজুন' : 'Search Deed Number'}
        subtitle={
          bn
            ? 'ভূমিসেতুতে সংরক্ষিত দলিল রেকর্ড দলিল নম্বর অথবা বিস্তারিত তথ্য দিয়ে অনুসন্ধান করুন।'
            : 'Search the deed records stored in Bhumisetu by deed number or detailed identifiers.'
        }
        icon={Search}
        badge={bn ? 'ডেটাবেজ অনুসন্ধান' : 'Database Search'}
        badgeColor="emerald"
        breadcrumbs={[{ label: bn ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }]}
        setActiveTab={setActiveTab}
        onBack={() => (navigateBack ? navigateBack('dashboard') : setActiveTab && setActiveTab('dashboard'))}
        fallbackTab="dashboard"
      />

      {pageError && (
        <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed">{pageError}</span>
        </div>
      )}

      {locked && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 p-4 sm:p-5 space-y-2 animate-result-in">
          <div className="flex items-start gap-2.5">
            <Lock className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-bold text-rose-800 dark:text-rose-200">
                {bn ? 'দলিল নম্বর অনুসন্ধান সাময়িকভাবে বন্ধ' : 'Deed-number search temporarily paused'}
              </h2>
              <p className="text-xs leading-relaxed text-rose-800/90 dark:text-rose-200/90">
                {bn
                  ? (protection.message_bn || 'আপনি পরপর ৭ বার ভুল দলিল নম্বর প্রদান করেছেন। নিরাপত্তার স্বার্থে আপনার দলিল অনুসন্ধান সুবিধা সাময়িকভাবে ৫ ঘণ্টার জন্য বন্ধ রাখা হয়েছে। অনুগ্রহ করে পরে আবার চেষ্টা করুন।')
                  : (protection.message_en || 'You submitted 7 consecutive invalid deed numbers. Deed-number search is paused for 5 hours.')}
              </p>
              <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {bn ? 'বাকি সময়:' : 'Remaining:'} {formatCountdown(countdown, lang)}
                </span>
              </p>
              <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
                {bn
                  ? 'বিস্তারিত তথ্য দিয়ে অনুসন্ধান (অ্যাডভান্সড সার্চ) এখনও ব্যবহার করতে পারবেন।'
                  : 'Advanced search by deed details remains available.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="gov-card p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[#17212B] dark:text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-[#047857] dark:text-emerald-400" />
              <span>{bn ? 'দলিল নম্বর দিয়ে অনুসন্ধান' : 'Search by deed number'}</span>
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1 leading-relaxed">
              {bn
                ? 'সঠিক দলিল নম্বর লিখুন। বাংলা ও ইংরেজি উভয় অঙ্ক ব্যবহার করা যাবে (যেমন: D-1001 বা ডি-১০০১)।'
                : 'Enter the exact deed number. Bengali and English digits are both accepted.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleNumberSearch} className="space-y-3" noValidate>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1 min-w-0">
              <label htmlFor="deed-number-input" className="sr-only">
                {bn ? 'দলিল নম্বর' : 'Deed number'}
              </label>
              <Input
                id="deed-number-input"
                ref={numberInputRef}
                type="text"
                value={numberQuery}
                onChange={(event) => { setNumberQuery(event.target.value); setNumberError(''); }}
                placeholder={bn ? 'যেমন: D-1001' : 'e.g. D-1001'}
                className="gov-input"
                maxLength={60}
                autoComplete="off"
                disabled={locked || numberLoading}
                aria-invalid={Boolean(numberError)}
                aria-describedby={numberError ? 'deed-number-error' : undefined}
              />
            </div>
            <Button
              type="submit"
              disabled={locked || numberLoading}
              className="gov-btn-primary text-xs justify-center py-2.5 px-5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {numberLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>{numberLoading ? (bn ? 'খোঁজা হচ্ছে...' : 'Searching...') : (bn ? 'অনুসন্ধান করুন' : 'Search')}</span>
            </Button>
          </div>
          {numberError && (
            <p id="deed-number-error" className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
              {numberError}
            </p>
          )}
        </form>

        {numberResult && renderResults(numberResult)}
      </section>

      <section ref={advancedPanelRef} className="gov-card p-5 sm:p-6 space-y-4">
        <Button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          aria-expanded={showAdvanced}
          aria-controls="advanced-search-panel"
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <span className="flex items-start gap-2.5 min-w-0">
            <SlidersHorizontal className="w-4 h-4 text-[#047857] dark:text-emerald-400 mt-0.5 flex-shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[#17212B] dark:text-white">
                {bn ? 'দলিল নম্বর খুঁজুন — বিস্তারিত অনুসন্ধান' : 'Search deed number — advanced search'}
              </span>
              <span className="block text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                {bn ? 'জেলা, উপজেলা, মৌজা, দাগ, খতিয়ান বা পক্ষের নাম দিয়ে খুঁজুন।' : 'Search by district, upazila, mouza, dag, khatian or party name.'}
              </span>
            </span>
          </span>
          <span className={`w-8 h-8 rounded-lg border border-[#E2E8F0] dark:border-gray-700 flex items-center justify-center flex-shrink-0 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}>
            <ChevronRight className="w-4 h-4 rotate-90" />
          </span>
        </Button>

        <div
          id="advanced-search-panel"
          className={`advanced-panel ${showAdvanced ? 'is-open' : ''}`}
          aria-hidden={!showAdvanced}
        >
          <form onSubmit={handleAdvancedSearch} className="space-y-4 pt-1" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <div>
                <label htmlFor="filter-district" className={`block text-xs font-semibold mb-1 ${advancedFieldHasWarning('district') ? 'text-amber-800 dark:text-amber-300' : 'text-[#17212B] dark:text-slate-200'}`}>
                  {advancedFieldLabel('district', bn ? 'জেলা' : 'District')}
                </label>
                <Input as="select" id="filter-district" name="district" value={filters.district} onChange={updateFilter} className={advancedFieldClass('district', 'gov-select')} aria-invalid={advancedFieldHasWarning('district')} aria-describedby={advancedFieldHasWarning('district') ? advancedFieldWarningId('district') : undefined} disabled={advancedLoading}>
                  <option value="">{bn ? 'সব জেলা' : 'All districts'}</option>
                  {DISTRICTS.map((district) => (
                    <option key={district} value={district}>{district}</option>
                  ))}
                </Input>
                {advancedFieldWarning('district')}
              </div>

              <div>
                <label htmlFor="filter-upazila" className={`block text-xs font-semibold mb-1 ${advancedFieldHasWarning('upazila') ? 'text-amber-800 dark:text-amber-300' : 'text-[#17212B] dark:text-slate-200'}`}>
                  {advancedFieldLabel('upazila', bn ? 'উপজেলা' : 'Upazila')}
                </label>
                <Input id="filter-upazila" name="upazila" value={filters.upazila} onChange={updateFilter} maxLength={120} className={advancedFieldClass('upazila', 'gov-input')} aria-invalid={advancedFieldHasWarning('upazila')} aria-describedby={advancedFieldHasWarning('upazila') ? advancedFieldWarningId('upazila') : undefined} placeholder={bn ? 'যেমন: মিরপুর' : 'e.g. Mirpur'} disabled={advancedLoading} />
                {advancedFieldWarning('upazila')}
              </div>

              <div>
                <label htmlFor="filter-year" className={`block text-xs font-semibold mb-1 ${advancedFieldHasWarning('reg_year') ? 'text-amber-800 dark:text-amber-300' : 'text-[#17212B] dark:text-slate-200'}`}>
                  {advancedFieldLabel('reg_year', bn ? 'দলিলের সাল' : 'Registration year')}
                </label>
                <Input id="filter-year" name="reg_year" type="number" inputMode="numeric" min="1950" max={new Date().getFullYear()} value={filters.reg_year} onChange={updateFilter} className={advancedFieldClass('reg_year', 'gov-input')} aria-invalid={advancedFieldHasWarning('reg_year')} aria-describedby={advancedFieldHasWarning('reg_year') ? advancedFieldWarningId('reg_year') : undefined} placeholder="2025" disabled={advancedLoading} />
                {advancedFieldWarning('reg_year')}
              </div>

              <div>
                <label htmlFor="filter-deed-type" className={`block text-xs font-semibold mb-1 ${advancedFieldHasWarning('deed_type') ? 'text-amber-800 dark:text-amber-300' : 'text-[#17212B] dark:text-slate-200'}`}>
                  {advancedFieldLabel('deed_type', bn ? 'দলিলের ধরন' : 'Deed type')}
                </label>
                <Input as="select" id="filter-deed-type" name="deed_type" value={filters.deed_type} onChange={updateFilter} className={advancedFieldClass('deed_type', 'gov-select')} aria-invalid={advancedFieldHasWarning('deed_type')} aria-describedby={advancedFieldHasWarning('deed_type') ? advancedFieldWarningId('deed_type') : undefined} disabled={advancedLoading}>
                  <option value="">{bn ? 'সব ধরনের দলিল' : 'All deed types'}</option>
                  {deedTypes.map((item) => (
                    <option key={item.code} value={item.code}>{bn ? item.name_bn : item.name_en}</option>
                  ))}
                </Input>
                {advancedFieldWarning('deed_type')}
              </div>

              <div>
                <label htmlFor="filter-mouza" className={`block text-xs font-semibold mb-1 ${advancedFieldHasWarning('mouza') ? 'text-amber-800 dark:text-amber-300' : 'text-[#17212B] dark:text-slate-200'}`}>
                  {advancedFieldLabel('mouza', bn ? 'মৌজার নাম' : 'Mouza name')}
                </label>
                <Input id="filter-mouza" name="mouza" value={filters.mouza} onChange={updateFilter} maxLength={120} className={advancedFieldClass('mouza', 'gov-input')} aria-invalid={advancedFieldHasWarning('mouza')} aria-describedby={advancedFieldHasWarning('mouza') ? advancedFieldWarningId('mouza') : undefined} placeholder={bn ? 'যেমন: পাইকপাড়া' : 'e.g. Paikpara'} disabled={advancedLoading} />
                {advancedFieldWarning('mouza')}
              </div>

              <div>
                <label htmlFor="filter-seller" className={`block text-xs font-semibold mb-1 ${advancedFieldHasWarning('seller_name') ? 'text-amber-800 dark:text-amber-300' : 'text-[#17212B] dark:text-slate-200'}`}>
                  {advancedFieldLabel('seller_name', bn ? 'বিক্রেতার নাম' : 'Seller name')}
                </label>
                <Input id="filter-seller" name="seller_name" value={filters.seller_name} onChange={updateFilter} maxLength={120} className={advancedFieldClass('seller_name', 'gov-input')} aria-invalid={advancedFieldHasWarning('seller_name')} aria-describedby={advancedFieldHasWarning('seller_name') ? advancedFieldWarningId('seller_name') : undefined} placeholder={bn ? 'বিক্রেতার নাম' : 'Seller name'} disabled={advancedLoading} />
                {advancedFieldWarning('seller_name')}
              </div>

              <div>
                <label htmlFor="filter-buyer" className={`block text-xs font-semibold mb-1 ${advancedFieldHasWarning('buyer_name') ? 'text-amber-800 dark:text-amber-300' : 'text-[#17212B] dark:text-slate-200'}`}>
                  {advancedFieldLabel('buyer_name', bn ? 'ক্রেতার নাম' : 'Buyer name')}
                </label>
                <Input id="filter-buyer" name="buyer_name" value={filters.buyer_name} onChange={updateFilter} maxLength={120} className={advancedFieldClass('buyer_name', 'gov-input')} aria-invalid={advancedFieldHasWarning('buyer_name')} aria-describedby={advancedFieldHasWarning('buyer_name') ? advancedFieldWarningId('buyer_name') : undefined} placeholder={bn ? 'ক্রেতার নাম' : 'Buyer name'} disabled={advancedLoading} />
                {advancedFieldWarning('buyer_name')}
              </div>

              <div>
                <label htmlFor="filter-plot" className={`block text-xs font-semibold mb-1 ${advancedFieldHasWarning('plot_id') ? 'text-amber-800 dark:text-amber-300' : 'text-[#17212B] dark:text-slate-200'}`}>
                  {advancedFieldLabel('plot_id', bn ? 'দাগ নম্বর' : 'Dag number')}
                </label>
                <Input id="filter-plot" name="plot_id" value={filters.plot_id} onChange={updateFilter} maxLength={80} className={advancedFieldClass('plot_id', 'gov-input')} aria-invalid={advancedFieldHasWarning('plot_id')} aria-describedby={advancedFieldHasWarning('plot_id') ? advancedFieldWarningId('plot_id') : undefined} placeholder={bn ? 'যেমন: DHK-MIR-001' : 'e.g. DHK-MIR-001'} disabled={advancedLoading} />
                {advancedFieldWarning('plot_id')}
              </div>

              <div>
                <label htmlFor="filter-khatian" className={`block text-xs font-semibold mb-1 ${advancedFieldHasWarning('khatian_no') ? 'text-amber-800 dark:text-amber-300' : 'text-[#17212B] dark:text-slate-200'}`}>
                  {advancedFieldLabel('khatian_no', bn ? 'খতিয়ান নম্বর' : 'Khatian number')}
                </label>
                <Input id="filter-khatian" name="khatian_no" value={filters.khatian_no} onChange={updateFilter} maxLength={80} className={advancedFieldClass('khatian_no', 'gov-input')} aria-invalid={advancedFieldHasWarning('khatian_no')} aria-describedby={advancedFieldHasWarning('khatian_no') ? advancedFieldWarningId('khatian_no') : undefined} placeholder={bn ? 'যেমন: BS-1045' : 'e.g. BS-1045'} disabled={advancedLoading} />
                {advancedFieldWarning('khatian_no')}
              </div>
            </div>

            {activeAdvancedWarningFields.length > 0 && (
              <div id="advanced-filter-warning" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-semibold">{advancedFilterWarningMessage}</p>
                  <p className="text-[11px] leading-relaxed">
                    {activeAdvancedWarningFields.map((key) => `${advancedWarningLabels[key] || key}: ${advancedWarningValue(key)}`).join(' · ')}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#F7FAF8] dark:bg-[#111A16] border border-[#E2E8F0] dark:border-gray-800">
              <Info className="w-3.5 h-3.5 text-[#047857] dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-[#64748B] dark:text-slate-400">
                {bn
                  ? 'দলিল নম্বর ছাড়া অন্য তথ্যে আংশিক মিল (Partial Match) ব্যবহার করা হয়। একাধিক তথ্য দিলে ফলাফল আরও নির্দিষ্ট হবে।'
                  : 'Text fields use partial matching. Adding more fields narrows the results.'}
              </p>
            </div>

            {advancedError && (
              <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{advancedError}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5">
              <Button
                type="submit"
                disabled={advancedLoading}
                className="gov-btn-primary text-xs justify-center py-2.5 px-5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {advancedLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>
                  {advancedLoading
                    ? (bn ? 'অনুসন্ধান চলছে...' : 'Searching...')
                    : (bn ? 'বিস্তারিত অনুসন্ধান করুন' : 'Run advanced search')}
                </span>
              </Button>
              <Button type="button" onClick={handleResetAdvanced} disabled={advancedLoading} className="gov-btn-secondary text-xs justify-center py-2.5 px-4">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{bn ? 'ফিল্টার রিসেট' : 'Reset filters'}</span>
              </Button>
            </div>
          </form>
        </div>
      </section>

      {loading && (
        <div className="space-y-3" aria-live="polite" aria-busy="true">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {!loading && advancedResult && (
        <div className="space-y-4">
          {renderResults(advancedResult)}
          {advancedResult.found && advancedResult.pages > 1 && (
            <nav className="flex flex-wrap items-center justify-between gap-3 pt-1" aria-label={bn ? 'পৃষ্ঠা' : 'Pagination'}>
              <Button
                type="button"
                onClick={() => runAdvancedSearch(appliedFilters, advancedResult.page - 1)}
                disabled={advancedResult.page <= 1 || advancedLoading}
                className="gov-btn-secondary text-xs py-2 px-3 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>{bn ? 'পূর্ববর্তী' : 'Previous'}</span>
              </Button>
              <span className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
                {bn
                  ? `পৃষ্ঠা ${toBnDigits(advancedResult.page)} / ${toBnDigits(advancedResult.pages)}`
                  : `Page ${advancedResult.page} of ${advancedResult.pages}`}
              </span>
              <Button
                type="button"
                onClick={() => runAdvancedSearch(appliedFilters, advancedResult.page + 1)}
                disabled={advancedResult.page >= advancedResult.pages || advancedLoading}
                className="gov-btn-secondary text-xs py-2 px-3 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>{bn ? 'পরবর্তী' : 'Next'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </nav>
          )}
        </div>
      )}

      {!loading && (
        <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-800 bg-[#F7FAF8] dark:bg-[#111A16] p-4 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-[#047857] dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
            {bn ? SCOPE_NOTE_BN : 'Results reflect only records available in the Bhumisetu database. A missing record does not mean the deed is fake, invalid, or legally nonexistent.'}
          </p>
        </div>
      )}

      {detail?.open && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-result-in" onClick={closeDetail} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deed-detail-title"
            className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-[#0C1210] border border-[#E2E8F0] dark:border-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl animate-result-in"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 bg-white/95 dark:bg-[#0C1210]/95 backdrop-blur border-b border-[#E2E8F0] dark:border-gray-800">
              <h2 id="deed-detail-title" className="text-sm font-bold text-[#17212B] dark:text-white break-words">
                {bn ? 'দলিলের বিস্তারিত তথ্য' : 'Deed details'}
              </h2>
              <Button type="button" onClick={closeDetail} className="w-8 h-8 rounded-lg border border-[#E2E8F0] dark:border-gray-700 flex items-center justify-center hover:bg-[#F7FAF8] dark:hover:bg-gray-800 transition" aria-label={bn ? 'বন্ধ করুন' : 'Close'}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-5 space-y-4">
              {detailLoading && (
                <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-slate-400 py-6 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{bn ? 'তথ্য লোড হচ্ছে...' : 'Loading details...'}</span>
                </div>
              )}

              {detailError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
                  {detailError}
                </div>
              )}

              {!detailLoading && detailResult && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-extrabold tracking-tight text-[#17212B] dark:text-white">{detailResult.deed_no}</h3>
                    {detailResult.reg_year && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F0FDF4] dark:bg-emerald-950/50 text-[#047857] dark:text-emerald-300 border border-[#D1FAE5] dark:border-emerald-800">
                        {bn ? `${toBnDigits(detailResult.reg_year)} সাল` : detailResult.reg_year}
                      </span>
                    )}
                    <span className="text-[11px] text-[#64748B] dark:text-slate-400">
                      {detailResult.is_synthetic_demo_record
                        ? (bn ? 'ডেমো রেকর্ড' : 'Demo record')
                        : (bn ? 'ডেটাবেজ রেকর্ড' : 'Database record')}
                    </span>
                  </div>

                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                    {[
                      [bn ? 'সাব-রেজিস্ট্রি অফিস' : 'Sub-registry office', detailResult.sub_registry_office],
                      [bn ? 'দলিলের ধরন' : 'Deed type', getDeedTypeLabel(detailResult.deed_type, deedTypes, lang)],
                      [bn ? 'জেলা' : 'District', detailResult.district],
                      [bn ? 'উপজেলা' : 'Upazila', detailResult.upazila],
                      [bn ? 'মৌজা' : 'Mouza', detailResult.mouza],
                      [bn ? 'দাগ নম্বর' : 'Dag number', detailResult.plot_id],
                      [bn ? 'খতিয়ান নম্বর' : 'Khatian number', detailResult.khatian_no],
                      [bn ? 'জমির পরিমাণ' : 'Land area', detailArea],
                      [bn ? 'নিবন্ধন তারিখ' : 'Registration date', detailResult.reg_date],
                      [bn ? 'বিক্রেতা' : 'Seller', detailResult.seller_name],
                      [bn ? 'ক্রেতা' : 'Buyer', detailResult.buyer_name],
                      [bn ? 'মূল্য' : 'Price', detailResult.price !== undefined
                        ? (bn ? `৳ ${toBnDigits(Number(detailResult.price).toLocaleString('en-US'))}` : `BDT ${Number(detailResult.price).toLocaleString('en-US')}`)
                        : null]
                    ]
                      .filter(([, value]) => value !== undefined && value !== null && value !== '')
                      .map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="text-[10px] uppercase tracking-wider font-semibold text-[#94A3B8] dark:text-slate-500">{label}</dt>
                          <dd className="text-xs font-semibold text-[#17212B] dark:text-slate-200 mt-0.5 break-words leading-relaxed">{value}</dd>
                        </div>
                      ))}
                  </dl>

                  <div className="p-3 rounded-lg bg-[#F7FAF8] dark:bg-[#111A16] border border-[#E2E8F0] dark:border-gray-800 space-y-1.5">
                    {!detailResult.deed_type && (
                      <p className="text-[11px] leading-relaxed text-[#64748B] dark:text-slate-400">
                        {bn ? 'এই রেকর্ডে দলিলের ধরন দেওয়া নেই।' : 'No deed type is stored for this record.'}
                      </p>
                    )}
                    <p className="text-[11px] leading-relaxed text-[#64748B] dark:text-slate-400">
                      {bn ? SCOPE_NOTE_BN : 'This reflects only records available in the Bhumisetu database. A missing record does not mean the deed is fake, invalid, or legally nonexistent.'}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
