# Beatorini 行为包代码审查报告

> 审查日期：2026-09-26 ｜ 基线：`983bf76`（4.13.4）
> 范围：`scripts/` 全部 31 个模块 + `lib/` + `main.js` + `config.js` + `dimensions/`
> 方法：4 组并行静态审查（逐行阅读 + 对照 `@minecraft/server` 2.11.0-beta.1.26.51-stable / `@minecraft/server-ui` 2.3.0-beta 的 `index.d.ts` 与 `docs/bedrock-creator-docs.md`）+ 本地 BDS 1.26.51 实测复核（`tools/local-server/`）
> 行号以审查时的工作区为准，后续提交可能漂移

**复核标记**：✅ 本人实测复现 ｜ 🔍 本人读码核对 ｜ ◻ 子审查静态结论（未独立复核）

---

## 0. 摘要

- **P0 共 6 条**：其中 3 条会在特定条件下造成**物品/金币永久损失**，2 条会让**功能整批静默消失**，1 条是**结构性根因**（`main.js` 无错误边界）。
- **P1 共 14 条**：静默失败、状态不原子、经济漏洞、失效 ID、边界越界（其中 1 条是 4.13.0 自身引入的回归）。
- **P2 共 20+ 条**：健壮性、性能、常量漂移、死代码。
- 本次「金库零日志」事故的**同类静默路径在 20+ 处仍然存在**；`vault.js` 只修了它自己那一处。

---

## 1. P0（会造成事故 / 数据损失 / 功能整批失效）

### P0-1　`main.js` 顺序 init 无错误边界：任一模块抛错，其后所有模块静默不初始化 ◻
- 位置：`scripts/main.js:43-67`
- 触发：任一 `init()` 抛错（事件不存在、API 在 Endstone 上语义不同、注册失败）→ 后续 init 全部跳过，连唯一的成功标志 `[Beatorini] All modules initialized!` 也不会出现。链尾正是 `mob-density / chatbubble / menus / 自定义命令`，且它们都不打启动日志 —— **与本次事故"某模块零日志"的症状完全同型**。
- 证据：
```js
initTrader(); initTools(); initMobDensity(); initChatBubble(); initMenus();
registerCustomCommands();
console.warn("[Beatorini] All modules initialized!");   // 抛错后这行没有
```
- 修法：逐个 `try { mod.init(); console.warn("[Boot] ok <模块>"); } catch (e) { console.error("[Boot] FAILED <模块>: " + e); }`；这是**根治"静默不初始化"的唯一手段**。

### P0-2　金库"就绪判据只看数量"＋"200 tick 后无条件重建空实体并清空索引映射" → 全服在售商品被批量隔离（物品永久丢失） 🔍
- 位置：`market.js:700-708`（`isVaultReadyForMarket` 只看 `found >= expected`）、`market.js:791-815`（对账链）、`market.js:870-911`（不匹配即 `removed` + 隔离）、`vault.js:149-199`（`ensureVaultEntities` 删悬空索引 + 补建空实体）、`vault.js:434-459`（等待上限 20×10 tick 后无条件调用它）
- 触发：区块加载慢于 ~10 秒（慢盘 / Endstone / 世界变大）→ 实体尚未加载就被判"已丢失" → **索引映射被清 + 补建 2 个空容器实体** → 数量瞬间"达标" → 对账逐槽比对全空 → **所有清单被下架并塞进隔离区**（隔离区只存清单元数据，**物品本身不会回来**）。
- 为什么本次事故没触发数据损失：链在更早处就静默死掉了（`ensureVaultEntities` 从未执行）——属于**侥幸**。
- 修法（按优先级）：
  1. 就绪判据改为"内容可信"：金库侧在 `ensureVaultEntities()` **真正完成**后写一个 `market:vault_ready_at`/代数，市场侧必须观察到本次启动的新值才允许对账；
  2. `ensureVaultEntities()` 的破坏性分支（删映射、补空实体）必须以 `manager.getTickingArea(NAME)?.isFullyLoaded === true`（该属性存在于 2.11.0-beta，语义为"所有 ticking 区块已加载"）为前提，否则只等待并告警；
  3. 等待上限后仍不可信时，**宁可跳过对账**（现状已如此）也不要进入重建。

