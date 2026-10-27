import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import BhumiSathiLogo from '../components/BhumiSathiLogo';
import {
  FileCheck2, GitBranchPlus, AlertOctagon, Layers, Clock, ArrowRight,
  TrendingUp, ShieldAlert, CheckCircle, RefreshCw, Eye, Search, Zap,
  PhoneCall, HelpCircle, Shield, Sparkles, CheckCircle2, ChevronRight,
  ArrowLeft, Home
} from 'lucide-react';

export default function Dashboard({ setActiveTab, setSelectedRef, setSelectedTracking, navigateBack }) {
  const { lang, t, user } = useApp();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // In-dashboard Quick Tracker State
  const [trackInput, setTrackInput] = useState('');
  const [quickTrackResult, setQuickTrackResult] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackError, setTrackError] = useState('');

  // Dashboard Fast Binary Search State
  const [dashboardQuery, setDashboardQuery] = useState('');
  const [dashSearchResults, setDashSearchResults] = useState(null);
  const [dashSearchLoading, setDashSearchLoading] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleQuickTrack = async (e) => {
    e.preventDefault();
    if (!trackInput.trim()) return;

    setTrackingLoading(true);
    setTrackError('');
    setQuickTrackResult(null);

    try {
      const data = await api.trackMutation(trackInput.trim());
      setQuickTrackResult(data);
    } catch (err) {
      setTrackError(err.message || 'আবেদনটি খুঁজে পাওয়া যায়নি');
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleDashboardSearch = async (e) => {
    e.preventDefault();
    if (!dashboardQuery.trim()) return;

    setDashSearchLoading(true);
    try {
      const data = await api.searchBinary(dashboardQuery.trim(), 'all', 8);
      setDashSearchResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setDashSearchLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="gov-container py-20 text-center space-y-3">
        <RefreshCw className="w-9 h-9 text-[#047857] animate-spin mx-auto" />
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
          {lang === 'bn' ? 'ড্যাশবোর্ড ডেটা প্রস্তুত হচ্ছে...' : 'Loading dashboard statistics...'}
        </p>
      </div>
    );
  }

  const mStats = stats?.mutation_stats || {};
  const rStats = stats?.record_risk_stats || {};
  const ddStats = stats?.due_diligence_stats || {};
  const totalRiskAlerts = (rStats.high || 0) + (ddStats.high || 0);

  return (
    <div className="gov-container py-6 sm:py-8 space-y-6 max-w-7xl">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigateBack ? navigateBack('home') : setActiveTab('home')}
            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 hover:text-emerald-700 dark:hover:text-emerald-300 shadow-xs transition focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            title={lang === 'bn' ? 'মূল পাতায় ফিরে যান' : 'Go back to Home landing page'}
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span>{lang === 'bn' ? 'মূল পাতা' : 'Back to Home'}</span>
          </button>

          <span className="text-slate-400 text-xs hidden sm:inline">•</span>
          <span className="text-slate-500 text-xs font-medium hidden sm:inline">
            {lang === 'bn' ? 'নাগরিক সেবা ড্যাশবোর্ড' : 'Service Workspace'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{lang === 'bn' ? 'সিস্টেম সক্রিয়' : 'System Online'}</span>
          </span>
        </div>
      </div>

      {/* 1. Welcoming Hero Banner & Personalized Greeting */}
      <div className="gov-card p-6 bg-gradient-to-r from-[#065F46] via-[#047857] to-[#0b462d] text-white border border-emerald-500/20 shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <BhumiSathiLogo size={56} className="w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 animate-float drop-shadow-xl" />
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-emerald-100 font-bold text-xs uppercase tracking-wider">
                  {lang === 'bn' ? 'ভূমিসেতু — Bhumisetu' : 'Bhumisetu Portal'}
                </span>
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#F5B544] text-slate-900 font-mono">
                  {user?.role === 'officer'
                    ? (lang === 'bn' ? 'ভূমি কর্মকর্তা' : 'AC Land Officer')
                    : user?.role === 'admin'
                    ? (lang === 'bn' ? 'সিস্টেম অ্যাডমিন' : 'Admin')
                    : (lang === 'bn' ? 'নাগরিক সেবা' : 'Citizen')}
                </span>
                <span className="text-xs text-emerald-100/80">
                  {lang === 'bn' ? 'অনলাইন সেবা পোর্টাল' : 'Online Land Portal'}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {lang === 'bn' ? `স্বাগতম, ${user?.name || 'নাগরিক'}` : `Welcome, ${user?.name || 'Citizen'}`}
              </h1>
              <p className="text-xs sm:text-sm text-emerald-50 mt-1 max-w-xl">
                {lang === 'bn'
                  ? 'নিরাপদ ভূমি সিদ্ধান্তের নির্ভরযোগ্য ডিজিটাল সেতু — দলিল যাচাই, ই-নামজারি এবং স্বত্ব ঝুঁকি নিরূপণ এক ক্লিকেই।'
                  : 'Your trusted digital bridge for safer land decisions — deed verification, smart e-namjari mutations, and pre-purchase due diligence.'}
              </p>
            </div>
          </div>

          {/* Quick Actions & Refresh */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchStats}
              className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white flex items-center gap-1.5 transition"
              title="Refresh Data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'হালনাগাদ' : 'Refresh'}</span>
            </button>
            <button
              onClick={() => setActiveTab('deed-verify')}
              className="gov-btn-primary text-xs py-2 px-4 shadow-sm"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>{lang === 'bn' ? 'নতুন দলিল যাচাই' : 'Verify Deed'}</span>
            </button>
          </div>
        </div>

        {/* Scalability Indicator Badge */}
        <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-200">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-emerald-300" />
            <span className="font-semibold text-white">
              {lang === 'bn' ? 'অ্যালগরিদম স্পিড:' : 'Search Engine:'}
            </span>
            <span className="text-[#F5B544] font-mono">Binary Search O(log N)</span>
            <span className="text-emerald-100/80">({lang === 'bn' ? '১০০-৫০০ মিলিয়ন ডেটায় ক্র্যাশ-মুক্ত' : 'Scalable to 500M records'})</span>
          </div>

          <div className="flex items-center gap-3">
            <a href="tel:16122" className="text-emerald-100 hover:text-white hover:underline flex items-center gap-1 font-semibold">
              <PhoneCall className="w-3 h-3" />
              <span>{lang === 'bn' ? 'হটলাইন ১৬১২২' : 'Hotline 16122'}</span>
            </a>
          </div>
        </div>
      </div>

      {/* 2. Instant In-Dashboard Fast Search Bar */}
      <div className="gov-card p-4 sm:p-5 bg-white dark:bg-[#131c27] shadow-sm border border-[#E2E8F0] dark:border-gray-700">
        <form onSubmit={handleDashboardSearch} className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Search className="w-4 h-4 text-[#047857] dark:text-emerald-400" />
                <span>{lang === 'bn' ? 'তাৎক্ষণিক অনুসন্ধান (বাইনারি সার্চ)' : 'Instant Search (Binary Search O(log N))'}</span>
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {lang === 'bn'
                  ? 'দলিল নম্বর, দাগ নম্বর, খতিয়ান বা নামজারি ট্র্যাকিং নম্বর দিয়ে মুহূর্তের মধ্যে অনুসন্ধান করুন।'
                  : 'Instantly find any deed, plot, khatian or tracking number in sub-milliseconds.'}
              </p>
            </div>

            {/* Quick Filter Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { label: 'PL-784', query: 'PL-784' },
                { label: '1042', query: '1042' },
                { label: 'MUT-2026-DHK-4821', query: 'MUT-2026-DHK-4821' },
                { label: 'KH-102', query: 'KH-102' }
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    setDashboardQuery(chip.query);
                    api.searchBinary(chip.query, 'all', 8).then((res) => setDashSearchResults(res));
                  }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 hover:bg-emerald-50 hover:text-[#047857] dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-mono transition"
                >
                  +{chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                value={dashboardQuery}
                onChange={(e) => setDashboardQuery(e.target.value)}
                placeholder={lang === 'bn' ? 'যেমন: PL-784, 1042, MUT-2026-DHK-4821, বা মৌজা...' : 'e.g. PL-784, 1042, MUT-2026-DHK-4821, or mouza...'}
                className="gov-input pl-9 py-2.5 text-xs font-medium"
              />
            </div>
            <button
              type="submit"
              className="gov-btn-primary text-xs py-2.5 px-4 font-bold flex-shrink-0"
            >
              <Zap className={`w-3.5 h-3.5 ${dashSearchLoading ? 'animate-spin' : ''}`} />
              <span>{lang === 'bn' ? 'খুঁজুন' : 'Search'}</span>
            </button>
          </div>
        </form>

        {/* Dashboard Search Results Display */}
        {dashSearchResults && (
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {lang === 'bn' ? 'অনুসন্ধানের ফলাফল:' : 'Results:'} ({dashSearchResults.count})
              </span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                ⚡ {dashSearchResults.time_ms}ms ({dashSearchResults.algorithm})
              </span>
            </div>

            {dashSearchResults.results.length === 0 ? (
              <div className="text-xs text-gray-400 py-3 text-center">
                {lang === 'bn' ? 'কোনো ফলাফল পাওয়া যায়নি' : 'No records matched'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {dashSearchResults.results.map((r, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      if (r._match_type === 'property') setActiveTab('properties');
                      else if (r._match_type === 'deed') setActiveTab('deed-verify');
                      else if (r._match_type === 'mutation') {
                        if (setSelectedTracking) setSelectedTracking(r.tracking_no);
                        setActiveTab('mutation-track');
                      }
                    }}
                    className="p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-[#febd69] bg-gray-50 dark:bg-gray-800/50 cursor-pointer transition group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-gray-900 dark:text-white group-hover:text-[#d97706] dark:group-hover:text-[#febd69]">
                        {r._title}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-white dark:bg-gray-900 border text-gray-600 dark:text-gray-400 uppercase font-mono">
                        {r._match_type}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                      {r._subtitle}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Four Modern Metric Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Registered Parcels */}
        <div
          onClick={() => setActiveTab('properties')}
          className="gov-card p-4 sm:p-5 border-l-4 border-l-[#047857] dark:border-l-emerald-500 cursor-pointer transition card-3d-interactive"
        >
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
            <span className="text-xs font-semibold">{lang === 'bn' ? 'মোট প্লট / পার্সেল' : 'Total Parcels'}</span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-[#047857] dark:text-emerald-400 shadow-sm">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white text-3d-white">
            {stats?.total_properties || 0}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              {lang === 'bn' ? 'স্বত্ব রেকর্ডভুক্ত' : 'Registered Records'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>

        {/* Metric 2: Deed Verifications */}
        <div
          onClick={() => setActiveTab('deed-verify')}
          className="gov-card p-4 sm:p-5 border-l-4 border-l-blue-600 dark:border-l-blue-400 cursor-pointer transition card-3d-interactive"
        >
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
            <span className="text-xs font-semibold">{lang === 'bn' ? 'যাচাইকৃত দলিল' : 'Deeds Verified'}</span>
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-sm">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white text-3d-white">
            {stats?.total_verifications || 0}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-blue-600 dark:text-blue-400 font-semibold">
              {lang === 'bn' ? 'বালাম মিল পরীক্ষা' : 'Deed Cross-checks'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>

        {/* Metric 3: Mutations Approved */}
        <div
          onClick={() => setActiveTab('mutation')}
          className="gov-card p-4 sm:p-5 border-l-4 border-l-purple-600 dark:border-l-purple-400 cursor-pointer transition card-3d-interactive"
        >
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
            <span className="text-xs font-semibold">{lang === 'bn' ? 'দাখিলকৃত নামজারি' : 'Mutations Filed'}</span>
            <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 shadow-sm">
              <GitBranchPlus className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white text-3d-white">
            {mStats?.total || 0}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-purple-600 dark:text-purple-400 font-semibold">
              {mStats?.Approved || 0} {lang === 'bn' ? 'মঞ্জুরিকৃত' : 'Approved'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>

        {/* Metric 4: Risk Alerts */}
        <div
          onClick={() => setActiveTab('due-diligence')}
          className="gov-card p-4 sm:p-5 border-l-4 border-l-rose-600 dark:border-l-rose-400 cursor-pointer transition card-3d-interactive"
        >
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
            <span className="text-xs font-semibold">{lang === 'bn' ? 'উচ্চ ঝুঁকি সতর্কতা' : 'High Risk Alerts'}</span>
            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shadow-sm">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">
            {totalRiskAlerts}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-rose-700 dark:text-rose-400 font-semibold">
              {lang === 'bn' ? 'সরেজমিন অনুসন্ধান প্রয়োজন' : 'Ground Check Needed'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Core Land Services Action Cards */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="text-3d-brand">{lang === 'bn' ? 'প্রধান নাগরিক সেবা মডিউলসমূহ' : 'Core Land Service Modules'}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Service: Deed Verification */}
          <div className="gov-card p-5 flex flex-col justify-between hover:border-emerald-600 transition group bg-white dark:bg-[#131c27] card-3d-interactive">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-[#047857] dark:text-emerald-300 flex items-center justify-center shadow-sm">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {lang === 'bn' ? 'দলিল যাচাই' : 'Deed Verify'}
                </span>
              </div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-emerald-600 transition">
                {lang === 'bn' ? 'দলিল ও মালিকানা যাচাই' : 'Deed & Ownership Verification'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {lang === 'bn'
                  ? 'দলিল নম্বর বা স্ক্যান কপি আপলোড করে সরকারি বালাম রেকর্ডের সাথে তাৎক্ষণিক ক্রস-চেক করুন।'
                  : 'Upload scanned deeds or enter deed numbers to verify consistency against registry records.'}
              </p>
            </div>

            <div className="pt-4 mt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setActiveTab('deed-verify')}
                className="w-full gov-btn-primary text-xs justify-center py-2"
              >
                <span>{lang === 'bn' ? 'দলিল যাচাই শুরু করুন' : 'Verify Deed Now'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Service: Smart E-Namjari */}
          <div className="gov-card p-5 flex flex-col justify-between hover:border-blue-600 transition group bg-white dark:bg-[#131c27] card-3d-interactive">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center shadow-sm">
                  <GitBranchPlus className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  {lang === 'bn' ? 'ই-নামজারি' : 'E-Namjari'}
                </span>
              </div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 transition">
                {lang === 'bn' ? 'স্মার্ট ই-নামজারি ওয়ার্কফ্লো' : 'Smart E-Namjari Mutation'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {lang === 'bn'
                  ? 'অনলাইনে নামজারি আবেদন দাখিল করুন, খসড়া সংরক্ষণ করুন এবং ধাপে ধাপে অগ্রগতি ট্র্যাক করুন।'
                  : 'Submit digital land mutations, save drafts, and follow automated multi-stage approvals.'}
              </p>
            </div>

            <div className="pt-4 mt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <button
                onClick={() => setActiveTab('mutation')}
                className="flex-1 gov-btn-primary bg-blue-700 hover:bg-blue-800 border-blue-900 text-xs justify-center py-2"
              >
                <span>{lang === 'bn' ? 'নতুন আবেদন' : 'Apply'}</span>
              </button>
              <button
                onClick={() => setActiveTab('mutation-track')}
                className="flex-1 gov-btn-secondary text-xs justify-center py-2"
              >
                <span>{lang === 'bn' ? 'ট্র্যাকিং' : 'Track'}</span>
              </button>
            </div>
          </div>

          {/* Service: Pre-Purchase Due Diligence */}
          <div className="gov-card p-5 flex flex-col justify-between hover:border-amber-600 transition group bg-white dark:bg-[#131c27] card-3d-interactive">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center shadow-sm">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {lang === 'bn' ? 'স্বত্ব যাচাই' : 'Due Diligence'}
                </span>
              </div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-amber-600 transition">
                {lang === 'bn' ? 'জমি কেনার আগে যাচাই' : 'Pre-Purchase Due Diligence'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {lang === 'bn'
                  ? 'বায়না বা ক্রয়ের আগে বিক্রেতার স্বত্ব, হস্তান্তরের ইতিহাস ও আইনি ঝুঁকি নিরূপণ করুন।'
                  : 'Assess title risk, chain of ownership, rapid flipping, and court disputes prior to purchase.'}
              </p>
            </div>

            <div className="pt-4 mt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setActiveTab('due-diligence')}
                className="w-full gov-btn-primary text-xs justify-center py-2"
              >
                <span>{lang === 'bn' ? 'ঝুঁকি বিশ্লেষণ করুন' : 'Assess Land Risk'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. In-Dashboard Instant Application Tracker Widget */}
      <div className="gov-card p-5 bg-gradient-to-br from-emerald-50/30 to-emerald-50/70 dark:from-[#131d27] dark:to-[#0f241a] border border-[#E2E8F0] dark:border-emerald-900/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-200/60 dark:border-gray-800">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#047857] dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'তাৎক্ষণিক নামজারি আবেদন ট্র্যাকার' : 'Instant E-Namjari Status Checker'}</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {lang === 'bn'
                ? 'আপনার ট্র্যাকিং নম্বর প্রবেশ করিয়ে বর্তমান পর্যায় ও এসিল্যান্ডের সিদ্ধান্ত জানুন।'
                : 'Enter your tracking reference number to inspect real-time application workflow.'}
            </p>
          </div>

          <form onSubmit={handleQuickTrack} className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="text"
              value={trackInput}
              onChange={(e) => setTrackInput(e.target.value)}
              placeholder="e.g. MUT-2026-DHK-4821"
              className="gov-input py-1.5 px-3 text-xs w-full sm:w-64 font-mono uppercase"
            />
            <button
              type="submit"
              className="gov-btn-primary text-xs py-1.5 px-3 flex-shrink-0"
              disabled={trackingLoading}
            >
              <Search className={`w-3.5 h-3.5 ${trackingLoading ? 'animate-spin' : ''}`} />
              <span>{lang === 'bn' ? 'ট্র্যাক' : 'Track'}</span>
            </button>
          </form>
        </div>

        {/* Quick Result Display */}
        {trackError && (
          <div className="mt-3 p-3 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs">
            {trackError}
          </div>
        )}

        {quickTrackResult && (
          <div className="mt-4 p-4 rounded-xl bg-white dark:bg-[#121a16] border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs text-gray-900 dark:text-white">
                  {quickTrackResult.tracking_no}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {quickTrackResult.status_bn || quickTrackResult.status}
                </span>
              </div>

              <button
                onClick={() => {
                  if (setSelectedTracking) setSelectedTracking(quickTrackResult.tracking_no);
                  setActiveTab('mutation-track');
                }}
                className="text-xs text-[#047857] dark:text-emerald-400 hover:underline font-semibold flex items-center gap-1"
              >
                <span>{lang === 'bn' ? 'সম্পূর্ণ ট্র্যাকিং পেজ দেখুন' : 'View Full Details'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
              <div>
                <span className="text-gray-400 block text-[10px]">{lang === 'bn' ? 'আবেদনকারী' : 'Applicant'}</span>
                <span className="font-semibold">{quickTrackResult.applicant_name}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">{lang === 'bn' ? 'দাগ ও খতিয়ান' : 'Plot & Khatian'}</span>
                <span className="font-semibold">{quickTrackResult.plot_no} ({quickTrackResult.khatian_no})</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">{lang === 'bn' ? 'মৌজা ও জেলা' : 'Mouza & Dist'}</span>
                <span className="font-semibold">{quickTrackResult.mouza}, {quickTrackResult.district}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">{lang === 'bn' ? 'জমির পরিমাণ' : 'Area'}</span>
                <span className="font-semibold">{quickTrackResult.land_area} শতক</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6. Visual Breakdown: Workflow Progress & AI Risk Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mutation Workflow Status Distribution */}
        <div className="gov-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'ই-নামজারি ওয়ার্কফ্লো স্ট্যাটাস বণ্টন' : 'Mutation Status Breakdown'}</span>
            </h3>
            <span className="text-[11px] text-gray-500 font-mono">
              {lang === 'bn' ? 'মোট:' : 'Total:'} {mStats?.total || 0}
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {[
              { key: 'Draft', label: lang === 'bn' ? 'খসড়া সংরক্ষণ' : 'Draft', val: mStats?.Draft || 0, color: 'bg-slate-400' },
              { key: 'Submitted', label: lang === 'bn' ? 'দাখিলকৃত (পেন্ডিং)' : 'Submitted', val: mStats?.Submitted || 0, color: 'bg-blue-500' },
              { key: 'DocVerify', label: lang === 'bn' ? 'কাগজপত্র যাচাই' : 'Doc Verification', val: mStats?.['Document Verification'] || 0, color: 'bg-amber-500' },
              { key: 'Approved', label: lang === 'bn' ? 'অনুমোদিত' : 'Approved', val: mStats?.Approved || 0, color: 'bg-emerald-600' },
              { key: 'Rejected', label: lang === 'bn' ? 'খারিজ' : 'Rejected', val: mStats?.Rejected || 0, color: 'bg-rose-500' }
            ].map((item) => {
              const total = Math.max(mStats?.total || 1, 1);
              const pct = Math.round((item.val / total) * 100);
              return (
                <div key={item.key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                    <span className="font-bold text-gray-900 dark:text-white">{item.val} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Land Risk Distribution */}
        <div className="gov-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              <span>{lang === 'bn' ? 'ভূমি লেনদেন ঝুঁকি মাত্রা (এআই স্কোরিং)' : 'Land Transaction Risk Distribution'}</span>
            </h3>
            <span className="text-[11px] text-gray-500 font-mono">
              {lang === 'bn' ? 'মোট রেকর্ড:' : 'Total:'} {rStats?.total || 0}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-center">
              <span className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold block mb-1">
                {lang === 'bn' ? 'নিম্ন ঝুঁকি' : 'Low Risk'}
              </span>
              <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                {rStats?.low || 0}
              </span>
              <span className="text-[10px] text-emerald-600 block mt-1">০–২৯ পয়েন্ট</span>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-center">
              <span className="text-xs text-amber-800 dark:text-amber-300 font-semibold block mb-1">
                {lang === 'bn' ? 'মাঝারি' : 'Medium'}
              </span>
              <span className="text-2xl font-black text-amber-700 dark:text-amber-400">
                {rStats?.medium || 0}
              </span>
              <span className="text-[10px] text-amber-600 block mt-1">৩০–৫৯ পয়েন্ট</span>
            </div>

            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-center">
              <span className="text-xs text-rose-800 dark:text-rose-300 font-semibold block mb-1">
                {lang === 'bn' ? 'উচ্চ ঝুঁকি' : 'High Risk'}
              </span>
              <span className="text-2xl font-black text-rose-700 dark:text-rose-400">
                {rStats?.high || 0}
              </span>
              <span className="text-[10px] text-rose-600 block mt-1">৬০–১০০ পয়েন্ট</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400 text-xs leading-relaxed">
            {lang === 'bn'
              ? 'ঝুঁকি চিহ্নিতকরণ নিয়মাবলী: দ্বৈত দলিল নম্বর (+৫০), একাধিকবার বিক্রি (+৪৫), মালিকানা দ্বন্দ্ব (+৪০), ৩০ দিনের মধ্যে দ্রুত হস্তান্তর (+১৫), মূল্যের অস্বাভাবিকতা (+২০)।'
              : 'Detection rules: Duplicate deed (+50), duplicate sale (+45), ownership conflict (+40), rapid transfer (+15), price anomaly (+20).'}
          </div>
        </div>
      </div>

      {/* 7. Recent Activity Timeline Table */}
      <div className="gov-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{lang === 'bn' ? 'সাম্প্রতিক সিস্টেম ও নাগরিক কার্যক্রম' : 'Recent System Activity'}</span>
          </h3>
          <button
            onClick={() => setActiveTab('audit-logs')}
            className="text-xs text-[#047857] dark:text-emerald-400 hover:underline font-semibold flex items-center gap-1"
          >
            <span>{lang === 'bn' ? 'সম্পূর্ণ লগ দেখুন' : 'View All Logs'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400">
                <th className="py-2.5 px-3">{lang === 'bn' ? 'সময়' : 'Timestamp'}</th>
                <th className="py-2.5 px-3">{lang === 'bn' ? 'ব্যবহারকারী' : 'User'}</th>
                <th className="py-2.5 px-3">{lang === 'bn' ? 'মডিউল' : 'Module'}</th>
                <th className="py-2.5 px-3">{lang === 'bn' ? 'কার্যক্রম' : 'Action'}</th>
                <th className="py-2.5 px-3">{lang === 'bn' ? 'বিবরণ' : 'Details'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {stats?.recent_activity?.length ? (
                stats.recent_activity.map((act) => (
                  <tr key={act.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap font-mono text-[11px]">
                      {new Date(act.created_at).toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-gray-900 dark:text-white">
                      {act.user_name}
                      <span className="text-[10px] text-gray-400 ml-1">({act.user_role})</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono text-[10px]">
                        {act.module}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-emerald-700 dark:text-emerald-400">
                      {act.action}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300 max-w-xs truncate">
                      {act.details}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="py-6 text-center text-gray-400">
                    {lang === 'bn' ? 'কোনো সাম্প্রতিক কার্যক্রম পাওয়া যায়নি' : 'No recent activity records found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
