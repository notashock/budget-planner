import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { validateUserAccount } from '../src/services/accountValidation.js';
import { BankAccount } from '../src/models/BankAccount.js';
import { Wallet } from '../src/models/Wallet.js';

describe('validateUserAccount unit tests', () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();
  const mockBankId = new mongoose.Types.ObjectId().toString();
  const mockWalletId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null if accountId or userId is missing', async () => {
    expect(await validateUserAccount({ userId: mockUserId, accountId: null })).toBeNull();
    expect(await validateUserAccount({ userId: null, accountId: mockBankId })).toBeNull();
    expect(await validateUserAccount({ userId: '', accountId: '' })).toBeNull();
  });

  it('returns null safely without throwing if accountId is not a valid ObjectId', async () => {
    expect(await validateUserAccount({ userId: mockUserId, accountType: 'bank', accountId: 'invalid-id-string' })).toBeNull();
    expect(await validateUserAccount({ userId: mockUserId, accountType: 'wallet', accountId: '12345' })).toBeNull();
  });

  it('unwraps object wrappers like { _id: ... } or { id: ... }', async () => {
    const mockBankDoc = { _id: mockBankId, name: 'HDFC', userId: mockUserId };
    vi.spyOn(BankAccount, 'findOne').mockResolvedValue(mockBankDoc);

    const resWithUnderscore = await validateUserAccount({
      userId: mockUserId,
      accountType: 'bank',
      accountId: { _id: mockBankId }
    });
    expect(resWithUnderscore).toEqual(mockBankDoc);
    expect(BankAccount.findOne).toHaveBeenCalledWith({ _id: mockBankId, userId: mockUserId });

    const resWithId = await validateUserAccount({
      userId: mockUserId,
      accountType: 'bank',
      accountId: { id: mockBankId }
    });
    expect(resWithId).toEqual(mockBankDoc);
  });

  it('returns the account when valid and owned by user', async () => {
    const mockBankDoc = { _id: mockBankId, name: 'HDFC', userId: mockUserId };
    vi.spyOn(BankAccount, 'findOne').mockResolvedValue(mockBankDoc);

    const result = await validateUserAccount({
      userId: mockUserId,
      accountType: 'bank',
      accountId: mockBankId
    });
    expect(result).toEqual(mockBankDoc);
  });

  it('returns null when account does not exist or belongs to another user', async () => {
    vi.spyOn(BankAccount, 'findOne').mockResolvedValue(null);

    const result = await validateUserAccount({
      userId: mockUserId,
      accountType: 'bank',
      accountId: mockBankId
    });
    expect(result).toBeNull();
  });
});
