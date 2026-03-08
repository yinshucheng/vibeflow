# VibeFlow Desktop 安装指南

## 系统要求

- macOS 12 (Monterey) 或更高版本
- Intel (x64) 或 Apple Silicon (arm64)

## 下载

从以下地址下载最新 DMG：

- **GitHub Releases**: `https://github.com/<org>/vibeflow/releases`
- **自托管**: `https://releases.vibeflow.app`

选择适合你 Mac 架构的版本，或下载 Universal 版本。

## 安装步骤

### 1. 挂载 DMG

双击下载的 `.dmg` 文件，在弹出的窗口中将 VibeFlow 拖入 Applications 文件夹。

### 2. 首次打开（未签名版本）

如果 DMG 未经 Apple 签名，macOS 会阻止打开。按以下步骤绕过：

1. 在 Finder 中打开 **Applications** 文件夹
2. **右键点击** VibeFlow.app → 选择 **打开**
3. 在弹出对话框中点击 **打开**

或者通过系统设置：

1. 尝试打开 VibeFlow（会被阻止）
2. 前往 **系统设置** → **隐私与安全性**
3. 在底部找到"VibeFlow 已被阻止"提示，点击 **仍要打开**
4. 输入密码确认

也可以通过命令行移除隔离属性：

```bash
xattr -cr /Applications/VibeFlow.app
```

### 3. 辅助功能权限

VibeFlow Desktop 需要辅助功能权限来实现焦点强制执行功能：

1. 前往 **系统设置** → **隐私与安全性** → **辅助功能**
2. 点击 **+**，添加 VibeFlow
3. 启用开关

## 配置服务器地址

首次启动时，VibeFlow 会尝试连接默认服务器。如需修改：

1. 打开 VibeFlow
2. 在登录窗口中，服务器地址默认为 `http://localhost:3000`
3. 如连接远程服务器，修改为对应地址

## 登录

1. 首次启动或 token 失效时，VibeFlow 会弹出登录窗口
2. 登录窗口加载的是 Web 端的登录页面
3. 输入 email 和密码完成登录
4. 登录成功后窗口自动关闭，VibeFlow 开始正常运行
5. Token 安全存储在 electron-store 中，后续启动无需重新登录

## 从源码构建

```bash
cd vibeflow-desktop

# 安装依赖
npm install

# 构建 DMG
npm run build:dmg
```

构建产物在 `vibeflow-desktop/release/` 目录下。

## 卸载

1. 将 VibeFlow.app 从 Applications 拖入废纸篓
2. 可选：清理配置数据
   ```bash
   rm -rf ~/Library/Application\ Support/VibeFlow
   rm -rf ~/Library/Preferences/com.vibeflow.desktop.plist
   ```

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| 无法打开 | 右键点击打开，或在系统设置中允许 |
| 登录窗口空白 | 确认服务器正在运行且地址正确 |
| 无法连接服务器 | 检查防火墙设置，确保端口 3000 可访问 |
| 焦点执行不工作 | 检查辅助功能权限是否已授予 |
| 登录后仍要求登录 | 检查服务器是否返回 token（查看开发者控制台日志） |
| 重启后需要重新登录 | token 可能已过期，在 Web 端重新登录后再打开 Desktop |
