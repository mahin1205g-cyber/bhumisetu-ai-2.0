import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import Input from '../components/Input';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import {
  Search, GitBranchPlus, Clock3, CheckCircle2, XCircle, AlertCircle,
  FileText, RefreshCw, ArrowRight, CalendarDays, Filter, ChevronLeft,
  ChevronRight, X, Send, FileCheck2, Building2, History, ExternalLink
} from 'lucide-react';

const PAGE_SIZE = 10;
const statusKeys = ['submitted', 'under_review', 'correction_required', 'resubmitted', 'approved', 'processing', 'completed', 'rejected', 'cancelled'];

const statusText = (key, bn) => {
  const labels = {
    submitted: ['জমা হয়েছে', 'Submitted'],
    under_review: ['পর্যালোচনাধীন', 'Under Review'],
    correction_required: ['সংশোধন প্রয়োজন', 'Correction Required'],
    resubmitted: ['পুনরায় জমা হয়েছে', 'Resubmitted'],
    approved: ['অনুমোদিত', 'Approved'],
    processing: ['প্রক্রিয়াধীন', 'Processing'],
    completed: ['সম্পন্ন', 'Completed'],
    rejected: ['প্রত্যাখ্যাত', 'Rejected'],
    cancelled: ['বাতিল', 'Cancelled'],
  };
  const normalized = String(key || '').toLowerCase().replaceAll(' ', '_');
  return labels[normalized]?.[bn ? 0 : 1] || key || (bn ? 'অজানা' : 'Unknown');
};

const dateText = (value, lang) => value
  ? new Date(value).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  : '—';

const statusStyle = (status) => ({
  submitted: 'border-sky-200 bg-sky-50 text-sky-800',
  under_review: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  correction_required: 'border-amber-200 bg-amber-50 text-amber-900',
  resubmitted: 'border-cyan-200 bg-cyan-50 text-cyan-900',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  processing: 'border-blue-200 bg-blue-50 text-blue-800',
  completed: 'border-teal-200 bg-teal-50 text-teal-800',
  rejected: 'border-rose-200 bg-rose-50 text-rose-800',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-700',
}[status] || 'border-slate-200 bg-slate-50 text-slate-700');

