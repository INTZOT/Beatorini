// ============================================================
// 抽奖模块
// 主菜单 → 抽奖 → 奖池列表 → 单抽 / 十连
// 首个奖池：刷怪蛋奖池（86 种原版刷怪蛋，单抽 100,000 金币）
// 硬保底：10 抽必出史诗（含）以上，100 抽必出传说；抽中对应稀有度即重置计数
// ============================================================
import { system, world, ItemStack } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";
import { getPlayerMoney } from "./money.js";
import { addStat } from "./stats.js";
import { STATS_LOTTERY_PREFIX } from "./config.js";

// --- 稀有度配置 ---
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const RARITY = {
  common: { label: "普通", color: "§7", weight: 740 },
  uncommon: { label: "少见", color: "§e", weight: 740 },
  rare: { label: "稀有", color: "§9", weight: 249 },
  epic: { label: "史诗", color: "§d", weight: 10 },
  legendary: { label: "传说", color: "§6", weight: 1 },
};

// --- 十连参数 ---
const TEN_PULL_COUNT = 10;

// --- 硬保底参数（按玩家累计抽数计算，抽中即重置） ---
const PITY_EPIC_THRESHOLD = 10;
const PITY_LEGENDARY_THRESHOLD = 100;
const LOTTERY_PITY_EPIC_PREFIX = "lottery:pity_epic_";
const LOTTERY_PITY_LEGENDARY_PREFIX = "lottery:pity_legendary_";

