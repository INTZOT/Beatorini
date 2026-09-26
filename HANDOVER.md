# 灯浮市Beatorini 项目交接文档

> 生成日期：2026-08-13 ｜ 当前版本：4.12.1（提交 `d624989`，工作区干净）

## 1. 项目概况

《灯浮市BeatoriniFI》是一个基岩版空岛服务器的行为包（JavaScript + Script API），核心玩法：玩家创建自己的空岛（`island:void_1 ~ void_256`），大厅使用主世界（`minecraft:overworld`），另有金库维度 `island:vault`（市场无损存储用）。

只做基岩版内容，**严禁混入 Java 版物品/逻辑**。

## 2. 目录与环境

- 源码仓库（Git）：`/home/intzot/项目/Develop/Beatorini`（旧 Windows 环境为 `D:\Develop\Beatorini`）
  - Git 身份：`INTZOT` / `zzy971237435@163.com`
  - 提交历史：4.9.x → 4.10.x → 4.11.x → 4.12.x
- 游戏行为包（部署目标，Linux｜RoundStudio BedrockBoot + ProtonGDK，世界内包）：
  `~/.config/RoundStudio/BedrockBoot2/BedrockBoot.Linux/ProtonGDK/game_prefix/drive_c/users/intzot/AppData/Roaming/Minecraft Bedrock/Users/Shared/games/com.mojang/minecraftWorlds/Beatorini/behavior_packs/Beatorini`
  （旧的 Windows 路径 `D:\Apps\Levilauncher\versions\1.26.42.01\...\development_behavior_packs\Beatorini` 已失效）
- 同步脚本：仓库根目录 `sync-to-game.sh`（Linux / rsync）。只推送 `manifest.json`、`entities/`、`scripts/`、`structures/*.mcstructure`，自动排除 `node_modules/`、`docs/`、`tools/`、`*.geo.json` 等开发文件；**不使用 `--delete`**，因此世界目录里游戏内生成的 `structures/lobby_save.mcstructure` 不会被删掉。用法：
  `./sync-to-game.sh`（加 `-n` 预演；也可传目标目录覆盖默认值）
  旧 `sync-to-game.ps1`（Windows / robocopy）保留作参考，本机没有 pwsh，不再使用。
- Script API 依赖：仓库根目录 `package.json` + `npm install` → `node_modules/`（已 gitignore，不参与打包）。当前对应游戏 1.26.51：`@minecraft/server@2.11.0-beta`、`@minecraft/server-ui@2.3.0-beta`、`@minecraft/vanilla-data@1.26.51`。本机 `~/.npm` 只读，安装需带 `--cache ./.npm-cache`（仓库内，已 gitignore）。
  ⚠️ 升级时**必须锁 `-stable` 全版本号**（如 `2.11.0-beta.1.26.51-stable`），npm 的 `beta`/`latest` dist-tag 会指向预览版（如 26.60 预览），装错会导致游戏加载脚本失败。
- 独立行为包：`D:\Develop\BetterTextDisplay`（悬浮公告独立版，部署到 `development_behavior_packs\BetterTextDisplay`，用于单独存档测试；入口命令 `/btd`，无数量上限，数据键与 Beatorini 共用 `notice:list`）
- 本地文档：`docs/`（@minecraft/server、server-ui、common、vanilla-data 类型定义已同步到 1.26.51，与 `node_modules/@minecraft/*` 逐字节一致；另有 `bedrock-creator-docs.md` 官方教程合集）
- 版本差异对比工具：`node tools/diff-mcapi.js api <旧 index.d.ts> <新 index.d.ts>` 看类型/成员增删，`node tools/diff-mcapi.js vanilla <旧 lib> <新 lib>` 看方块/物品/群系 ID 增删。游戏每次更新后可直接拿 `docs/`（旧版）对比 `node_modules/`（新版）。