### P0-3　抽奖背包满：付费奖励被静默销毁，界面还提示"掉落在你脚下" 🍀 ◻
- 位置：`lottery.js:389-401`（`giveReward` 丢弃 leftover）、调用点 `483/504`、提示 `554-557`
- 触发：背包满时单抽 10 万 / 十连 100 万金币照扣，`Container.addItem` 返回的 leftover 被丢掉，物品直接消失。
- 证据：
```js
const leftover = inv.addItem(new ItemStack(reward.typeId, reward.count ?? 1));
return leftover?.amount ?? 0;      // ← leftover 从未 spawnItem
```
- 修法：leftover → `player.dimension.spawnItem(leftover, player.location)`（包 try/catch）；发放失败按成本退款并明确提示。

### P0-4　`isClockReady()` 把"时钟对象存在"当成"marker 一定会触发"，一旦为真就永久关掉商人兜底 ◻（4.13.0 新代码）
- 位置：`clock.js:108`（`ready = true`）、`110-121`（marker 补建失败只 warn）、`trader.js:142-153`（`isClockReady()` 为真则 `clearRun` 自杀且不再重启）
- 触发（任一）：`clock.isPaused === true`（全仓库无一处检查）；`addTimeMarker` 抛错导致 marker 不存在；`worldClockOnTimeMarker` 在目标运行时（Endstone）未派发；自定义时钟不随时间推进。
- 后果：**商人彻底不来**，而最后一行日志反而是"就绪"，没有任何看门狗。
- 修法：`ready = clock != null && clock.isPaused === false && timeMarkers 含目标 marker`；trader 增加**心跳看门狗**（记录 `lastMarkerTick`，> 60000 tick 未见 marker 就恢复轮询并告警）。

### P0-5　公告 / 排行榜启动重建链路零日志且 `try` 之外可抛 → 整批悬浮文本静默消失 ◻
- 位置：`notice.js:60-62`、`94-103`；`leaderboard.js:191`、`241-251`
- 触发：`world.getDimension()` 在 try 之外（`notice.js:62`、`leaderboard.js:191`）抛错 → `for` 循环整体中断，之后所有公告/排行榜永不创建，ContentLog 里一行都没有。
- 修法：`getDimension` 移入 try；每条目单独 try/catch + warn；重建结束打一条数量日志（区分"没配置"和"渲染失败"）。

### P0-6　13 处 `form.show()` 忽略 `UserBusy`：表单根本没显示，玩家与日志都无提示 ◻
- 位置：`menus.js:74,106,138,186,267`、`notice.js:154,298`、`leaderboard.js:70,90,291,418`、`admin.js:46,126`
- 原因：DDUI 的 `show()` 在"玩家正忙"时**不 reject**，而是 resolve 成 `DataDrivenScreenClosedReason.UserBusy`；这些位置只挂了 `.catch()`。仅 `signin.js` 正确处理。
- 修法：抽 `showForm(form, player, onBusy)` 统一封装，`.then(r => { if (r === DataDrivenScreenClosedReason.UserBusy) player.sendMessage("§c请先关闭当前界面"); })`。

---

## 2. P1（特定条件下出错 / 难以排查）

