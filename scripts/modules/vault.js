// ============================================================
// 市场金库：自定义实体容器无损存储
// 使用带 minecraft:inventory 的自定义实体（beatorini:market_vault）
// 保存完整 ItemStack，避免 JSON 序列化丢失 NBT（附魔/名称/耐久等）。
// ============================================================
import { system, world, ItemStack } from "@minecraft/server";
import {
  MARKET_VAULT_DIM_ID,
  MARKET_VAULT_ENTITY_ID,
  MARKET_VAULT_SLOTS,
  MARKET_VAULT_ORIGIN,
  MARKET_VAULT_SPACING,
  MARKET_VAULT_GRID_X,
  MARKET_VAULT_GRID_Y,
  MARKET_VAULT_GRID_Z,
  MARKET_VAULT_AREA_CHUNKS,
  MARKET_VAULT_COUNT_KEY,
  MARKET_VAULT_INDEX_KEY,
  MARKET_VAULT_TICKINGAREA,
} from "./config.js";

export function getVaultCount() {
  return world.getDynamicProperty(MARKET_VAULT_COUNT_KEY) ?? 0;
}
function setVaultCount(count) {
  world.setDynamicProperty(MARKET_VAULT_COUNT_KEY, count);
}

export function getVaultDimension() {
  return world.getDimension(MARKET_VAULT_DIM_ID);
}

/**
 * 三维网格排布：X → Z → Y → 单元 逐层展开。
 * 每个单元为 GRID_X×GRID_Z×GRID_Y（默认 4×4×4=64）个实体，
 * 占 8×8×8 方块，间距 2 格。
 */
export function vaultEntityPosition(index) {
  const layer = MARKET_VAULT_GRID_X * MARKET_VAULT_GRID_Z;
  const unit = layer * MARKET_VAULT_GRID_Y;
  const u = Math.floor(index / unit);
  const rest = index % unit;
  const gy = Math.floor(rest / layer);
  const rem = rest % layer;
  const gz = Math.floor(rem / MARKET_VAULT_GRID_X);
  const gx = rem % MARKET_VAULT_GRID_X;
  return {
    x:
      MARKET_VAULT_ORIGIN.x +
      u * (MARKET_VAULT_GRID_X * MARKET_VAULT_SPACING) +
      gx * MARKET_VAULT_SPACING,
    y: MARKET_VAULT_ORIGIN.y + gy * MARKET_VAULT_SPACING,
    z: MARKET_VAULT_ORIGIN.z + gz * MARKET_VAULT_SPACING,
  };
}

function getVaultEntityIndex(entity) {
  return entity.getDynamicProperty(MARKET_VAULT_INDEX_KEY) ?? 0;
}

function spawnVaultEntity(index) {
  const dim = getVaultDimension();
  const entity = dim.spawnEntity(
    MARKET_VAULT_ENTITY_ID,
    vaultEntityPosition(index)
  );
  entity.setDynamicProperty(MARKET_VAULT_INDEX_KEY, index);
  return entity;
}

export function getVaultEntities() {
  try {
    const dim = getVaultDimension();
    const list = dim.getEntities({ type: MARKET_VAULT_ENTITY_ID });
    list.sort((a, b) => getVaultEntityIndex(a) - getVaultEntityIndex(b));
    return list;
  } catch (e) {
    return [];
  }
}

function ensureVaultEntities() {
  const existing = getVaultEntities();
  const byIndex = new Map();
  for (const e of existing) byIndex.set(getVaultEntityIndex(e), e);

  const count = getVaultCount();
  for (let i = 0; i < count; i++) {
    if (!byIndex.has(i)) {
      try {
        spawnVaultEntity(i);
      } catch (e) {
        console.warn(`[Vault] Spawn entity #${i} failed: ${e}`);
      }
    }
  }
  return getVaultEntities();
}

function getContainer(entity) {
  try {
    return entity.getComponent("minecraft:inventory")?.container ?? null;
  } catch (e) {
    return null;
  }
}

function getVaultEntityByIndex(index) {
  return getVaultEntities().find((e) => getVaultEntityIndex(e) === index);
}

/** 查找可用槽位；不足时自动扩展现有金库（新增 1 个实体） */
function findFreeSlot() {
  const entities = ensureVaultEntities();
  for (const e of entities) {
    const container = getContainer(e);
    if (!container) continue;
    for (let slot = 0; slot < container.size; slot++) {
      if (!container.getItem(slot)) {
        return { entity: e, index: getVaultEntityIndex(e), slot };
      }
    }
  }

  const index = getVaultCount();
  let entity;
  try {
    entity = spawnVaultEntity(index);
  } catch (e) {
    console.error(`[Vault] Auto-expand failed: ${e}`);
    return null;
  }
  setVaultCount(index + 1);
  const container = getContainer(entity);
  if (!container) return null;
  return { entity, index, slot: 0 };
}

/** 存入完整 ItemStack，返回 { index, slot }；失败返回 null */
export function storeItem(listingId, stack) {
  const slotInfo = findFreeSlot();
  if (!slotInfo) return null;
  try {
    slotInfo.entity
      .getComponent("minecraft:inventory")
      .container.setItem(slotInfo.slot, stack);
  } catch (e) {
    console.error(`[Vault] storeItem(${listingId}) failed: ${e}`);
    return null;
  }
  return { index: slotInfo.index, slot: slotInfo.slot };
}

/** 取出物品并清空槽位；失败返回 undefined */
export function takeItem(index, slot) {
  const entity = getVaultEntityByIndex(index);
  if (!entity) return undefined;
  const container = getContainer(entity);
  if (!container) return undefined;
  try {
    const stack = container.getItem(slot);
    if (stack) container.setItem(slot, undefined);
    return stack ?? undefined;
  } catch (e) {
    console.error(`[Vault] takeItem(${index},${slot}) failed: ${e}`);
    return undefined;
  }
}

