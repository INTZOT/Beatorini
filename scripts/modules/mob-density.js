import { system, world, EntityTypes } from "@minecraft/server";

// --- 怪物富集检测：同种生物 r=2 范围内超过阈值则清除 ---
const MOB_DENSITY_THRESHOLD = 30;
const MOB_DENSITY_RADIUS = 2;

export function init() {
  system.runInterval(() => {
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

      const target = monsters[Math.floor(Math.random() * monsters.length)];
      const typeId = target.typeId;
      const { x, y, z } = target.location;

      const r2 = MOB_DENSITY_RADIUS * MOB_DENSITY_RADIUS;
      const sameType = [];
      for (const m of monsters) {
        if (m.typeId !== typeId) continue;
        const dx = m.location.x - x;
        const dy = m.location.y - y;
        const dz = m.location.z - z;
        if (dx * dx + dy * dy + dz * dz <= r2) {
          sameType.push(m);
        }
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
  }, 100);
}