| # | 问题 | 位置 | 复核 |
|---|---|---|---|
| P1-1 | **【4.13.0 自身回归】维度上界 512 被当成可写层**：`y2 = min(ISLAND_DIMENSION_MAX_Y=512, yMax)` 进 `/fill` → 实测 `fillBlocks [480,512]` 抛 `Requested fill volume height [480, 512] was outside the world`，**顶段整段清不掉**（前任建筑残留） | `config.js:35`、`island.js:1199` | ✅ 实测 |
| P1-2 | `ISLAND_BOUNDARY_LIMIT_Y = 512` 配 `Math.abs(y) > 512` 判据 → 上限**永不生效**，且把下限(-64)与上限混用一个绝对值判据（语义错误） | `config.js:28`、`island.js:1112` | 🔍 |
| P1-3 | 市场**购买扣款不校验结果**就发货、卖家仍全额到账 → 可造币（`runCommand` 未生效时常常不抛错只返回 `successCount: 0`，且异常被空 catch 吞） | `market.js:218-222`、`292-337` | 🔍 |
| P1-4 | 离线售出金币：加款失败被空 catch 吞，但 `clearMarketSold` 无条件执行 → 金币蒸发 | `market.js:609-622` | 🔍 |
| P1-5 | `scheduleMarketReconcile` 递归链 + 两个定时器回调**无 try/catch**（vault 侧已修，market 侧遗漏） | `market.js:683-698`、`791-798` | 🔍 |
| P1-6 | 空岛重置对 `createTickingArea`/`waitTicks` 裸 await 无超时 → 永久卡在 `cleaning`，该岛号永久不可分配 | `island.js:1222-1252` | 🔍 |
| P1-7 | 重置瓦片因预算跳过或 `fillBlocks` 失败时只 warn，最后**仍宣告"重置完成，等待管理员确认"** → 前任资产残留给下一任（等价物品复制） | `island.js:1223-1245`、`1271-1274` | 🔍 |
| P1-8 | 建新岛 `structure load` 失败被空 catch 吞 → 玩家被传送到 y=77 虚空、脚下无方块，零日志 | `island.js:343-347` | 🔍 |
| P1-9 | `abandonIsland` 内 `onlineMember.runCommand(...)` 未防护 → 中途抛错留下"半放弃"状态（部分成员已清背包、岛数据未清、重置未排期） | `island.js:534-571`、按钮回调 `1071-1074` | 🔍 |
| P1-10 | `soul.js` 重连自动恢复是**死代码**：`PlayerJoinAfterEvent` 只有 `playerId`/`playerName`，`event.player` 恒 undefined → 出窍状态下重连永远停在旁观者 | `soul.js:153-157` | ✅ 对照 d.ts |
| P1-11 | `assistants.js` 自动切镐失效：手持**非镐**物品时 `PICKAXE_LEVEL[typeId]` 为 `undefined`，`undefined < n` 恒 false → 既不升级也不降级（静默无效） | `assistants.js:166`、`192` | 🔍 |
| P1-12 | `mob-density.js` 定时器无 try/catch，且直接读 `target.typeId` / `target.location`（可抛 `InvalidEntityError`）→ 清怪功能静默停摆；且每 100 tick 全维度枚举 + O(n²) 配对（含无人的主世界） | `mob-density.js:8-27` | 🔍 |
| P1-13 | `lobby-guard.js` 攻击拦截仍裸读失效实体（`attacker.typeId` / `inLobby(attacker)`）——4.13.0 只修了 `entitySpawn` 一处 | `lobby-guard.js:93-99` | 🔍 |
| P1-14 | **回收「海龟鳞甲」ID 失效**：用的是 `minecraft:scute`，1.26.51 正确 ID 为 `minecraft:turtle_scute` → 永远提示"不足"，无任何报错 | `recycle.js:88` | ✅ 对照 vanilla-data |
| P1-15 | **回收每日上限可被绕过**：整批按交易前档位单价结算，`reward = price * qty` 无 `RECYCLE_DAILY_CAP` 夹取 → 当日首笔回收 64 个下界残骸 = 819,200（上限 310,000 的 2.6 倍） | `recycle.js:248-259` | 🔍 |
| P1-16 | `lib/inventory.js` `giveItemToPlayer`：`new ItemStack(amount>255)` **直接抛**、65..255 被静默夹取、`spawnItem` 无防护（抛错即丢物品），且 market 返还队列**循环结束后才整体写回** → 异常时物品销毁 + 下次重复发放 | `lib/inventory.js:106-127`、`market.js:620-674` | 🔍 |
| P1-17 | 成就/签到**先落库后发钱**：发钱抛错 → 成就永久不可再触发 / 当天签到不可补领，且金币静默丢失；`signin` 还把 `form.close()` 放在可能抛错的调用之后（表单卡住） | `achievements.js:104-109`、`signin.js:108-128` | 🔍 |
| P1-18 | `talent.js` 10 tick 循环里 `catch (e) {}` 空捕获 → 天赋可永久不生效且零日志 | `talent.js:313-324` | 🔍 |

