/**
 * Auth layout — minimal wrapper for /login and /register pages.
 * Does NOT re-define html/body (root layout provides those).
 * Does NOT include Header/Sidebar/Chat providers to avoid tRPC requests on auth pages.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-secondary)]">
      {children}
    </div>
  );
}
