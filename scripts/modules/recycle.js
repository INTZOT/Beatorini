import { system, world } from "@minecraft/server";
import { CustomForm, ObservableString, ObservableNumber } from "@minecraft/server-ui";
import { countItem, removeItems } from "../lib/inventory.js";
import { getPlayerMoney } from "./money.js";
import {
  RECYCLE_WINDOW,
  RECYCLE_TAIL,
  RECYCLE_DAILY_CAP,
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
      { label: "末影珍珠", typeId: "minecraft:ender_pearl", price: 300 },
      { label: "粘液球", typeId: "minecraft:slime_ball", price: 100 },
      { label: "幻翼膜", typeId: "minecraft:phantom_membrane", price: 250 },
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
      { label: "铁锭", typeId: "minecraft:iron_ingot", price: 150 },
      { label: "金锭", typeId: "minecraft:gold_ingot", price: 200 },
      { label: "钻石", typeId: "minecraft:diamond", price: 600 },
      { label: "绿宝石", typeId: "minecraft:emerald", price: 500 },
      { label: "下界残骸", typeId: "minecraft:ancient_debris", price: 1200 },
      { label: "红石", typeId: "minecraft:redstone_dust", price: 150 },
      { label: "青金石", typeId: "minecraft:lapis_lazuli", price: 150 },
      { label: "紫水晶碎片", typeId: "minecraft:amethyst_shard", price: 200 },
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
      { label: "紫颂果", typeId: "minecraft:chorus_fruit", price: 150 },
    ],
  },
  牧产: {
    icon: "Θ",
    items: [
      { label: "兔子皮", typeId: "minecraft:rabbit_hide", price: 100 },
      { label: "兔子脚", typeId: "minecraft:rabbit_foot", price: 250 },
      { label: "生兔肉", typeId: "minecraft:rabbit", price: 100 },
      { label: "生鸡肉", typeId: "minecraft:chicken", price: 100 },
      { label: "生羊肉", typeId: "minecraft:mutton", price: 100 },
      { label: "生牛肉", typeId: "minecraft:beef", price: 100 },
      { label: "生猪肉", typeId: "minecraft:porkchop", price: 100 },
      { label: "皮革", typeId: "minecraft:leather", price: 100 },
      { label: "鸡蛋", typeId: "minecraft:egg", price: 100 },
      { label: "羽毛", typeId: "minecraft:feather", price: 100 },
      { label: "海龟鳞甲", typeId: "minecraft:scute", price: 300 },
      { label: "犰狳鳞甲", typeId: "minecraft:armadillo_scute", price: 250 },
    ],
  },
};

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
  // 原价窗口内保持基础价；超出后按指数陡降，价格归零前最多再赚 RECYCLE_TAIL
  if (cumAmount >= RECYCLE_DAILY_CAP) return 0;
  if (cumAmount < RECYCLE_WINDOW) return basePrice;
  const K = RECYCLE_TAIL / Math.log(basePrice);
  return Math.floor(basePrice * Math.exp(-(cumAmount - RECYCLE_WINDOW) / K));
}

function getRecyclePriceInfo(basePrice, cumAmount) {
  const price = getRecyclePrice(basePrice, cumAmount);
  const atFloor = price <= 0;
  let nextAmount = null;
  let nextPrice = null;
  if (!atFloor) {
    if (cumAmount < RECYCLE_WINDOW) {
      nextAmount = RECYCLE_WINDOW + 1;
    } else {
      for (let t = cumAmount + 1; t <= RECYCLE_DAILY_CAP; t++) {
        if (getRecyclePrice(basePrice, t) < price) {
          nextAmount = t;
          break;
        }
      }
    }
    if (nextAmount !== null) {
      nextPrice = getRecyclePrice(basePrice, nextAmount);
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
  form.show().catch((e) => console.warn("Form show failed:", e));
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
      const idx = selectedIdx.getData();
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

      removeItems(player, item.typeId, qty);
      const reward = price * qty;
      player.runCommand(`scoreboard players add @s money ${reward}`);
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
  form.show().catch((e) => console.warn("Form show failed:", e));
}

export { showRecycleCategoryMenu };
