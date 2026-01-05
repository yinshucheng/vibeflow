# VibeFlow iOS

iOS 客户端 - 只读状态显示与专注模式 App 屏蔽

## 功能特性

- 📊 实时显示番茄钟状态（从服务器同步）
- 📋 显示今日任务和 Top 3 任务
- 🚫 专注模式自动屏蔽干扰 App（微信、微博、抖音等）
- 🔔 番茄钟完成和休息结束通知
- 🌙 支持 Light/Dark 主题
- 📴 离线模式显示缓存数据

## 重要说明

**所有数据操作都是只读的** - iOS 端不向服务器写入任何状态。

- 无法开始/暂停/停止番茄钟
- 无法创建/编辑/完成任务
- 无法修改任何设置
- 所有操作请在 Web 端完成

## 开发环境

### 前置要求

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS 模拟器或真机（需要 Xcode）
- VibeFlow 服务器运行中

### 安装

```bash
cd vibeflow-ios
npm install
```

### 运行

```bash
# 启动 Expo 开发服务器
npx expo start

# 在 iOS 模拟器运行
npx expo start --ios
```

### 测试

```bash
npm test
```

## 配置

### 服务器连接

编辑 `src/config/auth.ts` 配置服务器地址：

```typescript
export const SERVER_URL = 'http://localhost:3000';
```

### 默认用户

开发模式使用默认用户 `test@example.com`，通过 `X-Dev-User-Email` header 认证。

## 项目结构

```
vibeflow-ios/
├── src/
│   ├── components/     # UI 组件
│   ├── config/         # 配置文件
│   ├── navigation/     # 导航配置
│   ├── screens/        # 屏幕组件
│   ├── services/       # 业务服务
│   ├── store/          # Zustand 状态管理
│   ├── theme/          # 主题系统
│   ├── types/          # TypeScript 类型
│   └── utils/          # 工具函数
├── ios/                # iOS 原生代码
│   └── ScreenTimeBridge/  # Screen Time API 桥接
└── __tests__/          # 测试文件
```

## Screen Time 集成

App 屏蔽功能使用 iOS Screen Time API (Family Controls)。

### 授权流程

1. 首次启动时请求 Screen Time 授权
2. 用户需在系统设置中授权
3. 授权后自动在专注模式启用屏蔽

### 默认屏蔽应用

- 微信 (com.tencent.xin)
- 微博 (com.sina.weibo)
- 抖音 (com.ss.iphone.ugc.Aweme)
- 小红书 (com.xingin.discover)
- B站 (tv.danmaku.bilianime)

## 技术栈

- React Native (Expo managed workflow)
- TypeScript
- Zustand (状态管理)
- Socket.io (WebSocket 通信)
- React Navigation (导航)
- expo-notifications (本地通知)
