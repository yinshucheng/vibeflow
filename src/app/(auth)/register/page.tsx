'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';

const registerSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setErrors({});
    setGlobalError('');

    // Client-side validation
    const result = registerSchema.safeParse({ email, password, confirmPassword });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      // 1. Register via API
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.code === 'CONFLICT') {
          setGlobalError('An account with this email already exists');
        } else if (data.error?.details) {
          setErrors(
            Object.fromEntries(
              Object.entries(data.error.details).map(([k, v]) => [
                k,
                Array.isArray(v) ? v[0] : String(v),
              ])
            )
          );
        } else {
          setGlobalError(data.error?.message || 'Registration failed');
        }
        return;
      }

      // 2. Auto sign-in after registration
      const signInResult = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        setGlobalError('Account created but sign-in failed. Please sign in manually.');
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setGlobalError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-[var(--bg-default)] rounded-[var(--radius-xl)] shadow-[var(--shadow-md)] p-8">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] text-center mb-6">
          Create your account
        </h1>

        {globalError && (
          <div className="mb-4 p-3 text-sm text-[var(--accent-red)] bg-[var(--accent-red-bg)] rounded-[var(--radius-md)]">
            {globalError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-default)] border border-[var(--border-default)] rounded-[var(--radius-md)] outline-none focus:border-[var(--accent-blue)] transition-colors"
              placeholder="you@example.com"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-[var(--accent-red)]">{errors.email}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-default)] border border-[var(--border-default)] rounded-[var(--radius-md)] outline-none focus:border-[var(--accent-blue)] transition-colors"
              placeholder="At least 8 characters"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-[var(--accent-red)]">{errors.password}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-default)] border border-[var(--border-default)] rounded-[var(--radius-md)] outline-none focus:border-[var(--accent-blue)] transition-colors"
              placeholder="Repeat your password"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-[var(--accent-red)]">
                {errors.confirmPassword}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 text-sm font-medium text-[var(--text-inverse)] bg-[var(--accent-blue)] rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">
          Already have an account?{' '}
          <Link
            href={callbackUrl !== '/' ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login'}
            className="text-[var(--accent-blue)] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
