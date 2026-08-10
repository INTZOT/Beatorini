import { world, system, TextPrimitive } from "@minecraft/server";
import { CustomForm, ObservableNumber, ObservableString } from "@minecraft/server-ui";
import {
  TITLE_PREFIX,
  DEFAULT_TITLE,
  TITLE_NOTIFY_PREFIX,
  STATS_PLAYTIME_PREFIX,
  STATS_KILLS_PREFIX,
  STATS_MINED_PREFIX,
  STATS_PLACED_PREFIX,
  STATS_DEATHS_PREFIX,
  STATS_LOTTERY_PREFIX,
  PLAYER_SIGNIN_STREAK,
} from "./config.js";
import { getStat } from "./stats.js";
import { getAchievements } from "./achievements.js";
import { getTalentLevel } from "./talent.js";
import { getPlayerMoney } from "./money.js";

// --- 里程碑阈值（可按需调整，数组第 N 项对应第 N 档） ---
const MILESTONE = {
  PLAY_HOURS: [50, 100, 200], // 在线时长（小时）
  SIGNIN_DAYS: [3, 7, 30], // 连续签到（天）
  PLACE_COUNT: [10000, 100000, 1000000], // 累计放置方块
  MINE_COUNT: [10000, 100000, 1000000], // 累计挖掘方块
  KILL_COUNT: [1000, 10000, 100000], // 累计击杀
  DEATH_COUNT: [100, 1000, 10000], // 累计死亡
  MONEY: [1000000, 10000000, 100000000], // 持有金币
  LOTTERY_COUNT: [10, 100, 1000], // 累计抽奖次数
  ACHIEVE_COUNT: [10, 50, 100], // 解锁成就数（当前成就共 66 个，100 档暂不可达）
  TALENT_LEVEL: [60, 120], // 天赋等级（第三档要求全部满级）
};

// 各系列三档配色（系列专属，避免与初始称号同色）
const SERIES_TIER_COLORS = {
  playtime: ["§9", "§b", "§3"], // 蓝 / 天蓝 / 深青
  signin: ["§e", "§6", "§c"], // 黄 / 金 / 红
  placed: ["§a", "§2", "§e"], // 绿 / 深绿 / 黄
  mined: ["§8", "§7", "§6"], // 深灰 / 灰 / 金
  kills: ["§c", "§4", "§d"], // 红 / 深红 / 亮紫
  deaths: ["§5", "§d", "§c"], // 紫 / 亮紫 / 红
  money: ["§6", "§e", "§5"], // 金 / 黄 / 紫
  lottery: ["§5", "§d", "§b"], // 紫 / 亮紫 / 天蓝
  achieve: ["§2", "§a", "§b"], // 深绿 / 绿 / 天蓝
  talent: ["§3", "§9", "§d"], // 深青 / 蓝 / 亮紫
};
const TALENT_IDS = ["speed", "haste", "strength", "jump", "resistance", "health"];
const fmt = (n) => n.toLocaleString("zh-CN");

