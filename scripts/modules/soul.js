// ============================================================
// 灵魂出窍：原地生成盔甲架标记位置，玩家切换旁观者模式自由飞行；
// #fc off 传送回标记位置并恢复原游戏模式。
// 出窍状态落盘（动态属性），脚本重载/玩家重连自动恢复。
// ============================================================
import { system, world } from "@minecraft/server";

const SOUL_KEY = "soul:active_";
const SOUL_OWNER_KEY = "soul:owner";
const active = new Map(); // playerId -> { marker, originalMode }

export function toggleSoul(player, on) {
  if (on) {
    enterSoul(player);
  } else {
    exitSoul(player, "手动关闭");
  }
}

function enterSoul(player) {
  if (world.getDynamicProperty(SOUL_KEY + player.id)) {
    player.sendMessage("§c你已在灵魂出窍中");
    return;
  }
  const loc = player.location;
  try {
    const marker = player.dimension.spawnEntity("minecraft:armor_stand", {
      x: Math.floor(loc.x) + 0.5,
      y: Math.floor(loc.y),
      z: Math.floor(loc.z) + 0.5,
    });
    marker.nameTag = `§e${player.name} 的灵魂`;
    marker.setDynamicProperty(SOUL_OWNER_KEY, player.id);

    const originalMode = String(player.getGameMode()).toLowerCase();
    world.setDynamicProperty(SOUL_KEY + player.id, marker.id);
    active.set(player.id, {
      marker,
      originalMode,
      fixedPos: marker.location,
    });
    player.runCommand("gamemode spectator @s");

    player.sendMessage(
      "§a已开启灵魂出窍！身体位置已标记，输入 #fc off 传送回身体"
    );
    player.playSound("random.orb");
  } catch (e) {
    world.setDynamicProperty(SOUL_KEY + player.id, undefined);
    try {
      active.get(player.id)?.marker?.remove();
    } catch (e2) {}
    active.delete(player.id);
    player.sendMessage(`§c开启灵魂出窍失败: ${e}`);
  }
}

function exitSoul(player, reason) {
  const markerId = world.getDynamicProperty(SOUL_KEY + player.id);
  if (!markerId) return;
  world.setDynamicProperty(SOUL_KEY + player.id, undefined);

  const data = active.get(player.id);
  let originalMode = data?.originalMode;
  if (!originalMode) {
    const current = String(player.getGameMode()).toLowerCase();
    originalMode = current === "spectator" ? "survival" : current;
  }
  active.delete(player.id);

  const marker = world.getEntity(markerId);
  if (marker) {
    try {
      player.teleport(marker.location, { dimension: marker.dimension });
      marker.remove();
    } catch (e) {}
  }

  try {
    player.runCommand(`gamemode ${originalMode} @s`);
  } catch (e) {}
  player.sendMessage(`§e已退出灵魂出窍（${reason}）`);
  player.playSound("random.orb");
}

function restoreAfterReload(player) {
  if (world.getDynamicProperty(SOUL_KEY + player.id)) {
    exitSoul(player, "脚本重载");
  }
}

export function init() {
  // 盔甲架钉回生成位置，等效不受重力影响（悬浮标记）
  system.runInterval(() => {
    for (const data of active.values()) {
      const m = data.marker;
      try {
        if (m?.isValid()) {
          m.teleport(data.fixedPos, { dimension: m.dimension });
        }
      } catch (e) {}
    }
  }, 2);

  // 脚本重载后恢复在线玩家
  world.afterEvents.worldLoad.subscribe(() => {
    for (const p of world.getPlayers()) {
      restoreAfterReload(p);
    }
  });

  // 玩家重连恢复（离线期间标记保留在存档中）
  world.afterEvents.playerJoin.subscribe((event) => {
    const p = event.player;
    system.runTimeout(() => restoreAfterReload(p), 10);
  });

  // 盔甲架标记受到伤害时自动退出灵魂出窍
  world.afterEvents.entityHurt.subscribe((event) => {
    const ent = event.hurtEntity;
    if (ent.typeId !== "minecraft:armor_stand") return;
    const ownerId = ent.getDynamicProperty(SOUL_OWNER_KEY);
    if (!ownerId) return;
    const player = [...world.getPlayers()].find((p) => p.id === ownerId);
    if (player) {
      exitSoul(player, "身体标记受击");
    } else {
      world.setDynamicProperty(SOUL_KEY + ownerId, undefined);
      active.delete(ownerId);
      try {
        ent.remove();
      } catch (e) {}
    }
  });
}
