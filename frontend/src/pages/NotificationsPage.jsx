import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import { Bell, CheckCircle2, Clock, RefreshCw, AlertTriangle, Info } from 'lucide-react';

export default function NotificationsPage({ setActiveTab, navigateBack }) {
  const { lang, t, user, notifications, refreshNotifications } = useApp();

  const handleMarkRead = async (nid) => {
    try {
      await api.markNotificationRead(nid);
      refreshNotifications();
    } catch (e) {}
  };

  return (
    <div className="gov-container py-6 space-y-6 max-w-4xl">
      {/* Top Page Header with Universal Back Button & Breadcrumbs */}
      <PageHeader
        title={lang === 'bn' ? 'বিজ্ঞপ্তি ও নোটিফিকেশন কেন্দ্র' : 'Notification Center'}
        subtitle={
          lang === 'bn'
            ? 'আপনার আবেদন, যাচাই রিপোর্ট ও সিস্টেম সতর্কবার্তার হালনাগাদ নোটিফিকেশন।'
            : 'Real-time updates regarding your land deeds, mutation status, and officer remarks.'
        }
        icon={Bell}
        badge={notifications.filter(n => !n.is_read).length > 0 ? `${notifications.filter(n => !n.is_read).length} Unread` : 'All Caught Up'}
        badgeColor={notifications.filter(n => !n.is_read).length > 0 ? 'rose' : 'emerald'}
        breadcrumbs={[
          { label: lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }
        ]}
        setActiveTab={setActiveTab}
        onBack={() => navigateBack ? navigateBack('dashboard') : (setActiveTab && setActiveTab('dashboard'))}
        fallbackTab="dashboard"
        actions={
          <button onClick={refreshNotifications} className="gov-btn-secondary text-xs py-1.5 px-3">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'হালনাগাদ' : 'Refresh'}</span>
          </button>
        }
      />

      <div className="gov-card p-4 space-y-3">
        {notifications.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-xs">
            {lang === 'bn' ? 'কোনো নতুন বিজ্ঞপ্তি নেই' : 'No notifications found.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {notifications.map(n => (
              <div
                key={n.id}
                onClick={() => handleMarkRead(n.id)}
                className={`p-4 rounded-lg transition cursor-pointer flex items-start justify-between gap-4 ${
                  !n.is_read ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-gray-900 dark:text-white">
                      {lang === 'bn' ? n.title_bn : n.title_en}
                    </span>
                    {!n.is_read && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-600 text-white">
                        {lang === 'bn' ? 'নতুন' : 'NEW'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    {lang === 'bn' ? n.message_bn : n.message_en}
                  </p>
                  <span className="text-[10px] text-gray-400 block pt-1">
                    {new Date(n.created_at).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}
                  </span>
                </div>

                <div className="text-right">
                  {n.is_read ? (
                    <span className="text-[11px] text-gray-400">✓ {lang === 'bn' ? 'পঠিত' : 'Read'}</span>
                  ) : (
                    <button className="text-[11px] text-emerald-600 font-semibold hover:underline">
                      {lang === 'bn' ? 'পঠিত চিহ্নিত করুন' : 'Mark as read'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
