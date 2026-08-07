import { world, system } from "@minecraft/server";
import { ACHIEVEMENT_PREFIX } from "./config.js";

// --- 成就定义 ---
export const ACHIEVEMENTS = [
  { item: "minecraft:oak_log", name: "【万物起源】", reward: 2000 },
  { item: "minecraft:cobblestone", name: "【！？石粒！？】", reward: 2000 },
  { item: "minecraft:oak_sapling", name: "【生生不息】", reward: 2000 },
  { item: "minecraft:apple", name: "【医生驱逐器】", reward: 2000 },
  { item: "minecraft:rotten_flesh", name: "【Monster Hunter】", reward: 2000 },
  { item: "minecraft:copper_ingot", name: "【炼铜癖】", reward: 3000 },
  { item: "minecraft:coal", name: "【漂亮的煤煤】", reward: 3000 },
  { item: "minecraft:iron_ingot", name: "【来硬的】", reward: 5000 },
  { item: "minecraft:gold_ingot", name: "【Gold Experience】", reward: 5000 },
  { item: "minecraft:emerald", name: "【市场经济】", reward: 10000 },
  { item: "minecraft:diamond", name: "【Shine on Your Crazy Diamond】", reward: 10000 },
  { item: "minecraft:redstone", name: "【雷石东】", reward: 5000 },
  { item: "minecraft:lapis_lazuli", name: "【从零开始学附魔】", reward: 5000 },
  { item: "minecraft:quartz", name: "【下界来客】", reward: 10000 },
  { item: "minecraft:ancient_debris", name: "【终极欧皇】", reward: 50000 },
  { item: "minecraft:potato", name: "【育碧服务器】", reward: 10000 },
  { item: "minecraft:carrot", name: "【猪猪最爱】", reward: 10000 },
  { item: "minecraft:wheat", name: "【喜看稻菽千重浪】", reward: 2000 },
  { item: "minecraft:egg", name: "【红旗下的蛋】", reward: 2000 },
  { item: "minecraft:golden_apple", name: "【医生驱逐器·ProMax】", reward: 5000 },
  { item: "minecraft:slime_ball", name: "【有机胶水】", reward: 2000 },
  { item: "minecraft:white_wool", name: "【羊了个毛】", reward: 2000 },
  { item: "minecraft:cooked_beef", name: "【七分熟】", reward: 5000 },
  { item: "minecraft:cooked_chicken", name: "【疯狂星期四】", reward: 5000 },
  { item: "minecraft:cooked_porkchop", name: "【豪大大猪扒】", reward: 5000 },
  { item: "minecraft:melon_block", name: "【合成大西瓜】", reward: 10000 },
  { item: "minecraft:pumpkin", name: "【我太南了】", reward: 10000 },
  { item: "minecraft:sugar_cane", name: "【蔗...有点弱！？】", reward: 10000 },
  { item: "minecraft:poppy", name: "【二手玫瑰】", reward: 2000 },
  { item: "minecraft:bone", name: "【精神是块骨头】", reward: 2000 },
  { item: "minecraft:glass_bottle", name: "【a bole of waer】", reward: 2000 },
  { item: "minecraft:honey_bottle", name: "【哈基米哈基米哈基米~】", reward: 10000 },
  { item: "minecraft:fishing_rod", name: "【钓鱼佬永不空军】", reward: 2000 },
  { item: "minecraft:bow", name: "【紅蓮の弓矢】", reward: 2000 },
  { item: "minecraft:iron_sword", name: "【我是剑骨头】", reward: 10000 },
  { item: "minecraft:pointed_dripstone", name: "【水滴石穿】", reward: 5000 },
  { item: "minecraft:iron_pickaxe", name: "【！？镐击！？】", reward: 10000 },
  { item: "minecraft:torch", name: "【上帝说，要有光】", reward: 2000 },
  { item: "minecraft:flint_and_steel", name: "【普罗米修斯】", reward: 2000 },
  { item: "minecraft:slime", name: "【蹦蹦床】", reward: 2000 },
  { item: "minecraft:cauldron", name: "【染缸】", reward: 2000 },
  { item: "minecraft:furnace", name: "【铜铁炉中翻火焰】", reward: 2000 },
  { item: "minecraft:chest", name: "【百万仓储】", reward: 2000 },
  { item: "minecraft:crafting_table", name: "【合成天下】", reward: 2000 },
  { item: "minecraft:cod", name: "【Weird Fish】", reward: 2000 },
  { item: "minecraft:waterlily", name: "【鱼戏莲叶间】", reward: 2000 },
  { item: "minecraft:bed", name: "【Nice Dream】", reward: 2000 },
  { item: "minecraft:ink_sac", name: "【这玩意是怎么刷出来的？】", reward: 2000 },
  { item: "minecraft:red_mushroom", name: "【红伞伞白杆杆】", reward: 2000 },
  { item: "minecraft:shield", name: "【我的刀盾】", reward: 5000 },
  { item: "minecraft:brown_mushroom", name: "【蓝瘦香菇】", reward: 2000 },
  { item: "minecraft:chicken", name: "【你干嘛~哎呦】", reward: 2000 },
  { item: "minecraft:redstone_repeater", name: "【雷石东直放站】", reward: 5000 },
  { item: "minecraft:string", name: "【谁打出来的胶布！?】", reward: 2000 },
  { item: "minecraft:porkchop", name: "【群友谋杀事件】", reward: 2000 },
  { item: "minecraft:tnt", name: "【蹦蹦炸弹】", reward: 5000 },
  { item: "minecraft:blaze_rod", name: "【大火杆?】", reward: 10000 },
  { item: "minecraft:oak_fence", name: "【1.5个运动员?】", reward: 2000 },
  { item: "minecraft:glow_ink_sac", name: "【这玩意是怎么出现的？】", reward: 3000 },
  { item: "minecraft:trident", name: "【这不是餐叉么】", reward: 10000 },
  { item: "minecraft:lightning_rod", name: "【雷霆之杖】", reward: 5000 },
  { item: "minecraft:ender_pearl", name: "【以太人珍珠】", reward: 10000 },
  { item: "minecraft:beacon", name: "【带信标回家】", reward: 50000 },
  { item: "minecraft:charcoal", name: "【可再生能源】", reward: 2000 },
  { item: "minecraft:redstone_lamp", name: "【！？灯泡？！】", reward: 5000 },
  { item: "minecraft:minecart", name: "【哇塞，火车！】", reward: 5000 },
];

