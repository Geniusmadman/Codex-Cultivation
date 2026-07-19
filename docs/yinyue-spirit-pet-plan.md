# 银月五境原生灵宠系统实施计划

## Summary

- 为 Codex Cultivation 新增原生 Pet v2 灵宠“银月”：银白月狐、国风 2D Q 版，随炼气、筑基、金丹、元婴、化神自动进化。
- 固定宠物 ID 为 `yinyue`，五个境界分别使用完整的 `1536×2288` WebP 图集，包含 9 行标准动画和 16 个顺时针观察方向。
- 严格执行前置门禁：先提交并推送计划与知识图谱；远端验证成功后才能修改功能代码或生成灵宠资产。

## 前置上传

- 新增 `docs/yinyue-spirit-pet-plan.md`，内容采用本计划。
- 以原生 Understand Anything 工作集保存知识图谱，提交：
  - `.understand-anything/knowledge-graph.json`
  - `.understand-anything/meta.json`
  - `.understand-anything/fingerprints.json`
  - `.understand-anything/.understandignore`
- 不提交空的 `intermediate/`、`tmp/` 目录，也不额外复制图谱到 `docs/`。
- 仅暂存上述计划和图谱文件，提交为：
  `docs: add yinyue pet plan and knowledge graph`
- 从仓库根目录推送到 `origin/main`，并确认远端 `main` 已指向该提交；若推送失败，停止实施且不产生功能改动。

## Implementation Changes

### 灵宠资产

- 新增 `windows/pets/yinyue/pet-family.json`，声明稳定 ID、Pet v2 版本、默认境界及五个境界资源映射。
- 资源目录使用：
  `windows/pets/yinyue/forms/<realm>/spritesheet.webp`
  和对应 `validation.json`。
- 境界 ID 与现有修炼系统完全一致：
  `qi`、`foundation`、`golden-core`、`nascent-soul`、`transformation`。
- 视觉进化固定为：
  - 炼气：幼态单尾、银白毛色、淡蓝额心月纹。
  - 筑基：双尾、体态更稳、青玉色毛纹。
  - 金丹：三尾、胸前一体化金丹月印、少量暖金点缀。
  - 元婴：五尾、银蓝紫月脉纹、毛量和灵性增强。
  - 化神：紧凑层叠九尾、银月冠形额纹、银蓝与克制金色。
- 所有形态保持同一张脸、耳形、主体毛色和月纹语言；禁止文字、阴影、场景、漂浮光环及脱离身体的特效。
- 使用 `hatch-pet` 和内置 `imagegen`：炼气建立家族身份锚点，后续境界以上一形态为参考逐境演化；每个境界独立完成完整 v2 生成、方向 QA、动画 QA 和确定性校验。
- Git 仅保留最终 WebP、校验 JSON 和家族清单；生成提示、条带、帧、GIF、临时 PNG 等过程文件不提交。

### 安装与状态管理

- 新增 Node 灵宠管理器，提供 `verify`、`install`、`set-realm`、`remove` 四个命令。
- 活跃安装目录为 `%USERPROFILE%\.codex\pets\yinyue`，`pet.json` 始终保持：
  - `id: "yinyue"`
  - `displayName: "银月"`
  - `spriteVersionNumber: 2`
- 活跃图集采用 `spritesheet-<realm>-<sha12>.webp`；`sha12` 为图集 SHA-256 前 12 位，用版本化 URL 避免 Codex 缓存旧形态。
- 管理状态独立写入 `%LOCALAPPDATA%\CodexCultivation\pet-state.json`，不修改现有临时运行状态 `state.json` schema 3。
- 所有清单与状态采用校验、临时文件和同目录原子替换；切换成功后清理旧的银月版本，待重载状态下保留前一版本。
- 如果 `yinyue` 目录已存在但不能由管理状态证明属于 Codex Cultivation，安装必须拒绝覆盖。
- 删除只处理管理状态和哈希能够证明属于银月的文件；内置宠物及 `kun-chick`、`nezukocoder` 等其他用户宠物不受影响。

### 境界同步与交互

- 安装脚本默认安装炼气银月；新增 `-NoSpiritPet`，表示不安装、更新或删除现有灵宠。
- 注入器从主 Codex 渲染器读取：
  `window.__CODEX_CULTIVATION_DEBUG__.resolve().id`
- 首次连接及后续最多每 2 秒检查一次境界；境界未变化时不触碰文件。
- 切换图集后，仅对存在 `data-avatar-id="yinyue"` 且不具备主 Codex shell 标记的宠物窗口执行 `Page.reload({ignoreCache:true})`。
- 重载后验证实际加载资源包含预期版本化文件名；验证失败则记录 `pendingReload`，不伪报成功。
- 托盘显示“灵宠：银月 · 当前境界”，提供手动同步；存在 `pendingReload` 时显示“重启 Codex 应用灵宠进阶”，复用现有用户确认后重启机制。
- 恢复脚本默认移除受管理的银月；新增 `-KeepSpiritPet` 保留灵宠。托盘“完全恢复 Codex”沿用默认移除行为。
- 保留现有“仙侍”系统，不增加喂养、亲密度、独立宠物等级或 macOS 支持。

### 版本与 Git

- 项目版本从 `1.8.0` 升级到 `1.9.0`，同步更新渲染器、注入器、README 和 CHANGELOG。
- 完成并验证后提交：
  `feat: add yinyue spirit pet evolution`
- 实现提交默认只 commit、不 push；前置计划和知识图谱提交按用户本次授权推送。

## Test Plan

- 测试级别采用 L3：涉及文件安装、CDP 多窗口识别、状态切换和完整恢复。
- 自动测试覆盖：
  - 家族清单、五境资源、尺寸、WebP 和 `spriteVersionNumber: 2` 校验。
  - Realm 映射、SHA 文件名、原子更新、重复安装和状态迁移。
  - 同 ID 非托管目录拒绝覆盖，其他宠物前后哈希不变。
  - 主 shell 与银月宠物窗口分类、错误目标拒绝和重载 URL 验证。
  - `-NoSpiritPet`、`-KeepSpiritPet`、默认安装及默认恢复行为。
  - 热重载失败时正确写入 `pendingReload`。
- 五套图集分别通过 `hatch-pet` 的 v2 atlas、色键清理、动画、方向语义、连续性及三路盲测要求。
- 运行现有完整测试、Node 语法检查和新增灵宠测试。
- Windows 实机验收炼气至化神五次切换，验证正在显示的银月自动换形；覆盖宠物窗口未打开、已打开、热重载失败和经确认重启四种路径。
- 完整恢复后确认主题注入、银月管理状态和银月文件被移除；使用 `-KeepSpiritPet` 时确认银月保留；其他宠物始终不变。

## Assumptions

- 知识图谱采用 `.understand-anything` 原生工作集，以保留后续 Dashboard 和增量分析能力。
- 当前图谱明确记录其源码基线为 `c404b34484def7573ee0effb94a8e41a8dfcbf59`；前置文档提交不要求重新分析业务源码。
- 银月首次安装为炼气形态，Codex 启动并读取真实修炼境界后立即同步到正确形态。
- 热重载失败只触发待重启提示，任何关闭或重启 Codex 的操作都必须获得用户确认。