---

## 3. P2（健壮性 / 性能 / 漂移 / 死代码，摘要）

- **静默 catch 空捕获总计 63 处**（`island.js` 17、`vault.js` 8、`trader.js` 7、`market.js` 7 …），其中影响功能可见性的应逐个加限流日志。
- **JSON 解析无保护**：`market.js:41/48/71`、`island.js:70/109/128/152`、`menus.js:546/554`（后者在 15 秒清理循环里，脏数据会让**整轮清理**静默中断）、`achievements.js:74-77`（被 title.js 复用，两模块一起失效）。建议统一 `safeParseJson(key, fallback)`。
- **config 常量漂移**：`RECYCLE_WINDOW` 全仓库零引用（数值在 `recycle.js:97` 重复为字面量）；建议引入 `ISLAND_BUILD_MAX_Y = ISLAND_DIMENSION_MAX_Y - 1` 并统一使用（见 P1-1/P1-2）。
- **失效 ID / 死代码**：`minecraft:void`（`trader.js:40-46`，方块表中不存在 ✅）；`lib/inventory.js:42-76` `captureItemProps` 无调用点；`menus.js:589` `spawnDim` 未被使用；`soul:owner` 只写不读。
- **边界越界（新高度暴露）**：`ore-gen.js:55-68`（在 y=-64 或 y≥511 破石时 `getBlock` 越界抛错，中断本次刷矿）、`trader.js:30-36`（y≥510 玩家安全点扫描越界，本波无商人）。
- **经济/数值**：`money.js:19-32` 读取失败一律返回 0（把异常伪装成"金币不足"）；`death.js:29` 扣款失败整体吞掉；`lottery.js:349-373` 空奖池会无限递归爆栈（潜在）。
- **UI/交互**：下拉索引无边界校验（`leaderboard.js:270/276`、`notice.js:125/135`、`island.js:855/930`）；公告无长度/行数校验（超 128 行×128 字符会"保存成功但永久渲染失败"，且把全文塞进下拉标签）；`signin` 表单每 tick 无退避重试（玩家挂机 1 分钟 ≈ 1200 次表单构造）；`chatbubble` 每条消息全量重建 ≤5 个 primitive 且不截断聊天文本。
- **TextPrimitive 句柄泄漏**：`removeText` 失败后仍 `delete` 句柄（`notice.js:53-57`、`leaderboard.js:163-165`、`chatbubble.js` 多处）→ 残留形状永久占用全局 1000 配额且无法回收；`/reload` 后无对账（`getShapes()`/`removeAll()` 从未调用）。
- **性能**：`stats.js` 每秒每玩家 1 次世界 DP 读 + 1 次写（100 人 24h ≈ 1700 万次写）；`achievements.js:94-103` 68 成就 × 36 格双重循环（可先扫一遍背包建 Set）；`admin.js:74-119` 岛屿列表无分页（最坏 1000+ 组件）；`trader.js:161-181` 启动时 256 维度 ×2 次实体扫描且 `cleaned=0` 时不打日志。
- **其它**：`lib/teleport.js` 文档与实现不一致（传 `Dimension` 会静默变成同维度传送）；`lobby-guard` 大厅白名单过窄（掉落物/经验球/鱼钩/船/箭等**全部被删除**）；`title.js:685-692` 事件回调无 `isValid` 防护；`talent.js:174-182` LV0 显示满格进度条。

---

## 4. 与本次线上事故的关系（复盘要点）

**现象**：4.13.0 上线后金库模块**零日志**（既不成功也不失败），市场无法启动对账。

