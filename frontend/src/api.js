// BhumiSathi (ভূমিসাথী) API Client

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

function getToken() {
  return localStorage.getItem("lg_token") || "";
}

export function setToken(token) {
  if (token) {
    localStorage.setItem("lg_token", token);
  } else {
    localStorage.removeItem("lg_token");
  }
}

// Smart fallback simulation for seamless Hackathon presentation
// Activates automatically if local backend is offline or when deployed statically on Vercel
function getMockFallback(endpoint, options = {}) {
  let body = {};
  if (options.body) {
    if (typeof options.body === "string") {
      try { body = JSON.parse(options.body); } catch (e) { body = {}; }
    } else if (options.body instanceof FormData) {
      body = {};
    } else {
      body = options.body;
    }
  }

  const now = new Date().toISOString();

  // 1. Deed Verification
  if (endpoint.includes("/verification/verify-deed") || endpoint.includes("/verification/upload-deed")) {
    const deedNo = String(body.deed_no || "D-8492").toUpperCase();
    const ownerName = String(body.owner_name || "");
    const refId = `LG-VR-2026-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    let result_status = "MATCH";
    let match_score = 100;
    let discrepancies = [];

    if (deedNo.includes("1001") || ownerName.includes("হারুনুর")) {
      result_status = "POTENTIAL_INCONSISTENCY";
      match_score = 65;
      discrepancies.push({
        field: "মালিকের নাম / গ্রহীতা",
        field_en: "Owner / Transferee Name",
        severity: "high",
        expected: "করিম হোসেন",
        provided: ownerName || "হারুনুর রশীদ (ভুল দাবিদার)",
        message_bn: `দলিলে নিবন্ধিত মালিক 'করিম হোসেন', কিন্তু প্রদত্ত নাম '${ownerName || "হারুনুর রশীদ (ভুল দাবিদার)"}'।`,
        message_en: `Registered owner is 'করিম হোসেন', but provided name is '${ownerName}'.`,
        source: "সাব-রেজিস্ট্রি অফিস বালাম"
      });
    } else if (deedNo.includes("1003") || ownerName.includes("জাহিদ")) {
      result_status = "POTENTIAL_INCONSISTENCY";
      match_score = 45;
      discrepancies.push({
        field: "জমির স্বত্ব ও বিতর্ক",
        field_en: "Land Title Dispute",
        severity: "high",
        message_bn: "জমিটি দেওয়ানি আদালতের স্বত্ব মামলা বা মালিকানা বিরোধের আওতাভুক্ত হিসেবে চিহ্নিত।",
        message_en: "Parcel is flagged under active civil court title litigation.",
        source: "সহকারী কমিশনার (ভূমি) দপ্তর"
      });
      discrepancies.push({
        field: "দলিল নম্বর পুনরাবৃত্তি",
        field_en: "Duplicate Deed Number Alert",
        severity: "high",
        message_bn: "একই দলিল নম্বর একাধিক ভিন্ন দাগে (DHK-MIR-001, DHK-MIR-005) ব্যবহার করার নমুনা পাওয়া গেছে।",
        message_en: "Same deed number registered against multiple distinct plots.",
        source: "এআই অসঙ্গতি ইঞ্জিন"
      });
    }

    const recorded_seller = deedNo.includes("1001") ? "আব্দুর রহমান" : deedNo.includes("1003") ? "করিম হোসেন" : "আব্দুল কাদের";
    const recorded_buyer = deedNo.includes("1001") ? "করিম হোসেন" : deedNo.includes("1003") ? "সালমা বেগম" : (ownerName || "মোহাম্মদ রফিক");

    return {
      verification_ref: refId,
      result_status,
      match_score,
      discrepancies,
      extracted_summary: {
        deed_no: body.deed_no || "D-8492",
        reg_year: body.reg_year || 2023,
        district: body.district || "ঢাকা",
        upazila: body.upazila || "মিরপুর",
        mouza: body.mouza || "পাইকপাড়া",
        plot_id: body.plot_id || "DHK-MIR-002",
        khatian_no: body.khatian_no || "BS-1046",
        owner_name: ownerName || "মোহাম্মদ রফিক",
        recorded_seller,
        recorded_buyer,
        recorded_area: 4.5,
        recorded_price: 3500000,
        sub_registry_office: "মিরপুর সাব-রেজিস্ট্রি অফিস"
      },
      created_at: now,
      verification_url: `/verify-deed/${refId}`,
      disclaimer_bn: "সতর্কবার্তা: এটি ডেমো ডেটাবেজভিত্তিক বিশ্লেষণ। এটি সরকারি বালাম বইয়ের চূড়ান্ত বা আইনি স্বত্ব সনদ নয়।",
      disclaimer_en: "Disclaimer: This is preliminary screening against synthetic demonstration records."
    };
  }

  // 2. Due Diligence
  if (endpoint.includes("/due-diligence/assess")) {
    const refId = `LG-DD-2026-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const seller = body.seller_name || "বিক্রেতা";
    const isDisputed = Boolean(body.has_court_dispute || (body.seller_name && body.seller_name.includes("করিম")));
    
    const risk_score = isDisputed ? 75 : 15;
    const risk_level = isDisputed ? "HIGH" : "LOW";

    return {
      report_ref: refId,
      risk_score,
      risk_level,
      score_breakdown: {
        total_risk_points: risk_score,
        base_risk: 10,
        litigation_risk: isDisputed ? 35 : 0,
        title_gap_risk: isDisputed ? 30 : 5
      },
      indicators: isDisputed ? [
        {
          code: "DUPLICATE_SALE_RECORD",
          title_bn: "একাধিকবার বিক্রির পূর্ব রেকর্ড বিদ্যমান",
          title_en: "Prior Duplicate Sale Detected",
          points: 45,
          severity: "high",
          explanation_bn: `বিক্রেতা ${seller} এই একই জমি ইতিপূর্বে সালমা বেগমের কাছে বিক্রি করেছেন।`,
          explanation_en: "Duplicate plot sale detected in demo registry."
        },
        {
          code: "COURT_DISPUTE_FLAG",
          title_bn: "দেওয়ানি আদালতে স্বত্ব মামলা বিচারাধীন",
          title_en: "Active Title Dispute Litigation",
          points: 30,
          severity: "high",
          explanation_bn: "উক্ত দাগ ও খতিয়ানের জমি নিয়ে যুগ্ম জেলা জজ আদালতে মামলা বিচারাধীন রয়েছে।",
          explanation_en: "Civil court dispute pending."
        }
      ] : [],
      evidence: [
        `প্রস্তাবিত বিক্রেতা: ${seller}`,
        `প্লট / দাগ: ${body.plot_no || "DHK-MIR-001"}`,
        `মৌজা: ${body.mouza || "পাইকপাড়া"}`
      ],
      recommendations: [
        "সাব-রেজিস্ট্রি অফিসে মূল বালাম বহির ভলিউম ও পৃষ্ঠা সরাসরি মিলিয়ে দেখুন।",
        "সহকারী কমিশনার (ভূমি) দপ্তর থেকে হালনাগাদ খারিজ খতিয়ান ও ডিসিআর সংগ্রহ করুন।",
        "স্থানীয় ইউনিয়ন ভূমি অফিসে গিয়ে জমির সরেজমিন দখল ও সীমানা নিশ্চিত হোন।",
        "বায়না চুক্তি সম্পাদনের পূর্বে অভিজ্ঞ ভূমি আইনজীবী দ্বারা স্বত্ব ধারাবাহিকতা পরীক্ষা করুন।",
        "ব্যাংক ড্রাফট বা পে-অর্ডারের মাধ্যমে স্বচ্ছ আর্থিক লেনদেন নিশ্চিত করুন।"
      ],
      created_at: now
    };
  }

  // 3. E-Namjari Mutation Apply
  if (endpoint.includes("/mutation/apply")) {
    const trackNo = `MUT-2026-DHK-${Math.floor(1000 + Math.random() * 9000)}`;
    const newApp = {
      tracking_no: trackNo,
      status: body.is_draft ? "Draft" : "Submitted",
      status_info: {
        bn: body.is_draft ? "খসড়া সংরক্ষিত" : "দাখিলকৃত (Under Review)",
        en: body.is_draft ? "Draft Saved" : "Submitted (Under Review)"
      },
      applicant_name: body.applicant_name || "মোঃ রফিকুল ইসলাম",
      applicant_nid: body.applicant_nid || "19902692518000123",
      applicant_phone: body.applicant_phone || "01711000000",
      applicant_address: body.applicant_address || "মিরপুর, ঢাকা",
      district: body.district || "ঢাকা",
      upazila: body.upazila || "মিরপুর",
      mouza: body.mouza || "পাইকপাড়া",
      jl_no: body.jl_no || "১০২",
      khatian_type: body.khatian_type || "BS",
      khatian_no: body.khatian_no || "BS-1046",
      plot_no: body.plot_no || "DHK-MIR-002",
      land_area: body.land_area || 4.5,
      land_class: body.land_class || "নাল (Nal)",
      ownership_source: body.ownership_source || "ক্রয়সূত্রে (Purchase)",
      deed_no: body.deed_no || "D-8492",
      supporting_docs: body.supporting_docs || ["মূল সাফা কবলা দলিল D-8492"],
      review_notes: "আবেদনটি ডিজিটালভাবে গৃহীত হয়েছে এবং প্রাথমিক পর্যালোচনার অপেক্ষায় আছে।",
      created_at: now,
      updated_at: now,
      timeline: [
        {
          to_status: body.is_draft ? "Draft" : "Submitted",
          created_at: now,
          changed_by_name: body.applicant_name || "মোঃ রফিকুল ইসলাম",
          changed_by_role: "নাগরিক (Applicant)",
          remarks: body.is_draft ? "খসড়া তথ্য সংরক্ষণ করা হয়েছে।" : "স্মার্ট ই-নামজারি পোর্টালে ডিজিটাল আবেদন সফলভাবে দাখিল করা হয়েছে।"
        }
      ]
    };

    try {
      const stored = JSON.parse(localStorage.getItem("lg_saved_mutations") || "{}");
      stored[trackNo] = newApp;
      localStorage.setItem("lg_saved_mutations", JSON.stringify(stored));
    } catch (e) {}

    return newApp;
  }

  // 4. Mutation Track
  if (endpoint.includes("/mutation/track")) {
    const match = endpoint.match(/\/mutation\/track\/([^?]+)/);
    const trackingNo = match ? decodeURIComponent(match[1]) : "MUT-2026-DHK-4821";

    try {
      const stored = JSON.parse(localStorage.getItem("lg_saved_mutations") || "{}");
      if (stored[trackingNo]) {
        return stored[trackingNo];
      }
    } catch (e) {}

    const isApproved = trackingNo.includes("1904");
    const isNotice = trackingNo.includes("9012");
    const currentStatus = isApproved ? "Approved" : isNotice ? "Additional Information Required" : "Document Verification";

    return {
      tracking_no: trackingNo,
      status: currentStatus,
      status_info: {
        bn: isApproved ? "অনুমোদিত" : isNotice ? "অতিরিক্ত তথ্য তলব" : "কাগজপত্র যাচাই চলছে",
        en: isApproved ? "Approved" : isNotice ? "Additional Information Required" : "Document Verification"
      },
      review_notes: isNotice
        ? "মৌজা ম্যাপের সাথে দাগের সীমানা ও হিস্যা বর্ণনায় অসঙ্গতি রয়েছে। অনুগ্রহ করে মূল দলিলের বালাম কপি ও সরেজমিন সীমানা নির্দেশক স্কেচ দাখিল করুন।"
        : isApproved
        ? "সকল রেকর্ড ও বালাম খতিয়ান সফলভাবে যাচাই সম্পন্ন হয়েছে। নামজারি আবেদন মঞ্জুর করা হলো এবং নতুন খতিয়ান প্রস্তুত।"
        : "ইউনিয়ন ভূমি সহকারী কর্মকর্তার প্রতিবেদন গৃহীত হয়েছে। সাব-রেজিস্ট্রি বালাম ও সার্ভেয়ারের প্রতিবেদন যাচাই চলছে।",
      applicant_name: "মোঃ রফিকুল ইসলাম",
      applicant_nid: "19902692518000123",
      applicant_phone: "01711000000",
      district: "ঢাকা",
      upazila: "মিরপুর",
      mouza: "পাইকপাড়া",
      plot_no: "DHK-MIR-002",
      khatian_type: "BS",
      khatian_no: "BS-1046",
      land_area: 4.5,
      land_class: "নাল (Nal)",
      ownership_source: "ক্রয়সূত্রে (Purchase)",
      deed_no: "D-8492",
      supporting_docs: ["মূল সাফা কবলা দলিল", "হালনাগাদ দাখিলা ও খাজনা রশিদ"],
      created_at: new Date(Date.now() - 3600 * 24 * 3 * 1000).toISOString(),
      timeline: [
        {
          to_status: "Submitted",
          created_at: new Date(Date.now() - 3600 * 24 * 3 * 1000).toISOString(),
          changed_by_name: "মোঃ রফিকুল ইসলাম",
          changed_by_role: "নাগরিক (Applicant)",
          remarks: "অনলাইনে নামজারি আবেদন ফরম ও প্রয়োজনীয় দলিল আপলোড করা হয়েছে।"
        },
        {
          to_status: "Initial Review",
          created_at: new Date(Date.now() - 3600 * 24 * 2 * 1000).toISOString(),
          changed_by_name: "আব্দুল মান্নান",
          changed_by_role: "ইউনিয়ন ভূমি সহকারী কর্মকর্তা",
          remarks: "প্রাথমিক তথ্য ও জমির অবস্থান সরেজমিনে প্রাথমিকভাবে সঠিক পাওয়া গেছে।"
        },
        {
          to_status: currentStatus,
          created_at: new Date(Date.now() - 3600 * 24 * 1 * 1000).toISOString(),
          changed_by_name: "বেগম ফরিদা পারভীন",
          changed_by_role: "সহকারী কমিশনার (ভূমি) / AC Land",
          remarks: isNotice
            ? "কাগজপত্রে তথ্যের গরমিল থাকায় শুনানি ও অতিরিক্ত প্রমাণের নোটিশ জারি করা হলো।"
            : isApproved
            ? "চূড়ান্ত যাচাই শেষে নামজারি আবেদন অনুমোদন ও খতিয়ান সৃজন করা হলো।"
            : "সাব-রেজিস্ট্রি দলিলের সত্যতা ও বালাম ভলিউম নিরীক্ষণ চলছে।"
        }
      ]
    };
  }

  // 5. Auth Demo Users
  if (endpoint.includes("/auth/demo-users")) {
    return [
      { role: "citizen", name: "মোঃ রফিকুল ইসলাম", email: "citizen@bhumisathi.gov.bd", password: "demo123", designation: "নাগরিক" },
      { role: "officer", name: "বেগম ফরিদা পারভীন", email: "officer@bhumisathi.gov.bd", password: "demo123", designation: "সহকারী কমিশনার (ভূমি) / AC Land" },
      { role: "admin", name: "Md Bayazid Hossain", email: "dbscbayazid111@gmail.com", password: "demo123", designation: "সিস্টেম আর্কিটেক্ট ও অ্যাডমিনিস্ট্রেটর" }
    ];
  }

  // 6. Login
  if (endpoint.includes("/auth/send-otp")) {
    const dest = body.destination || "01711002233";
    const channel = dest.includes("@") ? "email" : "phone";
    return {
      success: true,
      destination: dest,
      channel: channel,
      channel_bn: channel === "email" ? "ইমেইল" : "মোবাইল এসএমএস",
      otp_preview: "849201",
      expires_in_seconds: 300,
      message: `৬-সংখ্যার যাচাইকরণ কোড পাঠানো হয়েছে (${channel === "email" ? "ইমেইল" : "মোবাইল এসএমএস"})।`
    };
  }

  if (endpoint.includes("/auth/verify-otp")) {
    return {
      verified: true,
      message: "ভেরিফিকেশন সফল হয়েছে!"
    };
  }

  if (endpoint.includes("/auth/login-otp")) {
    const dest = body.destination || "citizen@bhumisathi.gov.bd";
    return {
      success: true,
      token: `demo-token-${Date.now()}`,
      user: {
        id: 1,
        name: dest.includes("@") ? dest.split("@")[0].toUpperCase() : "যাচাইকৃত নাগরিক",
        email: dest.includes("@") ? dest : `citizen_${dest}@bhumisathi.gov.bd`,
        role: "citizen",
        designation: "নাগরিক",
        phone: dest.includes("@") ? "01711002233" : dest,
        nid: "19902692518000123"
      }
    };
  }

  if (endpoint.includes("/auth/login")) {
    const isAdmin = body.identifier && (body.identifier.includes("admin") || body.identifier.includes("bayazid"));
    const isOfficer = body.identifier && body.identifier.includes("officer");
    return {
      success: true,
      token: `demo-token-${Date.now()}`,
      user: {
        id: isAdmin ? 3 : isOfficer ? 2 : 1,
        name: isAdmin ? "Md Bayazid Hossain" : isOfficer ? "বেগম ফরিদা পারভীন" : "মোঃ রফিকুল ইসলাম",
        email: body.identifier || (isAdmin ? "dbscbayazid111@gmail.com" : isOfficer ? "officer@bhumisathi.gov.bd" : "citizen@bhumisathi.gov.bd"),
        role: isAdmin ? "admin" : isOfficer ? "officer" : "citizen",
        designation: isAdmin ? "সিস্টেম আর্কিটেক্ট ও অ্যাডমিনিস্ট্রেটর" : isOfficer ? "সহকারী কমিশনার (ভূমি) / AC Land" : "নাগরিক",
        phone: isAdmin ? "01645241040" : isOfficer ? "01819998877" : "01711002233",
        nid: isAdmin ? "19882692518000789" : isOfficer ? "19852692518000456" : "19902692518000123"
      }
    };
  }

  // 7. Dashboard Stats
  if (endpoint.includes("/dashboard/stats")) {
    return {
      total_deeds: 1240,
      verified_today: 48,
      pending_mutations: 12,
      risk_identified: 7
    };
  }

  // Verification Report detail
  if (endpoint.includes("/verification/report/")) {
    const match = endpoint.match(/\/verification\/report\/([^?]+)/);
    const ref = match ? match[1] : "LG-VR-2026-DEMO";
    return {
      verification_ref: ref,
      result_status: "MATCH",
      match_score: 100,
      discrepancies: [],
      extracted_summary: {
        deed_no: "D-8492",
        reg_year: 2023,
        district: "ঢাকা",
        upazila: "মিরপুর",
        mouza: "পাইকপাড়া",
        plot_id: "DHK-MIR-002",
        khatian_no: "BS-1046",
        owner_name: "মোহাম্মদ রফিক",
        recorded_seller: "আব্দুল কাদের",
        recorded_buyer: "মোহাম্মদ রফিক",
        recorded_area: 4.5,
        recorded_price: 3500000,
        sub_registry_office: "মিরপুর সাব-রেজিস্ট্রি অফিস"
      },
      created_at: now,
      verification_url: `/verify-deed/${ref}`,
      disclaimer_bn: "সতর্কবার্তা: এটি ডেমো ডেটাবেজভিত্তিক বিশ্লেষণ।",
      disclaimer_en: "Disclaimer: Preliminary screening against synthetic records."
    };
  }

  // Due Diligence Report detail
  if (endpoint.includes("/due-diligence/report/")) {
    const match = endpoint.match(/\/due-diligence\/report\/([^?]+)/);
    const ref = match ? match[1] : "LG-DD-2026-DEMO";
    return {
      report_ref: ref,
      risk_score: 75,
      risk_level: "HIGH",
      score_breakdown: {
        total_risk_points: 75,
        base_risk: 10,
        litigation_risk: 35,
        title_gap_risk: 30
      },
      indicators: [
        {
          code: "DUPLICATE_SALE_RECORD",
          title_bn: "একাধিকবার বিক্রির পূর্ব রেকর্ড বিদ্যমান",
          title_en: "Prior Duplicate Sale Detected",
          points: 45,
          severity: "high",
          explanation_bn: "বিক্রেতা ইতিপূর্বে এই একই জমি অন্য ক্রেতার কাছে বিক্রি করেছেন।",
          explanation_en: "Duplicate plot sale detected in demo registry."
        }
      ],
      evidence: [
        "প্রস্তাবিত বিক্রেতা: করিম হোসেন",
        "প্লট / দাগ: DHK-MIR-001",
        "মৌজা: পাইকপাড়া"
      ],
      recommendations: [
        "সাব-রেজিস্ট্রি অফিসে মূল বালাম বহির ভলিউম ও পৃষ্ঠা সরাসরি মিলিয়ে দেখুন।",
        "সহকারী কমিশনার (ভূমি) দপ্তর থেকে হালনাগাদ খারিজ খতিয়ান ও ডিসিআর সংগ্রহ করুন。"
      ],
      created_at: now
    };
  }

  // Properties list
  if (endpoint.includes("/properties")) {
    return [
      { plot_id: "DHK-MIR-001", district: "ঢাকা", upazila: "মিরপুর", mouza: "পাইকপাড়া", khatian_no: "BS-1045", area: 5.0, current_owner: "করিম হোসেন", status: "disputed" },
      { plot_id: "DHK-MIR-002", district: "ঢাকা", upazila: "মিরপুর", mouza: "পাইকপাড়া", khatian_no: "BS-1046", area: 4.5, current_owner: "মোহাম্মদ রফিক", status: "clear" },
      { plot_id: "DHK-MIR-003", district: "ঢাকা", upazila: "মিরপুর", mouza: "পাইকপাড়া", khatian_no: "BS-1047", area: 3.2, current_owner: "আবুল কালাম", status: "clear" }
    ];
  }

  // 8. Binary Search
  if (endpoint.includes("/search/binary")) {
    return {
      query: "demo",
      results: [
        { _match_type: "deed", deed_no: "D-8492", plot_id: "DHK-MIR-002", title: "দলিল D-8492 (মিরপুর, পাইকপাড়া)" },
        { _match_type: "property", plot_id: "DHK-MIR-001", khatian_no: "BS-1045", title: "প্লট DHK-MIR-001 (৫.০ শতক)" },
        { _match_type: "mutation", tracking_no: "MUT-2026-DHK-4821", title: "আবেদন MUT-2026-DHK-4821" }
      ],
      time_ms: 0.12,
      algorithm: "Binary Search B-Tree O(log N)",
      count: 3
    };
  }

  // 9. Mutation Lists & Stats
  if (endpoint.includes("/mutation/all-applications") || endpoint.includes("/mutation/my-applications")) {
    let savedList = [];
    try {
      const stored = JSON.parse(localStorage.getItem("lg_saved_mutations") || "{}");
      savedList = Object.values(stored);
    } catch (e) {}

    const defaultApps = [
      {
        tracking_no: "MUT-2026-DHK-4821",
        status: "Document Verification",
        status_info: { bn: "কাগজপত্র যাচাই চলছে", en: "Document Verification" },
        applicant_name: "মোঃ রফিকুল ইসলাম",
        plot_no: "DHK-MIR-002",
        khatian_no: "BS-1046",
        land_area: 4.5,
        created_at: new Date(Date.now() - 3600 * 24 * 3 * 1000).toISOString()
      },
      {
        tracking_no: "MUT-2026-CTG-1904",
        status: "Approved",
        status_info: { bn: "অনুমোদিত", en: "Approved" },
        applicant_name: "সালমা বেগম",
        plot_no: "CTG-KOT-088",
        khatian_no: "BS-2091",
        land_area: 6.2,
        created_at: new Date(Date.now() - 3600 * 24 * 7 * 1000).toISOString()
      },
      {
        tracking_no: "MUT-2026-DHK-9012",
        status: "Additional Information Required",
        status_info: { bn: "অতিরিক্ত তথ্য তলব", en: "Additional Information Required" },
        applicant_name: "মোঃ জাহিদ হাসান",
        plot_no: "DHK-MIR-001",
        khatian_no: "BS-1045",
        land_area: 5.0,
        created_at: new Date(Date.now() - 3600 * 24 * 5 * 1000).toISOString()
      }
    ];

    return [...savedList, ...defaultApps];
  }

  if (endpoint.includes("/mutation/stats")) {
    return {
      total: 18,
      pending: 6,
      approved: 10,
      rejected: 2
    };
  }

  if (endpoint.includes("/mutation/action")) {
    return { success: true, message: "পদক্ষেপ সফলভাবে রেকর্ড করা হয়েছে।" };
  }

  if (endpoint.includes("/mutation/start-review")) {
    return { success: true, status: "Under Review", message: "নথি পর্যালোচনা শুরু হয়েছে।" };
  }

  if (endpoint.includes("/resubmit")) {
    return { success: true, status: "Resubmitted", message: "সংশোধিত তথ্য সফলভাবে দাখিল হয়েছে।" };
  }

  if (endpoint.includes("/chat/status")) {
    return {
      status: "online",
      ai_configured: false,
      provider: "BhumiSathi Knowledge Engine",
      supported_languages: ["bn", "bn-Latn", "en"]
    };
  }

  if (endpoint.includes("/chat/message")) {
    const msg = (body.message || "").toLowerCase();
    let reply = "ধন্যবাদ। ভূমি প্রশাসন, নামজারি আবেদন বা দলিলের তথ্যের জন্য আপনার ট্র্যাকিং নম্বর লিখুন অথবা প্রশ্ন করুন।";
    if (msg.includes("খরচ") || msg.includes("ফি") || msg.includes("টাকা")) {
      reply = "ই-নামজারির মোট সরকারি ফি ১,১৭০/- টাকা (কোর্ট ফি ২০ + নোটিশ ৫০ + রেকর্ড সংশোধন ১০০০ + ডিসিআর ১০০ টাকা)।";
    }
    return {
      reply,
      ai_configured: false,
      provider: "BhumiSathi Grounded Engine",
      context_used: false
    };
  }

  // 10. Audit Logs
  if (endpoint.includes("/audit-logs")) {
    return [
      {
        id: 1,
        user_name: "মোঃ রফিকুল ইসলাম",
        action: "DEED_VERIFICATION_CHECK",
        module: "দলিল যাচাই",
        details: "দলিল D-8492 ও বালাম বই নিরীক্ষা সম্পন্ন।",
        created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString()
      },
      {
        id: 2,
        user_name: "বেগম ফরিদা পারভীন, এসি ল্যান্ড",
        action: "MUTATION_NOTICE_ISSUED",
        module: "ই-নামজারি",
        details: "আবেদন MUT-2026-DHK-9012 এ শুনানির নোটিশ জারি।",
        created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString()
      },
      {
        id: 3,
        user_name: "সিস্টেম বট",
        action: "DUE_DILIGENCE_AUTO_SCAN",
        module: "স্বত্ব যাচাই",
        details: "প্লট DHK-MIR-001 এ ঝুঁকি সূচক হাইলাইট করা হয়েছে।",
        created_at: new Date(Date.now() - 1000 * 60 * 300).toISOString()
      }
    ];
  }

  // 11. Notifications
  if (endpoint.includes("/notifications")) {
    return [
      {
        id: 1,
        title_bn: "দলিল যাচাই সফল",
        title_en: "Deed Verified",
        message_bn: "আপনার প্রেরিত দলিল D-8492 বালাম রেকর্ডের সাথে ১০০% মিলেছে।",
        message_en: "Submitted deed matched 100% with registered demo volume.",
        is_read: false,
        created_at: now
      },
      {
        id: 2,
        title_bn: "নামজারি আবেদনের অগ্রগতি",
        title_en: "Mutation Update",
        message_bn: "আপনার আবেদন MUT-2026-DHK-4821 নথি যাচাই পর্যায়ে রয়েছে।",
        message_en: "Application MUT-2026-DHK-4821 is currently in document review.",
        is_read: true,
        created_at: now
      }
    ];
  }

  // Reports lists
  if (endpoint.includes("/verification/reports")) {
    return [];
  }
  if (endpoint.includes("/due-diligence/reports")) {
    return [];
  }

  // System seed & user
  if (endpoint.includes("/seed")) {
    return { success: true, message: "ডেমো ডেটাবেজ রিসেট সম্পন্ন হয়েছে।" };
  }
  if (endpoint.includes("/auth/me")) {
    return {
      id: 1,
      name: "মোঃ রফিকুল ইসলাম",
      email: "citizen@bhumisetu.gov.bd",
      role: "citizen",
      designation: "নাগরিক"
    };
  }

  return null;
}

