// ============================================================
// 传送辅助（无调试日志）
// ============================================================

/**
 * 将玩家传送到指定位置/维度。
 * @param {import("@minecraft/server").Player} player
 * @param {{x:number,y:number,z:number}} pos
 * @param {any} dimOrOptions - 目标维度或 teleport 选项
 */
export function teleportPlayer(player, pos, dimOrOptions) {
  // 兼容"直接传 Dimension"的调用（Dimension 只有 .id 没有 .dimension，
  // 旧实现会把跨维度传送静默降级成当前维度内传送）
  const options =
    dimOrOptions && typeof dimOrOptions.id === "string" && !dimOrOptions.dimension
      ? { dimension: dimOrOptions }
      : dimOrOptions;
  if (options?.dimension) {
    player.teleport(pos, dimOrOptions);
  } else {
    player.teleport(pos);
  }
}

// 兼容别名：_disabled 中的 nether.js/end-raid.js 恢复时可继续使用，无任何日志
export const debugTeleport = teleportPlayer;
