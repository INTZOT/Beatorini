import { ItemStack } from "@minecraft/server";

/**
 * 统计背包中指定物品数量
 */
export function countItem(player, typeId) {
  const inventory = player.getComponent("inventory").container;
  let total = 0;
  for (let i = 0; i < inventory.size; i++) {
    const item = inventory.getItem(i);
    if (item?.typeId === typeId) {
      total += item.amount;
    }
  }
  return total;
}

/**
 * 从背包中移除指定数量的物品
 */
export function removeItems(player, typeId, amount) {
  const inventory = player.getComponent("inventory").container;
  let remaining = amount;
  for (let i = 0; i < inventory.size && remaining > 0; i++) {
    const item = inventory.getItem(i);
    if (item?.typeId === typeId) {
      const take = Math.min(item.amount, remaining);
      if (item.amount <= take) {
        inventory.setItem(i, undefined);
      } else {
        item.amount -= take;
        inventory.setItem(i, item);
      }
      remaining -= take;
    }
  }
}

/**
 * 捕获物品属性（耐久、附魔、名称）
 */
export function captureItemProps(player, typeId) {
  const inventory = player.getComponent("inventory").container;
  for (let i = 0; i < inventory.size; i++) {
    const item = inventory.getItem(i);
    if (item?.typeId === typeId) {
      const props = {};
      // 耐久
      const durability = item.getComponent("durability");
      if (durability) {
        props.hasDurability = true;
        props.durabilityDamage = durability.damage;
      }
      // 附魔
      const enchantable = item.getComponent("enchantable");
      if (enchantable) {
        try {
          const enchants = enchantable.getEnchantments();
          if (enchants.length > 0) {
            props.enchants = enchants.map((e) => ({
              type: e.type.id,
              level: e.level,
            }));
          }
        } catch (_) {}
      }
      // 自定义名称
      if (item.nameTag) props.nameTag = item.nameTag;
      // lore
      if (item.getLore && item.getLore().length > 0)
        props.lore = item.getLore();
      return Object.keys(props).length > 0 ? props : null;
    }
  }
  return null;
}

/**
 * 返还物品给玩家（支持耐久/附魔还原 + 不可堆叠物品）
 */
export function giveItemToPlayer(player, typeId, amount, itemProps) {
  const inv = player.getComponent("inventory").container;
  let anyDropped = false;

  // 有耐久属性的物品不可堆叠，逐个创建
  if (itemProps?.hasDurability) {
    for (let i = 0; i < amount; i++) {
      const stack = new ItemStack(typeId, 1);
      if (itemProps.durabilityDamage !== undefined) {
        const durComp = stack.getComponent("durability");
        if (durComp) durComp.damage = itemProps.durabilityDamage;
      }
      if (itemProps.enchants?.length > 0) {
        const enchComp = stack.getComponent("enchantable");
        if (enchComp) {
          for (const e of itemProps.enchants) {
            try {
              enchComp.addEnchantment({ type: e.type, level: e.level });
            } catch (_) {}
          }
        }
      }
      if (itemProps.nameTag) stack.nameTag = itemProps.nameTag;
      if (itemProps.lore?.length > 0) stack.setLore(itemProps.lore);

      const leftover = inv.addItem(stack);
      if (leftover) {
        try {
          player.dimension.spawnItem(leftover, player.location);
          anyDropped = true;
        } catch (e) {
          console.error(
            `[Inventory] 背包满且掉落失败（itemProps 分支）：${typeId} x${leftover.amount}（${e}）`
          );
          return false;
        }
      }
    }
    if (anyDropped) {
      player.sendMessage("§e背包已满，部分物品掉落在脚下");
    }
    return true;
  }

  // 普通可堆叠物品
  // 注意：new ItemStack(typeId, amount) 在 amount > 255 时**直接抛错**，65..255 会被静默夹取，
  // 所以必须按物品的最大堆叠数拆分后再塞背包。
  let remaining = amount;
  let anyLeft = false;
  while (remaining > 0) {
    let maxAmount = 64;
    try {
      maxAmount = new ItemStack(typeId, 1).maxAmount || 64;
    } catch (e) {
      console.error(`[Inventory] 无效物品 ID：${typeId}（${e}）`);
      return false;
    }
    const chunk = Math.min(remaining, maxAmount);
    remaining -= chunk;

    let stack;
    try {
      stack = new ItemStack(typeId, chunk);
    } catch (e) {
      console.error(`[Inventory] 构造物品失败：${typeId} x${chunk}（${e}）`);
      return false;
    }
    if (itemProps?.nameTag) stack.nameTag = itemProps.nameTag;
    if (itemProps?.lore?.length > 0) stack.setLore(itemProps.lore);

    const leftover = inv.addItem(stack);
    if (leftover) {
      // 掉落失败绝不能静默：物品只存在于脚本变量里，抛错即永久消失
      try {
        player.dimension.spawnItem(leftover, player.location);
        anyLeft = true;
      } catch (e) {
        console.error(
          `[Inventory] 背包满且掉落失败，物品未发放：${typeId} x${leftover.amount}（${e}）`
        );
        return false;
      }
    }
  }
  if (anyLeft) {
    player.sendMessage("§e背包已满，部分物品掉落在脚下");
  }
  return true;
}

/**
 * 检查物品是否为可替换工具（镐/斧/铲/锄）
 */
const TOOL_SUFFIXES = ["_pickaxe", "_axe", "_shovel", "_hoe"];
export function isReplaceableTool(typeId) {
  return TOOL_SUFFIXES.some((suffix) => typeId.endsWith(suffix));
}
