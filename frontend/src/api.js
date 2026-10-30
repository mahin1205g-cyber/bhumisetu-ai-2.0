// Bhumisetu (ভূমিসেতু) API client
// Set VITE_API_URL to your backend API base, e.g. https://your-backend.vercel.app/api

const configuredBaseUrl = import.meta.env.VITE_API_URL || "/api";
const BASE_URL = configuredBaseUrl.replace(/\/+$/, "");

function getToken() {
  try {
    return localStorage.getItem("lg_token") || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    if (token) {
      localStorage.setItem("lg_token", token);
    } else {
      localStorage.removeItem("lg_token");
    }
  } catch (error) {
    console.warn("Unable to access local storage:", error);
  }
}

async function request(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const requestOptions = { ...options, headers };
  const body = options.body;

  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    requestOptions.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, requestOptions);
  } catch (error) {
    throw new Error(
      "Backend-এর সাথে সংযোগ করা যাচ্ছে না। Backend URL, deployment এবং CORS configuration পরীক্ষা করুন।"
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  let responseData = null;

  if (isJson) {
    try {
      responseData = await response.json();
    } catch {
      throw new Error("Backend থেকে সঠিক JSON response পাওয়া যায়নি।");
    }
  } else {
    const responseText = await response.text().catch(() => "");
    if (responseText.trimStart().startsWith("<")) {
      throw new Error(
        `API endpoint-এর বদলে HTML পাওয়া গেছে (${response.status})। VITE_API_URL এবং backend route পরীক্ষা করুন।`
      );
    }
    responseData = responseText ? { detail: responseText } : null;
  }

  if (!response.ok) {
    const detail =
      responseData?.detail ||
      responseData?.message ||
      responseData?.error ||
      `Request failed (${response.status})`;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg || JSON.stringify(item)).join(", ")
      : typeof detail === "string"
        ? detail
        : JSON.stringify(detail);
    throw new Error(message);
  }

  return responseData;
}

const encode = (value) => encodeURIComponent(String(value));

export const api = {
  // Authentication
  login: (identifier, password) =>
    request("/auth/login", {
      method: "POST",
      body: { identifier, password },
    }),

  loginWithOTP: (destination, code) =>
    request("/auth/login-otp", {
      method: "POST",
      body: { destination, code },
    }),

  sendOTP: (destination, purpose = "login") =>
    request("/auth/send-otp", {
      method: "POST",
      body: { destination, purpose },
    }),

  verifyOTP: (destination, code) =>
    request("/auth/verify-otp", {
      method: "POST",
      body: { destination, code },
    }),

  register: (data) =>
    request("/auth/register", {
      method: "POST",
      body: data,
    }),

  getMe: (userId) =>
    request(`/auth/me${userId ? `?user_id=${encode(userId)}` : ""}`),

  getDemoUsers: () => request("/auth/demo-users"),

  // Dashboard and seed
  getDashboardStats: () => request("/dashboard/stats"),

  resetSeedData: () =>
    request("/seed", {
      method: "POST",
    }),

  // P2: Deed verification
  verifyDeed: (data, userId) =>
    request(
      `/verification/verify-deed${userId ? `?user_id=${encode(userId)}` : ""}`,
      {
        method: "POST",
        body: data,
      }
    ),

  uploadDeed: (formData) =>
    request("/verification/upload-deed", {
      method: "POST",
      body: formData,
    }),

  getVerificationReport: (ref) =>
    request(`/verification/report/${encode(ref)}`),

  listVerificationReports: () => request("/verification/reports"),

  // P4: E-Namjari / mutation
  applyMutation: (data, userId) =>
    request(
      `/mutation/apply${userId ? `?user_id=${encode(userId)}` : ""}`,
      {
        method: "POST",
        body: data,
      }
    ),

  updateMutation: (trackingNo, data) =>
    request(`/mutation/update/${encode(trackingNo)}`, {
      method: "PUT",
      body: data,
    }),

  trackMutation: (trackingNo) =>
    request(`/mutation/track/${encode(trackingNo)}`),

  getMyMutations: (userId) =>
    request(`/mutation/my-applications?user_id=${encode(userId || 1)}`),

  getAllMutations: (statusFilter) =>
    request(
      `/mutation/all-applications${
        statusFilter ? `?status_filter=${encode(statusFilter)}` : ""
      }`
    ),

  performMutationAction: (data) =>
    request("/mutation/action", {
      method: "POST",
      body: data,
    }),

  startMutationReview: (trackingNo) =>
    request(`/mutation/start-review/${encode(trackingNo)}`, {
      method: "POST",
    }),

  resubmitMutation: (trackingNo, data) =>
    request(`/mutation/${encode(trackingNo)}/resubmit`, {
      method: "POST",
      body: data,
    }),

  getMutationStats: () => request("/mutation/stats"),

  // AI chat
  sendChatMessage: (data) =>
    request("/chat/message", {
      method: "POST",
      body: data,
    }),

  getChatStatus: () => request("/chat/status"),

  // P5: Due diligence
  assessDueDiligence: (data, userId) =>
    request(
      `/due-diligence/assess${userId ? `?user_id=${encode(userId)}` : ""}`,
      {
        method: "POST",
        body: data,
      }
    ),

  getDueDiligenceReport: (ref) =>
    request(`/due-diligence/report/${encode(ref)}`),

  listDueDiligenceReports: () => request("/due-diligence/reports"),

  // Properties
  getProperties: () => request("/properties"),

  getPropertyDetail: (plotId) =>
    request(`/properties/${encode(plotId)}`),

  // Audit logs and notifications
  getAuditLogs: (limit = 50) =>
    request(`/audit-logs?limit=${encode(limit)}`),

  getNotifications: (userId, role) =>
    request(
      `/notifications?user_id=${encode(userId || 1)}&role=${encode(role || "citizen")}`
    ),

  markNotificationRead: (notificationId) =>
    request(`/notifications/${encode(notificationId)}/read`, {
      method: "POST",
    }),

  // Search
  searchBinary: (query, category = "all", limit = 25) =>
    request(
      `/search/binary?q=${encode(query)}&category=${encode(category)}&limit=${encode(limit)}`
    ),

  // Native engine and benchmark
  getEngineStatus: () => request("/engine/status"),

  runBenchmark: (operations = 20000) =>
    request(`/benchmark?operations=${encode(operations)}`),

  detectFraudGraph: (transfers) =>
    request("/fraud/detect-graph", {
      method: "POST",
      body: transfers,
    }),
};
