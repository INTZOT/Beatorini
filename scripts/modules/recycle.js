import { system } from "@minecraft/server";
import { CustomForm, ObservableString, ObservableNumber } from "@minecraft/server-ui";
import { countItem, removeItems } from "../lib/inventory.js";
import { getPlayerMoney } from "./money.js";

// --- 回收物品分类 ---
const RECYCLE_CATEGORIES = {
  矿产: {
    icon: "❑",
    items: [
      { label: "圆石 - 1金币/个", typeId: "minecraft:cobblestone", price: 1 },
      { label: "石头 - 1金币/个", typeId: "minecraft:stone", price: 1 },
      { label: "煤炭 - 10金币/个", typeId: "minecraft:coal", price: 10 },
      { label: "钻石 - 500金币/个", typeId: "minecraft:diamond", price: 500 },
      { label: "下界合金锭 - 5000金币/个", typeId: "minecraft:netherite_ingot", price: 5000 },
    ],
  },
  怪物掉落: {
    icon: "❤",
    items: [
      { label: "腐肉 - 2金币/个", typeId: "minecraft:rotten_flesh", price: 2 },
      { label: "骨头 - 2金币/个", typeId: "minecraft:bone", price: 2 },
      { label: "箭 - 2金币/个", typeId: "minecraft:arrow", price: 2 },
      { label: "蜘蛛眼 - 2金币/个", typeId: "minecraft:spider_eye", price: 2 },
      { label: "线 - 2金币/个", typeId: "minecraft:string", price: 2 },
      { label: "火药 - 2金币/个", typeId: "minecraft:gunpowder", price: 2 },
      { label: "粘液球 - 2金币/个", typeId: "minecraft:slime_ball", price: 2 },
    ],
  },
  牧产: {
    icon: "Θ",
    items: [
      { label: "牛排 - 5金币/个", typeId: "minecraft:cooked_beef", price: 5 },
      { label: "熟猪排 - 5金币/个", typeId: "minecraft:cooked_porkchop", price: 5 },
      { label: "熟羊肉 - 3金币/个", typeId: "minecraft:cooked_mutton", price: 3 },
      { label: "熟鸡 - 3金币/个", typeId: "minecraft:cooked_chicken", price: 3 },
      { label: "白色羊毛 - 2金币/个", typeId: "minecraft:white_wool", price: 2 },
      { label: "皮革 - 2金币/个", typeId: "minecraft:leather", price: 2 },
      { label: "羽毛 - 2金币/个", typeId: "minecraft:feather", price: 2 },
      { label: "鸡蛋 - 2金币/个", typeId: "minecraft:egg", price: 2 },
    ],
  },
  农产: {
    icon: "✿",
    items: [
      { label: "木炭 - 5金币/个", typeId: "minecraft:charcoal", price: 5 },
      { label: "土豆 - 2金币/个", typeId: "minecraft:potato", price: 2 },
      { label: "胡萝卜 - 2金币/个", typeId: "minecraft:carrot", price: 2 },
      { label: "小麦 - 5金币/个", typeId: "minecraft:wheat", price: 5 },
      { label: "甜菜根 - 5金币/个", typeId: "minecraft:beetroot", price: 5 },
      { label: "苹果 - 3金币/个", typeId: "minecraft:apple", price: 3 },
      { label: "甘蔗 - 2金币/个", typeId: "minecraft:sugar_cane", price: 2 },
      { label: "西瓜 - 10金币/个", typeId: "minecraft:melon_block", price: 10 },
      { label: "南瓜 - 10金币/个", typeId: "minecraft:pumpkin", price: 10 },
    ],
  },
  渔产: {
    icon: "⚓",
    items: [
      { label: "生鳕鱼 - 2金币/个", typeId: "minecraft:cod", price: 2 },
      { label: "生鲑鱼 - 3金币/个", typeId: "minecraft:salmon", price: 3 },
      { label: "热带鱼 - 10金币/个", typeId: "minecraft:tropical_fish", price: 10 },
      { label: "河豚 - 10金币/个", typeId: "minecraft:pufferfish", price: 10 },
      { label: "鹦鹉螺壳 - 10金币/个", typeId: "minecraft:nautilus_shell", price: 10 },
      { label: "墨囊 - 3金币/个", typeId: "minecraft:ink_sac", price: 3 },
      { label: "荧光墨囊 - 3金币/个", typeId: "minecraft:glow_ink_sac", price: 3 },
    ],
  },
};

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
  const countLabel = new ObservableString(`§7背包: ${countItem(player, items[0].typeId)} 个`);

  selectedIdx.subscribe((idx) => {
    const item = items[idx];
    const owned = countItem(player, item.typeId);
    countLabel.setData(`§7背包: ${owned} 个`);
  });

  const dropdownItems = items.map((item, i) => ({
    label: item.label,
    value: i,
  }));

  const form = new CustomForm(player, `${catData.icon}${catName}`)
    .label(goldLabel)
    .spacer()
    .label(countLabel)
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

      removeItems(player, item.typeId, qty);
      const reward = item.price * qty;
      player.runCommand(`scoreboard players add @s money ${reward}`);

      goldLabel.setData(`§6当前金币: ${getPlayerMoney(player)}`);
      const newOwned = countItem(player, item.typeId);
      countLabel.setData(`§7背包: ${newOwned} 个`);

      player.sendMessage(`§a回收成功！${item.label.split(" -")[0]} x${qty}，获得 ${reward} 金币`);
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
