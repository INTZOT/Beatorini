// ============================================================
// 全局常量与配置
// ============================================================

// --- 维度配置 ---
export const DIMENSION_NAMESPACE = "island";
export const DIMENSION_COUNT = 256;
export const OVERWORLD_ID = "minecraft:overworld";
// 大厅直接使用主世界，不再注册 island:void_0
export const LOBBY_DIMENSION_ID = OVERWORLD_ID;

// --- 动态属性 Key 前缀 ---
export const BOUND_COUNTER_KEY = "island:bound_counter";
export const PLAYER_BOUND_PREFIX = "island:player_";
export const JOIN_FLAG_PREFIX = "island:joined_";
export const ACHIEVEMENT_PREFIX = "island:ach_";

// --- 岛屿管理 ---
export const ISLAND_OWNER_PREFIX = "island:owner_";
export const ISLAND_MEMBERS_PREFIX = "island:members_";
export const ISLAND_STATUS_PREFIX = "island:status_";
export const ISLAND_JOIN_REQ_PREFIX = "island:join_req_";
export const ISLAND_VISIT_REQ_PREFIX = "island:visit_req_";
export const ISLAND_NOTIFICATIONS_PREFIX = "island:notifications_";
export const MAX_ISLAND_MEMBERS = 5;
export const ISLAND_BOUNDARY_PREFIX = "island:boundary_"; // 岛屿动态边界（六极值 JSON）
export const ISLAND_BOUNDARY_LIMIT = 256; // 水平方向（x/z）自动扩展上限（超出不扩展，重置不覆盖）
// 垂直方向不再用 ±512 的绝对值判据（那会让上限永不生效），改用下面的
// ISLAND_DIMENSION_MIN_Y / ISLAND_BUILD_MAX_Y 做区间判据（见 island.js）。

// --- 空岛维度高度（由 tools/gen-island-dimensions.js 生成 dimensions/island_void_N.json） ---
// 实测（BDS 1.26.51）：文档写 height_range ≤ 384，但真实约束是 min_y + height_range ≤ 512，
// 即维度最高点不能超过 512；超过会被整份 JSON 拒绝（维度静默回落默认值）。
export const ISLAND_DIMENSION_MIN_Y = -64; // 维度底部
export const ISLAND_DIMENSION_HEIGHT_RANGE = 576; // 总高（-64 + 576 = 最高点 512）
export const ISLAND_DIMENSION_MAX_Y = 512; // 维度边界层（只读不可写）；改动时三个值必须自洽
// 可建造上限：512 是只读边界层（setblock/fillBlocks 到 512 会报
// "Requested fill volume height [...] was outside the world"，实测），因此
// 边界判据与重置 /fill 上界都必须用 511，否则顶段永远清不掉。
export const ISLAND_BUILD_MAX_Y = ISLAND_DIMENSION_MAX_Y - 1; // 511

export const ISLAND_BOUNDARY_INITIAL = {
  xMin: -8,
  xMax: 8,
  yMin: 64,
  yMax: 76,
  zMin: -8,
  zMax: 8,
};
export const ISLAND_RESET_DELAY_MS = 5000; // 放弃后 5 秒开始自动重置
export const ISLAND_RESET_SCHEDULE_PREFIX = "island:reset_at_"; // 重置计划目标时间戳（毫秒）
export const ISLAND_ABANDON_PREFIX = "island:abandon_date_"; // 玩家最近一次放弃岛屿的日期（每日限制）

// --- 称号 ---
export const TITLE_PREFIX = "title_";
export const DEFAULT_TITLE = "【玩家】";
export const TITLE_NOTIFY_PREFIX = "title:notify_"; // 已全服通报过的称号 id 列表（JSON）
export const TITLE_MONEY_PEAK_PREFIX = "title:money_peak_"; // 历史最高持有金币

// --- 签到 ---
export const PLAYER_SIGNIN_DATE = "island:signin_date_";
export const PLAYER_SIGNIN_STREAK = "island:signin_streak_";

// --- 统计 ---
export const STATS_PLAYTIME_PREFIX = "stats:playtime_";
export const STATS_KILLS_PREFIX = "stats:kills_";
export const STATS_MINED_PREFIX = "stats:mined_";
export const STATS_PLACED_PREFIX = "stats:placed_";
export const STATS_DEATHS_PREFIX = "stats:deaths_";
export const STATS_LOTTERY_PREFIX = "stats:lottery_";
export const PLAYER_NAME_PREFIX = "player:name_"; // 玩家 ID → 名字映射（离线显示用）

// --- 大厅悬浮排行榜 ---
export const LEADERBOARD_DISPLAY_PREFIX = "leaderboard:display_"; // 各分类位置 JSON：{x,y,z,scale}
export const LEADERBOARD_DISPLAY_COUNT = 20; // 悬浮榜显示条数
export const LEADERBOARD_LINE_GAP_DEFAULT = 0.15; // 悬浮榜默认行距（TextPrimitive.lineGapHeight）

// --- 悬浮公告 ---
export const NOTICE_LIST_KEY = "notice:list"; // 公告列表 JSON
export const NOTICE_MAX = 32; // 公告数量上限
export const NOTICE_LINE_GAP_DEFAULT = 0.15; // 公告默认行距（TextPrimitive.lineGapHeight）