// --- 刷怪蛋奖池内容 ---
// [物品 ID, 中文名, 稀有度]
const SPAWN_EGG_REWARDS = [
  ["minecraft:allay_spawn_egg", "悦灵刷怪蛋", "legendary"],
  ["minecraft:armadillo_spawn_egg", "犰狳刷怪蛋", "epic"],
  ["minecraft:axolotl_spawn_egg", "美西螈刷怪蛋", "epic"],
  ["minecraft:bat_spawn_egg", "蝙蝠刷怪蛋", "common"],
  ["minecraft:bee_spawn_egg", "蜜蜂刷怪蛋", "common"],
  ["minecraft:blaze_spawn_egg", "烈焰人刷怪蛋", "rare"],
  ["minecraft:breeze_spawn_egg", "旋风人刷怪蛋", "rare"],
  ["minecraft:cat_spawn_egg", "猫刷怪蛋", "common"],
  ["minecraft:cave_spider_spawn_egg", "洞穴蜘蛛刷怪蛋", "rare"],
  ["minecraft:camel_spawn_egg", "骆驼刷怪蛋", "rare"],
  ["minecraft:camel_husk_spawn_egg", "骆驼尸壳刷怪蛋", "rare"],
  ["minecraft:chicken_spawn_egg", "鸡刷怪蛋", "common"],
  ["minecraft:cod_spawn_egg", "鳕鱼刷怪蛋", "common"],
  ["minecraft:cow_spawn_egg", "牛刷怪蛋", "epic"],
  ["minecraft:copper_golem_spawn_egg", "铜傀儡刷怪蛋", "common"],
  ["minecraft:creaking_spawn_egg", "嘎枝刷怪蛋", "rare"],
  ["minecraft:creeper_spawn_egg", "苦力怕刷怪蛋", "common"],
  ["minecraft:dolphin_spawn_egg", "海豚刷怪蛋", "common"],
  ["minecraft:donkey_spawn_egg", "驴刷怪蛋", "epic"],
  ["minecraft:drowned_spawn_egg", "溺尸刷怪蛋", "common"],
  ["minecraft:elder_guardian_spawn_egg", "远古守卫者刷怪蛋", "legendary"],
  ["minecraft:enderman_spawn_egg", "末影人刷怪蛋", "common"],
  ["minecraft:endermite_spawn_egg", "末影螨刷怪蛋", "rare"],
  ["minecraft:evoker_spawn_egg", "唤魔者刷怪蛋", "rare"],
  ["minecraft:fox_spawn_egg", "狐狸刷怪蛋", "rare"],
  ["minecraft:frog_spawn_egg", "青蛙刷怪蛋", "epic"],
  ["minecraft:ghast_spawn_egg", "恶魂刷怪蛋", "rare"],
  ["minecraft:glow_squid_spawn_egg", "发光鱿鱼刷怪蛋", "common"],
  ["minecraft:goat_spawn_egg", "山羊刷怪蛋", "epic"],
  ["minecraft:guardian_spawn_egg", "守卫者刷怪蛋", "rare"],
  ["minecraft:happy_ghast_spawn_egg", "快乐恶魂刷怪蛋", "rare"],
  ["minecraft:hoglin_spawn_egg", "疣猪兽刷怪蛋", "rare"],
  ["minecraft:horse_spawn_egg", "马刷怪蛋", "epic"],
  ["minecraft:husk_spawn_egg", "尸壳刷怪蛋", "rare"],
  ["minecraft:iron_golem_spawn_egg", "铁傀儡刷怪蛋", "common"],
  ["minecraft:llama_spawn_egg", "羊驼刷怪蛋", "epic"],
  ["minecraft:magma_cube_spawn_egg", "岩浆怪刷怪蛋", "rare"],
  ["minecraft:mooshroom_spawn_egg", "哞菇刷怪蛋", "legendary"],
  ["minecraft:mule_spawn_egg", "骡刷怪蛋", "rare"],
  ["minecraft:nautilus_spawn_egg", "鹦鹉螺刷怪蛋", "common"],
  ["minecraft:ocelot_spawn_egg", "豹猫刷怪蛋", "epic"],
  ["minecraft:panda_spawn_egg", "熊猫刷怪蛋", "legendary"],
  ["minecraft:parched_spawn_egg", "焦骸刷怪蛋", "rare"],
  ["minecraft:parrot_spawn_egg", "鹦鹉刷怪蛋", "epic"],
  ["minecraft:phantom_spawn_egg", "幻翼刷怪蛋", "common"],
  ["minecraft:pig_spawn_egg", "猪刷怪蛋", "epic"],
  ["minecraft:piglin_brute_spawn_egg", "猪灵蛮兵刷怪蛋", "rare"],
  ["minecraft:piglin_spawn_egg", "猪灵刷怪蛋", "rare"],
  ["minecraft:pillager_spawn_egg", "掠夺者刷怪蛋", "common"],
  ["minecraft:polar_bear_spawn_egg", "北极熊刷怪蛋", "rare"],
  ["minecraft:pufferfish_spawn_egg", "河豚刷怪蛋", "rare"],
  ["minecraft:rabbit_spawn_egg", "兔子刷怪蛋", "epic"],
  ["minecraft:ravager_spawn_egg", "劫掠兽刷怪蛋", "rare"],
  ["minecraft:salmon_spawn_egg", "鲑鱼刷怪蛋", "common"],
  ["minecraft:sheep_spawn_egg", "绵羊刷怪蛋", "epic"],
  ["minecraft:shulker_spawn_egg", "潜影贝刷怪蛋", "legendary"],
  ["minecraft:silverfish_spawn_egg", "蠹虫刷怪蛋", "rare"],
  ["minecraft:skeleton_horse_spawn_egg", "骷髅马刷怪蛋", "rare"],
  ["minecraft:skeleton_spawn_egg", "骷髅刷怪蛋", "common"],
  ["minecraft:slime_spawn_egg", "史莱姆刷怪蛋", "common"],
  ["minecraft:sniffer_spawn_egg", "嗅探兽刷怪蛋", "epic"],
  ["minecraft:snow_golem_spawn_egg", "雪傀儡刷怪蛋", "legendary"],
  ["minecraft:spider_spawn_egg", "蜘蛛刷怪蛋", "common"],
  ["minecraft:squid_spawn_egg", "鱿鱼刷怪蛋", "common"],
  ["minecraft:stray_spawn_egg", "流浪者刷怪蛋", "rare"],
  ["minecraft:strider_spawn_egg", "炽足兽刷怪蛋", "epic"],
  ["minecraft:sulfur_cube_spawn_egg", "硫方怪刷怪蛋", "epic"],
  ["minecraft:tadpole_spawn_egg", "蝌蚪刷怪蛋", "epic"],
  ["minecraft:trader_llama_spawn_egg", "行商羊驼刷怪蛋", "common"],
  ["minecraft:tropical_fish_spawn_egg", "热带鱼刷怪蛋", "rare"],
  ["minecraft:turtle_spawn_egg", "海龟刷怪蛋", "epic"],
  ["minecraft:vex_spawn_egg", "恼鬼刷怪蛋", "rare"],
  ["minecraft:villager_spawn_egg", "村民刷怪蛋", "common"],
  ["minecraft:vindicator_spawn_egg", "卫道士刷怪蛋", "rare"],
  ["minecraft:wandering_trader_spawn_egg", "流浪商人刷怪蛋", "common"],
  ["minecraft:warden_spawn_egg", "监守者刷怪蛋", "rare"],
  ["minecraft:witch_spawn_egg", "女巫刷怪蛋", "common"],
  ["minecraft:wither_skeleton_spawn_egg", "凋灵骷髅刷怪蛋", "rare"],
  ["minecraft:wither_spawn_egg", "凋灵刷怪蛋", "legendary"],
  ["minecraft:wolf_spawn_egg", "狼刷怪蛋", "epic"],
  ["minecraft:zoglin_spawn_egg", "僵尸疣猪兽刷怪蛋", "rare"],
  ["minecraft:zombie_horse_spawn_egg", "僵尸马刷怪蛋", "rare"],
  ["minecraft:zombie_nautilus_spawn_egg", "僵尸鹦鹉螺刷怪蛋", "common"],
  ["minecraft:zombie_pigman_spawn_egg", "僵尸猪灵刷怪蛋", "rare"],
  ["minecraft:zombie_spawn_egg", "僵尸刷怪蛋", "common"],
  ["minecraft:zombie_villager_spawn_egg", "僵尸村民刷怪蛋", "common"],
];

