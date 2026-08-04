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
export const ISLAND_BOUNDARY_LIMIT = 256; // 单方向自动扩展上限（超出不扩展，重置不覆盖）
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

// --- 签到 ---
export const PLAYER_SIGNIN_DATE = "island:signin_date_";
export const PLAYER_SIGNIN_STREAK = "island:signin_streak_";

// --- 统计 ---
export const STATS_PLAYTIME_PREFIX = "stats:playtime_";
export const STATS_KILLS_PREFIX = "stats:kills_";
export const STATS_MINED_PREFIX = "stats:mined_";
export const STATS_PLACED_PREFIX = "stats:placed_";
export const STATS_DEATHS_PREFIX = "stats:deaths_";

// --- 天赋 ---
export const TALENT_PREFIX = "talent:lv_";
export const TALENT_MAX_LEVEL = 120;
export const TALENT_PERIOD_TICKS = 1200; // 60 秒周期（20 tick/秒）
export const TALENT_COST_BASE = 5000;
export const TALENT_COST_GROWTH = 1.04;

// --- 流浪商人 ---
export const LAST_TRADER_DAY_PREFIX = "island:last_trader_day:";

// --- 市场 ---
export const MARKET_LISTINGS_KEY = "market:listings";
export const MARKET_SOLD_PREFIX = "market:sold_";
export const MARKET_RETURNS_PREFIX = "market:returns_";
export const MARKET_UNLOCKED_PREFIX = "market:unlocked_";
export const MARKET_COUNTER_KEY = "market:counter";
export const MARKET_UNLOCK_COST = 200000;

// --- 经济系统 ---
export const MARKET_TAX_RATE = 0.05; // 市场交易税（成交时从卖家到账中扣除）
export const TRANSFER_TAX_RATE = 0.05; // 转账税（由转出方额外支付）
export const SIGNIN_BASE_REWARD = 2000; // 签到基础奖励
export const SIGNIN_STREAK_REWARD = 500; // 每连续一天追加奖励
export const SIGNIN_MAX_REWARD = 5000; // 签到奖励上限
export const RECYCLE_WINDOW = 100000; // 原价窗口：每种物品当日累计金币达到该值前保持原价
export const RECYCLE_TAIL = 100000; // 超出窗口后指数衰减，价格归零前最多再赚的金币
export const RECYCLE_DAILY_CAP = RECYCLE_WINDOW + RECYCLE_TAIL; // 每种物品当日收益上限
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
export const MARKET_VAULT_TICKINGAREA = "beatorini_market_vault";
