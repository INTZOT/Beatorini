import { world, system, TextPrimitive } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";
import { getStat, STATS_CATEGORIES, getPlayerNameById } from "./stats.js";
import {
  LOBBY_DIMENSION_ID,
  LEADERBOARD_DISPLAY_PREFIX,
  LEADERBOARD_DISPLAY_COUNT,
} from "./config.js";

/** 收集某分类的排行数据（在线玩家 + 离线动态属性，含名字映射） */
function collectCategoryEntries(category) {
  const allEntries = [];
  const allPlayers = world.getPlayers();
  const seenIds = new Set();

  for (const p of allPlayers) {
    seenIds.add(p.id);
    allEntries.push({ name: p.name, value: getStat(p.id, category.prefix) });
  }

  const dynamicKeys = world.getDynamicPropertyIds();
  if (dynamicKeys) {
    for (const key of dynamicKeys) {
      if (key.startsWith(category.prefix)) {
        const playerId = key.slice(category.prefix.length);
        if (!seenIds.has(playerId)) {
          seenIds.add(playerId);
          const value = getStat(playerId, category.prefix);
          if (value > 0) {
            const name = getPlayerNameById(playerId);
            allEntries.push({ name, value });
          }
        }
      }
    }
  }

  allEntries.sort((a, b) => b.value - a.value);
  return allEntries;
}