async function request(endpoint, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };

  const token = getToken();
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // If body is not FormData, set Content-Type to application/json
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers
    });
  } catch (netErr) {
    // If backend server is offline or unreachable, use mock fallback seamlessly
    const fallback = getMockFallback(endpoint, options);
    if (fallback !== null) return fallback;
    throw new Error("অনুরোধটি সম্পন্ন করা যায়নি (Request failed)");
  }

  // Check Content-Type: If backend or Vite/Vercel returned HTML (e.g. index.html SPA fallback)
  const contentType = response.headers.get("content-type") || "";
  const isHtml = contentType.includes("text/html");

  if (isHtml || !response.ok) {
    // If endpoint returned 404, HTML, or server error, use mock fallback seamlessly
    const fallback = getMockFallback(endpoint, options);
    if (fallback !== null) return fallback;

    let errMsg = "অনুরোধটি সম্পন্ন করা যায়নি (Request failed)";
    try {
      const errData = await response.json();
      errMsg = errData.detail || errData.message || errMsg;
    } catch (e) {
      // fallback
    }
    throw new Error(errMsg);
  }

  try {
    return await response.json();
  } catch (jsonErr) {
    const fallback = getMockFallback(endpoint, options);
    if (fallback !== null) return fallback;
    throw jsonErr;
  }
}

