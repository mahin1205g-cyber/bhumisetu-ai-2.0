import Input from '../components/Input';
import Button from '../components/Button';
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import BhumiSathiLogo from '../components/BhumiSathiLogo';
import { User, Lock, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';

const portals = [
  { role: 'citizen', bn: 'নাগরিক', en: 'Citizen' },
  { role: 'officer', bn: 'কর্মকর্তা / কর্মী', en: 'Officer / Worker' },
  { role: 'admin', bn: 'অ্যাডমিন', en: 'Admin' },
];

export default function Login({ setActiveTab, navigateBack }) {
  const { lang, loginUser } = useApp();
  const [portal, setPortal] = useState('citizen');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginLockSeconds, setLoginLockSeconds] = useState(0);
  const [success, setSuccess] = useState('');
  const [recoveryStep, setRecoveryStep] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [recoveryType, setRecoveryType] = useState('password');
  const [recoveryIdentity, setRecoveryIdentity] = useState({ username: '', full_name: '', phone: '', nid: '' });
  const [recoveredUsername, setRecoveredUsername] = useState('');
  const [recoveryLockSeconds, setRecoveryLockSeconds] = useState(0);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (recoveryLockSeconds <= 0) return undefined;
    const timer = window.setInterval(() => setRecoveryLockSeconds((remaining) => Math.max(0, remaining - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [recoveryLockSeconds > 0]);

  useEffect(() => {
    if (loginLockSeconds <= 0) return undefined;
    const timer = window.setInterval(() => setLoginLockSeconds((remaining) => Math.max(0, remaining - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [loginLockSeconds > 0]);

  const loginLockoutMessage = () => {
    const hours = Math.floor(loginLockSeconds / 3600);
    const minutes = Math.floor((loginLockSeconds % 3600) / 60);
    const seconds = loginLockSeconds % 60;
    return lang === 'bn'
      ? `এই অ্যাকাউন্টে লগইন ${hours} ঘণ্টা ${minutes} মিনিট ${seconds} সেকেন্ডের জন্য বন্ধ।`
      : `Sign in for this account is locked for ${hours}h ${minutes}m ${seconds}s.`;
  };

  const lockoutMessage = () => {
    const hours = Math.floor(recoveryLockSeconds / 3600);
    const minutes = Math.floor((recoveryLockSeconds % 3600) / 60);
    const seconds = recoveryLockSeconds % 60;
    return lang === 'bn'
      ? `এই ${recoveryType === 'password' ? 'পাসওয়ার্ড' : 'ইউজারনেম'} পুনরুদ্ধার ${hours} ঘণ্টা ${minutes} মিনিট ${seconds} সেকেন্ডের জন্য বন্ধ।`
      : `This ${recoveryType === 'password' ? 'password' : 'username'} recovery is locked for ${hours}h ${minutes}m ${seconds}s.`;
  };

  const beginRecovery = (type) => {
    setRecovering(true);
    setRecoveryType(type);
    setRecoveryStep(0);
    setRecoveryIdentity({ username: '', full_name: '', phone: '', nid: '' });
    setRecoveredUsername('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setRecoveryLockSeconds(0);
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoginLockSeconds(0);
    setLoading(true);
    try {
      const result = await api.login(identifier.trim(), password);
      if (result.user?.role !== portal) {
        setError(lang === 'bn'
          ? 'এই অ্যাকাউন্টের ভূমিকা নির্বাচিত লগইন পোর্টালের সঙ্গে মেলে না।'
          : 'This account role does not match the selected login portal.');
        return;
      }
      await loginUser(result.token);
      setActiveTab(portal === 'admin' ? 'admin' : portal === 'officer' ? 'officer-review' : 'dashboard');
    } catch (err) {
      const detail = err.payload?.detail;
      if (detail?.code === 'account_login_locked') {
        setLoginLockSeconds(Number(detail.remaining_seconds) || 0);
      } else if (detail?.code === 'login_rate_limited') {
        const wait = Number(detail.retry_after_seconds) || 0;
        setError(lang === 'bn'
          ? `অনেকবার চেষ্টা হয়েছে। ${wait} সেকেন্ড পর আবার চেষ্টা করুন।`
          : `Too many recent attempts. Try again in ${wait} seconds.`);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryStart = async (event) => {
    event.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    try {
      const result = recoveryType === 'password'
        ? await api.startPasswordRecovery({ username: recoveryIdentity.username, phone: recoveryIdentity.phone, nid: recoveryIdentity.nid })
        : await api.recoverUsername({ full_name: recoveryIdentity.full_name, phone: recoveryIdentity.phone, nid: recoveryIdentity.nid });
      if (recoveryType === 'password') setResetToken(result.reset_token);
      else setRecoveredUsername(result.username);
      setRecoveryStep(1);
      setRecoveryLockSeconds(0);
      setSuccess(recoveryType === 'password'
        ? (lang === 'bn' ? 'ইউজারনেম, মোবাইল ও NID মিলেছে। এখন নতুন পাসওয়ার্ড দিন।' : 'Username, mobile, and NID matched. Set a new password now.')
        : (lang === 'bn' ? 'আপনার ইউজারনেম পাওয়া গেছে।' : 'Your username was found.'));
    } catch (err) {
      const detail = err.payload?.detail;
      if (detail?.code === 'recovery_locked') {
        setRecoveryLockSeconds(Number(detail.remaining_seconds) || 0);
        setError('');
      } else if (detail?.code === 'recovery_rate_limited') {
        setError(lang === 'bn'
          ? 'এই পরিচয় থেকে অল্প সময়ে অনেকবার চেষ্টা হয়েছে। এক মিনিট অপেক্ষা করে আবার চেষ্টা করুন।'
          : 'Too many recent requests for this recovery identity. Wait a minute and try again.');
      } else if (err.status === 400) {
        setError(lang === 'bn'
          ? (recoveryType === 'password' ? 'ইউজারনেম, মোবাইল নম্বর ও NID কোনো অ্যাকাউন্টের সঙ্গে মেলেনি।' : 'পূর্ণ নাম, মোবাইল নম্বর ও NID কোনো অ্যাকাউন্টের সঙ্গে মেলেনি।')
          : err.message);
      } else {
        setError(err.message);
      }
    } finally { setLoading(false); }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    setError(''); setSuccess('');
    if (newPassword.length < 8) {
      setError(lang === 'bn' ? 'পাসওয়ার্ড ন্যূনতম ৮ অক্ষরের হতে হবে।' : 'Password must contain at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(lang === 'bn' ? 'দুটি পাসওয়ার্ড মিলছে না।' : 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword({ reset_token: resetToken, password: newPassword, password_confirmation: confirmPassword });
      setSuccess(lang === 'bn' ? 'পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে। এখন নতুন পাসওয়ার্ড দিয়ে লগইন করুন।' : 'Password reset. Sign in with your new password.');
      setRecoveryStep(0);
      setRecovering(false);
      setResetToken(''); setNewPassword(''); setConfirmPassword('');
      setShowNewPassword(false); setShowConfirmPassword(false);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="gov-container py-10 max-w-md mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button type="button" onClick={() => navigateBack ? navigateBack('home') : setActiveTab('home')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#14201C] border border-[#E2E8F0] dark:border-[#1E2E28] hover:text-[#047857] shadow-xs transition">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{lang === 'bn' ? 'মূল পাতায় ফিরে যান' : 'Back to Home'}</span>
        </Button>
        <span className="text-[11px] text-slate-400 font-medium">Bhumisetu • Auth</span>
      </div>

      <div className="text-center space-y-2">
        <div className="flex justify-center mb-1"><BhumiSathiLogo size={52} className="shadow-xs" /></div>
        <h1 className="text-2xl font-bold text-[#17212B] dark:text-white">
          {lang === 'bn' ? 'ভূমিসেতু পোর্টালে লগইন' : 'Sign in to Bhumisetu'}
        </h1>
        <p className="text-xs text-[#64748B]">
          {lang === 'bn' ? 'আপনার অ্যাকাউন্টের ধরন অনুযায়ী লগইন পোর্টাল নির্বাচন করুন' : 'Choose the portal for your account'}
        </p>
      </div>

      <div className="grid grid-cols-3 rounded-xl bg-[#F7FAF8] dark:bg-[#14201C] p-1 border border-[#E2E8F0] dark:border-[#1E2E28] gap-1">
        {portals.map((item) => (
          <Button key={item.role} type="button" disabled={recovering} onClick={() => { setPortal(item.role); setError(''); }}
            aria-pressed={portal === item.role}
            className={`py-2 px-1 text-xs font-bold rounded-lg transition ${portal === item.role ? 'bg-white dark:bg-[#1E2E28] text-[#047857] dark:text-emerald-400 shadow-xs' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>
            {lang === 'bn' ? item.bn : item.en}
          </Button>
        ))}
      </div>

      {(error || (recovering && recoveryLockSeconds > 0) || (!recovering && loginLockSeconds > 0)) && <div role="alert" className="p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs">{recovering && recoveryLockSeconds > 0 ? lockoutMessage() : !recovering && loginLockSeconds > 0 ? loginLockoutMessage() : error}</div>}
      {success && <div role="status" className="p-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs">{success}</div>}

      <div className="gov-card login-card p-4 sm:p-7">
        {recovering ? (
          <div className="space-y-4">
            <h2 className="font-bold text-sm text-[#17212B] dark:text-white">{recoveryType === 'password' ? (lang === 'bn' ? 'পাসওয়ার্ড পুনরুদ্ধার' : 'Recover password') : (lang === 'bn' ? 'ইউজারনেম খুঁজুন' : 'Find username')}</h2>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F7FAF8] dark:bg-[#14201C] p-1 border border-[#E2E8F0] dark:border-[#1E2E28]">
              <Button type="button" disabled={loading} onClick={() => beginRecovery('password')} className={`py-2 px-2 text-xs font-bold rounded-lg ${recoveryType === 'password' ? 'bg-white dark:bg-[#1E2E28] text-[#047857] shadow-xs' : 'text-gray-500'}`}>{lang === 'bn' ? 'পাসওয়ার্ড' : 'Password'}</Button>
              <Button type="button" disabled={loading} onClick={() => beginRecovery('username')} className={`py-2 px-2 text-xs font-bold rounded-lg ${recoveryType === 'username' ? 'bg-white dark:bg-[#1E2E28] text-[#047857] shadow-xs' : 'text-gray-500'}`}>{lang === 'bn' ? 'ইউজারনেম' : 'Username'}</Button>
            </div>
            {recoveryStep === 0 && <form onSubmit={handleRecoveryStart} className="space-y-3">
              <p className="text-xs text-gray-500">{recoveryType === 'password' ? (lang === 'bn' ? 'অ্যাকাউন্টের ইউজারনেম, নিবন্ধিত মোবাইল ও NID দিন।' : 'Enter the account username, registered mobile number, and NID.') : (lang === 'bn' ? 'অ্যাকাউন্টে দেওয়া পূর্ণ নাম, নিবন্ধিত মোবাইল ও NID দিন।' : 'Enter the account full name, registered mobile number, and NID.')}</p>
              {recoveryType === 'password'
                ? <Input className="gov-input" autoComplete="username" aria-label={lang === 'bn' ? 'ইউজারনেম' : 'Username'} placeholder={lang === 'bn' ? 'ইউজারনেম' : 'Username'} value={recoveryIdentity.username} onChange={(e) => setRecoveryIdentity({ ...recoveryIdentity, username: e.target.value })} required />
                : <Input className="gov-input" autoComplete="name" aria-label={lang === 'bn' ? 'পূর্ণ নাম' : 'Full name'} placeholder={lang === 'bn' ? 'পূর্ণ নাম' : 'Full name'} value={recoveryIdentity.full_name} onChange={(e) => setRecoveryIdentity({ ...recoveryIdentity, full_name: e.target.value })} required />}
              <Input className="gov-input" type="tel" inputMode="tel" autoComplete="tel" aria-label={lang === 'bn' ? 'নিবন্ধিত মোবাইল নম্বর' : 'Registered mobile number'} placeholder={lang === 'bn' ? 'মোবাইল নম্বর' : 'Mobile number'} value={recoveryIdentity.phone} onChange={(e) => setRecoveryIdentity({ ...recoveryIdentity, phone: e.target.value })} required />
              <Input className="gov-input" inputMode="numeric" aria-label="NID number" placeholder="NID (10, 13, or 17 digits)" value={recoveryIdentity.nid} onChange={(e) => setRecoveryIdentity({ ...recoveryIdentity, nid: e.target.value.replace(/[^0-9]/g, '').slice(0, 17) })} pattern="(?:[0-9]{10}|[0-9]{13}|[0-9]{17})" maxLength={17} required />
              <Button className="w-full gov-btn-primary text-xs" disabled={loading || recoveryLockSeconds > 0}>{loading ? (lang === 'bn' ? 'যাচাই হচ্ছে...' : 'Checking...') : recoveryType === 'password' ? (lang === 'bn' ? 'পরিচয় যাচাই করুন' : 'Verify identity') : (lang === 'bn' ? 'ইউজারনেম খুঁজুন' : 'Find username')}</Button>
            </form>}
            {recoveryType === 'username' && recoveryStep === 1 && <div className="space-y-3">
              <p className="text-xs text-gray-500">{lang === 'bn' ? 'আপনার ইউজারনেম:' : 'Your username:'}</p>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 p-3 font-mono font-bold text-emerald-800 dark:text-emerald-300">{recoveredUsername}</div>
            </div>}
            {recoveryType === 'password' && recoveryStep === 1 && <form onSubmit={handlePasswordReset} className="space-y-3">
              <p className="text-xs text-gray-500">{lang === 'bn' ? 'নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের দিন।' : 'Choose a new password with at least 8 characters.'}</p>
              <div className="relative">
                <Input className="gov-input pr-12" type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" aria-label={lang === 'bn' ? 'নতুন পাসওয়ার্ড' : 'New password'} minLength={8} maxLength={256} placeholder={lang === 'bn' ? 'নতুন পাসওয়ার্ড' : 'New password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                <Button type="button" className="password-visibility-toggle absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800 dark:hover:text-white" onClick={() => setShowNewPassword((visible) => !visible)} aria-label={showNewPassword ? (lang === 'bn' ? 'নতুন পাসওয়ার্ড লুকান' : 'Hide new password') : (lang === 'bn' ? 'নতুন পাসওয়ার্ড দেখান' : 'Show new password')} aria-pressed={showNewPassword}>
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <div className="relative">
                <Input className="gov-input pr-12" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" aria-label={lang === 'bn' ? 'নতুন পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm new password'} minLength={8} maxLength={256} placeholder={lang === 'bn' ? 'পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                <Button type="button" className="password-visibility-toggle absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800 dark:hover:text-white" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? (lang === 'bn' ? 'নিশ্চিতকরণ পাসওয়ার্ড লুকান' : 'Hide confirmation password') : (lang === 'bn' ? 'নিশ্চিতকরণ পাসওয়ার্ড দেখান' : 'Show confirmation password')} aria-pressed={showConfirmPassword}>
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <Button className="w-full gov-btn-primary text-xs" disabled={loading}>{loading ? (lang === 'bn' ? 'পরিবর্তন হচ্ছে...' : 'Resetting...') : (lang === 'bn' ? 'নতুন পাসওয়ার্ড সেট করুন' : 'Reset password')}</Button>
            </form>}
            <Button type="button" className="text-xs text-gray-500 underline" onClick={() => { setRecovering(false); setRecoveryStep(0); setRecoveryLockSeconds(0); setError(''); setSuccess(''); }}>{lang === 'bn' ? 'লগইনে ফিরে যান' : 'Back to login'}</Button>
          </div>
        ) : (
          <>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-identifier" className="block text-xs font-semibold text-[#17212B] dark:text-gray-300 mb-1">
              {lang === 'bn' ? 'ইউজারনেম অথবা ইমেইল' : 'Username or Email'}
            </label>
            <div className="relative"><User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input id="login-identifier" type="text" name="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                placeholder={lang === 'bn' ? 'ইউজারনেম অথবা ইমেইল' : 'Username or Email'}
                autoComplete="username" className="gov-input pl-9" required /></div>
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold text-[#17212B] dark:text-gray-300 mb-1">
              {lang === 'bn' ? 'পাসওয়ার্ড' : 'Password'}
            </label>
            <div className="relative"><Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" className="gov-input pl-9 pr-12" required />
              <Button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? (lang === 'bn' ? 'পাসওয়ার্ড লুকান' : 'Hide password') : (lang === 'bn' ? 'পাসওয়ার্ড দেখান' : 'Show password')}
                aria-pressed={showPassword} className="password-visibility-toggle absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full gov-btn-primary justify-center text-xs py-2.5 font-bold shadow-xs">
            {loading ? (lang === 'bn' ? 'যাচাই হচ্ছে...' : 'Signing in...') : (lang === 'bn' ? 'লগইন করুন' : 'Sign In')}
          </Button>
          <p className="text-[11px] text-center text-gray-500 flex justify-center items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />
            {lang === 'bn' ? 'অ্যাকাউন্টের অনুমতি সার্ভার যাচাই করে' : 'Permissions are verified by the server'}
          </p>
        </form>
        {portal === 'citizen' && <div className="mt-4 pt-3 border-t border-[#E2E8F0] dark:border-[#1E2E28] text-center text-xs text-gray-500">
          <span>{lang === 'bn' ? 'নতুন নাগরিক?' : 'New citizen?'} </span>
          <Button onClick={() => setActiveTab('register')} className="text-[#047857] dark:text-emerald-400 font-bold hover:underline">
            {lang === 'bn' ? 'এখানে নিবন্ধন করুন' : 'Register here'}
          </Button>
        </div>}
        <div className="mt-3 flex flex-wrap justify-center gap-4 text-center">
          <Button type="button" onClick={() => beginRecovery('password')} className="text-xs text-[#047857] dark:text-emerald-400 font-semibold hover:underline">{lang === 'bn' ? 'পাসওয়ার্ড ভুলে গেছেন?' : 'Forgot password?'}</Button>
          <Button type="button" onClick={() => beginRecovery('username')} className="text-xs text-[#047857] dark:text-emerald-400 font-semibold hover:underline">{lang === 'bn' ? 'ইউজারনেম ভুলে গেছেন?' : 'Forgot username?'}</Button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
