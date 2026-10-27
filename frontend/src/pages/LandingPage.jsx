import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import BhumiSathiLogo from '../components/BhumiSathiLogo';
import {
  ShieldCheck, FileCheck2, GitBranchPlus, AlertOctagon, ArrowRight,
  Sparkles, CheckCircle2, ChevronRight, HelpCircle, FileText, QrCode,
  Lock, Search, Check, Layers, Zap
} from 'lucide-react';

export default function LandingPage({ setActiveTab }) {
  const { lang, t } = useApp();
  const [openFaq, setOpenFaq] = useState(null);

  const features = [
    {
      id: 'deed-verify',
      badge: lang === 'bn' ? 'দলিল ও বালাম যাচাই' : 'Deed Verification',
      title: lang === 'bn' ? 'ডিজিটাল দলিল ও মালিকানা যাচাই' : 'Deed & Ownership Verification',
      desc: lang === 'bn'
        ? 'দলিল নম্বর, রেজিস্ট্রেশন সাল, মৌজা ও দাগ নম্বরের তথ্যের সাথে সাব-রেজিস্ট্রি বালাম রেকর্ডের মিল পরীক্ষা। আধুনিক অ্যালগরিদম দ্বারা নাম, দাগ ও পরিমাণের অমিল তাৎক্ষণিক শনাক্তকরণ।'
        : 'Cross-reference submitted deed details against sub-registry balam records. Anomaly detection engine highlights mismatched plot IDs, owner names, and area discrepancies.',
      icon: FileCheck2,
      cta: lang === 'bn' ? 'দলিল যাচাই করুন' : 'Verify Deed'
    },
    {
      id: 'mutation',
      badge: lang === 'bn' ? 'স্মার্ট ই-নামজারি' : 'E-Namjari Workflow',
      title: lang === 'bn' ? 'স্মার্ট ই-নামজারি ও ওয়ার্কফ্লো' : 'Smart E-Namjari & Mutation Workflow',
      desc: lang === 'bn'
        ? 'নাগরিকদের জন্য সহজ নির্দেশিত নামজারি আবেদন ফরম, খসড়া সংরক্ষণ ও ৬-ধাপের রিয়েলটাইম টাইমলাইন ট্র্যাকিং। এসি ল্যান্ড ও ভূমি কর্মকর্তাদের জন্য পর্যালোচনা, নোটিশ ও অনুমোদনের পূর্ণাঙ্গ প্যানেল।'
        : 'Guided mutation filing wizard with draft saving and transparent visual timeline tracking. Comprehensive AC Land officer portal for review, notice dispatch, and approval audit trails.',
      icon: GitBranchPlus,
      cta: lang === 'bn' ? 'নামজারি আবেদন' : 'Apply Mutation'
    },
    {
      id: 'due-diligence',
      badge: lang === 'bn' ? 'প্রাক-ক্রয় স্বত্ব যাচাই' : 'Due Diligence',
      title: lang === 'bn' ? 'জমি কেনার আগে প্রাক-ক্রয় যাচাই' : 'Citizen Due Diligence Pre-Purchase',
      desc: lang === 'bn'
        ? 'জমি কেনার বায়না বা চুক্তির পূর্বে প্লটের স্বত্ব ধারাবাহিকতা, একাধিকবার বিক্রির ঝুঁকি, দ্রুত হস্তান্তর, অধিগ্রহণ নোটিশ বা দেওয়ানি বিরোধ যাচাই করে বস্তুনিষ্ঠ ঝুঁকি স্কোর (০-১০০) ও পূর্ণাঙ্গ রিপোর্ট প্রদান।'
        : 'Pre-purchase parcel scrutiny for prospective buyers. Evaluates title chain breaks, duplicate deed histories, rapid flipping anomalies, and litigation flags with transparent risk scores.',
      icon: AlertOctagon,
      cta: lang === 'bn' ? 'ঝুঁকি যাচাই করুন' : 'Assess Land Risk'
    }
  ];

  const faqs = [
    {
      q: lang === 'bn' ? 'ভূমিসেতু (Bhumisetu) কীভাবে নাগরিক সেবা প্রদান করে?' : 'How does Bhumisetu serve citizens?',
      a: lang === 'bn'
        ? 'ভূমিসেতু ব্যবহারকারীর প্রদত্ত দলিল ও জমির তথ্যের সাথে সিস্টেমের রেজিস্ট্রি রেকর্ড মিলিয়ে দেখে। কোনো গরমিল বা অস্বাভাবিকতা (যেমন: একাধিকবার বিক্রি, মালিকানা অসঙ্গতি, বায়া দলিলের ধারাবাহিকতার ঘাটতি) থাকলে তা নিয়মতান্ত্রিক অ্যালগরিদম ব্যবহারের মাধ্যমে রিয়েলটাইমে চিহ্নিত করে প্রতিবেদন প্রদান করে।'
        : 'Bhumisetu cross-references submitted property details against land records. Conflicting buyer names, duplicate plot sales, and title chain anomalies are flagged using rule-based validation engines in real time.'
    },
    {
      q: lang === 'bn' ? 'ই-নামজারি আবেদনে সংশোধনের নোটিশ এলে করণীয় কী?' : 'What should applicants do when a correction notice is received?',
      a: lang === 'bn'
        ? 'কর্মকর্তা কোনো তথ্য বা অতিরিক্ত বায়া দলিল তলব করলে আবেদন ট্র্যাকিং পাতায় স্বয়ংক্রিয়ভাবে "সংশোধিত তথ্য ও প্রমাণক দাখিল ফরম" উন্মুক্ত হয়। সেখানে প্রয়োজনীয় ফাইল ও ব্যাখ্যা লিখে দাখিল করলেই আবেদনটি পুনরায় পর্যালোচনাধীন অবস্থায় প্রবেশ করে।'
        : 'When an AC Land officer requests additional information or clearer chain deeds, an interactive resubmission form appears in the Tracking view. Citizens can update details, attach documents, and submit directly back to the officer queue.'
    },
    {
      q: lang === 'bn' ? 'ভেরিফায়েড রিপোর্টে কিউআর কোড কী নির্দেশ করে?' : 'What does the QR code on reports represent?',
      a: lang === 'bn'
        ? 'প্রতিটি যাচাই ও সিদ্ধান্তের পর সিস্টেম একটি অনন্য রেফারেন্স কোড ও কিউআর তৈরি করে, যা স্ক্যান করলে সরাসরি ভূমিসেতু প্ল্যাটফর্মে সংরক্ষিত যাচাইয়ের অরিজিনাল অডিট রেকর্ড প্রদর্শন করে।'
        : 'Each verification generates a unique reference and verifiable QR code pointing directly to the validation URL within the Bhumisetu platform.'
    }
  ];

  return (
    <div className="space-y-16 pb-16 bg-white dark:bg-[#0C1210] transition-colors duration-200">
      {/* Hero Section with Light Canvas & Elegant Flowing Liquid Waves */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white via-[#F7FAF8] to-white dark:from-[#0C1210] dark:via-[#111A16] dark:to-[#0C1210] pt-14 sm:pt-20 pb-24 sm:pb-28 border-b border-[#E2E8F0] dark:border-[#1E2E28]">
        {/* Soft Ambient Glow Orbs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#D1FAE5]/40 dark:bg-emerald-950/20 blur-3xl rounded-full pointer-events-none animate-glow-pulse" />

        <div className="gov-container relative z-10 text-center max-w-4xl mx-auto space-y-6">
          {/* Government Tech Pilot Badge */}
          <div className="flex justify-center animate-smooth-enter">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#D1FAE5] dark:bg-[#064E3B] text-[#047857] dark:text-emerald-300 border border-[#A7F3D0] dark:border-emerald-800 shadow-xs">
              <ShieldCheck className="w-4 h-4 text-[#047857] dark:text-emerald-300" />
              <span>{lang === 'bn' ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার — ডিজিটাল ভূমি প্রযুক্তি পাইলট' : 'Government Land Technology Initiative • Bhumisetu'}</span>
            </span>
          </div>

          {/* Logo with Subtle Hover Lift */}
          <div className="flex justify-center animate-smooth-enter" style={{ animationDelay: '0.1s' }}>
            <BhumiSathiLogo size={68} className="w-14 h-14 sm:w-16 sm:h-16 shadow-xs hover:scale-105 transition-transform duration-200" />
          </div>

          {/* Clean High-Contrast Typography Headline */}
          <div className="space-y-2 animate-smooth-enter" style={{ animationDelay: '0.15s' }}>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-[#17212B] dark:text-white leading-[1.15]">
              {lang === 'bn' ? 'ভূমি নিরাপত্তা ও নাগরিক সেবা সহজীকরণে' : 'Empowering Transparent Land Decisions'}
              <span className="block text-[#047857] dark:text-emerald-400 mt-1">
                {lang === 'bn' ? 'আধুনিক ডিজিটাল ভূমিসেতু' : 'Next-Gen Bhumisetu Platform'}
              </span>
            </h1>
          </div>

          {/* Subtitle with Optimal Reading Contrast */}
          <p className="text-sm sm:text-base text-[#64748B] dark:text-slate-300 max-w-2xl mx-auto leading-relaxed animate-smooth-enter" style={{ animationDelay: '0.2s' }}>
            {lang === 'bn'
              ? 'ডিজিটাল দলিল ও বালাম যাচাই, স্মার্ট ই-নামজারি ওয়ার্কফ্লো এবং জমি ক্রয়ের পূর্বে নাগরিক স্বত্ব ঝুঁকি নিরূপণের সম্পূর্ণ আধুনিক সমন্বিত প্রযুক্তি।'
              : 'Digital Deed Verification, Smart E-Namjari Workflow, and Pre-Purchase Due Diligence for Safer Land Decisions.'}
          </p>

          {/* Apple/Linear Style Clean Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2 animate-smooth-enter" style={{ animationDelay: '0.25s' }}>
            <button
              onClick={() => setActiveTab('deed-verify')}
              className="gov-btn-primary px-8 py-3 text-sm font-bold shadow-xs hover:bg-[#065F46] flex items-center gap-2 group transition"
            >
              <span>{lang === 'bn' ? 'যাচাই শুরু করুন' : 'Start Verification'}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-150" />
            </button>

            <button
              onClick={() => setActiveTab('dashboard')}
              className="gov-btn-secondary px-7 py-3 text-sm font-semibold shadow-xs hover:border-[#047857]/40 transition"
            >
              <span>{t('navDashboard')}</span>
            </button>
          </div>

          {/* Trust Highlights Row */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-[#64748B] dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-[#047857] dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'বালাম বই ও স্বত্ব রেকর্ড মিল' : 'Deed Registry Verification'}</span>
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-[#047857] dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'O(log N) দ্রুততম বাইনারি সার্চ' : 'O(log N) Fast Binary Search'}</span>
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-[#047857] dark:text-emerald-400" />
              <span>{lang === 'bn' ? 'এসি ল্যান্ড শুনানির পূর্ণাঙ্গ ওয়ার্কফ্লো' : 'AC Land Officer Workflow'}</span>
            </span>
          </div>
        </div>

        {/* Elegant Flowing Liquid Wave SVGs (Lightweight CSS 60fps) */}
        <div className="absolute bottom-0 left-0 right-0 h-16 sm:h-20 overflow-hidden pointer-events-none select-none">
          {/* Wave Layer 1 (Soft Mint) */}
          <svg
            className="absolute bottom-0 left-0 w-[200%] h-full animate-liquid-wave-1 opacity-70"
            viewBox="0 0 1440 120"
            fill="none"
            preserveAspectRatio="none"
          >
            <path
              d="M0,40 C320,80 480,10 720,50 C960,90 1120,20 1440,60 L1440,120 L0,120 Z"
              fill="#D1FAE5"
              className="dark:fill-[#064E3B]/40"
            />
          </svg>

          {/* Wave Layer 2 (Clean Off-White) */}
          <svg
            className="absolute bottom-0 left-0 w-[200%] h-full animate-liquid-wave-2 opacity-90"
            viewBox="0 0 1440 120"
            fill="none"
            preserveAspectRatio="none"
          >
            <path
              d="M0,60 C240,20 480,80 720,40 C960,0 1200,60 1440,30 L1440,120 L0,120 Z"
              fill="#F7FAF8"
              className="dark:fill-[#111A16]"
            />
          </svg>
        </div>
      </section>

      {/* Core Services Section — Clean White Cards with Crisp Borders */}
      <section className="gov-container">
        <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#17212B] dark:text-white">
            {lang === 'bn' ? 'ভূমি সুরক্ষার আধুনিক ডিজিটাল সমাধান' : 'Modern Digital Land Security Solutions'}
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
            {lang === 'bn'
              ? 'নাগরিক সেবা সহজীকরণ, দ্রুততম বাইনারি সার্চ এবং ভূমি সুরক্ষায় আধুনিক প্রযুক্তি।'
              : 'Empowering citizens, ensuring transparency, and securing property investments.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map(f => {
            const Icon = f.icon;
            return (
              <div
                key={f.id}
                className="gov-card p-6 sm:p-7 flex flex-col justify-between group hover:border-[#047857]/40 hover:shadow-hover transition duration-200"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-[#F0FDF4] dark:bg-[#0B241A] text-[#047857] dark:text-emerald-400 border border-[#D1FAE5] dark:border-[#1E2E28] flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#F7FAF8] dark:bg-[#192722] text-[#047857] dark:text-emerald-300 border border-[#E2E8F0] dark:border-[#1E2E28]">
                      {f.badge}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-[#17212B] dark:text-white group-hover:text-[#047857] dark:group-hover:text-emerald-400 transition-colors">
                    {f.title}
                  </h3>

                  <p className="text-xs sm:text-[13px] text-[#64748B] dark:text-slate-300 leading-relaxed">
                    {f.desc}
                  </p>
                </div>

                <div className="pt-6">
                  <button
                    onClick={() => setActiveTab(f.id)}
                    className="w-full gov-btn-secondary justify-center text-xs sm:text-sm py-2.5 group-hover:border-[#047857] group-hover:text-[#047857] transition"
                  >
                    <span>{f.cta}</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4-Step Verification Workflow */}
      <section className="gov-container">
        <div className="bg-[#F7FAF8] dark:bg-[#111A16] p-8 sm:p-10 rounded-2xl border border-[#E2E8F0] dark:border-[#1E2E28]">
          <div className="text-center max-w-xl mx-auto mb-8 space-y-1.5">
            <h3 className="text-xl sm:text-2xl font-bold text-[#17212B] dark:text-white">
              {lang === 'bn' ? '৪টি সহজ ধাপে ডিজিটাল যাচাইকরণ প্রক্রিয়া' : '4-Step Verification Workflow'}
            </h3>
            <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
              {lang === 'bn' ? 'স্বচ্ছ, নিরাপদ ও নির্ভুল স্বয়ংক্রিয় বিশ্লেষণ' : 'Transparent, secure, and automated analysis'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { step: '১', title: lang === 'bn' ? 'তথ্য বা দলিল প্রদান' : 'Input or Upload Deed', desc: lang === 'bn' ? 'দলিল নম্বর বা স্ক্যান কপি প্রদান করুন' : 'Submit deed number or upload document' },
              { step: '২', title: lang === 'bn' ? 'স্বয়ংক্রিয় এক্সট্রাকশন' : 'Data Extraction', desc: lang === 'bn' ? 'ক্রেতা, বিক্রেতা, দাগ ও খতিয়ান স্বয়ংক্রিয় যাচাই' : 'Auto-extract parties, plot ID, and khatian' },
              { step: '৩', title: lang === 'bn' ? 'বালাম রেকর্ডের সাথে তুলনা' : 'Record Cross-Check', desc: lang === 'bn' ? 'মালিকানা ধারা ও অসঙ্গতি বিশ্লেষণ' : 'Cross-check chain of title and conflicts' },
              { step: '৪', title: lang === 'bn' ? 'ভেরিফায়েড রিপোর্ট ও কিউআর' : 'Verified QR Report', desc: lang === 'bn' ? 'অনন্য রেফারেন্সসহ ডিজিটাল সনদপত্র' : 'Digital certificate with verifiable QR' }
            ].map((s, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-[#14201C] p-5 rounded-xl border border-[#E2E8F0] dark:border-[#1E2E28] shadow-xs flex flex-col items-center text-center space-y-3"
              >
                <div className="step-sphere">
                  {s.step}
                </div>
                <h4 className="font-bold text-xs sm:text-sm text-[#17212B] dark:text-white">
                  {s.title}
                </h4>
                <p className="text-[11px] text-[#64748B] dark:text-slate-400 leading-relaxed">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions (FAQ) */}
      <section className="gov-container max-w-3xl">
        <h3 className="text-xl font-bold text-[#17212B] dark:text-white text-center mb-6">
          {lang === 'bn' ? 'সচরাচর জিজ্ঞাসিত প্রশ্ন (FAQ)' : 'Frequently Asked Questions'}
        </h3>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div
              key={i}
              className="gov-card overflow-hidden cursor-pointer"
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <div className="p-4 flex items-center justify-between gap-2 font-semibold text-xs sm:text-sm text-[#17212B] dark:text-white">
                <span className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-[#047857] dark:text-emerald-400" />
                  {f.q}
                </span>
                <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openFaq === i ? 'rotate-90' : ''}`} />
              </div>
              {openFaq === i && (
                <div className="px-4 pb-4 pt-1 text-xs text-[#64748B] dark:text-slate-300 border-t border-[#E2E8F0] dark:border-[#1E2E28] leading-relaxed bg-[#F7FAF8] dark:bg-[#111A16]">
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
