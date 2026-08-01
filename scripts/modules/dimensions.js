import { system } from "@minecraft/server";
import {
  DIMENSION_NAMESPACE,
  DIMENSION_COUNT,
  LOBBY_DIMENSION_ID,
  MARKET_VAULT_DIM_ID,
} from "./config.js";

export function init() {
  system.beforeEvents.startup.subscribe((event) => {
    event.dimensionRegistry.registerCustomDimension(LOBBY_DIMENSION_ID);
    event.dimensionRegistry.registerCustomDimension(MARKET_VAULT_DIM_ID);

    for (let i = 1; i <= DIMENSION_COUNT; i++) {
      const dimensionId = `${DIMENSION_NAMESPACE}:void_${i}`;
      event.dimensionRegistry.registerCustomDimension(dimensionId);
    }

    console.warn(
      `已注册大厅维度（${LOBBY_DIMENSION_ID}）、金库维度（${MARKET_VAULT_DIM_ID}）及 ${DIMENSION_COUNT} 个自定义维度（${DIMENSION_NAMESPACE}:void_1 ~ void_${DIMENSION_COUNT}）`
    );
  });
}
