// ============================================================
// 市场金库：自定义实体容器无损存储
// 使用带 minecraft:inventory 的自定义实体（beatorini:market_vault）
// 保存完整 ItemStack，避免 JSON 序列化丢失 NBT（附魔/名称/耐久等）。
//
// ⚠ 实体索引解析（2026-08 修复）：
//   实体自身动态属性（market:vault_index）在部分存档中会丢失/损坏
//   （值为 0.125 等非整数，或直接缺失），旧代码 `?? 0` 回退会把所有
//   实体当成索引 0 → 槽位引用互相冲突 → 买家拿到“下一件”物品、孤儿物品。
//   现在以【世界级映射 market:vault_index_map（uniqueId → 索引）】为准，
//   缺失/损坏的实体动态属性只作为迁移来源，绝不回退到 0。
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
  MARKET_VAULT_INDEX_MAP_KEY,
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

// ------------------------------------------------------------
// 实体索引解析（世界级映射，防索引塌缩）
// ------------------------------------------------------------

function getVaultIndexMap() {
  const raw = world.getDynamicProperty(MARKET_VAULT_INDEX_MAP_KEY);
  if (!raw) return {};
  try {
    const m = JSON.parse(raw);
    return m && typeof m === "object" ? m : {};
  } catch (e) {
    return {};
  }
}
function setVaultIndexMap(map) {
  world.setDynamicProperty(MARKET_VAULT_INDEX_MAP_KEY, JSON.stringify(map));
}

function entityId(entity) {
  try {
    return String(entity.id);
  } catch (e) {
    return null;
  }
}

/** 实体自身动态属性中的合法索引（仅迁移用） */
function entityDpIndex(entity) {
  try {
    const v = entity.getDynamicProperty(MARKET_VAULT_INDEX_KEY);
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  } catch (e) {}
  return undefined;
}

/**
 * 解析实体金库索引：世界映射优先，其次实体自身动态属性（仅接受合法非负整数）。
 * 无法解析时返回 undefined —— 调用方必须跳过/告警，绝不回退到 0。
 */
export function getVaultEntityIndex(entity) {
  const id = entityId(entity);
  if (id) {
    const map = getVaultIndexMap();
    if (id in map && Number.isInteger(map[id]) && map[id] >= 0) return map[id];
  }
  return entityDpIndex(entity);
}

function spawnVaultEntity(index) {
  const dim = getVaultDimension();
  const entity = dim.spawnEntity(
    MARKET_VAULT_ENTITY_ID,
    vaultEntityPosition(index)
  );
  try {
    entity.setDynamicProperty(MARKET_VAULT_INDEX_KEY, index);
  } catch (e) {}
  const id = entityId(entity);
  if (id !== null) {
    const map = getVaultIndexMap();
    map[id] = index;
    setVaultIndexMap(map);
  }
  return entity;
}

export function getVaultEntities() {
  try {
    const dim = getVaultDimension();
    const list = dim.getEntities({ type: MARKET_VAULT_ENTITY_ID });
    list.sort((a, b) => {
      const ia = getVaultEntityIndex(a);
      const ib = getVaultEntityIndex(b);
      if (ia === undefined) return 1;
      if (ib === undefined) return -1;
      return ia - ib;
    });
    return list;
  } catch (e) {
    return [];
  }
}

/** 把实体自身动态属性/缺失索引迁移进世界映射，并补建缺失实体 */
function ensureVaultEntities() {
  const existing = getVaultEntities();
  const map = getVaultIndexMap();
  const used = new Set(Object.values(map).filter((v) => Number.isInteger(v)));
  let changed = false;

  for (const e of existing) {
    const id = entityId(e);
    if (id === null) continue;
    if (id in map) continue;
    // 迁移：优先用实体自身合法动态属性，否则分配最小可用索引
    let idx = entityDpIndex(e);
    if (idx === undefined || used.has(idx)) {
      idx = 0;
      while (used.has(idx)) idx++;
    }
    map[id] = idx;
    used.add(idx);
    changed = true;
  }
  if (changed) setVaultIndexMap(map);

  const count = getVaultCount();
  for (let i = 0; i < count; i++) {
    if (!used.has(i)) {
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

/** 金库是否已准备好（实体数量达标才读写，避免把“未加载”当“缺失”而错位） */
function isVaultReady() {
  const expected = getVaultCount();
  if (expected === 0) return true;
  return getVaultEntities().length >= expected;
}

/** 查找可用槽位；不足时自动扩展现有金库（新增 1 个实体） */
function findFreeSlot() {
  if (!isVaultReady()) return null;
  const entities = ensureVaultEntities();
  for (const e of entities) {
    const index = getVaultEntityIndex(e);
    if (index === undefined) continue; // 索引不可解析的实体不得写入（防引用冲突）
    const container = getContainer(e);
    if (!container) continue;
    for (let slot = 0; slot < container.size; slot++) {
      if (!container.getItem(slot)) {
        return { entity: e, index, slot };
      }
    }
  }

  let index = getVaultCount();
  const used = new Set(
    Object.values(getVaultIndexMap()).filter((v) => Number.isInteger(v))
  );
  while (used.has(index)) index++;
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

/** 把物品放回指定槽位（交付校验失败回滚用） */
export function restoreItem(index, slot, stack) {
  const entity = getVaultEntityByIndex(index);
  if (!entity) return false;
  const container = getContainer(entity);
  if (!container) return false;
  try {
    if (container.getItem(slot)) return false; // 槽位被占用不得覆盖
    container.setItem(slot, stack);
    return true;
  } catch (e) {
    console.error(`[Vault] restoreItem(${index},${slot}) failed: ${e}`);
    return false;
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

/**
 * 物品指纹：typeId + 数量 + NBT（名称/lore/附魔/耐久）。
 * 用于金库物品与市场清单的严格匹配（旧代码只用 typeId+数量，
 * 会把同类型不同附魔/名称的物品配错 → “货不对板”）。
 */
export function getStackFingerprint(stack) {
  try {
    const parts = [stack.typeId, stack.amount];
    try {
      parts.push(stack.nameTag ?? "");
    } catch (e) {}
    try {
      parts.push(JSON.stringify(stack.getLore()));
    } catch (e) {}
    try {
      const ench = stack.getComponent("enchantable");
      if (ench) {
        parts.push(
          JSON.stringify(
            ench
              .getEnchantments()
              .map((x) => `${x.type.id}:${x.level}`)
              .sort()
          )
        );
      }
    } catch (e) {}
    try {
      const dur = stack.getComponent("durability");
      if (dur) parts.push(String(dur.damage));
    } catch (e) {}
    return parts.join("|");
  } catch (e) {
    return `${stack.typeId}|${stack.amount}`;
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
  const mapCount = Object.keys(getVaultIndexMap()).length;
  console.warn(
    `[Vault] 金库就绪：${entities.length} 个实体，${entities.length * MARKET_VAULT_SLOTS} 个槽位（索引映射 ${mapCount} 条）`
  );
}

// ============================================================
// 调试：无损往返测试（原 #vaulttest 命令已移除，此函数保留备用）
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
