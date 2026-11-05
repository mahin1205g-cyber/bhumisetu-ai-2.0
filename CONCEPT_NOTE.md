# ল্যান্ডটেক ইনোভেশন হ্যাকাথন ২০২৬ — প্রথম রাউন্ড কনসেপ্ট নোট
## প্রকল্প নাম: ভূমিসাথী (BhumiSathi / LandGuard AI)
### কৃত্রিম বুদ্ধিমত্তা-চালিত সমন্বিত ডিজিটাল ভূমি নিরাপত্তা প্ল্যাটফর্ম
**সমস্যা বিবৃতি কোড:** P2 (দলিল যাচাই) + P4 (স্মার্ট ই-নামজারি) + P5 (প্রাক-ক্রয় ডিউ ডিলিজেন্স)  
**জমাদানের প্ল্যাটফর্ম:** [landtech.diu.edu.bd/landtech](https://landtech.diu.edu.bd/landtech)  
**গিটহাব রিপোজিটরি:** [https://github.com/mahin1205g-cyber/bhumisetu-ai](https://github.com/mahin1205g-cyber/bhumisetu-ai)  

---

## ১. নির্বাচিত সমস্যা বিবরণী (Selected Problem Statement)

বাংলাদেশের সামগ্রিক বিচার বিভাগের মামলাজটের প্রায় **৭৫% থেকে ৮০% বিরোধ সরাসরি জমিজমা ও স্বত্ব সংক্রান্ত**। ল্যান্ডটেক হ্যাকাথনের আওতায় আমরা তিনটি আন্তঃসম্পর্কিত জাতীয় সমস্যাকে চিহ্নিত করে একটি সমন্বিত সমাধানের আওতায় এনেছি:

1. **P2 — ডিজিটাল দলিল ও মালিকানা যাচাই (Deed & Ownership Verification):** সাব-রেজিস্ট্রি অফিসের বালাম রেকর্ডের সাথে সাধারণ নাগরিক বা ভূমি অফিসের তাৎক্ষণিক রিয়েলটাইম তথ্য যাচাইয়ের কোনো স্বয়ংক্রিয় ব্যবস্থা নেই। ফলে জাল দলিল, একই দলিল বারবার তৈরি এবং বিক্রেতার নাম ও দাগ নম্বরে গরমিল তৈরি করে প্রতারণা অহরহ ঘটছে।
2. **P4 — স্মার্ট ই-নামজারি ওয়ার্কফ্লো (Smart E-Namjari Workflow):** নামজারি আবেদন প্রক্রিয়ায় তথ্যের অস্পষ্টতা, দীর্ঘসূত্রিতা এবং নাগরিকের পক্ষে আবেদনের রিয়েলটাইম অগ্রগতি ও মাঠ কর্মকর্তাদের আদেশ স্বচ্ছভাবে দেখার সীমাবদ্ধতা।
3. **P5 — জমি কেনার আগে প্রাক-ক্রয় নাগরিক যাচাই (Citizen Due Diligence):** কোনো সাধারণ ক্রেতা জমি কেনার পূর্বে ওই দাগের স্বত্ব ধারাবাহিকতা, পূর্বে একাধিকবার বিক্রি হয়েছে কি না, দেওয়ানি বিরোধ বা সরকারি অধিগ্রহণ নোটিশ আছে কি না—তা একক প্ল্যাটফর্মে সহজে পরিমাপ করতে পারেন না।

---

## ২. বাংলাদেশের প্রেক্ষাপটে সমস্যাটির গভীরতা (Problem in Bangladesh Context)

- **দ্বৈত ও ভুয়া রেজিস্ট্রেশন:** এক জমির একাধিক জাল দলিল তৈরি করে নিরীহ ক্রেতাদের কাছে বিক্রি করা হয়। বালাম বই এনালগ বা বিচ্ছিন্ন থাকায় তাৎক্ষণিক ক্রস-চেক অসম্ভব হয়ে ওঠে।
- **স্বত্ব ধারাবাহিকতা বিচ্ছিন্নতা (Broken Title Chain):** উত্তরাধিকার বা ক্রয়সূত্রে হস্তান্তরের ধারাবাহিক ইতিহাস না থাকায় পরবর্তীতে ক্রেতারা দেওয়ানি মামলার জালে জড়িয়ে পড়েন।
- **নাগরিক ভোগান্তি ও মধ্যস্বত্বভোগী (দালাল) চক্র:** সাধারণ মানুষ আইনি পরিভাষা (মৌজা, খতিয়ান, জে.এল, ডিসিআর) সহজভাবে বুঝতে না পারায় দালাল চক্রের ওপর নির্ভরশীল হতে বাধ্য হন।
- **আদালতের মামলার বোঝা:** ভূমি বিরোধ নিষ্পত্তিতে বছরের পর বছর সময় ও কোটি কোটি টাকার অপচয় হয়, যা জাতীয় অর্থনৈতিক প্রবৃদ্ধিতে বড় অন্তরায়।

---

## ৩. প্রস্তাবিত সমাধান: "ভূমিসাথী" (Proposed Solution)

**ভূমিসাথী (BhumiSathi)** হলো একটি ইউনিফায়েড, এআই-চালিত ডিজিটাল ভূমি সুরক্ষা ও সিদ্ধান্ত গ্রহণ প্ল্যাটফর্ম। এটি নাগরিক ও ভূমি কর্মকর্তাদের জন্য তিনটি ধাপে নিরাপত্তা নিশ্চিত করে:

```
[নাগরিক / ক্রেতা] ────► [ভূমিসাথী যাচাই ইঞ্জিন] ────► [অ্যাপের PostgreSQL ডেটাবেজ]
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
P2: দলিল ক্রস-চেক       P4: স্মার্ট ই-নামজারি     P5: প্রাক-ক্রয় ডিউ ডিলিজেন্স
(OCR ও গরমিল শনাক্ত)    (৪-ধাপ ট্র্যাকার)       (০-১০০ ঝুঁকি স্কোর ও সনদ)
```

1. **P2 সমাধান (ডিজিটাল দলিল যাচাই):**
   - দলিল নম্বর ও সাল দিয়ে বা স্ক্যান কপি আপলোড করে তথ্য যাচাই শুরু করা যায়। OCR কেবল শনাক্ত হওয়া লেখা form-এ প্রস্তাব করে; ব্যবহারকারীকে তা review করতে হয়।
   - বর্তমানে তুলনাটি অ্যাপের নিজস্ব `deeds` ও `properties` PostgreSQL রেকর্ডের সঙ্গে হয়। সরকারি সাব-রেজিস্ট্রি বালাম বা খতিয়ান API সংযুক্ত নেই; রিপোর্টের QR কেবল সংরক্ষিত রিপোর্টের reference, সরকারি বা আইনি সনদ নয়।

2. **P4 সমাধান (স্মার্ট ই-নামজারি):**
   - ৪-ধাপের নির্দেশিত উইজার্ড ফরম, যেখানে খসড়া সংরক্ষণ, অটো-ভ্যালিডেশন এবং স্বয়ংক্রিয় ট্র্যাকিং নম্বর (`MUT-2026-DHK-XXXX`) তৈরি হয়।
   - নাগরিকের জন্য রিয়েলটাইম টাইমলাইন ট্র্যাকার এবং সহকারী কমিশনার (ভূমি) / এসি ল্যান্ড ও কানুনগোদের জন্য পূর্ণাঙ্গ পর্যালোচনা ও নোটিশ জারি ড্যাশবোর্ড।

3. **P5 সমাধান (প্রাক-ক্রয় ডিউ ডিলিজেন্স):**
   - demo record থাকলে প্রস্তাবিত প্লট নম্বর ধরে অ্যাপের সংরক্ষিত তথ্য ও নিয়মভিত্তিক সতর্কতা দেখা যায়। সরকারি মামলা, অধিগ্রহণ বা সম্পূর্ণ মালিকানা ইতিহাসের live source সংযুক্ত নয়।
   - **০-১০০ স্কেলে স্বচ্ছ ঝুঁকি স্কোর** (Risk Score) এবং জমি কেনার আগে **৫টি করণীয় নির্দেশিকা** সহ রিপোর্ট প্রদান করে।

---

## ৪. সিস্টেম আর্কিটেকচার ও প্রযুক্তি (Architecture & Tech Stack)

### আর্কিটেকচার ডায়াগ্রাম:
```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER (React 18 + Vite)            │
│  - Tailwind CSS Government Design System (ডিপ গ্রিন & গোল্ড)    │
│  - বহুভাষিক ইন্টারফেস (বাংলা ডিফল্ট + ইংরেজি) ও ডার্ক মোড        │
│  - API-ভিত্তিক UI ও স্পষ্টভাবে চিহ্নিত demo preset              │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST API / JSON (PostgreSQL)
┌───────────────────────────────▼─────────────────────────────────┐
│                     BACKEND LAYER (FastAPI / Python)            │
│  - RESTful APIs (Auth, Verification, Mutation, Due Diligence)   │
│  - Argon2id password hashing, signed tokens ও RBAC রোলস       │
│  - PostgreSQL query ও উপলভ্য database index                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                     DATA & VERIFICATION ENGINES                 │
│  - Rule-Based Field Comparison and Discrepancy Engine           │
│  - OCR Text Extraction with User Review                         │
│  - PostgreSQL app records; no connected government registry API │
│  - PostgreSQL relational DB (users, profile pictures, records) │
└─────────────────────────────────────────────────────────────────┘
```

- **ফ্রন্টএন্ড:** React 18, Vite 6, Tailwind CSS, Lucide React Icons, Canvas QR Code.
- **ব্যাকএন্ড:** Python 3.13, FastAPI, PostgreSQL/Neon, PostgreSQL query ও উপলভ্য index.
- **নিরাপত্তা:** Argon2id password hashing (পুরোনো hash-এর জন্য legacy verification), signed auth tokens, audit logging ও CORS origin filter.

---

## ৫. মূল ফিচারসমূহ (Core Features)

1. **দলিল রেকর্ড তুলনা:** দলিল নম্বর, সাল, পক্ষের নাম ও জমির field অ্যাপের নিজস্ব database-এ থাকা record-এর সঙ্গে তুলনা; এটিকে সরকারি বালাম যাচাই বলা হয় না।
2. **স্বচ্ছ অসঙ্গতি বিশ্লেষণ:** গরমিলের কারণ (যেমন: বিক্রেতার নামের বানান অমিল, অতিরিক্ত জমি বিক্রয় ইত্যাদি) সুনির্দিষ্ট পয়েন্টসহ প্রদর্শন।
3. **প্রাক-ক্রয় ঝুঁকি পরিমাপক:** ০ (ঝুঁকিমুক্ত) থেকে ১০০ (চরম ঝুঁকিপূর্ণ) স্কোরিং এবং লাল/হলুদ/সবুজ ভিজ্যুয়াল ড্যাশবোর্ড।
4. **স্মার্ট ই-নামজারি ট্র্যাকার:** ৪-ধাপের প্রগ্রেস বার ও টাইমলাইন, যা নাগরিকদের প্রতিটি ধাপের স্বচ্ছ অগ্রগতি দেখায়।
5. **কর্মকর্তা রিভিউ ড্যাশবোর্ড:** এসি ল্যান্ড ও রাজস্ব কর্মকর্তাদের জন্য আবেদন অনুমোদন, খারিজ ও শুনানি নোটিশ জারির প্ল্যাটফর্ম।
6. **রিপোর্ট reference QR:** সংরক্ষিত যাচাই রিপোর্টে ফেরার জন্য QR তৈরি হয়; এটি verification certificate নয়।
7. **এআই ল্যান্ড অ্যাসিস্ট্যান্ট (GPT-Land Chatbot):** সাধারণ নাগরিকদের জমি সংক্রান্ত আইনি ও প্রশাসনিক প্রশ্নের রিয়েলটাইম বাংলা উত্তরদাতা।

---

## ৬. দেশব্যাপী বাস্তবায়ন পরিকল্পনা (Nationwide Implementation Plan)

| পর্যায় | সময়কাল | প্রধান কার্যক্রম ও মাইলফলক |
|---|---|---|
| **ফেজ ১: পাইলট টেস্টিং** | মাস ১ – ৩ | ঢাকা জেলার ২টি উপজেলা ভূমি অফিস (এসি ল্যান্ড) ও সাব-রেজিস্ট্রি অফিসে পাইলট রান। নাগরিক প্রতিক্রিয়া ও মডেল টিউনিং। |
| **ফেজ ২: সরকারি এপিআই ইন্টিগ্রেশন** | মাস ৪ – ৬ | ভূমি মন্ত্রণালয়ের (MinLand) ই-নামজারি পোর্টাল এবং আইন মন্ত্রণালয়ের নিবন্ধন অধিদপ্তরের ডিজিটাল বালামের সাথে নিরাপদ API গেটওয়ে সংযোগ। |
| **ফেজ ৩: দেশব্যাপী সম্প্রসারণ** | মাস ৭ – ১২ | দেশের ৬৪ জেলার ৪৯৫টি উপজেলায় rollout। ইউনিয়ন ডিজিটাল সেন্টার (UDC) ও ডাক বিভাগের উদ্যোক্তাদের প্রশিক্ষণ প্রদান। |
| **ফেজ ৪: ব্লকচেইন ও জাতীয় বাস্তবায়ন**| মাস ১৩ – ১৮ | প্রতিটি বালাম ভলিউম এন্ট্রিতে ব্লকচেইন হ্যাশিং যুক্ত করে শতভাগ অপরিবর্তনীয় ও টেম্পার-প্রুফ জাতীয় ভূমি ডাটাবেজ নিশ্চিতকরণ। |

---

## ৭. দল ও মেন্টরদের তথ্য (Team & Mentors Information)

### দলের নাম: **টিম ভূমিসাথী (Team BhumiSathi)**
**প্রতিষ্ঠান:** ড্যাফোডিল ইন্টারন্যাশনাল ইউনিভার্সিটি (Daffodil International University - DIU)  

| ক্রম | নাম | পদবি / ভূমিকা | ইমেইল ও যোগাযোগ |
|---|---|---|---|
| ১ | **মোঃ বায়েজিদ (Md Bayazid)** | টিম লিডার ও ফুল-স্ট্যাক সিস্টেম আর্কিটেক্ট | `dbscbayazid111@gmail.com` \| `01645241040` |
| ২ | দলীয় সদস্য ২ (সদস্যের নাম) | ফ্রন্টএন্ড ডেভেলপার ও ইউআই/ইউএক্স ডিজাইনার | `member2@diu.edu.bd` |
| ৩ | দলীয় সদস্য ৩ (সদস্যের নাম) | এআই ও ডেটাবেজ ইঞ্জিনিয়ার | `member3@diu.edu.bd` |
| ৪ | দলীয় সদস্য ৪ (সদস্যের নাম) | রিসার্চ ও ডকুমেন্টেশন স্পেশালিস্ট | `member4@diu.edu.bd` |

### মেন্টরদের তথ্য:
- **প্রধান মেন্টর:** (মেন্টর/শিক্ষকের নাম), পদবি ও বিভাগ, ড্যাফোডিল ইন্টারন্যাশনাল ইউনিভার্সিটি। ইমেইল: `mentor@daffodilvarsity.edu.bd`
- **সহকারী মেন্টর / ডোমেইন এক্সপার্ট:** ভূমি আইন ও আইসিটি বিশেষজ্ঞ।

---

## ৮. বর্তমান বাস্তবায়ন আপডেট (৩ নভেম্বর ২০২৬)

### অ্যাকাউন্ট ও প্রোফাইল

- Login-এ username-কেন্দ্রিক label, password visibility toggle এবং username recovery flow রাখা হয়েছে। Search input-এর icon/input spacing ঠিক করা হয়েছে।
- নাগরিক, কর্মকর্তা ও অ্যাডমিন—সব role-এ একই profile avatar component ব্যবহৃত হয়। ছবি না থাকলে username থেকে deterministic initial ও background color তৈরি হয়।
- Profile page থেকে JPG, PNG বা WebP ছবি (সর্বোচ্চ ৫ MB) নির্বাচন, 1:1 crop/reposition, upload progress, save, cancel ও remove করা যায়।
- Backend MIME/content validation করে ছবিকে 512px WebP-তে normalize করে। ছবির bytes PostgreSQL-এর `profile_pictures` table-এ থাকে; `users.profile_picture`-এ opaque version token থাকে। তাই logout/login, backend restart ও redeploy-এর পরও ছবি পাওয়া যায়।
- Upload ও remove কেবল signed-in account-এর নিজের ছবিতে কাজ করে। ছবি দেখার endpoint-এও authentication প্রয়োজন। Header, drawer, dashboard, profile, admin user list এবং mutation applicant view-তে avatar দেখানো হয়।

### Rendering, UI ও dashboard

- Adaptive performance monitor browser-এর বাস্তব frame interval মাপে; 120 Hz display capability-কে 120 FPS guarantee হিসেবে ধরে না। Reduced-motion preference এবং hidden tab state সম্মান করা হয়।
- Dashboard loading/error state ও retry flow উন্নত করা হয়েছে; dashboard summary একই database connection-এ গণনা করা হয়।
- Application tracker আর নিজে থেকে fixed demo tracking ID খোঁজে না; ব্যবহারকারী নম্বর লিখে অনুসন্ধান করেন অথবা চিহ্নিত demo preset বেছে নেন।
- Search, login/recovery, registration, profile এবং dashboard layout-এ responsive spacing ও interaction polish যোগ করা হয়েছে।
- যাচাইহীন 100M–500M record capacity, sub-millisecond latency এবং সবসময় C++ acceleration-এর static দাবি সরানো হয়েছে।

### Demo data সম্পর্কে

`DEMO`, `DEMO_PROPERTIES`, `DEMO_DEEDS`, `DEMO_MUTATIONS` এবং form preset-গুলো ইচ্ছাকৃত synthetic demonstration data। এগুলো app-এর demo workflow ও local validation চালাতে ব্যবহৃত হয় এবং official land record নয়। তাই placeholder/profile fallback ও অসমর্থিত performance claim সরানো হলেও, আবশ্যক demo fixtures রাখা হয়েছে।

### যাচাই

- Frontend production build সফল হয়েছে।
- Profile picture, auth token, dashboard stats ও deed-search মিলিয়ে database-free 28টি Python test পাস করেছে; adaptive performance-এর 5টি Node test পাস করেছে।
- PostgreSQL integration test চালাতে `DATABASE_URL` লাগে; test environment-এ সেটি না থাকায় সেগুলো database-এ চালানো হয়নি।

### সরকারি ইউনিয়ন তালিকা ও দলিল যাচাই ফর্ম (৪ নভেম্বর ২০২৬)

- সরকারি [বাংলাদেশ জাতীয় তথ্য বাতায়নের ইউনিয়ন তালিকা](https://bangladesh.gov.bd/views/union-list/) থেকে ৪,৫৬৮টি ইউনিয়নের নাম নিয়ে source snapshot তৈরি ও database-এ import করা হয়েছে।
- ৪,৪২২টি ইউনিয়ন official location code বা জেলা–উপজেলার নাম দিয়ে বিদ্যমান উপজেলা রেকর্ডের সঙ্গে যুক্ত হয়েছে। বাকি ১৪৬টির parent নিশ্চিতভাবে মেলেনি; সেগুলো ভুল উপজেলার suggestion হিসেবে দেখানো হয় না।
- দলিল যাচাই ফর্মে ঐচ্ছিক “ইউনিয়ন / ওয়ার্ড” input আছে। নির্বাচিত উপজেলার সঙ্গে মেলা সরকারি ইউনিয়ন নাম suggestion হিসেবে আসে; ওয়ার্ড, অনুপস্থিত ইউনিয়ন নাম বা অন্য লিখিত নাম হাতে দেওয়া যায়।
- নির্বাচিত ইউনিয়নের database ID backend-এ একই উপজেলার অধীনে আছে কি না যাচাই হয়। ঐচ্ছিক লেখা ও নির্বাচিত ইউনিয়ন ID `deed_verifications`-এ থাকে।
- `20261104_union_ward_support.sql` migration live database-এ প্রয়োগ করা হয়েছে। Ward-এর যাচাইকৃত সরকারি তালিকা পাওয়া যায়নি; তাই Ward হাতে লিখতে হয়। এই তথ্য দলিল যাচাইয়ের সহায়ক, সরকারি মালিকানা সনদ নয়।
- ৪ নভেম্বর backend Python compile এবং frontend production build সফল হয়েছে।

### OCR runtime fix (৫ নভেম্বর ২০২৬)

- Backend virtualenv-এ অনুপস্থিত `PyTesseract` যোগ করা হয়েছে; Windows-এ Tesseract 5.4 system-wide install করা হয়েছে।
- Bengali `ben` ও English `eng` trained data যুক্ত করে backend-এ standard Windows Tesseract path এবং project-local data path auto-detect করা হয়েছে। `TESSERACT_CMD` ও `TESSDATA_PREFIX` দিয়ে path override করা যায়।
- OCR কোনো required field নিশ্চিতভাবে না পড়লে review-তে স্পষ্ট warning দেখায়; অস্পষ্ট scan থেকে ভুল দলিল তথ্য auto-fill করে না।
- সরবরাহ করা ছবিতে printed text-এর কিছু অংশ পড়া গেছে, কিন্তু দলিল নম্বর, দাগ, খতিয়ান এবং পক্ষের নাম নির্ভরযোগ্যভাবে পাওয়া যায়নি।

### দলিলের summary table থেকে partial OCR autofill (৫ নভেম্বর ২০২৬)

- মূল OCR pass printed summary table না পড়লে scan-এর নিচের অংশে অতিরিক্ত Bengali/English Tesseract pass চালায়; summary table-এ `|` দিয়ে আলাদা cell থাকলে সেগুলো থেকে দলিলের ধরন, মৌজা ও location field আলাদা করে পড়ে।
- একটি পরীক্ষিত স্ক্যান থেকে ফর্মে পাওয়া গেছে: সাফ-কবলা (`sale`), জেলা `Gazipur`, মৌজা `হায়দরাবাদ` এবং মেট্রো থানা `পুবাইল`। সরকারি DGHS GeoCodes source snapshot-এ `Pubail` Gazipur City Corporation-এর police thana হিসেবে আছে (code `30333350`); OCR-এর বাংলা বানানটিকে ওই ইংরেজি নামের সঙ্গে মিলিয়ে location নির্বাচন করার ব্যবস্থা যোগ হয়েছে।
- OCR যেসব তথ্য পরিষ্কারভাবে শনাক্ত করতে পারে না—যেমন দলিল নম্বর, নিবন্ধনের সাল, দাগ, খতিয়ান, ক্রেতা/বিক্রেতার নাম ও ওয়ার্ড—সেগুলো auto-fill না করে হাতে পূরণের জন্য ফাঁকা রাখে। আগে থেকে ফর্মে দেওয়া মান OCR-এ না পাওয়া গেলে মুছে ফেলা হয় না।
- OCR review-তে শনাক্ত হওয়া field-গুলো এবং মূল OCR text দেখা যায়। ফলাফল ব্যবহারকারীর পর্যালোচনার জন্য; এটি মালিকানা যাচাই বা সরকারি সনদ নয়।
- এই পরিবর্তনের পর সরবরাহ করা ছবিতে OCR extraction হাতে মিলিয়ে দেখা হয়েছে; backend Python compile এবং frontend production build সফল হয়েছে। এই সেশনে configured live database host DNS-এ resolve না হওয়ায় database-backed `Pubail` selection আলাদাভাবে live query করে যাচাই করা যায়নি।

### Phase 2 audit, Phase 3 foundation এবং যাচাই ফলাফল (৫ নভেম্বর ২০২৬)

- Live PostgreSQL schema read-only audit-এ `deeds`-এ `division`, `division_id`, `union_id` ও `union_ward` চারটি আলাদা কাজে ব্যবহৃত field পাওয়া গেছে। `admin_union` নামে physical column নেই; Neon table grid-এর relation label-গুলো column নয়। কোনো duplicate physical column বা duplicate index definition পাওয়া যায়নি, তাই কিছু drop করা হয়নি এবং কোনো backup-ও তৈরি করা হয়নি।
- `deed_verifications.owner_name` ও `buyer_name` একই তথ্য বহন করে এমন পূর্ণ duplicate নয়: audit-এর ৬২টি row-এর ৫৮টিতে শুধু `owner_name` ছিল, বাকি চারটিতে দুই মান একই। পুরোনো report compatibility-এর জন্য field-গুলো রাখা হয়েছে।
- Deed verification API এখন deed number, registration year, seller, buyer, division, district, upazila/thana, mouza, dag/plot ও khatian-এর field check দেয়। Seller, buyer এবং properties record-এ থাকা current recorded owner আলাদা করে দেখানো হয়। Seller record অনুপস্থিত থাকলে `Seller Record Unavailable` দেখায়। Union/ward optional; না দিলে score থেকে বাদ যায়।
- Field status, বাংলা/ইংরেজি explanation, source table ও evidence reference রিপোর্টে সংরক্ষিত হয়। Required তুলনার source অনুপস্থিত বা user value অনুপস্থিত হলে match percentage দেখানো হয় না। Score শুধু exact matched required field ÷ eligible required field দিয়ে হয়; name similarity আলাদা signal, মালিকানা বা পরিচয়ের প্রমাণ নয়।
- Result dashboard-এর overall, field-by-field ও category summaries একই API field-check data থেকে তৈরি হয়। অনুপস্থিত report-কে আর সবুজ match হিসেবে দেখানো হয় না। Ownership history source না থাকায় কোনো timeline বানানো হয় না; report-এ তা unavailable বলা হয়। QR code সংরক্ষিত report reference দেয়, certificate নয়।
- District, Upazila/Thana ও Union suggestion-এ একই item-এর Bengali/English alias থেকে তৈরি হওয়া repeated option বাদ দেওয়া হয়েছে। একই নাম ভিন্ন code-এর হলে suggestion-এ code দেখায়; database-এর location row মুছে বা merge করা হয়নি।
- `/health` process liveness এবং `/ready` database readiness আলাদা করে। Request log-এ request ID, method, path, status ও duration থাকে; request body বা deed text log হয় না।
- এই কাজের পর backend Python compile এবং frontend Vite production build সফল হয়েছে। এই turn-এ automated test suite চালানো হয়নি; live database-এ schema/data পরিবর্তনও করা হয়নি।

### Deed type field on deed records (৫ নভেম্বর ২০২৬)

- `deeds.deed_type` নামে nullable `TEXT` column যোগ করা হয়েছে; deed record/API ও advanced search-এ সংরক্ষিত deed type ব্যবহার করা যায়।
- Live schema check-এ column উপস্থিত পাওয়া গেছে। বর্তমান ১০টি deed row-এর কোনোটিতেই type value নেই; উৎস থেকে নিশ্চিত না হওয়া পর্যন্ত পুরোনো row-গুলো ফাঁকা থাকবে, কোনো type অনুমান করে backfill করা হয়নি।
- `backend/migrations/20261105_deed_type_on_deeds.sql` একই column নিরাপদে যোগ করার idempotent migration।

### Phase 4 — C++ core engine (৫ নভেম্বর ২০২৬)

- C++ name matching এখন strict UTF-8 codepoint Levenshtein ব্যবহার করে; Python bridge NFC, whitespace, ASCII case ও বাংলা অঙ্ক normalization করে। ফাঁকা নাম `0` match পায়। Similarity identity বা মালিকানার প্রমাণ নয়।
- Ownership graph parcel-scoped: `parcel_id`, অথবা district–upazila–mouza–plot-এর সম্পূর্ণ key না থাকলে transfer-কে unscoped রেখে cycle/double-sale/rapid-transfer anomaly বানায় না। Cycle ও সম্ভাব্য duplicate sale evidence reference-সহ observation হিসেবে আসে; arbitrary `fraud_risk_score` আর তৈরি হয় না।
- Rapid transfer-এর জন্য valid Gregorian `YYYY-MM-DD` এবং configurable day window (default 30, সর্বোচ্চ 3650) ব্যবহৃত হয়। কেবল আগের ক্রেতা পরের বিক্রেতা হলে ধারাবাহিক handoff ধরা হয়; anomaly fraud-এর প্রমাণ নয়।
- C++ JSON parser malformed input, invalid Unicode escape, অতিরিক্ত nesting ও বড় payload reject করে। Owned output সবসময় `bhumi_free_string()` দিয়ে মুক্ত হয়। Search এখন সঠিকভাবে `Linear JSON scan O(N)` জানায় এবং কেবল plot, khatian, deed ও mouza field দেখে।
- Python fallback একই matching ও graph result shape রাখে। `/api/benchmark` এখন একই normalized fuzzy workload-এর median timing/checksum তুলনা করে; host-specific ফল capacity claim নয়।
- MinGW-w64 GCC 14.2 দিয়ে x64 static `libbhumisathi_v3.dll` build করা হয়েছে। Windows-এ পুরোনো `libbhumisathi.dll` locked থাকায় সেটি overwrite করা হয়নি; bridge নতুন backend process-এ v3-কে আগে load করবে, পুরোনো binary fallback/rollback হিসেবে থাকবে।
- Native ও Python fallback—দুই run-এই C++ core-এর ১০টি test pass করেছে; ৩টি API integration test Phase 5-এর জন্য deselect ছিল। Native score-checksum parity pass করেছে।
- একই ২০,০০০-call fuzzy workload, পাঁচ run-এর median: আগের DLL 69.57 ms, v3 51.55 ms, Python fallback 1,810.18 ms। এই local sample-এ v3 আগের DLL-এর চেয়ে প্রায় 1.35× দ্রুত এবং fallback-এর চেয়ে প্রায় 35× দ্রুত ছিল।
- Phase 4 শেষে due-diligence graph input-এ parcel scope না থাকায় C++ graph কোনো history analysis করত না; Phase 5-এ exact parcel scope ও evidence reference যুক্ত হয়েছে।

### Phase 5 — verification API ও parcel graph integration (৫ নভেম্বর ২০২৬)

- Deed verification এখন একই জেলা–উপজেলা–মৌজা–দাগের application `deeds` row থেকে সর্বোচ্চ ১০০টি recorded transfer নিয়ে ownership history তৈরি করে। উৎস-সীমাবদ্ধ বলে history সবসময় `complete: false`; matching deed না থাকলে unrelated plot history জোড়া হয় না।
- Seller ও buyer-এর submitted/recorded comparison-এ status, similarity, source, evidence reference ও engine method ফেরত যায়। Name similarity পরিচয় বা আইনগত মালিকানা নিশ্চিত করে না।
- C++ graph-এ সম্পূর্ণ parcel scope ও `deeds:<id>` evidence reference পাঠানো হয়। Graph anomaly এখন result ও persisted `extracted_data`-তে structured evidence-সহ আসে; arbitrary fraud score বা কৃত্রিম proposed-buyer transfer তৈরি হয় না।
- Due diligence graph-ও exact parcel-scoped deeds ব্যবহার করে। Graph anomaly review indicator হিসেবে ০ risk point পায়; existing weighted rules-এ C++ result থেকে fixed ৪৫ point যোগ হয় না। Full graph output report row-তে সংরক্ষিত হয় এবং report retrieval-এ ফেরত আসে।
- Due diligence-এর পুরোনো unscoped `records` plot history বাদ দিয়ে একই scoped `deeds` rows-কে history ও graph analysis-এ ব্যবহার করা হয়; অন্য এলাকার একই dag-এর record দিয়ে chain mismatch তৈরি হয় না।
- `due_diligence_reports.cpp_graph_analysis` nullable column-এর idempotent migration যোগ হয়েছে। Development initialization অনুপস্থিত column যোগ করে; production-এ migration স্বয়ংক্রিয়ভাবে চলে না এবং approval ছাড়া apply করা হয়নি। পুরোনো report backfill হয় না।

### Phase 6 — verification result dashboard

- Verification result page-এ status summary, backend-এর valid match score ও required-field coverage, status doughnut, field-status এবং category chart একই field-check dataset থেকে দেখানো হয়। Optional omitted Union score denominator-এ ঢোকে না।
- Field comparison responsive cards-এ submitted/recorded values, source, status, name similarity ও evidence reference দেখায়। Seller required field হিসেবে চিহ্নিত; Seller বনাম recorded current owner-এর আলাদা backend comparison দেখানো হয়। Name similarity পরিচয় বা title proof নয়।
- Timeline কেবল evidence reference-সহ application deed history থাকলে আসে; না থাকলে timeline বানানো হয় না। Partial history-কে complete title search বলা হয় না। Bengali/English label এবং browser print/PDF flow রাখা হয়েছে।

### Phase 7 — scalability review

- Existing PostgreSQL pool, lookup indexes, bounded admin pagination, deed-search pagination/rate guard পর্যালোচনা করা হয়েছে। OCR CPU work async event loop block না করতে thread pool-এ offload হয়েছে.
- Configured database endpoint এই run-এ connect হয়নি; তাই live `EXPLAIN ANALYZE`, latency, row count, index-use, throughput, p95/p99, restore drills মাপা যায়নি। Evidence ছাড়া Redis, replica, Kafka, OpenSearch, Kubernetes বা sharding যোগ করা হয়নি।

### Phase 8 — security and production readiness

- Production-এ JWT secret কমপক্ষে ৩২ byte, HTTPS-only explicit CORS origin এবং production-only security headers যাচাই হয়; API response cache হয় না এবং docs/OpenAPI বন্ধ থাকে। Access-controlled report routes আগের authorization checks বজায় রাখে।
- Login/registration ও recovery limits-এর সঙ্গে authenticated OCR/profile upload-এর process-local limit আছে; OCR upload ১০ MB, profile image ৫ MB, এবং OCR worker thread-এ চলে। Error response generic; request logs-এ body, token, NID বা deed text লেখা হয় না।
- User/API response-এ NID mask করা হয়েছে; frontend preset-এ hardcoded full NID সরানো হয়েছে। Production account recovery delivery provider না থাকা পর্যন্ত বন্ধ।
- `PRODUCTION_READINESS.md` backup/isolated restore, migration approval, deployment sizing ও rollback steps দেয়। Live database backup, restore বা migration এই কাজের অংশ হিসেবে চালানো হয়নি।