### 沙箱注意事项（Codex 环境）
- 游戏目录在可写根之外：写操作需要授权（`require_escalated`）。
- 仓库 `.git` 在沙箱中只读：`git add/commit` 需要授权。
- 游戏运行时会锁定已加载的脚本文件，同步前先完全退出游戏；Linux 下用 `pgrep -af -i minecraft` 检查残留进程（旧 Windows 环境为 `Minecraft.Windows`）。
- 常用授权前缀已保存（同步脚本、git 提交等），新环境可能失效需重新授权。

## 3. 当前版本（4.12.1）主要内容

- 悬浮公告系统（`notice.js`）：管理面板创建/编辑/删除，支持内容（`\n` 换行，粘贴的字面 `\n` 会自动转换）、坐标、缩放、颜色、背景/透明度、跟随镜头/固定朝向（Yaw）；上限 32 条，持久化到 `notice:list`。
- 管理员面板（`admin.js`）：右键命令方块矿车 → 管理菜单，含「岛屿管理 / 公告管理 / 排行榜管理」三个入口。
- 排行榜（`leaderboard.js`）：按分类（在线时长/击杀/挖掘/放置/死亡）生成悬浮榜，TOP 20，单 TextPrimitive + `\n` + § 颜色（标题青色/第1金/第2银/第3铜/其余白），3 秒实时刷新；管理面板可自定义坐标/缩放/标题颜色/背景/朝向。
- 聊天气泡（`chatbubble.js`）：普通聊天全服广播 + 头顶气泡 5 秒；`#` 前缀消息仅生成气泡（局域聊天），不广播。
- 大厅保护（`lobby-guard.js`）：禁止破坏/放置/攻击/使用道具/交互；主世界实体生成白名单（玩家/签到烟花/盔甲架）。
- 宝藏奖池新增鹦鹉螺铠/马铠（铜→普通、铁→稀有、金→史诗、钻→传说），奖池共 99 种。
- 大厅传送/出生点统一为方块中心 `0.5 64 0.5`。

## 4. 模块清单（scripts/modules/）

| 模块 | 职责 |
|---|---|
| `main.js` | 入口，按序初始化全部模块（`initClock()` 必须最先调用） |
| `config.js` | 全局常量（维度/经济/天赋/排行榜/公告/世界时钟等） |
| `clock.js` | 自定义世界时钟 `beatorini:server`（startup 注册、世界加载后对齐时间、`onMarker` 订阅、不可用时 `isClockReady()` 返回 false） |
| `dimensions.js` | 注册金库维度与 256 个空岛维度（startup 事件） |
| `island.js` | 空岛绑定/创建/传送/访问/加入/转让/放弃/动态边界/自动重置 |
| `vault.js` | 市场金库实体（27 格无损存储） |
| `money.js` | money 计分板读写 |
| `market.js` | 市场交易（上架/购买/税收/48h 超时下架/离线返还） |
| `recycle.js` | 回收系统（个人每日累计、多档降价、对数式收益） |
| `lottery.js` | 抽奖（刷怪蛋/下界/末地/宝藏四个奖池，10 抽史诗/100 抽传说硬保底） |
| `signin.js` | 签到 + 登录表单（公告/更新日志，仅保留最新版本） |
| `stats.js` | 统计（在线时长/击杀/挖掘/放置/死亡）与 ID→名字映射 |
| `leaderboard.js` | 表单排行榜 + 大厅悬浮排行榜（管理面板自定义坐标/缩放/标题色/背景/朝向/行距） |
| `talent.js` | 天赋系统（6 个天赋、120 级、60 秒周期给 buff） |
| `achievements.js` | 物品成就（持有解锁+金币奖励） |
| `title.js` | 称号系统（里程碑解锁、头顶 TextPrimitive、本人不可见） |
| `death.js` | 死亡惩罚（不掉落、扣金币） |
| `ore-gen.js` | 熔岩刷石生成矿物 + 概率进度 |
| `trader.js` | 流浪商人（世界时钟「每 2 游戏日正午」marker 触发；时钟不可用时回退 100 tick 轮询；空岛安全点生成） |
| `soul.js` | 灵魂出窍（/fc on|off、r96 范围） |
| `chatbubble.js` | 聊天气泡 + 局域聊天 |
| `assistants.js` | 个人辅助功能（自动补块/工具自动选择/刷石机工具选择） |
| `lobby-guard.js` | 大厅保护 + 实体生成白名单 |
| `admin.js` | 管理菜单（岛屿/公告/排行榜） |
| `notice.js` | 悬浮公告管理（单 primitive + `\n` 渲染、行距可调、持久化+表单） |
| `mob-density.js` | 怪物富集清理 |
| `tools.js` | 工具自动选择（挖掘等级检索） |