/** 只读查看槽位物品；失败返回 undefined */
export function peekItem(index, slot) {
  const entity = getVaultEntityByIndex(index);
  if (!entity) return undefined;
  const container = getContainer(entity);
  if (!container) return undefined;
  try {
    return container.getItem(slot) ?? undefined;
  } catch (e) {
    return undefined;
  }
}

// ============================================================
// 初始化：维度注册后创建金库实体 + TickingAreaManager 常载区块
// 依赖 dimensions.js 先注册 island:vault（main.js 保证 init 顺序）
// ============================================================
export function init() {
  system.beforeEvents.startup.subscribe(() => {
    setupVault();
  });
}

async function setupVault(retry = 0) {
  try {
    const dim = getVaultDimension();
    const manager = world.tickingAreaManager;
    const { x, y, z } = MARKET_VAULT_ORIGIN;
    const half = (MARKET_VAULT_AREA_CHUNKS * 16) / 2;
    const options = {
      dimension: dim,
      from: { x: x - half, y: y - 2, z: z - half },
      to: {
        x: x + MARKET_VAULT_AREA_CHUNKS * 16 - half,
        y: y + 16,
        z: z + MARKET_VAULT_AREA_CHUNKS * 16 - half,
      },
    };

    // 用 ScriptAPI 的 TickingAreaManager（按包预算，不占用原版命令的 10 个名额）
    if (!manager.hasTickingArea(MARKET_VAULT_TICKINGAREA)) {
      if (!manager.hasCapacity(options)) {
        console.error(
          `[Vault] Ticking area 超出 chunk 预算（max=${manager.maxChunkCount}），金库区块可能无法常载`
        );
        return;
      }
      await manager.createTickingArea(MARKET_VAULT_TICKINGAREA, options);
      console.warn(
        `[Vault] Ticking area 就绪（${manager.chunkCount}/${manager.maxChunkCount} chunks）`
      );
    }

    // 等待区块与实体加载后再确保/创建实体，
    // 避免把“暂未加载”误判为“实体缺失”而重复生成空实体
    ensureVaultEntitiesAfterLoad(0);
  } catch (e) {
    if (retry < 5) {
      system.runTimeout(() => {
        setupVault(retry + 1);
      }, 20);
    } else {
      console.error(`[Vault] Init failed: ${e}`);
    }
  }
}

/** 等待金库实体加载完成后再执行 ensureVaultEntities */
function ensureVaultEntitiesAfterLoad(attempt) {
  const expected = getVaultCount();
  const found = getVaultEntities().length;
  if (expected > 0 && found < expected && attempt < 20) {
    system.runTimeout(() => ensureVaultEntitiesAfterLoad(attempt + 1), 10);
    return;
  }
  const entities = ensureVaultEntities();
  console.warn(
    `[Vault] 金库就绪：${entities.length} 个实体，${entities.length * MARKET_VAULT_SLOTS} 个槽位`
  );
}

// ============================================================
// 调试：无损往返测试（#vaulttest，op 专属）
// ============================================================
export function debugVault(player) {
  try {
    const entities = ensureVaultEntities();
    const entity = entities[0];
    if (!entity) {
      player.sendMessage("§c金库实体创建失败");
      return;
    }
    const container = getContainer(entity);
    if (!container) {
      player.sendMessage(
        "§c自定义实体未暴露 minecraft:inventory 组件（getComponent 返回 null）"
      );
      return;
    }

    // 构造一个带附魔/名称/lore/耐久损耗的测试物品
    const test = new ItemStack("minecraft:diamond_sword", 1);
    test.nameTag = "§b金库测试剑";
    test.setLore(["§7测试lore第一行", "§7测试lore第二行"]);
    const dur = test.getComponent("durability");
    if (dur) dur.damage = 7;
    const ench = test.getComponent("enchantable");
    if (ench) {
      try {
        ench.addEnchantment({ type: "minecraft:sharpness", level: 5 });
      } catch (e) {}
    }

    let slot = -1;
    for (let i = 0; i < container.size; i++) {
      if (!container.getItem(i)) {
        slot = i;
        break;
      }
    }
    if (slot === -1) {
      player.sendMessage("§c测试实体已满");
      return;
    }

    container.setItem(slot, test);
    const back = container.getItem(slot);
    if (!back) {
      player.sendMessage("§c写入后读取为空");
      return;
    }

    const report = [
      `typeId: ${back.typeId}`,
      `amount: ${back.amount}`,
      `nameTag: ${back.nameTag ?? "(无)"}`,
      `lore: ${back.getLore().join(" | ") || "(无)"}`,
    ];
    const dur2 = back.getComponent("durability");
    report.push(`durability.damage: ${dur2 ? dur2.damage : "(无耐久组件)"}`);
    const ench2 = back.getComponent("enchantable");
    if (ench2) {
      try {
        const list = ench2
          .getEnchantments()
          .map((x) => `${x.type.id}:${x.level}`);
        report.push(`enchantments: ${list.join(", ") || "(无)"}`);
      } catch (e) {
        report.push("enchantments: 读取失败");
      }
    }

    // 清槽并把物品还给玩家
    container.setItem(slot, undefined);
    const leftover = player.getComponent("inventory").container.addItem(back);
    if (leftover) player.dimension.spawnItem(leftover, player.location);

    player.sendMessage("§a[金库] 写入→读取→回还 成功，NBT 对比：");
    for (const line of report) player.sendMessage("§7  " + line);
  } catch (e) {
    player.sendMessage(`§c[金库] 测试异常: ${e}`);
    console.error(`[Vault] debugVault error: ${e} ${e.stack}`);
  }
}
