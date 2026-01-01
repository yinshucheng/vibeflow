'use client';

/**
 * MainLayout Component
 * 
 * Main application layout with sidebar navigation, header, and content area.
 * Requirements: 5.7, 9.8
 */

import { Header } from './header';
import { Navigation, MobileNavigation } from './navigation';

interface MainLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function MainLayout({ children, title }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-56 bg-white border-r border-gray-200 hidden md:block">
        <div className="flex items-center gap-2 h-14 px-4 border-b border-gray-200">
          <span className="text-2xl">🌊</span>
          <span className="font-semibold text-gray-900">VibeFlow</span>
        </div>
        <Navigation />
      </aside>

      {/* Main Content Area */}
      <div className="md:ml-56">
        <Header title={title} />
        
        <main className="p-4 pb-20 md:pb-4">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNavigation />
    </div>
  );
}

/**
 * PageHeader - Consistent page header with title and optional actions
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
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Card - Reusable card component
 */
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

/**
 * CardHeader - Card header section
 */
interface CardHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function CardHeader({ title, description, actions }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
      <div>
        <h3 className="font-medium text-gray-900">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500">{description}</p>
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
  return (
    <div className={`p-4 ${className}`}>
      {children}
    </div>
  );
}

/**
 * EmptyState - Empty state placeholder
 */
interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-4">{icon}</span>
      <h3 className="text-lg font-medium text-gray-900">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 max-w-sm">{description}</p>
      )}
      {action && (
        <div className="mt-4">{action}</div>
      )}
    </div>
  );
}
