import React from 'react';
import { useApp } from '../context/AppContext';
import Button from './Button';

export default function DigitalDeedViewModal({ deed, qr, onClose, onShare, onPrint }) {
  const { lang, t } = useApp();
  if (!deed) return null;
  const bn = lang === 'bn';
  const rows = [
    [t('deedNo'), deed.deed_no], [t('regYear'), deed.reg_year], [t('deedType'), deed.deed_type],
    [t('regDate'), deed.reg_date], [t('district'), deed.district], [t('upazila'), deed.upazila],
    [t('mouza'), deed.mouza], [t('plotNo'), deed.plot_id], [t('khatianNo'), deed.khatian_no],
    [t('sellerName'), deed.seller_name], [t('buyerName'), deed.buyer_name], [t('landArea'), deed.area],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');
  return (
    <div role="dialog" aria-modal="true" aria-label={bn ? 'ডিজিটাল দলিল' : 'Digital deed'} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between"><div><p className="text-xs font-bold text-emerald-700">{bn ? 'অনুমোদিত ডিজিটাল কপি' : 'Approved digital copy'}</p><h2 className="mt-1 text-xl font-bold">{deed.digital_deed_id}</h2></div><Button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5">×</Button></div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-lg border p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}</div>
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">{qr && <img src={qr} alt={bn ? 'যাচাই QR' : 'Verification QR'} className="h-28 w-28 bg-white p-1"/>}<p className="max-w-md text-xs text-slate-600 dark:text-slate-300">{bn ? 'QR স্ক্যান করে কপির সীমিত public অবস্থা যাচাই করুন। এটি সরকারি মালিকানা যাচাই নয়।' : 'Scan the QR to check this copy’s limited public status. It is not official ownership verification.'}</p></div>
        <div className="mt-4 flex gap-2"><Button type="button" onClick={onShare} className="rounded-lg border px-3 py-2 text-xs">{bn ? 'শেয়ার লিংক কপি' : 'Copy share link'}</Button><Button type="button" onClick={onPrint} className="gov-btn-primary px-3 py-2 text-xs">{bn ? 'প্রিন্ট / PDF' : 'Print / PDF'}</Button></div>
        <p className="mt-4 text-xs text-slate-500">{bn ? 'এই কপি ভূমিসেতুর অভ্যন্তরীণ অনুমোদনের ভিত্তিতে তৈরি; সরকারি নিবন্ধন/মালিকানার চূড়ান্ত প্রমাণ নয়।' : 'This copy reflects Bhumisetu’s internal approval and is not final proof of government registration or ownership.'}</p>
      </section>
    </div>
  );
}
