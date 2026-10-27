import React from 'react';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import { User, Shield, Mail, Phone, CreditCard, Award, Moon, Sun, Globe } from 'lucide-react';

export default function UserProfile({ setActiveTab, navigateBack }) {
  const { user, lang, toggleLang, theme, toggleTheme, switchDemoRole, t } = useApp();

  return (
    <div className="gov-container py-6 space-y-6 max-w-3xl">
      {/* Top Page Header with Universal Back Button & Breadcrumbs */}
      <PageHeader
        title={lang === 'bn' ? 'ব্যবহারকারী প্রোফাইল ও সেটিংস' : 'User Profile & Preferences'}
        subtitle={
          lang === 'bn'
            ? 'আপনার ডিজিটাল নাগরিক পরিচয়, পদবি ও ইন্টারফেস পছন্দসমূহ।'
            : 'Manage your citizen profile, credentials, and UI preferences.'
        }
        icon={User}
        badge={user?.role === 'admin' ? 'System Administrator' : user?.role === 'officer' ? 'AC Land Officer' : 'Citizen'}
        badgeColor={user?.role === 'admin' ? 'rose' : user?.role === 'officer' ? 'indigo' : 'emerald'}
        breadcrumbs={[
          { label: lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }
        ]}
        setActiveTab={setActiveTab}
        onBack={() => navigateBack ? navigateBack('dashboard') : (setActiveTab && setActiveTab('dashboard'))}
        fallbackTab="dashboard"
      />

      <div className="gov-card p-6 space-y-6">
        {/* Profile Card Header */}
        <div className="flex flex-wrap items-center gap-4 border-b border-gray-100 dark:border-gray-800 pb-5">
          <div className="w-16 h-16 rounded-full bg-[#0b462d] border-2 border-[#c59b27] text-[#ffd700] text-2xl font-black flex items-center justify-center shadow">
            {user?.role === 'admin' ? 'M' : (user?.name ? user.name[0] : 'U')}
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {user?.role === 'admin' ? 'Md Bayazid Hossain' : (user?.name || 'ব্যবহারকারী')}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#fef9e7] text-[#c59b27] border border-[#c59b27]/30 dark:bg-amber-950/40 dark:text-amber-300">
                {user?.role === 'officer' ? (lang === 'bn' ? 'সহকারী কমিশনার (ভূমি) / AC Land' : 'AC Land Officer') : user?.role === 'admin' ? (lang === 'bn' ? 'প্রধান সিস্টেম অ্যাডমিনিস্ট্রেটর' : 'System Admin') : (lang === 'bn' ? 'সাধারণ নাগরিক' : 'Citizen')}
              </span>
              <span className="text-[11px] text-gray-400">ID: #{user?.id || 1}</span>
            </div>
          </div>
        </div>

        {/* Credentials Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 space-y-1">
            <span className="text-gray-500 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-emerald-600" />
              {lang === 'bn' ? 'ইমেইল ঠিকানা' : 'Email Address'}
            </span>
            <strong className="text-gray-900 dark:text-white block font-mono">
              {user?.role === 'admin' 
                ? (user?.email && user.email !== 'admin@bhumisetu.gov.bd' && user.email !== 'admin@bhumisathi.gov.bd' && user.email !== 'admin@landguard.gov.bd' ? user.email : 'dbscbayazid111@gmail.com') 
                : (user?.email || 'citizen@bhumisetu.gov.bd')}
            </strong>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 space-y-1">
            <span className="text-gray-500 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-blue-600" />
              {lang === 'bn' ? 'মোবাইল নম্বর' : 'Phone Number'}
            </span>
            <strong className="text-gray-900 dark:text-white block font-mono">
              {user?.role === 'admin' 
                ? (user?.phone && user.phone !== '০১৭১১০০২২৩৩' && user.phone !== '01711002233' ? user.phone : '01645241040') 
                : (user?.phone || '01711002233')}
            </strong>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 space-y-1">
            <span className="text-gray-500 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-purple-600" />
              {t('nid')}
            </span>
            <strong className="text-gray-900 dark:text-white block font-mono">{user?.nid || '19902692518000123'}</strong>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 space-y-1">
            <span className="text-gray-500 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-600" />
              {lang === 'bn' ? 'দাপ্তরিক পদবি' : 'Designation'}
            </span>
            <strong className="text-gray-900 dark:text-white block">{user?.designation || user?.role || 'নাগরিক'}</strong>
          </div>
        </div>

        {/* Preferences */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
          <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500">
            {lang === 'bn' ? 'সিস্টেম ও ইন্টারফেস পছন্দসমূহ' : 'Interface Preferences'}
          </h3>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={toggleLang}
              className="gov-btn-secondary text-xs py-2 px-4 flex items-center gap-2"
            >
              <Globe className="w-4 h-4 text-[#c59b27]" />
              <span>{lang === 'bn' ? 'ভাষা: বাংলা (English-এ পরিবর্তন করুন)' : 'Language: English (Switch to বাংলা)'}</span>
            </button>

            <button
              onClick={toggleTheme}
              className="gov-btn-secondary text-xs py-2 px-4 flex items-center gap-2"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-emerald-600" />}
              <span>{theme === 'dark' ? (lang === 'bn' ? 'লাইট মোড অন করুন' : 'Switch to Light Mode') : (lang === 'bn' ? 'ডার্ক মোড অন করুন' : 'Switch to Dark Mode')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