export function getAchievements(playerId) {
  const raw = world.getDynamicProperty(ACHIEVEMENT_PREFIX + playerId);
  return raw ? JSON.parse(raw) : [];
}

export function saveAchievement(playerId, itemType) {
  const list = getAchievements(playerId);
  if (!list.includes(itemType)) {
    list.push(itemType);
    world.setDynamicProperty(ACHIEVEMENT_PREFIX + playerId, JSON.stringify(list));
  }
}

export function init() {
  // --- 成就检测（每10秒检查玩家背包） ---
  system.runInterval(() => {
    for (const player of world.getPlayers()) {
      const completed = getAchievements(player.id);
      if (!player.getComponent("minecraft:inventory")) continue;
      const inv = player.getComponent("minecraft:inventory").container;
      for (const ach of ACHIEVEMENTS) {
        if (completed.includes(ach.item)) continue;
        let hasItem = false;
        for (let slot = 0; slot < inv.size; slot++) {
          const stack = inv.getItem(slot);
          if (stack?.typeId === ach.item) {
            hasItem = true;
            break;
          }
        }
        if (!hasItem) continue;
        saveAchievement(player.id, ach.item);
        player.runCommand(`scoreboard players add @s money ${ach.reward}`);
        const msg = `§6[成就] §e${player.name} §a获得了成就 §l§6${ach.name}§r §a金币+${ach.reward}`;
        world.sendMessage(msg);
        player.playSound("random.levelup");
      }
    }
  }, 20 * 10);
}
