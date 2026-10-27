import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import { History, Search, RefreshCw, Shield, User, Clock } from 'lucide-react';

export default function AuditHistory({ setActiveTab, navigateBack }) {
  const { lang, t } = useApp();
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs(60);
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = logs.filter(l => {
    const q = search.toLowerCase();
    return (
      l.user_name?.toLowerCase().includes(q) ||
      l.action?.toLowerCase().includes(q) ||
      l.module?.toLowerCase().includes(q) ||
      l.details?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="gov-container py-6 space-y-6 max-w-6xl">
      {/* Top Page Header with Universal Back Button & Breadcrumbs */}
      <PageHeader
        title={lang === 'bn' ? 'কার্যক্রম ও অডিট লগ ইতিহাস' : 'Activity & Audit Log History'}
        subtitle={
          lang === 'bn'
            ? 'প্ল্যাটফর্মে সম্পাদিত প্রতিটি যাচাইকরণ, নামজারি আবেদন ও কর্মকর্তার সিদ্ধান্তের অপরিবর্তনীয় অডিট ট্রেইল।'
            : 'Immutable timestamped audit logs for all verifications, applications, and administrative actions.'
        }
        icon={History}
        badge={lang === 'bn' ? 'নিরাপত্তা অডিট' : 'Audit Trail'}
        badgeColor="indigo"
        breadcrumbs={[
          { label: lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }
        ]}
        setActiveTab={setActiveTab}
        onBack={() => navigateBack ? navigateBack('dashboard') : (setActiveTab && setActiveTab('dashboard'))}
        fallbackTab="dashboard"
      />

      {/* Filter & Refresh */}
      <div className="gov-card p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'bn' ? 'ব্যবহারকারী, কার্যক্রম বা বিবরণ দিয়ে খুঁজুন...' : 'Search logs by user, action or details...'}
            className="gov-input pl-9 py-2 text-xs"
          />
        </div>

        <button
          onClick={fetchLogs}
          className="gov-btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{lang === 'bn' ? 'রিফ্রেশ' : 'Refresh'}</span>
        </button>
      </div>

      {/* Logs Table */}
      <div className="gov-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="py-3 px-4">{lang === 'bn' ? 'সময় ও তারিখ' : 'Timestamp'}</th>
                <th className="py-3 px-4">{lang === 'bn' ? 'ব্যবহারকারী' : 'User'}</th>
                <th className="py-3 px-4">{lang === 'bn' ? 'রোল' : 'Role'}</th>
                <th className="py-3 px-4">{lang === 'bn' ? 'মডিউল' : 'Module'}</th>
                <th className="py-3 px-4">{lang === 'bn' ? 'কার্যক্রম' : 'Action'}</th>
                <th className="py-3 px-4">{lang === 'bn' ? 'বিবরণ' : 'Details'}</th>
                <th className="py-3 px-4 text-right">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-gray-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-[#0b462d]" />
                    {lang === 'bn' ? 'লগ লোড হচ্ছে...' : 'Loading audit logs...'}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-gray-400">
                    {lang === 'bn' ? 'কোনো লগ রেকর্ড পাওয়া যায়নি' : 'No audit records found'}
                  </td>
                </tr>
              ) : (
                filtered.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap font-mono text-[11px]">
                      {new Date(l.created_at).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
                      {l.user_name}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {l.user_role}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] text-gray-500">
                      {l.module}
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-700 dark:text-emerald-400">
                      {l.action}
                    </td>
                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300 max-w-sm truncate">
                      {l.details}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-400 text-[10px]">
                      {l.ip_address}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
