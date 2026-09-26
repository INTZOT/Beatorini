import { system, world, EntityTypes } from "@minecraft/server";

// --- 怪物富集检测：同种生物 r=2 范围内超过阈值则清除 ---
const MOB_DENSITY_THRESHOLD = 30;
const MOB_DENSITY_RADIUS = 2;

export function init() {
  system.runInterval(() => {
    // 整个定时器兜底：以前回调里任何一次异常都会让富集清理静默停摆
    try {
      scanAndCleanDenseMobs();
    } catch (e) {
      console.warn(`[MobDensity] 扫描异常（本次跳过）：${e}`);
    }
  }, 100);
}

function scanAndCleanDenseMobs() {
    const activeDims = new Set();
    activeDims.add("minecraft:overworld");
    for (const p of world.getPlayers()) {
      activeDims.add(p.dimension.id);
    }

    for (const dimId of activeDims) {
      let dimension;
      try {
        dimension = world.getDimension(dimId);
      } catch (e) {
        continue;
      }
      const monsters = dimension.getEntities({ families: ["monster"] });
      if (monsters.length < MOB_DENSITY_THRESHOLD) continue;

      // 抽样实体与后续遍历都可能拿到"已被其它模块移除"的实体：
      // 读 typeId/location 会抛 InvalidEntityError，必须逐个守卫（否则整轮扫描中断）
      const target = monsters[Math.floor(Math.random() * monsters.length)];
      if (!target || !target.isValid) continue;
      let typeId, x, y, z;
      try {
        typeId = target.typeId;
        ({ x, y, z } = target.location);
      } catch (e) {
        continue;
      }

      const r2 = MOB_DENSITY_RADIUS * MOB_DENSITY_RADIUS;
      const sameType = [];
      for (const m of monsters) {
        try {
          if (!m.isValid || m.typeId !== typeId) continue;
          const dx = m.location.x - x;
          const dy = m.location.y - y;
          const dz = m.location.z - z;
          if (dx * dx + dy * dy + dz * dz <= r2) {
            sameType.push(m);
          }
        } catch (e) {}
      }

      if (sameType.length >= MOB_DENSITY_THRESHOLD) {
        for (const m of sameType) {
          try {
            m.remove();
          } catch (e) {}
        }

        const match = dimId.match(/^island:void_(\d+)$/);
        const islandLabel = match ? `岛屿#${match[1]}` : dimId;
        const mobType = EntityTypes.get(typeId);
        const mobName = mobType?.localizationKey
          ? { translate: mobType.localizationKey }
          : { text: typeId.replace("minecraft:", "") };
        const msg = {
          rawtext: [
            {
              text: `§c${islandLabel} (${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}) `,
            },
            mobName,
            { text: `富集！已清除 ${sameType.length} 只！` },
          ],
        };
        world.sendMessage(msg);
      }
    }
}
