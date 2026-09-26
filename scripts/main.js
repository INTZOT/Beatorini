// ============================================================
// 灯浮市BeatoriniFI — 主入口
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

// 世界时钟必须在 startup 之前注册；排查时置 ENABLE_WORLD_CLOCK = false 可整体跳过
if (ENABLE_WORLD_CLOCK) {
  initClock();
} else {
  console.warn("[Beatorini] ENABLE_WORLD_CLOCK = false，已跳过世界时钟注册");
}
initDimensions();
initVault();
initIsland();
initLobbyGuard();
initSoul();
initAssistants();
initMarket();
initMoney();
initLottery();
initStats();
initLeaderboard();
initNotice();
initTalent();
initTitle();
initDeathPenalty();
initAchievements();
initOreGen();
initTrader();
initTools();
initMobDensity();
initChatBubble();
initMenus();
registerCustomCommands();

console.warn("[Beatorini] All modules initialized!");
