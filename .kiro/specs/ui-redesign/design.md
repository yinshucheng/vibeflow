# UI Redesign Technical Design

## 概述

本文档描述 VibeFlow UI 重设计的技术实现方案。

---

## 设计系统架构

```
src/
├── styles/
│   ├── tokens/
│   │   ├── colors.ts        # 颜色变量
│   │   ├── typography.ts    # 字体系统
│   │   ├── spacing.ts       # 间距系统
│   │   ├── shadows.ts       # 阴影系统
│   │   └── animations.ts    # 动效系统
│   ├── themes/
│   │   ├── dark.ts          # 深色主题
│   │   └── light.ts         # 浅色主题
│   └── globals.css          # 全局样式
├── components/
│   ├── ui/                   # 基础 UI 组件
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── progress.tsx
│   │   └── ...
│   └── ...
└── lib/
    └── cn.ts                 # className 工具函数
```

---

## Design Tokens 定义

### 颜色系统

```typescript
// src/styles/tokens/colors.ts
export const colors = {
  // 品牌色
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',  // 主色
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
  },

  // 语义色
  semantic: {
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },

  // 中性色（深色主题）
  neutral: {
    0: '#ffffff',
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    850: '#1f1f23',
    900: '#18181b',
    950: '#09090b',
  },

  // 状态机颜色
  state: {
    locked: '#6b7280',    // gray
    planning: '#8b5cf6',  // purple
    focus: '#ef4444',     // red
    rest: '#22c55e',      // green
  },

  // 优先级颜色
  priority: {
    p1: '#ef4444',  // 紧急 - 红色
    p2: '#f59e0b',  // 重要 - 橙色
    p3: '#6b7280',  // 普通 - 灰色
  },
}
```

### 字体系统

```typescript
// src/styles/tokens/typography.ts
export const typography = {
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'Menlo', 'monospace'],
  },

  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],      // 12px
    sm: ['0.875rem', { lineHeight: '1.25rem' }],  // 14px
    base: ['1rem', { lineHeight: '1.5rem' }],     // 16px
    lg: ['1.125rem', { lineHeight: '1.75rem' }],  // 18px
    xl: ['1.25rem', { lineHeight: '1.75rem' }],   // 20px
    '2xl': ['1.5rem', { lineHeight: '2rem' }],    // 24px
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30px
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }], // 36px
    timer: ['4rem', { lineHeight: '1' }],         // 64px - 计时器专用
  },

  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
}
```

### 间距系统

```typescript
// src/styles/tokens/spacing.ts
export const spacing = {
  px: '1px',
  0: '0',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  8: '2rem',        // 32px
  10: '2.5rem',     // 40px
  12: '3rem',       // 48px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
}
```

### 阴影系统

```typescript
// src/styles/tokens/shadows.ts
export const shadows = {
  // 深色主题阴影（更微妙）
  dark: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.3)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.4)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.4)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.4)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.4), 0 8px 10px -6px rgb(0 0 0 / 0.4)',
  },

  // 发光效果（用于强调）
  glow: {
    primary: '0 0 20px rgb(14 165 233 / 0.3)',
    success: '0 0 20px rgb(34 197 94 / 0.3)',
    error: '0 0 20px rgb(239 68 68 / 0.3)',
  },

  // 内阴影（用于输入框等）
  inner: {
    DEFAULT: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.3)',
  },
}
```

### 动效系统

```typescript
// src/styles/tokens/animations.ts
export const animations = {
  duration: {
    instant: '0ms',
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
  },

  easing: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },

  // 预定义动画
  keyframes: {
    fadeIn: {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
    slideUp: {
      from: { transform: 'translateY(10px)', opacity: 0 },
      to: { transform: 'translateY(0)', opacity: 1 },
    },
    pulse: {
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0.5 },
    },
    spin: {
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
  },
}
```

---

