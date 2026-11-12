import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import Input from '../components/Input';
import Button from '../components/Button';
import {
  Search, ClipboardCheck, RefreshCw, FileText, GitBranchPlus, X,
  ExternalLink, ChevronLeft, ChevronRight, CheckCircle2, XCircle, UserRoundCog, Download,
} from 'lucide-react';

const PAGE_SIZE = 20;
const statusLabel = (status, bn) => {
  const labels = {
    submitted: ['জমা হয়েছে', 'Submitted'], under_review: ['পর্যালোচনাধীন', 'Under Review'],
    correction_required: ['সংশোধন প্রয়োজন', 'Correction Required'], resubmitted: ['পুনরায় জমা', 'Resubmitted'],
    approved: ['অনুমোদিত', 'Approved'], processing: ['প্রক্রিয়াধীন', 'Processing'],
    completed: ['সম্পন্ন', 'Completed'], rejected: ['প্রত্যাখ্যাত', 'Rejected'], cancelled: ['বাতিল', 'Cancelled'],
  };
  const key = String(status || '').toLowerCase().replaceAll(' ', '_');
  return labels[key]?.[bn ? 0 : 1] || status || '—';
};

const canDecide = (item) => ['submitted', 'under_review', 'resubmitted'].includes(
  String(item.status || '').toLowerCase().replaceAll(' ', '_'),
);

