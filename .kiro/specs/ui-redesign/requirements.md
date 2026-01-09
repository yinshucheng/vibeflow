# UI Redesign Requirements

## 背景

VibeFlow 作为 AI-Native Output Engine，功能已经比较完善（Web + Desktop + Browser Extension），但 UI 风格还比较原始，需要进行系统性的视觉升级。

## 目标

1. 建立统一的设计系统（Design System）
2. 提升视觉层次和信息密度
3. 增强状态反馈和交互体验
4. 保持多端一致性（Web / Desktop / Mobile）

---

## 设计方向选项

### 方向 A: Glassmorphism（毛玻璃风格）
- 特点：半透明背景 + 模糊效果 + 微妙边框
- 适合：专注/冥想类应用，营造沉浸感
- 参考：macOS Big Sur, iOS Control Center
- 技术：`backdrop-filter: blur()`, 渐变边框

### 方向 B: Minimal Dark（极简深色）
- 特点：深色背景 + 高对比度强调色 + 大量留白
- 适合：减少视觉干扰，专注工作场景
- 参考：Linear, Raycast, Arc Browser
- 技术：CSS 变量主题系统，语义化颜色

### 方向 C: Soft UI / Neumorphism（新拟态）
- 特点：柔和的凸起/凹陷效果，类似实体按钮
- 适合：计时器、进度条等交互元素
- 参考：早期 Dribbble 设计
- 技术：多层 box-shadow

### 方向 D: Notion-like（内容优先）
- 特点：简洁留白，内容为王，轻量级装饰
- 适合：任务管理、文档编辑场景
- 参考：Notion, Craft, Obsidian
- 技术：Typography-first 设计

### 方向 E: 混合风格（推荐）
- 主体：Minimal Dark 作为基础
- 计时器：Glassmorphism 增强沉浸感
- 任务列表：Notion-like 提高可读性
- 状态指示：微妙的 Neumorphism 效果

---

## 核心改进区域

### 1. 状态机可视化
当前状态：LOCKED → PLANNING → FOCUS → REST
- [ ] 状态切换的视觉反馈（颜色、图标、动效）
- [ ] 当前状态的强调展示
- [ ] 状态转换的过渡动画

### 2. Pomodoro 计时器
- [ ] 圆形/环形进度指示器
- [ ] 时间数字的排版优化
- [ ] 专注模式的全屏/沉浸式视图
- [ ] 休息时间的差异化视觉

### 3. 任务列表
- [ ] 优先级的视觉区分（P1/P2/P3）
- [ ] 任务状态的图标和颜色
- [ ] 子任务的层级缩进
- [ ] 拖拽排序的交互反馈

### 4. Dashboard 首页
- [ ] 今日概览卡片布局
- [ ] 生产力统计图表
- [ ] 快捷操作入口
- [ ] 空状态设计

### 5. 桌面端 Tray 菜单
- [ ] 信息密度优化
- [ ] 快捷操作按钮
- [ ] 状态指示器
- [ ] 深色/浅色主题适配

### 6. 设置页面
- [ ] 分组和层级结构
- [ ] 开关和滑块样式
- [ ] 表单输入优化

---

## 设计系统组件

### 基础 Tokens
- [ ] 颜色系统（Primary, Secondary, Accent, Semantic）
- [ ] 字体系统（Font Family, Size Scale, Weight）
- [ ] 间距系统（Spacing Scale: 4px base）
- [ ] 圆角系统（Border Radius Scale）
- [ ] 阴影系统（Elevation Levels）
- [ ] 动效系统（Duration, Easing）

### 组件库
- [ ] Button（Primary, Secondary, Ghost, Danger）
- [ ] Input（Text, Number, Select, Checkbox, Toggle）
- [ ] Card（Default, Elevated, Interactive）
- [ ] Badge（Status, Priority, Count）
- [ ] Progress（Linear, Circular, Timer）
- [ ] Modal / Dialog
- [ ] Toast / Notification
- [ ] Tooltip
- [ ] Dropdown Menu
- [ ] Tabs
- [ ] List Item

---

## 技术实现路径

### 选项 1: 扩展现有 Tailwind
- 在 `tailwind.config.ts` 中定义 design tokens
- 创建自定义 utility classes
- 优点：渐进式改进，风险低
- 缺点：可能不够系统化

### 选项 2: 引入 shadcn/ui
- 基于 Radix UI 的无样式组件
- 可定制的组件源码
- 优点：组件质量高，可访问性好
- 缺点：需要迁移现有组件

### 选项 3: 引入 Framer Motion
- 专注于动效和过渡
- 与现有组件库配合使用
- 优点：动效体验提升明显
- 缺点：增加 bundle size

### 选项 4: 自建设计系统
- 从零构建组件库
- 完全控制设计细节
- 优点：高度定制化
- 缺点：工作量大

### 推荐方案
1. 基于 Tailwind 定义 design tokens
2. 引入 shadcn/ui 替换核心组件
3. 使用 Framer Motion 增强关键动效
4. 渐进式迁移，保持功能稳定

---

## 参考产品

### 专注/效率类
- **Forest** - 游戏化专注，可爱风格
- **Centered** - 极简专注，深色主题
- **Session** - macOS 原生风格
- **Flow** - Pomodoro + 任务管理

### 任务管理类
- **Linear** - 极简高效，键盘优先
- **Notion** - 内容优先，模块化
- **Things 3** - 精致细节，原生体验
- **Todoist** - 清晰层级，跨平台一致

### 设计系统参考
- **Radix UI** - 无样式组件，可访问性
- **shadcn/ui** - 可复制的组件代码
- **Tailwind UI** - 官方组件模板
- **Vercel Design** - 极简现代风格

---

## 验收标准

1. 建立完整的 design tokens 文档
2. 核心组件库覆盖率 > 80%
3. 所有页面视觉一致性
4. 深色/浅色主题支持
5. 响应式布局适配
6. 动效流畅度 60fps
7. 可访问性 WCAG 2.1 AA 级别

---

## 待确认事项

- [ ] 品牌主色调偏好？
- [ ] 是否需要浅色主题？
- [ ] 优先改进哪个场景？
- [ ] 是否有喜欢的参考产品？
- [ ] 动效程度偏好（简约 vs 丰富）？
