# Codex Cultivation

把 Codex Desktop 的 Vibe Coding 体验改造成一套本地修仙成长系统。

当前版本：**1.10.0** · 支持 **Windows 10/11** 与 **macOS 13+**

Windows 与 macOS 版本均使用可逆的本机 Chromium DevTools Protocol 注入，不修改官方应用包、`app.asar`、签名、账号、任务记录或插件数据。

## 功能

- 四区响应式首页：官方导航、修炼面板与仙侍、中央问道区、右侧修行状态。
- 四张真实功能卡：炼器、破阵、闭关、参悟，继续调用 Codex 原生功能。
- Token 本地估算、手动校准与可选 CC Switch 只读同步，并换算为下品、中品、上品、极品灵石。
- 炼气、筑基、金丹、元婴、化神境界与小境界进度。
- 五个境界均包含独立深色/浅色 16:9 背景，共 10 张环境美术。
- 顿悟机缘、连续三日天劫、失败修为惩罚和飞升状态。
- 七日 Token 折线、小时趋势、今日目标环图、最近历程与 Token 数据校准。
- 浅色白玉/青瓷与深色玄夜/墨玉两套视觉系统，跟随 Codex 最终主题。
- 男/女仙侍设置与按大境界自动换装的 10 张一致性人物立绘。
- 按当前模型切换心法名称，兼容完整名称与 `5.5 中`、`5.4 mini 中` 等紧凑标签。
- 阵盘使用 Canvas 绘制四道穿心 8 字真元：两道正向、两道反向，光点领头并生成动态历史拖尾。
- 原生 Pet v2 灵宠“银月”，随炼气、筑基、金丹、元婴、化神自动进化。
- 可逆安装、托盘控制、验证截图和完整恢复。

## 银月灵宠系统

![银月从炼气到化神的五境形态](./docs/assets/yinyue-five-realms-promo-v2.png)

“银月”是一套基于 Codex 原生 Pet v2 规范实现的成长型灵宠。安装后只需在 Codex 原生宠物选择器中选择一次银月，修仙台便会根据当前大境界自动装配对应形态；安装器不会强制替用户切换或打开宠物。

| 境界 | 银月形态 | 形象特征 |
| --- | --- | --- |
| 炼气 | 幼态月狐 | 单尾银白幼狐，额心带淡蓝月纹 |
| 筑基 | 青玉月狐 | 双尾形态，青玉项圈与青色灵纹显现 |
| 金丹 | 金纹月狐 | 三尾形态，暖金纹饰与胸前金丹月印凝成 |
| 元婴 | 狐耳幼仙 | 五尾幼态狐耳少女，身着银蓝紫高领仙袍 |
| 化神 | 九尾月仙 | 九尾成年狐仙，月冠、长发与高阶仙袍完整显现 |

灵宠状态独立于界面主题保存。运行时会读取修仙台已经解析出的真实大境界，仅在境界变化时更新版本化图集；随后只定向刷新带有银月身份标记的宠物辅助窗口，Codex 主窗口不会因为灵宠进阶而被重载。若无法确认新图集已经载入，系统会保留待重载状态，并由 Windows 托盘或 macOS 菜单栏在用户明确确认后重启 Codex。

安装、进阶和恢复均通过管理状态与 SHA-256 校验识别文件，只处理受修仙台管理的 `yinyue` 目录，不扫描或改写其他宠物。同名目录不是由修仙台创建时会拒绝覆盖；禁用灵宠管理或恢复时保留银月也都有独立参数。

## 心法列表

首页会读取 Codex 当前选择的模型并自动切换心法名称，不额外维护一套模型设置。

| 模型 | 心法名称 |
| --- | --- |
| GPT-5.4 mini | **灵犀轻云诀** |
| GPT-5.5 | **紫府通玄经** |
| GPT-5.6 Luna | **月华流光诀** |
| GPT-5.6 Terra | **地脉归元经** |
| GPT-5.6 Sol | **大日天衍经** |

无法识别的模型会保留原始模型名，并将心法回退为「清心诀」。

## 效果预览

| 深色玄夜主题 | 浅色白玉主题 |
| --- | --- |
| ![深色玄夜主题首页](./docs/screenshots/home-dark.png) | ![浅色白玉主题首页](./docs/screenshots/home-light.png) |

![修炼设置与仙侍性别选择](./docs/screenshots/settings-companion.png)

展示图使用虚构修炼数据，左侧历史任务区域已遮挡处理。

## 设置与 Token 校准

打开左侧修仙面板的「查看总览」，进入「设置」后可以：

