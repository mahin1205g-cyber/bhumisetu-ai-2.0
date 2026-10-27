import React from 'react';
import { useApp } from '../context/AppContext';
import { AlertCircle, Home, ArrowLeft } from 'lucide-react';

export default function NotFoundPage({ setActiveTab, navigateBack }) {
  const { lang, t } = useApp();

  return (
    <div className="gov-container py-20 text-center max-w-md mx-auto space-y-5">
      <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center mx-auto shadow-inner">
        <AlertCircle className="w-8 h-8" />
      </div>

      <div className="space-y-2">
        <h1 className="text-4xl font-black text-gray-900 dark:text-white">
          ৪০৪
        </h1>
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-200">
          {lang === 'bn' ? 'অনুরোধকৃত পৃষ্ঠাটি খুঁজে পাওয়া যায়নি' : 'Page Not Found (404)'}
        </h2>
        <p className="text-xs text-gray-500 leading-relaxed">
          {lang === 'bn'
            ? 'আপনি যে পাতাটিতে প্রবেশের চেষ্টা করছেন তা সরানো হয়েছে অথবা লিংকটি সঠিক নয়।'
            : 'The page you are looking for might have been removed or the link is incorrect.'}
        </p>
      </div>

      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          onClick={() => navigateBack ? navigateBack('dashboard') : setActiveTab('dashboard')}
          className="gov-btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{lang === 'bn' ? 'পেছনে যান' : 'Go Back'}</span>
        </button>

        <button
          onClick={() => setActiveTab('home')}
          className="gov-btn-secondary text-xs py-2 px-4 flex items-center gap-1.5"
        >
          <Home className="w-3.5 h-3.5" />
          <span>{t('navHome')}</span>
        </button>
      </div>
    </div>
  );
}
