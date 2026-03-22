# VibeFlow iOS 安装指南

## 前提条件

- iPhone (iOS 16+)
- Apple Developer Account (用于 Ad Hoc 分发)
- 已注册的 Bundle ID (`com.vibeflow.app` 或 `com.vibeflow.lite`)

## 获取设备 UDID

1. 将 iPhone 连接到 Mac
2. 打开 **Finder**（macOS Catalina+）或 **iTunes**
3. 在 Finder 中选择设备，点击设备名称下方的信息行（序列号），切换至 **UDID**
4. 右键复制 UDID

或者使用命令行：

```bash
# 确保 iPhone 已连接并信任此电脑
system_profiler SPUSBDataType | grep -A 2 "Serial Number" | head -3
```

## 添加设备到 Provisioning Profile

1. 登录 [Apple Developer Portal](https://developer.apple.com/account/resources/devices/list)
2. 点击 **Devices** → **+** 注册新设备
3. 填入设备名称和 UDID
4. 在 **Profiles** 中编辑对应的 Ad Hoc Provisioning Profile，勾选新设备
5. 下载更新后的 Profile（EAS Build 会自动处理）

## 构建 IPA

### 完整版（含 Family Controls / Screen Time）

```bash
cd vibeflow-ios
eas build --profile preview --platform ios
```

> 需要 Apple Developer 的 Family Controls 权限审批，Bundle ID: `com.vibeflow.app`

### 精简版（无 Screen Time）

```bash
cd vibeflow-ios
eas build --profile preview-lite --platform ios
```

> 更容易分发，Bundle ID: `com.vibeflow.lite`

## 安装 IPA

### 方式一：EAS 分发链接

构建完成后，EAS 会生成一个安装链接。在 iPhone Safari 中打开该链接，按提示安装。

### 方式二：手动安装

1. 从 EAS 下载 `.ipa` 文件
2. 使用 Apple Configurator 2 或 `ios-deploy` 安装：
   ```bash
   npx ios-deploy --bundle path/to/vibeflow.ipa
   ```

### 首次打开

安装后首次打开 App 时：

1. 系统可能提示"未受信任的企业级开发者"
2. 前往 **设置** → **通用** → **VPN 与设备管理**
3. 找到开发者证书，点击 **信任**
4. 再次打开 App

## 配置服务器地址

App 会从环境变量 `EXPO_PUBLIC_SERVER_HOST` 获取服务器地址。默认连接 `http://localhost:3000`。

如需连接远程服务器，在构建时设置：

```bash
EXPO_PUBLIC_SERVER_HOST=your-server-ip eas build --profile preview-lite --platform ios
```

## 登录

1. 打开 App，进入登录界面
2. 输入在 Web 端注册的 email 和密码
3. 登录成功后自动进入主界面
4. Token 安全存储在 iOS Keychain 中，后续启动无需重新登录

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| 无法安装 | 确认设备 UDID 已添加到 Provisioning Profile |
| 打开闪退 | 检查是否信任了开发者证书 |
| 无法连接服务器 | 确认服务器地址正确且可从手机网络访问 |
| 登录失败 | 确认已在 Web 端注册账号 |
| Screen Time 不工作 | 使用完整版（preview profile），且需要 Family Controls 权限 |