**已定位根因（4.13.3 修复）**：ticking area 旧记录残留在存档里 → `hasTickingArea()` 恒 true → 跳过创建 → 但该记录并未真正常载 `island:vault` 区块 → `spawnEntity` 抛 `LocationInUnloadedChunkError` → 金库实体永不建立。

**为什么"零日志"**：异常发生在 `system.runTimeout` 递归链内部，**不会被 `setupVault` 的 catch 捕获**（4.13.1 已补 try/catch + 超时）。

**本次审查补出的要点**：
1. 真正的**结构性根因**是 P0-1（`main.js` 无错误边界）：任何一个模块 init 抛错，其后所有模块静默不初始化 —— 这次不是它，但下次会是，且症状一模一样。
2. **同类静默路径仍有 20+ 处**（P0-2/5/6、P1-5/6/10/11/12/18…）。
3. **最危险的遗留是 P0-2**：若当时静默链没有提前死掉，而是走到 `ensureVaultEntities()`，就会**清空索引映射 + 补建空实体**，随后对账把全服在售清单批量隔离 —— **物品无法自动找回**（隔离区只存清单元数据）。这条必须在下次上线前处理。
4. 本地环境无法复现该事故的原因已明确：**我的测试实例用 `stop` 正常关服，ticking area 记录不落盘**；线上用 `fast-restart`（SIGKILL 路径）才会留下僵尸记录。建议把这一条写进 `tools/local-server/README.md`。

---

## 5. 建议的修复分批

### 批 1 —— 数据安全与"静默"根治（建议尽快，独立发版）
1. `main.js` 逐模块错误边界 + `[Boot] ok/FAILED <模块>` 日志（P0-1）
2. 金库/市场就绪判据改造：`isFullyLoaded` 前提 + 就绪代数；破坏性重建降级为最后手段（P0-2）
3. 市场资金流校验：扣款/加款以 `successCount` 或计分板 API 判定，失败不发物品、不清队列（P1-3/P1-4）
4. `ISLAND_BUILD_MAX_Y = 511` + y 判据改区间 + fill 跳过/失败不得进 `review` + await 超时 + 清实体改 `remove()`（P1-1/2/6/7）
5. 抽奖 leftover → `spawnItem` 或退款（P0-3）
6. 空 catch 巡检：把影响功能可见性的空捕获统一加限流日志（P1-12/13/17/18 等）

### 批 2 —— 正确性、经济与体验
- 时钟可用性拆解 + marker 心跳看门狗 + 对齐幂等（P0-4/P1 时钟项）
- `minecraft:scute → turtle_scute`、回收每日上限按额度结算（P1-14/15）
- `assistants` `?? -1`、`soul` 改 `playerSpawn` + `exitSoul` 原子化、`signin`/`achievements` 先付后记 + `finally close`（P1-10/11/17）
- 表单 `UserBusy` 统一封装（P0-6）、公告/排行榜重建日志与长度校验（P0-5）
- 库层防护（`inventory`/`teleport`）、下拉索引校验

### 批 3 —— 性能与清理
- `stats` DP 批量落盘、`achievements` Set 扫描、`mob-density` 位置过滤、`admin` 分页、`trader` 按需清理
- 死代码/失效常量清理、`safeParseJson` 统一、TextPrimitive 句柄对账

---

## 6. 明确「未发现」的类别（避免重复排查）

- 缺 `.catch()` 的 `form.show()`：13 处全部有 `.catch`（问题是 `UserBusy` 走 resolve 路径）
- 跨模块动态属性 key 冲突/格式不一致：未发现
- 抽奖概率与保底数学、回收档位表、天赋段长曲线、签到时区处理：逐条验算未发现数学错误
- 每 tick 的 1..256 全维度扫描：未发现（256 次注册仅 startup 一次）
- `system.run()` 回调无保护：范围内无 `system.run` 调用（全部为 `runTimeout/runInterval`）
- 动态属性向后兼容（新增 `lineGap` 等字段）：读取侧均有默认值兜底

---

## 7. 修复状态（批 1 已完成，2026-09-26）

### ✅ P0 全部 6 条已修

