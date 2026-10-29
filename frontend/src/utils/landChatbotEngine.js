/**
 * Static UI content for the Bhumisetu AI chat widget.
 *
 * Every conversational answer comes from the backend LLM. Only the welcome
 * message and the suggested-prompt list live here; there is intentionally no
 * client-side answer engine, so the UI can never fake an AI response.
 */

export const INITIAL_GREETING = {
  bn: {
    title: "স্বাগতম! আমি ভূমিসেতু এআই সহকারী 🤖",
    text: "আমি বাংলাদেশের ভূমি সেবা, নামজারি, দলিল, খতিয়ান ও জমি-সংক্রান্ত প্রশ্নে সহায়তা করি। আপনার প্রশ্ন বাংলা, বাংলিশ বা ইংরেজিতে লিখতে পারেন—নিচের যেকোনো বিষয় বেছে নিতে পারেন অথবা সরাসরি লিখুন।",
  },
  en: {
    title: "Welcome! I am Bhumisetu AI Assistant 🤖",
    text: "I can help with Bangladesh land services, mutation (e-Namjari), deeds, khatian and property questions. Write in Bengali, Banglish or English—pick a topic below or just ask.",
  }
};

export const QUICK_PROMPTS = [
  {
    id: "fake_deed",
    icon: "📜",
    labelBn: "দলিল জাল কিনা কীভাবে চিনব?",
    labelEn: "How to detect a fake deed?",
    query: "জাল দলিল চেনার উপায় এবং বালাম যাচাই কীভাবে করব?"
  },
  {
    id: "mutation_steps",
    icon: "✍️",
    labelBn: "ই-নামজারি আবেদন ও সরকারি ফি",
    labelEn: "E-Namjari steps & official fee",
    query: "ই-নামজারি করতে কী কী কাগজপত্র লাগে এবং সরকারি ফি কত?"
  },
  {
    id: "pre_purchase",
    icon: "🔍",
    labelBn: "জমি কেনার আগে করণীয় চেকলিস্ট",
    labelEn: "Pre-purchase land checklist",
    query: "জমি কেনার বায়না বা চুক্তির পূর্বে কী কী কাগজপত্র যাচাই করা আবশ্যক?"
  },
  {
    id: "khatian_types",
    icon: "📑",
    labelBn: "CS, SA, RS ও BS খতিয়ান কী?",
    labelEn: "What are CS, SA, RS & BS Khatians?",
    query: "সিএস, এসএ, আরএস ও বিএস খতিয়ানের পার্থক্য ও গুরুত্ব কী?"
  },
  {
    id: "land_measure",
    icon: "📐",
    labelBn: "শতাংশ, কাঠা ও বিঘার পরিমাপ",
    labelEn: "Land measurement units",
    query: "জমি পরিমাপের হিসাব: ১ শতাংশ, কাঠা, বিঘা ও একরে কত স্কয়ার ফিট?"
  },
  {
    id: "fraud_prevention",
    icon: "⚠️",
    labelBn: "এক জমি একাধিকবার বিক্রি রোধ",
    labelEn: "Prevent duplicate parcel sale",
    query: "একই জমি একাধিক ব্যক্তির কাছে বিক্রি প্রতিরোধে এই প্ল্যাটফর্ম কীভাবে কাজ করে?"
  }
];
