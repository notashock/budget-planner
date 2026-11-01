import mongoose from 'mongoose';
import { BankAccount } from '../models/BankAccount.js';
import { Wallet } from '../models/Wallet.js';

/**
 * Validates that a specified financial account (Bank Account or Wallet) belongs to the authenticated user.
 * 
 * @param {object} params
 * @param {string|import('mongoose').Types.ObjectId} params.userId - Authenticated user ID
 * @param {'bank'|'wallet'} [params.accountType] - Financial entity discriminator
 * @param {string|object|import('mongoose').Types.ObjectId} params.accountId - Financial account ID to validate
 * @returns {Promise<object|null>} Account document if valid and owned by user, otherwise null
 */
export async function validateUserAccount({ userId, accountType, accountId }) {
  if (!accountId || !userId) {
    return null;
  }

  // Unwrap object wrappers e.g. { _id: ... } or { id: ... }
  let cleanId = accountId;
  if (typeof cleanId === 'object' && cleanId !== null) {
    cleanId = cleanId._id || cleanId.id || null;
  }

  if (!cleanId) {
    return null;
  }

  const idStr = String(cleanId).trim();
  if (!idStr) {
    return null;
  }

  // Guard against uncastable ObjectId strings to avoid throwing CastError
  if (!mongoose.isValidObjectId(idStr)) {
    return null;
  }

  try {
    if (accountType === 'wallet') {
      return await Wallet.findOne({ _id: idStr, userId });
    }

    if (accountType === 'bank') {
      return await BankAccount.findOne({ _id: idStr, userId });
    }

    // If accountType is not explicitly provided, probe BankAccount first, then Wallet
    const bank = await BankAccount.findOne({ _id: idStr, userId });
    if (bank) {
      return bank;
    }

    return await Wallet.findOne({ _id: idStr, userId });
  } catch (err) {
    return null;
  }
}
