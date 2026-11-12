// Bhumisetu (ভূমিসেতু) API client
// Set VITE_API_URL to your backend API base, e.g. https://your-backend.vercel.app/api

const configuredBaseUrl = import.meta.env.VITE_API_URL || "/api";
const BASE_URL = configuredBaseUrl.replace(/\/+$/, "");

let accessToken = "";
let refreshPromise = null;
let authFailureHandler = null;

// Migrate the old short-lived bearer once, then keep all access tokens in memory.
try {
  accessToken = localStorage.getItem("lg_token") || "";
  localStorage.removeItem("lg_token");
} catch {
  accessToken = "";
}

function getToken() {
  return accessToken;
}

function hasExplicitLogoutMarker() {
  try { return localStorage.getItem("lg_logged_out") === "1"; } catch { return false; }
}

export function setToken(token) {
  accessToken = token || "";
  try { localStorage.removeItem("lg_token"); } catch { /* Storage is not required for auth. */ }
}

export function setAuthFailureHandler(handler) {
  authFailureHandler = handler;
}

function createRequestError(responseData, statusCode) {
  const detail = responseData?.detail || responseData?.message_bn || responseData?.message || responseData?.error || `Request failed (${statusCode})`;
  const message = Array.isArray(detail)
    ? detail.map((item) => item.msg || JSON.stringify(item)).join(", ")
    : typeof detail === "string" ? detail : (detail?.message || JSON.stringify(detail));
  const error = new Error(message);
  error.status = statusCode;
  error.payload = responseData;
  error.code = detail?.code;
  return error;
}

async function sendRequest(endpoint, options = {}, token = getToken()) {
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
      throw createRequestError(responseData, response.status);
    }

    return responseData;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

async function refreshAccessToken() {
  if (hasExplicitLogoutMarker()) {
    const error = new Error("You have logged out. Sign in again to continue.");
    error.status = 401;
    throw error;
  }
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response;
      try {
        const headers = new Headers({ Accept: "application/json" });
        const legacyToken = getToken();
        if (legacyToken) headers.set("Authorization", `Bearer ${legacyToken}`);
        response = await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          headers,
          credentials: "include",
        });
      } catch {
        const error = new Error("Backend-এর সাথে সংযোগ করা যাচ্ছে না; session যাচাই করা যায়নি।");
        error.code = "BACKEND_UNAVAILABLE";
        throw error;
      }
      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (response.ok && payload?.token) {
        setToken(payload.token);
        return payload.token;
      }
      const error = createRequestError(payload, response.status);
      if (response.status === 409 && error.code === "session_rotated" && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 75));
        continue;
      }
      if (response.status === 401) setToken(null);
      throw error;
    }
    const error = new Error("Session refresh could not be completed.");
    error.code = "SESSION_REFRESH_FAILED";
    throw error;
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function request(endpoint, options = {}) {
  const sentToken = getToken();
  try {
    return await sendRequest(endpoint, options, sentToken);
  } catch (error) {
    if (error.status !== 401 || endpoint.startsWith("/auth/")) throw error;
    try {
      const retryToken = await tokenAfterUnauthorized(sentToken);
      return await sendRequest(endpoint, options, retryToken);
    } catch (refreshError) {
      if (refreshError.status === 401) authFailureHandler?.();
      throw refreshError;
    }
  }
}

