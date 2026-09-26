import { system, world } from "@minecraft/server";
import { isReplaceableTool } from "../lib/inventory.js";
import { getAssistSettings } from "./assistants.js";

/** 自动替换工具：背包中搜索同种物品替换到快捷栏 */
function autoReplaceTool(player, typeId) {
  // 这些调用都发生在 runTimeout 回调里：异常不会被外层 catch 捕获，
  // 玩家若在那一 tick 内退出/死亡，`getComponent` 会抛 InvalidEntityError 并让功能静默失效
  if (!player?.isValid) return;
  const inventory = player.getComponent("inventory")?.container;
  if (!inventory) return;
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
    if (!getAssistSettings(player.id).toolRefill) return;
    if (!itemStackBeforeBreak) return;
    if (!isReplaceableTool(itemStackBeforeBreak.typeId)) return;
    if (itemStackAfterBreak) return;

    const typeId = itemStackBeforeBreak.typeId;
    system.runTimeout(() => {
      try {
        autoReplaceTool(player, typeId);
      } catch (e) {
        console.warn(`[Tools] 自动补工具失败（${player?.name ?? "?"}）：${e}`);
      }
    }, 1);
  });

  // 使用物品后检查工具是否损坏（锄头耕地、斧头去皮等）
  world.afterEvents.itemUse.subscribe((event) => {
    const { source: player, itemStack } = event;
    if (!player || !getAssistSettings(player.id).toolRefill) return;
    if (!player || !itemStack) return;
    if (!isReplaceableTool(itemStack.typeId)) return;

    const typeId = itemStack.typeId;
    system.runTimeout(() => {
      try {
        if (!player?.isValid) return;
        const inventory = player.getComponent("inventory")?.container;
        if (!inventory) return;
        const held = inventory.getItem(player.selectedSlotIndex);
        if (held) return;
        autoReplaceTool(player, typeId);
      } catch (e) {
        console.warn(`[Tools] 使用后补工具失败（${player?.name ?? "?"}）：${e}`);
      }
    }, 1);
  });
}
