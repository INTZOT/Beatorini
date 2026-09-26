// ============================================================
// 表单显示结果处理
//
// DDUI 的 `form.show()` 在"玩家正忙"（聊天框/背包/暂停菜单打开）时**不会 reject**，
// 而是 resolve 成 `DataDrivenScreenClosedReason.UserBusy`（字符串 "UserBusy"）。
// 只挂 `.catch()` 的写法会让这种情况既没表单、也没提示、更没日志 —— 表现是"点了没反应"。
// 统一用 notifyIfBusy 兜住。
// ============================================================

/**
 * @param {string|undefined} reason `form.show()` 的 resolve 结果
 * @param {import("@minecraft/server").Player} player
 * @returns {boolean} true 表示"玩家正忙，表单没显示出来"
 */
/**
 * 校验来自表单（客户端可写 Observable）的数组下标。
 * `ObservableNumber(clientWritable: true)` 的值由客户端写入，越界/非数字时
 * 直接当数组下标用会得到 undefined → 后续 `x.key` 抛 TypeError（且发生在延迟回调里，无日志）。
 * @returns {number|undefined} 合法下标，或 undefined
 */
export function validIndex(value, length) {
  const idx = Number(value);
  if (!Number.isInteger(idx) || idx < 0 || idx >= length) return undefined;
  return idx;
}

export function notifyIfBusy(reason, player) {
  if (reason !== "UserBusy") return false;
  try {
    player?.sendMessage("§c请先关闭当前界面（聊天框/背包/菜单）后重试");
  } catch (e) {}
  return true;
}