// --- 下界奖池内容 ---
// [物品 ID, 中文名, 稀有度, 单次数量]
const NETHER_REWARDS = [
  ["minecraft:netherrack", "地狱岩", "common", 16],
  ["minecraft:gravel", "沙砾", "common", 16],
  ["minecraft:soul_soil", "灵魂土", "common", 16],
  ["minecraft:soul_sand", "灵魂沙", "common", 16],
  ["minecraft:basalt", "玄武岩", "common", 16],
  ["minecraft:blackstone", "黑石", "common", 16],
  ["minecraft:magma_block", "岩浆块", "common", 16],
  ["minecraft:crimson_nylium", "绯红菌岩", "rare", 4],
  ["minecraft:warped_nylium", "诡异菌岩", "rare", 4],
  ["minecraft:weeping_vines", "垂泪藤", "rare", 4],
  ["minecraft:twisting_vines", "缠怨藤", "rare", 4],
  ["minecraft:warped_fungus", "诡异真菌", "rare", 4],
  ["minecraft:crimson_fungus", "绯红菌", "rare", 4],
  ["minecraft:blaze_rod", "烈焰棒", "epic", 8],
  ["minecraft:magma_cream", "岩浆膏", "epic", 8],
  ["minecraft:ghast_tear", "恶魂之泪", "epic", 8],
  ["minecraft:wither_skeleton_skull", "凋灵骷髅头", "epic", 1],
  ["minecraft:netherite_upgrade_smithing_template", "下界合金升级模板", "legendary", 1],
  ["minecraft:nether_wart", "下界疣", "legendary", 1],
];

// --- 末地奖池内容 ---
// [物品 ID, 中文名, 稀有度, 单次数量]
const END_REWARDS = [
  ["minecraft:obsidian", "黑曜石", "common", 8],
  ["minecraft:ender_pearl", "末影珍珠", "common", 8],
  ["minecraft:chorus_fruit", "紫颂果", "common", 16],
  ["minecraft:end_stone", "末地石", "common", 16],
  ["minecraft:ender_chest", "末影箱", "rare", 2],
  ["minecraft:shulker_shell", "潜影壳", "rare", 2],
  ["minecraft:dragon_breath", "龙息", "rare", 4],
  ["minecraft:chorus_flower", "紫颂花", "epic", 1],
  ["minecraft:dragon_head", "龙首", "epic", 1],
  ["minecraft:elytra", "鞘翅", "legendary", 1],
  ["minecraft:dragon_egg", "龙蛋", "legendary", 1],
];

