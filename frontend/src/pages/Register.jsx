import Input from '../components/Input';
import Button from '../components/Button';
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import BhumiSathiLogo from '../components/BhumiSathiLogo';
import {
  User, Lock, Mail, Phone, CreditCard, Eye, EyeOff, CheckCircle2, ArrowLeft
} from 'lucide-react';

export default function Register({ setActiveTab, navigateBack }) {
  const { lang, loginUser } = useApp();

  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    password_confirmation: '',
    phone: '',
    nid: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [usernameStatus, setUsernameStatus] = useState({ state: 'idle', value: '' });

  useEffect(() => {
    const username = form.username.trim();
    if (!username) {
      setUsernameStatus({ state: 'idle', value: '' });
      return undefined;
    }
    if (!/^[A-Za-z0-9_.]{4,30}$/.test(username)) {
      setUsernameStatus({ state: 'invalid', value: username });
      return undefined;
    }
    setUsernameStatus({ state: 'checking', value: username });
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.checkUsernameAvailability(username);
        if (active) setUsernameStatus({ state: result.available ? 'available' : result.valid ? 'taken' : 'invalid', value: username });
      } catch {
        if (active) setUsernameStatus({ state: 'error', value: username });
      }
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [form.username]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setFieldErrors(prev => ({ ...prev, [name]: '' }));
    setError('');
    setSuccessMsg('');
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.name || !form.username || !form.email || !form.password) {
      setError(lang === 'bn' ? 'অনুগ্রহ করে আবশ্যকীয় তথ্যগুলো পূরণ করুন।' : 'Please fill all required fields.');
      return;
    }

    if (!/^[A-Za-z0-9_.]{4,30}$/.test(form.username.trim())) {
      setFieldErrors(prev => ({ ...prev, username: lang === 'bn' ? 'ইউজারনেম ৪–৩০ অক্ষরের হতে হবে; শুধু ইংরেজি অক্ষর, সংখ্যা, _ ও . ব্যবহার করুন।' : 'Use 4–30 letters, numbers, underscores, or periods.' }));
      return;
    }
    if (!/^(?:[0-9]{10}|[0-9]{13}|[0-9]{17})$/.test(form.nid)) {
      setFieldErrors(prev => ({ ...prev, nid: lang === 'bn' ? 'NID-তে শুধু ইংরেজি সংখ্যা দিন; দৈর্ঘ্য ১০, ১৩ অথবা ১৭ অঙ্ক হতে হবে।' : 'Use ASCII digits only; NID must contain exactly 10, 13, or 17 digits.' }));
      return;
    }
    if (usernameStatus.value !== form.username.trim() || usernameStatus.state !== 'available') {
      setError(lang === 'bn' ? 'ইউজারনেমের availability যাচাই শেষ হওয়া পর্যন্ত অপেক্ষা করুন।' : 'Wait for the username availability check to finish.');
      return;
    }

    if (form.password.length < 8) {
      setFieldErrors(prev => ({ ...prev, password: lang === 'bn' ? 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।' : 'Password must be at least 8 characters.' }));
      return;
    }

    if (form.password !== form.password_confirmation) {
      setFieldErrors(prev => ({ ...prev, password_confirmation: lang === 'bn' ? 'দুটি পাসওয়ার্ড মিলছে না।' : 'Passwords do not match.' }));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.register({
        ...form,
        username: form.username.trim(),
        email: form.email.trim().toLowerCase(),
        role: 'citizen',
        designation: 'নাগরিক',
      });
      await loginUser(res.token);
      setSuccessMsg(lang === 'bn' ? 'নিবন্ধন সফল হয়েছে। ড্যাশবোর্ডে নেওয়া হচ্ছে…' : 'Registration successful. Opening your dashboard…');
      window.setTimeout(() => setActiveTab('dashboard'), 700);
    } catch (err) {
      setError(err.message);
      const message = err.message.toLowerCase();
      if (message.includes('username')) setFieldErrors(prev => ({ ...prev, username: err.message }));
      else if (message.includes('nid')) setFieldErrors(prev => ({ ...prev, nid: err.message }));
      else if (message.includes('email')) setFieldErrors(prev => ({ ...prev, email: err.message }));
      else if (message.includes('phone') || message.includes('mobile')) setFieldErrors(prev => ({ ...prev, phone: err.message }));
      else if (message.includes('password')) setFieldErrors(prev => ({ ...prev, password: err.message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gov-container py-10 max-w-md mx-auto space-y-6">
      {/* Top Back Navigation */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          onClick={() => navigateBack ? navigateBack('login') : setActiveTab('login')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#14201C] border border-[#E2E8F0] dark:border-[#1E2E28] hover:border-[#047857]/40 hover:bg-[#F7FAF8] dark:hover:bg-[#1A2823] hover:text-[#047857] shadow-xs transition"
          title={lang === 'bn' ? 'লগইন পাতায় ফিরে যান' : 'Back to Login'}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{lang === 'bn' ? 'লগইন পাতায় ফিরে যান' : 'Back to Login'}</span>
        </Button>

        <span className="text-[11px] text-slate-400 font-medium">
          Bhumisetu • Register
        </span>
      </div>

      <div className="text-center space-y-2">
        <div className="flex justify-center mb-1">
          <BhumiSathiLogo size={52} className="shadow-xs" />
        </div>
        <h1 className="text-2xl font-bold text-[#17212B] dark:text-white">
          {lang === 'bn' ? 'নাগরিক ডিজিটাল প্রোফাইল নিবন্ধন' : 'Citizen Registration'}
        </h1>
        <p className="text-xs text-[#64748B]">
          {lang === 'bn' ? 'ভূমিসেতু প্ল্যাটফর্মে দলিল যাচাই ও নামজারি আবেদন করতে নিবন্ধন করুন' : 'Register to verify deeds and file mutation applications on Bhumisetu'}
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
              <Input
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
              {lang === 'bn' ? 'ইউজারনেম' : 'Username'} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <Input type="text" name="username" value={form.username} onChange={handleChange}
                autoComplete="username" minLength={4} maxLength={30} pattern="[A-Za-z0-9_.]{4,30}"
                placeholder="citizen01" className="gov-input pl-9"
                aria-invalid={Boolean(fieldErrors.username) || ['invalid', 'taken'].includes(usernameStatus.state)} required />
            </div>
            <p role="status" className={`mt-1 text-[11px] ${usernameStatus.state === 'available' ? 'text-emerald-700' : ['invalid', 'taken'].includes(usernameStatus.state) ? 'text-rose-600' : 'text-gray-500'}`}>
              {fieldErrors.username || (usernameStatus.state === 'available'
                ? (lang === 'bn' ? 'ব্যবহারযোগ্য' : 'Available')
                : usernameStatus.state === 'taken'
                  ? (lang === 'bn' ? 'আগেই নেওয়া হয়েছে' : 'Already taken')
                  : usernameStatus.state === 'invalid'
                    ? (lang === 'bn' ? 'ইউজারনেম সঠিক নয়' : 'Invalid username')
                    : usernameStatus.state === 'checking'
                      ? (lang === 'bn' ? 'যাচাই হচ্ছে…' : 'Checking…')
                      : usernameStatus.state === 'error'
                        ? (lang === 'bn' ? 'এখন যাচাই করা যাচ্ছে না।' : 'Could not check username right now.')
                        : (lang === 'bn' ? '৪–৩০ অক্ষর: ইংরেজি অক্ষর, সংখ্যা, _ বা .; কোনো স্পেস নয়।' : '4–30 characters: letters, numbers, _ or .; no spaces.'))}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              {lang === 'bn' ? 'ইমেইল ঠিকানা' : 'Email Address'} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <Input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="citizen@example.com"
                className="gov-input pl-9"
                required
              />
            </div>
            {fieldErrors.email && <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.email}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {lang === 'bn' ? 'মোবাইল' : 'Mobile'}
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <Input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="01711002233"
                  className="gov-input pl-9 text-xs"
                  inputMode="tel"
                  maxLength={16}
                  pattern="[+]?[0-9]{8,15}"
                  aria-invalid={Boolean(fieldErrors.phone)}
                required
                />
                {fieldErrors.phone && <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.phone}</p>}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              {lang === 'bn' ? 'জাতীয় পরিচয়পত্র (NID)' : 'National ID (NID)'}
              </label>
              <div className="relative">
                <CreditCard className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <Input
                  type="text"
                  name="nid"
                  value={form.nid}
                  onChange={(e) => { setForm(prev => ({ ...prev, nid: e.target.value.replace(/[^0-9]/g, '').slice(0, 17) })); setFieldErrors(prev => ({ ...prev, nid: '' })); setError(''); }}
                  placeholder="10, 13, or 17 digits"
                  className="gov-input pl-9 text-xs"
                  inputMode="numeric"
                  maxLength={17}
                  pattern="(?:[0-9]{10}|[0-9]{13}|[0-9]{17})"
                  aria-invalid={Boolean(fieldErrors.nid)}
                required
                />
                {!fieldErrors.nid && <p className="mt-1 text-[11px] text-gray-500">{lang === 'bn' ? 'শুধু ইংরেজি সংখ্যা: ১০, ১৩ অথবা ১৭ অঙ্ক।' : 'ASCII digits only: exactly 10, 13, or 17 digits.'}</p>}
                {fieldErrors.nid && <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.nid}</p>}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              {lang === 'bn' ? 'পাসওয়ার্ড' : 'Password'} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <Input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder={lang === 'bn' ? 'কমপক্ষে ৮ অক্ষর' : 'At least 8 characters'}
                className="gov-input pl-9 pr-9"
                minLength={8}
                maxLength={256}
                required
              />
              <Button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">{lang === 'bn' ? 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।' : 'Password must be at least 8 characters.'}</p>
            {fieldErrors.password && <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.password}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              {lang === 'bn' ? 'পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm Password'} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <Input
                type="password"
                name="password_confirmation"
                value={form.password_confirmation}
                onChange={handleChange}
                className="gov-input pl-9"
                minLength={8}
                maxLength={256}
                required
              />
            </div>
            {(fieldErrors.password_confirmation || (form.password_confirmation && form.password !== form.password_confirmation)) &&
              <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.password_confirmation || (lang === 'bn' ? 'দুটি পাসওয়ার্ড মিলছে না।' : 'Passwords do not match.')}</p>}
          </div>

          <Button
            type="submit"
            disabled={loading || usernameStatus.state === 'checking'}
            className="w-full gov-btn-primary justify-center text-xs py-2.5 font-bold shadow"
          >
            {loading ? (lang === 'bn' ? 'অ্যাকাউন্ট তৈরি হচ্ছে...' : 'Creating account...') : (lang === 'bn' ? 'নাগরিক অ্যাকাউন্ট তৈরি করুন' : 'Create Citizen Account')}
          </Button>
        </form>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 text-center text-xs text-gray-500">
          <span>{lang === 'bn' ? 'ইতিপূর্বে অ্যাকাউন্ট আছে?' : 'Already have an account?'} </span>
          <Button
            onClick={() => setActiveTab('login')}
            className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline"
          >
            {lang === 'bn' ? 'লগইন করুন' : 'Sign in here'}
          </Button>
        </div>
      </div>
    </div>
  );
}
