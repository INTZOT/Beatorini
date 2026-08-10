import { world, system } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";
import {
  TITLE_PREFIX,
  DEFAULT_TITLE,
  STATS_PLAYTIME_PREFIX,
  STATS_KILLS_PREFIX,
  STATS_MINED_PREFIX,
  STATS_PLACED_PREFIX,
  STATS_DEATHS_PREFIX,
  STATS_LOTTERY_PREFIX,
  PLAYER_SIGNIN_STREAK,
  MARKET_SOLD_PREFIX,
} from "./config.js";
import { getPlayerBoundIndex } from "./island.js";
import { getStat } from "./stats.js";
import { getAchievements } from "./achievements.js";
import { getTalentLevel } from "./talent.js";
import { getPlayerMoney } from "./money.js";

// --- 称号目录 ---
// id: 存储标识；name: 称号名；color: 颜色代码；desc: 解锁说明
// owned(player): 解锁判定（true 表示默认拥有）
export const TITLES = [
  {
    id: "newbie",
    name: "萌新",
    color: "§7",
    desc: "人人皆从萌新开始（初始称号）",
    owned: () => true,
  },
  {
    id: "pioneer",
    name: "空岛开拓者",
    color: "§a",
    desc: "创建属于自己的空岛",
    owned: (p) => getPlayerBoundIndex(p.id) !== undefined,
  },
  {
    id: "builder",
    name: "建筑大师",
    color: "§e",
    desc: "累计放置方块达到 5000 个",
    owned: (p) => getStat(p.id, STATS_PLACED_PREFIX) >= 5000,
  },
  {
    id: "miner",
    name: "挖掘机",
    color: "§7",
    desc: "累计挖掘方块达到 5000 个",
    owned: (p) => getStat(p.id, STATS_MINED_PREFIX) >= 5000,
  },
  {
    id: "hunter",
    name: "怪物猎人",
    color: "§c",
    desc: "累计击杀达到 100 次",
    owned: (p) => getStat(p.id, STATS_KILLS_PREFIX) >= 100,
  },
  {
    id: "phoenix",
    name: "凤凰涅槃",
    color: "§d",
    desc: "累计死亡达到 100 次（致敬）",
    owned: (p) => getStat(p.id, STATS_DEATHS_PREFIX) >= 100,
  },
  {
    id: "veteran",
    name: "老玩家",
    color: "§9",
    desc: "在线时长累计达到 24 小时",
    owned: (p) => getStat(p.id, STATS_PLAYTIME_PREFIX) >= 86400,
  },
  {
    id: "rich",
    name: "富甲一方",
    color: "§6",
    desc: "持有金币达到 100 万",
    owned: (p) => getPlayerMoney(p) >= 1000000,
  },
  {
    id: "tycoon",
    name: "市场大亨",
    color: "§b",
    desc: "市场累计售出 100 件商品",
    owned: (p) =>
      (world.getDynamicProperty(MARKET_SOLD_PREFIX + p.id) ?? 0) >= 100,
  },
  {
    id: "lucky",
    name: "抽奖狂魔",
    color: "§5",
    desc: "累计抽奖达到 50 次",
    owned: (p) => getStat(p.id, STATS_LOTTERY_PREFIX) >= 50,
  },
  {
    id: "achiever",
    name: "成就猎人",
    color: "§2",
    desc: "解锁 30 个成就",
    owned: (p) => getAchievements(p.id).length >= 30,
  },
  {
    id: "signer",
    name: "签到达人",
    color: "§e",
    desc: "连续签到达到 7 天",
    owned: (p) =>
      (world.getDynamicProperty(PLAYER_SIGNIN_STREAK + p.id) ?? 0) >= 7,
  },
  {
    id: "talent_master",
    name: "天赋大师",
    color: "§3",
    desc: "任意天赋达到 100 级",
    owned: (p) =>
      ["speed", "haste", "strength", "jump", "resistance", "health"].some(
        (tid) => getTalentLevel(p.id, tid) >= 100
      ),
  },
  {
    id: "nether",
    name: "下界来客",
    color: "§4",
    desc: "解锁成就「下界来客」（获得石英）",
    owned: (p) => getAchievements(p.id).includes("minecraft:quartz"),
  },
];

