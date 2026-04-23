import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock next-auth/jwt before importing the module
vi.mock('next-auth/jwt', () => ({
  decode: vi.fn(),
}));

import { decodeSessionFromCookies } from './session-token';
import { decode } from 'next-auth/jwt';

const mockedDecode = vi.mocked(decode);

describe('decodeSessionFromCookies', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXTAUTH_SECRET: 'test-secret',
      NEXTAUTH_URL: 'http://localhost:3000',
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns null for empty cookie header', async () => {
    expect(await decodeSessionFromCookies('')).toBeNull();
  });

  it('returns null when NEXTAUTH_SECRET is not set', async () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(await decodeSessionFromCookies('next-auth.session-token=abc')).toBeNull();
  });

  it('returns null when session cookie is not present', async () => {
    expect(await decodeSessionFromCookies('other-cookie=value; another=123')).toBeNull();
  });

  it('decodes valid session cookie (non-secure)', async () => {
    mockedDecode.mockResolvedValue({ id: 'user-1', email: 'test@example.com' } as never);

    const result = await decodeSessionFromCookies(
      'other=value; next-auth.session-token=eyJhbGciOiJ...; csrf=abc'
    );

    expect(result).toEqual({ id: 'user-1', email: 'test@example.com' });
    expect(mockedDecode).toHaveBeenCalledWith({
      token: 'eyJhbGciOiJ...',
      secret: 'test-secret',
    });
  });

  it('handles secure cookie name for HTTPS URLs', async () => {
    process.env.NEXTAUTH_URL = 'https://app.vibeflow.com';
    mockedDecode.mockResolvedValue({ id: 'user-2', email: 'secure@example.com' } as never);

    const result = await decodeSessionFromCookies(
      '__Secure-next-auth.session-token=eyJ...; other=val'
    );

    expect(result).toEqual({ id: 'user-2', email: 'secure@example.com' });
  });

  it('handles cookie values containing equals signs', async () => {
    mockedDecode.mockResolvedValue({ id: 'user-3', email: 'eq@example.com' } as never);

    const result = await decodeSessionFromCookies(
      'next-auth.session-token=eyJ.token=with=equals'
    );

    expect(result).toEqual({ id: 'user-3', email: 'eq@example.com' });
    expect(mockedDecode).toHaveBeenCalledWith({
      token: 'eyJ.token=with=equals',
      secret: 'test-secret',
    });
  });

  it('returns null when decoded token lacks id', async () => {
    mockedDecode.mockResolvedValue({ email: 'no-id@example.com' } as never);

    expect(await decodeSessionFromCookies('next-auth.session-token=abc')).toBeNull();
  });

  it('returns null when decoded token lacks email', async () => {
    mockedDecode.mockResolvedValue({ id: 'user-1' } as never);

    expect(await decodeSessionFromCookies('next-auth.session-token=abc')).toBeNull();
  });

  it('returns null when decode throws', async () => {
    mockedDecode.mockRejectedValue(new Error('Invalid token'));

    expect(await decodeSessionFromCookies('next-auth.session-token=bad-token')).toBeNull();
  });

  it('returns null when decode returns null', async () => {
    mockedDecode.mockResolvedValue(null as never);

    expect(await decodeSessionFromCookies('next-auth.session-token=expired')).toBeNull();
  });
});
