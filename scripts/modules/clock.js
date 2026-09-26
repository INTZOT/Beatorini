// ============================================================
// 自定义世界时钟（@minecraft/server 2.11.0-beta 新增能力）
//
// - 在 system.beforeEvents.startup 里注册 beatorini:server 时钟及其 time marker
// - 世界加载后把时钟时间对齐到 world.getTimeOfDay()：period 取 24000 的整数倍时，
//   marker 的 time 就等价于「游戏时刻」（6000 = 正午），且每次触发都落在正午
// - 上层用 onMarker(name, fn) 订阅，不必直接接触 WorldClock
// - 时钟不可用（旧版本 / 注册失败）时 isClockReady() 返回 false，调用方应回退到 tick 轮询
//
// 注意：注册必须发生在 startup 阶段，因此本模块的 init() 要在 main.js 里尽早调用。
// ============================================================
import { system, world } from "@minecraft/server";
import { SERVER_CLOCK_ID, CLOCK_MARKERS } from "./config.js";

const handlers = new Map(); // markerName -> Set<handler>
let ready = false;
let lastError = "";

/** 订阅某个 time marker 的触发（同一 handler 重复订阅会去重） */
export function onMarker(markerName, handler) {
  if (typeof handler !== "function") return;
  let set = handlers.get(markerName);
  if (!set) {
    set = new Set();
    handlers.set(markerName, set);
  }
  set.add(handler);
}

/** 时钟是否可用（世界加载完成后才有结论，不要在 init 阶段判断） */
export function isClockReady() {
  return ready;
}

/** 取自定义时钟对象；不可用时返回 undefined */
export function getServerClock() {
  try {
    return world.getClock(SERVER_CLOCK_ID);
  } catch (e) {
    return undefined;
  }
}

/** 当前时钟时间（tick）；不可用时返回 undefined */
export function getClockTime() {
  const clock = getServerClock();
  if (!clock) return undefined;
  try {
    return clock.time;
  } catch (e) {
    return undefined;
  }
}

export function init() {
  // --- 注册必须在 startup 阶段完成 ---
  system.beforeEvents.startup.subscribe((event) => {
    try {
      const registry = event.worldClockRegistry;
      if (!registry || typeof registry.registerClock !== "function") {
        lastError = "worldClockRegistry 不可用";
        return;
      }
      registry.registerClock(SERVER_CLOCK_ID, { timeMarkers: CLOCK_MARKERS });
      console.warn(
        `[Clock] 已注册 ${SERVER_CLOCK_ID}，time marker：` +
          CLOCK_MARKERS.map((m) => `${m.name}@${m.time}+${m.period ?? 0}`).join(", ")
      );
    } catch (e) {
      // 脚本热重载时可能重复注册而抛错；是否可用留给 worldLoad 后的 getClock 判定
      lastError = String(e);
      console.warn(`[Clock] 注册 ${SERVER_CLOCK_ID} 失败（可能已存在）：${e}`);
    }
  });

  // --- 世界加载后确认可用性、补建 marker、校准时间 ---
  world.afterEvents.worldLoad.subscribe(() => {
    // 放进 system.run 回调，避开 after 事件的只读上下文
    system.runTimeout(verifyAndSync, 20);
  });

  // --- 分发 marker 事件 ---
  world.afterEvents.worldClockOnTimeMarker.subscribe((event) => {
    const name = event.timeMarker?.name;
    if (!name) return;
    const set = handlers.get(name);
    if (!set || set.size === 0) return;
    for (const handler of set) {
      try {
        handler(event);
      } catch (e) {
        console.warn(`[Clock] marker ${name} 处理异常：${e}`);
      }
    }
  });
}

function verifyAndSync() {
  const clock = getServerClock();
  if (!clock) {
    ready = false;
    console.warn(
      `[Clock] ${SERVER_CLOCK_ID} 不可用，使用方应回退到轮询` +
        (lastError ? `（${lastError}）` : "")
    );
    return;
  }
  ready = true;

  // 热重载后注册可能被跳过，这里补建缺失的 marker
  try {
    const existing = new Set((clock.timeMarkers ?? []).map((m) => m.name));
    for (const marker of CLOCK_MARKERS) {
      if (!existing.has(marker.name)) {
        clock.addTimeMarker(marker);
        console.warn(`[Clock] 补建 time marker ${marker.name}`);
      }
    }
  } catch (e) {
    console.warn(`[Clock] 检查/补建 time marker 失败：${e}`);
  }

  const timeOfDay = world.getTimeOfDay();
  try {
    clock.time = timeOfDay;
  } catch (e) {
    console.warn(`[Clock] 时间对齐失败（沿用时钟自身时间）：${e}`);
  }

  let markers = [];
  try {
    markers = (clock.timeMarkers ?? []).map(
      (m) => `${m.name}@${m.time}+${m.period ?? 0}`
    );
  } catch (e) {}
  console.warn(
    `[Clock] ${SERVER_CLOCK_ID} 就绪（time=${timeOfDay}，marker：${markers.join(", ") || "无"}）`
  );
}
