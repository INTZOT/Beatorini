// ============================================================
// 灯浮市BeatoriniFI — 主入口
//
// 所有模块的 init() 都经过错误边界逐个调用：
// 单个模块抛错只会让它自己被跳过（并在日志里明确标注 FAILED），
// 不会再像以前那样静默中断其后所有模块的初始化 —— 那种情况会让
// 「某模块完全没有日志」变成无法定位的事故（2026-09-26 金库事故即此类）。
// ============================================================

// --- 核心模块初始化函数 ---
import { ENABLE_WORLD_CLOCK } from "./modules/config.js";
import { init as initClock } from "./modules/clock.js";
import { init as initDimensions } from "./modules/dimensions.js";
import { init as initVault } from "./modules/vault.js";
import { init as initIsland } from "./modules/island.js";
import { init as initLobbyGuard } from "./modules/lobby-guard.js";
import { init as initSoul } from "./modules/soul.js";
import { init as initAssistants } from "./modules/assistants.js";
import { init as initMarket } from "./modules/market.js";
import { init as initMoney } from "./modules/money.js";
import { init as initLottery } from "./modules/lottery.js";
import { init as initStats } from "./modules/stats.js";
import { init as initLeaderboard } from "./modules/leaderboard.js";
import { init as initNotice } from "./modules/notice.js";
import { init as initTalent } from "./modules/talent.js";
import { init as initTitle } from "./modules/title.js";
import { init as initDeathPenalty } from "./modules/death.js";
import { init as initAchievements } from "./modules/achievements.js";
import { init as initOreGen } from "./modules/ore-gen.js";
import { init as initTrader } from "./modules/trader.js";
import { init as initTools } from "./modules/tools.js";
import { init as initMobDensity } from "./modules/mob-density.js";
import { init as initChatBubble } from "./modules/chatbubble.js";

// --- 菜单与聊天路由 ---
import { init as initMenus, registerCustomCommands } from "./modules/menus.js";

// ============================================================
// 启动所有模块
// ============================================================

// 顺序有语义：dimensions 必须早于 vault（金库维度要先注册），market 依赖 vault，
// menus 依赖前面所有模块导出的表单入口；clock 必须最先（startup 之前注册时钟）。
const MODULES = [
  ["clock", ENABLE_WORLD_CLOCK ? initClock : null], // 置 ENABLE_WORLD_CLOCK = false 可整体跳过
  ["dimensions", initDimensions],
  ["vault", initVault],
  ["island", initIsland],
  ["lobbyGuard", initLobbyGuard],
  ["soul", initSoul],
  ["assistants", initAssistants],
  ["market", initMarket],
  ["money", initMoney],
  ["lottery", initLottery],
  ["stats", initStats],
  ["leaderboard", initLeaderboard],
  ["notice", initNotice],
  ["talent", initTalent],
  ["title", initTitle],
  ["death", initDeathPenalty],
  ["achievements", initAchievements],
  ["oreGen", initOreGen],
  ["trader", initTrader],
  ["tools", initTools],
  ["mobDensity", initMobDensity],
  ["chatBubble", initChatBubble],
  ["menus", initMenus],
];

const failed = [];
let started = 0;

for (const [name, initFn] of MODULES) {
  if (typeof initFn !== "function") {
    console.warn(`[Boot] skip ${name}（已通过配置关闭）`);
    continue;
  }
  try {
    initFn();
    started++;
  } catch (e) {
    failed.push(name);
    console.error(`[Boot] FAILED ${name}: ${e}${e?.stack ? `\n${e.stack}` : ""}`);
  }
}

try {
  registerCustomCommands();
} catch (e) {
  failed.push("customCommands");
  console.error(`[Boot] FAILED customCommands: ${e}${e?.stack ? `\n${e.stack}` : ""}`);
}

if (failed.length > 0) {
  console.error(
    `[Beatorini] 启动完成（成功 ${started} 个），但有 ${failed.length} 个模块初始化失败：${failed.join(", ")}`
  );
} else {
  console.warn(`[Beatorini] All modules initialized!（${started} 个模块 + 自定义命令）`);
}
