import { world, system, TextPrimitive } from "@minecraft/server";
import { CustomForm, ObservableNumber } from "@minecraft/server-ui";
import { TITLE_PREFIX, DEFAULT_TITLE } from "./config.js";

// --- 称号目录 ---
// id: 存储标识；name: 称号名；color: 颜色代码；desc: 解锁说明
// 后续新称号在此追加即可
export const TITLES = [
  {
    id: "newbie",
    name: "萌新",
    color: "§7",
    desc: "人人皆从萌新开始（初始称号）",
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
    shape.visibleTo = []; // 全服可见
    world.primitiveShapesManager.addText(shape, player.dimension);
    titleShapes.set(player.id, shape);
  } catch (e) {
    console.warn(`[Title] 头顶称号创建失败: ${e}`);
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
  const wornTitle = TITLES.find((x) => x.id === wornRaw);
  const wornText = wornTitle
    ? `${wornTitle.color}【${wornTitle.name}】§r`
    : `${DEFAULT_TITLE}§r`;

  const NO_TITLE_INDEX = TITLES.length; // 下拉末项：无称号
  const items = TITLES.map((t, i) => ({
    label: `${t.color}【${t.name}】`,
    value: i,
    description: t.desc,
  }));
  items.push({ label: "无称号（默认）", value: NO_TITLE_INDEX });

  const wornIndex = wornTitle
    ? TITLES.findIndex((t) => t.id === wornTitle.id)
    : NO_TITLE_INDEX;
  const selected = new ObservableNumber(wornIndex, { clientWritable: true });

  const form = new CustomForm(player, "称号")
    .label(`§e当前称号: ${wornText}`)
    .spacer()
    .dropdown("选择称号", selected, items)
    .spacer()
    .button("保存", () => {
      const idx = selected.getData();
      const title = idx >= 0 && idx < TITLES.length ? TITLES[idx] : null;
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
    .spacer()
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
  });

  // 下线清理 / 换维重建 / reload 后为在线玩家重建
  world.afterEvents.playerLeave.subscribe((event) => {
    removeTitleShape(event.playerId);
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
    }, 10);
  });
}
