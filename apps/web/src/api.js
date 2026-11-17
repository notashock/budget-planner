const BASE_API_URL = import.meta.env.VITE_API_URL || '';
// Auth now lives in an httpOnly cookie set by the server, which page scripts
// cannot read. A token an older version left in localStorage is sent once to
// /api/auth/me so the server can move it into the cookie, then deleted.
const LEGACY_TOKEN_STORAGE_KEY = 'budget_auth_token';
function takeLegacyToken() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const token = localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY);
    if (token) localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    return token;
  } catch {
    return null; // storage unavailable (private mode)
  }
}

// Resources that have an /api/v1 route use it. Auth, settings, salary templates
// and AI have no v1 counterpart yet (docs/api-v1-migration.md).
const V1 = '/api/v1';

function accountsUrl(type, includeArchived) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (includeArchived) params.set('includeArchived', 'true');
  const qs = params.toString();
  return `${V1}/accounts${qs ? `?${qs}` : ''}`;
}

// In-flight request deduplication map to eliminate redundant concurrent network calls
const pendingRequests = new Map();

// Micro-cache for idempotent GET calls (TTL-based with automatic mutation invalidation)
const responseCache = new Map();
const DEFAULT_CACHE_TTL_MS = 25000; // 25 seconds

export function clearApiCache(pattern = null) {
  if (!pattern) {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (key.includes(pattern)) {
      responseCache.delete(key);
    }
  }
}

// Bumped on login/logout so cached GET responses never leak across users.
let authEpoch = 0;

