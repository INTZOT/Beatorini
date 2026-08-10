import { world, system, TextPrimitive } from "@minecraft/server";
import { CustomForm, ObservableNumber } from "@minecraft/server-ui";
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
  RECYCLE_DAILY_CAP,
  RECYCLE_CAP_FLAG_PREFIX,
} from "./config.js";
import { getStat } from "./stats.js";
import { getAchievements } from "./achievements.js";
import { getTalentLevel } from "./talent.js";
import { getPlayerMoney } from "./money.js";

// --- 里程碑阈值（可按需调整） ---
const MILESTONE = {
  PLAY_HOURS: 100, // 累计在线 100 小时
  SIGNIN_DAYS: 7, // 连续签到 7 天
  PLACE_COUNT: 10000, // 累计放置 10000 方块
  MINE_COUNT: 10000, // 累计挖掘 10000 方块
  KILL_COUNT: 100, // 累计击杀 100
  DEATH_COUNT: 50, // 累计死亡 50（致敬）
  MONEY: 1000000, // 持有金币 100 万（百万富翁）
  MONEY_TEN: 10000000, // 持有金币 1000 万（千万富翁）
  MONEY_HUNDRED: 100000000, // 持有金币 1 亿（亿万富翁）
  ACHIEVE_COUNT: 30, // 解锁 30 个成就
  TALENT_LEVEL: 100, // 任意天赋 100 级
  LOTTERY_COUNT: 50, // 累计抽奖 50 次
};

