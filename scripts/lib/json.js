// ============================================================
// 动态属性 JSON 解析兜底
//
// 直接 `JSON.parse(world.getDynamicProperty(key) || "[]")` 的问题：
// 一条脏数据（写入中断／旧格式／人工改档）就会在**事件与表单回调里**抛错，
// 而这些回调没有兜底 → 整个功能静默失效且日志里没有模块前缀的行。
// 统一走这里：失败时记录 key 与片段并回退，绝不让坏数据打死功能。
// ============================================================

function describe(raw) {
  if (typeof raw !== "string") return `type=${typeof raw}`;
  return `len=${raw.length}, head=${raw.slice(0, 120)}`;
}

/**
 * 解析成数组；失败或类型不符时返回 []（并记录一条警告，同一 key 只报一次避免刷屏）
 */
export function safeParseArray(raw, key, warnOnce = new Set()) {
  if (raw === undefined || raw === null || raw === "") return [];
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return value;
    if (warnOnce && !warnOnce.has(key)) {
      warnOnce.add(key);
      console.warn(`[Json] ${key} 不是数组（${describe(raw)}），已按空数组处理`);
    }
    return [];
  } catch (e) {
    if (!warnOnce || !warnOnce.has(key)) {
      warnOnce?.add(key);
      console.error(`[Json] ${key} 解析失败（${describe(raw)}）：${e}`);
    }
    return [];
  }
}

/**
 * 解析成对象；失败或类型不符时返回 {}（并记录一条警告）
 */
export function safeParseObject(raw, key, warnOnce = new Set()) {
  if (raw === undefined || raw === null || raw === "") return {};
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    if (warnOnce && !warnOnce.has(key)) {
      warnOnce.add(key);
      console.warn(`[Json] ${key} 不是对象（${describe(raw)}），已按空对象处理`);
    }
    return {};
  } catch (e) {
    if (!warnOnce || !warnOnce.has(key)) {
      warnOnce?.add(key);
      console.error(`[Json] ${key} 解析失败（${describe(raw)}）：${e}`);
    }
    return {};
  }
}