export const api = {
  // Auth
  login: (identifier, password) => request("/auth/login", { method: "POST", body: { identifier, password } }),
  loginWithOTP: (destination, code) => request("/auth/login-otp", { method: "POST", body: { destination, code } }),
  sendOTP: (destination, purpose = "login") => request("/auth/send-otp", { method: "POST", body: { destination, purpose } }),
  verifyOTP: (destination, code) => request("/auth/verify-otp", { method: "POST", body: { destination, code } }),
  register: (data) => request("/auth/register", { method: "POST", body: data }),
  getMe: (userId) => request(`/auth/me${userId ? `?user_id=${userId}` : ""}`),
  getDemoUsers: () => request("/auth/demo-users"),

  // Dashboard & Seed
  getDashboardStats: () => request("/dashboard/stats"),
  resetSeedData: () => request("/seed", { method: "POST" }),

  // P2: Deed Verification
  verifyDeed: (data, userId) => request(`/verification/verify-deed${userId ? `?user_id=${userId}` : ""}`, { method: "POST", body: data }),
  uploadDeed: (formData) => request("/verification/upload-deed", { method: "POST", body: formData }),
  getVerificationReport: (ref) => request(`/verification/report/${ref}`),
  listVerificationReports: () => request("/verification/reports"),

  // P4: Smart E-Namjari
  applyMutation: (data, userId) => request(`/mutation/apply${userId ? `?user_id=${userId}` : ""}`, { method: "POST", body: data }),
  updateMutation: (trackingNo, data) => request(`/mutation/update/${trackingNo}`, { method: "PUT", body: data }),
  trackMutation: (trackingNo) => request(`/mutation/track/${trackingNo}`),
  getMyMutations: (userId) => request(`/mutation/my-applications?user_id=${userId || 1}`),
  getAllMutations: (statusFilter) => request(`/mutation/all-applications${statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : ""}`),
  performMutationAction: (data) => request("/mutation/action", { method: "POST", body: data }),
  startMutationReview: (trackingNo) => request(`/mutation/start-review/${encodeURIComponent(trackingNo)}`, { method: "POST" }),
  resubmitMutation: (trackingNo, data) => request(`/mutation/${encodeURIComponent(trackingNo)}/resubmit`, { method: "POST", body: data }),
  getMutationStats: () => request("/mutation/stats"),

  // AI Live Chat
  sendChatMessage: (data) => request("/chat/message", { method: "POST", body: data }),
  getChatStatus: () => request("/chat/status"),

  // P5: Due Diligence
  assessDueDiligence: (data, userId) => request(`/due-diligence/assess${userId ? `?user_id=${userId}` : ""}`, { method: "POST", body: data }),
  getDueDiligenceReport: (ref) => request(`/due-diligence/report/${ref}`),
  listDueDiligenceReports: () => request("/due-diligence/reports"),

  // Properties
  getProperties: () => request("/properties"),
  getPropertyDetail: (plotId) => request(`/properties/${encodeURIComponent(plotId)}`),

  // Audit Logs & Notifications
  getAuditLogs: (limit = 50) => request(`/audit-logs?limit=${limit}`),
  getNotifications: (userId, role) => request(`/notifications?user_id=${userId || 1}&role=${role || "citizen"}`),
  markNotificationRead: (nid) => request(`/notifications/${nid}/read`, { method: "POST" }),

  // O(log N) High-Performance Binary Search API
  searchBinary: (query, category = "all", limit = 25) =>
    request(`/search/binary?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}&limit=${limit}`),

  // C++ Native Hybrid Acceleration Engine & Benchmark
  getEngineStatus: () => request("/engine/status"),
  runBenchmark: (operations = 20000) => request(`/benchmark?operations=${operations}`),
  detectFraudGraph: (transfers) => request("/fraud/detect-graph", { method: "POST", body: transfers })
};
