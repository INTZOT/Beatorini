import { system, world } from "@minecraft/server";
import {
  DIMENSION_NAMESPACE,
  DIMENSION_COUNT,
  LAST_TRADER_DAY_PREFIX,
} from "./config.js";
import { getPlayerBoundIndex } from "./island.js";

/** 在玩家附近寻找安全生成点：不生成在虚空，需要脚下实心方块 + 2 格垂直空间 */
function findSafeSpawnNear(player) {
  const dim = player.dimension;
  const baseX = Math.floor(player.location.x);
  const baseY = Math.floor(player.location.y);
  const baseZ = Math.floor(player.location.z);

  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 4 + Math.random() * 10; // 4~14 格
    const dx = Math.round(Math.cos(angle) * dist);
    const dz = Math.round(Math.sin(angle) * dist);

    // 优先同高度，其次上下小范围找地面
    for (const dy of [0, -1, 1, -2, 2]) {
      const x = baseX + dx;
      const y = baseY + dy;
      const z = baseZ + dz;
      const feet = dim.getBlock({ x, y, z });
      const head = dim.getBlock({ x, y: y + 1, z });
      const ground = dim.getBlock({ x, y: y - 1, z });
      if (!feet || !head || !ground) continue;

      // 不能为虚空
      if (
        feet.typeId === "minecraft:void" ||
        head.typeId === "minecraft:void" ||
        ground.typeId === "minecraft:void"
      ) {
        continue;
      }

      // 2 格垂直空间：站立格与头顶格均为空气
      if (!feet.isAir || !head.isAir) continue;

      // 脚下需为实心方块（排除空气/液体/虚空）
      if (!ground.isSolid || ground.isLiquid) continue;

      return { x: x + 0.5, y, z: z + 0.5 };
    }
  }
  return null;
}

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

      // 在玩家附近随机选安全点生成，避免干扰挂机
      const safePos = findSafeSpawnNear(player);
      if (!safePos) {
        console.warn(
          `[Trader] 未找到安全生成点，跳过 ${player.name} 的流浪商人生成`
        );
        continue;
      }

      world.setDynamicProperty(playerKey, currentDay);
      const trader = player.dimension.spawnEntity(
        "minecraft:wandering_trader",
        safePos
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