## 5. 自定义命令

- `/menu`：领取菜单时钟（注册名 `beatorini:menu`）
- `/fc on` / `/fc off`：灵魂出窍开关（注册名 `beatorini:fc` + 枚举参数）
- `/btd`：BetterTextDisplay 独立包的公告管理（注册名 `bettertext:btd`）
- 游戏内可不带命名空间直接使用；注册必须在 `system.beforeEvents.startup` 的 `customCommandRegistry`
- 旧 `#` 聊天命令已全部删除；`#` 前缀现在是局域聊天

## 6. 关键技术要点（踩坑记录）

1. **TextPrimitive**
   - 支持 `\n` 多行（上限 128 行 × 每行 128 字符），支持 § 颜色代码（含 `§x§R§R§G§G§B§B` 自定义色）
   - 构造时传 `DimensionLocation`（含 `dimension`）绑定维度，否则会“全维度可见”
   - 默认跟随镜头（billboard）；`useRotation=true` + `rotation` 可固定朝向
   - 背景透明：`backgroundColorOverride = { r,g,b, alpha: 0 }`
   - 多行行距用 `lineGapHeight`（2.11.0-beta 新增，默认 0 = 行贴行）。公告/排行榜走单 primitive + 真换行 + 该属性；旧版本没有此属性时 `scripts/lib/text-primitive.js` 的 `applyLineGap()` 会静默跳过
2. **DDUI（@minecraft/server-ui 2.2.0-beta）**
   - 用 `ObservableString/ObservableNumber/ObservableBoolean` + `{ clientWritable: true }`
   - `dropdown` 必须传 `DropdownItemData[]`（`{ label, value }`），不能传字符串数组
   - 表单布局记得加 `spacer()` 防行间距过小
3. **自定义命令**：命名空间必须唯一（`beatorini:`），同一包内不能混用不同命名空间；回调是 restricted 上下文，改状态要 `system.runTimeout(..., 0)`
4. **动态属性持久化**：公告/排行榜/岛屿状态等都存动态属性；脚本 reload 后需在 `worldLoad` 重建（参考 `restorePendingResets`、`renderAllNotices`）
5. **物品 ID 必须用基岩版 ID**：校验来源 `docs/vanilla-data/lib/mojang-item.d.ts`。已踩坑：`minecraft:magma_block`（应为 `minecraft:magma`）、旗帜图案 `creeper_banner_pattern` 等、不祥旗帜无独立物品
6. **岛屿重置**：只 fill `island:void_N`，`fillBlocks` 按 32×32 瓦片 + tickingarea 分 y 段；实体清理传送到 y=-104；完成后置 `review` 等管理员确认
7. **世界时钟（`clock.js`，2.11.0-beta 新增能力）**
   - `registerClock` 只能在 `system.beforeEvents.startup` 里调用；脚本热重载时重复注册会抛错，因此注册失败不算致命，可用性以世界加载后 `world.getClock(id)` 是否取得到为准
   - 自定义时钟是独立时钟：启动时用 `clock.time = world.getTimeOfDay()` 对齐，`period` 取 24000 的整数倍，marker 的 `time` 才等价于「游戏时刻」（6000 = 正午）
   - 触发入口是 `world.afterEvents.worldClockOnTimeMarker`，模块内用 `onMarker(name, fn)` 订阅
   - 取属性/改时间要放在 `system.run` 回调（普通执行上下文）里，别写在 after 事件回调中
   - 任何依赖时钟的功能都要准备回退方案（例：`trader.js` 在 `isClockReady()` 为 false 时退回 100 tick 轮询）
