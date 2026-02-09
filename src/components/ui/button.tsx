'use client';

/**
 * Button Component
 *
 * Notion-style button with variants and sizes.
 */

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Icons } from '@/lib/icons';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-notion-accent-blue text-notion-text-inverse hover:opacity-90 shadow-notion-sm',
  secondary:
    'bg-notion-bg-tertiary text-notion-text hover:bg-notion-bg-hover border border-notion-border',
  outline:
    'border border-notion-border-strong text-notion-text hover:bg-notion-bg-hover',
  ghost:
    'text-notion-text-secondary hover:bg-notion-bg-hover hover:text-notion-text',
  danger:
    'bg-notion-accent-red text-notion-text-inverse hover:opacity-90',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-9 px-4 text-sm gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const LoaderIcon = Icons.loader;

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`
          inline-flex items-center justify-center font-medium
          rounded-notion-md
          transition-all duration-fast
          focus:outline-none focus-visible:ring-2 focus-visible:ring-notion-accent-blue focus-visible:ring-offset-1
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `}
        {...props}
      >
        {isLoading && <LoaderIcon className="h-3.5 w-3.5 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
