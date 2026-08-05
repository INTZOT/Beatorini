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

// 镐等级：铜镐/金镐与石镐同级（1）
const PICKAXE_LEVEL = {
  "minecraft:wooden_pickaxe": 0,
  "minecraft:stone_pickaxe": 1,
  "minecraft:copper_pickaxe": 1,
  "minecraft:golden_pickaxe": 1,
  "minecraft:iron_pickaxe": 2,
  "minecraft:diamond_pickaxe": 3,
  "minecraft:netherite_pickaxe": 4,
};

// 各等级的候选镐（同等级按此顺序检索）
const PICKAXE_BY_LEVEL = [
  ["minecraft:wooden_pickaxe"],
  [
    "minecraft:stone_pickaxe",
    "minecraft:copper_pickaxe",
    "minecraft:golden_pickaxe",
  ],
  ["minecraft:iron_pickaxe"],
  ["minecraft:diamond_pickaxe"],
  ["minecraft:netherite_pickaxe"],
];

const BLOCK_MIN_LEVEL = {
  "minecraft:stone": 0,
  "minecraft:cobblestone": 0,
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
  const blockRefill = new ObservableBoolean(s.blockRefill, {
    clientWritable: true,
  });
  const toolRefill = new ObservableBoolean(s.toolRefill, {
    clientWritable: true,
  });
  const stoneAutoTool = new ObservableBoolean(s.stoneAutoTool, {
    clientWritable: true,
  });

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

/** 开始挖掘时调用：主手工具不满足可挖掘条件则从背包检索最低级合适镐并交换 */
export function autoSelectPickaxe(player, blockTypeId) {
  const required = BLOCK_MIN_LEVEL[blockTypeId];
  if (required === undefined) return;
  const inv = player.getComponent("inventory")?.container;
  if (!inv) return;

  const selectedSlot = player.selectedSlotIndex;
  const held = inv.getItem(selectedSlot);
  const heldLevel = held ? PICKAXE_LEVEL[held.typeId] : -1;
  if (heldLevel === required) return; // 当前工具恰好满足

  // 从所需等级开始找最低级合适镐（链内等级越低越优先）
  let found = null;
  let foundSlot = -1;
  for (let level = required; level < PICKAXE_BY_LEVEL.length; level++) {
    for (const typeId of PICKAXE_BY_LEVEL[level]) {
      for (let i = 0; i < inv.size; i++) {
        if (i === selectedSlot) continue;
        const item = inv.getItem(i);
        if (item?.typeId === typeId) {
          found = item;
          foundSlot = i;
          break;
        }
      }
      if (found) break;
    }
    if (found) break;
  }
  if (!found) return; // 检索失败不做处理
  const foundLevel = PICKAXE_LEVEL[found.typeId];

  // 主手不足：切换为更高级工具；
  // 主手过剩：背包存在更低级合适工具则降级切换（节省高级耐久）
  if (heldLevel < required || foundLevel < heldLevel) {
    const original = inv.getItem(selectedSlot);
    inv.setItem(foundSlot, original ?? undefined);
    inv.setItem(selectedSlot, found);
  }
}

export function init() {
  // 开始挖掘石头/圆石/矿石时自动切换合适工具（挖掘进度按新工具实时计算）
  world.afterEvents.playerStartBreakingBlock.subscribe((event) => {
    const blockId = event.blockPermutation?.type?.id;
    if (!blockId || BLOCK_MIN_LEVEL[blockId] === undefined) return;
    const player = event.player;
    if (!getAssistSettings(player.id).stoneAutoTool) return;
    autoSelectPickaxe(player, blockId);
  });

}
