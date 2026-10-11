import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../src/utils/jwt.js';

describe('Stateless JWT Authentication Utility (ADR 0044 & ADR 0046)', () => {
  const secret = 'super-secret-test-key-256-bit-long-enough';
  const payload = { userId: 'user_12345', email: 'alice@example.com' };

  it('signs and verifies a valid token successfully', () => {
    const token = signToken(payload, secret, 14);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const verified = verifyToken(token, secret);
    expect(verified).not.toBeNull();
    expect(verified.userId).toBe(payload.userId);
    expect(verified.email).toBe(payload.email);
    expect(typeof verified.exp).toBe('number');
  });

  it('rejects verification if token is signed with a different secret', () => {
    const token = signToken(payload, secret, 14);
    const badVerify = verifyToken(token, 'attacker-different-secret');
    expect(badVerify).toBeNull();
  });

  it('rejects tampered tokens', () => {
    const token = signToken(payload, secret, 14);
    const [header, body, sig] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ userId: 'attacker_id', email: 'alice@example.com' })).toString('base64url');
    const tamperedToken = `${header}.${tamperedPayload}.${sig}`;

    const verified = verifyToken(tamperedToken, secret);
    expect(verified).toBeNull();
  });

  it('rejects malformed token strings', () => {
    expect(verifyToken('not-a-token', secret)).toBeNull();
    expect(verifyToken('', secret)).toBeNull();
    expect(verifyToken(null, secret)).toBeNull();
    expect(verifyToken(undefined, secret)).toBeNull();
    expect(verifyToken('a.b', secret)).toBeNull();
  });

  it('rejects expired tokens', () => {
    // Generate an expired token (expiresInDays = -1)
    const expiredToken = signToken(payload, secret, -1);
    const verified = verifyToken(expiredToken, secret);
    expect(verified).toBeNull();
  });
});
