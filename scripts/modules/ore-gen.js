import { system, world, BlockPermutation } from "@minecraft/server";
import { getProfLevel } from "./proficiency.js";

// --- 矿石生成机制 ---
const lavaMineStreaks = new Map();

const ORE_TABLE = [
  { id: "minecraft:coal_ore", weight: 25 },
  { id: "minecraft:copper_ore", weight: 15 },
  { id: "minecraft:iron_ore", weight: 15 },
  { id: "minecraft:redstone_ore", weight: 10 },
  { id: "minecraft:lapis_ore", weight: 10 },
  { id: "minecraft:gold_ore", weight: 10 },
  { id: "minecraft:quartz_ore", weight: 10 },
  { id: "minecraft:diamond_ore", weight: 2 },
  { id: "minecraft:emerald_ore", weight: 2 },
  { id: "minecraft:ancient_debris", weight: 1 },
];
const ORE_TOTAL_WEIGHT = ORE_TABLE.reduce((s, e) => s + e.weight, 0);

const ORE_NAMES = {
  "minecraft:coal_ore": "煤矿",
  "minecraft:copper_ore": "铜矿",
  "minecraft:iron_ore": "铁矿",
  "minecraft:gold_ore": "金矿",
  "minecraft:redstone_ore": "红石矿",
  "minecraft:lapis_ore": "青金石矿",
  "minecraft:quartz_ore": "石英矿",
  "minecraft:diamond_ore": "钻石矿",
  "minecraft:emerald_ore": "绿宝石矿",
  "minecraft:ancient_debris": "下界残骸",
};

const OFFSET_6 = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

export function clearLavaStreak(playerId) {
  lavaMineStreaks.delete(playerId);
}

export function init() {
  world.afterEvents.playerBreakBlock.subscribe((event) => {
    const { block, player, brokenBlockPermutation } = event;
    const typeId = brokenBlockPermutation.type.id;
    if (typeId !== "minecraft:stone" && typeId !== "minecraft:cobblestone")
      return;

    const dimension = event.dimension;
    const { x, y, z } = block.location;

    // 检查相邻6个方块是否有岩浆
    let hasLava = false;
    for (const o of OFFSET_6) {
      const neighbor = dimension.getBlock({
        x: x + o.x,
        y: y + o.y,
        z: z + o.z,
      });
      if (neighbor?.typeId === "minecraft:lava") {
        hasLava = true;
        break;
      }
    }
    if (!hasLava) return;

    const playerId = player.id;
    let streak = lavaMineStreaks.get(playerId) ?? 0;

    // 动态概率
    const baseChance = 0.002;
    let currentChance;
    if (streak < 80) {
      currentChance = baseChance;
    } else {
      currentChance = Math.min(baseChance + (streak - 79) * 0.0035, 1.0);
    }
    const miningLevel = getProfLevel(playerId, "mining");
    currentChance += miningLevel * 0.0005;

    if (Math.random() >= currentChance) {
      streak++;
      lavaMineStreaks.set(playerId, streak);
      return;
    }
    lavaMineStreaks.set(playerId, 0);

    // 按权重抽取矿石
    let roll = Math.random() * ORE_TOTAL_WEIGHT;
    let selectedOre = ORE_TABLE[0].id;
    for (const entry of ORE_TABLE) {
      roll -= entry.weight;
      if (roll <= 0) {
        selectedOre = entry.id;
        break;
      }
    }

    const targetBlock = dimension.getBlock({ x, y, z });
    if (targetBlock) {
      targetBlock.setPermutation(BlockPermutation.resolve(selectedOre));
      const oreName = ORE_NAMES[selectedOre] ?? selectedOre;
      player.sendMessage(`§e⚡ 发现 ${oreName}！`);
      player.playSound("random.levelup");
    }
  });
}
