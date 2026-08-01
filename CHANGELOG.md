# 更新日志

本项目所有重要改动均记录在此文件中。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布] - 2026-08-01

### 新增

- **市场金库自定义实体** `beatorini:market_vault`：27 格容器、持久化、无重力/无碰撞、免疫伤害与火焰、不可推动，用于无损存储交易物品。
- **金库模块** `scripts/modules/vault.js`：
  - `storeItem` / `takeItem` / `peekItem` 直接读写实体容器，完整 `ItemStack` 进出，附魔、名称、Lore、耐久等 NBT 无损；
  - 容器满 27 格自动扩展新金库实体，按 X→Z→Y 三维网格排布（2 格间距、4×4×4 共 64 实体/单元）；
  - 使用 `world.tickingAreaManager` 创建常加载区域，`hasCapacity` 预检并失败重试；
  - `debugVault` 与 `#vaulttest` 命令（OP 专用），验证带附魔/名称/Lore 物品的完整往返。
- 金库维度 `island:vault` 注册（`dimensions.js`）。
- **money 计分板自动创建**：`money.js` 启动时检测，不存在则自动创建 `money` 计分板，读取时亦有兜底。
- **物品/实体显示名本地化**：市场物品名改用 `ItemTypes` / `BlockTypes` 的 `localizationKey`，怪物名改用 `EntityTypes` 的 `localizationKey`，由客户端按玩家语言翻译。

### 重构

- **市场交易改为无损存储**（`market.js`）：
  - 上架：克隆背包同类型物品栈 → 拆分数量 → 存入金库 → 从背包移除，清单记录 `vault: { index, slot }`；
  - 购买：从金库无损取出 → 交付买家背包（满则掉落脚下）→ 卖家收款；取货失败自动退单退款，交付异常回滚并存回金库；
  - 下架：从金库完整返还卖家；
  - 启动对账：金库容器 ↔ 市场清单核对，孤儿物品按类型+数量尽量救回，异常清单自动下架并提示卖家。
- **常加载区域改用 ScriptAPI**：由 `/tickingarea` 命令切换为 `world.tickingAreaManager`，避开原版命令每世界 10 个区域的上限（每包另有 ticking 区块总数上限，创建前通过 `hasCapacity` 预检）。
- **市场/怪物显示层移除中文映射表**：删除 `market.js` 中约 300 条 `ITEM_CN_NAMES` 硬编码表，改为本地化键 + RawText 客户端翻译；上架时保存 `itemKey` 快照，历史清单自动回退类型查询；不展示 `nameTag`，避免玩家用自定义命名混淆商品。

### 移除

- **下界与末地相关模块**：`nether.js`、`end-raid.js` 及其在 `main.js` 中的初始化；相关 135 个结构文件（`end_loot_*`、`piglin_*`、`nether_*`、`extraction_point`、`1-1~3-4`、`structure-void` 等）移出活动包，活动结构仅保留 `island_base.mcstructure`。
- **teleport 调试功能**：`teleport.js` 移除全部调试日志与 1s/3s 延迟验证，`island.js` 调用同步更新。
- **「自刎归天」功能**：删除菜单按钮及 `suicide_` 相关判断，死亡恢复正常计数与防御 XP 结算。
- **死代码** `scripts/lib/storage.js`（动态属性封装，全项目零引用）。

### 修复与调查

- 上架物品超过 27 个：金库自动扩展新实体承接，不再溢出。
- DDUI 表单底部默认关闭按钮：确认为官方引擎行为（关闭按钮客户端权威，脚本无法隐藏/移除），未做代码改动，等待 Mojang 后续版本修复。
- 自定义维度高度限制：尝试 `dimensions/*.json` 方案设置 -64~512 后回滚。查证确认该目录仅支持覆盖原版维度；`registerCustomDimension` 无高度参数，1.26.30 起自定义维度高度由引擎固定为同步主世界默认。

### 其他

- 初始化 Git 仓库（`main` 分支），新增 `.gitignore`（忽略 `.agents/`、`.codex/`、临时文件等），完成首次提交。
