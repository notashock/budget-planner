/**
 * Universal JSON serialization bridge.
 * Ensures both `id` and `_id` are populated on all entity responses,
 * along with backward compatibility shims for pruned columns,
 * so Web and Flutter clients experience zero breaking changes.
 */
export function serialize(data) {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map(serialize);
  if (data instanceof Date) return data.toISOString();
  if (typeof data === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = serialize(v);
    }

    // Universal ID bridge
    if (out.id && !out._id) {
      out._id = out.id;
    }

    // Account compatibility shims
    if (out.type === 'bank' || out.type === 'wallet') {
      if (!out.accountType) {
        out.accountType = out.subtype || out.type;
      }
      if (out.type === 'wallet' && !out.walletType) {
        out.walletType = out.subtype || 'cash';
      }
      if (out.type === 'wallet' && !out.walletId) {
        out.walletId = out.id;
      }
      if (out.type === 'bank' && !out.bankAccountId) {
        out.bankAccountId = out.id;
      }
    }

    // Item / Transaction category/tag bridge
    if (out.category && !out.tag) {
      out.tag = out.category;
    } else if (out.tag && !out.category) {
      out.category = out.tag;
    }

    // Date / Day bridges
    if (out.date && typeof out.date === 'string') {
      const parts = out.date.split('-');
      if (parts.length === 3) {
        const dayNum = parseInt(parts[2], 10);
        if (out.day === undefined) out.day = dayNum;
        if (out.dayOfMonth === undefined) out.dayOfMonth = dayNum;
        if (out.originalDay === undefined) out.originalDay = dayNum;
        if (out.originalDate === undefined) out.originalDate = out.date;
      }
    }

    // Account ID bridge for items and transactions
    if (out.accountId) {
      if (!out.bankAccountId) out.bankAccountId = out.accountId;
      if (!out.accountType) out.accountType = 'bank';
    }

    // Month salary account bridge
    if (out.salaryAccountId) {
      if (!out.salaryBankAccountId) out.salaryBankAccountId = out.salaryAccountId;
    }
    if (out.incomeCreditDate && typeof out.incomeCreditDate === 'string') {
      const parts = out.incomeCreditDate.split('-');
      if (parts.length === 3 && out.incomeCreditDay === undefined) {
        out.incomeCreditDay = parseInt(parts[2], 10);
      }
    }

    // Transfer account bridge
    if (out.sourceAccountId) {
      if (!out.sourceBankAccountId) out.sourceBankAccountId = out.sourceAccountId;
      if (!out.sourceId) out.sourceId = out.sourceAccountId;
      if (!out.sourceType) out.sourceType = 'bank';
    }
    if (out.destinationAccountId) {
      if (!out.destinationBankAccountId) out.destinationBankAccountId = out.destinationAccountId;
      if (!out.destinationId) out.destinationId = out.destinationAccountId;
      if (!out.destinationType) out.destinationType = 'bank';
    }

    // Goal funding account bridge
    if (out.fundingAccountId) {
      if (!out.fundingBankAccountId) out.fundingBankAccountId = out.fundingAccountId;
    }

    // User username bridge
    if (out.email && !out.username) {
      out.username = out.email.split('@')[0];
    }

    return out;
  }
  return data;
}
