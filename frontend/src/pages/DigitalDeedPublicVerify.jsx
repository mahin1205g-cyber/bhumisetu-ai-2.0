import React, { useEffect, useState } from 'react';
import { BadgeCheck, CircleAlert, QrCode } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context/AppContext';

export default function DigitalDeedPublicVerify({ verificationToken }) {
  const { lang } = useApp();
  const bn = lang === 'bn';
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!verificationToken) {
      setError(bn ? 'যাচাই লিংকটি অসম্পূর্ণ।' : 'The verification link is incomplete.');
      return () => { active = false; };
    }
    api.verifyDigitalDeed(verificationToken)
      .then((response) => { if (active) setResult(response); })
      .catch(() => { if (active) setError(bn ? 'যাচাই সেবা এখন পাওয়া যাচ্ছে না।' : 'Verification service is unavailable right now.'); });
    return () => { active = false; };
  }, [verificationToken, bn]);

  const valid = result?.valid;
  return (
    <main className="gov-container flex min-h-[70vh] items-center justify-center py-10">
      <section className="gov-card w-full max-w-xl p-6 text-center sm:p-9">
        <div className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl ${valid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {valid ? <BadgeCheck className="h-7 w-7" /> : error || result?.status === 'invalid' ? <CircleAlert className="h-7 w-7" /> : <QrCode className="h-7 w-7" />}
        </div>
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Bhumisetu · Digital Deed</p>
        <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{bn ? 'ডিজিটাল দলিল যাচাই' : 'Digital deed verification'}</h1>
        {!result && !error && <p className="mt-4 text-sm text-slate-500">{bn ? 'যাচাই করা হচ্ছে…' : 'Checking verification status…'}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error}</p>}
        {result && <>
          <p className={`mt-4 rounded-xl p-4 text-sm font-semibold ${valid ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>{result.message_bn && bn ? result.message_bn : result.message_en}</p>
          {valid && <dl className="mt-5 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
            {[[bn ? 'ডিজিটাল কপি আইডি' : 'Digital copy ID', result.digital_deed_id], [bn ? 'দলিলের ধরন' : 'Deed type', result.deed_type], [bn ? 'নিবন্ধনের বছর' : 'Registration year', result.reg_year], [bn ? 'জেলা' : 'District', result.district]].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold">{value || '—'}</dd></div>)}
          </dl>}
        </>}
        <p className="mt-6 text-xs leading-relaxed text-slate-500">{bn ? 'এটি ভূমিসেতুর ডিজিটাল কপির অবস্থা যাচাই করে। এটি সরকারি নিবন্ধন, মালিকানা বা আইনি বৈধতার চূড়ান্ত প্রমাণ নয়।' : 'This checks the status of a Bhumisetu digital copy. It is not final proof of government registration, ownership, or legal validity.'}</p>
      </section>
    </main>
  );
}
