// ============================================================
// 大厅保护：主世界（大厅）内非管理员禁止破坏/放置方块、
// 攻击、使用道具、交互方块与实体。管理员以 op tag 判定。
// 菜单时钟必须放行（右键时钟走 itemUse 事件打开菜单）。
// ============================================================
import { system, world } from "@minecraft/server";
import {
  DIMENSION_NAMESPACE,
  LOBBY_DIMENSION_ID,
} from "./config.js";
import { getPlayerBoundIndex } from "./island.js";

const warnCooldown = new Map();
const DROP_TELEPORT_Y = 100; // 传回岛屿上空，物品自然落回岛中心附近

function isAdmin(entity) {
  return entity?.hasTag?.("op") ?? false;
}

function inLobby(entity) {
  return entity?.dimension?.id === LOBBY_DIMENSION_ID;
}

function warnOnce(player, message) {
  const now = system.currentTick;
  if ((warnCooldown.get(player.id) ?? 0) + 60 > now) return; // 3 秒冷却防刷屏
  warnCooldown.set(player.id, now);
  player.sendMessage(message);
}

export function init() {
  world.beforeEvents.playerBreakBlock.subscribe((event) => {
    const p = event.player;
    if (!isAdmin(p) && inLobby(p)) {
      event.cancel = true;
      warnOnce(p, "§c大厅内禁止破坏方块");
    }
  });

  world.beforeEvents.playerPlaceBlock.subscribe((event) => {
    const p = event.player;
    if (!isAdmin(p) && inLobby(p)) {
      event.cancel = true;
      warnOnce(p, "§c大厅内禁止放置方块");
    }
  });

  world.beforeEvents.itemUse.subscribe((event) => {
    const p = event.source;
    if (isAdmin(p) || !inLobby(p)) return;
    // 时钟用于打开菜单，必须放行
    if (event.itemStack?.typeId === "minecraft:clock") return;
    event.cancel = true;
    warnOnce(p, "§c大厅内禁止使用道具");
  });

  world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const p = event.player;
    if (isAdmin(p) || !inLobby(p)) return;
    event.cancel = true;
    warnOnce(p, "§c大厅内禁止对方块使用道具");
  });

  world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    const p = event.player;
    if (isAdmin(p) || !inLobby(p)) return;
    event.cancel = true;
    warnOnce(p, "§c大厅内禁止与实体交互");
  });

  world.beforeEvents.entityHurt.subscribe((event) => {
    const attacker = event.damageSource?.damagingEntity;
    if (!attacker || attacker.typeId !== "minecraft:player") return;
    if (isAdmin(attacker) || !inLobby(attacker)) return;
    event.cancel = true;
    warnOnce(attacker, "§c大厅内禁止攻击");
  });

  // 大厅丢弃物品：定期扫描掉落物，按距离归属最近的有岛玩家并传送到其岛屿
  system.runInterval(() => {
    try {
      const lobby = world.getDimension(LOBBY_DIMENSION_ID);
      const items = lobby.getEntities({ type: "minecraft:item" });
      if (items.length === 0) return;

      const lobbyPlayers = [...world.getPlayers()].filter(
        (p) => p.dimension.id === LOBBY_DIMENSION_ID
      );
      // 按归属玩家分组
      const groups = new Map();
      for (const item of items) {
        let best = null;
        let bestDist = Infinity;
        for (const p of lobbyPlayers) {
          if (isAdmin(p)) continue; // 管理员除外
          if (getPlayerBoundIndex(p.id) === undefined) continue;
          const d = Math.hypot(
            p.location.x - item.location.x,
            p.location.z - item.location.z
          );
          if (d < bestDist) {
            bestDist = d;
            best = p;
          }
        }
        if (!best || bestDist > 8) continue; // 无法归属或距离过远
        const list = groups.get(best.id) ?? [];
        list.push({ item, player: best });
        groups.set(best.id, list);
      }

      for (const list of groups.values()) {
        const player = list[0].player;
        const dim = world.getDimension(
          `${DIMENSION_NAMESPACE}:void_${getPlayerBoundIndex(player.id)}`
        );
        system.runTimeout(() => {
          teleportItemsToIsland(dim, player, list.map((x) => x.item)).catch(
            (e) => console.warn(`[LobbyGuard] Drop relay failed: ${e}`)
          );
        }, 1);
      }
    } catch (e) {
      console.warn(`[LobbyGuard] Drop sweep failed: ${e}`);
    }
  }, 10);
}

async function teleportItemsToIsland(dim, player, items) {
  const manager = world.tickingAreaManager;
  const areaName = `lobby_drop_${player.id}`;
  const options = {
    dimension: dim,
    from: { x: -16, y: 64, z: -16 },
    to: { x: 16, y: 120, z: 16 },
  };
  let created = false;
  try {
    if (!manager.hasTickingArea(areaName)) {
      if (manager.hasCapacity(options)) {
        await manager.createTickingArea(areaName, options);
        created = true;
      }
    }
    await system.waitTicks(30);
    let ok = 0;
    for (const item of items) {
      try {
        if (item.isValid()) {
          item.teleport(
            { x: 0.5, y: DROP_TELEPORT_Y, z: 0.5 },
            { dimension: dim }
          );
          ok++;
        }
      } catch (e) {
        console.warn(`[LobbyGuard] Drop teleport failed: ${e}`);
      }
    }
    if (ok > 0) {
      warnOnce(player, `§a丢出的 ${ok} 个物品已传送回你的空岛（岛中心上空）`);
    }
  } finally {
    if (created) {
      try {
        manager.removeTickingArea(areaName);
      } catch (e) {}
    }
  }
}