- 调整侧栏信息密度、界面动效、背景显现强度和仙侍性别。
- 点击「等级说明」跳转到本 README 的[境界升级规则](#境界升级规则)。
- 手动填写累计 Token，仅修正当前修为起点。
- 点击「通过 CC Switch 校正」，同步本机 Codex 的累计、最近 60 天和最多 72 个可用小时统计。

[CC Switch](https://github.com/farion1231/cc-switch) 是可选依赖。修仙台只读访问其本地 SQLite 数据库：

| 平台 | 默认路径 |
| --- | --- |
| macOS | `~/.cc-switch/cc-switch.db` |
| Windows | `%USERPROFILE%\.cc-switch\cc-switch.db` |

CC Switch 的数据来自本机 Codex 会话日志。已经归档的早期记录可以保留每日汇总，但无法还原逐小时分布；其他电脑上的会话和已删除的本地历史不会计入。

## 平台状态

- Windows：完整修仙界面、状态机、CC Switch 校准和美术资源，保留 Store 包校验、托盘控制与 PowerShell 安装/恢复流程。
- macOS：完整修仙界面、状态机、CC Switch 校准、美术资源与银月五境进化，支持签名校验、暂停、背景导入、菜单栏控制与完整恢复。

## macOS 系统要求

- macOS 13 或更新版本
- 官方 Codex Desktop，安装于 `/Applications/ChatGPT.app`
- 最新 Node.js 22 LTS 或更新版本
- Xcode Command Line Tools（仅菜单栏控制器需要 Swift）

## macOS 安装

首次运行：

```zsh
./macos/scripts/install-codex-cultivation.command
./macos/scripts/start-codex-cultivation.command
```

Codex 已打开时，启动器会通过 macOS 原生对话框请求一次重启确认。也可以打开菜单栏控制器：

```zsh
./macos/scripts/menubar-codex-cultivation.command
```

安装脚本默认把炼气形态的银月安装到 `~/.codex/pets/yinyue`。如果只想使用修仙界面而不接管银月境界同步，可在安装时传入 `--no-spirit-pet`；该选项只写入禁用标记，不会删除已经存在的宠物。Codex 启动后会按当前大境界同步银月，也可手动执行：

```zsh
node ./macos/scripts/cultivation-macos.mjs sync-pet
```

安装器不会替用户切换当前宠物；首次使用仍需在 Codex 原生宠物选择器中选择一次“银月”。菜单栏会显示银月的安装、禁用、当前境界和待重载状态；需要重启才能应用进阶时，重启操作仍会先请求用户确认。

验证和截图：

```zsh
./macos/scripts/verify-codex-cultivation.command \
  --screenshot "$PWD/codex-cultivation-check.png"
```

恢复官方界面并关闭调试会话：

```zsh
./macos/scripts/restore-codex-cultivation.command
```

恢复默认移除由修仙台管理且哈希可验证的银月文件，不扫描或修改其他宠物。需要保留银月时使用：

```zsh
./macos/scripts/restore-codex-cultivation.command --keep-spirit-pet
```

## Windows 系统要求

- Windows 10/11
- Microsoft Store 版 Codex Desktop
- 最新 Node.js 22 LTS 或更新版本
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

安装脚本默认安装炼气形态的银月；使用 `-NoSpiritPet` 可保留现有宠物且禁用银月管理。Codex 启动后会按当前修炼境界同步银月，热重载无法确认时由托盘提示并在用户确认后重启。

## 验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\verify-codex-cultivation.ps1 `
  -ScreenshotPath "$PWD\codex-cultivation-check.png"
```

## 恢复

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\restore-codex-cultivation.ps1
```

恢复会移除实时注入、受管理的银月并关闭保存的 CDP 会话。使用 `-KeepSpiritPet` 可保留银月；需要恢复安装前的官方外观键时使用 `-RestoreBaseTheme`。

## 境界升级规则

修为来自修仙台启用后对输入 Token 的本地估算。达到小境界门槛时自动进阶；达到大境界上限后不会直接升级，而是进入三日天劫。

| 境界 | 修为区间 | 小境界 |
| --- | ---: | --- |
| 炼气 | 0 ～ 5 亿 | 炼气 1～9 层 |
| 筑基 | 5 亿 ～ 20 亿 | 初期、中期、后期、圆满 |
| 金丹 | 20 亿 ～ 80 亿 | 初期、中期、后期、圆满 |
| 元婴 | 80 亿 ～ 320 亿 | 初期、中期、后期、圆满 |
| 化神 | 320 亿 ～ 1,280 亿 | 初期、中期、后期、圆满 |

### 小境界

- 炼气九层门槛依次为：500 万、1,500 万、3,000 万、5,000 万、8,000 万、1.25 亿、1.9 亿、3 亿、5 亿 Token。
- 筑基及以后，每个大境界按当前跨度的 20%、55%、90%、100% 划分为初期、中期、后期、圆满。
- 普通小境界达到门槛后自动进阶，不需要额外操作。

### 顿悟

- 每次有效输入后有 1.2% 概率发现顿悟机缘，两次顿悟至少间隔七天。
- 顿悟需要在修炼总览中主动领取，可直接推进到下一个小境界门槛。
- 若已处于当前大境界最后阶段，顿悟只会补满修为并开启天劫，不会跳过渡劫直接升级。

### 三日天劫

- 修为到达大境界上限后立即锁定当前境界，并开启连续三日天劫。
- 每日目标取最近七个有修炼记录日的 Token 中位数的 80%，向 100 Token 取整，最低为 1,000 Token。
- 连续三天每天达到目标即渡劫成功；天劫期间新增修为暂存为溢出修为，成功后带入下一境界。
- 任一已结束的目标日未达标即渡劫失败：扣除当前大境界跨度的 12% 修为，并清空天劫期间的溢出修为。
- 化神圆满后完成最终三日天劫，即标记为飞升。

累计 Token 可以在「修炼总览 → 设置 → Token 数据校准」中手动修正；安装 CC Switch 后，也可同步累计、最近 60 天和最多 72 个可用小时统计。校准只调整当前修为起点，不补算历史顿悟或天劫。

## 数据说明

Codex Desktop 当前没有公开的账号累计 Token 接口。本项目默认按启用后的输入长度进行本地估算，并允许手动校准累计值；也可只读接入 CC Switch 从本机会话日志整理出的 Codex Token 统计。该数据仅覆盖本机可用的会话历史，不等同于账号级官方累计值。界面不会伪造工具调用、任务数量或官方 Token 数据。

Windows 状态保存在 `%LOCALAPPDATA%\CodexCultivation`，macOS 状态保存在 `~/Library/Application Support/CodexCultivation`。
银月管理状态与修仙界面状态分离：Windows 使用 `%LOCALAPPDATA%\CodexCultivation\pet-state.json`，macOS 使用 `~/Library/Application Support/CodexCultivation/pet-state.json`。宠物分别安装到 `%USERPROFILE%\.codex\pets\yinyue` 和 `~/.codex/pets/yinyue`，两端都只管理能够由状态与哈希证明属于银月的文件，不会修改其他宠物。

## 生图素材

`windows/references/cultivation-art-prompts.json` 包含境界背景、仙侍母版和四张法器图的提示词。

`windows/scripts/request-cultivation-art.ps1` 会请求 URL、下载 HTTPS 图片、验证文件、归一化尺寸并接入 `windows/assets/cultivation/`。脚本不会自动重试结果不确定的 POST，也不会保存 API 密钥。请只通过本机环境变量配置 `IMAGE_API_URL` 和 `IMAGE_API_KEY`。

## 安全边界

- CDP 只绑定 `127.0.0.1`，并校验 Store 包、监听进程、端口和 Browser ID。
- 不修改或接管 `WindowsApps` 文件。
- 配置文件按严格 UTF-8、原子替换和可恢复备份处理。
- CC Switch 数据库始终以只读模式打开，不读取供应商凭据或 API 密钥。
- 不提交 API 密钥、`auth.json`、用户任务内容、个人截图或本地状态文件。
- 不使用时建议执行恢复脚本关闭调试会话。

## 测试

macOS：

```zsh
./macos/tests/run-tests.sh
```

Windows：

```powershell
pwsh -NoProfile -File .\windows\tests\run-tests.ps1
node --check .\windows\scripts\injector.mjs
node --check .\windows\assets\renderer-inject.js
node .\windows\tests\renderer-inject.test.mjs
node .\windows\tests\cc-switch-usage.test.mjs
node .\windows\scripts\injector.mjs --check-payload
```

自动化测试要求五个境界的深浅背景、男女五境界仙侍、四张功能卡、四种灵石、阵盘资源及银月五套 Pet v2 图集完整存在，并覆盖银月安装、五境切换、窗口分类、待重载和安全移除。运行时仍保留素材回退，不影响 Codex 原生工作区。

版本更新见 [Windows Changelog](./windows/CHANGELOG.md) 与 [macOS Changelog](./macos/CHANGELOG.md)。

## 来源与权利

本仓库使用全新的 Git 历史，并针对修仙系统重新整理。部分底层安全注入思路源自公开项目 Codex Dream Skin。详细边界见 [NOTICE.md](./NOTICE.md)。本项目不代表 OpenAI 或 Codex 官方产品、主题或背书。