function hasAnyTalentLevel(player, level) {
  return TALENT_IDS.some((id) => getTalentLevel(player.id, id) >= level);
}
function hasAllTalentLevel(player, level) {
  return TALENT_IDS.every((id) => getTalentLevel(player.id, id) >= level);
}
function maxTalentLevel(player) {
  return Math.max(...TALENT_IDS.map((id) => getTalentLevel(player.id, id)));
}
// --- 称号目录（系列 + 三档） ---
// id: 存储标识；series: 系列；tier: 档位（1~3）
// owned(player): 是否已解锁；progress(player): 0~1 进度（可选）
export const TITLES = [
  {
    id: "newbie",
    name: "萌新",
    color: "§f",
    desc: "人人皆从萌新开始（初始称号）",
    owned: () => true,
  },
  // --- 在线时长系列 ---
  {
    id: "play1",
    name: "小资历",
    color: SERIES_TIER_COLORS.playtime[0],
    series: "playtime",
    tier: 1,
    desc: `累计在线达到 ${MILESTONE.PLAY_HOURS[0]} 小时`,
    owned: (p) => getStat(p.id, STATS_PLAYTIME_PREFIX) >= MILESTONE.PLAY_HOURS[0] * 3600,
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_PLAYTIME_PREFIX) / (MILESTONE.PLAY_HOURS[0] * 3600)),
  },
  {
    id: "play2",
    name: "老资历",
    color: SERIES_TIER_COLORS.playtime[1],
    series: "playtime",
    tier: 2,
    desc: `累计在线达到 ${MILESTONE.PLAY_HOURS[1]} 小时`,
    owned: (p) => getStat(p.id, STATS_PLAYTIME_PREFIX) >= MILESTONE.PLAY_HOURS[1] * 3600,
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_PLAYTIME_PREFIX) / (MILESTONE.PLAY_HOURS[1] * 3600)),
  },
  {
    id: "play3",
    name: "远古资历",
    color: SERIES_TIER_COLORS.playtime[2],
    series: "playtime",
    tier: 3,
    desc: `累计在线达到 ${MILESTONE.PLAY_HOURS[2]} 小时`,
    owned: (p) => getStat(p.id, STATS_PLAYTIME_PREFIX) >= MILESTONE.PLAY_HOURS[2] * 3600,
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_PLAYTIME_PREFIX) / (MILESTONE.PLAY_HOURS[2] * 3600)),
  },
  // --- 连续签到系列 ---
  {
    id: "sign1",
    name: "打卡王",
    color: SERIES_TIER_COLORS.signin[0],
    series: "signin",
    tier: 1,
    desc: `连续签到达到 ${MILESTONE.SIGNIN_DAYS[0]} 天`,
    owned: (p) =>
      (world.getDynamicProperty(PLAYER_SIGNIN_STREAK + p.id) ?? 0) >=
      MILESTONE.SIGNIN_DAYS[0],
    progress: (p) =>
      Math.min(
        1,
        (world.getDynamicProperty(PLAYER_SIGNIN_STREAK + p.id) ?? 0) /
          MILESTONE.SIGNIN_DAYS[0]
      ),
  },
  {
    id: "sign2",
    name: "打卡狂魔",
    color: SERIES_TIER_COLORS.signin[1],
    series: "signin",
    tier: 2,
    desc: `连续签到达到 ${MILESTONE.SIGNIN_DAYS[1]} 天`,
    owned: (p) =>
      (world.getDynamicProperty(PLAYER_SIGNIN_STREAK + p.id) ?? 0) >=
      MILESTONE.SIGNIN_DAYS[1],
    progress: (p) =>
      Math.min(
        1,
        (world.getDynamicProperty(PLAYER_SIGNIN_STREAK + p.id) ?? 0) /
          MILESTONE.SIGNIN_DAYS[1]
      ),
  },
  {
    id: "sign3",
    name: "全勤奖",
    color: SERIES_TIER_COLORS.signin[2],
    series: "signin",
    tier: 3,
    desc: `连续签到达到 ${MILESTONE.SIGNIN_DAYS[2]} 天`,
    owned: (p) =>
      (world.getDynamicProperty(PLAYER_SIGNIN_STREAK + p.id) ?? 0) >=
      MILESTONE.SIGNIN_DAYS[2],
    progress: (p) =>
      Math.min(
        1,
        (world.getDynamicProperty(PLAYER_SIGNIN_STREAK + p.id) ?? 0) /
          MILESTONE.SIGNIN_DAYS[2]
      ),
  },
  // --- 放置方块系列 ---
  {
    id: "place1",
    name: "建筑达人",
    color: SERIES_TIER_COLORS.placed[0],
    series: "placed",
    tier: 1,
    desc: `累计放置方块达到 ${fmt(MILESTONE.PLACE_COUNT[0])} 个`,
    owned: (p) => getStat(p.id, STATS_PLACED_PREFIX) >= MILESTONE.PLACE_COUNT[0],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_PLACED_PREFIX) / MILESTONE.PLACE_COUNT[0]),
  },
  {
    id: "place2",
    name: "建筑大师",
    color: SERIES_TIER_COLORS.placed[1],
    series: "placed",
    tier: 2,
    desc: `累计放置方块达到 ${fmt(MILESTONE.PLACE_COUNT[1])} 个`,
    owned: (p) => getStat(p.id, STATS_PLACED_PREFIX) >= MILESTONE.PLACE_COUNT[1],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_PLACED_PREFIX) / MILESTONE.PLACE_COUNT[1]),
  },
  {
    id: "place3",
    name: "基建狂魔",
    color: SERIES_TIER_COLORS.placed[2],
    series: "placed",
    tier: 3,
    desc: `累计放置方块达到 ${fmt(MILESTONE.PLACE_COUNT[2])} 个`,
    owned: (p) => getStat(p.id, STATS_PLACED_PREFIX) >= MILESTONE.PLACE_COUNT[2],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_PLACED_PREFIX) / MILESTONE.PLACE_COUNT[2]),
  },
  // --- 挖掘方块系列 ---
  {
    id: "mine1",
    name: "挖掘机",
    color: SERIES_TIER_COLORS.mined[0],
    series: "mined",
    tier: 1,
    desc: `累计挖掘方块达到 ${fmt(MILESTONE.MINE_COUNT[0])} 个`,
    owned: (p) => getStat(p.id, STATS_MINED_PREFIX) >= MILESTONE.MINE_COUNT[0],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_MINED_PREFIX) / MILESTONE.MINE_COUNT[0]),
  },
  {
    id: "mine2",
    name: "肝王",
    color: SERIES_TIER_COLORS.mined[1],
    series: "mined",
    tier: 2,
    desc: `累计挖掘方块达到 ${fmt(MILESTONE.MINE_COUNT[1])} 个`,
    owned: (p) => getStat(p.id, STATS_MINED_PREFIX) >= MILESTONE.MINE_COUNT[1],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_MINED_PREFIX) / MILESTONE.MINE_COUNT[1]),
  },
  {
    id: "mine3",
    name: "肝帝",
    color: SERIES_TIER_COLORS.mined[2],
    series: "mined",
    tier: 3,
    desc: `累计挖掘方块达到 ${fmt(MILESTONE.MINE_COUNT[2])} 个`,
    owned: (p) => getStat(p.id, STATS_MINED_PREFIX) >= MILESTONE.MINE_COUNT[2],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_MINED_PREFIX) / MILESTONE.MINE_COUNT[2]),
  },
  // --- 击杀系列 ---
  {
    id: "kill1",
    name: "怪物猎人",
    color: SERIES_TIER_COLORS.kills[0],
    series: "kills",
    tier: 1,
    desc: `累计击杀达到 ${fmt(MILESTONE.KILL_COUNT[0])} 次`,
    owned: (p) => getStat(p.id, STATS_KILLS_PREFIX) >= MILESTONE.KILL_COUNT[0],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_KILLS_PREFIX) / MILESTONE.KILL_COUNT[0]),
  },
  {
    id: "kill2",
    name: "怪物公敌",
    color: SERIES_TIER_COLORS.kills[1],
    series: "kills",
    tier: 2,
    desc: `累计击杀达到 ${fmt(MILESTONE.KILL_COUNT[1])} 次`,
    owned: (p) => getStat(p.id, STATS_KILLS_PREFIX) >= MILESTONE.KILL_COUNT[1],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_KILLS_PREFIX) / MILESTONE.KILL_COUNT[1]),
  },
  {
    id: "kill3",
    name: "猎魔人",
    color: SERIES_TIER_COLORS.kills[2],
    series: "kills",
    tier: 3,
    desc: `累计击杀达到 ${fmt(MILESTONE.KILL_COUNT[2])} 次`,
    owned: (p) => getStat(p.id, STATS_KILLS_PREFIX) >= MILESTONE.KILL_COUNT[2],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_KILLS_PREFIX) / MILESTONE.KILL_COUNT[2]),
  },
  // --- 死亡系列 ---
  {
    id: "death1",
    name: "试试就逝世",
    color: SERIES_TIER_COLORS.deaths[0],
    series: "deaths",
    tier: 1,
    desc: `累计死亡达到 ${fmt(MILESTONE.DEATH_COUNT[0])} 次`,
    owned: (p) => getStat(p.id, STATS_DEATHS_PREFIX) >= MILESTONE.DEATH_COUNT[0],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_DEATHS_PREFIX) / MILESTONE.DEATH_COUNT[0]),
  },
  {
    id: "death2",
    name: "影逝二度",
    color: SERIES_TIER_COLORS.deaths[1],
    series: "deaths",
    tier: 2,
    desc: `累计死亡达到 ${fmt(MILESTONE.DEATH_COUNT[1])} 次`,
    owned: (p) => getStat(p.id, STATS_DEATHS_PREFIX) >= MILESTONE.DEATH_COUNT[1],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_DEATHS_PREFIX) / MILESTONE.DEATH_COUNT[1]),
  },
  {
    id: "death3",
    name: "菜月昴",
    color: SERIES_TIER_COLORS.deaths[2],
    series: "deaths",
    tier: 3,
    desc: `累计死亡达到 ${fmt(MILESTONE.DEATH_COUNT[2])} 次`,
    owned: (p) => getStat(p.id, STATS_DEATHS_PREFIX) >= MILESTONE.DEATH_COUNT[2],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_DEATHS_PREFIX) / MILESTONE.DEATH_COUNT[2]),
  },
  // --- 持有金币系列 ---
  {
    id: "rich1",
    name: "百万富翁",
    color: SERIES_TIER_COLORS.money[0],
    series: "money",
    tier: 1,
    desc: `持有金币达到 ${fmt(MILESTONE.MONEY[0])} 金币`,
    owned: (p) => getPlayerMoney(p) >= MILESTONE.MONEY[0],
    progress: (p) => Math.min(1, getPlayerMoney(p) / MILESTONE.MONEY[0]),
  },
  {
    id: "rich2",
    name: "千万富翁",
    color: SERIES_TIER_COLORS.money[1],
    series: "money",
    tier: 2,
    desc: `持有金币达到 ${fmt(MILESTONE.MONEY[1])} 金币`,
    owned: (p) => getPlayerMoney(p) >= MILESTONE.MONEY[1],
    progress: (p) => Math.min(1, getPlayerMoney(p) / MILESTONE.MONEY[1]),
  },
  {
    id: "rich3",
    name: "亿万富翁",
    color: SERIES_TIER_COLORS.money[2],
    series: "money",
    tier: 3,
    desc: `持有金币达到 ${fmt(MILESTONE.MONEY[2])} 金币`,
    owned: (p) => getPlayerMoney(p) >= MILESTONE.MONEY[2],
    progress: (p) => Math.min(1, getPlayerMoney(p) / MILESTONE.MONEY[2]),
  },
  // --- 抽奖系列 ---
  {
    id: "lot1",
    name: "赌徒",
    color: SERIES_TIER_COLORS.lottery[0],
    series: "lottery",
    tier: 1,
    desc: `累计抽奖达到 ${MILESTONE.LOTTERY_COUNT[0]} 次`,
    owned: (p) => getStat(p.id, STATS_LOTTERY_PREFIX) >= MILESTONE.LOTTERY_COUNT[0],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_LOTTERY_PREFIX) / MILESTONE.LOTTERY_COUNT[0]),
  },
  {
    id: "lot2",
    name: "赌神",
    color: SERIES_TIER_COLORS.lottery[1],
    series: "lottery",
    tier: 2,
    desc: `累计抽奖达到 ${MILESTONE.LOTTERY_COUNT[1]} 次`,
    owned: (p) => getStat(p.id, STATS_LOTTERY_PREFIX) >= MILESTONE.LOTTERY_COUNT[1],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_LOTTERY_PREFIX) / MILESTONE.LOTTERY_COUNT[1]),
  },
  {
    id: "lot3",
    name: "狂赌之渊",
    color: SERIES_TIER_COLORS.lottery[2],
    series: "lottery",
    tier: 3,
    desc: `累计抽奖达到 ${MILESTONE.LOTTERY_COUNT[2]} 次`,
    owned: (p) => getStat(p.id, STATS_LOTTERY_PREFIX) >= MILESTONE.LOTTERY_COUNT[2],
    progress: (p) =>
      Math.min(1, getStat(p.id, STATS_LOTTERY_PREFIX) / MILESTONE.LOTTERY_COUNT[2]),
  },
  // --- 成就系列 ---
  {
    id: "ach1",
    name: "成就猎人",
    color: SERIES_TIER_COLORS.achieve[0],
    series: "achieve",
    tier: 1,
    desc: `解锁 ${MILESTONE.ACHIEVE_COUNT[0]} 个成就`,
    owned: (p) => getAchievements(p.id).length >= MILESTONE.ACHIEVE_COUNT[0],
    progress: (p) =>
      Math.min(1, getAchievements(p.id).length / MILESTONE.ACHIEVE_COUNT[0]),
  },
  {
    id: "ach2",
    name: "黄金玩家",
    color: SERIES_TIER_COLORS.achieve[1],
    series: "achieve",
    tier: 2,
    desc: `解锁 ${MILESTONE.ACHIEVE_COUNT[1]} 个成就`,
    owned: (p) => getAchievements(p.id).length >= MILESTONE.ACHIEVE_COUNT[1],
    progress: (p) =>
      Math.min(1, getAchievements(p.id).length / MILESTONE.ACHIEVE_COUNT[1]),
  },
  {
    id: "ach3",
    name: "白金玩家",
    color: SERIES_TIER_COLORS.achieve[2],
    series: "achieve",
    tier: 3,
    desc: `解锁 ${MILESTONE.ACHIEVE_COUNT[2]} 个成就（当前成就共 66 个，需后续新增成就）`,
    owned: (p) => getAchievements(p.id).length >= MILESTONE.ACHIEVE_COUNT[2],
    progress: (p) =>
      Math.min(1, getAchievements(p.id).length / MILESTONE.ACHIEVE_COUNT[2]),
  },
  // --- 天赋系列 ---
  {
    id: "tal1",
    name: "略有小成",
    color: SERIES_TIER_COLORS.talent[0],
    series: "talent",
    tier: 1,
    desc: `任意天赋达到 ${MILESTONE.TALENT_LEVEL[0]} 级`,
    owned: (p) => hasAnyTalentLevel(p, MILESTONE.TALENT_LEVEL[0]),
    progress: (p) => Math.min(1, maxTalentLevel(p) / MILESTONE.TALENT_LEVEL[0]),
  },
  {
    id: "tal2",
    name: "登峰造极",
    color: SERIES_TIER_COLORS.talent[1],
    series: "talent",
    tier: 2,
    desc: `任意天赋达到 ${MILESTONE.TALENT_LEVEL[1]} 级`,
    owned: (p) => hasAnyTalentLevel(p, MILESTONE.TALENT_LEVEL[1]),
    progress: (p) => Math.min(1, maxTalentLevel(p) / MILESTONE.TALENT_LEVEL[1]),
  },
  {
    id: "tal3",
    name: "六边形战士",
    color: SERIES_TIER_COLORS.talent[2],
    series: "talent",
    tier: 3,
    desc: `所有天赋均达到 ${MILESTONE.TALENT_LEVEL[1]} 级`,
    owned: (p) => hasAllTalentLevel(p, MILESTONE.TALENT_LEVEL[1]),
    progress: (p) => Math.min(1, maxTalentLevel(p) / MILESTONE.TALENT_LEVEL[1]),
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
    label: `【${t.name}】`,
    value: i,
  }));
  items.push({ label: "无称号（默认）", value: NO_TITLE_INDEX });

  const wornIndex = wornTitle
    ? ownedTitles.findIndex((t) => t.id === wornTitle.id)
    : NO_TITLE_INDEX;
  const selected = new ObservableNumber(wornIndex, { clientWritable: true });
  const conditionLabel = new ObservableString(
    wornTitle ? `§7获取条件: ${wornTitle.desc}` : "§7未佩戴称号"
  );
  // 下拉选择变化时同步更新获取条件
  selected.subscribe((idx) => {
    const t = idx >= 0 && idx < ownedTitles.length ? ownedTitles[idx] : null;
    conditionLabel.setData(t ? `§7获取条件: ${t.desc}` : "§7未佩戴称号");
  });

  let form = new CustomForm(player, "称号")
    .label(`§e当前称号: ${wornText}`)
    .spacer()
    .dropdown("选择称号", selected, items)
    .spacer()
    .label(conditionLabel)
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
  // 二档及以上称号解锁全服通报（每 10 秒检查，首次解锁只通报一次）
  system.runInterval(() => {
    for (const p of world.getPlayers()) {
      let notified = [];
      const rawNotify = world.getDynamicProperty(TITLE_NOTIFY_PREFIX + p.id);
      if (typeof rawNotify === "string") {
        try {
          notified = JSON.parse(rawNotify);
        } catch (e) {}
      }
      let changed = false;
      for (const t of TITLES) {
        if (!t.tier || t.tier < 2) continue; // 仅二档及以上
        if (notified.includes(t.id)) continue;
        if (t.owned(p)) {
          notified.push(t.id);
          changed = true;
          world.sendMessage(
            `§e[称号通报] §f${p.name} §a解锁了称号 ${t.color}【${t.name}】§r§a！`
          );
          console.warn(`[Title] ${p.name} 解锁称号 ${t.name}`);
        }
      }
      if (changed) {
        world.setDynamicProperty(
          TITLE_NOTIFY_PREFIX + p.id,
          JSON.stringify(notified)
        );
      }
    }
  }, 200);

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
