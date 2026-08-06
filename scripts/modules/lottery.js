// ============================================================
// 抽奖模块
// 主菜单 → 抽奖 → 奖池列表 → 单抽 / 十连
// 首个奖池：刷怪蛋奖池（85 种原版刷怪蛋，单抽 100,000 金币）
// 十连 = 10 × 单抽价格，并保底至少 1 个史诗及以上奖励
// ============================================================
import { system, ItemStack } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";
import { getPlayerMoney } from "./money.js";

// --- 稀有度配置 ---
const RARITY_ORDER = ["common", "rare", "epic", "legendary"];
const RARITY = {
  common: { label: "普通", color: "§7", weight: 100 },
  rare: { label: "稀有", color: "§9", weight: 28 },
  epic: { label: "史诗", color: "§d", weight: 8 },
  legendary: { label: "传说", color: "§6", weight: 2 },
};

// --- 十连参数 ---
const TEN_PULL_COUNT = 10;
// 十连保底：至少出现一个该稀有度（含）以上的奖励
const TEN_PULL_GUARANTEE_RARITY = "epic";

// --- 刷怪蛋奖池内容 ---
// [物品 ID, 中文名, 稀有度]
const SPAWN_EGG_REWARDS = [
  ["minecraft:allay_spawn_egg", "悦灵刷怪蛋", "rare"],
  ["minecraft:armadillo_spawn_egg", "犰狳刷怪蛋", "common"],
  ["minecraft:axolotl_spawn_egg", "美西螈刷怪蛋", "rare"],
  ["minecraft:bat_spawn_egg", "蝙蝠刷怪蛋", "common"],
  ["minecraft:bee_spawn_egg", "蜜蜂刷怪蛋", "common"],
  ["minecraft:blaze_spawn_egg", "烈焰人刷怪蛋", "rare"],
  ["minecraft:breeze_spawn_egg", "旋风人刷怪蛋", "epic"],
  ["minecraft:cat_spawn_egg", "猫刷怪蛋", "common"],
  ["minecraft:cave_spider_spawn_egg", "洞穴蜘蛛刷怪蛋", "rare"],
  ["minecraft:camel_spawn_egg", "骆驼刷怪蛋", "common"],
  ["minecraft:camel_husk_spawn_egg", "骆驼尸壳刷怪蛋", "epic"],
  ["minecraft:chicken_spawn_egg", "鸡刷怪蛋", "common"],
  ["minecraft:cod_spawn_egg", "鳕鱼刷怪蛋", "common"],
  ["minecraft:cow_spawn_egg", "牛刷怪蛋", "common"],
  ["minecraft:copper_golem_spawn_egg", "铜傀儡刷怪蛋", "legendary"],
  ["minecraft:creaking_spawn_egg", "嘎枝刷怪蛋", "legendary"],
  ["minecraft:creeper_spawn_egg", "苦力怕刷怪蛋", "rare"],
  ["minecraft:dolphin_spawn_egg", "海豚刷怪蛋", "rare"],
  ["minecraft:donkey_spawn_egg", "驴刷怪蛋", "common"],
  ["minecraft:drowned_spawn_egg", "溺尸刷怪蛋", "rare"],
  ["minecraft:elder_guardian_spawn_egg", "远古守卫者刷怪蛋", "epic"],
  ["minecraft:enderman_spawn_egg", "末影人刷怪蛋", "rare"],
  ["minecraft:endermite_spawn_egg", "末影螨刷怪蛋", "rare"],
  ["minecraft:evoker_spawn_egg", "唤魔者刷怪蛋", "epic"],
  ["minecraft:fox_spawn_egg", "狐狸刷怪蛋", "common"],
  ["minecraft:frog_spawn_egg", "青蛙刷怪蛋", "common"],
  ["minecraft:ghast_spawn_egg", "恶魂刷怪蛋", "rare"],
  ["minecraft:glow_squid_spawn_egg", "发光鱿鱼刷怪蛋", "common"],
  ["minecraft:goat_spawn_egg", "山羊刷怪蛋", "common"],
  ["minecraft:guardian_spawn_egg", "守卫者刷怪蛋", "rare"],
  ["minecraft:happy_ghast_spawn_egg", "快乐恶魂刷怪蛋", "legendary"],
  ["minecraft:hoglin_spawn_egg", "疣猪兽刷怪蛋", "rare"],
  ["minecraft:horse_spawn_egg", "马刷怪蛋", "common"],
  ["minecraft:husk_spawn_egg", "尸壳刷怪蛋", "rare"],
  ["minecraft:iron_golem_spawn_egg", "铁傀儡刷怪蛋", "rare"],
  ["minecraft:llama_spawn_egg", "羊驼刷怪蛋", "common"],
  ["minecraft:magma_cube_spawn_egg", "岩浆怪刷怪蛋", "rare"],
  ["minecraft:mooshroom_spawn_egg", "哞菇刷怪蛋", "common"],
  ["minecraft:mule_spawn_egg", "骡刷怪蛋", "common"],
  ["minecraft:nautilus_spawn_egg", "鹦鹉螺刷怪蛋", "legendary"],
  ["minecraft:ocelot_spawn_egg", "豹猫刷怪蛋", "common"],
  ["minecraft:panda_spawn_egg", "熊猫刷怪蛋", "common"],
  ["minecraft:parched_spawn_egg", "焦骸刷怪蛋", "epic"],
  ["minecraft:parrot_spawn_egg", "鹦鹉刷怪蛋", "common"],
  ["minecraft:phantom_spawn_egg", "幻翼刷怪蛋", "rare"],
  ["minecraft:pig_spawn_egg", "猪刷怪蛋", "common"],
  ["minecraft:piglin_brute_spawn_egg", "猪灵蛮兵刷怪蛋", "rare"],
  ["minecraft:piglin_spawn_egg", "猪灵刷怪蛋", "rare"],
  ["minecraft:pillager_spawn_egg", "掠夺者刷怪蛋", "rare"],
  ["minecraft:polar_bear_spawn_egg", "北极熊刷怪蛋", "rare"],
  ["minecraft:pufferfish_spawn_egg", "河豚刷怪蛋", "common"],
  ["minecraft:rabbit_spawn_egg", "兔子刷怪蛋", "common"],
  ["minecraft:ravager_spawn_egg", "劫掠兽刷怪蛋", "rare"],
  ["minecraft:salmon_spawn_egg", "鲑鱼刷怪蛋", "common"],
  ["minecraft:sheep_spawn_egg", "绵羊刷怪蛋", "common"],
  ["minecraft:shulker_spawn_egg", "潜影贝刷怪蛋", "rare"],
  ["minecraft:silverfish_spawn_egg", "蠹虫刷怪蛋", "rare"],
  ["minecraft:skeleton_horse_spawn_egg", "骷髅马刷怪蛋", "rare"],
  ["minecraft:skeleton_spawn_egg", "骷髅刷怪蛋", "rare"],
  ["minecraft:slime_spawn_egg", "史莱姆刷怪蛋", "rare"],
  ["minecraft:sniffer_spawn_egg", "嗅探兽刷怪蛋", "common"],
  ["minecraft:snow_golem_spawn_egg", "雪傀儡刷怪蛋", "rare"],
  ["minecraft:spider_spawn_egg", "蜘蛛刷怪蛋", "rare"],
  ["minecraft:squid_spawn_egg", "鱿鱼刷怪蛋", "common"],
  ["minecraft:stray_spawn_egg", "流浪者刷怪蛋", "rare"],
  ["minecraft:strider_spawn_egg", "炽足兽刷怪蛋", "rare"],
  ["minecraft:sulfur_cube_spawn_egg", "硫方怪刷怪蛋", "epic"],
  ["minecraft:tadpole_spawn_egg", "蝌蚪刷怪蛋", "common"],
  ["minecraft:trader_llama_spawn_egg", "行商羊驼刷怪蛋", "common"],
  ["minecraft:tropical_fish_spawn_egg", "热带鱼刷怪蛋", "common"],
  ["minecraft:turtle_spawn_egg", "海龟刷怪蛋", "common"],
  ["minecraft:vex_spawn_egg", "恼鬼刷怪蛋", "rare"],
  ["minecraft:villager_spawn_egg", "村民刷怪蛋", "rare"],
  ["minecraft:vindicator_spawn_egg", "卫道士刷怪蛋", "rare"],
  ["minecraft:wandering_trader_spawn_egg", "流浪商人刷怪蛋", "rare"],
  ["minecraft:warden_spawn_egg", "监守者刷怪蛋", "legendary"],
  ["minecraft:witch_spawn_egg", "女巫刷怪蛋", "rare"],
  ["minecraft:wither_skeleton_spawn_egg", "凋灵骷髅刷怪蛋", "rare"],
  ["minecraft:wolf_spawn_egg", "狼刷怪蛋", "common"],
  ["minecraft:zoglin_spawn_egg", "僵尸疣猪兽刷怪蛋", "rare"],
  ["minecraft:zombie_horse_spawn_egg", "僵尸马刷怪蛋", "rare"],
  ["minecraft:zombie_nautilus_spawn_egg", "僵尸鹦鹉螺刷怪蛋", "legendary"],
  ["minecraft:zombie_pigman_spawn_egg", "僵尸猪灵刷怪蛋", "rare"],
  ["minecraft:zombie_spawn_egg", "僵尸刷怪蛋", "rare"],
  ["minecraft:zombie_villager_spawn_egg", "僵尸村民刷怪蛋", "rare"],
];