| # | 修复内容 | 关键实现 |
|---|---|---|
| P0-1 | `main.js` 逐模块错误边界 | `MODULES` 表 + 逐项 try/catch，失败打 `[Boot] FAILED <模块>`，末尾汇总"成功 N 个 / 失败 M 个"；任一模块抛错不再影响其余模块 |
| P0-2 | 金库/市场数据安全 | `vault.js`：用 `TickingArea.isFullyLoaded` 判定区块是否真的加载完成，僵尸区域直接删除重建；**区块未加载完成时绝不调用 `ensureVaultEntities()`**（避免清索引 + 补空实体），改为记录并让市场保持跳过；完成后写入 `market:vault_ready_at` 就绪时间戳。`market.js`：`vaultContentTrusted()` 要求时间戳 ≥ 本次启动，才允许对账/自动下架 |
| P0-3 | 抽奖发放 | leftover → `spawnItem` 落脚下；构造/掉落失败即抛错 → 单抽全额退款、十连按件均摊退款，并提示玩家 |
| P0-4 | 时钟可用性 + 商人兜底 | 新增 `isClockOperational()`（对象存在 **且** 未暂停 **且** marker 齐全）；`trader.js` 改为看门狗（每 30 秒体检：不可用/时间不推进 → 启动 100 tick 轮询，恢复 → 停表），不再"一旦 ready 就永久关掉兜底" |
| P0-5 | 公告/排行榜重建 | 逐条 try/catch + `[Notice] 重建完成：成功 N/M 条`、`[Leaderboard] 重建完成：成功 N/M 个分类`；刷新失败回退重建 |
| P0-6 | 表单 UserBusy | 新增 `lib/form.js` 的 `notifyIfBusy()`，**36 处** `form.show()` 全部接入：玩家正忙时给出明确提示（原先"点了没反应且无日志"） |

### ✅ 同批修掉的 P1/P2

- **岛屿（含 4.13.0 我引入的回归）**：新增 `ISLAND_BUILD_MAX_Y=511`，边界判据改区间 `y < MIN_Y || y > BUILD_MAX_Y`，重置 `/fill` 上界用 511（实测 512 会 `outside the world`）；`createTickingArea`/`waitTicks` 全部加超时；**跳过瓦片或 fill 失败不再宣告"重置完成"**（保持 dirty + 告警）；清实体改用 `element.remove()`（不再依赖越界的 y=-104 传送）
- **市场资金流**：新增 `changeMoney()` 校验 `successCount`，购买/退款/解锁/离线收益/卖家到账全部接入；卖家到账失败自动转入离线收益队列；对账递归链整体 try/catch
- **抽奖/回收**：扣款校验 + 退款；回收每日额度夹取（原先可绕过 31 万上限）；`minecraft:scute` → `minecraft:turtle_scute`
- **成就/签到**：改为"先发钱、确认生效后再落库"；签到烟花独立兜底、表单必关
- **soul**：`playerJoin` 没有 player 字段 → 改用 `playerSpawn`，重连恢复不再是死代码
- **assistants**：`PICKAXE_LEVEL[...] ?? -1`（非镐物品时自动切镐不再静默失效）
- **mob-density / lobby-guard / talent**：定时器与事件回调兜底 + `isValid` 守卫 + 失败日志
- **lib/inventory**：按 `maxAmount` 拆分入包（`ItemStack` 超过 255 会直接抛）、无效 ID 明确报错、掉落失败不再丢物品
- **JSON 兜底**：新增 `lib/json.js`（`safeParseArray`/`safeParseObject`），`market`/`island`/`achievements`/`menus` 的动态属性解析全部接入
- **新增共享库**：`lib/async.js`（`withTimeout`）、`lib/form.js`、`lib/json.js`；删除失效常量 `ISLAND_BOUNDARY_LIMIT_Y`
- 清理 4 处缺导入的隐患（注入 `notifyIfBusy` 时漏了 3 个文件的 import）

### 本地实测（BDS 1.26.51.1 + 生产世界副本）

