# VibeFlow Browser Sentinel

Chrome 浏览器扩展，用于追踪浏览活动并在专注模式下强制执行网站拦截策略。

## 功能特性

- **活动追踪**: 监控浏览器标签页 URL 和停留时长
- **专注模式拦截**: 在 FOCUS 状态下自动拦截黑名单网站
- **白名单支持**: 允许工作相关网站在专注模式下访问
- **软干预**: 对未知网站弹出确认框询问是否与当前任务相关
- **实时同步**: 通过 WebSocket 与 VibeFlow 服务器保持策略同步

---

## 用户使用指南

### 第一步：安装扩展

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `browser-sentinel` 文件夹

### 第二步：连接到 VibeFlow 服务器

1. 点击浏览器工具栏中的 VibeFlow 图标打开弹窗
2. 输入服务器地址（默认: `http://localhost:3000`）
3. 输入你的邮箱地址
4. 点击「Connect」按钮

### 第三步：配置黑白名单

在 VibeFlow Web 应用的设置页面 (`/settings`) 中配置：

- **黑名单 (Blacklist)**: 专注模式下需要拦截的网站
  - 例如: `youtube.com`, `twitter.com`, `*.reddit.com`
- **白名单 (Whitelist)**: 专注模式下允许访问的工作网站
  - 例如: `github.com`, `stackoverflow.com`, `docs.google.com`

### 使用流程

#### 正常浏览 (PLANNING 状态)
- 所有网站正常访问
- 扩展在后台记录浏览活动

#### 专注模式 (FOCUS 状态)
当你在 VibeFlow 中启动番茄钟后：

1. **黑名单网站** → 自动重定向到屏保页面
2. **白名单网站** → 正常访问
3. **未知网站** → 弹出确认框：
   - 点击「Yes, it's work-related」→ 临时允许访问（本次番茄钟有效）
   - 点击「No, take me back」→ 返回上一页
   - 10秒无操作 → 自动返回

### 扩展弹窗功能

点击工具栏图标可以查看：
- 连接状态（已连接/未连接）
- 当前系统状态（LOCKED/PLANNING/FOCUS/REST）
- 今日完成的番茄钟数量
- 每日上限
- 当前任务名称

---

## 开发者指南

### 环境要求

- Node.js 18+
- npm 或 yarn

### 构建步骤

```bash
cd browser-sentinel
npm install
npm run build
```

### 开发命令

```bash
# 监听模式（自动重新编译）
npm run watch

# 完整重新构建
npm run dev

# 清理构建产物
npm run clean
```

### 项目结构

```
browser-sentinel/
├── manifest.json          # Chrome Extension Manifest V3 配置
├── package.json           # 依赖配置
├── tsconfig.json          # TypeScript 配置
├── src/
│   ├── background/        # Service Worker (后台脚本)
│   │   └── service-worker.ts
│   ├── content/           # Content Script (内容脚本)
│   │   ├── overlay.ts     # 软干预弹窗
│   │   └── overlay.css
│   ├── popup/             # 扩展弹窗
│   │   └── popup.ts
│   ├── lib/               # 共享工具库
│   │   ├── activity-tracker.ts  # 活动追踪
│   │   ├── policy-manager.ts    # 策略管理
│   │   ├── policy-cache.ts      # 策略缓存
│   │   └── websocket.ts         # WebSocket 客户端
│   └── types/
│       └── index.ts       # TypeScript 类型定义
├── popup/                 # 弹窗 HTML/CSS
│   ├── index.html
│   └── styles.css
├── rules/                 # 声明式网络请求规则
│   └── blocking_rules.json
├── icons/                 # 扩展图标
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── screensaver.html       # 专注模式屏保页面
```

### 配置说明

扩展通过 WebSocket 连接到 VibeFlow 服务器：

- **默认服务器**: `http://localhost:3000`
- **WebSocket 端口**: 与主服务器相同（通过 Socket.io）

### 图标要求

`icons/` 目录需要包含以下 PNG 文件：
- `icon16.png` (16x16 像素)
- `icon32.png` (32x32 像素)
- `icon48.png` (48x48 像素)
- `icon128.png` (128x128 像素)

---

## 故障排除

### 扩展无法连接到服务器
1. 确保 VibeFlow 服务器正在运行 (`npm run dev`)
2. 检查服务器地址是否正确
3. 确保邮箱地址与 VibeFlow 中的用户匹配

### 网站没有被拦截
1. 确认当前处于 FOCUS 状态（启动了番茄钟）
2. 检查黑名单配置是否正确
3. 刷新扩展：在 `chrome://extensions/` 点击刷新按钮

### 弹窗显示「Disconnected」
1. 检查网络连接
2. 重新输入服务器地址并连接
3. 查看浏览器控制台是否有错误信息

---

## License

MIT