// --- 天赋 ---
export const TALENT_PREFIX = "talent:lv_";
export const TALENT_MAX_LEVEL = 120;
export const TALENT_PERIOD_TICKS = 1200; // 60 秒周期（20 tick/秒）
export const TALENT_COST_BASE = 5000;
export const TALENT_COST_GROWTH = 1.04;

// --- 流浪商人 ---
export const LAST_TRADER_DAY_PREFIX = "island:last_trader_day:";

// --- 自定义世界时钟（@minecraft/server 2.11.0-beta 新增能力，见 clock.js） ---
// 排查开关：置 false 可完全跳过 clock.js 初始化（线上二分定位用，改完需重启）
export const ENABLE_WORLD_CLOCK = true;
export const SERVER_CLOCK_ID = "beatorini:server";
export const CLOCK_MARKER_TRADER_NOON = "beatorini:trader_noon"; // 每 2 游戏日正午
export const TRADER_NOON_TIME = 6000; // 正午（tick）；启动时时钟会对齐到游戏时刻，period 取 24000 整数倍即可保证每次落在正午
export const TRADER_PERIOD_TICKS = 48000; // 2 游戏日 = 48000 tick
export const CLOCK_MARKERS = [
  {
    name: CLOCK_MARKER_TRADER_NOON,
    time: TRADER_NOON_TIME,
    period: TRADER_PERIOD_TICKS,
  },
];

// --- 市场 ---
export const MARKET_LISTINGS_KEY = "market:listings";
export const MARKET_SOLD_PREFIX = "market:sold_";
export const MARKET_RETURNS_PREFIX = "market:returns_";
export const MARKET_UNLOCKED_PREFIX = "market:unlocked_";
export const MARKET_COUNTER_KEY = "market:counter";
export const MARKET_UNLOCK_COST = 20000;
export const MARKET_QUARANTINE_KEY = "market:quarantine"; // 对账移除的异常清单隔离区（供管理员恢复）

// --- 经济系统 ---
export const MARKET_TAX_RATE = 0.05; // 市场交易税（成交时从卖家到账中扣除）
export const TRANSFER_TAX_RATE = 0.05; // 转账税（由转出方额外支付）
export const SIGNIN_BASE_REWARD = 2000; // 签到基础奖励
export const SIGNIN_STREAK_REWARD = 500; // 每连续一天追加奖励
export const SIGNIN_MAX_REWARD = 5000; // 签到奖励上限
export const RECYCLE_WINDOW = 160000; // 原价窗口：每种物品当日累计金币达到该值前保持原价
export const RECYCLE_DAILY_CAP = 310000; // 第五次降价后归零，单种物品当日收益上限
export const RECYCLE_CUM_PREFIX = "recycle:cum_"; // 个人当日回收累计金额（按玩家存储 JSON）

// --- 死亡惩罚 ---
export const DEATH_PENALTY_BASE = 5000; // 死亡固定底价
export const DEATH_PENALTY_RATE = 0.01; // 死亡净资产比例

// --- 市场金库（自定义实体无损存储） ---
export const MARKET_VAULT_DIM_ID = "island:vault";
export const MARKET_VAULT_ENTITY_ID = "beatorini:market_vault";
export const MARKET_VAULT_SLOTS = 27;
export const MARKET_VAULT_ORIGIN = { x: 0, y: 64, z: 0 };
export const MARKET_VAULT_SPACING = 2;
export const MARKET_VAULT_GRID_X = 4;
export const MARKET_VAULT_GRID_Y = 4;
export const MARKET_VAULT_GRID_Z = 4;
export const MARKET_VAULT_AREA_CHUNKS = 2;
export const MARKET_VAULT_COUNT_KEY = "market:vault_count";
export const MARKET_VAULT_INDEX_KEY = "market:vault_index";
export const MARKET_VAULT_INDEX_MAP_KEY = "market:vault_index_map"; // 实体 uniqueId → 索引（世界级映射；实体自身动态属性可能丢失/损坏，不可依赖）
// 2026-09-26 更名为 _v2。
// 原名字对应的 ticking area 记录残留在世界存档里，让 setupVault 里的
// hasTickingArea() 恒为 true，于是创建分支被跳过 —— 但那条记录实际并没有让
// island:vault 的区块保持加载，结果是 spawnEntity 抛 LocationInUnloadedChunkError，
// 金库实体永远建不出来，且全程无日志。
// 换名可让 hasTickingArea() 返回 false，强制走一次全新创建。
// 旧记录成为无害孤儿（不再被引用），后续可用 removeTickingArea 清理。
export const MARKET_VAULT_TICKINGAREA = "beatorini_market_vault_v2";
// 更名前的旧记录名：部分存档里会残留成"僵尸区域"（hasTickingArea() 恒 true，但区块并未常载）。
// setupVault 启动时尽力清理，避免继续占用共享 chunk 预算。
export const MARKET_VAULT_LEGACY_TICKINGAREA = "beatorini_market_vault";
// 金库"内容可信"时间戳：ensureVaultEntities() 真正跑完后写入。
// market.js 的启动对账必须看到本次启动写入的新值才允许执行 —— 否则"实体数量够了"可能只是
// 补建出来的空容器，对账会把全服在售清单当成丢失而批量隔离（物品无法自动找回）。
export const MARKET_VAULT_READY_KEY = "market:vault_ready_at";
