import { notifyIfBusy, validIndex } from "../lib/form.js";
import { system, world } from "@minecraft/server";
import { CustomForm, ObservableString, ObservableNumber } from "@minecraft/server-ui";
import { countItem, removeItems } from "../lib/inventory.js";
import { getPlayerMoney } from "./money.js";
import {
  RECYCLE_DAILY_CAP,
  RECYCLE_WINDOW,
  RECYCLE_CUM_PREFIX,
} from "./config.js";

// --- 回收物品分类 ---
const RECYCLE_CATEGORIES = {
  怪物: {
    icon: "❤",
    items: [
      { label: "腐肉", typeId: "minecraft:rotten_flesh", price: 100 },
      { label: "骨头", typeId: "minecraft:bone", price: 100 },
      { label: "箭", typeId: "minecraft:arrow", price: 100 },
      { label: "火药", typeId: "minecraft:gunpowder", price: 100 },
      { label: "蜘蛛眼", typeId: "minecraft:spider_eye", price: 100 },
      { label: "线", typeId: "minecraft:string", price: 100 },
      { label: "末影珍珠", typeId: "minecraft:ender_pearl", price: 1600 },
      { label: "粘液球", typeId: "minecraft:slime_ball", price: 100 },
      { label: "幻翼膜", typeId: "minecraft:phantom_membrane", price: 800 },
      { label: "玻璃瓶", typeId: "minecraft:glass_bottle", price: 50 },
      { label: "木棍", typeId: "minecraft:stick", price: 25 },
      { label: "糖", typeId: "minecraft:sugar", price: 50 },
      { label: "萤石粉", typeId: "minecraft:glowstone_dust", price: 100 },
    ],
  },
  渔产: {
    icon: "⚓",
    items: [
      { label: "生鳕鱼", typeId: "minecraft:cod", price: 100 },
      { label: "生鲑鱼", typeId: "minecraft:salmon", price: 100 },
      { label: "热带鱼", typeId: "minecraft:tropical_fish", price: 200 },
      { label: "河豚", typeId: "minecraft:pufferfish", price: 200 },
      { label: "墨囊", typeId: "minecraft:ink_sac", price: 100 },
      { label: "发光墨囊", typeId: "minecraft:glow_ink_sac", price: 100 },
      { label: "鹦鹉螺壳", typeId: "minecraft:nautilus_shell", price: 200 },
    ],
  },
  矿产: {
    icon: "❑",
    items: [
      { label: "圆石", typeId: "minecraft:cobblestone", price: 25 },
      { label: "石头", typeId: "minecraft:stone", price: 25 },
      { label: "煤炭", typeId: "minecraft:coal", price: 50 },
      { label: "铜锭", typeId: "minecraft:copper_ingot", price: 100 },
      { label: "铁锭", typeId: "minecraft:iron_ingot", price: 400 },
      { label: "金锭", typeId: "minecraft:gold_ingot", price: 400 },
      { label: "钻石", typeId: "minecraft:diamond", price: 6400 },
      { label: "绿宝石", typeId: "minecraft:emerald", price: 3200 },
      { label: "下界残骸", typeId: "minecraft:ancient_debris", price: 12800 },
      { label: "红石", typeId: "minecraft:redstone", price: 200 },
      { label: "青金石", typeId: "minecraft:lapis_lazuli", price: 200 },
      { label: "紫水晶碎片", typeId: "minecraft:amethyst_shard", price: 400 },
    ],
  },
  农产: {
    icon: "✿",
    items: [
      { label: "仙人掌", typeId: "minecraft:cactus", price: 50 },
      { label: "甘蔗", typeId: "minecraft:sugar_cane", price: 50 },
      { label: "土豆", typeId: "minecraft:potato", price: 50 },
      { label: "胡萝卜", typeId: "minecraft:carrot", price: 50 },
      { label: "西瓜", typeId: "minecraft:melon_block", price: 200 },
      { label: "南瓜", typeId: "minecraft:pumpkin", price: 200 },
      { label: "小麦", typeId: "minecraft:wheat", price: 50 },
      { label: "甜菜根", typeId: "minecraft:beetroot", price: 50 },
      { label: "竹子", typeId: "minecraft:bamboo", price: 50 },
      { label: "海带", typeId: "minecraft:kelp", price: 50 },
      { label: "紫颂果", typeId: "minecraft:chorus_fruit", price: 200 },
    ],
  },
  牧产: {
    icon: "Θ",
    items: [
      { label: "兔子皮", typeId: "minecraft:rabbit_hide", price: 100 },
      { label: "兔子脚", typeId: "minecraft:rabbit_foot", price: 800 },
      { label: "生兔肉", typeId: "minecraft:rabbit", price: 100 },
      { label: "生鸡肉", typeId: "minecraft:chicken", price: 100 },
      { label: "生羊肉", typeId: "minecraft:mutton", price: 100 },
      { label: "生牛肉", typeId: "minecraft:beef", price: 100 },
      { label: "生猪肉", typeId: "minecraft:porkchop", price: 100 },
      { label: "皮革", typeId: "minecraft:leather", price: 100 },
      { label: "鸡蛋", typeId: "minecraft:egg", price: 100 },
      { label: "羽毛", typeId: "minecraft:feather", price: 100 },
      { label: "海龟鳞甲", typeId: "minecraft:turtle_scute", price: 1600 },
      { label: "犰狳鳞甲", typeId: "minecraft:armadillo_scute", price: 800 },
    ],
  },
};

