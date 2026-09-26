import { world } from "@minecraft/server";

/** 确保 money 计分板存在，不存在则自动创建 */
export function ensureMoneyObjective() {
  try {
    let obj = world.scoreboard.getObjective("money");
    if (!obj) {
      obj = world.scoreboard.addObjective("money", "金币");
      console.warn("[Money] 已自动创建 money 计分板");
    }
    return obj;
  } catch (e) {
    console.warn(`[Money] 创建/获取 money 计分板失败: ${e}`);
    return null;
  }
}

const moneyWarnAt = new Map(); // playerId -> 上次告警时间（限流）

/** 读取计分板金币；计分板不存在时自动创建，玩家无分数时赋值 0 */
export function getPlayerMoney(player) {
  try {
    const obj = ensureMoneyObjective();
    if (!obj) return 0;
    const score = obj.getScore(player);
    if (score === null || score === undefined) {
      player.runCommand("scoreboard players set @s money 0");
      return 0;
    }
    return score;
  } catch (e) {
    // 区分"读取失败"与"余额为 0"：旧写法一律返回 0，会让购买/解锁全部提示
    // "金币不足"，把排查引向完全错误的方向（失败限流记录）
    const last = moneyWarnAt.get(player?.id ?? "?") ?? 0;
    if (Date.now() - last > 60000) {
      moneyWarnAt.set(player?.id ?? "?", Date.now());
      console.error(
        `[Money] 读取金币失败（按 0 处理）：${e}，玩家=${player?.name ?? player?.id ?? "?"}`
      );
    }
    return 0;
  }
}

/** 初始化：启动时确保计分板存在 */
export function init() {
  // world.scoreboard 需在世界启动后可用
  world.afterEvents.worldLoad.subscribe(() => {
    ensureMoneyObjective();
  });
}
