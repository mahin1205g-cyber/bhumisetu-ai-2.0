import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import BhumiSathiLogo from './BhumiSathiLogo';
import {
  Menu, Search, Shield, Moon, Sun, Globe, Bell, User, LogOut, CheckCircle,
  AlertTriangle, Info, Check, ChevronDown, PhoneCall, Zap, X, ArrowRight
} from 'lucide-react';

export default function Header({ activeTab, setActiveTab, onOpenDrawer, setSelectedTracking }) {
  const {
    lang, toggleLang, theme, toggleTheme, user, logoutUser, t,
    notifications, unreadCount, refreshNotifications
  } = useApp();

  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Fast Binary Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState('all');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchMetrics, setSearchMetrics] = useState(null);
  const searchRef = useRef(null);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setShowSearchResults(true);
    try {
      const data = await api.searchBinary(searchQuery.trim(), searchCategory, 10);
      setSearchResults(data.results || []);
      setSearchMetrics({
        timeMs: data.time_ms || 0.1,
        algorithm: data.algorithm || 'Binary Search B-Tree O(log N)',
        count: data.count || 0
      });
    } catch (err) {
      console.error('Binary search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = (item) => {
    setShowSearchResults(false);
    setSearchQuery('');

    if (item._match_type === 'property') {
      setActiveTab('properties');
    } else if (item._match_type === 'deed') {
      setActiveTab('deed-verify');
    } else if (item._match_type === 'mutation') {
      if (setSelectedTracking) {
        setSelectedTracking(item.tracking_no);
      }
      setActiveTab('mutation-track');
    }
  };

  const handleMarkRead = async (nid) => {
    try {
      await api.markNotificationRead(nid);
      refreshNotifications();
    } catch (e) {
      // ignore
    }
  };

  return (
    <header className="sticky top-0 z-40 select-none bg-white dark:bg-[#0C1210] border-b border-[#E2E8F0] dark:border-[#1E2E28] shadow-xs transition-colors duration-200">
      {/* 1. Top Government Helper Bar (Clean Off-White #F7FAF8, Crisp Contrast) */}
      <div className="bg-[#F7FAF8] dark:bg-[#111A16] text-[#64748B] dark:text-[#94A3B8] text-[11px] py-1 border-b border-[#E2E8F0] dark:border-[#1E2E28]">
        <div className="gov-container flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#17212B] dark:text-[#F8FAF9]">
              {lang === 'bn' ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার' : "Government of the People's Republic of Bangladesh"}
            </span>
            <span className="hidden md:inline text-slate-300 dark:text-slate-700">•</span>
            <span className="hidden md:inline text-slate-500 dark:text-slate-400">
              {lang === 'bn' ? 'ডিজিটাল ভূমি প্রযুক্তি ও নাগরিক সেবা প্ল্যাটফর্ম' : 'Digital Land Technology Platform'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="tel:16122"
              className="flex items-center gap-1.5 font-bold text-[#047857] dark:text-emerald-400 hover:text-[#065F46] transition"
            >
              <PhoneCall className="w-3 h-3 text-[#047857] dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'ভূমি সেবা কল সেন্টার:' : 'Helpline:'} 16122</span>
            </a>
            <span className="hidden sm:inline bg-[#D1FAE5] dark:bg-[#064E3B] text-[#047857] dark:text-emerald-300 text-[10px] px-1.5 py-0.2 rounded font-semibold border border-[#A7F3D0] dark:border-emerald-800">
              ২৪/৭
            </span>
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Bar (Clean White Surface, Crisp Typography) */}
      <div className="bg-white dark:bg-[#0C1210] text-[#17212B] dark:text-[#F8FAF9] py-2.5">
        <div className="gov-container flex items-center justify-between gap-3 sm:gap-4">
          {/* Left: Hamburger Slide-Window Button + Bhumisetu Brand Logo */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Hamburger Button */}
            <button
              onClick={onOpenDrawer}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F7FAF8] dark:bg-[#14201C] border border-[#E2E8F0] dark:border-[#1E2E28] hover:bg-slate-100 dark:hover:bg-[#1A2823] text-[#17212B] dark:text-[#F8FAF9] transition focus:outline-none"
              title="Open Navigation Menu"
            >
              <Menu className="w-4 h-4 text-[#047857] dark:text-emerald-400" />
              <span className="text-xs font-semibold hidden sm:inline">
                {lang === 'bn' ? 'সকল সেবা' : 'All Services'}
              </span>
            </button>

            {/* Brand Logo & Bhumisetu Identity */}
            <div
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <BhumiSathiLogo className="w-9 h-9 sm:w-10 sm:h-10" size={40} />

              <div className="leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-lg sm:text-xl tracking-tight text-[#17212B] dark:text-white group-hover:text-[#047857] dark:group-hover:text-emerald-400 transition duration-200">
                    {lang === 'bn' ? 'ভূমিসেতু' : 'Bhumisetu'}
                  </span>
                  <span className="text-xs font-semibold text-[#047857] dark:text-emerald-400 hidden sm:inline">
                    — Bhumisetu
                  </span>
                </div>
                <div className="text-[10px] text-[#64748B] dark:text-slate-400 hidden lg:block font-medium tracking-tight">
                  {lang === 'bn' ? 'নিরাপদ ভূমি সিদ্ধান্তের নির্ভরযোগ্য ডিজিটাল সেতু' : 'Your Trusted Bridge for Safer Land Decisions'}
                </div>
              </div>
            </div>
          </div>

          {/* Center: Clean Instant Search Bar */}
          {activeTab !== 'login' && activeTab !== 'register' ? (
            <div ref={searchRef} className="flex-1 max-w-xl relative mx-1">
              <form onSubmit={handleSearch} className="flex items-center rounded-lg border border-[#E2E8F0] dark:border-[#1E2E28] overflow-hidden focus-within:ring-2 focus-within:ring-[#047857]/20 focus-within:border-[#047857] bg-white dark:bg-[#14201C] transition">
                {/* Category Dropdown */}
                <select
                  value={searchCategory}
                  onChange={(e) => setSearchCategory(e.target.value)}
                  className="bg-[#F7FAF8] dark:bg-[#192722] hover:bg-slate-100 text-gray-700 dark:text-gray-300 text-xs font-medium px-2.5 py-2 border-r border-[#E2E8F0] dark:border-[#1E2E28] outline-none cursor-pointer hidden md:block"
                >
                  <option value="all">{lang === 'bn' ? 'সব রেকর্ড' : 'All'}</option>
                  <option value="deed">{lang === 'bn' ? 'দলিল (Deed)' : 'Deeds'}</option>
                  <option value="plot">{lang === 'bn' ? 'দাগ / প্লট' : 'Plots'}</option>
                  <option value="khatian">{lang === 'bn' ? 'খতিয়ান' : 'Khatian'}</option>
                  <option value="tracking">{lang === 'bn' ? 'নামজারি' : 'Tracking'}</option>
                </select>

                {/* Instant Search Input */}
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (e.target.value.length >= 2) {
                        handleSearch();
                      } else {
                        setShowSearchResults(false);
                      }
                    }}
                    onFocus={() => {
                      if (searchQuery.length >= 2) setShowSearchResults(true);
                    }}
                    placeholder={
                      lang === 'bn'
                        ? 'দলিল নং, দাগ নং, খতিয়ান বা নামজারি ট্র্যাকিং দিয়ে খুঁজুন... (O(log N))'
                        : 'Search Deeds, Plots, Khatians, or Mutation Tracking (O(log N))...'
                    }
                    className="w-full py-2 px-3 bg-transparent text-[#17212B] dark:text-[#F8FAF9] text-xs outline-none placeholder:text-gray-400 font-medium"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setShowSearchResults(false);
                      }}
                      className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Search Button */}
                <button
                  type="submit"
                  className="bg-[#047857] hover:bg-[#065F46] text-white px-3 sm:px-4 py-2 transition flex items-center justify-center font-bold"
                  title="Search using O(log N) Binary Search Algorithm"
                >
                  <Search className={`w-4 h-4 ${isSearching ? 'animate-spin' : ''}`} />
                </button>
              </form>

              {/* Live Binary Search Dropdown Results */}
              {showSearchResults && searchQuery.trim().length >= 2 && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white dark:bg-[#14201C] rounded-lg shadow-xl border border-[#E2E8F0] dark:border-[#1E2E28] overflow-hidden z-50 text-xs">
                  {/* Benchmark Performance Header */}
                  <div className="bg-[#F7FAF8] dark:bg-[#192722] px-3 py-1.5 border-b border-[#E2E8F0] dark:border-[#1E2E28] flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-[#047857] dark:text-emerald-400 font-semibold font-mono">
                      <Zap className="w-3.5 h-3.5 text-[#F5B544] fill-[#F5B544]" />
                      <span>{searchMetrics?.algorithm || 'Binary Search B-Tree O(log N)'}</span>
                    </div>
                    <span className="text-gray-500 font-mono text-[10px]">
                      ⏱ {searchMetrics?.timeMs || 0.12}ms
                    </span>
                  </div>

                  <div className="max-h-64 overflow-y-auto divide-y divide-[#E2E8F0] dark:divide-[#1E2E28]">
                    {searchResults.length === 0 ? (
                      <div className="py-6 text-center text-gray-500 dark:text-gray-400">
                        {lang === 'bn' ? 'কোনো ফলাফল পাওয়া যায়নি' : 'No matching records found'}
                      </div>
                    ) : (
                      searchResults.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSelectResult(item)}
                          className="p-2.5 hover:bg-[#F0FDF4] dark:hover:bg-[#192722] cursor-pointer flex items-center justify-between transition group"
                        >
                          <div>
                            <div className="font-bold text-[#17212B] dark:text-white group-hover:text-[#047857] dark:group-hover:text-emerald-400">
                              {item._title}
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                              {item._subtitle}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-mono uppercase">
                              {item._match_type}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:translate-x-1 transition" />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {/* Right Controls: Language, Theme, Notifications, Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Language Switcher */}
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F7FAF8] dark:bg-[#14201C] border border-[#E2E8F0] dark:border-[#1E2E28] hover:bg-slate-100 dark:hover:bg-[#1A2823] text-xs font-semibold text-[#17212B] dark:text-[#F8FAF9] transition"
              title="Toggle Language"
            >
              <Globe className="w-3.5 h-3.5 text-[#047857] dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'English' : 'বাংলা'}</span>
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg bg-[#F7FAF8] dark:bg-[#14201C] border border-[#E2E8F0] dark:border-[#1E2E28] hover:bg-slate-100 dark:hover:bg-[#1A2823] text-gray-700 dark:text-gray-300 transition"
              title="Toggle Dark / Light Mode"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-gray-600" />
              )}
            </button>

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowNotifs(!showNotifs)}
                className="p-1.5 rounded-lg bg-[#F7FAF8] dark:bg-[#14201C] border border-[#E2E8F0] dark:border-[#1E2E28] hover:bg-slate-100 dark:hover:bg-[#1A2823] text-gray-700 dark:text-gray-300 relative transition"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white rounded-full text-[10px] font-black flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-[#14201C] text-gray-900 dark:text-gray-100 rounded-xl shadow-xl border border-[#E2E8F0] dark:border-[#1E2E28] p-3 z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0] dark:border-[#1E2E28]">
                    <span className="font-bold text-sm">
                      {lang === 'bn' ? 'বিজ্ঞপ্তি ও নোটিফিকেশন' : 'Notifications'} ({notifications.length})
                    </span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      {unreadCount} {lang === 'bn' ? 'অপঠিত' : 'unread'}
                    </span>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-[#E2E8F0] dark:divide-[#1E2E28] mt-1">
                    {notifications.length === 0 ? (
                      <div className="py-6 text-center text-xs text-gray-500">
                        {lang === 'bn' ? 'কোনো নতুন বিজ্ঞপ্তি নেই' : 'No notifications'}
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleMarkRead(n.id)}
                          className={`p-2.5 text-xs transition cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded ${
                            !n.is_read ? 'bg-emerald-50/60 dark:bg-emerald-950/30' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              {lang === 'bn' ? n.title_bn : n.title_en}
                            </span>
                            {!n.is_read && (
                              <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-gray-600 dark:text-gray-300 mt-0.5 leading-snug">
                            {lang === 'bn' ? n.message_bn : n.message_en}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Account Dropdown */}
            {activeTab !== 'login' && activeTab !== 'register' && (
              <div className="relative">
                {user ? (
                  <div
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-lg bg-[#F7FAF8] dark:bg-[#14201C] border border-[#E2E8F0] dark:border-[#1E2E28] hover:bg-slate-100 cursor-pointer select-none transition"
                  >
                    <div className="w-6 h-6 rounded-full bg-[#047857] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                      {user.role === 'admin' ? 'M' : (user.name ? user.name[0] : 'U')}
                    </div>
                    <div className="text-left hidden lg:block leading-tight">
                      <div className="text-[10px] text-gray-500 dark:text-gray-400">
                        {lang === 'bn' ? 'ব্যবহারকারী' : 'User'}
                      </div>
                      <div className="text-xs font-bold text-[#17212B] dark:text-white max-w-[110px] truncate">
                        {user.role === 'admin' ? 'অ্যাডমিন' : user.role === 'officer' ? 'এসি ল্যান্ড' : 'নাগরিক'}
                      </div>
                    </div>
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  </div>
                ) : (
                  <button
                    onClick={() => setActiveTab('login')}
                    className="gov-btn-primary text-xs py-1.5 px-3.5 shadow-xs"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>{t('navLogin')}</span>
                  </button>
                )}

                {showUserMenu && user && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#14201C] text-gray-900 dark:text-gray-100 rounded-xl shadow-xl border border-[#E2E8F0] dark:border-[#1E2E28] p-2 z-50">
                    <div className="p-2 border-b border-[#E2E8F0] dark:border-[#1E2E28]">
                      <div className="font-bold text-xs truncate">{user.role === 'admin' ? 'Md Bayazid Hossain' : user.name}</div>
                      <div className="text-[11px] text-gray-500 truncate">{user.email}</div>
                      <div className="text-[10px] text-[#047857] dark:text-emerald-400 font-semibold mt-0.5">
                        {user.designation || user.role}
                      </div>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={() => { setActiveTab('profile'); setShowUserMenu(false); }}
                        className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-[#F7FAF8] dark:hover:bg-[#192722] rounded flex items-center gap-2"
                      >
                        <User className="w-3.5 h-3.5 text-gray-500" />
                        <span>{t('navProfile')}</span>
                      </button>
                      <button
                        onClick={() => { setActiveTab('dashboard'); setShowUserMenu(false); }}
                        className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-[#F7FAF8] dark:hover:bg-[#192722] rounded flex items-center gap-2"
                      >
                        <Shield className="w-3.5 h-3.5 text-gray-500" />
                        <span>{t('navDashboard')}</span>
                      </button>
                    </div>

                    <div className="pt-1 border-t border-[#E2E8F0] dark:border-[#1E2E28]">
                      <button
                        onClick={() => { logoutUser(); setShowUserMenu(false); setActiveTab('login'); }}
                        className="w-full text-left px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded flex items-center gap-2 font-medium"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{t('navLogout')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </header>
  );
}
