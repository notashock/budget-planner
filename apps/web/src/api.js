const BASE_API_URL = import.meta.env.VITE_API_URL || '';
const TOKEN_STORAGE_KEY = 'budget_auth_token';

async function request(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${BASE_API_URL}${url}`;
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(fullUrl, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
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

  // Items
  createItem: (year, month, item) => request(`/api/months/${year}/${month}/items`, { method: 'POST', body: JSON.stringify(item) }),
  updateItem: (id, updates) => request(`/api/items/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteItem: (id) => request(`/api/items/${id}`, { method: 'DELETE' }),

  // Transactions (Actuals, Unplanned, Quick-Log)
  getTransactions: (year, month) => request(`/api/months/${year}/${month}/transactions`),
  createTransaction: (year, month, tx) => request(`/api/months/${year}/${month}/transactions`, { method: 'POST', body: JSON.stringify(tx) }),
  deleteTransaction: (id) => request(`/api/transactions/${id}`, { method: 'DELETE' }),
  getMonthEndReview: (year, month, accountId) => request(`/api/months/${year}/${month}/month-end-review${accountId && accountId !== 'all' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  recommendPurchaseDate: (year, month, amount, currentDay = new Date().getDate()) => request(`/api/months/${year}/${month}/recommend-purchase-date`, { method: 'POST', body: JSON.stringify({ amount, currentDay }) }),

  // Goals (Purchase Goals & Safe Date Recommendation)
  getGoals: (year, month) => request(`/api/months/${year}/${month}/goals`),
  createGoal: (year, month, goal) => request(`/api/months/${year}/${month}/goals`, { method: 'POST', body: JSON.stringify(goal) }),
  convertGoalToItem: (id) => request(`/api/goals/${id}/convert-to-item`, { method: 'POST' }),
  deferGoal: (id) => request(`/api/goals/${id}/defer`, { method: 'POST' }),
  reactivateGoal: (id) => request(`/api/goals/${id}/reactivate`, { method: 'POST' }),
  deleteGoal: (id) => request(`/api/goals/${id}`, { method: 'DELETE' }),

  // Bank Accounts & Migration
  getMigrationStatus: () => request('/api/bank-accounts/migration-status'),
  migrateLegacyData: (data) => request('/api/bank-accounts/migrate', { method: 'POST', body: JSON.stringify(data) }),
  getBankAccounts: (includeArchived = false) => request(`/api/bank-accounts${includeArchived ? '?includeArchived=true' : ''}`),
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
  deleteTransfer: (id) => request(`/api/transfers/${id}`, { method: 'DELETE' }),

  // AI Assistant (Gated by settings toggle)
  parseText: (text) => request('/api/ai/parse-text', { method: 'POST', body: JSON.stringify({ text }) }),
  explainTimeline: (timelineSummary, safetyFloor) => request('/api/ai/explain-timeline', { method: 'POST', body: JSON.stringify({ timelineSummary, safetyFloor }) })
};
