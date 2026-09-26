import { system, world } from "@minecraft/server";
import {
  STATS_PLAYTIME_PREFIX,
  STATS_KILLS_PREFIX,
  STATS_MINED_PREFIX,
  STATS_PLACED_PREFIX,
  STATS_DEATHS_PREFIX,
  PLAYER_NAME_PREFIX,
} from "./config.js";

// --- 统计类别定义 ---
export const STATS_CATEGORIES = [
  {
    key: "playtime",
    name: "在线时长",
    icon: "⏱",
    prefix: STATS_PLAYTIME_PREFIX,
    format: (v) =>
      `${Math.floor(v / 3600)}h ${Math.floor((v % 3600) / 60)}m`,
  },
  {
    key: "kills",
    name: "击杀数量",
    icon: "⚔",
    prefix: STATS_KILLS_PREFIX,
    format: (v) => `${v}`,
  },
  {
    key: "mined",
    name: "挖掘数量",
    icon: "⛏",
    prefix: STATS_MINED_PREFIX,
    format: (v) => `${v}`,
  },
  {
    key: "placed",
    name: "放置数量",
    icon: "❑",
    prefix: STATS_PLACED_PREFIX,
    format: (v) => `${v}`,
  },
  {
    key: "deaths",
    name: "死亡次数",
    icon: "❤",
    prefix: STATS_DEATHS_PREFIX,
    format: (v) => `${v}`,
  },
];

/** 读取玩家统计值 */
export function getStat(playerId, prefix) {
  return world.getDynamicProperty(prefix + playerId) ?? 0;
}

/** 在线时长内存缓冲：playerId -> 秒数（30 秒或离线时落盘） */
const playtimeBuffer = new Map();

/** 把缓冲的在线时长写回动态属性；传 playerId 只落该玩家 */
function flushPlaytime(onlyPlayerId) {
  if (onlyPlayerId) {
    const seconds = playtimeBuffer.get(onlyPlayerId);
    if (!seconds) return;
    playtimeBuffer.delete(onlyPlayerId);
    addStat(onlyPlayerId, STATS_PLAYTIME_PREFIX, seconds);
    return;
  }
  for (const [playerId, seconds] of [...playtimeBuffer]) {
    if (!seconds) continue;
    playtimeBuffer.delete(playerId);
    addStat(playerId, STATS_PLAYTIME_PREFIX, seconds);
  }
}

/** 累加玩家统计值 */
export function addStat(playerId, prefix, amount) {
  world.setDynamicProperty(prefix + playerId, getStat(playerId, prefix) + amount);
}

/** 自动建立/刷新 玩家 ID → 名字 映射（离线显示用） */
export function bindPlayerName(player) {
  if (!player || !player.id || !player.name) return;
  try {
    world.setDynamicProperty(PLAYER_NAME_PREFIX + player.id, player.name);
  } catch (e) {}
}

/** 读取已绑定的名字，无映射返回 undefined */
export function getBoundPlayerName(playerId) {
  const name = world.getDynamicProperty(PLAYER_NAME_PREFIX + playerId);
  return typeof name === "string" && name ? name : undefined;
}

export function init() {
  // --- 玩家上线自动绑定 ID → 名字 ---
  world.afterEvents.playerSpawn.subscribe((event) => {
    bindPlayerName(event.player);
  });
  // reload 后为已在线的玩家补录
  world.afterEvents.worldLoad.subscribe(() => {
    system.runTimeout(() => {
      for (const p of world.getPlayers()) bindPlayerName(p);
    }, 10);
  });

  // --- 在线时长：内存累加，每 30 秒批量落盘（原来每秒每人一次世界级 DP 读 + 写，
  //     100 人 24 小时 ≈ 1700 万次写，是世界 DP 最大的写放大来源）---
  system.runInterval(() => {
    try {
      for (const player of world.getPlayers()) {
        playtimeBuffer.set(player.id, (playtimeBuffer.get(player.id) ?? 0) + 1);
      }
    } catch (e) {
      console.warn(`[Stats] 在线时长累加异常：${e}`);
    }
  }, 20);

  system.runInterval(() => {
    try {
      flushPlaytime();
    } catch (e) {
      console.warn(`[Stats] 在线时长落盘异常：${e}`);
    }
  }, 20 * 30);

  // 玩家离线时立即落盘（避免丢最后一分钟）
  world.afterEvents.playerLeave.subscribe((event) => {
    try {
      flushPlaytime(event.playerId);
    } catch (e) {}
  });

  // --- 击杀统计 ---
  world.afterEvents.entityDie.subscribe((event) => {
    const attacker = event.damageSource?.damagingEntity;
    if (attacker?.typeId === "minecraft:player") {
      addStat(attacker.id, STATS_KILLS_PREFIX, 1);
    }
    // 玩家死亡统计
    if (event.deadEntity?.typeId === "minecraft:player") {
      addStat(event.deadEntity.id, STATS_DEATHS_PREFIX, 1);
    }
  });

  // --- 挖掘统计 ---
  world.afterEvents.playerBreakBlock.subscribe((event) => {
    addStat(event.player.id, STATS_MINED_PREFIX, 1);
  });

  // --- 放置统计 ---
  world.afterEvents.playerPlaceBlock.subscribe((event) => {
    addStat(event.player.id, STATS_PLACED_PREFIX, 1);
  });
}

/**
 * 通过 ID 获取玩家名（在线取真实名，离线取绑定名，均无则截断 ID）
 */
export function getPlayerNameById(playerId) {
  const player = [...world.getPlayers()].find((p) => p.id === playerId);
  if (player) return player.name;
  return getBoundPlayerName(playerId) || playerId.slice(0, 8) + "...";
}
