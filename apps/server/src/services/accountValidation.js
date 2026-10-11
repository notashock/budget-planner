import { BankAccount } from '../models/BankAccount.js';
import { Wallet } from '../models/Wallet.js';

/**
 * Validates that a specified financial account (Bank Account or Wallet) belongs to the authenticated user.
 * 
 * @param {object} params
 * @param {string|import('mongoose').Types.ObjectId} params.userId - Authenticated user ID
 * @param {'bank'|'wallet'} [params.accountType] - Financial entity discriminator
 * @param {string|import('mongoose').Types.ObjectId} params.accountId - Financial account ID to validate
 * @returns {Promise<object|null>} Account document if valid and owned by user, otherwise null
 */
export async function validateUserAccount({ userId, accountType, accountId }) {
  if (!accountId) {
    return null;
  }

  if (accountType === 'wallet') {
    return await Wallet.findOne({ _id: accountId, userId });
  }

  if (accountType === 'bank') {
    return await BankAccount.findOne({ _id: accountId, userId });
  }

  // If accountType is not explicitly provided, probe BankAccount first, then Wallet
  const bank = await BankAccount.findOne({ _id: accountId, userId });
  if (bank) {
    return bank;
  }

  return await Wallet.findOne({ _id: accountId, userId });
}
