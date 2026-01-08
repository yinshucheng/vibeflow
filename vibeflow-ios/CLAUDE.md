# VibeFlow iOS - Development Guide

## Quick Start

```bash
cd vibeflow-ios

# Install dependencies
npm install

# Start Expo dev server (auto-detect Mac IP)
EXPO_PUBLIC_SERVER_HOST=$(ipconfig getifaddr en0) npm start
```

## Network Configuration

iOS 设备连接后端服务器需要正确配置 IP：

1. 获取 Mac 的局域网 IP：`ipconfig getifaddr en0`
2. 启动时设置环境变量：`EXPO_PUBLIC_SERVER_HOST=<your-ip> npm start`
3. 或修改 `src/config/index.ts` 中的 `SERVER_HOST` 默认值

常见问题：
- 如果显示错误 IP（如 `198.18.0.1`），可能是 VPN/代理导致
- 确保 Mac 和 iOS 设备在同一局域网
- 后端服务必须在 `0.0.0.0:3000` 监听（不是 `localhost`）

## Project Structure

```
vibeflow-ios/
├── src/
│   ├── config/       # 服务器配置、认证配置
│   ├── screens/      # 页面组件
│   ├── components/   # 可复用组件
│   ├── services/     # API 和 Socket 服务
│   └── stores/       # 状态管理
├── app.json          # Expo 配置
└── package.json
```

## Development Rules

1. **类型安全**: 使用 `ReturnType<typeof setInterval>` 而非 `NodeJS.Timeout`
2. **配置优先**: 服务器地址通过环境变量配置，不硬编码
3. **离线优先**: 考虑网络断开场景，使用本地缓存
