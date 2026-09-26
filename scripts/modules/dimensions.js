import { system } from "@minecraft/server";
import {
  DIMENSION_NAMESPACE,
  DIMENSION_COUNT,
  MARKET_VAULT_DIM_ID,
} from "./config.js";

// 注册失败不再中断整个 startup 回调（否则后续维度、乃至其它模块的 startup 订阅都可能被牵连），
// 每个失败都单独记录，最后汇总一行 —— 线上排查时这行日志是判断"维度到底注册上没有"的唯一依据。
export function init() {
  system.beforeEvents.startup.subscribe((event) => {
    const registry = event.dimensionRegistry;
    if (!registry || typeof registry.registerCustomDimension !== "function") {
      console.error("[Dimensions] dimensionRegistry 不可用，自定义维度未注册！");
      return;
    }

    const failures = [];
    try {
      registry.registerCustomDimension(MARKET_VAULT_DIM_ID);
    } catch (e) {
      failures.push(MARKET_VAULT_DIM_ID);
      console.error(`[Dimensions] 注册 ${MARKET_VAULT_DIM_ID} 失败：${e}`);
    }

    for (let i = 1; i <= DIMENSION_COUNT; i++) {
      const dimensionId = `${DIMENSION_NAMESPACE}:void_${i}`;
      try {
        registry.registerCustomDimension(dimensionId);
      } catch (e) {
        failures.push(dimensionId);
        // 失败原因通常是同一个，只详细打印前几条，避免刷屏
        if (failures.length <= 3) {
          console.error(`[Dimensions] 注册 ${dimensionId} 失败：${e}`);
        }
      }
    }

    console.warn(
      `大厅使用主世界；已注册金库维度（${MARKET_VAULT_DIM_ID}）及 ${DIMENSION_COUNT} 个自定义维度（${DIMENSION_NAMESPACE}:void_1 ~ void_${DIMENSION_COUNT}）` +
        (failures.length > 0 ? `；⚠ 失败 ${failures.length} 个` : "")
    );
  });
}
