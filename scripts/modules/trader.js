import { system, world } from "@minecraft/server";
import {
  DIMENSION_NAMESPACE,
  DIMENSION_COUNT,
  LAST_TRADER_DAY_PREFIX,
} from "./config.js";
import { getPlayerBoundIndex } from "./island.js";

export function init() {
  // 启动时清理服务器重启遗留的僵尸流浪商人
  system.runTimeout(() => {
    let cleaned = 0;
    for (let i = 1; i <= DIMENSION_COUNT; i++) {
      try {
        const dim = world.getDimension(`${DIMENSION_NAMESPACE}:void_${i}`);
        const traders = dim.getEntities({ type: "minecraft:wandering_trader" });
        for (const t of traders) {
          try {
            t.remove();
            cleaned++;
          } catch (e) {}
        }
      } catch (e) {}
    }
    if (cleaned > 0) {
      console.warn(
        `[Trader] Cleaned up ${cleaned} stale wandering traders from previous session`
      );
    }
  }, 40);

  // --- 每2个游戏日正午在玩家空岛生成流浪商人 ---
  system.runInterval(() => {
    const timeOfDay = world.getTimeOfDay();
    if (timeOfDay < 5500 || timeOfDay >= 6500) return;

    const currentDay = Math.floor(world.getAbsoluteTime() / 24000);

    for (const player of world.getPlayers()) {
      const boundIndex = getPlayerBoundIndex(player.id);
      if (boundIndex === undefined) continue;
      if (
        player.dimension.id !== `${DIMENSION_NAMESPACE}:void_${boundIndex}`
      )
        continue;

      const playerKey = LAST_TRADER_DAY_PREFIX + player.id;
      const lastTraderDay = world.getDynamicProperty(playerKey) ?? -999;
      if (currentDay - lastTraderDay < 2) continue;

      world.setDynamicProperty(playerKey, currentDay);

      const { x, y, z } = player.location;
      const trader = player.dimension.spawnEntity(
        "minecraft:wandering_trader",
        { x, y: y + 1, z }
      );
      player.sendMessage("§e一位流浪商人来到了你的岛屿！");
      system.runTimeout(() => {
        try {
          trader.remove();
        } catch (e) {}
      }, 20 * 60 * 10);
    }
  }, 100);
}