// --- 宝藏奖池内容（当前全部为普通，稀有度待配置） ---
// [物品 ID, 中文名, 稀有度, 单次数量]
const TREASURE_REWARDS = [
  // --- 少见（Uncommon） ---
  ["minecraft:creeper_banner_pattern", "苦力怕盾徽旗帜图案", "rare", 1],
  ["minecraft:piglin_banner_pattern", "猪鼻旗帜图案", "rare", 1],
  ["minecraft:book", "书", "common", 1],
  ["minecraft:sniffer_egg", "嗅探兽蛋", "common", 1],
  ["minecraft:chainmail_helmet", "锁链头盔", "common", 1],
  ["minecraft:chainmail_chestplate", "锁链胸甲", "common", 1],
  ["minecraft:chainmail_leggings", "锁链护腿", "common", 1],
  ["minecraft:chainmail_boots", "锁链靴子", "common", 1],
  ["minecraft:angler_pottery_sherd", "垂钓纹陶片", "common", 1],
  ["minecraft:archer_pottery_sherd", "弓箭纹陶片", "common", 1],
  ["minecraft:arms_up_pottery_sherd", "举臂纹陶片", "common", 1],
  ["minecraft:blade_pottery_sherd", "利刃纹陶片", "common", 1],
  ["minecraft:brewer_pottery_sherd", "佳酿纹陶片", "common", 1],
  ["minecraft:burn_pottery_sherd", "烈焰纹陶片", "common", 1],
  ["minecraft:danger_pottery_sherd", "危险纹陶片", "common", 1],
  ["minecraft:explorer_pottery_sherd", "探险纹陶片", "common", 1],
  ["minecraft:friend_pottery_sherd", "挚友纹陶片", "common", 1],
  ["minecraft:heart_pottery_sherd", "爱心纹陶片", "common", 1],
  ["minecraft:heartbreak_pottery_sherd", "心碎纹陶片", "common", 1],
  ["minecraft:howl_pottery_sherd", "嚎叫纹陶片", "common", 1],
  ["minecraft:miner_pottery_sherd", "矿工纹陶片", "common", 1],
  ["minecraft:mourner_pottery_sherd", "哀悼纹陶片", "common", 1],
  ["minecraft:plenty_pottery_sherd", "丰收纹陶片", "common", 1],
  ["minecraft:prize_pottery_sherd", "珍宝纹陶片", "common", 1],
  ["minecraft:sheaf_pottery_sherd", "麦捆纹陶片", "common", 1],
  ["minecraft:shelter_pottery_sherd", "庇护纹陶片", "common", 1],
  ["minecraft:skull_pottery_sherd", "骷髅纹陶片", "common", 1],
  ["minecraft:snort_pottery_sherd", "鼻息纹陶片", "common", 1],
  ["minecraft:flow_pottery_sherd", "涡流纹陶片", "common", 1],
  ["minecraft:guster_pottery_sherd", "旋风纹陶片", "common", 1],
  ["minecraft:scrape_pottery_sherd", "刮削纹陶片", "common", 1],
  ["minecraft:ominous_bottle", "不祥之瓶", "epic", 1],
  ["minecraft:sentry_armor_trim_smithing_template", "哨兵纹盔甲纹饰", "rare", 1],
  ["minecraft:dune_armor_trim_smithing_template", "沙丘纹盔甲纹饰", "rare", 1],
  ["minecraft:coast_armor_trim_smithing_template", "海岸纹盔甲纹饰", "rare", 1],
  ["minecraft:wild_armor_trim_smithing_template", "荒野纹盔甲纹饰", "rare", 1],
  ["minecraft:tide_armor_trim_smithing_template", "潮汐纹盔甲纹饰", "rare", 1],
  ["minecraft:snout_armor_trim_smithing_template", "猪鼻纹盔甲纹饰", "rare", 1],
  ["minecraft:rib_armor_trim_smithing_template", "肋骨纹盔甲纹饰", "rare", 1],
  ["minecraft:wayfinder_armor_trim_smithing_template", "寻路者纹盔甲纹饰", "rare", 1],
  ["minecraft:shaper_armor_trim_smithing_template", "塑造者纹盔甲纹饰", "rare", 1],
  ["minecraft:raiser_armor_trim_smithing_template", "牧民纹盔甲纹饰", "rare", 1],
  ["minecraft:host_armor_trim_smithing_template", "雇主纹盔甲纹饰", "rare", 1],
  ["minecraft:flow_armor_trim_smithing_template", "涡流纹盔甲纹饰", "rare", 1],
  ["minecraft:bolt_armor_trim_smithing_template", "旋涡纹盔甲纹饰", "rare", 1],
  ["minecraft:music_disc_13", "唱片 13", "rare", 1],
  ["minecraft:music_disc_cat", "唱片 cat", "rare", 1],
  ["minecraft:music_disc_blocks", "唱片 blocks", "rare", 1],
  ["minecraft:music_disc_chirp", "唱片 chirp", "rare", 1],
  ["minecraft:music_disc_far", "唱片 far", "rare", 1],
  ["minecraft:music_disc_mall", "唱片 mall", "rare", 1],
  ["minecraft:music_disc_mellohi", "唱片 mellohi", "rare", 1],
  ["minecraft:music_disc_stal", "唱片 stal", "rare", 1],
  ["minecraft:music_disc_strad", "唱片 strad", "rare", 1],
  ["minecraft:music_disc_ward", "唱片 ward", "rare", 1],
  ["minecraft:music_disc_11", "唱片 11", "rare", 1],
  ["minecraft:music_disc_wait", "唱片 wait", "rare", 1],
  ["minecraft:music_disc_5", "唱片 5", "rare", 1],
  ["minecraft:music_disc_relic", "唱片 Relic", "rare", 1],
  ["minecraft:music_disc_creator_music_box", "唱片 Creator（音乐盒）", "rare", 1],
  ["minecraft:music_disc_precipice", "唱片 Precipice", "rare", 1],
  ["minecraft:music_disc_tears", "唱片 Tears", "rare", 1],
  ["minecraft:music_disc_lava_chicken", "唱片 Lava Chicken", "rare", 1],
  ["minecraft:music_disc_bounce", "唱片 Bounce", "rare", 1],
  ["minecraft:totem_of_undying", "不死图腾", "epic", 1],
  ["minecraft:experience_bottle", "附魔之瓶", "epic", 1],
  ["minecraft:conduit", "潮涌核心", "epic", 1],
  ["minecraft:heart_of_the_sea", "海洋之心", "epic", 1],
  ["minecraft:player_head", "玩家头颅", "epic", 1],
  ["minecraft:zombie_head", "僵尸头颅", "epic", 1],
  ["minecraft:creeper_head", "苦力怕头颅", "epic", 1],
  ["minecraft:skeleton_skull", "骷髅头颅", "epic", 1],
  ["minecraft:piglin_head", "猪灵头颅", "epic", 1],
  // --- 稀有（Rare） ---
  ["minecraft:flow_banner_pattern", "涡流旗帜图案", "rare", 1],
  ["minecraft:guster_banner_pattern", "旋风旗帜图案", "rare", 1],
  ["minecraft:enchanted_golden_apple", "附魔金苹果", "legendary", 1],
  ["minecraft:trident", "三叉戟", "legendary", 1],
  ["minecraft:nether_star", "下界之星", "legendary", 1],
  ["minecraft:ward_armor_trim_smithing_template", "监守纹盔甲纹饰", "rare", 1],
  ["minecraft:eye_armor_trim_smithing_template", "眼眸纹盔甲纹饰", "rare", 1],
  ["minecraft:vex_armor_trim_smithing_template", "恼鬼纹盔甲纹饰", "rare", 1],
  ["minecraft:spire_armor_trim_smithing_template", "尖塔纹盔甲纹饰", "rare", 1],
  ["minecraft:music_disc_pigstep", "唱片 Pigstep", "rare", 1],
  ["minecraft:music_disc_otherside", "唱片 otherside", "rare", 1],
  ["minecraft:music_disc_creator", "唱片 Creator", "rare", 1],
  ["minecraft:beacon", "信标", "legendary", 1],
  ["minecraft:skull_banner_pattern", "头颅盾徽旗帜图案", "rare", 1],
  ["minecraft:mojang_banner_pattern", "Mojang徽标旗帜图案", "rare", 1],
  // --- 史诗（Epic） ---
  ["minecraft:silence_armor_trim_smithing_template", "幽静纹盔甲纹饰", "rare", 1],
  ["minecraft:heavy_core", "沉重核心", "legendary", 1],
  ["minecraft:mace", "重锤", "legendary", 1],
];