// --- 阶梯降价：原价窗口 16万 → 每次降价窗口 8万/4万/2万/1万 → 归零 ---
// 每档单价 = 基础价 × 对应系数（默认每次减半）
// 档位由 config 的 RECYCLE_WINDOW 推导（数值与原硬编码完全一致，只是不再重复写死）：
// 窗口宽度依次减半 → 累计偏移 = W·(1 - 1/2^k)，即 1.5W / 1.75W / 1.875W / 1.9375W；
// 最后一档等于 RECYCLE_DAILY_CAP（160000 × 1.9375 = 310000），达到即归零。
const RECYCLE_PRICE_STEPS = [
  { at: RECYCLE_WINDOW, factor: 1 },
  { at: RECYCLE_WINDOW * 1.5, factor: 0.5 },
  { at: RECYCLE_WINDOW * 1.75, factor: 0.25 },
  { at: RECYCLE_WINDOW * 1.875, factor: 0.125 },
  { at: RECYCLE_WINDOW * 1.9375, factor: 0.0625 },
];

// --- 回收动态定价：按个人当日累计回收金额边际递减 ---
function getTodayStr() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function getRecycleCum(player, typeId) {
  try {
    const raw = world.getDynamicProperty(RECYCLE_CUM_PREFIX + player.id);
    if (!raw) return 0;
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data.date !== getTodayStr()) return 0;
    return data.gold?.[typeId] ?? 0;
  } catch (e) {
    return 0;
  }
}

function addRecycleCum(player, typeId, amount) {
  try {
    const today = getTodayStr();
    const raw = world.getDynamicProperty(RECYCLE_CUM_PREFIX + player.id);
    let data = null;
    if (raw && typeof raw === "string") {
      try {
        data = JSON.parse(raw);
      } catch (e) {}
    }
    if (!data || data.date !== today) {
      data = { date: today, gold: {} };
    }
    data.gold[typeId] = (data.gold[typeId] ?? 0) + amount;
    world.setDynamicProperty(
      RECYCLE_CUM_PREFIX + player.id,
      JSON.stringify(data)
    );
  } catch (e) {}
}

function getRecyclePrice(basePrice, cumAmount) {
  for (const step of RECYCLE_PRICE_STEPS) {
    if (cumAmount < step.at) {
      return Math.floor(basePrice * step.factor);
    }
  }
  return 0;
}

function getRecyclePriceInfo(basePrice, cumAmount) {
  const price = getRecyclePrice(basePrice, cumAmount);
  const atFloor = price <= 0;
  let nextAmount = null;
  let nextPrice = null;
  if (!atFloor) {
    for (const step of RECYCLE_PRICE_STEPS) {
      if (step.at > cumAmount) {
        nextAmount = step.at;
        nextPrice = getRecyclePrice(basePrice, step.at);
        break;
      }
    }
  }
  return { price, cumAmount, nextAmount, nextPrice, atFloor };
}

// --- 二级菜单：回收类别 ---
function showRecycleCategoryMenu(player, backFn) {
  const goldLabel = `§6当前金币: ${getPlayerMoney(player)}`;
  const form = new CustomForm(player, "回收类别").label(goldLabel).spacer();

  for (const [catName, catData] of Object.entries(RECYCLE_CATEGORIES)) {
    const itemCount = catData.items.length;
    form.button(`${catData.icon}${catName} (${itemCount}种)`, () => {
      form.close();
      system.runTimeout(() => showRecycleCategory(player, catName, catData, backFn), 2);
    });
    form.spacer();
  }

  form.button("返回", () => {
    form.close();
    system.runTimeout(() => backFn(player), 2);
  });
  form.show().then((r) => notifyIfBusy(r, player)).catch((e) => console.warn("Form show failed:", e));
}