8. **自定义维度 JSON（1.26.50 起可用，已本地实测）**
   - 行为包 `dimensions/*.json`：必须写 `"format_version": "1.26.50"`（用 `"1.20.0"` 会因 schema 里没这个成员而整文件失败；完全不写则报 `no valid version passed by the caller`）
   - **JSON 不能单独创建维度**，仍必须在 startup 里 `registerCustomDimension(id)`；但**同名 JSON 会作用于脚本注册的维度**，可改 `minecraft:dimension_height`（`min_y` -64~320、`height_range` 16~384）与 `minecraft:default_biome`
   - 脚本注册维度默认：高度 -64..320、生物群系 `minecraft:ocean`（实测）
   - **改「已存在维度」的实测结论**（本地测试服 P1→P2→P3 对照）：
     - `dimension_height`：改 JSON 后重启立即生效、撤掉立即回退；**收紧高度不丢方块**（超范围只是读不到，恢复后原样返回）
     - `default_biome`：**只在区块落盘时固化**。已有方块数据的区块改不动（老岛中心永远是 ocean）；空白区块实时跟随默认群系；JSON 生效期间落盘的区块会把群系写进存档，撤 JSON 也不变
     - 结论：整岛主题群系必须**在该维度首次生成区块之前**就带上 JSON（新维度/新存档）；老岛只能接受割裂或换维度 ID
     - 脚本侧没有写群系的 API（2.11.0-beta 仅有 `getBiome`/`containsBiomes` 查询）
   - 解析失败只在 `bedrock_server/ContentLog*.txt` 里有 `[Dimensions][error]`，服务端日志看不到 → 排查 JSON 必看内容日志
   - **高度上限实测**：文档写 `height_range ≤ 384`，但 1.26.51 实测真实约束是 **`min_y + height_range ≤ 512`**
     - 想要「下限 -64 + 上限 512」→ 写 `min_y: -64, height_range: 576`（实测 `-64..512`）；**建筑上限是 511**（y=512 可读不可写）
     - 超过 512 会被**整份 JSON 拒绝**（维度静默回落 -64..320、群系回落 ocean），只在 ContentLog 报错 → 改高度后必须核对读数
     - 已落地：`dimensions/island_void_1..256.json` 由 `tools/gen-island-dimensions.js` 从 `config.js` 生成（改高度只需改 config 再跑一次）；`sync-to-game.sh` 已加 `dimensions/` 同步
     - `island.js` 已同步：边界扩展 x/z 用 `ISLAND_BOUNDARY_LIMIT`(256)、y 用 `ISLAND_BOUNDARY_LIMIT_Y`(512)；重置 clamp 用 `ISLAND_DIMENSION_MIN_Y`/`MAX_Y`
     - ⚠️ 别在生产世界做**收缩**高度的实验：早期测试把高度压到 0..32 后，那批超范围方块在后续几次启动后消失（扩大范围则实测安全，上线动作已模拟验证）
   - `generator_type` 目前只支持 `void`（做不出有地形的维度）
