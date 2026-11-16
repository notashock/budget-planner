const BASE_API_URL = import.meta.env.VITE_API_URL || '';
const TOKEN_STORAGE_KEY = 'budget_auth_token';

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

async function request(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const fullUrl = url.startsWith('http') ? url : `${BASE_API_URL}${url}`;
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
  const isGet = method === 'GET';

  // Invalidate cache on mutations to prevent stale UI state
  if (!isGet) {
    clearApiCache();
  }

  // Check TTL cache for GET requests
  const cacheKey = `${token || 'anon'}:${fullUrl}`;
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
      ...options.headers
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(fullUrl, {
      ...options,
      headers,
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

    // Transparently unwrap standard response envelope
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
  register: async (email, password) => {
    const data = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data && data.token && typeof localStorage !== 'undefined') {
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    }
    return data;
  },
  login: async (email, password) => {
    const data = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data && data.token && typeof localStorage !== 'undefined') {
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    }
    return data;
  },
  logout: async () => {
    try {
      return await request('/api/auth/logout', { method: 'POST' });
    } finally {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
  },
  getMe: () => request('/api/auth/me'),

  // Settings
  getSettings: () => request('/api/settings'),
  updateSettings: (updates) => request('/api/settings', { method: 'PUT', body: JSON.stringify(updates) }),

  // Months
  getMonths: () => request('/api/months'),
  createMonth: (data) => request('/api/months', { method: 'POST', body: JSON.stringify(data) }),
  getMonthDetail: (year, month) => request(`/api/months/${year}/${month}`),
  updateMonth: (year, month, updates) => request(`/api/months/${year}/${month}`, { method: 'PUT', body: JSON.stringify(updates) }),
  creditSalary: (year, month, data = {}) => request(`/api/months/${year}/${month}/credit-salary`, { method: 'POST', body: JSON.stringify(data) }),
  rolloverMonth: (year, month, carryBalance = true, rolloverUnpaidOneTimeItems = false) => request(`/api/months/${year}/${month}/rollover`, { method: 'POST', body: JSON.stringify({ carryBalance, rolloverUnpaidOneTimeItems }) }),
  deleteMonth: (year, month, force = false) => request(`/api/months/${year}/${month}${force ? '?force=true' : ''}`, { method: 'DELETE' }),

  // Items (Delegates to unified Transactions)
  createItem: (year, month, item) => request(`/api/months/${year}/${month}/transactions`, { method: 'POST', body: JSON.stringify({ ...item, origin: 'planned', status: 'planned' }) }),
  updateItem: (id, updates) => request(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteItem: (id) => request(`/api/transactions/${id}`, { method: 'DELETE' }),

  // Transactions (Unified Financial Entity & Lifecycle)
  getTransactions: (year, month, query = {}) => {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.origin) params.set('origin', query.origin);
    if (query.today) params.set('today', query.today);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/months/${year}/${month}/transactions${qs}`);
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
    return request(`/api/transactions${qs}`);
  },
  createTransaction: (year, month, tx) => request(`/api/months/${year}/${month}/transactions`, { method: 'POST', body: JSON.stringify(tx) }),
  createGlobalTransaction: (tx) => request('/api/transactions', { method: 'POST', body: JSON.stringify(tx) }),
  updateTransaction: (id, updates) => request(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  payTransaction: (id, payload = {}) => request(`/api/transactions/${id}/pay`, { method: 'PATCH', body: JSON.stringify(payload) }),
  cancelTransaction: (id, payload = {}) => request(`/api/transactions/${id}/cancel`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTransaction: (id) => request(`/api/transactions/${id}`, { method: 'DELETE' }),
  getMonthEndReview: (year, month, accountId) => request(`/api/months/${year}/${month}/month-end-review${accountId && accountId !== 'all' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  getIrregularReports: (query = {}) => {
    const qs = query.asOfDate ? `?asOfDate=${encodeURIComponent(query.asOfDate)}` : '';
    return request(`/api/reports/irregular${qs}`);
  },
  getSalaryTemplate: () => request('/api/salary-templates'),
  saveSalaryTemplate: (data) => request('/api/salary-templates', { method: 'POST', body: JSON.stringify(data) }),
  deactivateSalaryTemplate: () => request('/api/salary-templates/deactivate', { method: 'POST' }),
  recommendPurchaseDate: (year, month, amount, currentDay = new Date().getDate()) => request(`/api/months/${year}/${month}/recommend-purchase-date`, { method: 'POST', body: JSON.stringify({ amount, currentDay }) }),

  // Goals (Purchase Goals & Safe Date Recommendation)
  getGoals: (year, month) => request(`/api/months/${year}/${month}/goals`),
  createGoal: (year, month, goal) => request(`/api/months/${year}/${month}/goals`, { method: 'POST', body: JSON.stringify(goal) }),
  scheduleGoal: (id, payload = {}) => request(`/api/goals/${id}/schedule`, { method: 'POST', body: JSON.stringify(payload) }),
  convertGoalToItem: (id, payload = {}) => request(`/api/goals/${id}/schedule`, { method: 'POST', body: JSON.stringify(payload) }),
  updateGoal: (id, updates) => request(`/api/goals/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deferGoal: (id) => request(`/api/goals/${id}/defer`, { method: 'POST' }),
  reactivateGoal: (id) => request(`/api/goals/${id}/reactivate`, { method: 'POST' }),
  deleteGoal: (id) => request(`/api/goals/${id}`, { method: 'DELETE' }),

  // Bank Accounts & Migration
  getMigrationStatus: () => request('/api/bank-accounts/migration-status'),
  migrateLegacyData: (data) => request('/api/bank-accounts/migrate', { method: 'POST', body: JSON.stringify(data) }),
  getBankAccounts: (includeArchived = false) => request(`/api/bank-accounts${includeArchived ? '?includeArchived=true' : ''}`),
  getAllAccounts: (includeArchived = false) => request(`/api/accounts/all${includeArchived ? '?includeArchived=true' : ''}`),
  createAccount: (data) => request('/api/accounts', { method: 'POST', body: JSON.stringify(data) }),
  createBankAccount: (data) => request('/api/bank-accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateBankAccount: (id, updates) => request(`/api/bank-accounts/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteBankAccount: (id) => request(`/api/bank-accounts/${id}`, { method: 'DELETE' }),

  // Wallets
  getWallets: (includeArchived = false) => request(`/api/wallets${includeArchived ? '?includeArchived=true' : ''}`),
  createWallet: (data) => request('/api/wallets', { method: 'POST', body: JSON.stringify(data) }),
  updateWallet: (id, updates) => request(`/api/wallets/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteWallet: (id) => request(`/api/wallets/${id}`, { method: 'DELETE' }),

  // Transfers
  getTransfers: (monthId) => request(`/api/transfers${monthId ? `?monthId=${monthId}` : ''}`),
  createTransfer: (data) => request('/api/transfers', { method: 'POST', body: JSON.stringify(data) }),
  updateTransfer: (id, data) => request(`/api/transfers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransfer: (id) => request(`/api/transfers/${id}`, { method: 'DELETE' }),

  // AI Assistant (Gated by settings toggle)
  parseText: (text) => request('/api/ai/parse-text', { method: 'POST', body: JSON.stringify({ text }) }),
  explainTimeline: (timelineSummary, safetyFloor) => request('/api/ai/explain-timeline', { method: 'POST', body: JSON.stringify({ timelineSummary, safetyFloor }) }),

  // V1 Domain-Driven Endpoints
  v1: {
    getAccounts: (includeArchived = false) => request(`/api/v1/accounts${includeArchived ? '?includeArchived=true' : ''}`),
    createAccount: (data) => request('/api/v1/accounts', { method: 'POST', body: JSON.stringify(data) }),
    updateAccount: (id, updates) => request(`/api/v1/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    createTransfer: (data) => request('/api/v1/accounts/transfers', { method: 'POST', body: JSON.stringify(data) }),
    getPeriods: () => request('/api/v1/periods'),
    getPeriodDetail: (year, month) => request(`/api/v1/periods/${year}/${month}`),
    getTransactions: (query = {}) => {
      const params = new URLSearchParams(query);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return request(`/api/v1/transactions${qs}`);
    },
    createTransaction: (data) => request('/api/v1/transactions', { method: 'POST', body: JSON.stringify(data) }),
    updateTransaction: (id, updates) => request(`/api/v1/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    payTransaction: (id, payload = {}) => request(`/api/v1/transactions/${id}/pay`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteTransaction: (id) => request(`/api/v1/transactions/${id}`, { method: 'DELETE' })
  }
};