export default function ApplicationTracking({ initialTrackingNo, setActiveTab, navigateBack, onOpenDigitalDeed }) {
  const { lang, t, user } = useApp();
  const bn = lang === 'bn';
  const isStaff = ['admin', 'officer'].includes(user?.role);
  const [searchText, setSearchText] = useState(initialTrackingNo || '');
  const [listQuery, setListQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, under_review: 0, completed: 0, closed: 0 });
  const [availableTypes, setAvailableTypes] = useState(['mutation']);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [applicationType, setApplicationType] = useState('all');
  const [applicationStatus, setApplicationStatus] = useState('all');
  const [dateField, setDateField] = useState('submitted');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('latest');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [correctionNotes, setCorrectionNotes] = useState('');
  const [correctionPhone, setCorrectionPhone] = useState('');
  const [correctionAddress, setCorrectionAddress] = useState('');
  const [resubmitting, setResubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!user?.role || (!isStaff && user.role !== 'citizen')) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      setListError('');
      return undefined;
    }
    let active = true;
    setLoading(true);
    setListError('');
    const filters = new URLSearchParams({
      page: String(page), page_size: String(PAGE_SIZE), application_type: applicationType,
      date_field: dateField, sort,
    });
    if (applicationStatus !== 'all') filters.set('status', applicationStatus);
    if (isStaff && listQuery.trim()) filters.set('q', listQuery.trim());
    if (dateFrom) filters.set('date_from', dateFrom);
    if (dateTo) filters.set('date_to', dateTo);
    const loadHistory = isStaff
      ? api.getStaffApplicationHistory(filters.toString())
      : api.getApplicationHistory(filters.toString());
    loadHistory
      .then((data) => {
        if (!active) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
        setSummary(data.summary || { total: 0, pending: 0, under_review: 0, completed: 0, closed: 0 });
        setAvailableTypes(data.available_types || ['mutation']);
      })
      .catch((error) => { if (active) setListError(error.message || (bn ? 'আবেদনের তালিকা আনা যায়নি।' : 'Could not load your applications.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, user?.role, isStaff, listQuery, page, applicationType, applicationStatus, dateField, dateFrom, dateTo, sort, bn]);

  useEffect(() => {
    if (user?.role === 'citizen' && initialTrackingNo) {
      setSearchText(initialTrackingNo);
      searchTracking(initialTrackingNo);
    }
  }, [initialTrackingNo, user?.role]);

  const searchTracking = async (value = searchText) => {
    const trackingId = value.trim();
    if (!trackingId) return;
    if (isStaff) {
      setSearchError('');
      setSearchResult(null);
      setListQuery(trackingId);
      setPage(1);
      return;
    }
    if (user?.role !== 'citizen') return;
    setSearching(true);
    setSearchError('');
    setSearchResult(null);
    try {
      const result = await api.trackMyApplication(trackingId);
      setSearchResult(result);
      setSelected(result);
      setCorrectionNotes('');
      setCorrectionPhone(result.details?.applicant_phone || '');
      setCorrectionAddress(result.details?.applicant_address || '');
    } catch (error) {
      setSearchError(error?.status === 404
        ? (bn ? 'এই Tracking ID-এর কোনো আবেদন আপনার অ্যাকাউন্টে পাওয়া যায়নি।' : 'No application with this Tracking ID was found in your account.')
        : (error?.message || (bn ? 'আবেদন খোঁজা যায়নি। আবার চেষ্টা করুন।' : 'Could not search applications. Please try again.')));
    } finally { setSearching(false); }
  };

  const openDetails = async (type, trackingId) => {
    setDetailLoading(true);
    setNotice('');
    setSelected({ application_type: type, tracking_id: trackingId, timeline: [] });
    try {
      const data = isStaff
        ? await api.getStaffApplicationHistoryDetail(trackingId)
        : await api.trackMyApplication(trackingId);
      if (data.application_type !== type) throw new Error('Application type mismatch');
      setSelected(data);
      setCorrectionNotes('');
      setCorrectionPhone(data.details?.applicant_phone || '');
      setCorrectionAddress(data.details?.applicant_address || '');
    } catch (error) {
      setSearchError(bn ? 'আবেদনের বিস্তারিত দেখা যায়নি। আবার চেষ্টা করুন।' : 'Application details could not be loaded. Please try again.');
    } finally { setDetailLoading(false); }
  };

  const handleSearch = (event) => { event.preventDefault(); searchTracking(); };
  const clearSearch = () => { setSearchText(''); setSearchResult(null); setSearchError(''); if (isStaff) { setListQuery(''); setPage(1); } };

  const submitMutationCorrection = async (event) => {
    event.preventDefault();
    if (!selected || selected.application_type !== 'mutation' || !correctionNotes.trim()) return;
    setResubmitting(true);
    try {
      await api.resubmitMutation(selected.tracking_id, {
        applicant_phone: correctionPhone.trim(),
        applicant_address: correctionAddress.trim(),
        supporting_docs: selected.details?.supporting_docs || [],
        correction_notes: correctionNotes.trim(),
      });
      setCorrectionNotes('');
      await openDetails(selected.application_type, selected.tracking_id);
      setNotice(bn ? 'সংশোধিত তথ্য জমা হয়েছে; টাইমলাইন হালনাগাদ করা হয়েছে।' : 'Corrections submitted; the timeline has been updated.');
      setPage(1);
    } catch (error) {
      setNotice(error.message || (bn ? 'সংশোধন জমা দেওয়া যায়নি।' : 'Could not submit corrections.'));
    } finally { setResubmitting(false); }
  };

  const summaryCards = useMemo(() => [
    { key: 'total', label: bn ? 'মোট আবেদন' : 'Total applications', icon: FileText, value: summary.total },
    { key: 'pending', label: bn ? 'অপেক্ষমাণ' : 'Pending', icon: Clock3, value: summary.pending },
    { key: 'under_review', label: bn ? 'পর্যালোচনাধীন' : 'Under review', icon: History, value: summary.under_review },
    { key: 'completed', label: bn ? 'সম্পন্ন' : 'Completed', icon: CheckCircle2, value: summary.completed },
    { key: 'closed', label: bn ? 'প্রত্যাখ্যাত / বাতিল' : 'Rejected / cancelled', icon: XCircle, value: summary.closed },
  ], [summary, bn]);

  const openDigitalDeed = () => {
    const deedId = selected?.digital_deed?.deed_id;
    if (deedId && selected?.digital_deed?.record_status === 'active') {
      setSelected(null);
      onOpenDigitalDeed?.(deedId);
    }
  };

  const staffMutationDetails = selected?.application_type === 'mutation'
    ? Object.entries(selected.details || {}).filter(([key, value]) =>
      !['id', 'tracking_no', 'user_id', 'applicant_nid', 'assigned_officer_id', 'account_username', 'applicant_name', 'status', 'created_at', 'updated_at'].includes(key)
      && value !== null && value !== undefined && value !== '')
    : [];

  if (!user?.role || !['citizen', 'officer', 'admin'].includes(user.role)) {
    return <div className="gov-container py-16"><div role="alert" className="gov-card p-6 text-center">{bn ? 'এই আবেদন ইতিহাস দেখার অনুমতি নেই।' : 'You are not authorized to view application history.'}</div></div>;
  }

  return (
    <div className="gov-container max-w-6xl space-y-5 py-6">
      <PageHeader
        title={bn ? 'আবেদন ইতিহাস ও ট্র্যাকিং' : 'Application History & Tracking'}
        subtitle={isStaff
          ? (bn ? 'সকল নাগরিকের নামজারি ও দলিল ডিজিটাইজেশন আবেদনের অবস্থা, ইতিহাস ও আবেদনকারীর তথ্য দেখুন।' : 'View submitted Mutation and Deed Digitization applications across all applicants.')
          : (bn ? 'নামজারি ও দলিল ডিজিটাইজেশন—আপনার নিজের সব আবেদনের অবস্থা, ইতিহাস ও পরবর্তী পদক্ষেপ এক জায়গায় দেখুন।' : 'View the status, history, and next steps for your own Mutation and Deed Digitization applications in one place.')}
        icon={GitBranchPlus}
        badge={isStaff ? (bn ? 'Staff history' : 'Staff history') : (bn ? 'নাগরিক আবেদন কেন্দ্র' : 'Citizen application portal')}
        badgeColor={isStaff ? 'indigo' : 'emerald'}
        breadcrumbs={[{ label: bn ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }, { label: bn ? 'আবেদন ইতিহাস' : 'Application History' }]}
        setActiveTab={setActiveTab}
        onBack={() => navigateBack ? navigateBack('dashboard') : setActiveTab?.('dashboard')}
        fallbackTab="dashboard"
      />

      <section className="gov-card space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2"><Search className="h-5 w-5 text-emerald-700"/><div><h2 className="font-bold">{isStaff ? (bn ? 'Tracking ID বা আবেদনকারী দিয়ে খুঁজুন' : 'Search by Tracking ID or applicant') : (bn ? 'Tracking ID দিয়ে আবেদন খুঁজুন' : 'Find an application by Tracking ID')}</h2><p className="text-xs text-slate-500">{isStaff ? (bn ? 'এই staff history-তে সকল ব্যবহারকারীর জমা দেওয়া আবেদন অনুসন্ধান করা যাবে।' : 'Search submitted applications across all users in this staff history view.') : (bn ? 'শুধু আপনার অ্যাকাউন্টের আবেদন দেখানো হবে।' : 'Only applications in your account can be found here.')}</p></div></div>
        <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
          <Input value={searchText} onChange={(event) => setSearchText(event.target.value)} className={`gov-input min-w-0 flex-1 ${isStaff ? '' : 'font-mono'}`} placeholder={isStaff ? (bn ? 'Tracking ID, আবেদনকারীর নাম বা username লিখুন...' : 'Enter Tracking ID, applicant name, or username...') : (bn ? 'আপনার আবেদন নম্বর বা Tracking ID লিখুন...' : 'Enter your application number or Tracking ID...')} aria-label={isStaff ? (bn ? 'Tracking ID বা আবেদনকারী খুঁজুন' : 'Search Tracking ID or applicant') : (bn ? 'Tracking ID দিয়ে নিজের আবেদন খুঁজুন' : 'Find your application by Tracking ID')} required />
          {searchText && <Button type="button" onClick={clearSearch} className="rounded-lg border px-3 py-2 text-sm"><X className="h-4 w-4"/><span className="sr-only">{bn ? 'মুছুন' : 'Clear'}</span></Button>}
          <Button type="submit" disabled={searching || (isStaff && loading)} className="gov-btn-primary inline-flex items-center justify-center gap-2 px-5 py-2">{searching || (isStaff && loading) ? <RefreshCw className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}{bn ? 'আবেদন খুঁজুন' : 'Search'}</Button>
        </form>
        {searchError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{searchError}</p>}
        {searchResult && <button type="button" onClick={() => openDetails(searchResult.application_type, searchResult.tracking_id)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left hover:bg-emerald-100"><span><strong className="font-mono">{searchResult.tracking_id}</strong><span className="ml-2 rounded-full bg-white px-2 py-1 text-xs">{statusText(searchResult.status, bn)}</span></span><span className="text-xs text-emerald-800">{bn ? 'বিস্তারিত দেখুন' : 'View details'} <ArrowRight className="inline h-3 w-3"/></span></button>}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label={bn ? 'আবেদনের সারাংশ' : 'Application summary'}>
        {summaryCards.map(({ key, label, icon: Icon, value }) => <article key={key} className="gov-card flex items-center gap-3 p-4"><span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><Icon className="h-4 w-4"/></span><div><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold text-slate-900 dark:text-white">{value || 0}</p></div></article>)}
      </section>

      <section className="gov-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 font-bold"><Filter className="h-4 w-4 text-emerald-700"/>{isStaff ? (bn ? 'সকল আবেদন ইতিহাস' : 'All application history') : (bn ? 'আবেদন ইতিহাস' : 'Your application history')}</h2><p className="mt-1 text-xs text-slate-500">{total} {bn ? 'টি আবেদন' : 'applications'}</p></div>{!isStaff && <Button type="button" onClick={() => setActiveTab?.('deed-digitization')} className="gov-btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"><FileCheck2 className="h-4 w-4"/>{bn ? 'নতুন দলিল আবেদন' : 'New deed application'}</Button>}</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <select value={applicationType} onChange={(event) => { setPage(1); setApplicationType(event.target.value); }} className="gov-input text-sm"><option value="all">{bn ? 'সব আবেদনের ধরন' : 'All application types'}</option><option value="mutation">{bn ? 'নামজারি' : 'Mutation'}</option>{availableTypes.includes('deed_digitization') && <option value="deed_digitization">{bn ? 'দলিল ডিজিটাইজেশন' : 'Deed Digitization'}</option>}</select>
          <select value={applicationStatus} onChange={(event) => { setPage(1); setApplicationStatus(event.target.value); }} className="gov-input text-sm"><option value="all">{bn ? 'সব অবস্থা' : 'All statuses'}</option>{statusKeys.map((key) => <option key={key} value={key}>{statusText(key, bn)}</option>)}</select>
          <select value={dateField} onChange={(event) => { setPage(1); setDateField(event.target.value); }} className="gov-input text-sm"><option value="submitted">{bn ? 'দাখিলের তারিখ' : 'Submission date'}</option><option value="updated">{bn ? 'সর্বশেষ হালনাগাদ' : 'Last updated'}</option></select>
          <Input type="date" value={dateFrom} onChange={(event) => { setPage(1); setDateFrom(event.target.value); }} className="gov-input text-sm" aria-label={bn ? 'শুরুর তারিখ' : 'Start date'} />
          <Input type="date" value={dateTo} onChange={(event) => { setPage(1); setDateTo(event.target.value); }} className="gov-input text-sm" aria-label={bn ? 'শেষ তারিখ' : 'End date'} />
          <select value={sort} onChange={(event) => { setPage(1); setSort(event.target.value); }} className="gov-input text-sm"><option value="latest">{bn ? 'সর্বশেষ আগে' : 'Latest first'}</option><option value="oldest">{bn ? 'পুরোনো আগে' : 'Oldest first'}</option><option value="recently_updated">{bn ? 'সর্বশেষ হালনাগাদ আগে' : 'Recently updated'}</option></select>
        </div>

        {listError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{listError}</div>}
        {loading ? <div className="space-y-3" aria-live="polite" aria-busy="true">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"/>)}</div> : items.length ? <div className="space-y-3">{items.map((item, index) => { const mutation = item.application_type === 'mutation'; const Icon = mutation ? GitBranchPlus : FileText; return <button key={`${item.application_type}:${item.application_id}`} type="button" onClick={() => openDetails(item.application_type, item.tracking_id)} style={{ '--application-card-index': index }} className="application-history-card w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"><span className="flex flex-wrap items-start justify-between gap-3"><span className="flex min-w-0 items-start gap-3"><span className={`rounded-xl p-2 ${mutation ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}><Icon className="h-5 w-5"/></span><span className="min-w-0"><strong className="block break-all font-mono text-sm text-slate-900 dark:text-white">{item.tracking_id}</strong>{isStaff && <span className="mt-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">{item.applicant_name || '—'}{item.applicant_username ? ` · @${item.applicant_username}` : ''}</span>}<span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">{mutation ? (bn ? 'নামজারি আবেদন' : 'Mutation Application') : (bn ? 'দলিল ডিজিটাইজেশন আবেদন' : 'Deed Digitization Application')} {item.reference ? `· ${item.reference}` : ''}</span><span className="mt-1 block text-[11px] text-slate-500">{item.district || ''}{item.upazila ? ` · ${item.upazila}` : ''}{item.mouza ? ` · ${item.mouza}` : ''}{item.plot_no ? ` · ${bn ? 'দাগ' : 'Plot'} ${item.plot_no}` : ''}</span></span></span><span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>{statusText(item.status, bn)}</span></span><span className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800"><span>{bn ? 'জমা' : 'Submitted'}: {dateText(item.submitted_at, lang)}</span><span>{bn ? 'হালনাগাদ' : 'Updated'}: {dateText(item.updated_at, lang)}</span>{item.latest_progress && <span className="line-clamp-1 max-w-full">{item.latest_progress}</span>}</span></button>; })}</div> : listError ? null : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center"><FileText className="mx-auto h-9 w-9 text-slate-300"/><h3 className="mt-3 font-bold">{isStaff ? (bn ? 'এই ফিল্টারে কোনো আবেদন নেই।' : 'No applications match these filters.') : (bn ? (summary.total ? 'এই ফিল্টারে কোনো আবেদন নেই।' : 'আপনি এখনো কোনো আবেদন করেননি।') : (summary.total ? 'No applications match these filters.' : 'You have not submitted an application yet.'))}</h3><p className="mt-1 text-sm text-slate-500">{isStaff ? (bn ? 'Tracking ID, নাম বা filter পরিবর্তন করে আবার চেষ্টা করুন।' : 'Try another Tracking ID, applicant name, or filter.') : (bn ? 'নতুন আবেদন করলে তার Tracking ID ও অগ্রগতি এখানে দেখা যাবে।' : 'Your application and progress will appear here after submission.')}</p>{!isStaff && <div className="mt-4 flex flex-wrap justify-center gap-2"><Button type="button" onClick={() => setActiveTab?.('mutation')} className="gov-btn-secondary px-4 py-2 text-sm">{bn ? 'নামজারি আবেদন' : 'Mutation application'}</Button><Button type="button" onClick={() => setActiveTab?.('deed-digitization')} className="gov-btn-primary px-4 py-2 text-sm">{bn ? 'দলিল ডিজিটাইজেশন' : 'Deed digitization'}</Button></div>}</div>}
        {total > PAGE_SIZE && <nav className="flex items-center justify-between border-t pt-3 text-sm" aria-label={bn ? 'আবেদন পৃষ্ঠা' : 'Application pages'}><span className="text-xs text-slate-500">{bn ? `পৃষ্ঠা ${page} / ${Math.ceil(total / PAGE_SIZE)}` : `Page ${page} / ${Math.ceil(total / PAGE_SIZE)}`}</span><span className="flex gap-2"><Button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border px-3 py-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4"/></Button><Button type="button" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4"/></Button></span></nav>}
      </section>

      {selected && <div className="application-history-overlay fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section role="dialog" aria-modal="true" aria-label={bn ? 'আবেদনের বিস্তারিত' : 'Application details'} className="application-history-dialog max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900 sm:p-6"><div className="flex items-start justify-between gap-3 border-b pb-3"><div><p className="text-xs text-slate-500">{selected.application_type === 'mutation' ? (bn ? 'নামজারি আবেদন' : 'Mutation application') : (bn ? 'দলিল ডিজিটাইজেশন আবেদন' : 'Deed Digitization application')}</p><h2 className="mt-1 break-all font-mono text-lg font-bold">{selected.tracking_id}</h2><p className="mt-1 text-sm">{statusText(selected.status, bn)}</p></div><Button type="button" onClick={() => setSelected(null)} className="rounded-lg border p-2" aria-label={bn ? 'বন্ধ করুন' : 'Close'}><X className="h-4 w-4"/></Button></div>
          {detailLoading ? <div className="py-12 text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-700"/></div> : <>
            {isStaff && <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/20"><p className="text-xs text-slate-500">{bn ? 'আবেদনকারী' : 'Applicant'}</p><p className="mt-1 text-sm font-semibold">{selected.applicant_name || selected.details?.applicant_name || '—'}</p>{selected.applicant_username && <p className="mt-0.5 text-xs text-slate-500">@{selected.applicant_username}</p>}</div>}
            {selected.application_type === 'mutation' ? <><div className="mt-4 grid gap-3 sm:grid-cols-2">{[[bn?'আবেদনকারী':'Applicant',selected.details?.applicant_name],[bn?'জেলা':'District',selected.details?.district],[bn?'উপজেলা':'Upazila',selected.details?.upazila],[bn?'মৌজা':'Mouza',selected.details?.mouza],[bn?'দাগ':'Plot',selected.details?.plot_no],[bn?'খতিয়ান':'Khatian',selected.details?.khatian_no],[bn?'দলিল নম্বর':'Deed number',selected.details?.deed_no],[bn?'জমা দেওয়ার তারিখ':'Submitted',dateText(selected.submitted_at,lang)]].filter(([,value])=>value).map(([label,value])=><div key={label} className="rounded-xl border p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold">{value}</p></div>)}</div>{isStaff && staffMutationDetails.length > 0 && <div className="mt-3 rounded-xl border p-3"><h3 className="text-sm font-semibold">{bn ? 'অতিরিক্ত দাখিলকৃত তথ্য' : 'Additional submitted details'}</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{staffMutationDetails.map(([key,value])=><div key={key} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800"><p className="text-[11px] text-slate-500">{key.replaceAll('_',' ')}</p><p className="mt-1 break-words text-sm">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p></div>)}</div></div>}</> : <div className="mt-4 rounded-xl border p-4"><p className="text-sm font-semibold">{selected.details?.entry_method === 'ocr' ? (bn?'OCR দিয়ে দাখিল':'Submitted with OCR') : (bn?'হাতে তথ্য দিয়ে দাখিল':'Submitted manually')}</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(selected.details?.deed_data || {}).filter(([key,value]) => (isStaff || ['deed_no','reg_year','deed_type','division','district','upazila','mouza','union_ward','plot_id','khatian_no','seller_name','buyer_name'].includes(key)) && value !== null && value !== undefined && value !== '').map(([key,value])=><div key={key} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800"><p className="text-[11px] text-slate-500">{key}</p><p className="mt-1 break-words text-sm font-medium">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p></div>)}</div>{isStaff && selected.details?.ocr_text && <details className="mt-3 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">{bn ? 'OCR-এ পাওয়া মূল টেক্সট' : 'Raw OCR text'}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{selected.details.ocr_text}</pre></details>}{!isStaff && selected.digital_deed?.deed_id && selected.status === 'completed' && selected.digital_deed.record_status === 'active' && <Button type="button" onClick={openDigitalDeed} className="gov-btn-primary mt-3 inline-flex items-center gap-2 px-3 py-2 text-xs"><ExternalLink className="h-4 w-4"/>{bn ? 'অনুমোদিত ডিজিটাল দলিল দেখুন' : 'Open approved digital deed'}</Button>}</div>}
            <h3 className="mt-5 flex items-center gap-2 font-bold"><Clock3 className="h-4 w-4 text-emerald-700"/>{bn ? 'আবেদনের প্রকৃত অগ্রগতি' : 'Recorded application timeline'}</h3>
            {selected.timeline?.length ? <ol className="mt-3 space-y-3">{selected.timeline.map((event,index)=><li key={`${event.created_at}-${index}`} className="relative ml-2 border-l-2 border-emerald-200 pb-1 pl-5 last:border-transparent"><span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-600 shadow"/><p className="font-semibold text-sm">{statusText((event.status || event.to_status || '').toLowerCase().replaceAll(' ','_'),bn)}</p><p className="text-[11px] text-slate-500">{dateText(event.created_at,lang)} · {event.actor_name ? `${event.actor_name} · ` : ''}{event.actor_role || (bn?'ব্যবস্থা':'System')}</p>{event.note || event.remarks ? <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800">{event.note || event.remarks}</p> : null}</li>)}</ol> : <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">{bn ? 'এই আবেদনের জন্য অতিরিক্ত timeline event রেকর্ড নেই।' : 'No additional timeline events are recorded for this application.'}</p>}
            {selected.application_type === 'deed_digitization' && selected.documents?.length > 0 && <div className="mt-4"><h3 className="font-bold text-sm">{bn?'সংযুক্ত নথি':'Attached documents'}</h3><ul className="mt-2 space-y-2">{selected.documents.map((doc)=><li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-xs"><span className="break-all">{doc.original_filename}</span><Button type="button" onClick={async()=>{try{const blob=isStaff?await api.downloadStaffHistoryApplicationDocument(selected.details?.id,doc.id):await api.downloadDigitizationApplicationDocument(selected.details?.id,doc.id);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=doc.original_filename;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){setNotice(error.message);}}} className="rounded border px-2 py-1">{bn?'ডাউনলোড':'Download'}</Button></li>)}</ul></div>}
            {!isStaff && selected.application_type === 'mutation' && selected.status.toLowerCase().replaceAll(' ','_') === 'correction_required' && <form onSubmit={submitMutationCorrection} className="mt-5 space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4"><h3 className="font-bold text-sm">{bn?'সংশোধিত তথ্য জমা দিন':'Submit corrected information'}</h3><div className="grid gap-3 sm:grid-cols-2"><Input value={correctionPhone} onChange={(event)=>setCorrectionPhone(event.target.value)} className="gov-input" placeholder={bn?'যোগাযোগ নম্বর':'Contact phone'}/><Input value={correctionAddress} onChange={(event)=>setCorrectionAddress(event.target.value)} className="gov-input" placeholder={bn?'যোগাযোগের ঠিকানা':'Contact address'}/></div><textarea value={correctionNotes} onChange={(event)=>setCorrectionNotes(event.target.value)} className="gov-input min-h-24 w-full" required placeholder={bn?'সংশোধনের বিবরণ লিখুন':'Describe your corrections'}/><Button type="submit" disabled={resubmitting} className="gov-btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">{resubmitting?<RefreshCw className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}{bn?'সংশোধন জমা দিন':'Resubmit correction'}</Button></form>}
            {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
            <p className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{isStaff ? (bn ? 'এটি staff-এর read-only history view। আবেদন পর্যালোচনা বা সিদ্ধান্ত সংশ্লিষ্ট অনুমোদিত workflow থেকে করতে হবে। আবেদন পর্যালোচনার অবস্থা সরকারি মালিকানার চূড়ান্ত প্রমাণ নয়।' : 'This is a read-only staff history view. Use the authorized review workflow for decisions. Application status is not final proof of government ownership.') : (bn?'এই পাতায় শুধু আপনার অ্যাকাউন্টের আবেদন দেখানো হয়। আবেদন পর্যালোচনার অবস্থা সরকারি নিবন্ধন বা মালিকানার চূড়ান্ত প্রমাণ নয়।':'This page only displays applications belonging to your account. Application review status is not final proof of government registration or ownership.')}</p>
          </>}</section></div>}
    </div>
  );
}