// --- 奖池列表（后续新增奖池直接在此追加） ---
const LOTTERY_POOLS = [
  {
    id: "spawn_egg",
    name: "刷怪蛋奖池",
    icon: "✦",
    description: `内含 ${SPAWN_EGG_REWARDS.length} 种生物刷怪蛋，从常见家畜到稀有限定生物！`,
    singleCost: 100000,
    rewards: SPAWN_EGG_REWARDS.map(([typeId, label, rarity]) => ({
      typeId,
      label,
      rarity,
    })),
  },
];

// ============================================================
// 工具函数
// ============================================================

function formatNumber(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getRarityIndex(rarity) {
  return RARITY_ORDER.indexOf(rarity);
}

/** 从奖池中按权重抽取一个奖励（minIndex 为最低稀有度下标） */
function pickReward(pool, minIndex = 0) {
  const eligible = pool.rewards.filter(
    (r) => getRarityIndex(r.rarity) >= minIndex
  );
  const total = eligible.reduce(
    (sum, r) => sum + RARITY[r.rarity].weight,
    0
  );
  let roll = Math.random() * total;
  for (const reward of eligible) {
    roll -= RARITY[reward.rarity].weight;
    if (roll < 0) return reward;
  }
  return eligible[eligible.length - 1];
}

function playRaritySound(player, rarity) {
  const sound =
    {
      common: "random.pop",
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
    const leftover = inv.addItem(new ItemStack(reward.typeId, 1));
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
  const reward = pickReward(pool);
  const dropped = giveReward(player, reward);
  playRaritySound(player, reward.rarity);
  showDrawResultForm(player, pool, [reward], dropped, false, backFn);
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
    results.push(pickReward(pool));
  }

  // 十连保底：至少一个史诗及以上
  const guaranteeIndex = getRarityIndex(TEN_PULL_GUARANTEE_RARITY);
  if (!results.some((r) => getRarityIndex(r.rarity) >= guaranteeIndex)) {
    results[TEN_PULL_COUNT - 1] = pickReward(pool, guaranteeIndex);
  }

  let dropped = 0;
  for (const reward of results) {
    dropped += giveReward(player, reward);
  }

  const bestIndex = Math.max(...results.map((r) => getRarityIndex(r.rarity)));
  playRaritySound(player, RARITY_ORDER[bestIndex]);
  showDrawResultForm(player, pool, results, dropped, true, backFn);
}

// ============================================================
// UI
// ============================================================

function showDrawResultForm(player, pool, results, dropped, isTen, backFn) {
  // 相同奖励合并显示
  const grouped = new Map();
  for (const reward of results) {
    const cur = grouped.get(reward.typeId) || { reward, count: 0 };
    cur.count++;
    grouped.set(reward.typeId, cur);
  }

  let f = new CustomForm(player, `${pool.name} · 抽奖结果`);
  f = f.label(`§6剩余金币: ${formatNumber(getPlayerMoney(player))}`);
  f = f.spacer();

  for (const { reward, count } of grouped.values()) {
    const rarity = RARITY[reward.rarity];
    f = f.label(`${rarity.color}${rarity.label} ×${count}  ${reward.label}`);
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
  const guaranteeLabel = RARITY[TEN_PULL_GUARANTEE_RARITY].label;
  let f = new CustomForm(player, `${pool.icon} ${pool.name}`);
  f = f.label(`§6当前金币: ${formatNumber(getPlayerMoney(player))}`);
  f = f.spacer();
  f = f.label(pool.description);
  f = f.spacer();
  f = f.button(`单抽一次  ${formatNumber(pool.singleCost)}`, () => {
    f.close();
    system.runTimeout(() => drawOnce(player, pool, backFn), 2);
  });
  f = f.spacer();
  f = f.button(
    `十连抽  ${formatNumber(tenCost)}  §7(保底${guaranteeLabel}+)`,
    () => {
      f.close();
      system.runTimeout(() => drawTen(player, pool, backFn), 2);
    }
  );
  f = f.spacer();
  f = f.button("返回奖池列表", () => {
    f.close();
    system.runTimeout(() => showLotteryMenu(player, backFn), 2);
  });
  f.show().catch((e) => console.warn("Lottery pool form failed:", e));
}

export function showLotteryMenu(player, backFn = () => {}) {
  let f = new CustomForm(player, "抽奖");
  f = f.label(`§6当前金币: ${formatNumber(getPlayerMoney(player))}`);
  f = f.spacer();
  f = f.label("§7选择奖池，抽取随机奖励");
  f = f.spacer();

  for (const pool of LOTTERY_POOLS) {
    f = f.button(
      `${pool.icon} ${pool.name}  §7单抽 ${formatNumber(pool.singleCost)}`,
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