async function request(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const fullUrl = url.startsWith('http') ? url : `${BASE_API_URL}${url}`;
  const isGet = method === 'GET';

  // Invalidate cache on mutations to prevent stale UI state
  if (!isGet) {
    clearApiCache();
  }

  // Check TTL cache for GET requests
  const cacheKey = `${authEpoch}:${fullUrl}`;
  if (isGet && !options.bypassCache) {
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < (options.cacheTtlMs || DEFAULT_CACHE_TTL_MS)) {
      return cached.data;
    }
  }

  // Deduplicate simultaneous in-flight GET requests
  if (isGet && pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  const executeRequest = async () => {
    const headers = {
      'Content-Type': 'application/json',
      // Required by the server's CSRF guard for cookie-authenticated writes
      'X-Requested-With': 'fetch',
      ...options.headers
    };

    const res = await fetch(fullUrl, {
      ...options,
      headers,
      credentials: 'include',
      signal: options.signal,
      keepalive: options.keepalive ?? isGet
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorMsg = (payload.error && payload.error.message) || payload.error || `Request failed with status ${res.status}`;
      const err = new Error(errorMsg);
      err.code = payload.error?.code || 'REQUEST_FAILED';
      err.details = payload.error?.details || null;
      err.status = res.status;
      throw err;
    }

    // Unwrap the response envelope { status: 'success', data, metadata, timestamp }
    const data = (payload && payload.status === 'success' && payload.data !== undefined)
      ? payload.data
      : payload;

    // Cache successful GET responses
    if (isGet && !options.bypassCache) {
      responseCache.set(cacheKey, { timestamp: Date.now(), data });
    }

    return data;
  };

  const reqPromise = executeRequest().finally(() => {
    if (isGet) {
      pendingRequests.delete(cacheKey);
    }
  });

  if (isGet) {
    pendingRequests.set(cacheKey, reqPromise);
  }

  return reqPromise;
}

export const api = {
  clearCache: clearApiCache,
  // Auth
  // The server sets the httpOnly auth cookie; the token in the response body
  // is for API clients like the mobile app and is deliberately not stored here.
  register: async (email, password) => {
    const data = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    authEpoch += 1;
    clearApiCache();
    return data;
  },
  login: async (email, password) => {
    const data = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    authEpoch += 1;
    clearApiCache();
    return data;
  },
  logout: async () => {
    try {
      return await request('/api/auth/logout', { method: 'POST' });
    } finally {
      authEpoch += 1;
      clearApiCache();
    }
  },
  getMe: () => {
    const legacyToken = takeLegacyToken();
    return legacyToken
      ? request('/api/auth/me', { bypassCache: true, headers: { Authorization: `Bearer ${legacyToken}` } })
      : request('/api/auth/me');
  },

  // Settings
  getSettings: () => request('/api/settings'),
  updateSettings: (updates) => request('/api/settings', { method: 'PUT', body: JSON.stringify(updates) }),

  // Budget periods (months)
  getMonths: () => request(`${V1}/periods`),
  createMonth: (data) => request(`${V1}/periods`, { method: 'POST', body: JSON.stringify(data) }),
  getMonthDetail: (year, month) => request(`${V1}/periods/${year}/${month}`),
  updateMonth: (year, month, updates) => request(`${V1}/periods/${year}/${month}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  creditSalary: (year, month, data = {}) => request(`${V1}/periods/${year}/${month}/credit-salary`, { method: 'POST', body: JSON.stringify(data) }),
  rolloverMonth: (year, month, carryBalance = true, rolloverUnpaidOneTimeItems = false) => request(`${V1}/periods/${year}/${month}/rollover`, { method: 'POST', body: JSON.stringify({ carryBalance, rolloverUnpaidOneTimeItems }) }),
  deleteMonth: (year, month, force = false) => request(`${V1}/periods/${year}/${month}${force ? '?force=true' : ''}`, { method: 'DELETE' }),

  // Items (planned transactions)
  createItem: (year, month, item) => request(`${V1}/periods/${year}/${month}/transactions`, { method: 'POST', body: JSON.stringify({ ...item, origin: 'planned', status: 'planned' }) }),
  updateItem: (id, updates) => request(`${V1}/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteItem: (id) => request(`${V1}/transactions/${id}`, { method: 'DELETE' }),

  // Transactions (Unified Financial Entity & Lifecycle)
  getTransactions: (year, month, query = {}) => {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.origin) params.set('origin', query.origin);
    if (query.today) params.set('today', query.today);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`${V1}/periods/${year}/${month}/transactions${qs}`);
  },
  getGlobalTransactions: (query = {}) => {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.origin) params.set('origin', query.origin);
    if (query.accountId) params.set('accountId', query.accountId);
    if (query.startDate) params.set('startDate', query.startDate);
    if (query.endDate) params.set('endDate', query.endDate);
    if (query.today) params.set('today', query.today);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`${V1}/transactions${qs}`);
  },
  createTransaction: (year, month, tx) => request(`${V1}/periods/${year}/${month}/transactions`, { method: 'POST', body: JSON.stringify(tx) }),
  createGlobalTransaction: (tx) => request(`${V1}/transactions`, { method: 'POST', body: JSON.stringify(tx) }),
  updateTransaction: (id, updates) => request(`${V1}/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  payTransaction: (id, payload = {}) => request(`${V1}/transactions/${id}/pay`, { method: 'POST', body: JSON.stringify(payload) }),
  cancelTransaction: (id, payload = {}) => request(`${V1}/transactions/${id}/cancel`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteTransaction: (id) => request(`${V1}/transactions/${id}`, { method: 'DELETE' }),
  getMonthEndReview: (year, month, accountId) => request(`${V1}/periods/${year}/${month}/month-end-review${accountId && accountId !== 'all' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  getIrregularReports: (query = {}) => {
    const qs = query.asOfDate ? `?asOfDate=${encodeURIComponent(query.asOfDate)}` : '';
    return request(`${V1}/reports/irregular${qs}`);
  },
  // Salary templates have no v1 counterpart yet (docs/api-v1-migration.md)
  getSalaryTemplate: () => request('/api/salary-templates'),
  saveSalaryTemplate: (data) => request('/api/salary-templates', { method: 'POST', body: JSON.stringify(data) }),
  deactivateSalaryTemplate: () => request('/api/salary-templates/deactivate', { method: 'POST' }),
  recommendPurchaseDate: (year, month, amount, currentDay = new Date().getDate()) => request(`${V1}/periods/${year}/${month}/recommend-purchase-date`, { method: 'POST', body: JSON.stringify({ amount, currentDay }) }),

  // Goals (Purchase Goals & Safe Date Recommendation)
  getGoals: (year, month) => request(`${V1}/periods/${year}/${month}/goals`),
  createGoal: (year, month, goal) => request(`${V1}/periods/${year}/${month}/goals`, { method: 'POST', body: JSON.stringify(goal) }),
  scheduleGoal: (id, payload = {}) => request(`${V1}/goals/${id}/schedule`, { method: 'POST', body: JSON.stringify(payload) }),
  convertGoalToItem: (id, payload = {}) => request(`${V1}/goals/${id}/schedule`, { method: 'POST', body: JSON.stringify(payload) }),
  updateGoal: (id, updates) => request(`${V1}/goals/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deferGoal: (id) => request(`${V1}/goals/${id}/defer`, { method: 'POST' }),
  reactivateGoal: (id) => request(`${V1}/goals/${id}/reactivate`, { method: 'POST' }),
  deleteGoal: (id) => request(`${V1}/goals/${id}`, { method: 'DELETE' }),

  // Accounts: bank, wallet and cash share /api/v1/accounts; `type` narrows a list
  getMigrationStatus: () => request(`${V1}/accounts/migration-status`),
  migrateLegacyData: (data) => request(`${V1}/accounts/migrate`, { method: 'POST', body: JSON.stringify(data) }),
  getBankAccounts: (includeArchived = false) => request(accountsUrl('bank', includeArchived)),
  getAllAccounts: (includeArchived = false) => request(accountsUrl(null, includeArchived)),
  createAccount: (data) => request(`${V1}/accounts`, { method: 'POST', body: JSON.stringify(data) }),
  createBankAccount: (data) => request(`${V1}/accounts`, { method: 'POST', body: JSON.stringify(data) }),
  updateBankAccount: (id, updates) => request(`${V1}/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteBankAccount: (id) => request(`${V1}/accounts/${id}`, { method: 'DELETE' }),

  // Wallets
  getWallets: (includeArchived = false) => request(accountsUrl('wallet', includeArchived)),
  createWallet: (data) => request(`${V1}/accounts`, { method: 'POST', body: JSON.stringify({ ...data, type: 'wallet' }) }),
  updateWallet: (id, updates) => request(`${V1}/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteWallet: (id) => request(`${V1}/accounts/${id}`, { method: 'DELETE' }),

  // Transfers
  getTransfers: (monthId) => request(`${V1}/transfers${monthId ? `?monthId=${encodeURIComponent(monthId)}` : ''}`),
  createTransfer: (data) => request(`${V1}/transfers`, { method: 'POST', body: JSON.stringify(data) }),
  updateTransfer: (id, data) => request(`${V1}/transfers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTransfer: (id) => request(`${V1}/transfers/${id}`, { method: 'DELETE' }),

  // AI Assistant (Gated by settings toggle)
  parseText: (text) => request('/api/ai/parse-text', { method: 'POST', body: JSON.stringify({ text }) }),
  explainTimeline: (timelineSummary, safetyFloor) => request('/api/ai/explain-timeline', { method: 'POST', body: JSON.stringify({ timelineSummary, safetyFloor }) })
};
