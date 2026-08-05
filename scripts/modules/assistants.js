// ============================================================
// 个人辅助功能设置与实现
// 1. 方块自动补充（放置后背包同种方块补到快捷栏）
// 2. 工具自动补充（工具损坏后自动替换同种工具）
// 3. 刷石机工具自动选择（生成矿石时自动切换最低级可挖掘工具）
// ============================================================
import { system, world } from "@minecraft/server";
import { CustomForm, ObservableBoolean } from "@minecraft/server-ui";

const ASSIST_KEY = "assist:settings_";
const DEFAULT_SETTINGS = {
  blockRefill: true,
  toolRefill: true,
  stoneAutoTool: true,
};

const PICKAXE_CHAIN = [
  "minecraft:wooden_pickaxe",
  "minecraft:stone_pickaxe",
  "minecraft:iron_pickaxe",
  "minecraft:diamond_pickaxe",
  "minecraft:netherite_pickaxe",
];

const ORE_MIN_LEVEL = {
  "minecraft:coal_ore": 0,
  "minecraft:copper_ore": 0,
  "minecraft:quartz_ore": 0,
  "minecraft:iron_ore": 1,
  "minecraft:gold_ore": 2,
  "minecraft:redstone_ore": 2,
  "minecraft:lapis_ore": 2,
  "minecraft:diamond_ore": 2,
  "minecraft:emerald_ore": 2,
  "minecraft:ancient_debris": 3,
};

const pendingSwaps = new Map(); // playerId -> { found, slot }

export function getAssistSettings(playerId) {
  const raw = world.getDynamicProperty(ASSIST_KEY + playerId);
  if (raw) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) {}
  }
  return { ...DEFAULT_SETTINGS };
}

function setAssistSettings(playerId, settings) {
  world.setDynamicProperty(ASSIST_KEY + playerId, JSON.stringify(settings));
}

// ============================================================
// 设置界面
// ============================================================

export function showAssistantMenu(player, backFn) {
  const pid = player.id;
  const s = getAssistSettings(pid);
  const blockRefill = new ObservableBoolean(s.blockRefill);
  const toolRefill = new ObservableBoolean(s.toolRefill);
  const stoneAutoTool = new ObservableBoolean(s.stoneAutoTool);

  const form = new CustomForm(player, "辅助功能")
    .label("§7选择你要启用的个人辅助功能")
    .spacer()
    .toggle("方块自动补充", blockRefill)
    .spacer()
    .toggle("工具自动补充", toolRefill)
    .spacer()
    .toggle("刷石机工具自动选择", stoneAutoTool)
    .spacer()
    .button("保存", () => {
      setAssistSettings(pid, {
        blockRefill: blockRefill.getData(),
        toolRefill: toolRefill.getData(),
        stoneAutoTool: stoneAutoTool.getData(),
      });
      player.sendMessage("§a辅助功能设置已保存");
      player.playSound("random.orb");
      form.close();
      system.runTimeout(() => showAssistantMenu(player, backFn), 2);
    })
    .spacer()
    .button("返回", () => {
      form.close();
      system.runTimeout(() => backFn(player), 2);
    });
  form.show().catch((e) => console.warn("Assistant menu failed:", e));
}

// ============================================================
// 刷石机工具自动选择
// ============================================================

/** 生成矿石时调用：主手工具不足以挖掘则从背包检索最低级合适镐并交换 */
export function autoSelectPickaxe(player, oreTypeId) {
  const required = ORE_MIN_LEVEL[oreTypeId];
  if (required === undefined) return;
  const inv = player.getComponent("inventory")?.container;
  if (!inv) return;

  const selectedSlot = player.selectedSlotIndex;
  const held = inv.getItem(selectedSlot);
  if (held) {
    const lvl = PICKAXE_CHAIN.indexOf(held.typeId);
    if (lvl >= required) return; // 当前工具已够用
  }

  // 清理上一次未完成的交换
  const old = pendingSwaps.get(player.id);
  if (old) {
    try {
      const cur = inv.getItem(selectedSlot);
      if (cur?.typeId === old.found.typeId) {
        inv.setItem(selectedSlot, inv.getItem(old.slot) ?? undefined);
        inv.setItem(old.slot, cur);
      }
    } catch (e) {}
    pendingSwaps.delete(player.id);
  }

  // 从所需等级开始找最低级合适镐（链内等级越低越优先）
  let found = null;
  let foundSlot = -1;
  for (let level = required; level < PICKAXE_CHAIN.length; level++) {
    for (let i = 0; i < inv.size; i++) {
      if (i === selectedSlot) continue;
      const item = inv.getItem(i);
      if (item?.typeId === PICKAXE_CHAIN[level]) {
        found = item;
        foundSlot = i;
        break;
      }
    }
    if (found) break;
  }
  if (!found) return; // 检索失败不做处理

  // 交换：主手槽 ← 找到的镐，原槽位 ← 原主手物品
  const original = inv.getItem(selectedSlot);
  inv.setItem(foundSlot, original ?? undefined);
  inv.setItem(selectedSlot, found);
  pendingSwaps.set(player.id, { found, slot: foundSlot });
}

/** 挖掉矿石后调用：恢复原手持工具并把临时镐放回背包 */
export function completeSwap(player) {
  const old = pendingSwaps.get(player.id);
  if (!old) return;
  pendingSwaps.delete(player.id);
  try {
    const inv = player.getComponent("inventory")?.container;
    if (!inv) return;
    const selectedSlot = player.selectedSlotIndex;
    const cur = inv.getItem(selectedSlot);
    if (cur?.typeId === old.found.typeId) {
      const original = inv.getItem(old.slot);
      inv.setItem(old.slot, cur);
      inv.setItem(selectedSlot, original ?? undefined);
    } else if (!inv.getItem(old.slot)) {
      // 玩家手动换过主手：临时镐放回原槽（若槽空）
      inv.setItem(old.slot, cur ?? undefined);
    }
  } catch (e) {}
}

function clearSwap(playerId) {
  pendingSwaps.delete(playerId);
}

export function init() {
  world.afterEvents.entityDie.subscribe((event) => {
    if (event.deadEntity.typeId === "minecraft:player") {
      clearSwap(event.deadEntity.id);
    }
  });
  world.afterEvents.playerLeave.subscribe((event) => {
    clearSwap(event.playerId);
  });
}
