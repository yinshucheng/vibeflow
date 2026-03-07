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
├── modules/screen-time/  # Expo Native Module (FamilyControls/ManagedSettings)
├── targets/              # App Extension 源码模板 (prebuild 时自动注入)
│   ├── shield-config/    # ShieldConfigurationExtension
│   └── device-activity-monitor/  # DeviceActivityMonitorExtension
├── plugins/              # Expo Config Plugins
│   ├── withFamilyControls.js       # 主 App entitlements
│   └── withScreenTimeExtensions.js # Extension targets 自动注入
├── app.json          # Expo 配置
└── package.json
```

## iOS App Extensions (Screen Time)

Extension targets 通过 Config Plugin (`plugins/withScreenTimeExtensions.js`) 在 `npx expo prebuild` 时自动注入到 Xcode 项目中，**不需要手动 Xcode 操作**。

### 工作原理

1. Extension 源码存放在 `targets/` 目录（提交到 Git）
2. `npx expo prebuild` 时，Config Plugin 会：
   - 复制 Swift 源码 + Info.plist + entitlements 到 `ios/` 目录
   - 向 `.pbxproj` 注入两个 Extension targets
   - 配置正确的 build settings、framework 链接、App Group 等
3. `ios/` 目录在 `.gitignore` 中（CNG 标准流程）

### 常用命令

```bash
# 重新生成 ios/ 目录（含 Extension targets）
npx expo prebuild --clean --platform ios

# 编译验证（不签名）
cd ios && xcodebuild -workspace vibeflowios.xcworkspace -scheme vibeflowios -configuration Debug -sdk iphoneos -destination generic/platform=iOS CODE_SIGNING_ALLOWED=NO build
```

### 注意事项

- 修改 Extension 源码后需要重新 `prebuild`
- Extension 与主 App 通过 App Group (`group.app.vibeflow.shared`) 共享数据
- 系统框架（ManagedSettings, DeviceActivity 等）通过 Swift `import` 自动链接

## Development Rules

1. **类型安全**: 使用 `ReturnType<typeof setInterval>` 而非 `NodeJS.Timeout`
2. **配置优先**: 服务器地址通过环境变量配置，不硬编码
3. **离线优先**: 考虑网络断开场景，使用本地缓存
