import { system, world } from "@minecraft/server";
import {
  DIMENSION_NAMESPACE,
  DIMENSION_COUNT,
  LOBBY_DIMENSION_ID,
  LAST_TRADER_DAY_PREFIX,
  CLOCK_MARKER_TRADER_NOON,
  ISLAND_DIMENSION_MIN_Y,
  ISLAND_BUILD_MAX_Y,
} from "./config.js";
import { getPlayerBoundIndex } from "./island.js";
import { onMarker, isClockOperational, getClockTime } from "./clock.js";

const FALLBACK_INTERVAL_TICKS = 100; // 世界时钟不可用时的轮询间隔（原实现）
const TRADER_LIFETIME_TICKS = 20 * 60 * 10; // 商人停留 10 分钟后自动移除
const WATCHDOG_INTERVAL_TICKS = 600; // 每 30 秒体检一次时钟是否真的在工作
let fallbackHandle; // 兜底轮询句柄（system.runInterval 返回）
let lastMarkerAt; // 最近一次 marker 触发时的 system.currentTick（诊断用）
let lastClockSample; // 上次体检读到的 clock.time
let stallCount = 0; // 时钟时间连续未推进的次数

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
      // 建筑上限提升到 511 后，高位玩家（y≥510）会扫到 512/513 → getBlock 越界抛错
      if (y <= ISLAND_DIMENSION_MIN_Y || y + 1 >= ISLAND_BUILD_MAX_Y) continue;
      let feet, head, ground;
      try {
        feet = dim.getBlock({ x, y, z });
        head = dim.getBlock({ x, y: y + 1, z });
        ground = dim.getBlock({ x, y: y - 1, z });
      } catch (e) {
        continue;
      }
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

/** 清理主世界（大厅）中自然生成的流浪商人及行商羊驼，返回清理数量 */
function cleanMainWorldTraders() {
  let cleaned = 0;
  try {
    const dim = world.getDimension(LOBBY_DIMENSION_ID);
    for (const type of [
      "minecraft:wandering_trader",
      "minecraft:trader_llama",
    ]) {
      for (const ent of dim.getEntities({ type })) {
        try {
          ent.remove();
          cleaned++;
        } catch (e) {}
      }
    }
  } catch (e) {}
  return cleaned;
}

/** 为单个玩家尝试生成流浪商人（marker 与兜底轮询共用同一套判断），成功返回 true */
function trySpawnTrader(player) {
  const boundIndex = getPlayerBoundIndex(player.id);
  if (boundIndex === undefined) return false;
  if (player.dimension.id !== `${DIMENSION_NAMESPACE}:void_${boundIndex}`)
    return false;

  // 同一玩家 2 游戏日内只来一次（marker 重复触发 / 重启后的保护）
  const currentDay = Math.floor(world.getAbsoluteTime() / 24000);
  const playerKey = LAST_TRADER_DAY_PREFIX + player.id;
  const lastTraderDay = world.getDynamicProperty(playerKey) ?? -999;
  if (currentDay - lastTraderDay < 2) return false;

  // 在玩家附近随机选安全点生成，避免干扰挂机
  const safePos = findSafeSpawnNear(player);
  if (!safePos) {
    console.warn(
      `[Trader] 未找到安全生成点，跳过 ${player.name} 的流浪商人生成`
    );
    return false;
  }

  try {
    const trader = player.dimension.spawnEntity(
      "minecraft:wandering_trader",
      safePos
    );
    player.sendMessage("§e一位流浪商人来到了你的岛屿！");
    system.runTimeout(() => {
      try {
        trader.remove();
      } catch (e) {}
    }, TRADER_LIFETIME_TICKS);
  } catch (e) {
    // 生成失败就不写日期，留到下一个正午窗口重试
    console.warn(`[Trader] 生成失败（${player.name}）：${e}`);
    return false;
  }

  world.setDynamicProperty(playerKey, currentDay);
  return true;
}

/** 一次触发：给所有在线且待在自己岛上的玩家派商人 */
function triggerTraderWave(source) {
  const players = world.getPlayers();
  let spawned = 0;
  for (const player of players) {
    try {
      if (trySpawnTrader(player)) spawned++;
    } catch (e) {
      console.warn(`[Trader] 处理 ${player.name} 时异常：${e}`);
    }
  }
  if (spawned > 0) {
    console.warn(
      `[Trader] 商人波次（${source}）：${spawned}/${players.length} 人生成`
    );
  }
}

/**
 * 兜底轮询：世界时钟不可用（或不会真的触发 marker）时，沿用原来的
 * 100 tick 轮询 + 正午窗口判断。
 * 与 marker 路径并存是安全的：trySpawnTrader 里"同一玩家 2 游戏日内只来一次"会去重。
 */
function pollTraderNoon() {
  try {
    const timeOfDay = world.getTimeOfDay();
    if (timeOfDay < 5500 || timeOfDay >= 6500) return;
    triggerTraderWave("fallback-poll");
  } catch (e) {
    console.warn(`[Trader] 兜底轮询异常（本次跳过）：${e}`);
  }
}

function ensureFallbackRunning(reason) {
  if (fallbackHandle !== undefined) return;
  fallbackHandle = system.runInterval(pollTraderNoon, FALLBACK_INTERVAL_TICKS);
  console.warn(`[Trader] 已启用 100 tick 轮询兜底（${reason}）`);
}

function stopFallback(reason) {
  if (fallbackHandle === undefined) return;
  try {
    system.clearRun(fallbackHandle);
  } catch (e) {}
  fallbackHandle = undefined;
  console.warn(`[Trader] 已停止 100 tick 轮询兜底（${reason}）`);
}

export function init() {
  // 启动时清理服务器重启遗留的流浪商人（岛屿维度 + 主世界大厅）
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
    cleaned += cleanMainWorldTraders();
    if (cleaned > 0) {
      console.warn(
        `[Trader] Cleaned up ${cleaned} stale wandering traders from previous session`
      );
    }
  }, 40);

  // --- 主路径：世界时钟「每 2 游戏日正午」的 time marker ---
  onMarker(CLOCK_MARKER_TRADER_NOON, () => {
    lastMarkerAt = system.currentTick;
    triggerTraderWave("marker");
  });

  // --- 兜底：世界加载后时钟不可用就退回 100 tick 轮询 ---
  world.afterEvents.worldLoad.subscribe(() => {
    system.runTimeout(() => {
      if (!isClockOperational()) {
        ensureFallbackRunning("世界加载后时钟不可用");
      }
    }, 60);
  });

  // --- 看门狗：时钟"存在但不工作"（被暂停 / marker 丢失 / 时间不推进）时兜底顶上 ---
  // 之前的写法只看 isClockReady()，一旦为真就永久关掉兜底 —— 时钟若不触发 marker，
  // 商人会彻底不来，而日志最后一行反而是"就绪"。
  system.runInterval(() => {
    try {
      if (!isClockOperational()) {
        ensureFallbackRunning("时钟不可用/已暂停/缺 marker");
        return;
      }
      const now = getClockTime();
      if (typeof now === "number" && typeof lastClockSample === "number") {
        if (now > lastClockSample) {
          stallCount = 0;
        } else if (++stallCount >= 3) {
          ensureFallbackRunning("时钟时间停止推进");
        }
      }
      lastClockSample = now;
      if (stallCount === 0) {
        stopFallback("时钟工作正常");
      }
    } catch (e) {
      ensureFallbackRunning(`看门狗异常：${e}`);
    }
  }, WATCHDOG_INTERVAL_TICKS);
}
