# 灯浮市 BeatoriniFI

Minecraft 基岩版**空岛服务器**行为包（纯 JavaScript，无资源包）。约 9400 行脚本、27 个功能模块，
覆盖自定义维度空岛、无损市场金库、经济系统、抽奖、天赋、称号、成就、统计与悬浮文本展示。

- 目标运行时：**BDS 1.26.51**（Bedrock Dedicated Server）
- Script API：`@minecraft/server` **2.11.0-beta**、`@minecraft/server-ui` **2.3.0-beta**
  （与游戏版本严格对应，见 `manifest.json` 的 `dependencies`）
- 生产环境：Endstone + BDS（Linux）；本地开发用纯 BDS，见 `tools/local-server/`
- 授权：**MIT**（见 [LICENSE](LICENSE)）

---

## 功能一览

| 模块 | 说明 |
|---|---|
| `dimensions` | 注册 256 个自定义空岛维度（`island:void_1..256`）+ 金库维度，配 `dimensions/*.json` 定义高度与生成器 |
| `island` | 空岛分配/绑定/成员/访客/放弃/自动重置；动态边界自动扩张，建筑上限 **y=511** |
| `vault` / `market` | 金库用自定义实体容器**无损存储**物品（保留附魔/耐久/NBT），市场支持上架、购买、税后到账、离线收益、48 小时自动下架、启动对账与隔离 |
| `money` / `lottery` / `recycle` | 计分板经济、带保底的抽奖、阶梯降价回收（每日额度上限） |
| `talent` / `title` / `achievements` / `stats` | 天赋树、称号与头顶悬浮显示、成就、多维度排行榜统计 |
| `notice` / `leaderboard` / `chatbubble` | 基于 `TextPrimitive` 的悬浮公告、实时排行榜、聊天气泡（支持行距参数） |
| `clock` / `trader` | 世界时钟（`registerClock`）按时刻表调度流浪商人；时钟不可用时自动降级为轮询（带看门狗） |
| `soul` / `assistants` / `tools` | 灵魂出窍观战、辅助功能（自动补工具/补方块）、大厅防护、死亡惩罚、矿石生成 |

管理面板、自定义命令（`/menu` 等）统一在 `menus` 中注册。

## 目录结构

```
manifest.json            行为包清单（模块版本必须与游戏版本匹配）
scripts/
  main.js                入口：MODULES 表逐个初始化（含错误边界）
  modules/               27 个功能模块
  lib/                   公共库：inventory / teleport / async / json / form / text-primitive
dimensions/              257 个维度定义 JSON（void_1..256 + 金库）
entities/                金库容器实体、灵魂标记实体
structures/              空岛模板（.mcstructure）与几何文件
tools/
  lint-symbols.js        符号解析检查：找出"用了但没导入/没定义"的标识符
  gen-island-dimensions.js  由 config 生成 dimensions/*.json（含高度自洽断言）
  diff-mcapi.js          Script API / vanilla-data 版本差异对比
  local-server/          本地无头测试服：起服、发命令、部署行为包
HANDOVER.md              架构约定、环境信息、踩坑记录（含"提交前必跑三项检查"）
CHANGELOG.md             版本变更记录
CODE_REVIEW-2026-09-26.md 全量代码审查报告与修复记录
```

## 快速开始

### 1. 安装依赖（仅开发期需要，运行时不需要）

```bash
npm install                 # 若 ~/.npm 只读，附加 --cache ./.npm-cache
```

### 2. 本地起服自测（Linux）

```bash
tools/local-server/run.sh                  # 通过 FIFO 启动 BDS 并接管 stdin
tools/local-server/cmd.sh "say hello"      # 向服务器发命令
tools/local-server/deploy-pack.sh <世界名>  # 把行为包 rsync 进指定世界
```

`tools/local-server/README.md` 记录了实测得到的关键结论（自定义维度高度上限、`format_version`
要求、ticking area 行为等）。

### 3. 同步到游戏世界

```bash
./sync-to-game.sh /path/to/world/behavior_packs/Beatorini
```

### 4. 打包成 `.mcpack`（可直接导入游戏）

```bash
tools/build-mcpack.sh              # 版本号取自 package.json，输出 dist/BeatoriniFI-v<版本>.mcpack
node tools/gen-pack-icon.js        # 需要重新生成包图标时
```

`.mcpack` 要求 `manifest.json` 位于压缩包**根目录**，且只含游戏需要的内容
（`manifest.json` / `pack_icon.png` / `entities` / `scripts` / `dimensions` / `structures/*.mcstructure`）；
打包脚本会自检这两点，并把 `tools/`、`docs/`、`node_modules/`、`*.geo.json` 等一律排除。

> 导入注意：本包使用 **beta 版 Script API 模块**（`2.11.0-beta` / `2.3.0-beta`），
> 因此目标世界的实验性选项里必须开启 **Beta APIs**，且游戏版本需与 `manifest.json`
> 的 `min_engine_version` 匹配（当前 1.26.51）。

### 5. 提交前必跑（HANDOVER 第 9 条）

```bash
node --check scripts/main.js            # 1. 语法
node tools/lint-symbols.js scripts      # 2. 符号解析（防 ReferenceError）
tools/local-server/run.sh               # 3. 起服看启动日志
```

> 第 2 项不是可选项：语法检查和 `import/export` 匹配检查**都无法发现"使用了但没导入"的标识符**，
> 这类错误只会在对应代码路径被玩家触发时以 `ReferenceError` 暴露到线上。

## 开发约定（摘自 [HANDOVER.md](HANDOVER.md)）

本项目在真实服务器上运行，因此对**静默失败**零容忍：

- 所有模块 `init()` 经 `main.js` 的错误边界调用，失败会打 `[Boot] FAILED <模块>`，不影响其它模块
- 可能长时间不 resolve 的原生 Promise 一律用 `lib/async.js` 的 `withTimeout()` 包超时
- 动态属性 JSON 一律走 `lib/json.js` 的 `safeParseArray/Object`，坏数据不能让事件回调抛穿
- `form.show()` 必须处理 `UserBusy`（它是 **resolve** 而不是 reject）；客户端可写的下标必须校验
- 改动玩家金币：一律用校验 `successCount` 的封装，且**先付后记**
- 自定义维度可写上限是 `min_y + height_range ≤ 512`，**可写层最高 511**（512 只读，`/fill` 会报错）

## 授权与第三方内容

- 本仓库代码以 **MIT** 授权发布。
- `node_modules/`、`docs/`、`.npm-cache/`、`.bds-test/`、构建产物均不入库。
  `docs/` 是本地 API 参考副本（`@minecraft/*` 的 `.d.ts` 与 Microsoft Learn 文档，
  分别归 Mojang / Microsoft 所有），仅作开发期查阅，**不随本仓库分发**。
- 仓库内不含任何服务器密钥、玩家数据或私有配置。

## 版本与日志

版本号与游戏内更新日志同步，见 [CHANGELOG.md](CHANGELOG.md)；玩家可见的简版日志同步维护在
`simple_changelog.md` 与 `scripts/modules/signin.js` 的 `SERVER_CHANGELOGS`。
