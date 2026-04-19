'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }



  return (
    <div className="w-full max-w-sm">
      <div className="bg-[var(--bg-default)] rounded-[var(--radius-xl)] shadow-[var(--shadow-md)] p-8">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] text-center mb-6">
          Sign in to VibeFlow
        </h1>

        {error && (
          <div className="mb-4 p-3 text-sm text-[var(--accent-red)] bg-[var(--accent-red-bg)] rounded-[var(--radius-md)]">
            {error}
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
              autoComplete="current-password"
              className="w-full px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-default)] border border-[var(--border-default)] rounded-[var(--radius-md)] outline-none focus:border-[var(--accent-blue)] transition-colors"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 text-sm font-medium text-[var(--text-inverse)] bg-[var(--accent-blue)] rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">
          Don&apos;t have an account?{' '}
          <Link
            href={callbackUrl !== '/' ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/register'}
            className="text-[var(--accent-blue)] hover:underline"
          >
            Sign up
          </Link>
        </p>

      </div>
    </div>
  );
}