## Tailwind 配置扩展

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'
import { colors, typography, spacing, shadows, animations } from './src/styles/tokens'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ...colors,
        // 语义化别名
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        border: 'var(--border)',
        ring: 'var(--ring)',
      },
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize,
      fontWeight: typography.fontWeight,
      spacing: spacing,
      boxShadow: shadows.dark,
      animation: {
        'fade-in': 'fadeIn 300ms ease-out',
        'slide-up': 'slideUp 300ms ease-out',
        'pulse-slow': 'pulse 2s ease-in-out infinite',
      },
      keyframes: animations.keyframes,
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
}

export default config
```

---

## 核心组件设计

### Button 组件

```tsx
// src/components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary-500 text-white hover:bg-primary-600 shadow-sm',
        secondary: 'bg-neutral-800 text-neutral-100 hover:bg-neutral-700 border border-neutral-700',
        ghost: 'hover:bg-neutral-800 text-neutral-300',
        danger: 'bg-red-500 text-white hover:bg-red-600',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
```

### Progress 组件（计时器用）

```tsx
// src/components/ui/progress-ring.tsx
interface ProgressRingProps {
  progress: number  // 0-100
  size?: number
  strokeWidth?: number
  className?: string
}

export function ProgressRing({
  progress,
  size = 200,
  strokeWidth = 8,
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className={className}>
      {/* 背景圆环 */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-neutral-800"
      />
      {/* 进度圆环 */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-primary-500 transition-all duration-300"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}
```

### Badge 组件

```tsx
// src/components/ui/badge.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-neutral-800 text-neutral-300',
        primary: 'bg-primary-500/20 text-primary-400',
        success: 'bg-green-500/20 text-green-400',
        warning: 'bg-yellow-500/20 text-yellow-400',
        error: 'bg-red-500/20 text-red-400',
      },
      priority: {
        p1: 'bg-red-500/20 text-red-400',
        p2: 'bg-yellow-500/20 text-yellow-400',
        p3: 'bg-neutral-700 text-neutral-400',
      },
      state: {
        locked: 'bg-gray-500/20 text-gray-400',
        planning: 'bg-purple-500/20 text-purple-400',
        focus: 'bg-red-500/20 text-red-400',
        rest: 'bg-green-500/20 text-green-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, priority, state, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, priority, state, className }))}
      {...props}
    />
  )
}
```

---

## 页面布局模板

### Dashboard 布局

```tsx
// 推荐的 Dashboard 布局结构
<div className="min-h-screen bg-neutral-950 text-neutral-100">
  {/* Header */}
  <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-sm">
    <div className="container flex h-14 items-center justify-between">
      {/* Logo + Nav */}
      {/* User Menu */}
    </div>
  </header>

  {/* Main Content */}
  <main className="container py-6">
    {/* 状态概览卡片 */}
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>...</Card>
    </section>

    {/* 主要内容区 */}
    <section className="mt-6 grid gap-6 lg:grid-cols-3">
      {/* 任务列表 - 2列 */}
      <div className="lg:col-span-2">...</div>
      {/* 侧边栏 - 1列 */}
      <aside>...</aside>
    </section>
  </main>
</div>
```

---

## 迁移策略

### Phase 1: 基础设施
1. 配置 design tokens
2. 扩展 Tailwind 配置
3. 安装 class-variance-authority
4. 创建 cn() 工具函数

### Phase 2: 核心组件
1. Button, Input, Card
2. Badge, Progress
3. Modal, Toast

### Phase 3: 页面改造
1. Dashboard 首页
2. Pomodoro 计时器
3. 任务列表
4. 设置页面

### Phase 4: 动效增强
1. 安装 Framer Motion
2. 状态切换动画
3. 列表动画
4. 页面过渡

---

## 依赖项

```json
{
  "dependencies": {
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "framer-motion": "^11.0.0",
    "tailwindcss-animate": "^1.0.7"
  }
}
```