```
[Beatorini] All modules initialized!（23 个模块 + 自定义命令）   ← 无 FAILED
[Clock] 已注册 beatorini:server，time marker：beatorini:trader_noon@6000+48000
[Clock] beatorini:server 就绪（time=23196，…）
[Leaderboard] 重建完成：成功 5/5 个分类
[Notice] 重建完成：成功 4/4 条
[Vault] Ticking area 就绪（9/300 chunks，isFullyLoaded=true）
[Vault] 金库就绪：2 个实体，54 个槽位（索引映射 2 条，区块已加载=true）
[Market] 对账完成：修复 0 个错位清单，移除 0 个异常清单（已隔离），14 个孤儿物品保留在金库
```
另：`34 个模块 import/export 全匹配`、全项目 `node --check` 通过、ContentLog 无 `[Scripting][error]`。

### ⏳ 未做（批 2 / 批 3）

- 批 2：时钟对齐幂等（避免每次 worldLoad 回拨 + 可能触发 marker）、签到表单退避、公告长度校验、`lib/teleport` 文档不一致、大厅实体白名单过窄（掉落物/经验球被删）、下拉索引边界校验、`money.js` 失败日志、`title.js` 事件守卫、`talent` LV0 进度条、`pickReward` 递归、`ore-gen`/`trader` 越界 y
- 批 3：`stats` 每秒 DP 写批量落盘、成就背包 Set 扫描、`admin` 分页、死代码/失效常量清理（`captureItemProps`、`spawnDim`、`soul:owner`、`RECYCLE_WINDOW`）

---

## 8. 批 2 / 批 3 修复状态（2026-09-26 续）

### ✅ 批 2：正确性、经济与体验

| 项 | 修复 |
|---|---|
| 时钟对齐幂等 | 只在偏差 > 200 tick 时回拨，并打印"已对齐/已回拨 N tick"。避免每次 worldLoad 回拨造成 marker 相位漂移、以及"设置时间"本身触发 marker |
| 签到表单重试 | 忙碌重试改指数退避（2→4→8→16→32→40 tick 封顶）+ 30 次上限告警；原先每 tick 重建一次表单（挂机 1 分钟 ≈ 1200 次） |
| 公告长度校验 | 保存前校验 128 行 × 每行 128 字符（超限时明确提示且不落盘）；下拉标签截断到 24 字符 + `⏎` |
| `lib/teleport.js` | 兼容"直接传 Dimension"（旧实现会把跨维度传送静默降级为同维度） |
| 大厅实体白名单 | 补入掉落物/经验球/鱼钩/箭/船/矿车/画/展示框等无害实体（原先"大厅丢东西就消失"）；移除失败限流告警 |
| 下拉索引校验 | 新增 `validIndex()`，`leaderboard`(2)/`notice`(2)/`recycle`(1) 共 5 处接入并提示"选择无效" |
| `money.js` | 读取失败不再伪装成"余额 0"：限流打 `[Money] 读取金币失败`，便于区分"没钱"与"计分板坏了" |
| `title.js` | 蹲下事件加 `isValid` + try/catch；3 处移除失败改为**保留句柄待重试**（避免形状残留且永远回收不了） |
| `talent.js` | LV0 不再显示 12 格满进度条 |
| `lottery.js` | `pickReward` 空奖池/稀有度拼错时不再无限递归爆栈 |
| `ore-gen.js` | 相邻方块读取加 y 越界保护（-64 与 511/512 边界处挖矿不再中断回调） |
| `trader.js` | 安全点扫描加 y 边界保护（高位玩家不再因越界拿不到商人） |
| `death.js` | 死亡惩罚结算失败改为告警（原为空 catch） |
| `soul.js` | 退出出窍改为**先恢复、全部成功后再清状态**；失败保留状态并提示重试（原先中途抛错会永久卡旁观者） |
| `lib/inventory.js` | `itemProps` 分支的掉落同样兜底（失败不再丢物品） |

### ✅ 批 3：性能与清理（部分）

