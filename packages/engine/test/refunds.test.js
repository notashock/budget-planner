import { describe, it, expect } from 'vitest';
import { getRefundedAmount, getRefundableRemaining } from '../src/index.js';

describe('refunds linked to one spend (ADR 0062)', () => {
  const spend = { id: 's1', amount: 126024, status: 'successful' };
  const r1 = { id: 'r1', amount: -16000, refundTargetTransactionId: 's1' };
  const r2 = { id: 'r2', amount: -30000, refundTargetTransactionId: 's1' };
  const other = { id: 'r9', amount: -50000, refundTargetTransactionId: 's2' };
  const unlinked = { id: 'r8', amount: -7000 };

  it('remaining goes down with each linked refund', () => {
    expect(getRefundableRemaining(spend, [spend])).toBe(126024);
    expect(getRefundableRemaining(spend, [spend, r1])).toBe(110024);
    expect(getRefundableRemaining(spend, [spend, r1, r2])).toBe(80024);
  });

  it('only counts refunds linked to this spend', () => {
    expect(getRefundedAmount('s1', [spend, r1, other, unlinked])).toBe(16000);
  });

  it('never goes below zero, even if refunds already add up to more than the spend', () => {
    const big = { id: 'r3', amount: -200000, refundTargetTransactionId: 's1' };
    expect(getRefundableRemaining(spend, [r1, big])).toBe(0);
  });

  it('leaves out the refund being edited', () => {
    expect(getRefundableRemaining(spend, [r1, r2], { excludeId: 'r2' })).toBe(110024);
  });

  it('matches ids given as _id too', () => {
    const s = { _id: 's1', amount: 1000 };
    expect(getRefundableRemaining(s, [{ _id: 'x', amount: -400, refundTargetTransactionId: 's1' }])).toBe(600);
  });
});
