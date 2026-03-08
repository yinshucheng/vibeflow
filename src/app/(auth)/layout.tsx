import '../globals.css';

export const metadata = {
  title: 'VibeFlow - Sign In',
  description: 'Sign in to VibeFlow',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-secondary)]">
          {children}
        </div>
      </body>
    </html>
  );
}
