# UI Redesign Tasks

## 状态说明
- [ ] 待开始
- [x] 已完成
- [~] 进行中

---

## Phase 1: 基础设施搭建

### 1.1 Design Tokens 配置
- [ ] 创建 `src/styles/tokens/` 目录结构
- [ ] 定义颜色系统 (`colors.ts`)
- [ ] 定义字体系统 (`typography.ts`)
- [ ] 定义间距系统 (`spacing.ts`)
- [ ] 定义阴影系统 (`shadows.ts`)
- [ ] 定义动效系统 (`animations.ts`)

### 1.2 Tailwind 扩展
- [ ] 更新 `tailwind.config.ts` 引入 tokens
- [ ] 配置 CSS 变量主题系统
- [ ] 添加自定义 utility classes

### 1.3 工具函数
- [ ] 安装 `class-variance-authority`
- [ ] 安装 `clsx` + `tailwind-merge`
- [ ] 创建 `cn()` 工具函数

---

## Phase 2: 核心组件库

### 2.1 基础组件
- [ ] Button (Primary, Secondary, Ghost, Danger)
- [ ] Input (Text, Number, Textarea)
- [ ] Select / Dropdown
- [ ] Checkbox / Toggle
- [ ] Card (Default, Elevated, Interactive)

### 2.2 反馈组件
- [ ] Badge (Status, Priority, State)
- [ ] Toast / Notification
- [ ] Modal / Dialog
- [ ] Tooltip
- [ ] Loading / Spinner

### 2.3 专用组件
- [ ] ProgressRing (计时器用)
- [ ] ProgressBar (线性进度)
- [ ] StateBadge (状态机专用)
- [ ] PriorityBadge (优先级专用)

---

## Phase 3: 页面改造

### 3.1 Dashboard 首页
- [ ] 整体布局重构
- [ ] 状态概览卡片
- [ ] 今日任务摘要
- [ ] 生产力统计图表
- [ ] 空状态设计

### 3.2 Pomodoro 计时器
- [ ] 圆形进度指示器
- [ ] 时间数字排版
- [ ] 状态切换动效
- [ ] 专注模式全屏视图
- [ ] 休息时间差异化视觉

### 3.3 任务列表
- [ ] 列表项样式优化
- [ ] 优先级视觉区分
- [ ] 状态图标和颜色
- [ ] 子任务层级展示
- [ ] 拖拽排序反馈

### 3.4 设置页面
- [ ] 分组和层级结构
- [ ] 表单控件样式
- [ ] 开关和滑块优化

### 3.5 桌面端 Tray
- [ ] 菜单样式优化
- [ ] 信息密度调整
- [ ] 状态指示器
- [ ] 深色/浅色适配

---

## Phase 4: 动效增强

### 4.1 基础动效
- [ ] 安装 Framer Motion
- [ ] 页面过渡动画
- [ ] 组件出现/消失动画

### 4.2 交互动效
- [ ] 按钮点击反馈
- [ ] 列表项动画
- [ ] 拖拽动画

### 4.3 状态动效
- [ ] 状态机切换动画
- [ ] 计时器进度动画
- [ ] 完成庆祝动效

---

## Phase 5: 主题系统

### 5.1 深色主题
- [ ] 完善深色主题变量
- [ ] 所有组件深色适配
- [ ] 对比度检查

### 5.2 浅色主题（可选）
- [ ] 定义浅色主题变量
- [ ] 组件浅色适配
- [ ] 主题切换功能

---

## Phase 6: 质量保证

### 6.1 可访问性
- [ ] 键盘导航支持
- [ ] 屏幕阅读器兼容
- [ ] 颜色对比度 WCAG AA
- [ ] Focus 状态可见

### 6.2 响应式
- [ ] 移动端适配
- [ ] 平板适配
- [ ] 大屏适配

### 6.3 性能
- [ ] 动效 60fps 检查
- [ ] Bundle size 优化
- [ ] 首屏加载优化

---

## 待决策事项

| 决策项 | 选项 | 状态 |
|--------|------|------|
| 主色调 | 蓝色 / 紫色 / 绿色 / 自定义 | 待定 |
| 是否需要浅色主题 | 是 / 否 | 待定 |
| 组件库方案 | shadcn/ui / 自建 / 混合 | 待定 |
| 动效库 | Framer Motion / CSS / 混合 | 待定 |
| 优先改造页面 | Dashboard / Pomodoro / 任务列表 | 待定 |

---

## 参考资源

- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Framer Motion](https://www.framer.com/motion/)
- [Radix UI](https://www.radix-ui.com/)
- [Linear Design](https://linear.app/)