// --- 称号目录 ---
// id: 存储标识；name: 称号名；color: 颜色代码；desc: 解锁说明
// owned(player): 是否已解锁；progress(player): 0~1 进度（可选）
export const TITLES = [
  {
    id: "newbie",
    name: "萌新",
    color: "§7",
    desc: "人人皆从萌新开始（初始称号）",
    owned: () => true,
  },
  {
    id: "veteran",
    name: "老资历",
    color: "§9",
    desc: `累计在线达到 ${MILESTONE.PLAY_HOURS} 小时`,
    owned: (p) => getStat(p.id, STATS_PLAYTIME_PREFIX) >= MILESTONE.PLAY_HOURS * 3600,
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_PLAYTIME_PREFIX) / (MILESTONE.PLAY_HOURS * 3600)),
  },
  {
    id: "signer",
    name: "打卡机",
    color: "§e",
    desc: `连续签到达到 ${MILESTONE.SIGNIN_DAYS} 天`,
    owned: (p) =>
      (world.getDynamicProperty(PLAYER_SIGNIN_STREAK + p.id) ?? 0) >=
      MILESTONE.SIGNIN_DAYS,
    progress: (p) =>
      Math.min(
        1,
        (world.getDynamicProperty(PLAYER_SIGNIN_STREAK + p.id) ?? 0) /
          MILESTONE.SIGNIN_DAYS
      ),
  },
  {
    id: "builder",
    name: "建筑大师",
    color: "§e",
    desc: `累计放置方块达到 ${MILESTONE.PLACE_COUNT} 个`,
    owned: (p) => getStat(p.id, STATS_PLACED_PREFIX) >= MILESTONE.PLACE_COUNT,
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_PLACED_PREFIX) / MILESTONE.PLACE_COUNT),
  },
  {
    id: "miner",
    name: "挖掘机",
    color: "§7",
    desc: `累计挖掘方块达到 ${MILESTONE.MINE_COUNT} 个`,
    owned: (p) => getStat(p.id, STATS_MINED_PREFIX) >= MILESTONE.MINE_COUNT,
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_MINED_PREFIX) / MILESTONE.MINE_COUNT),
  },
  {
    id: "hunter",
    name: "怪物猎人",
    color: "§c",
    desc: `累计击杀达到 ${MILESTONE.KILL_COUNT} 次`,
    owned: (p) => getStat(p.id, STATS_KILLS_PREFIX) >= MILESTONE.KILL_COUNT,
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_KILLS_PREFIX) / MILESTONE.KILL_COUNT),
  },
  {
    id: "phoenix",
    name: "菜月昴",
    color: "§d",
    desc: `累计死亡达到 ${MILESTONE.DEATH_COUNT} 次（致敬）`,
    owned: (p) => getStat(p.id, STATS_DEATHS_PREFIX) >= MILESTONE.DEATH_COUNT,
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_DEATHS_PREFIX) / MILESTONE.DEATH_COUNT),
  },
  {
    id: "rich",
    name: "百万富翁",
    color: "§6",
    series: "money",
    tier: 1,
    desc: `持有金币达到 ${MILESTONE.MONEY.toLocaleString("zh-CN")} 金币`,
    owned: (p) => getPlayerMoney(p) >= MILESTONE.MONEY,
    progress: (p) => Math.min(1, getPlayerMoney(p) / MILESTONE.MONEY),
  },
  {
    id: "rich2",
    name: "千万富翁",
    color: "§e",
    series: "money",
    tier: 2,
    desc: `持有金币达到 ${MILESTONE.MONEY_TEN.toLocaleString("zh-CN")} 金币`,
    owned: (p) => getPlayerMoney(p) >= MILESTONE.MONEY_TEN,
    progress: (p) => Math.min(1, getPlayerMoney(p) / MILESTONE.MONEY_TEN),
  },
  {
    id: "rich3",
    name: "亿万富翁",
    color: "§5",
    series: "money",
    tier: 3,
    desc: `持有金币达到 ${MILESTONE.MONEY_HUNDRED.toLocaleString("zh-CN")} 金币`,
    owned: (p) => getPlayerMoney(p) >= MILESTONE.MONEY_HUNDRED,
    progress: (p) => Math.min(1, getPlayerMoney(p) / MILESTONE.MONEY_HUNDRED),
  },
  {
    id: "tycoon",
    name: "垄断者",
    color: "§b",
    desc: `将单件物品卖至 ${RECYCLE_DAILY_CAP.toLocaleString("zh-CN")} 金币上限`,
    owned: (p) => world.getDynamicProperty(RECYCLE_CAP_FLAG_PREFIX + p.id) === true,
    progress: (p) =>
      world.getDynamicProperty(RECYCLE_CAP_FLAG_PREFIX + p.id) === true ? 1 : 0,
  },
  {
    id: "lucky",
    name: "赌徒",
    color: "§5",
    desc: `累计抽奖达到 ${MILESTONE.LOTTERY_COUNT} 次`,
    owned: (p) => getStat(p.id, STATS_LOTTERY_PREFIX) >= MILESTONE.LOTTERY_COUNT,
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_LOTTERY_PREFIX) / MILESTONE.LOTTERY_COUNT),
  },
  {
    id: "achiever",
    name: "成就猎人",
    color: "§2",
    desc: `解锁 ${MILESTONE.ACHIEVE_COUNT} 个成就`,
    owned: (p) => getAchievements(p.id).length >= MILESTONE.ACHIEVE_COUNT,
    progress: (p) =>
      Math.min(1, getAchievements(p.id).length / MILESTONE.ACHIEVE_COUNT),
  },
  {
    id: "talent_master",
    name: "天赋哥",
    color: "§3",
    desc: `任意天赋达到 ${MILESTONE.TALENT_LEVEL} 级`,
    owned: (p) =>
      ["speed", "haste", "strength", "jump", "resistance", "health"].some(
        (tid) => getTalentLevel(p.id, tid) >= MILESTONE.TALENT_LEVEL
      ),
    progress: (p) => {
      const maxLv = Math.max(
        ...["speed", "haste", "strength", "jump", "resistance", "health"].map(
          (tid) => getTalentLevel(p.id, tid)
        )
      );
      return Math.min(1, maxLv / MILESTONE.TALENT_LEVEL);
    },
  },
];

