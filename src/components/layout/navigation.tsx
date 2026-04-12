'use client';

/**
 * Navigation Component
 *
 * Notion-style navigation with Lucide icons.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icons, type IconName } from '@/lib/icons';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: 'home' },
  { href: '/projects', label: 'Projects', icon: 'projects' },
  { href: '/tasks', label: 'Tasks', icon: 'tasks' },
  { href: '/goals', label: 'Goals', icon: 'goals' },
  { href: '/stats', label: 'Stats', icon: 'stats' },
  { href: '/timeline', label: 'Timeline', icon: 'timeline' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

// Export for use in other components
export { navItems };

/**
 * Navigation - Desktop sidebar navigation (legacy, use Sidebar instead)
 */
export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {navItems.map((item) => {
        const Icon = Icons[item.icon];
        const isActive =
          pathname === item.href ||
          (item.href !== '/' && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex items-center gap-2.5 px-2.5 py-1.5 rounded-notion-md
              text-sm font-medium transition-colors duration-fast
              ${
                isActive
                  ? 'bg-notion-bg-active text-notion-text'
                  : 'text-notion-text-secondary hover:bg-notion-bg-hover hover:text-notion-text'
              }
            `}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * MobileNavigation - Notion-style bottom navigation for mobile devices
 */
export function MobileNavigation() {
  const pathname = usePathname();

  // Show only 5 items on mobile for better UX
  const mobileItems = navItems.slice(0, 5);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-notion-bg border-t border-notion-border md:hidden z-50">
      <div className="flex justify-around py-2 px-1">
        {mobileItems.map((item) => {
          const Icon = Icons[item.icon];
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex flex-col items-center gap-1 px-3 py-1.5 rounded-notion-md
                text-xs transition-colors duration-fast min-w-0
                ${
                  isActive
                    ? 'text-notion-accent-blue'
                    : 'text-notion-text-tertiary hover:text-notion-text-secondary'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
