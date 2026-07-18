# Codex Cultivation

把 Codex Desktop 的 Vibe Coding 体验改造成一套本地修仙成长系统。

项目目标是为 Codex Desktop 提供跨平台的修仙化工作体验。当前首先完成 Windows 版本，macOS 版本将在后续开发。

Windows 实现通过本机 Chromium DevTools Protocol 注入可逆的界面层，不修改官方 `WindowsApps`、`app.asar`、签名、账号、任务记录或插件数据。

## 功能

- 四区响应式首页：官方导航、修炼面板与仙侍、中央问道区、右侧修行状态。
- 四张真实功能卡：炼器、破阵、闭关、参悟，继续调用 Codex 原生功能。
- Token 本地估算与下品、中品、上品、极品灵石换算。
- 炼气、筑基、金丹、元婴、化神境界与小境界进度。
- 顿悟机缘、连续三日天劫、失败修为惩罚和飞升状态。
- 七日 Token 折线、今日目标环图、最近历程与累计 Token 手动校准。
- 浅色白玉/青瓷与深色玄夜/墨玉两套视觉系统，跟随 Codex 最终主题。
- 男/女仙侍设置与按大境界自动换装的素材槽位。
- 可逆安装、托盘控制、验证截图和完整恢复。

## 平台状态

- Windows：开发中，现有版本可安装和恢复。
- macOS：规划中，仓库结构已为后续实现预留平台目录。

## Windows 系统要求

- Windows 10/11
- Microsoft Store 版 Codex Desktop
- Node.js 22 或更新版本
- 推荐 PowerShell 7

## 安装

关闭 Codex 后运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\install-codex-cultivation.ps1
```

安装完成后使用桌面快捷方式，或运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\start-codex-cultivation.ps1
```

如果 Codex 已打开，脚本会明确询问是否重启；命令行自动化必须显式传入 `-RestartExisting`。

## 验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\verify-codex-cultivation.ps1 `
  -ScreenshotPath "$PWD\codex-cultivation-check.png"
```

## 恢复

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\restore-codex-cultivation.ps1
```

恢复会移除实时注入并关闭保存的 CDP 会话。需要恢复安装前的官方外观键时使用 `-RestoreBaseTheme`。

## 数据说明

Codex Desktop 当前没有公开的账号累计 Token 接口。本项目仅按启用后的输入长度进行本地估算，并允许手动校准累计值。界面不会伪造工具调用、任务数量或官方 Token 数据。

状态保存在 `%LOCALAPPDATA%\CodexCultivation`。

## 生图素材

`windows/references/cultivation-art-prompts.json` 包含境界背景、仙侍母版和四张法器图的提示词。

`windows/scripts/request-cultivation-art.ps1` 会请求 URL、下载 HTTPS 图片、验证文件、归一化尺寸并接入 `windows/assets/cultivation/`。脚本不会自动重试结果不确定的 POST，也不会保存 API 密钥。请只通过本机环境变量配置 `IMAGE_API_URL` 和 `IMAGE_API_KEY`。

## 安全边界

- CDP 只绑定 `127.0.0.1`，并校验 Store 包、监听进程、端口和 Browser ID。
- 不修改或接管 `WindowsApps` 文件。
- 配置文件按严格 UTF-8、原子替换和可恢复备份处理。
- 不提交 API 密钥、`auth.json`、用户任务内容、个人截图或本地状态文件。
- 不使用时建议执行恢复脚本关闭调试会话。

## 测试

```powershell
pwsh -NoProfile -File .\windows\tests\run-tests.ps1
node --check .\windows\scripts\injector.mjs
node --check .\windows\assets\renderer-inject.js
node .\windows\tests\renderer-inject.test.mjs
node .\windows\scripts\injector.mjs --check-payload
```

当前版本：`1.8.0`

缺失的境界或人物素材会安全回退到可用的炼气素材，不影响 Codex 原生工作区。

## 来源与权利

本仓库使用全新的 Git 历史，并针对修仙系统重新整理。部分底层安全注入思路源自公开项目 Codex Dream Skin。详细边界见 [NOTICE.md](./NOTICE.md)。本项目不代表 OpenAI 或 Codex 官方产品、主题或背书。