- `stats.js`：在线时长改为内存累加，**每 30 秒 + 玩家离线时批量落盘**（原先每秒每人一次世界级 DP 读+写）
- `achievements.js`：改为先扫一遍背包建 `Set<typeId>`，再做 68 次 `has()`（原先 68×36 次 `getItem`）
- `recycle.js`：价格档位改为由 `RECYCLE_WINDOW` 推导（**数值与原硬编码逐位一致**，仅消除"改常量无效"的漂移）
  - ⚠️ 过程记录：第一版推导成 `W + (CAP-W)·k` 得到 235000/272500/…，与原值 240000/280000/300000/310000 **不同** —— 属于会静默改动回收经济的错误，已回退为 `W·1.5/1.75/1.875/1.9375` 并在本地用脚本断言与旧值完全相等
- 死代码：删除 `menus.js` 未使用的 `spawnDim`

### ✅ 低优先级项（2026-09-26 第三批，已全部处理）

| 项 | 修复 |
|---|---|
| `admin.js` 岛屿列表分页 | 每页 15 个岛 + 上一页/下一页；标题显示"第 N/M 页"（原先 256 岛会一次性构建 1000+ 组件） |
| `tools.js` 自动补工具 | `runTimeout` 回调加 `isValid`/容器守卫 + try/catch（原先玩家掉线即静默失效） |
| `menus.js` 进服处理链 | `playerSpawn` 加 `isValid` 守卫、维度读取包 try/catch（原先一次抛错会跳过欢迎语/菜单时钟/签到/市场离线收益/大厅重定向整条链）；快捷栏补货回调同样加守卫 |
| `island.js` 下拉取值 | 消息中心 3 处 + 转账目标 1 处改用 `validIndex()`（客户端可写下标越界不再抛 TypeError） |
| TextPrimitive 句柄 | `notice.js` / `leaderboard.js` 移除失败时**保留句柄待重试**（原先句柄被丢弃 → 形状永久残留且占配额）；`chatbubble.js` 移除失败改为告警 |
| `chatbubble.js` 文本 | 截断到 128 字符 + 去除 `§` 颜色码（超长会导致该条气泡构造失败而丢失） |
| `lib/inventory.js` 库层守卫 | 新增 `getContainer()`：`countItem`/`removeItems`/`captureItemProps`/`giveItemToPlayer` 全部接入；`captureItemProps` 加注释说明只服务旧存档数据 |
| `stats.js` | 击杀统计加失效实体守卫（`isValid` + try/catch）；名字映射写入失败改为告警 |
| `assistants.js` | `getAssistSettings` 的 DP 读取与解析整体兜底（原先读取在 try 之外，一次异常会让三条辅助功能一起停用） |
| `notice.js` 背景默认值 | 编辑器对旧数据改为与渲染一致的"无背景"，不再"一进编辑就凭空多出背景" |
| `soul.js` | 删除只写不读的 `soul:owner` 死写入 |

**明确不修改（有意保留）**：`mob-density` 的整维度扫描（该功能语义就是"清掉全维度里任何位置的富集怪"，改成按玩家范围会失去意义）；`stats` 其余计数（击杀/挖掘等）维持事件级读改写（量级远小于原每秒在线时长写入）。

### 最终验证（BDS 1.26.51.1 + 生产世界副本）

```
[Beatorini] All modules initialized!（23 个模块 + 自定义命令）
[Clock] 时钟已对齐（偏差 0 tick），跳过回拨
[Clock] beatorini:server 就绪（time=1301，marker：beatorini:trader_noon@6000+48000）
[Leaderboard] 重建完成：成功 5/5 个分类
[Notice] 重建完成：成功 4/4 条
[Vault] Ticking area 就绪（9/300 chunks，isFullyLoaded=true）
[Vault] 金库就绪：2 个实体，54 个槽位（索引映射 2 条，区块已加载=true）
[Market] 对账完成：修复 0 个错位清单，移除 0 个异常清单（已隔离），14 个孤儿物品保留在金库
```
- 34 模块 import/export 全匹配、全项目 `node --check` 通过、ContentLog `[Scripting][error]` = **0**、`stop` 正常退出
