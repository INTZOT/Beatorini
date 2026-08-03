import { world } from "@minecraft/server";
import { getPlayerMoney } from "./money.js";
import { DEATH_PENALTY_BASE, DEATH_PENALTY_RATE } from "./config.js";

// ============================================================
// 死亡惩罚：物品不掉落，仅扣除金币（不足扣到 0，不欠账）
// ============================================================

export function init() {
  world.afterEvents.entityDie.subscribe((event) => {
    const dead = event.deadEntity;
    if (!dead || dead.typeId !== "minecraft:player") return;

    try {
      const net = getPlayerMoney(dead);
      if (net <= 0) return;

      const penalty = Math.max(
        DEATH_PENALTY_BASE,
        Math.floor(net * DEATH_PENALTY_RATE)
      );
      const actual = Math.min(net, penalty);

      const obj = world.scoreboard.getObjective("money");
      if (obj) {
        obj.setScore(dead, net - actual);
        dead.sendMessage(`§c你因死亡损失了 ${actual} 金币（净资产 ${net}）`);
      }
    } catch (e) {}
  });
}
