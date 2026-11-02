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

  const { timeoutMs = 0, signal: callerSignal, ...fetchOptions } = options;
  const controller = timeoutMs > 0 ? new AbortController() : null;
  let timedOut = false;
  let timeoutId;
  const abortFromCaller = () => controller?.abort(callerSignal?.reason);
  if (controller && callerSignal) {
    if (callerSignal.aborted) abortFromCaller();
    else callerSignal.addEventListener("abort", abortFromCaller, { once: true });
  }
  if (controller) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }

  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const requestOptions = {
    ...fetchOptions,
    headers,
    credentials: "include",
    ...(controller ? { signal: controller.signal } : callerSignal ? { signal: callerSignal } : {}),
  };
  const body = options.body;

  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    requestOptions.body = JSON.stringify(body);
  }

  try {
    let response;
    try {
      response = await fetch(`${BASE_URL}${endpoint}`, requestOptions);
    } catch {
      if (timedOut) {
        const error = new Error("Dashboard request timed out. Please try again.");
        error.code = "REQUEST_TIMEOUT";
        throw error;
      }
      const error = new Error(
        "Backend-এর সাথে সংযোগ করা যাচ্ছে না। Backend URL, deployment এবং CORS configuration পরীক্ষা করুন।"
      );
      error.code = "BACKEND_UNAVAILABLE";
      throw error;
    }

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    let responseData = null;

    if (isJson) {
      try {
        responseData = await response.json();
      } catch {
        if (timedOut) {
          const error = new Error("Dashboard request timed out. Please try again.");
          error.code = "REQUEST_TIMEOUT";
          throw error;
        }
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
        responseData?.message_bn ||
        responseData?.message ||
        responseData?.error ||
        `Request failed (${response.status})`;
      const message = Array.isArray(detail)
        ? detail.map((item) => item.msg || JSON.stringify(item)).join(", ")
        : typeof detail === "string"
          ? detail
          : JSON.stringify(detail);
      const error = new Error(message);
      error.status = response.status;
      error.payload = responseData;
      throw error;
    }

    return responseData;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

const encode = (value) => encodeURIComponent(String(value));

export const api = {
  // Authentication
  login: (identifier, password) =>
    request("/auth/login", {
      method: "POST",
      body: { identifier, password },
    }),

  register: (data) =>
    request("/auth/register", {
      method: "POST",
      body: data,
    }),

  checkUsernameAvailability: (username) =>
    request(`/auth/username-availability?username=${encode(username)}`),

  startPasswordRecovery: (data) =>
    request("/auth/recovery/start", { method: "POST", body: data }),

  recoverUsername: (data) =>
    request("/auth/recovery/username", { method: "POST", body: data }),

  resetPassword: (data) =>
    request("/auth/recovery/reset", { method: "POST", body: data }),

  getMe: () => request("/auth/me"),

  getProfilePicture: async (userId, version) => {
    const headers = new Headers({ Accept: "image/webp" });
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${BASE_URL}/users/${encode(userId)}/profile-picture?v=${encode(version)}`, {
      headers,
      credentials: "include",
    });
    if (!response.ok) {
      let detail = "Could not load profile picture";
      try {
        const payload = await response.json();
        detail = payload?.detail || detail;
      } catch {
        // Keep the useful fallback for non-JSON error responses.
      }
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }
    return response.blob();
  },

  uploadProfilePicture: (formData, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${BASE_URL}/profile-picture`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () => {
      let payload = {};
      try { payload = JSON.parse(xhr.responseText || "{}"); } catch { /* handled below */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
      else reject(new Error(payload.detail || `Upload failed (${xhr.status})`));
    });
    xhr.addEventListener("error", () => reject(new Error("Could not connect to the server")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.send(formData);
  }),

  removeProfilePicture: () => request("/profile-picture", { method: "DELETE" }),

  // Dashboard and seed
  getDashboardStats: () => request("/dashboard/stats", { timeoutMs: 20000 }),

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

  searchDeedByNumber: (deedNo) =>
    request("/deeds/search-by-number", {
      method: "POST",
      body: { deed_no: deedNo },
    }),

  advancedDeedSearch: (data) =>
    request("/deeds/advanced-search", {
      method: "POST",
      body: data,
    }),

  getDeedDetail: (deedId) => request(`/deeds/${encode(deedId)}`),

  getDeedSearchProtection: () => request("/deeds/search-protection/status"),

  adminDeedSearchLocks: (limit = 50) =>
    request(`/admin/deed-search/locks?limit=${encode(limit)}`),

  adminUnlockDeedSearch: (data) =>
    request("/admin/deed-search/unlock", {
      method: "POST",
      body: data,
    }),

  listAdminUsers: ({ q = "", role = "all", limit = 25, offset = 0 } = {}) =>
    request(`/admin/users?q=${encode(q)}&role=${encode(role)}&limit=${encode(limit)}&offset=${encode(offset)}`),

  createOfficer: (data) =>
    request("/admin/officers", { method: "POST", body: data }),

  listAdminData: (dataset, { q = "", limit = 25, offset = 0 } = {}) =>
    request(`/admin/data/${encode(dataset)}?q=${encode(q)}&limit=${encode(limit)}&offset=${encode(offset)}`),

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
