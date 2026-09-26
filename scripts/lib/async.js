// ============================================================
// 异步工具：给 Promise 加 tick 级超时
//
// 背景：`world.tickingAreaManager.createTickingArea()` 等原生 Promise 在个别环境（慢盘、
// Endstone、维度注册异常）会**长时间不 resolve**。此时 `await` 既不继续也不抛错，
// 调用方看起来"卡死且零日志" —— 2026-09-26 金库事故正是这种形态。
// 统一用本函数包一层：超时即抛错，交由调用方的 catch 记录并重试/降级。
// ============================================================
import { system } from "@minecraft/server";

/**
 * 等待 promise，超过 ticks 个游戏刻未完成则抛错。
 * @param {Promise<any>} promise
 * @param {number} ticks 超时时间（20 tick = 1 秒）
 * @param {string} label 超时信息里显示的标识（便于定位）
 */
export async function withTimeout(promise, ticks, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = system.runTimeout(() => {
      reject(new Error(`${label} 超过 ${ticks} tick 未完成`));
    }, ticks);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      try {
        system.clearRun(timer);
      } catch (e) {}
    }
  }
}