// --- 奖池列表（后续新增奖池直接在此追加） ---
const LOTTERY_POOLS = [
  {
    id: "spawn_egg",
    name: "刷怪蛋奖池",
    icon: "✦",
    description: `内含 ${SPAWN_EGG_REWARDS.length} 种生物刷怪蛋，从常见家畜到稀有限定生物！`,
    singleCost: 100000,
    rewards: SPAWN_EGG_REWARDS.map(([typeId, label, rarity, count = 1]) => ({
      typeId,
      label,
      rarity,
      count,
    })),
  },
  {
    id: "nether",
    name: "下界奖池",
    icon: "☠",
    description: `内含 ${NETHER_REWARDS.length} 种下界物资，从常见方块到稀有材料！`,
    singleCost: 100000,
    rewards: NETHER_REWARDS.map(([typeId, label, rarity, count = 1]) => ({
      typeId,
      label,
      rarity,
      count,
    })),
  },
  {
    id: "end",
    name: "末地奖池",
    icon: "◆",
    description: `内含 ${END_REWARDS.length} 种末地物资，从黑曜石到鞘翅龙蛋！`,
    singleCost: 100000,
    rewards: END_REWARDS.map(([typeId, label, rarity, count = 1]) => ({
      typeId,
      label,
      rarity,
      count,
    })),
  },
  {
    id: "treasure",
    name: "宝藏奖池",
    icon: "❖",
    description: `内含 ${TREASURE_REWARDS.length} 种宝藏物品，从唱片陶片到鞘翅重锤！`,
    singleCost: 100000,
    rewards: TREASURE_REWARDS.map(([typeId, label, rarity, count = 1]) => ({
      typeId,
      label,
      rarity,
      count,
    })),
  },
];

