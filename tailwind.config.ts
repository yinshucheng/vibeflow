import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Notion-style semantic colors
        notion: {
          bg: {
            DEFAULT: 'var(--bg-default)',
            secondary: 'var(--bg-secondary)',
            tertiary: 'var(--bg-tertiary)',
            hover: 'var(--bg-hover)',
            active: 'var(--bg-active)',
          },
          text: {
            DEFAULT: 'var(--text-primary)',
            secondary: 'var(--text-secondary)',
            tertiary: 'var(--text-tertiary)',
            inverse: 'var(--text-inverse)',
          },
          border: {
            DEFAULT: 'var(--border-default)',
            strong: 'var(--border-strong)',
          },
          accent: {
            blue: 'var(--accent-blue)',
            'blue-bg': 'var(--accent-blue-bg)',
            red: 'var(--accent-red)',
            'red-bg': 'var(--accent-red-bg)',
            green: 'var(--accent-green)',
            'green-bg': 'var(--accent-green-bg)',
            orange: 'var(--accent-orange)',
            'orange-bg': 'var(--accent-orange-bg)',
            purple: 'var(--accent-purple)',
            'purple-bg': 'var(--accent-purple-bg)',
            gray: 'var(--accent-gray)',
            'gray-bg': 'var(--accent-gray-bg)',
          },
        },
      },
      borderRadius: {
        'notion-sm': 'var(--radius-sm)',
        'notion-md': 'var(--radius-md)',
        'notion-lg': 'var(--radius-lg)',
        'notion-xl': 'var(--radius-xl)',
      },
      boxShadow: {
        'notion-sm': 'var(--shadow-sm)',
        'notion-md': 'var(--shadow-md)',
        'notion-lg': 'var(--shadow-lg)',
        'notion-dropdown': 'var(--shadow-dropdown)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      spacing: {
        'sidebar-expanded': 'var(--sidebar-width-expanded)',
        'sidebar-collapsed': 'var(--sidebar-width-collapsed)',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '200ms',
        slow: '300ms',
      },
    },
  },
  plugins: [],
};

export default config;