// --- 头顶称号（TextPrimitive） ---
const titleShapes = new Map();
const TITLE_OFFSET_Y = 2.2;
const DEFAULT_SHAPE_COLOR = { red: 1, green: 1, blue: 1, alpha: 1 };
const COLOR_MAP = {
  "0": { red: 0, green: 0, blue: 0, alpha: 1 },
  "1": { red: 0, green: 0, blue: 1, alpha: 1 },
  "2": { red: 0, green: 1, blue: 0, alpha: 1 },
  "3": { red: 0, green: 1, blue: 1, alpha: 1 },
  "4": { red: 1, green: 0, blue: 0, alpha: 1 },
  "5": { red: 1, green: 0, blue: 1, alpha: 1 },
  "6": { red: 1, green: 1, blue: 0, alpha: 1 },
  "7": { red: 0.7, green: 0.7, blue: 0.7, alpha: 1 },
  "8": { red: 0.35, green: 0.35, blue: 0.35, alpha: 1 },
  "9": { red: 0.35, green: 0.35, blue: 1, alpha: 1 },
  a: { red: 0.55, green: 1, blue: 0.55, alpha: 1 },
  b: { red: 0.55, green: 0.85, blue: 1, alpha: 1 },
  c: { red: 1, green: 0.55, blue: 0.55, alpha: 1 },
  d: { red: 1, green: 0.55, blue: 1, alpha: 1 },
  e: { red: 1, green: 1, blue: 0.55, alpha: 1 },
  f: { red: 1, green: 1, blue: 1, alpha: 1 },
};

/** 头顶文字：仅目录称号显示【名】，无称号不显示 */
function getTitleShapeText(playerId) {
  const raw = world.getDynamicProperty(TITLE_PREFIX + playerId) || "";
  const t = TITLES.find((x) => x.id === raw);
  return t ? `【${t.name}】` : "";
}

/** 取称号颜色：目录称号用配置色，否则白色 */
function getTitleShapeColor(playerId) {
  const raw = world.getDynamicProperty(TITLE_PREFIX + playerId) || "";
  const t = TITLES.find((x) => x.id === raw);
  if (t) return COLOR_MAP[t.color.charAt(1)] || DEFAULT_SHAPE_COLOR;
  return DEFAULT_SHAPE_COLOR;
}

function buildTitleShape(player) {
  const text = getTitleShapeText(player.id);
  if (!text) return;
  if (player.isSneaking) return; // 下蹲时不显示
  try {
    const shape = new TextPrimitive(
      { x: 0, y: TITLE_OFFSET_Y, z: 0 },
      text
    );
    shape.scale = 1;
    shape.color = getTitleShapeColor(player.id);
    shape.backgroundColorOverride = { red: 0, green: 0, blue: 0, alpha: 0.45 };
    shape.depthTest = false;
    shape.attachedTo = player;
    world.primitiveShapesManager.addText(shape, player.dimension);
    titleShapes.set(player.id, shape);
  } catch (e) {
    console.warn(`[Title] 头顶称号创建失败: ${e}`);
  }
}

/** 同步全服头顶称号：单人时不显示；多人时确保每人有称号且本人不可见 */
function refreshAllTitleShapes() {
  const players = [...world.getPlayers()];
  if (players.length <= 1) {
    // 单人时无法表达"对所有人不可见"（空列表=全服可见），直接全部移除
    for (const [id, shape] of [...titleShapes]) {
      try {
        world.primitiveShapesManager.removeText(shape);
      } catch (e) {}
      titleShapes.delete(id);
    }
    return;
  }
  // 确保所有在线玩家都有头顶称号（如刚超过单人阈值）
  for (const p of players) {
    if (!titleShapes.has(p.id)) buildTitleShape(p);
  }
  // 本人不可见，其余在线玩家可见
  for (const [ownerId, shape] of titleShapes) {
    try {
      shape.visibleTo = players.filter((p) => p.id !== ownerId);
    } catch (e) {}
  }
}

function removeTitleShape(playerId) {
  const shape = titleShapes.get(playerId);
  if (!shape) return;
  try {
    world.primitiveShapesManager.removeText(shape);
  } catch (e) {}
  titleShapes.delete(playerId);
}

/** 重建某玩家的头顶称号（无称号时清除） */
export function syncTitleShape(player) {
  if ([...world.getPlayers()].length <= 1) {
    removeTitleShape(player.id);
    return;
  }
  removeTitleShape(player.id);
  buildTitleShape(player);
}

function refreshOnlinePlayer(playerId) {
  const player = [...world.getPlayers()].find((p) => p.id === playerId);
  if (player) syncTitleShape(player);
}

