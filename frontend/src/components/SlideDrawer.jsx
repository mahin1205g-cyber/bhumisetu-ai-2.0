import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import BhumiSathiLogo from './BhumiSathiLogo';
import {
  X, User, ChevronRight, Home, LayoutDashboard, FileCheck2, GitBranchPlus,
  AlertOctagon, Layers, Search, History, Bell, Shield, ShieldAlert,
  ClipboardCheck, HelpCircle, FileText, Globe, Moon, Sun, LogOut, ArrowRight,
  PhoneCall, Zap
} from 'lucide-react';

export default function SlideDrawer({ isOpen, onClose, activeTab, setActiveTab }) {
  const { lang, toggleLang, theme, toggleTheme, user, logoutUser, t, unreadCount } = useApp();

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleNav = (tabId) => {
    setActiveTab(tabId);
    onClose();
  };

  const sections = [
    {
      title: lang === 'bn' ? 'ডিজিটাল ভূমি সেবা' : 'Digital Land Services',
      items: [
        { id: 'home', label: t('navHome'), icon: Home, badge: null },
        { id: 'dashboard', label: t('navDashboard'), icon: LayoutDashboard, badge: null },
        { id: 'deed-verify', label: t('navDeedVerify'), icon: FileCheck2, badge: null },
        { id: 'mutation', label: t('navMutation'), icon: GitBranchPlus, badge: null },
        { id: 'due-diligence', label: t('navDueDiligence'), icon: AlertOctagon, badge: null },
        { id: 'properties', label: t('navProperties'), icon: Layers, badge: 'O(log N)' }
      ]
    },
    {
      title: lang === 'bn' ? 'নাগরিক কর্নার ও ট্র্যাকিং' : 'Citizen Portal & Tracking',
      items: [
        { id: 'mutation-track', label: lang === 'bn' ? 'আবেদন ট্র্যাকিং' : 'Application Tracking', icon: Search, badge: null },
        { id: 'profile', label: t('navProfile'), icon: User, badge: user ? user.role : null },
        { id: 'notifications', label: lang === 'bn' ? 'বিজ্ঞপ্তি ও নোটিফিকেশন' : 'Notifications', icon: Bell, badge: unreadCount > 0 ? `${unreadCount} new` : null, badgeColor: 'bg-rose-600 text-white' },
        { id: 'audit-logs', label: t('navAudit'), icon: History, badge: null }
      ]
    },
    ...(user?.role === 'officer' || user?.role === 'admin' ? [
      {
        title: lang === 'bn' ? 'কর্মকর্তা ও প্রশাসন' : 'Officer & Administration',
        items: [
          { id: 'officer-review', label: t('navOfficerReview'), icon: ClipboardCheck, badge: 'Officer', badgeColor: 'bg-indigo-600 text-white' },
          ...(user?.role === 'admin' ? [
            { id: 'admin', label: t('navAdmin'), icon: ShieldAlert, badge: 'Admin', badgeColor: 'bg-rose-700 text-white' }
          ] : [])
        ]
      }
    ] : []),
    {
      title: lang === 'bn' ? 'সহায়তা ও সেটিংস' : 'Help & Settings',
      items: [
        { id: 'help', label: t('navHelp'), icon: HelpCircle, badge: null },
        { id: 'disclaimer', label: t('navDisclaimer'), icon: FileText, badge: null }
      ]
    }
  ];

  return (
    <>
      {/* Backdrop Dark Overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300 ease-in-out ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* Sliding Window / Drawer from the Left */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[320px] sm:w-[360px] bg-white dark:bg-[#0c1310] shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out border-r border-[#E2E8F0] dark:border-gray-800 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Bhumisetu Brand Header */}
        <div className="bg-[#FFFFFF] dark:bg-[#0c1310] text-[#17212B] dark:text-white px-5 py-3.5 flex items-center justify-between border-b border-[#E2E8F0] dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <BhumiSathiLogo size={28} className="w-7 h-7 flex-shrink-0" />
            <div>
              <div className="text-[#047857] dark:text-emerald-400 text-sm font-black tracking-tight leading-none">
                {lang === 'bn' ? 'ভূমিসেতু' : 'Bhumisetu'}
              </div>
              <div className="text-[10px] text-[#64748B] dark:text-gray-400 leading-tight">
                {lang === 'bn' ? 'নিরাপদ ডিজিটাল ভূমি সঙ্গী' : 'Smart Land Decisions Platform'}
              </div>
            </div>
          </div>
          {/* Close Button [X] */}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-[#F7FAF8] dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-[#64748B] dark:text-gray-300 hover:text-[#17212B] dark:hover:text-white flex items-center justify-center transition border border-[#E2E8F0] dark:border-gray-700"
            title="Close Menu (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Greeting Bar */}
        <div className="bg-[#F7FAF8] dark:bg-[#111915] text-[#17212B] dark:text-white px-5 py-3 flex items-center justify-between border-b border-[#E2E8F0] dark:border-gray-800 select-none">
          <div
            onClick={() => handleNav(user ? 'profile' : 'login')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-[#047857] dark:text-emerald-300 font-bold shadow-xs">
              <User className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-[#64748B] dark:text-gray-400 font-medium leading-none mb-0.5">
                {lang === 'bn' ? 'স্বাগতম' : 'Hello'}
              </div>
              <div className="text-xs font-bold text-[#17212B] dark:text-white group-hover:text-[#047857] dark:group-hover:text-emerald-400 transition flex items-center gap-1.5 truncate max-w-[210px]">
                <span>{user ? user.name : (lang === 'bn' ? 'লগইন করুন' : 'Sign In')}</span>
              </div>
              {user && (
                <div className="text-[10px] text-[#047857] dark:text-emerald-400 font-semibold leading-none mt-1">
                  {user.designation || (user.role === 'admin' ? 'অ্যাডমিন' : user.role === 'officer' ? 'এসি ল্যান্ড' : 'নাগরিক')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scalability & Algorithm Badge */}
        <div className="bg-emerald-50/60 dark:bg-emerald-950/30 px-4 py-2 text-[11px] text-[#065F46] dark:text-emerald-300 flex items-center justify-between border-b border-[#E2E8F0] dark:border-gray-800">
          <div className="flex items-center gap-1.5 font-semibold">
            <Zap className="w-3.5 h-3.5 text-[#047857] dark:text-emerald-400" />
            <span>{lang === 'bn' ? 'বাইনারি সার্চ অ্যালগরিদম সক্রিয়' : 'Binary Search O(log N) Engine'}</span>
          </div>
          <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-[#047857] dark:text-emerald-300 px-1.5 py-0.5 rounded font-mono font-semibold">
            500M Scale
          </span>
        </div>

        {/* Scrollable Categories List */}
        <div className="flex-1 overflow-y-auto drawer-scrollbar divide-y divide-gray-100 dark:divide-gray-800">
          {sections.map((sec, idx) => (
            <div key={idx} className="py-2.5">
              <div className="px-5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {sec.title}
              </div>
              <div className="mt-1 space-y-0.5">
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNav(item.id)}
                      className={`w-full px-5 py-2.5 flex items-center justify-between text-left transition group ${
                        isActive
                          ? 'bg-[#D1FAE5]/60 dark:bg-emerald-950/40 text-[#047857] dark:text-emerald-300 font-bold border-l-4 border-l-[#047857]'
                          : 'text-[#17212B] dark:text-gray-200 hover:bg-[#F7FAF8] dark:hover:bg-gray-800/60 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#047857] dark:text-emerald-400' : 'text-[#64748B] dark:text-gray-400 group-hover:text-[#047857] dark:group-hover:text-emerald-400'}`} />
                        <span className="text-xs truncate">{item.label}</span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        {item.badge && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full leading-none ${item.badgeColor || 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                            {item.badge}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#047857] dark:group-hover:text-emerald-400 group-hover:translate-x-0.5 transition" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quick Controls inside Drawer */}
          <div className="p-4 space-y-2 bg-[#F7FAF8] dark:bg-[#0c1310] border-t border-[#E2E8F0] dark:border-gray-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              {lang === 'bn' ? 'কুইক সেটিংস' : 'Quick Settings'}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={toggleLang}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-[#E2E8F0] dark:border-gray-700 bg-white dark:bg-[#111915] text-xs font-semibold text-[#17212B] dark:text-gray-200 hover:border-[#047857] transition"
              >
                <Globe className="w-3.5 h-3.5 text-[#047857]" />
                <span>{lang === 'bn' ? 'English' : 'বাংলা'}</span>
              </button>

              <button
                onClick={toggleTheme}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-[#E2E8F0] dark:border-gray-700 bg-white dark:bg-[#111915] text-xs font-semibold text-[#17212B] dark:text-gray-200 hover:border-[#047857] transition"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>লাইট মোড</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-[#64748B]" />
                    <span>ডার্ক মোড</span>
                  </>
                )}
              </button>
            </div>

            {/* Gov Hotline 16122 Info Pill */}
            <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-[#047857] dark:text-emerald-400" />
                <span className="text-xs font-bold text-[#065F46] dark:text-emerald-200">
                  {lang === 'bn' ? 'ভূমি সেবা কল করুন' : 'Land Helpline'}: 16122
                </span>
              </div>
              <span className="text-[10px] text-[#047857] dark:text-emerald-400 font-semibold">২৪/৭</span>
            </div>

            {/* Logout / Login button */}
            {user ? (
              <button
                onClick={() => {
                  logoutUser();
                  onClose();
                  setActiveTab('login');
                }}
                className="w-full mt-2 py-2 px-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-rose-100 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t('navLogout')}</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  onClose();
                  setActiveTab('login');
                }}
                className="w-full mt-2 gov-btn-primary text-xs py-2 justify-center"
              >
                <User className="w-3.5 h-3.5" />
                <span>{t('navLogin')}</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