function showLeaderboard(player, category, backFn) {
  const form = new CustomForm(player, `${category.icon} ${category.name} 排行`);
  const top = collectCategoryEntries(category).slice(0, 20);

  if (top.length === 0) {
    form.label("§7暂无数据");
  } else {
    form.label(`§6§lTOP 20 §7- ${category.name}`);
    form.spacer();
    for (let i = 0; i < top.length; i++) {
      const entry = top[i];
      const medal = i === 0 ? "§e1." : i === 1 ? "§f2." : i === 2 ? "§63." : `§7${i + 1}.`;
      form.label(`${medal} §e${entry.name} §7- §f${category.format(entry.value)}`);
      form.spacer();
    }
  }

  form.spacer().button("返回", () => {
    form.close();
    system.runTimeout(() => showLeaderboardMenu(player, backFn), 2);
  });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

export function showLeaderboardMenu(player, backFn) {
  const form = new CustomForm(player, "排行榜")
    .label("§e选择排行类别")
    .spacer();

  for (const cat of STATS_CATEGORIES) {
    form.button(`${cat.icon} ${cat.name}`, () => {
      form.close();
      system.runTimeout(() => showLeaderboard(player, cat, backFn), 2);
    });
    form.spacer();
  }

  form.button("返回", () => {
    form.close();
    system.runTimeout(() => backFn(player), 2);
  });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

// ============================================================
// 大厅悬浮排行榜（TextPrimitive，按分类生成多个悬浮榜）
// 位置通过动态属性持久化，管理员命令 /beatorini:lb set|clear <分类>
// ============================================================

const LB_LINE_SPACING = 0.4; // 行间距
const boards = new Map(); // categoryKey -> { shapes: TextPrimitive[] }

function categoryByKey(key) {
  return STATS_CATEGORIES.find((c) => c.key === key);
}

/** 读取分类排行榜的悬浮位置，未设置返回 null */
function getBoardPosition(categoryKey) {
  const raw = world.getDynamicProperty(LEADERBOARD_DISPLAY_PREFIX + categoryKey);
  if (!raw) return null;
  try {
    const pos = JSON.parse(raw);
    if (
      typeof pos?.x !== "number" ||
      typeof pos?.y !== "number" ||
      typeof pos?.z !== "number"
    ) {
      return null;
    }
    return pos;
  } catch (e) {
    return null;
  }
}

function clearCategoryShapes(categoryKey) {
  const board = boards.get(categoryKey);
  if (!board) return;
  for (const shape of board.shapes) {
    try {
      world.primitiveShapesManager.removeText(shape);
    } catch (e) {}
  }
  boards.delete(categoryKey);
}

/** 完整重建某分类的悬浮榜（位置变化/条数变化时调用） */
function renderBoard(categoryKey) {
  clearCategoryShapes(categoryKey);
  const pos = getBoardPosition(categoryKey);
  const category = categoryByKey(categoryKey);
  if (!pos || !category) return;

  const lobby = world.getDimension(LOBBY_DIMENSION_ID);
  const entries = collectCategoryEntries(category).slice(
    0,
    LEADERBOARD_DISPLAY_COUNT
  );
  const shapes = [];
  const baseColor = { red: 1, green: 1, blue: 1, alpha: 1 };

  const makeShape = (offsetY, text, color) => {
    try {
      const shape = new TextPrimitive(
        { x: pos.x, y: pos.y + offsetY, z: pos.z, dimension: lobby },
        text
      );
      shape.scale = pos.scale ?? 1;
      shape.color = color;
      shape.backgroundColorOverride = {
        red: 0,
        green: 0,
        blue: 0,
        alpha: 0.45,
      };
      shape.depthTest = false;
      world.primitiveShapesManager.addText(shape, lobby);
      shapes.push(shape);
    } catch (e) {
      console.warn(`[Leaderboard] 悬浮榜创建失败 ${categoryKey}: ${e}`);
    }
  };

  makeShape(0, `${category.icon} ${category.name} TOP${entries.length}`, {
    red: 0.55,
    green: 0.85,
    blue: 1,
    alpha: 1,
  });
  entries.forEach((entry, i) => {
    const color =
      i === 0
        ? { red: 1, green: 0.85, blue: 0.2, alpha: 1 }
        : i === 1
          ? { red: 0.75, green: 0.75, blue: 0.78, alpha: 1 }
          : i === 2
            ? { red: 0.85, green: 0.6, blue: 0.35, alpha: 1 }
            : baseColor;
    makeShape(
      -(i + 1) * LB_LINE_SPACING,
      `${i + 1}. ${entry.name} - ${category.format(entry.value)}`,
      color
    );
  });

  boards.set(categoryKey, { shapes });
}

/** 实时刷新某分类的悬浮榜（复用已有 shape，仅更新文本与颜色） */
function refreshBoard(categoryKey) {
  const pos = getBoardPosition(categoryKey);
  const category = categoryByKey(categoryKey);
  if (!pos || !category) {
    clearCategoryShapes(categoryKey);
    return;
  }
  const entries = collectCategoryEntries(category).slice(
    0,
    LEADERBOARD_DISPLAY_COUNT
  );
  const board = boards.get(categoryKey);
  if (!board || board.shapes.length !== entries.length + 1) {
    renderBoard(categoryKey);
    return;
  }
  board.shapes.forEach((shape, index) => {
    try {
      if (index === 0) {
        shape.setText(`${category.icon} ${category.name} TOP${entries.length}`);
        shape.color = { red: 0.55, green: 0.85, blue: 1, alpha: 1 };
      } else {
        const entry = entries[index - 1];
        shape.setText(
          `${index}. ${entry.name} - ${category.format(entry.value)}`
        );
        shape.color =
          index === 1
            ? { red: 1, green: 0.85, blue: 0.2, alpha: 1 }
            : index === 2
              ? { red: 0.75, green: 0.75, blue: 0.78, alpha: 1 }
              : index === 3
              ? { red: 0.85, green: 0.6, blue: 0.35, alpha: 1 }
              : { red: 1, green: 1, blue: 1, alpha: 1 };
      }
    } catch (e) {}
  });
}

/** 设置某分类悬浮榜位置（管理员命令调用） */
export function setBoardPosition(categoryKey, location, rotationY = 0) {
  if (!categoryByKey(categoryKey)) return false;
  // 自动吸附到方块中心
  const center = {
    x: Math.floor(location.x) + 0.5,
    y: Math.floor(location.y) + 0.5,
    z: Math.floor(location.z) + 0.5,
  };
  world.setDynamicProperty(
    LEADERBOARD_DISPLAY_PREFIX + categoryKey,
    JSON.stringify({
      ...center,
      scale: 1,
      rotationY,
    })
  );
  renderBoard(categoryKey);
  return true;
}

/** 清除某分类悬浮榜位置 */
export function clearBoardPosition(categoryKey) {
  if (!categoryByKey(categoryKey)) return false;
  world.setDynamicProperty(LEADERBOARD_DISPLAY_PREFIX + categoryKey, undefined);
  clearCategoryShapes(categoryKey);
  return true;
}

export function init() {
  world.afterEvents.worldLoad.subscribe(() => {
    system.runTimeout(() => {
      for (const cat of STATS_CATEGORIES) renderBoard(cat.key);
    }, 20);
  });
  // 每 3 秒实时刷新悬浮榜
  system.runInterval(() => {
    for (const cat of STATS_CATEGORIES) refreshBoard(cat.key);
  }, 60);
}