/** 读取当前佩戴的称号显示文本（仅支持称号目录内的称号） */
export function getPlayerTitle(playerId) {
  const raw = world.getDynamicProperty(TITLE_PREFIX + playerId) || "";
  const t = TITLES.find((x) => x.id === raw);
  return t ? `${t.color}【${t.name}】§r` : `${DEFAULT_TITLE}§r`;
}

/** 玩家佩戴/卸下称号（存称号 id，空字符串卸下） */
export function setWornTitle(playerId, titleId) {
  world.setDynamicProperty(TITLE_PREFIX + playerId, titleId || "");
  refreshOnlinePlayer(playerId);
}

// ============================================================
// 称号界面（下拉选择）
// ============================================================

export function showTitleMenu(player, backFn) {
  const wornRaw = world.getDynamicProperty(TITLE_PREFIX + player.id) || "";
  const ownedTitles = TITLES.filter((t) => t.owned(player));

  const wornTitle = ownedTitles.find((x) => x.id === wornRaw);
  const wornText = wornTitle
    ? `${wornTitle.color}【${wornTitle.name}】§r`
    : `${DEFAULT_TITLE}§r`;

  const NO_TITLE_INDEX = ownedTitles.length; // 下拉末项：无称号
  const items = ownedTitles.map((t, i) => ({
    label: `${t.color}【${t.name}】`,
    value: i,
  }));
  items.push({ label: "无称号（默认）", value: NO_TITLE_INDEX });

  const wornIndex = wornTitle
    ? ownedTitles.findIndex((t) => t.id === wornTitle.id)
    : NO_TITLE_INDEX;
  const selected = new ObservableNumber(wornIndex, { clientWritable: true });

  let form = new CustomForm(player, "称号")
    .label(`§e当前称号: ${wornText}`)
    .spacer()
    .dropdown("选择称号", selected, items)
    .spacer()
    .button("保存", () => {
      const idx = selected.getData();
      const title =
        idx >= 0 && idx < ownedTitles.length ? ownedTitles[idx] : null;
      if (title) {
        setWornTitle(player.id, title.id);
        player.sendMessage(`§a已佩戴称号: ${title.color}【${title.name}】§r`);
      } else {
        setWornTitle(player.id, "");
        player.sendMessage("§7已卸下称号，恢复默认");
      }
      player.playSound("random.orb");
      form.close();
      system.runTimeout(() => showTitleMenu(player, backFn), 2);
    })
    .spacer();

  form = form
    .button("返回", () => {
      form.close();
      system.runTimeout(() => backFn(player), 2);
    });

  form.show().catch((e) => console.warn("Form show failed:", e));
}

/** 初始化：无有效称号（含旧版原始文本）的玩家自动佩戴「萌新」 */
export function init() {
  world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    if (!player) return;
    const raw = world.getDynamicProperty(TITLE_PREFIX + player.id);
    const valid = TITLES.some((t) => t.id === raw);
    if (raw === undefined || !valid) {
      setWornTitle(player.id, "newbie");
    } else {
      syncTitleShape(player);
    }
    refreshAllTitleShapes();
  });

  // 下线清理 / 换维重建 / reload 后为在线玩家重建
  world.afterEvents.playerLeave.subscribe((event) => {
    removeTitleShape(event.playerId);
    refreshAllTitleShapes();
  });
  world.afterEvents.playerDimensionChange.subscribe((event) => {
    if (titleShapes.has(event.player.id)) {
      syncTitleShape(event.player);
    }
  });
  // 下蹲隐藏 / 站起恢复
  world.afterEvents.entityStartSneaking.subscribe((event) => {
    if (event.entity.typeId !== "minecraft:player") return;
    removeTitleShape(event.entity.id);
  });
  world.afterEvents.entityStopSneaking.subscribe((event) => {
    if (event.entity.typeId !== "minecraft:player") return;
    syncTitleShape(event.entity);
  });
  world.afterEvents.worldLoad.subscribe(() => {
    system.runTimeout(() => {
      for (const p of world.getPlayers()) syncTitleShape(p);
      refreshAllTitleShapes();
    }, 10);
  });
}