function tokenAfterUnauthorized(sentToken) {
  if (hasExplicitLogoutMarker()) {
    const error = new Error("You have logged out. Sign in again to continue.");
    error.status = 401;
    return Promise.reject(error);
  }
  return getToken() && getToken() !== sentToken
    ? Promise.resolve(getToken())
    : refreshAccessToken();
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

  restoreSession: async () => {
    if (hasExplicitLogoutMarker()) {
      await request("/auth/logout", { method: "POST" }).catch(() => null);
      return null;
    }
    await refreshAccessToken();
    return request("/auth/me");
  },

  logout: () => request("/auth/logout", { method: "POST" }),

  getProfilePicture: async (userId, version) => {
    const load = async (token, retried = false) => {
      const headers = new Headers({ Accept: "image/webp" });
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(`${BASE_URL}/users/${encode(userId)}/profile-picture?v=${encode(version)}`, {
        headers,
        credentials: "include",
      });
      if (response.status === 401 && !retried) {
        try { return await load(await tokenAfterUnauthorized(token), true); }
        catch (error) {
          if (error.status === 401) authFailureHandler?.();
          throw error;
        }
      }
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
    };
    return load(getToken());
  },

  uploadProfilePicture: (formData, onProgress) => new Promise((resolve, reject) => {
    const upload = (token, retried = false) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `${BASE_URL}/profile-picture`);
      xhr.withCredentials = true;
      xhr.setRequestHeader("Accept", "application/json");
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
      });
      xhr.addEventListener("load", () => {
        let payload = {};
        try { payload = JSON.parse(xhr.responseText || "{}"); } catch { /* handled below */ }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
        } else if (xhr.status === 401 && !retried) {
          tokenAfterUnauthorized(token).then((freshToken) => upload(freshToken, true)).catch((error) => {
            if (error.status === 401) authFailureHandler?.();
            reject(error);
          });
        } else if (xhr.status === 401) {
          const error = new Error(payload.detail || "Authentication required");
          error.status = 401;
          authFailureHandler?.();
          reject(error);
        } else {
          reject(new Error(payload.detail || `Upload failed (${xhr.status})`));
        }
      });
      xhr.addEventListener("error", () => reject(new Error("Could not connect to the server")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
      xhr.send(formData);
    };
    upload(getToken());
  }),

  removeProfilePicture: () => request("/profile-picture", { method: "DELETE" }),

  // Dashboard and seed
  getDashboardStats: () => request("/dashboard/stats", { timeoutMs: 20000 }),

  // P2: Deed verification
  getLocationDivisions: ({ q = "", limit = 50 } = {}) =>
    request(`/locations/divisions?q=${encode(q)}&limit=${encode(limit)}`),

  getLocationDistricts: ({ q = "", limit = 200, divisionId = "" } = {}) =>
    request(`/locations/districts?q=${encode(q)}&limit=${encode(limit)}${divisionId ? `&division_id=${encode(divisionId)}` : ""}`),

  getLocationUpazilas: (districtId, { q = "", limit = 300 } = {}) =>
    request(`/locations/upazilas?district_id=${encode(districtId)}&q=${encode(q)}&limit=${encode(limit)}`),

  getLocationThanas: (districtId, { q = "", limit = 300 } = {}) =>
    request(`/locations/thanas?district_id=${encode(districtId)}&q=${encode(q)}&limit=${encode(limit)}`),

  getLocationMouzas: ({ upazilaId, thanaId, q = "", limit = 500 } = {}) => {
    const parent = upazilaId ? `upazila_id=${encode(upazilaId)}` : `thana_id=${encode(thanaId)}`;
    return request(`/locations/mouzas?${parent}&q=${encode(q)}&limit=${encode(limit)}`);
  },

  getLocationUnions: (upazilaId, { q = "", limit = 100 } = {}) =>
    request(`/locations/unions?upazila_id=${encode(upazilaId)}&q=${encode(q)}&limit=${encode(limit)}`),

  verifyDeed: (data, userId) =>
    request(
      `/verification/verify-deed${userId ? `?user_id=${encode(userId)}` : ""}`,
      {
        method: "POST",
        body: data,
      }
    ),

  getVerificationDeedTypes: () => request("/verification/deed-types"),

  uploadDeed: (formData) =>
    request("/verification/upload-deed", {
      method: "POST",
      body: formData,
    }),

  scanDigitizationDocument: (formData) =>
    request("/deed-digitization/scan", {
      method: "POST",
      body: formData,
      timeoutMs: 90000,
    }),

  discardDigitizationScan: (scanToken) =>
    request(`/deed-digitization/scan/${encode(scanToken)}`, { method: "DELETE" }),

  submitDigitizationApplication: (data) =>
    request("/deed-digitization/applications", { method: "POST", body: data }),

  resubmitDigitizationApplication: (id, data) =>
    request(`/deed-digitization/applications/${encode(id)}/resubmit`, { method: "PUT", body: data }),

  listDigitizationApplications: ({ page = 1, pageSize = 20, staffQueue = false } = {}) =>
    request(`/deed-digitization/applications/${staffQueue ? "review-queue" : "mine"}?page=${encode(page)}&page_size=${encode(pageSize)}`),

  listDigitizationOfficers: () => request("/deed-digitization/applications/officers"),

  assignDigitizationApplication: (id, officerId) =>
    request(`/deed-digitization/applications/${encode(id)}/assign`, {
      method: "POST",
      body: { officer_id: officerId },
    }),

  getDigitizationApplication: (id) => request(`/deed-digitization/applications/${encode(id)}`),

  trackDigitizationApplication: (trackingId) => request(`/deed-digitization/track/${encode(trackingId)}`),

  uploadDigitizationApplicationDocument: (applicationId, formData) =>
    request(`/deed-digitization/applications/${encode(applicationId)}/documents`, { method: "POST", body: formData }),

  decideDigitizationApplication: (id, action, note = "") =>
    request(`/deed-digitization/applications/${encode(id)}/decision`, { method: "POST", body: { action, note } }),

  cancelDigitizationApplication: (id) =>
    request(`/deed-digitization/applications/${encode(id)}/cancel`, { method: "POST" }),

  listDigitalDeeds: (staff = false) => request(`/deed-digitization/digital-deeds/${staff ? "review" : "mine"}`),

  revokeDigitalDeed: (deedId, reason) =>
    request(`/deed-digitization/digital-deeds/${encode(deedId)}/revoke`, { method: "POST", body: { reason } }),

  getDigitalDeed: (deedId) => request(`/deed-digitization/digital-deeds/${encode(deedId)}`),

  verifyDigitalDeed: (token) => request(`/deed-digitization/public/verify/${encode(token)}`),

  downloadDigitizationApplicationDocument: async (applicationId, documentId) => {
    const headers = new Headers();
    if (getToken()) headers.set("Authorization", `Bearer ${getToken()}`);
    const response = await fetch(`${BASE_URL}/deed-digitization/applications/${encode(applicationId)}/documents/${encode(documentId)}`, {
      headers,
      credentials: "include",
    });
    if (!response.ok) {
      let detail = "Application document is unavailable.";
      try { const payload = await response.json(); detail = payload?.detail || detail; } catch { /* Keep safe fallback. */ }
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    return response.blob();
  },

  downloadStaffHistoryApplicationDocument: async (applicationId, documentId) => {
    const headers = new Headers();
    if (getToken()) headers.set("Authorization", `Bearer ${getToken()}`);
    const response = await fetch(`${BASE_URL}/deed-digitization/applications/${encode(applicationId)}/staff-history-documents/${encode(documentId)}`, {
      headers,
      credentials: "include",
    });
    if (!response.ok) {
      let detail = "Application document is unavailable.";
      try { const payload = await response.json(); detail = payload?.detail || detail; } catch { /* Keep safe fallback. */ }
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    return response.blob();
  },

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

  getApplicationHistory: (query = "") =>
    request(`/applications/my${query ? `?${query}` : ""}`),

  getStaffApplicationHistory: (query = "") =>
    request(`/applications/staff-history${query ? `?${query}` : ""}`),

  getStaffApplicationHistoryDetail: (trackingId) =>
    request(`/applications/staff-history/track/${encode(trackingId)}`),

  trackMyApplication: (trackingId) =>
    request(`/applications/my/track/${encode(trackingId)}`),

  getUnifiedAdminApplications: (query = "") =>
    request(`/applications/admin${query ? `?${query}` : ""}`),

  getMyMutations: () => request("/mutation/my-applications"),

  getAllMutations: (statusFilter) =>
    request(
      `/mutation/all-applications${
        statusFilter ? `?status_filter=${encode(statusFilter)}` : ""
      }`
    ),

  assignMutationApplication: (trackingNo, officerId) =>
    request(`/mutation/assign/${encode(trackingNo)}`, {
      method: "POST",
      body: { officer_id: officerId },
    }),

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
