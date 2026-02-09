'use client';

/**
 * MainLayout Component
 *
 * Notion-style main application layout with collapsible sidebar.
 * Requirements: 5.7, 9.8
 */

import { Header } from './header';
import { Sidebar } from './sidebar';
import { MobileNavigation } from './navigation';
import { useSidebar } from '@/contexts/sidebar-context';

interface MainLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function MainLayout({ children, title }: MainLayoutProps) {
  const { effectiveWidth } = useSidebar();

  return (
    <div className="min-h-screen bg-notion-bg">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <div
        className="transition-all duration-normal hidden md:block"
        style={{ marginLeft: effectiveWidth }}
      >
        <Header title={title} />

        <main className="p-6 max-w-5xl">{children}</main>
      </div>

      {/* Mobile Layout - Full width without sidebar */}
      <div className="md:hidden">
        <Header title={title} />

        <main className="p-4 pb-20">{children}</main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNavigation />
    </div>
  );
}

/**
 * PageHeader - Notion-style page header with title and optional actions
 */
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-notion-text">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-notion-text-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Card - Notion-style card component
 */
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-notion-bg rounded-notion-lg border border-notion-border shadow-notion-sm ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * CardHeader - Notion-style card header section
 */
interface CardHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function CardHeader({ title, description, actions }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-notion-border">
      <div>
        <h3 className="font-medium text-notion-text">{title}</h3>
        {description && (
          <p className="text-sm text-notion-text-secondary">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

/**
 * CardContent - Card content section
 */
export function CardContent({ children, className = '' }: CardProps) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

/**
 * EmptyState - Notion-style empty state placeholder
 */
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-4 text-notion-text-tertiary">{icon}</div>}
      <h3 className="text-lg font-medium text-notion-text">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-notion-text-secondary max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