// ============================================================
// 工具函数
// ============================================================

function formatNumber(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatPercent(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return `${parseFloat(rounded.toFixed(3))}%`;
}

function getRarityIndex(rarity) {
  return RARITY_ORDER.indexOf(rarity);
}

/**
 * 从奖池中抽取一个奖励。
 * 先按稀有度整体权重抽取稀有度（minIndex 为最低稀有度下标），
 * 再在该稀有度内随机选择一个物品，保证各稀有度整体概率精确可配。
 */
function pickReward(pool, minIndex = 0) {
  const eligibleRarities = RARITY_ORDER.filter(
    (rarity, i) =>
      i >= minIndex && pool.rewards.some((r) => r.rarity === rarity)
  );
  // 奖池内没有对应稀有度时回退到全奖池抽取
  if (eligibleRarities.length === 0) return pickReward(pool, 0);

  const total = eligibleRarities.reduce(
    (sum, rarity) => sum + RARITY[rarity].weight,
    0
  );
  let roll = Math.random() * total;
  let chosenRarity = eligibleRarities[eligibleRarities.length - 1];
  for (const rarity of eligibleRarities) {
    roll -= RARITY[rarity].weight;
    if (roll < 0) {
      chosenRarity = rarity;
      break;
    }
  }

  const candidates = pool.rewards.filter((r) => r.rarity === chosenRarity);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function playRaritySound(player, rarity) {
  const sound =
    {
      common: "random.pop",
      uncommon: "random.pop",
      rare: "random.orb",
      epic: "random.levelup",
      legendary: "firework.large_blast",
    }[rarity] || "random.pop";
  try {
    player.playSound(sound);
  } catch (e) {}
}

/** 发放奖励，返回因背包满而掉落的数量 */
function giveReward(player, reward) {
  try {
    const inv = player.getComponent("inventory").container;
    const leftover = inv.addItem(
      new ItemStack(reward.typeId, reward.count ?? 1)
    );
    return leftover?.amount ?? 0;
  } catch (e) {
    console.warn(`[Lottery] 发放 ${reward.typeId} 失败: ${e}`);
    return 0;
  }
}

function deductMoney(player, amount) {
  const money = getPlayerMoney(player);
  if (money < amount) return false;
  player.runCommand(`scoreboard players set @s money ${money - amount}`);
  return true;
}

// ============================================================
// 硬保底
// ============================================================

function getPity(player, poolId, prefix) {
  const value = world.getDynamicProperty(prefix + poolId + "_" + player.id);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function setPity(player, poolId, prefix, value) {
  world.setDynamicProperty(prefix + poolId + "_" + player.id, value);
}

function getPityInfo(player, poolId) {
  return {
    epic: getPity(player, poolId, LOTTERY_PITY_EPIC_PREFIX),
    legendary: getPity(player, poolId, LOTTERY_PITY_LEGENDARY_PREFIX),
  };
}

/**
 * 单次抽取：应用硬保底并更新保底计数。
 * 返回 { reward, pityType }，pityType 为 "epic"/"legendary"/null。
 */
function drawOneWithPity(player, pool) {
  addStat(player.id, STATS_LOTTERY_PREFIX, 1);
  const hasEpic = pool.rewards.some((r) => r.rarity === "epic");
  const hasLegendary = pool.rewards.some((r) => r.rarity === "legendary");
  let epicPity = getPity(player, pool.id, LOTTERY_PITY_EPIC_PREFIX);
  let legendaryPity = getPity(player, pool.id, LOTTERY_PITY_LEGENDARY_PREFIX);
  let reward;
  let pityType = null;

  if (hasLegendary && legendaryPity >= PITY_LEGENDARY_THRESHOLD - 1) {
    reward = pickReward(pool, getRarityIndex("legendary"));
    pityType = "legendary";
  } else if (hasEpic && epicPity >= PITY_EPIC_THRESHOLD - 1) {
    reward = pickReward(pool, getRarityIndex("epic"));
    pityType = "epic";
  } else {
    reward = pickReward(pool);
  }

  // 抽中传说同时重置史诗保底（传说高于史诗）；抽中史诗只重置史诗保底
  if (reward.rarity === "legendary") {
    legendaryPity = 0;
    epicPity = 0;
  } else if (reward.rarity === "epic") {
    epicPity = 0;
    if (hasLegendary) legendaryPity += 1;
  } else {
    if (hasEpic) epicPity += 1;
    if (hasLegendary) legendaryPity += 1;
  }

  setPity(player, pool.id, LOTTERY_PITY_EPIC_PREFIX, epicPity);
  setPity(player, pool.id, LOTTERY_PITY_LEGENDARY_PREFIX, legendaryPity);
  return { reward, pityType };
}

// ============================================================
// 抽奖逻辑
// ============================================================

function drawOnce(player, pool, backFn) {
  const cost = pool.singleCost;
  if (!deductMoney(player, cost)) {
    player.sendMessage(`§c金币不足！单抽需要 ${formatNumber(cost)} 金币`);
    player.playSound("random.break");
    showPoolMenu(player, pool, backFn);
    return;
  }
  const drawn = drawOneWithPity(player, pool);
  const dropped = giveReward(player, drawn.reward);
  playRaritySound(player, drawn.reward.rarity);
  showDrawResultForm(player, pool, [drawn], dropped, false, backFn);
}

function drawTen(player, pool, backFn) {
  const cost = pool.singleCost * TEN_PULL_COUNT;
  if (!deductMoney(player, cost)) {
    player.sendMessage(`§c金币不足！十连需要 ${formatNumber(cost)} 金币`);
    player.playSound("random.break");
    showPoolMenu(player, pool, backFn);
    return;
  }

  const results = [];
  for (let i = 0; i < TEN_PULL_COUNT; i++) {
    results.push(drawOneWithPity(player, pool));
  }

  let dropped = 0;
  for (const drawn of results) {
    dropped += giveReward(player, drawn.reward);
  }

  const bestIndex = Math.max(
    ...results.map((r) => getRarityIndex(r.reward.rarity))
  );
  playRaritySound(player, RARITY_ORDER[bestIndex]);
  showDrawResultForm(player, pool, results, dropped, true, backFn);
}

// ============================================================
// UI
// ============================================================

function showDrawResultForm(player, pool, results, dropped, isTen, backFn) {
  // 相同奖励合并显示
  const grouped = new Map();
  const pityTriggered = new Set();
  for (const drawn of results) {
    const reward = drawn.reward;
    if (drawn.pityType) pityTriggered.add(drawn.pityType);
    const cur =
      grouped.get(reward.typeId) || { reward, count: 0, totalAmount: 0 };
    cur.count++;
    cur.totalAmount += reward.count ?? 1;
    grouped.set(reward.typeId, cur);
  }

  let f = new CustomForm(player, `${pool.name} · 抽奖结果`);
  f = f.label(`§6剩余金币: ${formatNumber(getPlayerMoney(player))}`);
  f = f.spacer();

  for (const { reward, count, totalAmount } of grouped.values()) {
    const rarity = RARITY[reward.rarity];
    let line = `${rarity.color}${rarity.label} ×${count}  ${reward.label}`;
    if ((reward.count ?? 1) > 1) {
      line += ` §7(${totalAmount}个)`;
    }
    f = f.label(line);
    f = f.spacer();
  }

  if (pityTriggered.has("legendary")) {
    f = f.label("§6◆ 触发传说保底！");
    f = f.spacer();
  } else if (pityTriggered.has("epic")) {
    f = f.label("§d◆ 触发史诗保底！");
    f = f.spacer();
  }

  if (dropped > 0) {
    f = f.label(`§c注意：背包已满，${dropped} 个物品掉落在你脚下！`);
    f = f.spacer();
  }

  f = f.button(isTen ? "再来十连" : "再来一次", () => {
    f.close();
    system.runTimeout(
      () => (isTen ? drawTen(player, pool, backFn) : drawOnce(player, pool, backFn)),
      2
    );
  });
  f = f.spacer();
  f = f.button("返回奖池", () => {
    f.close();
    system.runTimeout(() => showPoolMenu(player, pool, backFn), 2);
  });
  f.show().catch((e) => console.warn("Lottery result form failed:", e));
}

function showPoolMenu(player, pool, backFn) {
  const tenCost = pool.singleCost * TEN_PULL_COUNT;
  const pity = getPityInfo(player, pool.id);
  const pityTexts = [];
  if (pool.rewards.some((r) => r.rarity === "epic")) {
    pityTexts.push(`史诗保底: ${pity.epic}/${PITY_EPIC_THRESHOLD}`);
  }
  if (pool.rewards.some((r) => r.rarity === "legendary")) {
    pityTexts.push(`传说保底: ${pity.legendary}/${PITY_LEGENDARY_THRESHOLD}`);
  }
  let f = new CustomForm(player, `${pool.icon} ${pool.name}`);
  f = f.label(`§6当前金币: ${formatNumber(getPlayerMoney(player))}`);
  f = f.spacer();
  f = f.label(pool.description);
  f = f.spacer();
  if (pityTexts.length > 0) {
    f = f.label(`§7${pityTexts.join("   ")}`);
    f = f.spacer();
  }
  f = f.button(`单抽一次  ${formatNumber(pool.singleCost)}`, () => {
    f.close();
    system.runTimeout(() => drawOnce(player, pool, backFn), 2);
  });
  f = f.spacer();
  f = f.button(`十连抽  ${formatNumber(tenCost)}`, () => {
    f.close();
    system.runTimeout(() => drawTen(player, pool, backFn), 2);
  });
  f = f.spacer();
  f = f.button("查看奖池详情", () => {
    f.close();
    system.runTimeout(() => showPoolDetailsForm(player, pool, backFn), 2);
  });
  f = f.spacer();
  f = f.button("返回奖池列表", () => {
    f.close();
    system.runTimeout(() => showLotteryMenu(player, backFn), 2);
  });
  f.show().catch((e) => console.warn("Lottery pool form failed:", e));
}

function showPoolDetailsForm(player, pool, backFn) {
  const groups = {};
  for (const reward of pool.rewards) {
    if (!groups[reward.rarity]) groups[reward.rarity] = [];
    groups[reward.rarity].push(reward);
  }
  const presentRarities = RARITY_ORDER.filter(
    (rarity) => (groups[rarity] || []).length > 0
  );
  const totalWeight = presentRarities.reduce(
    (sum, rarity) => sum + RARITY[rarity].weight,
    0
  );

  let f = new CustomForm(player, `${pool.icon} ${pool.name} · 奖池详情`);
  f = f.label(`§6奖池内共 ${pool.rewards.length} 种物品`);
  f = f.spacer();

  for (const rarity of [...RARITY_ORDER].reverse()) {
    const list = groups[rarity] || [];
    if (list.length === 0) continue;
    const meta = RARITY[rarity];
    const percent = formatPercent((meta.weight / totalWeight) * 100);
    f = f.label(`${meta.color}§l${meta.label} (${list.length})  §7${percent}`);
    f = f.spacer();
    for (const reward of list) {
      const amount = reward.count > 1 ? ` x${reward.count}` : "";
      f = f.label(`${meta.color}${reward.label}${amount}`);
      f = f.spacer();
    }
    f = f.spacer();
  }

  f = f.button("返回奖池", () => {
    f.close();
    system.runTimeout(() => showPoolMenu(player, pool, backFn), 2);
  });
  f.show().catch((e) => console.warn("Lottery pool details form failed:", e));
}

export function showLotteryMenu(player, backFn = () => {}) {
  let f = new CustomForm(player, "抽奖");
  f = f.label(`§6当前金币: ${formatNumber(getPlayerMoney(player))}`);
  f = f.spacer();
  f = f.label("§7选择奖池，抽取随机奖励");
  f = f.spacer();

  for (const pool of LOTTERY_POOLS) {
    f = f.button(
      `${pool.icon} ${pool.name}  单抽 ${formatNumber(pool.singleCost)}`,
      () => {
        f.close();
        system.runTimeout(() => showPoolMenu(player, pool, backFn), 2);
      }
    );
    f = f.spacer();
  }

  f = f.button("返回主菜单", () => {
    f.close();
    system.runTimeout(() => backFn(player), 2);
  });
  f.show().catch((e) => console.warn("Lottery menu failed:", e));
}

export function init() {}
