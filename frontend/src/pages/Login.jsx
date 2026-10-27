import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import BhumiSathiLogo from '../components/BhumiSathiLogo';
import {
  User, Lock, Eye, EyeOff, Shield, ArrowRight, Sparkles, CheckCircle2,
  Phone, Mail, KeyRound, RefreshCw, Send, ArrowLeft, Home
} from 'lucide-react';

export default function Login({ setActiveTab, navigateBack }) {
  const { lang, t, loginUser, switchDemoRole } = useApp();

  const [loginMode, setLoginMode] = useState('password'); // 'password' | 'otp'

  // Password mode state
  const [identifier, setIdentifier] = useState('citizen@bhumisetu.gov.bd');
  const [password, setPassword] = useState('demo123');
  const [showPassword, setShowPassword] = useState(false);

  // OTP mode state
  const [otpDestination, setOtpDestination] = useState('01711002233');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpPreview, setOtpPreview] = useState('');
  const [countdown, setCountdown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Countdown timer effect
  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError(lang === 'bn' ? 'ব্যবহারকারী নাম/ইমেইল ও পাসওয়ার্ড পূরণ করুন।' : 'Please enter your username/email and password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.login(identifier, password);
      loginUser(res.user, res.token);
      setActiveTab('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (!otpDestination || otpDestination.trim().length < 3) {
      setError(lang === 'bn' ? 'অনুগ্রহ করে সঠিক মোবাইল নম্বর বা ইমেইল ঠিকানা দিন।' : 'Please enter a valid phone number or email.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await api.sendOTP(otpDestination, 'login');
      setOtpSent(true);
      setOtpPreview(res.otp_preview || '849201');
      setCountdown(60);
      setSuccessMsg(
        lang === 'bn'
          ? `আপনার ${res.channel_bn || 'মোবাইলে'} ৬-সংখ্যার ওটিপি কোড পাঠানো হয়েছে।`
          : `Verification code sent to your ${res.channel || 'phone'}.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOTPLogin = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length < 4) {
      setError(lang === 'bn' ? 'অনুগ্রহ করে ৬-সংখ্যার ওটিপি কোড দিন।' : 'Please enter the 6-digit OTP code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.loginWithOTP(otpDestination, otpCode);
      loginUser(res.user, res.token);
      setActiveTab('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (role) => {
    switchDemoRole(role);
    setActiveTab(role === 'officer' ? 'officer-review' : role === 'admin' ? 'admin' : 'dashboard');
  };

  return (
    <div className="gov-container py-10 max-w-md mx-auto space-y-6">
      {/* Top Back Navigation with Clean Apple/Linear Styling */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigateBack ? navigateBack('home') : setActiveTab('home')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#14201C] border border-[#E2E8F0] dark:border-[#1E2E28] hover:border-[#047857]/40 hover:bg-[#F7FAF8] dark:hover:bg-[#1A2823] hover:text-[#047857] shadow-xs transition"
          title={lang === 'bn' ? 'মূল পাতায় ফিরে যান' : 'Back to Home'}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{lang === 'bn' ? 'মূল পাতায় ফিরে যান' : 'Back to Home'}</span>
        </button>

        <span className="text-[11px] text-slate-400 font-medium">
          Bhumisetu • Auth
        </span>
      </div>

      {/* Brand Header with Static Vector Logo (No Distracting Animation) */}
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-1">
          <BhumiSathiLogo size={52} className="shadow-xs" />
        </div>
        <h1 className="text-2xl font-bold text-[#17212B] dark:text-white">
          {lang === 'bn' ? 'ভূমিসেতু পোর্টালে লগইন' : 'Sign in to Bhumisetu'}
        </h1>
        <p className="text-xs text-[#64748B]">
          {lang === 'bn' ? 'নাগরিক ও কর্মকর্তা ড্যাশবোর্ডে প্রবেশ করতে লগইন করুন' : 'Access your citizen or officer verification workspace'}
        </p>
      </div>

      {/* 1-Click Demo Logins */}
      <div className="p-3.5 rounded-xl bg-[#F0FDF4] dark:bg-[#0B241A] border border-[#D1FAE5] dark:border-[#1E2E28] space-y-2 text-xs">
        <span className="font-bold text-[#047857] dark:text-emerald-300 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#F5B544]" />
          {lang === 'bn' ? '১-ক্লিকে ডেমো অ্যাকাউন্টে প্রবেশ:' : '1-Click Quick Demo Login:'}
        </span>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleDemoLogin('citizen')}
            className="p-2 rounded-lg bg-white dark:bg-[#14201C] border border-[#A7F3D0] dark:border-[#1E2E28] text-[11px] font-bold text-[#047857] dark:text-emerald-300 hover:bg-[#D1FAE5]/40 transition shadow-xs text-center"
          >
            {lang === 'bn' ? '👤 নাগরিক' : '👤 Citizen'}
          </button>
          <button
            type="button"
            onClick={() => handleDemoLogin('officer')}
            className="p-2 rounded-lg bg-white dark:bg-[#14201C] border border-blue-200 dark:border-blue-900 text-[11px] font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-50 transition shadow-xs text-center"
          >
            {lang === 'bn' ? '🏛️ কর্মকর্তা' : '🏛️ Officer'}
          </button>
          <button
            type="button"
            onClick={() => handleDemoLogin('admin')}
            className="p-2 rounded-lg bg-white dark:bg-[#14201C] border border-amber-200 dark:border-amber-900 text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-50 transition shadow-xs text-center"
          >
            {lang === 'bn' ? '⚙️ অ্যাডমিন' : '⚙️ Admin'}
          </button>
        </div>
      </div>

      {/* Login Mode Switcher Tabs */}
      <div className="flex rounded-xl bg-[#F7FAF8] dark:bg-[#14201C] p-1 border border-[#E2E8F0] dark:border-[#1E2E28]">
        <button
          type="button"
          onClick={() => { setLoginMode('password'); setError(''); setSuccessMsg(''); }}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            loginMode === 'password'
              ? 'bg-white dark:bg-[#1E2E28] text-[#047857] dark:text-emerald-400 shadow-xs'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>{lang === 'bn' ? 'পাসওয়ার্ড দিয়ে লগইন' : 'Password Login'}</span>
        </button>

        <button
          type="button"
          onClick={() => { setLoginMode('otp'); setError(''); setSuccessMsg(''); }}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            loginMode === 'otp'
              ? 'bg-white dark:bg-[#1E2E28] text-[#047857] dark:text-emerald-400 shadow-xs'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5 text-amber-500" />
          <span>{lang === 'bn' ? 'ওটিপি / কোড দিয়ে লগইন' : 'OTP Code Login'}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Login Card */}
      <div className="gov-card p-6 sm:p-7 space-y-4">
        {loginMode === 'password' ? (
          /* Password Login Form */
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#17212B] dark:text-gray-300 mb-1">
                {lang === 'bn' ? 'ইমেইল বা ব্যবহারকারী নাম' : 'Email or Username'}
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="citizen@bhumisetu.gov.bd"
                  className="gov-input pl-9"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#17212B] dark:text-gray-300 mb-1">
                {lang === 'bn' ? 'পাসওয়ার্ড' : 'Password'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="gov-input pl-9 pr-9"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full gov-btn-primary justify-center text-xs py-2.5 font-bold shadow-xs"
            >
              {loading ? (lang === 'bn' ? 'যাচাই হচ্ছে...' : 'Signing in...') : (lang === 'bn' ? 'লগইন করুন' : 'Sign In')}
            </button>
          </form>
        ) : (
          /* OTP / Verification Code Login Form */
          <form onSubmit={handleOTPLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#17212B] dark:text-gray-300 mb-1">
                {lang === 'bn' ? 'মোবাইল নম্বর বা ইমেইল ঠিকানা' : 'Mobile Number or Email'}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  {otpDestination.includes('@') ? (
                    <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  ) : (
                    <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  )}
                  <input
                    type="text"
                    value={otpDestination}
                    onChange={(e) => setOtpDestination(e.target.value)}
                    placeholder="01711002233 বা user@email.com"
                    className="gov-input pl-9"
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendOTP}
                  disabled={loading || countdown > 0}
                  className="gov-btn-secondary text-xs px-3.5 py-2 font-bold whitespace-nowrap"
                >
                  {countdown > 0 ? (
                    <span>{countdown}s</span>
                  ) : (
                    <span>{otpSent ? (lang === 'bn' ? 'পুনরায় পাঠান' : 'Resend') : (lang === 'bn' ? 'ওটিপি পাঠান' : 'Send OTP')}</span>
                  )}
                </button>
              </div>
            </div>

            {/* Simulated Live Gateway Notification */}
            {otpPreview && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs space-y-1">
                <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center justify-between">
                  <span>📩 {lang === 'bn' ? 'মোবাইল / ইমেইল ওটিপি সিমুলেশন:' : 'Incoming OTP Message:'}</span>
                  <button
                    type="button"
                    onClick={() => setOtpCode(otpPreview)}
                    className="text-[11px] text-[#047857] dark:text-emerald-400 underline font-bold"
                  >
                    {lang === 'bn' ? 'কোডটি বসান (Auto-Fill)' : 'Auto-Fill'}
                  </button>
                </div>
                <div className="font-mono text-sm tracking-widest text-[#047857] dark:text-emerald-400 font-black">
                  {otpPreview}
                </div>
                <p className="text-[10px] text-gray-500">
                  {lang === 'bn' ? 'এই কোডটি ইনপুট ফিল্ডে প্রদান করে ভেরিফাই করুন (মেয়াদ ৫ মিনিট)।' : 'Use this 6-digit code to complete login.'}
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#17212B] dark:text-gray-300 mb-1">
                {lang === 'bn' ? '৬-সংখ্যার ওটিপি কোড (OTP Verification Code)' : '6-Digit OTP Code'}
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="849201"
                  className="gov-input pl-9 tracking-widest font-mono text-sm"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !otpCode}
              className="w-full gov-btn-primary justify-center text-xs py-2.5 font-bold shadow-xs"
            >
              {loading ? (lang === 'bn' ? 'যাচাই হচ্ছে...' : 'Verifying...') : (lang === 'bn' ? 'কোড যাচাই করে লগইন করুন' : 'Verify & Sign In')}
            </button>
          </form>
        )}

        <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#1E2E28] text-center text-xs text-gray-500">
          <span>{lang === 'bn' ? 'নতুন নাগরিক?' : 'New citizen?'} </span>
          <button
            onClick={() => setActiveTab('register')}
            className="text-[#047857] dark:text-emerald-400 font-bold hover:underline"
          >
            {lang === 'bn' ? 'এখানে নিবন্ধন করুন' : 'Register here'}
          </button>
        </div>
      </div>
    </div>
  );
}