// --- 三级菜单：类别物品回收 ---
function showRecycleCategory(player, catName, catData, backFn) {
  const items = catData.items;
  const quantity = new ObservableNumber(1, { clientWritable: true });
  const selectedIdx = new ObservableNumber(0, { clientWritable: true });
  const goldLabel = new ObservableString(`§6当前金币: ${getPlayerMoney(player)}`);
  const item0 = items[0];
  const countLabel = new ObservableString(`§7背包: ${countItem(player, item0.typeId)} 个`);
  const priceInfo0 = getRecyclePriceInfo(item0.price, getRecycleCum(player, item0.typeId));
  const priceLabel = new ObservableString(
    `§e当前单价: ${priceInfo0.price} 金币/个  §8(今日已回收 ${priceInfo0.cumAmount}/${RECYCLE_DAILY_CAP} 金币)`
  );

  selectedIdx.subscribe((idx) => {
    const item = items[idx];
    const owned = countItem(player, item.typeId);
    countLabel.setData(`§7背包: ${owned} 个`);
    const info = getRecyclePriceInfo(item.price, getRecycleCum(player, item.typeId));
    let priceText = `§e当前单价: ${info.price} 金币/个  §8(今日已回收 ${info.cumAmount}/${RECYCLE_DAILY_CAP} 金币)`;
    if (info.atFloor) {
      priceText += "  §8已跌至谷底，今日不再回收";
    } else {
      if (info.nextAmount !== null) {
        priceText += `  §8再回收约 ${info.nextAmount - info.cumAmount} 金币降至 ${info.nextPrice} 金币`;
      }
    }
    priceLabel.setData(priceText);
  });

  const dropdownItems = items.map((item, i) => ({
    label: `${item.label} - 基础价 ${item.price}金币/个`,
    value: i,
  }));

  const form = new CustomForm(player, `${catData.icon}${catName}`)
    .label(goldLabel)
    .spacer()
    .label(countLabel)
    .spacer()
    .label(priceLabel)
    .spacer()
    .slider("回收数量", quantity, new ObservableNumber(1), new ObservableNumber(64))
    .spacer()
    .dropdown("选择物品", selectedIdx, dropdownItems)
    .spacer()
    .button("回收", () => {
      const idx = validIndex(selectedIdx.getData(), items.length);
      if (idx === undefined) {
        player.sendMessage("§c选择无效，请重试");
        return;
      }
      const qty = quantity.getData();
      const item = items[idx];
      const owned = countItem(player, item.typeId);

      if (owned < qty) {
        player.sendMessage(`§c${item.label.split(" -")[0]}不足！需要 ${qty} 个，当前只有 ${owned} 个`);
        player.playSound("random.break");
        return;
      }

      const cum = getRecycleCum(player, item.typeId);
      const price = getRecyclePrice(item.price, cum);
      if (price <= 0) {
        player.sendMessage(`§c${item.label.split(" -")[0]} 今日已跌至谷底，无法回收`);
        player.playSound("random.break");
        return;
      }

      // 当日额度夹取：整批按"交易前档位"结算会被大批量回收绕过上限
      // （旧写法 64 个下界残骸一次可拿 819,200，而上限是 310,000）
      const remainingQuota = Math.max(0, RECYCLE_DAILY_CAP - cum);
      const reward = Math.min(price * qty, remainingQuota);
      if (reward <= 0) {
        player.sendMessage(`§c${item.label.split(" -")[0]} 今日回收额度已用完`);
        player.playSound("random.break");
        return;
      }

      removeItems(player, item.typeId, qty);
      try {
        const res = player.runCommand(
          `scoreboard players add @s money ${Math.round(reward)}`
        );
        if ((res?.successCount ?? 0) < 1) {
          console.error(
            `[Recycle] 收益发放未生效：${reward} → ${player.name ?? player.id}，物品已扣除，请人工核对`
          );
          player.sendMessage("§c收益发放异常，请联系管理员核对");
        }
      } catch (e) {
        console.error(`[Recycle] 收益发放抛错：${e}`);
      }
      addRecycleCum(player, item.typeId, reward);

      goldLabel.setData(`§6当前金币: ${getPlayerMoney(player)}`);
      const newOwned = countItem(player, item.typeId);
      countLabel.setData(`§7背包: ${newOwned} 个`);
      const info = getRecyclePriceInfo(item.price, getRecycleCum(player, item.typeId));
      let priceText = `§e当前单价: ${info.price} 金币/个  §8(今日已回收 ${info.cumAmount}/${RECYCLE_DAILY_CAP} 金币)`;
      if (info.atFloor) {
        priceText += "  §8已跌至谷底，今日不再回收";
      } else {
        if (info.nextAmount !== null) {
          priceText += `  §8再回收约 ${info.nextAmount - info.cumAmount} 金币降至 ${info.nextPrice} 金币`;
        }
      }
      priceLabel.setData(priceText);

      player.sendMessage(`§a回收成功！${item.label} x${qty}，获得 ${reward} 金币`);
      player.playSound("random.orb");
    })
    .spacer()
    .button("返回", () => {
      form.close();
      system.runTimeout(() => showRecycleCategoryMenu(player, backFn), 2);
    });
  form.show().then((r) => notifyIfBusy(r, player)).catch((e) => console.warn("Form show failed:", e));
}

export { showRecycleCategoryMenu };
