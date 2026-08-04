// ============================================================
// 玩家背包储物柜：用自定义实体（beatorini:market_vault）在
// 玩家自己的空岛维度内无损存放背包/装备，大厅时段背包恒为空。
// 每个玩家一对实体：A=主背包 27 格，B=快捷栏+盔甲+副手 14 格。
// ============================================================
import { world } from "@minecraft/server";
import {
  DIMENSION_NAMESPACE,
  MARKET_VAULT_ENTITY_ID,
  PLAYER_BOUND_PREFIX,
} from "./config.js";

const LOCKER_OWNER_KEY = "locker:owner";
const LOCKER_KIND_KEY = "locker:kind";
const LOCKER_BAG = "bag";
const LOCKER_GEAR = "gear";
const LOCKER_Y = 400; // 世界边界外高空，玩家正常活动无法到达

const GEAR_SLOT_MAP = [
  ["Head", 9],
  ["Chest", 10],
  ["Legs", 11],
  ["Feet", 12],
  ["Offhand", 13],
];

function getLockerDimension(player) {
  const index = getPlayerBoundIndex(player.id);
  if (index === undefined) return null;
  return world.getDimension(`${DIMENSION_NAMESPACE}:void_${index}`);
}

function getPlayerBoundIndex(playerId) {
  return world.getDynamicProperty(PLAYER_BOUND_PREFIX + playerId);
}

function getLockerEntities(player) {
  const dim = getLockerDimension(player);
  if (!dim) return [];
  return dim
    .getEntities({ type: MARKET_VAULT_ENTITY_ID })
    .filter((e) => e.getDynamicProperty(LOCKER_OWNER_KEY) === player.id);
}

function ensureLockerEntity(player, kind) {
  const existing = getLockerEntities(player).find(
    (e) => e.getDynamicProperty(LOCKER_KIND_KEY) === kind
  );
  if (existing) return existing;

  const dim = getLockerDimension(player);
  let hash = 0;
  for (const ch of player.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const x = (hash % 48) - 24;
  const z = ((hash >> 8) % 48) - 24;
  const y = LOCKER_Y + (kind === LOCKER_GEAR ? 1 : 0);
  const entity = dim.spawnEntity(MARKET_VAULT_ENTITY_ID, { x, y, z });
  entity.setDynamicProperty(LOCKER_OWNER_KEY, player.id);
  entity.setDynamicProperty(LOCKER_KIND_KEY, kind);
  return entity;
}

function getEntityContainer(entity) {
  return entity?.getComponent("minecraft:inventory")?.container ?? null;
}

function getPlayerInventory(player) {
  return player.getComponent("minecraft:inventory")?.container ?? null;
}

function getPlayerEquippable(player) {
  return player.getComponent("equippable");
}

/** 离开岛屿前：把背包/装备存入自己的岛屿储物柜并清空身上 */
export function stashPlayerInventory(player) {
  try {
    if (getPlayerBoundIndex(player.id) === undefined) return; // 无岛不 stash
    const inv = getPlayerInventory(player);
    const eq = getPlayerEquippable(player);
    if (!inv || !eq) return;

    const bag = ensureLockerEntity(player, LOCKER_BAG);
    const gear = ensureLockerEntity(player, LOCKER_GEAR);
    const bagC = getEntityContainer(bag);
    const gearC = getEntityContainer(gear);
    if (!bagC || !gearC) return;

    // 主背包（容器 9~35）→ 实体 A
    for (let i = 9; i <= 35; i++) {
      const item = inv.getItem(i);
      if (item) bagC.setItem(i - 9, item);
    }
    // 快捷栏（容器 0~8）→ 实体 B 0~8
    for (let i = 0; i <= 8; i++) {
      const item = inv.getItem(i);
      if (item) gearC.setItem(i, item);
    }
    // 盔甲 + 副手 → 实体 B 9~13
    for (const [slot, out] of GEAR_SLOT_MAP) {
      const item = eq.getEquipment(slot);
      if (item) gearC.setItem(out, item);
    }

    // 清空身上
    inv.clearAll();
    for (const [slot] of GEAR_SLOT_MAP) eq.setEquipment(slot, undefined);
    eq.setEquipment("Mainhand", undefined);
  } catch (e) {
    console.warn(`[Locker] stash failed: ${e}`);
  }
}

/** 返回自己岛屿后：清空身上（大厅物品作废）并取回储物柜物品 */
export function unstashPlayerInventory(player) {
  try {
    const bag = getLockerEntities(player).find(
      (e) => e.getDynamicProperty(LOCKER_KIND_KEY) === LOCKER_BAG
    );
    const gear = getLockerEntities(player).find(
      (e) => e.getDynamicProperty(LOCKER_KIND_KEY) === LOCKER_GEAR
    );
    if (!bag || !gear) return; // 从未 stash 过（如新岛主）不动背包

    const inv = getPlayerInventory(player);
    const eq = getPlayerEquippable(player);
    if (!inv || !eq) return;

    // 大厅期间获得的物品一律清空
    inv.clearAll();
    for (const [slot] of GEAR_SLOT_MAP) eq.setEquipment(slot, undefined);
    eq.setEquipment("Mainhand", undefined);

    const bagC = getEntityContainer(bag);
    const gearC = getEntityContainer(gear);
    if (!bagC || !gearC) return;

    for (let i = 0; i < 27; i++) {
      const item = bagC.getItem(i);
      if (item) inv.setItem(i + 9, item);
      bagC.setItem(i, undefined);
    }
    for (let i = 0; i <= 8; i++) {
      const item = gearC.getItem(i);
      if (item) inv.setItem(i, item);
      gearC.setItem(i, undefined);
    }
    for (const [slot, idx] of GEAR_SLOT_MAP) {
      const item = gearC.getItem(idx);
      if (item) eq.setEquipment(slot, item);
      gearC.setItem(idx, undefined);
    }
  } catch (e) {
    console.warn(`[Locker] unstash failed: ${e}`);
  }
}

/** 放弃/离开/踢出岛屿时移除该玩家的储物柜实体，防止物品残留 */
export function clearLockerEntities(playerId) {
  try {
    const index = getPlayerBoundIndex(playerId);
    if (index === undefined) return;
    const dim = world.getDimension(`${DIMENSION_NAMESPACE}:void_${index}`);
    for (const e of dim.getEntities({ type: MARKET_VAULT_ENTITY_ID })) {
      if (e.getDynamicProperty(LOCKER_OWNER_KEY) === playerId) {
        try {
          e.remove();
        } catch (err) {}
      }
    }
  } catch (e) {}
}
