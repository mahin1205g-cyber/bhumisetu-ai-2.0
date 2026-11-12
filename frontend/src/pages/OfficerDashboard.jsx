import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import { ClipboardCheck, RefreshCw, Clock3, CheckCircle2, FileText, AlertTriangle } from 'lucide-react';

const EMPTY_SUMMARY = { total: 0, pending: 0, under_review: 0, completed: 0, closed: 0 };

export default function OfficerDashboard({ setActiveTab, navigateBack }) {
  const { user, t } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api.getUnifiedAdminApplications('page=1&page_size=5')
      .then(setData)
      .catch((reason) => setError(reason.message || t('officerDashboardError')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [user?.id]);

  const summary = data?.summary || EMPTY_SUMMARY;
  const cards = [
    { key: 'total', icon: FileText, label: t('officerDashboardAssigned'), value: summary.total, tone: 'text-indigo-700 bg-indigo-50' },
    { key: 'pending', icon: Clock3, label: t('officerDashboardAwaiting'), value: summary.pending, tone: 'text-amber-700 bg-amber-50' },
    { key: 'under_review', icon: ClipboardCheck, label: t('officerDashboardReviewing'), value: summary.under_review, tone: 'text-sky-700 bg-sky-50' },
    { key: 'completed', icon: CheckCircle2, label: t('officerDashboardCompleted'), value: summary.completed, tone: 'text-emerald-700 bg-emerald-50' },
  ];

  return <div className="gov-container max-w-6xl space-y-5 py-6">
    <PageHeader
      title={t('officerDashboardTitle')}
      subtitle={t('officerDashboardSubtitle')}
      icon={ClipboardCheck}
      badge={user?.designation || t('roleOfficer')}
      badgeColor="indigo"
      setActiveTab={setActiveTab}
      onBack={() => navigateBack ? navigateBack('home') : setActiveTab?.('home')}
      fallbackTab="home"
    />

    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    {!error && data?.assignment_scope_configured === false && <div role="status" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0"/><p>{t('officerDashboardScopeUnavailable')}</p></div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('officerDashboardTitle')}>
      {cards.map(({ key, icon: Icon, label, value, tone }) => <article key={key} className="gov-card flex items-center gap-3 p-4">
        <span className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5"/></span>
        <div><p className="text-xs text-slate-500">{label}</p><strong className="mt-1 block text-2xl text-slate-900 dark:text-white">{loading ? '—' : value}</strong></div>
      </article>)}
    </section>

    <section className="gov-card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900 dark:text-white">{t('officerDashboardRecent')}</h2><p className="mt-1 text-xs text-slate-500">{t('officerDashboardScopedHint')}</p></div><Button type="button" onClick={load} disabled={loading} className="gov-btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}/>{t('officerDashboardRefresh')}</Button></div>
      {loading ? <p role="status" className="py-8 text-center text-sm text-slate-500">{t('officerDashboardLoading')}</p> : data?.items?.length ? <div className="space-y-2">{data.items.map((item) => { const statusKey = { submitted: 'statusSubmitted', under_review: 'statusUnderReview', correction_required: 'statusCorrectionRequired', resubmitted: 'statusResubmitted', approved: 'statusApproved', processing: 'statusProcessing', completed: 'statusCompleted', rejected: 'statusRejected', cancelled: 'statusCancelled' }[item.status]; return <article key={`${item.application_type}:${item.application_id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div><strong className="font-mono text-sm">{item.tracking_id}</strong><p className="mt-1 text-xs text-slate-500">{item.applicant_name || '—'} · {item.application_type === 'mutation' ? t('navMutation') : t('navDigitization')}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800">{statusKey ? t(statusKey) : item.status}</span></article>; })}</div> : <p className="rounded-lg border border-dashed p-7 text-center text-sm text-slate-500">{t('officerDashboardNoApps')}</p>}
      <div className="flex flex-wrap gap-2 border-t pt-4"><Button type="button" onClick={() => setActiveTab?.('application-admin')} className="gov-btn-primary px-4 py-2 text-sm">{t('officerDashboardSearch')}</Button><Button type="button" onClick={() => setActiveTab?.('officer-review')} className="gov-btn-secondary px-4 py-2 text-sm">{t('officerDashboardReviewAction')}</Button></div>
    </section>
  </div>;
}
