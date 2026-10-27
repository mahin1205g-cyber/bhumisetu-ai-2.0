import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import { HelpCircle, ChevronRight, BookOpen, ShieldCheck, Scale, Cpu } from 'lucide-react';

export default function HelpFAQ({ setActiveTab, navigateBack }) {
  const { lang, t } = useApp();
  const [openFaq, setOpenFaq] = useState(null);

  const sections = [
    {
      title: lang === 'bn' ? 'এআই ও ঝুঁকি মূল্যায়ন পদ্ধতি (Scoring Methodology)' : 'Scoring Methodology & AI Engine',
      icon: Cpu,
      content: lang === 'bn'
        ? "ল্যান্ডগার্ড এআই একটি স্বচ্ছ ও ব্যাখ্যামূলক নিয়ম-ভিত্তিক এআই ফ্রেমওয়ার্ক ব্যবহার করে। প্রতিটি ঝুঁকি সূচকের জন্য সুস্পষ্ট পয়েন্ট নির্ধারণ করা হয়েছে: একাধিকবার বিক্রি (+৪৫), বিক্রেতার নাম ও বর্তমান মালিকের গরমিল (+৪০), দ্বৈত দলিল নম্বর (+৫০), ৩০ দিনের কম সময়ে দ্রুত হস্তান্তর (+১৫), বাজার মূল্যের অস্বাভাবিকতা (+২০)। মোট স্কোর ০ থেকে ১০০ পর্যন্ত হিসেব হয়। ৬০ বা তদূর্ধ্ব উচ্চ ঝুঁকি, ৩০–৫৯ মাঝারি ঝুঁকি এবং ৩০-এর নিচে নিম্ন ঝুঁকি।"
        : "LandGuard AI employs a transparent, explainable rule-based anomaly detection engine combined with scikit-learn Isolation Forest scoring. Conflicting seller names (+40), duplicate sale records (+45), duplicate deed registration (+50), rapid transfers under 30 days (+15), and valuation anomalies (+20) are aggregated up to 100 points."
    },
    {
      title: lang === 'bn' ? 'বাংলাদেশ ভূমি পরিভাষা নির্দেশিকা (Glossary)' : 'Bangladesh Land Terminology Glossary',
      icon: BookOpen,
      content: lang === 'bn'
        ? "• মৌজা (Mouza): রাজস্ব আদায়ের সর্বনিম্ন ভৌগোলিক একক। প্রতিটি মৌজার একটি নির্দিষ্ট জে.এল (Jurisdiction List) নম্বর থাকে।\n• খতিয়ান (Khatian): জমির মালিকানা ও অংশের সরকারি রেকর্ড (CS, SA, RS, BS)।\n• দাগ / প্লট (Plot / Daag): মৌজা ম্যাপে চিহ্নিত একক ভূমি খণ্ড।\n• নামজারি ও জমাভাগ (Mutation & Separation): নতুন ক্রেতার নামে সরকারি রেকর্ডে মালিকানা স্থানান্তর ও পৃথক খতিয়ান সৃজন।\n• ডিসিআর (DCR): ডুপ্লিকেট কার্বন রশিদ (Duplicate Carbon Receipt), যা সরকারি ফি পরিশোধের বৈধ প্রমাণ।"
        : "• Mouza: Smallest revenue territorial survey unit with a JL number.\n• Khatian: Record of Rights (CS, SA, RS, BS survey records).\n• Daag / Plot: Individual numbered land parcel on the cadastral survey map.\n• Mutation / Namjari: Legal administrative transfer of ownership in the AC Land record.\n• DCR: Duplicate Carbon Receipt proving official government fee payments."
    },
    {
      title: lang === 'bn' ? 'ডিজিটাল কিউআর কোড যাচাইকরণ নির্দেশিকা' : 'QR Code Verification Guidelines',
      icon: ShieldCheck,
      content: lang === 'bn'
        ? "প্রতিটি প্রতিবেদন প্রস্তুত হওয়ার পর সিস্টেমে একটি সার্ভার-ভ্যালিডেটেড অনন্য রেফারেন্স নম্বর (যেমন: LG-VR-2026-XXXX অথবা LG-DD-2026-XXXX) তৈরি হয়। সনদে প্রদর্শিত কিউআর কোড স্ক্যান করলে সরাসরি ল্যান্ডগার্ড এআই প্ল্যাটফর্মের অভ্যন্তরীণ যাচাই পাতায় ফলাফল প্রদর্শন করে। এটি কোনো অফিশিয়াল সাব-রেজিস্ট্রার সিল বা সনদ নয়।"
        : "Each report generates a unique reference code (e.g., LG-VR-2026-XXXX or LG-DD-2026-XXXX). Scanning the QR code resolves to the secure server verification endpoint inside the LandGuard AI system."
    }
  ];

  return (
    <div className="gov-container py-6 space-y-6 max-w-4xl">
      {/* Top Page Header with Universal Back Button & Breadcrumbs */}
      <PageHeader
        title={lang === 'bn' ? 'ব্যবহারবিধি, প্রশ্নোত্তর ও অ্যালগরিদম পদ্ধতি' : 'Methodology, Terminology & FAQ'}
        subtitle={
          lang === 'bn'
            ? 'ল্যান্ডগার্ড এআই কীভাবে বিশ্লেষণ করে, স্কোরিং নিয়মাবলী ও ভূমি সেবার প্রচলিত পরিভাষা।'
            : 'Algorithm transparency, scoring logic, and Bangladesh land terms glossary.'
        }
        icon={HelpCircle}
        badge={lang === 'bn' ? 'সহায়তা ও নির্দেশিকা' : 'Help & Docs'}
        badgeColor="blue"
        breadcrumbs={[
          { label: lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }
        ]}
        setActiveTab={setActiveTab}
        onBack={() => navigateBack ? navigateBack('dashboard') : (setActiveTab && setActiveTab('dashboard'))}
        fallbackTab="dashboard"
      />

      <div className="space-y-6">
        {sections.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div key={idx} className="gov-card p-6 space-y-3">
              <h2 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
                <Icon className="w-4 h-4 text-[#0b462d] dark:text-emerald-400" />
                <span>{s.title}</span>
              </h2>
              <div className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                {s.content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
