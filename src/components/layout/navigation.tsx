'use client';

/**
 * Navigation Component
 * 
 * Main navigation sidebar for VibeFlow.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/airlock', label: 'Airlock', icon: '🌅' },
  { href: '/pomodoro', label: 'Pomodoro', icon: '🍅' },
  { href: '/projects', label: 'Projects', icon: '📁' },
  { href: '/tasks', label: 'Tasks', icon: '✅' },
  { href: '/goals', label: 'Goals', icon: '🎯' },
  { href: '/stats', label: 'Stats', icon: '📊' },
  { href: '/timeline', label: 'Timeline', icon: '📅' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-2">
      {navItems.map((item) => {
        const isActive = pathname === item.href || 
          (item.href !== '/' && pathname.startsWith(item.href));
        
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
              transition-colors duration-150
              ${isActive 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }
            `}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * MobileNavigation - Bottom navigation for mobile devices
 */
export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden">
      <div className="flex justify-around py-2">
        {navItems.slice(0, 4).map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex flex-col items-center gap-1 px-3 py-1 text-xs
                ${isActive ? 'text-blue-600' : 'text-gray-500'}
              `}
            >
              <span className="text-xl">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
