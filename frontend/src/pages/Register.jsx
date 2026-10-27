import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import {
  User, Lock, Mail, Phone, CreditCard, Eye, EyeOff, CheckCircle2,
  KeyRound, ShieldCheck, ArrowRight, RefreshCw, Sparkles
} from 'lucide-react';

export default function Register({ setActiveTab }) {
  const { lang, t, loginUser } = useApp();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    nid: ''
  });

  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpPreview, setOtpPreview] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Countdown timer
  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSendOTP = async () => {
    const target = form.phone.trim() || form.email.trim();
    if (!target) {
      setError(lang === 'bn' ? 'ওটিপি পাঠাতে মোবাইল নম্বর বা ইমেইল পূরণ করুন।' : 'Please enter your phone number or email for OTP verification.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await api.sendOTP(target, 'register');
      setOtpSent(true);
      setOtpPreview(res.otp_preview || '682491');
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

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      setError(lang === 'bn' ? 'অনুগ্রহ করে আবশ্যকীয় তথ্যগুলো পূরণ করুন।' : 'Please fill all required fields.');
      return;
    }

    if (form.password.length < 5) {
      setError(lang === 'bn' ? 'পাসওয়ার্ড ন্যূনতম ৫ অক্ষরের হতে হবে।' : 'Password must be at least 5 characters.');
      return;
    }

    if (!otpSent) {
      setError(lang === 'bn' ? 'নিবন্ধনের পূর্বে মোবাইল বা ইমেইলে ওটিপি কোড পাঠান।' : 'Please request an OTP verification code before registration.');
      return;
    }

    if (!otpCode || otpCode.trim().length < 4) {
      setError(lang === 'bn' ? 'অনুগ্রহ করে প্রাপ্ত ৬-সংখ্যার ওটিপি কোড দিন।' : 'Please enter the 6-digit OTP verification code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Verify OTP first
      const target = form.phone.trim() || form.email.trim();
      const vRes = await api.verifyOTP(target, otpCode);
      if (!vRes.verified) {
        throw new Error(vRes.message || 'ভুল ওটিপি কোড');
      }

      // 2. Complete registration
      const res = await api.register({
        ...form,
        role: 'citizen',
        designation: 'নাগরিক',
        otp_code: otpCode
      });
      loginUser(res.user, res.token);
      setActiveTab('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gov-container py-12 max-w-md mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {lang === 'bn' ? 'নাগরিক ডিজিটাল প্রোফাইল নিবন্ধন' : 'Citizen Registration'}
        </h1>
        <p className="text-xs text-gray-500">
          {lang === 'bn' ? 'ভূমি সংক্রান্ত সেবা ও দলিল যাচাইয়ে অংশগ্রহণ করতে নিবন্ধন করুন' : 'Register to verify deeds and file mutation applications'}
        </p>
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

      <div className="gov-card p-6 space-y-4">
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              {lang === 'bn' ? 'পূর্ণ নাম' : 'Full Name'} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="মোঃ রফিকুল ইসলাম"
                className="gov-input pl-9"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              {lang === 'bn' ? 'ইমেইল ঠিকানা' : 'Email Address'} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="citizen@example.com"
                className="gov-input pl-9"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {lang === 'bn' ? 'মোবাইল' : 'Mobile'}
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="01711002233"
                  className="gov-input pl-9 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {lang === 'bn' ? 'জাতীয় পরিচয়পত্র (NID)' : 'NID (Optional)'}
              </label>
              <div className="relative">
                <CreditCard className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  name="nid"
                  value={form.nid}
                  onChange={handleChange}
                  placeholder="1990269..."
                  className="gov-input pl-9 text-xs"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              {lang === 'bn' ? 'পাসওয়ার্ড' : 'Password'} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
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

          {/* OTP Send Trigger & Verification Section */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                <span>{lang === 'bn' ? 'নিরাপত্তা ভেরিফিকেশন (OTP)' : 'Security OTP Verification'}</span>
              </span>

              <button
                type="button"
                onClick={handleSendOTP}
                disabled={loading || countdown > 0 || (!form.phone && !form.email)}
                className="gov-btn-secondary text-[11px] py-1 px-3 font-bold"
              >
                {countdown > 0 ? (
                  <span>{countdown}s</span>
                ) : (
                  <span>{otpSent ? (lang === 'bn' ? 'পুনরায় কোড পাঠান' : 'Resend Code') : (lang === 'bn' ? 'ওটিপি কোড পাঠান' : 'Send OTP Code')}</span>
                )}
              </button>
            </div>

            {/* Simulated Live Gateway Notification */}
            {otpPreview && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs space-y-1">
                <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center justify-between">
                  <span>📩 {lang === 'bn' ? 'মোবাইল / ইমেইল ওটিপি বার্তা:' : 'Incoming OTP Message:'}</span>
                  <button
                    type="button"
                    onClick={() => setOtpCode(otpPreview)}
                    className="text-[11px] text-[#0b462d] dark:text-emerald-400 underline font-bold"
                  >
                    {lang === 'bn' ? 'কোডটি বসান (Auto-Fill)' : 'Auto-Fill'}
                  </button>
                </div>
                <div className="font-mono text-sm tracking-widest text-[#0b462d] dark:text-emerald-400 font-black">
                  {otpPreview}
                </div>
                <p className="text-[10px] text-gray-500">
                  {lang === 'bn' ? 'এই কোডটি প্রদান করে অ্যাকাউন্ট নিবন্ধন নিশ্চিত করুন।' : 'Enter this 6-digit code to complete registration.'}
                </p>
              </div>
            )}

            {otpSent && (
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  {lang === 'bn' ? 'প্রাপ্ত ৬-সংখ্যার ওটিপি কোড প্রদান করুন' : 'Enter 6-Digit OTP Code'}
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
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !otpSent || !otpCode}
            className="w-full gov-btn-primary justify-center text-xs py-2.5 font-bold shadow"
          >
            {loading ? (lang === 'bn' ? 'যাচাই ও নিবন্ধন হচ্ছে...' : 'Registering...') : (lang === 'bn' ? 'কোড যাচাই ও অ্যাকাউন্ট তৈরি করুন' : 'Verify & Complete Registration')}
          </button>
        </form>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 text-center text-xs text-gray-500">
          <span>{lang === 'bn' ? 'ইতিপূর্বে অ্যাকাউন্ট আছে?' : 'Already have an account?'} </span>
          <button
            onClick={() => setActiveTab('login')}
            className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline"
          >
            {lang === 'bn' ? 'লগইন করুন' : 'Sign in here'}
          </button>
        </div>
      </div>
    </div>
  );
}