9. **静默失败防护约定（4.13.5 起，务必保持）**
   - `main.js` 的 `MODULES` 表逐个 init 并 try/catch：任何模块抛错只影响自己，失败会打 `[Boot] FAILED <模块>`；**不要退回裸顺序调用**（否则一个模块出错会让其后所有模块静默不初始化）
   - `lib/async.js` 的 `withTimeout()`：所有"可能长时间不 resolve"的原生 Promise（`tickingAreaManager.createTickingArea` 等）await 时必须包超时，否则会静默卡死
   - `lib/json.js` 的 `safeParseArray/safeParseObject`：动态属性 JSON 一律走它，坏数据不能让事件/表单回调抛穿
   - `lib/form.js` 的 `notifyIfBusy()` / `validIndex()`：`form.show()` 必须处理 `UserBusy`（resolve 而非 reject）；客户端可写的 Observable 下标必须校验
   - 金库就绪：`vault.js` 用 `TickingArea.isFullyLoaded` 判定区块是否真的加载完成，**未加载完成时绝不调用 `ensureVaultEntities()`**（会清索引 + 补空实体 → 市场对账误判全服商品丢失）；完成后写 `market:vault_ready_at`，`market.js` 要求时间戳 ≥ 本次启动才允许对账
   - 高度：`ISLAND_BUILD_MAX_Y = 511`（512 是只读边界层，`/fill` 到 512 会整段失败）；边界判据用区间 `y < MIN_Y || y > BUILD_MAX_Y`，不要用 `Math.abs(y)` 比较
   - 资金流：改钱一律用校验过 `successCount` 的封装（market 的 `changeMoney`、lottery 的 `deductMoney/refundMoney`），**先付后记**，失败不清队列、不落库
   - `world.tickingAreaManager` 的 chunk 预算是**按包共享**的（实测上限 300）：新增常加载区域前先 `hasCapacity()`
10. **版本发布流程**：每次发版同步三份日志：：每次发版同步三份日志：
   - `CHANGELOG.md`（完整）
   - `simple_changelog.md`（QQ 公告版，无 §；另附 `\n` 换行的「游戏公告复制版」）
   - `scripts/modules/signin.js` 的 `SERVER_CHANGELOGS[0]`（游戏内，带 §，只保留最新版本）

## 7. 当前状态与待办

- **当前版本 4.13.6**（2026-09-26）：4.13.5 的 P0×6 静默失败根治 + 第 2/3 批修复（含低优先级项：admin 分页、句柄保留、库层守卫、下拉校验等）；完整清单见 `CODE_REVIEW-2026-09-26.md`
  - 4.13.5 / 4.13.6 未同步三份玩家日志（按热修惯例）；若要发给玩家再做一次发版同步
- 最新提交 `459c180`（lobby-guard 失效实体修复，非发版提交）
- 无未完成的重构；BetterTextDisplay 为独立测试包（新存档测试 `/btd`）
- 本地测试服（**可无头实测行为包**，2026-09-25 起可用）：见 `tools/local-server/README.md`
  - `tools/local-server/run.sh` 起 BDS 1.26.51（实例在 gitignore 的 `.bds-test/`），`tools/local-server/cmd.sh <命令>` 发控制台命令，`tools/local-server/deploy-pack.sh` 把仓库的包同步进测试世界
  - 脚本 `console.warn` → 服务端日志 `[Scripting] ...`；JSON/维度解析错误 → `bedrock_server/ContentLog*.txt`
  - Endstone 0.11.12 在**本机**（Arch）起不来（pybind11/libc++ ABI 冲突，与行为包无关），要验 Endstone 得去目标 Ubuntu 机
- 待上机验证（需真人玩家/客户端，测试服验不了）：
  - 高位建造 → 放弃岛屿 → 重置是否把 y>320 的方块清干净（`island.js` 边界/重置改动涉及所有岛）
  - 公告/排行榜行距的视觉效果（API 已实测可用，默认 0.15 需按观感微调）
  - 流浪商人 marker 实际到访（需玩家在自己岛上）
- 常见下一步：新功能开发 → `node --check` 校验 → **本地测试服实测** → `sync-to-game.sh` 同步 → 按需提交/更新版本
