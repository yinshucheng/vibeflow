'use client';

/**
 * Sidebar Component
 *
 * Notion-style collapsible sidebar with smooth transitions.
 */

import { useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/contexts/sidebar-context';
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

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggle, setHovering, effectiveWidth, showLabels } = useSidebar();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleMouseEnter = () => {
    if (isCollapsed) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setHovering(true), 200);
    }
  };

  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    setHovering(false);
  };

  const LogoIcon = Icons.logo;
  const ChevronIcon = isCollapsed ? Icons.chevronRight : Icons.chevronLeft;

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 flex flex-col bg-notion-bg-secondary border-r border-notion-border transition-all duration-normal"
      style={{ width: effectiveWidth }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header */}
      <div className="flex items-center h-12 px-3 border-b border-notion-border shrink-0">
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          <LogoIcon className="w-5 h-5 text-notion-text-secondary shrink-0" />
          {showLabels && (
            <span className="font-semibold text-notion-text text-sm whitespace-nowrap truncate">
              VibeFlow
            </span>
          )}
        </div>
        {showLabels && (
          <button
            onClick={toggle}
            className="ml-auto p-1.5 rounded-notion-md hover:bg-notion-bg-hover text-notion-text-tertiary transition-colors duration-fast"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-0.5 p-2 overflow-y-auto">
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
              {showLabels && (
                <span className="whitespace-nowrap overflow-hidden truncate">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
