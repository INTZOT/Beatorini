import { system, world } from "@minecraft/server";
import { isReplaceableTool } from "../lib/inventory.js";

/** 自动替换工具：背包中搜索同种物品替换到快捷栏 */
function autoReplaceTool(player, typeId) {
  const inventory = player.getComponent("inventory").container;
  const selectedSlot = player.selectedSlotIndex;

  for (let i = 0; i < inventory.size; i++) {
    if (i === selectedSlot) continue;
    const slotItem = inventory.getItem(i);
    if (slotItem?.typeId !== typeId) continue;

    const replDurability = slotItem.getComponent("minecraft:durability");
    if (!replDurability) continue;
    if (replDurability.damage >= replDurability.maxDurability) continue;

    inventory.setItem(selectedSlot, slotItem);
    inventory.setItem(i, undefined);
    player.playSound("random.orb");
    return;
  }
}

export function init() {
  // 挖掘方块导致工具损坏（镐/斧/铲）
  world.afterEvents.playerBreakBlock.subscribe((event) => {
    const { player, itemStackBeforeBreak, itemStackAfterBreak } = event;
    if (!itemStackBeforeBreak) return;
    if (!isReplaceableTool(itemStackBeforeBreak.typeId)) return;
    if (itemStackAfterBreak) return;

    const typeId = itemStackBeforeBreak.typeId;
    system.runTimeout(() => autoReplaceTool(player, typeId), 1);
  });

  // 使用物品后检查工具是否损坏（锄头耕地、斧头去皮等）
  world.afterEvents.itemUse.subscribe((event) => {
    const { source: player, itemStack } = event;
    if (!player || !itemStack) return;
    if (!isReplaceableTool(itemStack.typeId)) return;

    const typeId = itemStack.typeId;
    system.runTimeout(() => {
      const inventory = player.getComponent("inventory").container;
      const held = inventory.getItem(player.selectedSlotIndex);
      if (held) return;
      autoReplaceTool(player, typeId);
    }, 1);
  });
}
