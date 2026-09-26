// ============================================================
// 灵魂出窍：原地生成盔甲架标记位置，玩家切换旁观者模式自由飞行；
// /fc off 传送回标记位置并恢复原游戏模式。
// 出窍状态落盘（动态属性），脚本重载/玩家重连自动恢复。
// ============================================================
import { system, world } from "@minecraft/server";
import { LOBBY_DIMENSION_ID } from "./config.js";

const SOUL_KEY = "soul:active_";
const SOUL_MAX_RANGE = 96; // 灵魂出窍活动半径
const active = new Map(); // playerId -> { marker, originalMode }

export function isSoulActive(playerId) {
  return !!world.getDynamicProperty(SOUL_KEY + playerId);
}

export function toggleSoul(player, on) {
  if (on) {
    enterSoul(player);
  } else {
    exitSoul(player, "手动关闭");
  }
}

function enterSoul(player) {
  if (player.dimension.id === LOBBY_DIMENSION_ID) {
    player.sendMessage("§c主世界（大厅）不能开启灵魂出窍");
    return;
  }
  if (world.getDynamicProperty(SOUL_KEY + player.id)) {
    player.sendMessage("§c你已在灵魂出窍中");
    return;
  }
  const loc = player.location;
  try {
    const marker = player.dimension.spawnEntity("beatorini:soul_marker", {
      x: Math.floor(loc.x) + 0.5,
      y: Math.floor(loc.y),
      z: Math.floor(loc.z) + 0.5,
    });
    marker.nameTag = `§e${player.name} 的灵魂`;

    const originalMode = String(player.getGameMode()).toLowerCase();
    world.setDynamicProperty(SOUL_KEY + player.id, marker.id);
    active.set(player.id, {
      player,
      marker,
      originalMode,
      bodyPos: { x: loc.x, y: loc.y, z: loc.z },
      fixedPos: marker.location,
      dimensionId: player.dimension.id,
    });
    player.runCommand("gamemode spectator @s");

    player.sendMessage(
      "§a已开启灵魂出窍！身体位置已标记，输入 /fc off 传送回身体"
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

  const data = active.get(player.id);
  let originalMode = data?.originalMode;
  if (!originalMode) {
    try {
      const current = String(player.getGameMode()).toLowerCase();
      originalMode = current === "spectator" ? "survival" : current;
    } catch (e) {
      console.warn(`[Soul] 读取游戏模式失败，按 survival 恢复：${e}`);
      originalMode = "survival";
    }
  }

  // 顺序很重要：旧的写法一进来就清掉 soul:active_<id>（唯一的持久状态），
  // 之后 teleport / gamemode 任一步抛错 → 状态已丢、标记未删、模式未恢复，
  // 玩家永久卡在旁观者且无日志。现在改为：能恢复多少先恢复，全成功后再清状态。
  let restored = true;

  const marker = (() => {
    try {
      return world.getEntity(markerId);
    } catch (e) {
      return undefined;
    }
  })();

  if (data?.bodyPos) {
    try {
      player.teleport(data.bodyPos, {
        dimension: world.getDimension(data.dimensionId),
      });
    } catch (e) {
      restored = false;
      console.error(`[Soul] 传送回本体失败（${player.name ?? player.id}）：${e}`);
    }
  } else if (marker) {
    try {
      player.teleport(marker.location, { dimension: marker.dimension });
    } catch (e) {
      restored = false;
      console.error(`[Soul] 传送到标记失败（${player.name ?? player.id}）：${e}`);
    }
  }

  try {
    marker?.remove();
  } catch (e) {
    console.warn(`[Soul] 移除出窍标记失败（忽略）：${e}`);
  }

  try {
    const res = player.runCommand(`gamemode ${originalMode} @s`);
    if ((res?.successCount ?? 0) < 1) {
      restored = false;
      console.error(`[Soul] 恢复游戏模式未生效（${player.name ?? player.id} → ${originalMode}）`);
    }
  } catch (e) {
    restored = false;
    console.error(`[Soul] 恢复游戏模式抛错（${player.name ?? player.id}）：${e}`);
  }

  if (restored) {
    // 只有确实恢复成功才清状态；否则保留，玩家可用 /fc off 再试一次
    world.setDynamicProperty(SOUL_KEY + player.id, undefined);
    active.delete(player.id);
    player.sendMessage(`§e已退出灵魂出窍（${reason}）`);
    player.playSound("random.orb");
  } else {
    player.sendMessage(
      "§c退出灵魂出窍时有步骤失败（已保留状态），请再执行一次 /fc off 或联系管理员"
    );
  }
}

function restoreAfterReload(player) {
  if (!player) return;
  if (world.getDynamicProperty(SOUL_KEY + player.id)) {
    exitSoul(player, "脚本重载");
  }
}

export function init() {
  // 灵魂出窍范围限制：超出 r96 拉回标记位置
  system.runInterval(() => {
    for (const data of active.values()) {
      const p = data.player;
      try {
        const loc = p.location;
        const dx = loc.x - data.fixedPos.x;
        const dy = loc.y - data.fixedPos.y;
        const dz = loc.z - data.fixedPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > SOUL_MAX_RANGE) {
          // 拉回边界点（标记→玩家的方向上距离 r96 的位置），而非标记点
          const scale = SOUL_MAX_RANGE / dist;
          p.teleport(
            {
              x: data.fixedPos.x + dx * scale,
              y: data.fixedPos.y + dy * scale,
              z: data.fixedPos.z + dz * scale,
            },
            {
              dimension: world.getDimension(data.dimensionId),
            }
          );
          p.sendMessage(`§c已到达灵魂出窍边界（r${SOUL_MAX_RANGE}），无法继续向外移动`);
        }
      } catch (e) {}
    }
  }, 5);

  // 脚本重载后恢复在线玩家
  world.afterEvents.worldLoad.subscribe(() => {
    for (const p of world.getPlayers()) {
      if (p) restoreAfterReload(p);
    }
  });

  // 玩家重连恢复（离线期间标记保留在存档中）
  // 注意：PlayerJoinAfterEvent 只有 playerId/playerName，**没有 player 字段**，
  // 旧写法 event.player 恒为 undefined → restoreAfterReload 永久早退，重连恢复是死代码。
  // 改用 playerSpawn（带 event.player），并延时等实体可用。
  world.afterEvents.playerSpawn.subscribe((event) => {
    const p = event.player;
    if (!p) return;
    system.runTimeout(() => {
      try {
        restoreAfterReload(p);
      } catch (e) {
        console.warn(`[Soul] 重连恢复失败（${p.name ?? p.id}）：${e}`);
      }
    }, 10);
  });

}
