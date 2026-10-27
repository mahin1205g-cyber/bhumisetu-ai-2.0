import React from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, ChevronRight, Home, Shield, Sparkles } from 'lucide-react';

/**
 * PageHeader — Premium Government-Grade Navigation Header
 * Provides consistent Back navigation, breadcrumb hierarchy, status badges,
 * and keyboard-accessible return controls across all inner pages.
 */
export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  badge,
  badgeColor = 'emerald',
  breadcrumbs = [],
  onBack,
  fallbackTab = 'dashboard',
  setActiveTab,
  actions,
  className = ''
}) {
  const { lang, t } = useApp();

  const handleBack = () => {
    if (typeof onBack === 'function') {
      onBack();
    } else if (typeof setActiveTab === 'function') {
      setActiveTab(fallbackTab);
    } else {
      window.history.back();
    }
  };

  const badgeColorClasses = {
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
    rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
  }[badgeColor] || 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20';

  return (
    <div className={`mb-6 select-none ${className}`}>
      {/* Top Nav Row: Back Button + Breadcrumbs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          {/* Universal Back Button */}
          <button
            type="button"
            onClick={handleBack}
            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 hover:text-emerald-700 dark:hover:text-emerald-300 shadow-xs transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 active:scale-95"
            title={lang === 'bn' ? 'পূর্ববর্তী পাতায় ফিরে যান (Alt + Left)' : 'Go back to previous page (Alt + Left)'}
            aria-label={lang === 'bn' ? 'পেছনে যান' : 'Go back'}
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
            <span>{lang === 'bn' ? 'পেছনে' : 'Back'}</span>
          </button>

          {/* Breadcrumb Hierarchy */}
          <nav aria-label="Breadcrumb" className="hidden sm:flex items-center text-xs text-slate-500 dark:text-slate-400">
            <button
              onClick={() => setActiveTab && setActiveTab('home')}
              className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'মূল পাতা' : 'Home'}</span>
            </button>

            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                <ChevronRight className="w-3 h-3 mx-1 text-slate-400" />
                {crumb.tab && setActiveTab ? (
                  <button
                    onClick={() => setActiveTab(crumb.tab)}
                    className="hover:text-slate-900 dark:hover:text-white transition-colors truncate max-w-[140px]"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className="text-slate-700 dark:text-slate-200 font-medium truncate max-w-[160px]">
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}

            {title && (
              <>
                <ChevronRight className="w-3 h-3 mx-1 text-slate-400" />
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold truncate max-w-[180px]">
                  {title}
                </span>
              </>
            )}
          </nav>
        </div>

        {/* Optional Action Buttons (Print, Refresh, Actions) */}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Main Page Title Header */}
      <div className="pt-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border border-emerald-500/20">
                <Icon className="w-5 h-5" />
              </div>
            )}
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h1>
            {badge && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badgeColorClasses}`}>
                <Shield className="w-3 h-3" />
                <span>{badge}</span>
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
