/**
 * Theme System
 *
 * Provides light/dark theme support consistent with web version.
 *
 * Requirements: 9.3, 9.5
 */

import { useColorScheme } from 'react-native';

// =============================================================================
// COLOR DEFINITIONS
// =============================================================================

export const lightColors = {
  // Base colors
  background: '#FFFFFF',
  surface: '#F8F9FA',
  card: '#FFFFFF',

  // Text colors
  text: '#1A1A1A',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Brand colors
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',

  // Status colors
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Border colors
  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  // Priority colors
  priorityP1: '#EF4444',
  priorityP2: '#F59E0B',
  priorityP3: '#6B7280',
};

export const darkColors = {
  // Base colors
  background: '#0F172A',
  surface: '#1E293B',
  card: '#1E293B',

  // Text colors
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  // Brand colors
  primary: '#818CF8',
  primaryLight: '#A5B4FC',
  primaryDark: '#6366F1',

  // Status colors
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#60A5FA',

  // Border colors
  border: '#334155',
  borderLight: '#1E293B',

  // Priority colors
  priorityP1: '#F87171',
  priorityP2: '#FBBF24',
  priorityP3: '#94A3B8',
};

// =============================================================================
// THEME TYPE
// =============================================================================

export interface Theme {
  isDark: boolean;
  colors: typeof lightColors;
}

// =============================================================================
// THEME HOOK
// =============================================================================

/**
 * Hook to get current theme based on system color scheme
 */
export function useTheme(): Theme {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return {
    isDark,
    colors: isDark ? darkColors : lightColors,
  };
}

/**
 * Get theme colors without hook (for non-component use)
 */
export function getThemeColors(isDark: boolean): typeof lightColors {
  return isDark ? darkColors : lightColors;
}

// =============================================================================
// SPACING
// =============================================================================

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 32,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
} as const;

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;