export default function UnifiedApplicationAdmin({ view = 'review', setActiveTab, setSelectedTracking, navigateBack, onOpenDeedApplication }) {
  const { lang, user } = useApp();
  const bn = lang === 'bn';
  const approvedView = view === 'approved';
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState(approvedView ? 'approved' : 'all');
  const [dateField, setDateField] = useState('submitted');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('latest');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [availableTypes, setAvailableTypes] = useState(['mutation']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decision, setDecision] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [officers, setOfficers] = useState([]);
  const [assignmentSelections, setAssignmentSelections] = useState({});
  const [assigningId, setAssigningId] = useState('');

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), application_type: type, date_field: dateField, sort });
    if (query.trim()) params.set('q', query.trim());
    if (status !== 'all') params.set('status', status);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    try {
      const data = await api.getUnifiedAdminApplications(params.toString());
      setItems(data.items || []);
      setTotal(Number(data.total || 0));
      setAvailableTypes(data.available_types || ['mutation']);
    } catch (reason) {
      setError(reason.message || (bn ? 'আবেদন তালিকা লোড হয়নি।' : 'Could not load applications.'));
    } finally {
      setLoading(false);
    }
  }, [page, type, status, dateField, dateFrom, dateTo, sort, query, bn]);

  useEffect(() => { loadApplications(); }, [loadApplications]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    api.listDigitizationOfficers()
      .then((result) => setOfficers(result.items || []))
      .catch((reason) => setError(reason.message || (bn ? 'কর্মকর্তার তালিকা পাওয়া যায়নি।' : 'Could not load the officer list.')));
  }, [user?.role, bn]);

  const showDetails = async (item) => {
    setSelected({ item, detail: null });
    setDetailLoading(true);
    setError('');
    try {
      const detail = item.application_type === 'mutation'
        ? await api.trackMutation(item.tracking_id)
        : await api.getDigitizationApplication(item.application_id);
      setSelected({ item, detail });
    } catch (reason) {
      setSelected(null);
      setError(reason.message || (bn ? 'আবেদনের বিস্তারিত পাওয়া যায়নি।' : 'Application details are unavailable.'));
    } finally { setDetailLoading(false); }
  };

  const openReview = (item) => {
    setSelected(null);
    if (item.application_type === 'mutation') {
      setSelectedTracking?.(item.tracking_id);
      setActiveTab?.('officer-review');
    } else if (item.application_id && onOpenDeedApplication) onOpenDeedApplication(item.application_id);
    else setActiveTab?.('deed-digitization');
  };

  const assignOfficer = async (item) => {
    const assignmentKey = `${item.application_type}:${item.application_id}`;
    const officerId = assignmentSelections[assignmentKey] ?? (item.assigned_officer_id ? String(item.assigned_officer_id) : '');
    setAssigningId(assignmentKey);
    setError('');
    setNotice('');
    try {
      const result = item.application_type === 'mutation'
        ? await api.assignMutationApplication(item.tracking_id, officerId ? Number(officerId) : null)
        : await api.assignDigitizationApplication(item.application_id, officerId ? Number(officerId) : null);
      setNotice(result.assigned_officer_id
        ? (bn ? 'আবেদনটি কর্মকর্তাকে দায়িত্ব দেওয়া হয়েছে।' : 'Application assigned to the officer.')
        : (bn ? 'কর্মকর্তার দায়িত্ব সরানো হয়েছে।' : 'Officer assignment removed.'));
      await loadApplications();
    } catch (reason) {
      setError(reason.message || (bn ? 'কর্মকর্তাকে দায়িত্ব দেওয়া যায়নি।' : 'Could not assign the application.'));
    } finally { setAssigningId(''); }
  };

  const submitDecision = async (event) => {
    event.preventDefault();
    if (!decision) return;
    if (decision.action === 'rejected' && !decisionNote.trim()) {
      setError(bn ? 'প্রত্যাখ্যানের কারণ লিখুন।' : 'Enter a rejection reason.');
      return;
    }
    setDecisionBusy(true);
    setError('');
    try {
      if (decision.item.application_type === 'mutation') {
        await api.performMutationAction({
          tracking_no: decision.item.tracking_id,
          new_status: decision.action === 'approved' ? 'Approved' : 'Rejected',
          remarks: decisionNote.trim(),
          rejection_reason: decision.action === 'rejected' ? decisionNote.trim() : '',
        });
      } else {
        await api.decideDigitizationApplication(decision.item.application_id, decision.action, decisionNote.trim());
      }
      setNotice(decision.action === 'approved'
        ? (bn ? 'আবেদন অনুমোদিত হয়েছে।' : 'Application approved.')
        : (bn ? 'আবেদন প্রত্যাখ্যান করা হয়েছে।' : 'Application rejected.'));
      setDecision(null);
      setDecisionNote('');
      await loadApplications();
    } catch (reason) {
      setError(reason.message || (bn ? 'সিদ্ধান্ত সংরক্ষণ করা যায়নি।' : 'Could not save the decision.'));
    } finally { setDecisionBusy(false); }
  };

  const formatDate = (value) => value ? new Date(value).toLocaleString(bn ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const downloadDocument = async (applicationId, fileRecord) => {
    try {
      const blob = await api.downloadDigitizationApplicationDocument(applicationId, fileRecord.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileRecord.original_filename || 'application-document';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason.message || (bn ? 'নথি ডাউনলোড করা যায়নি।' : 'Could not download the document.'));
    }
  };

  if (!['officer', 'admin'].includes(user?.role)) {
    return <div className="gov-container py-16"><div role="alert" className="gov-card p-6 text-center">{bn ? 'এই প্রশাসনিক পাতায় প্রবেশের অনুমতি নেই।' : 'You are not authorized to view this administrative page.'}</div></div>;
  }

  const detailFields = selected?.item.application_type === 'mutation'
    ? Object.entries(selected.detail || {}).filter(([key, value]) => ['applicant_name','district','upazila','mouza','plot_no','khatian_no','deed_no','status','created_at','review_notes','rejection_reason'].includes(key) && value)
    : Object.entries(selected?.detail?.deed_data || {}).filter(([key, value]) => ['deed_no','reg_year','deed_type','division','district','upazila','mouza','union_ward','plot_id','khatian_no','seller_name','buyer_name'].includes(key) && value);

  return <div className="gov-container max-w-6xl space-y-5 py-6">
    <PageHeader
      title={approvedView ? (bn ? 'অনুমোদিত আবেদন' : 'Approved Applications') : (bn ? 'আবেদন পর্যালোচনা ও সিদ্ধান্ত' : 'Application Review & Decisions')}
      subtitle={approvedView
        ? (bn ? 'অনুমোদিত নামজারি ও সম্পন্ন ডিজিটাল দলিল আবেদন দেখুন।' : 'View approved mutation applications and completed digital deed applications.')
        : (bn ? 'Admin সব দাখিলকৃত আবেদন দেখেন; Officer শুধু দায়িত্বপ্রাপ্ত আবেদন দেখেন।' : 'Admins can review all submitted applications. Officers see only applications assigned to them.')}
      icon={ClipboardCheck} badge={bn ? 'অনুমতিনিয়ন্ত্রিত' : 'Permission controlled'} badgeColor="indigo"
      breadcrumbs={[{ label: bn ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }]}
      setActiveTab={setActiveTab} onBack={() => navigateBack ? navigateBack('dashboard') : setActiveTab?.('dashboard')} fallbackTab="dashboard"
    />

    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={() => setActiveTab?.('application-admin')} className={!approvedView ? 'gov-btn-primary px-4 py-2 text-sm' : 'gov-btn-secondary px-4 py-2 text-sm'}>{bn ? 'আবেদন পর্যালোচনা' : 'Application Review'}</Button>
      <Button type="button" onClick={() => setActiveTab?.('approved-applications')} className={approvedView ? 'gov-btn-primary px-4 py-2 text-sm' : 'gov-btn-secondary px-4 py-2 text-sm'}>{bn ? 'অনুমোদিত আবেদন' : 'Approved Applications'}</Button>
    </div>

    <section className="gov-card space-y-3 p-4 sm:p-5">
      <form onSubmit={(event) => { event.preventDefault(); setPage(1); }} className="flex flex-col gap-2 sm:flex-row">
        <Input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} className="gov-input flex-1" placeholder={bn ? 'Tracking ID, আবেদনকারীর নাম বা username লিখুন...' : 'Search Tracking ID, applicant name, or username...'} aria-label={bn ? 'Tracking ID বা আবেদনকারী খুঁজুন' : 'Search Tracking ID or applicant'} />
        <Button type="submit" disabled={loading} className="gov-btn-primary inline-flex items-center justify-center gap-2 px-5 py-2">{loading ? <RefreshCw className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}{bn ? 'খুঁজুন' : 'Search'}</Button>
        <Button type="button" onClick={loadApplications} disabled={loading} className="gov-btn-secondary inline-flex items-center justify-center gap-2 px-4 py-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>{bn ? 'রিফ্রেশ' : 'Refresh'}</Button>
      </form>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <select value={type} onChange={(event) => { setPage(1); setType(event.target.value); }} className="gov-input text-sm"><option value="all">{bn ? 'সব আবেদনের ধরন' : 'All application types'}</option><option value="mutation">{bn ? 'নামজারি' : 'Mutation'}</option>{availableTypes.includes('deed_digitization') && <option value="deed_digitization">{bn ? 'দলিল ডিজিটাইজেশন' : 'Deed Digitization'}</option>}</select>
        <select value={approvedView ? 'approved' : status} disabled={approvedView} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className="gov-input text-sm">{approvedView ? <option value="approved">{bn ? 'অনুমোদিত / সম্পন্ন' : 'Approved / Completed'}</option> : <><option value="all">{bn ? 'সব অবস্থা' : 'All statuses'}</option><option value="pending">{bn ? 'অপেক্ষমাণ' : 'Pending'}</option><option value="under_review">{bn ? 'পর্যালোচনাধীন' : 'Under Review'}</option><option value="approved">{bn ? 'অনুমোদিত / সম্পন্ন' : 'Approved / Completed'}</option><option value="rejected">{bn ? 'প্রত্যাখ্যাত' : 'Rejected'}</option>{['submitted','correction_required','resubmitted','processing','completed','cancelled'].map((key) => <option key={key} value={key}>{statusLabel(key, bn)}</option>)}</>}</select>
        <select value={dateField} onChange={(event) => { setPage(1); setDateField(event.target.value); }} className="gov-input text-sm"><option value="submitted">{bn ? 'দাখিলের তারিখ' : 'Submission date'}</option><option value="updated">{bn ? 'সর্বশেষ হালনাগাদ' : 'Last updated'}</option></select>
        <Input type="date" value={dateFrom} onChange={(event) => { setPage(1); setDateFrom(event.target.value); }} className="gov-input text-sm" aria-label={bn ? 'শুরুর তারিখ' : 'From date'}/>
        <Input type="date" value={dateTo} onChange={(event) => { setPage(1); setDateTo(event.target.value); }} className="gov-input text-sm" aria-label={bn ? 'শেষ তারিখ' : 'To date'}/>
        <select value={sort} onChange={(event) => { setPage(1); setSort(event.target.value); }} className="gov-input text-sm"><option value="latest">{bn ? 'সর্বশেষ আগে' : 'Latest first'}</option><option value="oldest">{bn ? 'পুরোনো আগে' : 'Oldest first'}</option><option value="recently_updated">{bn ? 'সর্বশেষ হালনাগাদ আগে' : 'Recently updated'}</option></select>
      </div>
      <p className="text-xs text-slate-500">{total} {bn ? 'টি আবেদন' : 'applications'} · {bn ? 'তথ্য ও সিদ্ধান্তের অনুমতি backend-এ যাচাই হয়।' : 'Access and decisions are checked by the backend.'}</p>
    </section>

    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!error && user.role === 'officer' && items.length === 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{bn ? 'এই কর্মকর্তার জন্য কোনো আবেদন দায়িত্ব দেওয়া নেই। Admin-কে আবেদন assign করতে বলুন।' : 'No applications are assigned to this officer. Ask an admin to assign applications.'}</p>}

    <section className="gov-card space-y-3 p-4 sm:p-5">
      {loading ? <div className="space-y-3">{[1,2,3].map((n) => <div key={n} className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"/>)}</div> : items.length ? items.map((item) => {
        const isMutation = item.application_type === 'mutation';
        const Icon = isMutation ? GitBranchPlus : FileText;
        const eligible = canDecide(item) && !approvedView;
        const assignmentKey = `${item.application_type}:${item.application_id}`;
        const assignableStatuses = isMutation
          ? ['submitted','under_review','correction_required','resubmitted']
          : ['submitted','under_review','resubmitted'];
        const assignable = user.role === 'admin' && assignableStatuses.includes(String(item.status || '').toLowerCase().replaceAll(' ', '_'));
        return <article key={`${item.application_type}:${item.application_id}`} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3"><span className="rounded-xl bg-indigo-50 p-2 text-indigo-700"><Icon className="h-5 w-5"/></span><div className="min-w-0"><strong className="break-all font-mono text-sm">{item.tracking_id}</strong><p className="mt-1 text-xs text-slate-600">{item.applicant_name || '—'}{item.applicant_username ? ` · @${item.applicant_username}` : ''}</p><p className="mt-1 text-xs text-slate-500">{isMutation ? (bn ? 'নামজারি' : 'Mutation') : (bn ? 'দলিল ডিজিটাইজেশন' : 'Deed Digitization')}{item.reference ? ` · ${item.reference}` : ''}{item.district ? ` · ${item.district}` : ''}{item.plot_no ? ` · ${bn ? 'দাগ' : 'Plot'} ${item.plot_no}` : ''}</p></div></div>
            <span className="shrink-0 rounded-full border px-2.5 py-1 text-xs">{statusLabel(item.status, bn)}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"><span className="text-[11px] text-slate-500">{bn ? 'জমা' : 'Submitted'}: {formatDate(item.submitted_at)} · {bn ? 'হালনাগাদ' : 'Updated'}: {formatDate(item.updated_at)}</span><span className="flex flex-wrap gap-2"><Button type="button" onClick={() => showDetails(item)} className="rounded-lg border px-3 py-1.5 text-xs">{bn ? 'বিস্তারিত' : 'Details'}</Button>{eligible && <><Button type="button" onClick={() => { setDecision({ item, action: 'approved' }); setDecisionNote(''); setError(''); }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs text-white"><CheckCircle2 className="h-3.5 w-3.5"/>{bn ? 'অনুমোদন' : 'Approve'}</Button><Button type="button" onClick={() => { setDecision({ item, action: 'rejected' }); setDecisionNote(''); setError(''); }} className="inline-flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-1.5 text-xs text-white"><XCircle className="h-3.5 w-3.5"/>{bn ? 'প্রত্যাখ্যান' : 'Reject'}</Button></>}{!eligible && !approvedView && <Button type="button" onClick={() => openReview(item)} className="gov-btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs"><ExternalLink className="h-3.5 w-3.5"/>{bn ? 'পর্যালোচনা খুলুন' : 'Open review'}</Button>}</span></div>
          {assignable && <div className="mt-3 flex flex-col gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800 sm:flex-row sm:items-center"><UserRoundCog className="h-4 w-4 text-indigo-700"/><label className="sr-only" htmlFor={`assign-${assignmentKey}`}>{bn ? 'কর্মকর্তা নির্বাচন' : 'Assign officer'}</label><select id={`assign-${assignmentKey}`} value={assignmentSelections[assignmentKey] ?? (item.assigned_officer_id ? String(item.assigned_officer_id) : '')} onChange={(event) => setAssignmentSelections((current) => ({ ...current, [assignmentKey]: event.target.value }))} className="gov-input min-w-0 flex-1 text-sm"><option value="">{bn ? 'কর্মকর্তাকে দায়িত্ব দিন…' : 'Assign an officer…'}</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.name || officer.username} · @{officer.username}</option>)}</select><Button type="button" disabled={assigningId === assignmentKey || officers.length === 0} onClick={() => assignOfficer(item)} className="gov-btn-secondary px-3 py-2 text-xs">{assigningId === assignmentKey ? <RefreshCw className="h-4 w-4 animate-spin"/> : (bn ? 'দায়িত্ব সংরক্ষণ' : 'Save assignment')}</Button>{item.assigned_officer_name && <span className="text-xs text-slate-500">{bn ? 'দায়িত্বে:' : 'Assigned:'} {item.assigned_officer_name}</span>}</div>}
        </article>;
      }) : !error ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">{bn ? 'এই ফিল্টারে কোনো আবেদন পাওয়া যায়নি।' : 'No applications found for these filters.'}</p> : null}
      {total > PAGE_SIZE && <div className="flex items-center justify-between border-t pt-3"><span className="text-xs text-slate-500">{bn ? `পৃষ্ঠা ${page} / ${Math.ceil(total / PAGE_SIZE)}` : `Page ${page} / ${Math.ceil(total / PAGE_SIZE)}`}</span><span className="flex gap-2"><Button type="button" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))} className="rounded border p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4"/></Button><Button type="button" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((n) => n + 1)} className="rounded border p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4"/></Button></span></div>}
    </section>

    {decision && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !decisionBusy) setDecision(null); }}><form role="dialog" aria-modal="true" aria-labelledby="application-decision-title" onSubmit={submitDecision} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"><div className="flex items-start justify-between"><div><p className="text-xs text-slate-500">{decision.item.tracking_id}</p><h2 id="application-decision-title" className="mt-1 font-bold">{decision.action === 'approved' ? (bn ? 'আবেদন অনুমোদন' : 'Approve application') : (bn ? 'আবেদন প্রত্যাখ্যান' : 'Reject application')}</h2></div><Button type="button" disabled={decisionBusy} onClick={() => setDecision(null)} className="rounded border p-2"><X className="h-4 w-4"/></Button></div><p className="text-sm text-slate-600">{bn ? 'সিদ্ধান্তটি backend-এ সংরক্ষিত হবে এবং আবেদনকারীর tracking history হালনাগাদ হবে।' : 'This decision is saved to the backend and updates the applicant’s tracking history.'}</p><label className="block text-sm font-medium" htmlFor="decision-note">{decision.action === 'approved' ? (bn ? 'পর্যালোচনা নোট (ঐচ্ছিক)' : 'Review note (optional)') : (bn ? 'প্রত্যাখ্যানের কারণ *' : 'Reason for rejection *')}</label><textarea id="decision-note" value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} required={decision.action === 'rejected'} maxLength={2000} rows={4} className="gov-input w-full resize-y" placeholder={decision.action === 'approved' ? (bn ? 'প্রয়োজনে নোট লিখুন' : 'Optional note') : (bn ? 'কারণ লিখুন' : 'Enter the reason')} />{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" disabled={decisionBusy} onClick={() => setDecision(null)} className="gov-btn-secondary px-4 py-2 text-sm">{bn ? 'ফিরে যান' : 'Cancel'}</Button><Button type="submit" disabled={decisionBusy} className={decision.action === 'approved' ? 'gov-btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm' : 'inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm text-white disabled:opacity-50'}>{decisionBusy && <RefreshCw className="h-4 w-4 animate-spin"/>}{decision.action === 'approved' ? (bn ? 'অনুমোদন নিশ্চিত' : 'Confirm approval') : (bn ? 'প্রত্যাখ্যান নিশ্চিত' : 'Confirm rejection')}</Button></div></form></div>}

    {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"><div className="flex items-start justify-between border-b pb-3"><div><p className="text-xs text-slate-500">{selected.item.tracking_id} · {selected.item.applicant_name}</p><h2 className="mt-1 font-bold">{bn ? 'আবেদনের বিস্তারিত' : 'Application details'}</h2></div><Button type="button" onClick={() => setSelected(null)} className="rounded border p-2"><X className="h-4 w-4"/></Button></div>{detailLoading ? <div className="py-10 text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-700"/></div> : <><div className="mt-4 grid gap-2 sm:grid-cols-2">{detailFields.map(([key,value]) => <div key={key} className="rounded-lg border p-3"><p className="text-[11px] text-slate-500">{key.replaceAll('_',' ')}</p><p className="mt-1 break-words text-sm font-semibold">{String(value)}</p></div>)}</div>{selected.item.application_type === 'mutation' && selected.detail?.supporting_docs?.length > 0 && <div className="mt-5"><h3 className="font-bold">{bn ? 'দাখিলকৃত নথির রেফারেন্স' : 'Submitted document references'}</h3><ul className="mt-2 list-inside list-disc text-sm text-slate-600">{selected.detail.supporting_docs.map((doc,index) => <li key={`${doc}-${index}`} className="break-all">{doc}</li>)}</ul></div>}{selected.item.application_type === 'deed_digitization' && <div className="mt-5"><h3 className="font-bold">{bn ? 'দাখিলকৃত নথি' : 'Submitted documents'}</h3>{selected.detail?.documents?.length ? <ul className="mt-2 space-y-2">{selected.detail.documents.map((document) => <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><span className="break-all">{document.original_filename}</span><Button type="button" onClick={() => downloadDocument(selected.item.application_id, document)} className="gov-btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs"><Download className="h-3.5 w-3.5"/>{bn ? 'ডাউনলোড' : 'Download'}</Button></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">{bn ? 'কোনো ফাইল সংযুক্ত নেই।' : 'No files attached.'}</p>}</div>}<h3 className="mt-5 font-bold">{bn ? 'রিভিউ ইতিহাস' : 'Review history'}</h3>{(selected.item.application_type === 'mutation' ? selected.detail?.timeline : selected.detail?.history)?.length ? <ol className="mt-2 space-y-2">{(selected.item.application_type === 'mutation' ? selected.detail.timeline : selected.detail.history).map((event,index) => <li key={index} className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800"><strong>{statusLabel(event.to_status || event.status,bn)}</strong><span className="ml-2 text-slate-500">{formatDate(event.created_at)}</span>{(event.remarks || event.note) && <p className="mt-1">{event.remarks || event.note}</p>}</li>)}</ol> : <p className="mt-2 text-xs text-slate-500">{bn ? 'কোনো review history নেই।' : 'No review history recorded.'}</p>}<Button type="button" onClick={() => openReview(selected.item)} className="gov-btn-primary mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm"><ExternalLink className="h-4 w-4"/>{bn ? 'পর্যালোচনা খুলুন' : 'Open review interface'}</Button></>}</section></div>}
  </div>;
}
