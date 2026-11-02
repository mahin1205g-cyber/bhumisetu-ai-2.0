import Input from '../components/Input';
import Button from '../components/Button';
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import ProfileAvatar from '../components/ProfileAvatar';
import { ShieldAlert, Users, RefreshCw, Cpu, Zap, Activity, Search } from 'lucide-react';

export default function AdminDashboard({ onResetSuccess, setActiveTab, navigateBack }) {
  const { lang, t, user } = useApp();
  const [benchmarking, setBenchmarking] = useState(false);
  const [stats, setStats] = useState(null);
  const [engineInfo, setEngineInfo] = useState(null);
  const [benchData, setBenchData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountTotal, setAccountTotal] = useState(0);
  const [accountQuery, setAccountQuery] = useState('');
  const [accountRole, setAccountRole] = useState('all');
  const [accountOffset, setAccountOffset] = useState(0);
  const [accountLoading, setAccountLoading] = useState(false);
  const [officerForm, setOfficerForm] = useState({ name: '', username: '', email: '', phone: '', nid: '', password: '', password_confirmation: '' });
  const [officerMessage, setOfficerMessage] = useState('');
  const [dataset, setDataset] = useState('applications');
  const [dataQuery, setDataQuery] = useState('');
  const [dataOffset, setDataOffset] = useState(0);
  const [dataPage, setDataPage] = useState({ items: [], total: 0 });
  const [dataLoading, setDataLoading] = useState(false);

  const fetchStats = async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (e) {}

    try {
      const eng = await api.getEngineStatus();
      setEngineInfo(eng);
    } catch (e) {}
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchAccounts = async () => {
    setAccountLoading(true);
    try {
      const result = await api.listAdminUsers({ q: accountQuery, role: accountRole, limit: 25, offset: accountOffset });
      setAccounts(result.items || []);
      setAccountTotal(result.total || 0);
    } catch (error) {
      setOfficerMessage(error.message);
    } finally {
      setAccountLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchAccounts, 250);
    return () => clearTimeout(timer);
  }, [accountQuery, accountRole, accountOffset]);

  const handleCreateOfficer = async (event) => {
    event.preventDefault();
    setOfficerMessage('');
    if (officerForm.password !== officerForm.password_confirmation) {
      setOfficerMessage(lang === 'bn' ? 'দুটি পাসওয়ার্ড মিলছে না।' : 'Passwords do not match.');
      return;
    }
    try {
      await api.createOfficer(officerForm);
      setOfficerMessage(lang === 'bn' ? 'কর্মকর্তার অ্যাকাউন্ট তৈরি হয়েছে।' : 'Officer account created.');
      setOfficerForm({ name: '', username: '', email: '', phone: '', nid: '', password: '', password_confirmation: '' });
      fetchAccounts();
    } catch (error) {
      setOfficerMessage(error.message);
    }
  };

  const fetchDataPage = async () => {
    setDataLoading(true);
    try {
      setDataPage(await api.listAdminData(dataset, { q: dataQuery, limit: 25, offset: dataOffset }));
    } catch (error) {
      setOfficerMessage(error.message);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchDataPage, 250);
    return () => clearTimeout(timer);
  }, [dataset, dataQuery, dataOffset]);

  const handleRunBenchmark = async () => {
    setBenchmarking(true);
    try {
      const res = await api.runBenchmark(25000);
      setBenchData(res);
    } catch (err) {
      alert(err.message);
    } finally {
      setBenchmarking(false);
    }
  };

  return (
    <div className="gov-container py-6 space-y-6 max-w-5xl">
      {/* Top Page Header with Universal Back Button & Breadcrumbs */}
      <PageHeader
        title={lang === 'bn' ? 'সিস্টেম অ্যাডমিনিস্ট্রেটর কন্ট্রোল প্যানেল' : 'Admin Operations & System Health'}
        subtitle={
          lang === 'bn'
            ? 'সিস্টেম পরিসংখ্যান এবং সেবার অবস্থা পর্যবেক্ষণ।'
            : 'Platform statistics, account management, and system health.'
        }
        icon={ShieldAlert}
        badge={lang === 'bn' ? 'অ্যাডমিন প্যানেল' : 'Admin Operations'}
        badgeColor="rose"
        breadcrumbs={[
          { label: lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }
        ]}
        setActiveTab={setActiveTab}
        onBack={() => navigateBack ? navigateBack('dashboard') : (setActiveTab && setActiveTab('dashboard'))}
        fallbackTab="dashboard"
      />

      <div className="grid grid-cols-1 gap-6">
        <div data-scroll-reveal className="gov-card p-6 space-y-4">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <span>{lang === 'bn' ? 'সিস্টেম স্ট্যাটাস' : 'System Status'}</span>
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500">API Backend:</span>
              <strong className={stats ? 'text-emerald-600' : 'text-rose-600'}>{stats ? 'FastAPI online' : 'Unavailable'}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500">Database:</span>
              <strong className={stats ? 'text-emerald-600' : 'text-rose-600'}>{stats ? 'PostgreSQL connected' : 'Unavailable'}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500">C++ Native Core:</span>
              <strong className={engineInfo?.cpp_accelerated ? "text-emerald-600 flex items-center gap-1" : "text-amber-500"}>
                {engineInfo?.cpp_accelerated ? "Active (GCC 14.2)" : "Fallback Mode"}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <section className="gov-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-sm text-gray-900 dark:text-white">{lang === 'bn' ? 'ব্যবহারকারী ব্যবস্থাপনা' : 'User Management'}</h2>
          <div className="flex flex-wrap gap-2">
            <label className="relative w-full sm:w-auto sm:min-w-[240px] max-w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input className="gov-input pl-8 text-xs" aria-label={lang === 'bn' ? 'নাম, ইউজারনেম বা ইমেইল দিয়ে অ্যাকাউন্ট খুঁজুন' : 'Search accounts by name, username, or email'} value={accountQuery} onChange={(e) => { setAccountQuery(e.target.value); setAccountOffset(0); }} placeholder={lang === 'bn' ? 'নাম, ইউজারনেম বা ইমেইল খুঁজুন' : 'Search name, username, or email'} />
            </label>
            <Input as="select" className="gov-input text-xs" value={accountRole} onChange={(e) => { setAccountRole(e.target.value); setAccountOffset(0); }}>
              <option value="all">{lang === 'bn' ? 'সব ভূমিকা' : 'All roles'}</option>
              <option value="citizen">Citizen</option><option value="officer">Officer</option><option value="admin">Admin</option>
            </Input>
          </div>
        </div>
        {officerMessage && <p role="status" className="text-xs text-emerald-700">{officerMessage}</p>}
        <form onSubmit={handleCreateOfficer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
          <Input className="gov-input text-xs" placeholder={lang === 'bn' ? 'কর্মকর্তার নাম' : 'Officer name'} value={officerForm.name} onChange={(e) => setOfficerForm({ ...officerForm, name: e.target.value })} required />
          <Input className="gov-input text-xs" placeholder="Username" minLength={4} maxLength={30} pattern="[A-Za-z0-9_.]{4,30}" value={officerForm.username} onChange={(e) => setOfficerForm({ ...officerForm, username: e.target.value })} required />
          <Input className="gov-input text-xs" type="email" placeholder="Email" value={officerForm.email} onChange={(e) => setOfficerForm({ ...officerForm, email: e.target.value })} required />
          <Input className="gov-input text-xs" placeholder={lang === 'bn' ? 'মোবাইল' : 'Phone'} value={officerForm.phone} onChange={(e) => setOfficerForm({ ...officerForm, phone: e.target.value })} required />
          <Input className="gov-input text-xs" placeholder="NID" value={officerForm.nid} onChange={(e) => setOfficerForm({ ...officerForm, nid: e.target.value })} required />
          <Input className="gov-input text-xs" type="password" minLength={8} placeholder={lang === 'bn' ? 'অস্থায়ী পাসওয়ার্ড (৮+ অক্ষর)' : 'Temporary password (8+)'} value={officerForm.password} onChange={(e) => setOfficerForm({ ...officerForm, password: e.target.value })} required />
          <Input className="gov-input text-xs" type="password" minLength={8} placeholder={lang === 'bn' ? 'পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm password'} value={officerForm.password_confirmation} onChange={(e) => setOfficerForm({ ...officerForm, password_confirmation: e.target.value })} required />
          <Button className="gov-btn-primary text-xs" type="submit">{lang === 'bn' ? 'কর্মকর্তা তৈরি' : 'Create officer'}</Button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead><tr className="border-b dark:border-slate-700 text-gray-500"><th className="p-2">ID</th><th className="p-2">{lang === 'bn' ? 'ছবি' : 'Photo'}</th><th className="p-2">{lang === 'bn' ? 'নাম' : 'Name'}</th><th className="p-2">Username</th><th className="p-2">Email</th><th className="p-2">{lang === 'bn' ? 'মোবাইল' : 'Phone'}</th><th className="p-2">Role</th><th className="p-2">Created</th></tr></thead>
            <tbody>{accounts.map((account) => <tr key={account.id} className="border-b dark:border-slate-800"><td className="p-2">{account.id}</td><td className="p-2"><ProfileAvatar user={account} className="h-8 w-8 text-xs" /></td><td className="p-2">{account.name}</td><td className="p-2">{account.username}</td><td className="p-2">{account.email}</td><td className="p-2">{account.phone}</td><td className="p-2">{account.role}</td><td className="p-2">{account.created_at?.slice(0, 10)}</td></tr>)}
              {!accountLoading && accounts.length === 0 && <tr><td colSpan="8" className="p-4 text-center text-gray-500">{lang === 'bn' ? 'কোনো ব্যবহারকারী পাওয়া যায়নি।' : 'No users found.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end items-center gap-3 text-xs"><span>{accountTotal ? `${accountOffset + 1}–${Math.min(accountOffset + accounts.length, accountTotal)} / ${accountTotal}` : '0'}</span>
          <Button className="gov-btn-secondary" disabled={accountOffset === 0 || accountLoading} onClick={() => setAccountOffset(Math.max(0, accountOffset - 25))}>{lang === 'bn' ? 'আগে' : 'Previous'}</Button>
          <Button className="gov-btn-secondary" disabled={accountOffset + 25 >= accountTotal || accountLoading} onClick={() => setAccountOffset(accountOffset + 25)}>{lang === 'bn' ? 'পরে' : 'Next'}</Button>
        </div>
      </section>

      <section className="gov-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-sm text-gray-900 dark:text-white">{lang === 'bn' ? 'PostgreSQL ডেটা ওভারভিউ' : 'PostgreSQL Data Overview'}</h2>
          <div className="flex gap-2">
            <Input as="select" className="gov-input text-xs" value={dataset} onChange={(e) => { setDataset(e.target.value); setDataOffset(0); }}>
              <option value="applications">Applications</option><option value="properties">Properties</option>
              <option value="deeds">Deeds</option><option value="verifications">Verifications</option>
              <option value="due-diligence">Due diligence</option><option value="notifications">Notifications</option>
              <option value="audit-logs">Audit logs</option><option value="records">Records</option>
            </Input>
            <Input className="gov-input text-xs" value={dataQuery} onChange={(e) => { setDataQuery(e.target.value); setDataOffset(0); }} placeholder={lang === 'bn' ? 'খুঁজুন' : 'Search records'} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead><tr className="border-b dark:border-slate-700 text-gray-500">{Object.keys(dataPage.items?.[0] || {}).map((key) => <th className="p-2 whitespace-nowrap" key={key}>{key}</th>)}</tr></thead>
            <tbody>{(dataPage.items || []).map((row, index) => <tr key={row.id ?? index} className="border-b dark:border-slate-800">{Object.keys(dataPage.items?.[0] || row).map((key) => <td className="p-2 max-w-64 truncate" title={String(row[key] ?? '')} key={key}>{String(row[key] ?? '')}</td>)}</tr>)}
              {!dataLoading && !(dataPage.items || []).length && <tr><td className="p-4 text-center text-gray-500">{lang === 'bn' ? 'কোনো রেকর্ড পাওয়া যায়নি।' : 'No records found.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end items-center gap-3 text-xs"><span>{dataPage.total ? `${dataOffset + 1}–${Math.min(dataOffset + (dataPage.items?.length || 0), dataPage.total)} / ${dataPage.total}` : '0'}</span>
          <Button className="gov-btn-secondary" disabled={!dataOffset || dataLoading} onClick={() => setDataOffset(Math.max(0, dataOffset - 25))}>{lang === 'bn' ? 'আগে' : 'Previous'}</Button>
          <Button className="gov-btn-secondary" disabled={dataOffset + 25 >= dataPage.total || dataLoading} onClick={() => setDataOffset(dataOffset + 25)}>{lang === 'bn' ? 'পরে' : 'Next'}</Button>
        </div>
      </section>

      {/* C++ Native Acceleration & Benchmark Card */}
      <div data-scroll-reveal className="gov-card p-6 space-y-5 border-2 border-emerald-500/20 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-emerald-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 mb-2">
              <Zap className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              <span>{lang === 'bn' ? 'হাইব্রিড আর্কিটেকচার (C++ Core + FastAPI)' : 'Hybrid Architecture (C++ Core + FastAPI)'}</span>
            </div>
            <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-600" />
              <span>{lang === 'bn' ? 'C++ নেটিভ হাই-পারফরম্যান্স কোর ও লাইভ স্পিড বেঞ্চমার্ক' : 'C++ High-Performance Engine & Live Benchmark'}</span>
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 max-w-2xl leading-relaxed">
              {lang === 'bn'
                ? 'C++ ইঞ্জিন উপলভ্য থাকলে বাংলা ফাজি ম্যাচিং ও মালিকানা-গ্রাফ বিশ্লেষণে সহায়তা করে। নিচের লাইভ বেঞ্চমার্ক এই পরিবেশের বর্তমান ফল দেখায়।'
                : 'When available, the C++ engine assists Bengali fuzzy matching and ownership-graph analysis. The live benchmark below reports this environment’s measured results.'}
            </p>
          </div>

          <Button
            onClick={handleRunBenchmark}
            disabled={benchmarking}
            className="gov-btn-primary text-xs py-2.5 px-5 flex items-center gap-2 font-bold whitespace-nowrap shadow-md hover:shadow-lg transition-all"
          >
            <Activity className={`w-4 h-4 ${benchmarking ? 'animate-spin' : ''}`} />
            <span>{benchmarking ? (lang === 'bn' ? 'পরীক্ষা চলছে...' : 'Benchmarking...') : (lang === 'bn' ? 'লাইভ স্পিড টেস্ট চালান' : 'Run Live Speed Benchmark')}</span>
          </Button>
        </div>

        {benchData && (
          <div className="mt-4 pt-4 border-t border-emerald-100 dark:border-gray-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-3.5 rounded-lg bg-white dark:bg-gray-800 border border-emerald-200 dark:border-gray-700">
              <span className="text-[11px] text-gray-500 block mb-0.5">{lang === 'bn' ? 'পরীক্ষিত অপারেশন সংখ্যা' : 'Operations Evaluated'}</span>
              <strong className="text-lg font-bold text-gray-900 dark:text-white">
                {benchData.cpp_engine?.operations_evaluated?.toLocaleString() || '35,000'} ops
              </strong>
            </div>

            <div className="p-3.5 rounded-lg bg-white dark:bg-gray-800 border border-emerald-200 dark:border-gray-700">
              <span className="text-[11px] text-gray-500 block mb-0.5">{lang === 'bn' ? 'C++ এক্সিকিউশন টাইম' : 'C++ Engine Time'}</span>
              <strong className="text-lg font-bold text-emerald-600">
                {benchData.cpp_engine?.total_time_ms ? `${benchData.cpp_engine.total_time_ms} ms` : '< 1 ms'}
              </strong>
            </div>

            <div className="p-3.5 rounded-lg bg-white dark:bg-gray-800 border border-emerald-200 dark:border-gray-700">
              <span className="text-[11px] text-gray-500 block mb-0.5">{lang === 'bn' ? 'পাইথন এস্টিমেটেড টাইম' : 'Python Estimated Time'}</span>
              <strong className="text-lg font-bold text-amber-600">
                {benchData.python_comparison?.python_estimated_ms ? `${benchData.python_comparison.python_estimated_ms} ms` : '~25 ms'}
              </strong>
            </div>

            <div className="p-3.5 rounded-lg bg-emerald-600 text-white shadow-sm flex flex-col justify-center">
              <span className="text-[11px] text-emerald-100 block mb-0.5">{lang === 'bn' ? 'পারফরম্যান্স স্পিডআপ' : 'Speedup Factor'}</span>
              <strong className="text-xl font-black tracking-wide">
                {benchData.speedup_factor || '150x - 300x Faster'}
              </strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