/** 读取当前佩戴的称号显示文本（兼容旧版管理员直接设置的原始文本） */
export function getPlayerTitle(playerId) {
  const raw = world.getDynamicProperty(TITLE_PREFIX + playerId) || "";
  const t = TITLES.find((x) => x.id === raw);
  if (t) return `${t.color}【${t.name}】`;
  return raw || DEFAULT_TITLE;
}

/** 管理员直接设置自定义称号文本 */
export function setPlayerTitle(playerId, title) {
  world.setDynamicProperty(TITLE_PREFIX + playerId, title);
}

/** 玩家佩戴/卸下称号（存称号 id，空值卸下） */
export function setWornTitle(playerId, titleId) {
  if (titleId) {
    world.setDynamicProperty(TITLE_PREFIX + playerId, titleId);
  } else {
    world.setDynamicProperty(TITLE_PREFIX + playerId, undefined);
  }
}

/**
 * 处理 #title 命令
 * @param {import("@minecraft/server").Player} player — 执行者（需有 op tag）
 * @param {string} message — 完整消息 "#title @<玩家名> <称号>"
 */
export function handleTitleCommand(player, message) {
  if (!player.hasTag("op")) {
    player.sendMessage("§c你没有权限使用此命令！");
    return;
  }
  let input = message.slice(7).trim();
  if (input.startsWith("@")) input = input.slice(1);
  if (!input) {
    player.sendMessage("§c用法: #title @<玩家名> <称号>");
    return;
  }

  // 按名字长度降序排列，优先匹配长名
  const online = [...world.getPlayers()].sort(
    (a, b) => b.name.length - a.name.length
  );
  let target = null,
    title = "";
  const lowerInput = input.toLowerCase();
  for (const p of online) {
    const lowerName = p.name.toLowerCase();
    if (lowerInput.startsWith(lowerName)) {
      const after = input.slice(p.name.length);
      if (after === "" || after.startsWith(" ")) {
        target = p;
        title = after.trim();
        break;
      }
    }
  }

  if (!target) {
    player.sendMessage("§c找不到指定玩家，请检查玩家名是否正确");
    return;
  }
  if (!title) {
    player.sendMessage("§c用法: #title @<玩家名> <称号>");
    return;
  }

  setPlayerTitle(target.id, title);
  player.sendMessage(`§a已将 ${target.name} 的称号设置为: ${title}`);
  target.sendMessage(`§a你的称号已被管理员设置为: ${title}`);
}

// ============================================================
// 称号界面
// ============================================================

export function showTitleMenu(player, backFn) {
  const wornRaw = world.getDynamicProperty(TITLE_PREFIX + player.id) || "";
  const wornTitle = TITLES.find((x) => x.id === wornRaw);
  const wornText = wornTitle
    ? `${wornTitle.color}【${wornTitle.name}】`
    : wornRaw || DEFAULT_TITLE;

  let form = new CustomForm(player, "称号");
  form = form.label(`§e当前称号: ${wornText}`);
  form = form.spacer();
  form = form.button("卸下称号", () => {
    setWornTitle(player.id, "");
    player.sendMessage("§7已卸下称号，恢复默认");
    player.playSound("random.orb");
    form.close();
    system.runTimeout(() => showTitleMenu(player, backFn), 2);
  });
  form = form.spacer();

  for (const t of TITLES) {
    const owned = t.owned(player);
    const worn = t.id === wornRaw;
    const label = worn
      ? `§a✔ 佩戴中  ${t.color}【${t.name}】`
      : owned
        ? `${t.color}【${t.name}】  §7- ${t.desc}`
        : `§8🔒 ${t.name}  §7- ${t.desc}`;
    form = form.button(
      label,
      () => {
        setWornTitle(player.id, t.id);
        player.sendMessage(`§a已佩戴称号: ${t.color}【${t.name}】`);
        player.playSound("random.orb");
        form.close();
        system.runTimeout(() => showTitleMenu(player, backFn), 2);
      },
      { disabled: !owned }
    );
  }

  form = form.spacer();
  form = form.button("返回", () => {
    form.close();
    system.runTimeout(() => backFn(player), 2);
  });

  form.show().catch((e) => console.warn("Form show failed:", e));
}
