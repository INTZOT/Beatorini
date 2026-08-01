// ============================================================
// 灯浮市BeatoriniFI — 主入口
// ============================================================

// --- 核心模块初始化函数 ---
import { init as initDimensions } from "./modules/dimensions.js";
import { init as initVault } from "./modules/vault.js";
import { init as initMarket } from "./modules/market.js";
import { init as initMoney } from "./modules/money.js";
import { init as initStats } from "./modules/stats.js";
import { init as initProficiency } from "./modules/proficiency.js";
import { init as initAchievements } from "./modules/achievements.js";
import { init as initOreGen } from "./modules/ore-gen.js";
import { init as initTrader } from "./modules/trader.js";
import { init as initTools } from "./modules/tools.js";
import { init as initMobDensity } from "./modules/mob-density.js";

// --- 菜单与聊天路由 ---
import { init as initMenus } from "./modules/menus.js";

// ============================================================
// 启动所有模块
// ============================================================

initDimensions();
initVault();
initMarket();
initMoney();
initStats();
initProficiency();
initAchievements();
initOreGen();
initTrader();
initTools();
initMobDensity();
initMenus();

console.warn("[Beatorini] All modules initialized!");
