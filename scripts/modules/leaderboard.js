import { world, system, TextPrimitive } from "@minecraft/server";
import {
  CustomForm,
  ObservableString,
  ObservableNumber,
  ObservableBoolean,
} from "@minecraft/server-ui";
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
// 配置通过动态属性持久化，管理面板「排行榜管理」可自定义
// ============================================================

const boards = new Map(); // categoryKey -> { shapes: TextPrimitive[] }

const TITLE_COLORS = [
  { name: "青色", code: "§b", rgb: { red: 0.55, green: 0.85, blue: 1 } },
  { name: "白色", code: "§f", rgb: { red: 1, green: 1, blue: 1 } },
  { name: "金色", code: "§6", rgb: { red: 1, green: 0.85, blue: 0.2 } },
  { name: "红色", code: "§c", rgb: { red: 1, green: 0.55, blue: 0.55 } },
  { name: "绿色", code: "§a", rgb: { red: 0.55, green: 1, blue: 0.55 } },
  { name: "黄色", code: "§e", rgb: { red: 1, green: 1, blue: 0.55 } },
  { name: "粉色", code: "§d", rgb: { red: 1, green: 0.55, blue: 0.75 } },
  { name: "紫色", code: "§5", rgb: { red: 0.75, green: 0.55, blue: 1 } },
];

function categoryByKey(key) {
  return STATS_CATEGORIES.find((c) => c.key === key);
}

/** 读取分类排行榜配置，未设置返回 null（兼容旧数据缺省字段） */
function getBoardConfig(categoryKey) {
  const raw = world.getDynamicProperty(LEADERBOARD_DISPLAY_PREFIX + categoryKey);
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw);
    if (
      typeof cfg?.x !== "number" ||
      typeof cfg?.y !== "number" ||
      typeof cfg?.z !== "number"
    ) {
      return null;
    }
    return {
      x: cfg.x,
      y: cfg.y,
      z: cfg.z,
      scale: cfg.scale ?? 1,
      colorIndex: cfg.colorIndex ?? 0,
      background: cfg.background ?? true,
      bgAlpha: cfg.bgAlpha ?? 0.45,
      billboard: cfg.billboard ?? true,
      rotationY: cfg.rotationY ?? 0,
    };
  } catch (e) {
    return null;
  }
}

function saveBoardConfig(categoryKey, cfg) {
  world.setDynamicProperty(
    LEADERBOARD_DISPLAY_PREFIX + categoryKey,
    JSON.stringify(cfg)
  );
}

function clearBoardConfig(categoryKey) {
  world.setDynamicProperty(LEADERBOARD_DISPLAY_PREFIX + categoryKey, undefined);
  clearCategoryShapes(categoryKey);
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

/** 生成单块排行榜文本（\n 多行 + § 颜色） */
function buildBoardText(category, entries, colorIndex = 0) {
  const titleCode = TITLE_COLORS[colorIndex]?.code || "§b";
  const lines = [
    `${titleCode}${category.icon} ${category.name} TOP${entries.length}`,
  ];
  entries.forEach((entry, i) => {
    const color =
      i === 0 ? "§6" : i === 1 ? "§7" : i === 2 ? "§x§d§9§9§9§5§9" : "§f";
    lines.push(
      `${color}${i + 1}. ${entry.name} - ${category.format(entry.value)}`
    );
  });
  return lines.join("\n");
}

/** 完整重建某分类的悬浮榜（位置变化/条数变化时调用） */
function renderBoard(categoryKey) {
  clearCategoryShapes(categoryKey);
  const cfg = getBoardConfig(categoryKey);
  const category = categoryByKey(categoryKey);
  if (!cfg || !category) return;

  const lobby = world.getDimension(LOBBY_DIMENSION_ID);
  const entries = collectCategoryEntries(category).slice(
    0,
    LEADERBOARD_DISPLAY_COUNT
  );
  try {
    const shape = new TextPrimitive(
      { x: cfg.x, y: cfg.y, z: cfg.z, dimension: lobby },
      buildBoardText(category, entries, cfg.colorIndex)
    );
    shape.scale = cfg.scale;
    shape.color = { red: 1, green: 1, blue: 1, alpha: 1 };
    shape.backgroundColorOverride = cfg.background
      ? { red: 0, green: 0, blue: 0, alpha: cfg.bgAlpha }
      : { red: 0, green: 0, blue: 0, alpha: 0 };
    shape.depthTest = false;
    if (!cfg.billboard) {
      shape.useRotation = true;
      shape.rotation = { x: 0, y: cfg.rotationY, z: 0 };
    }
    world.primitiveShapesManager.addText(shape, lobby);
    boards.set(categoryKey, { shapes: [shape] });
  } catch (e) {
    console.warn(`[Leaderboard] 悬浮榜创建失败 ${categoryKey}: ${e}`);
  }
}

/** 实时刷新某分类的悬浮榜（复用已有 shape，仅更新文本与颜色） */
function refreshBoard(categoryKey) {
  const cfg = getBoardConfig(categoryKey);
  const category = categoryByKey(categoryKey);
  if (!cfg || !category) {
    clearCategoryShapes(categoryKey);
    return;
  }
  const entries = collectCategoryEntries(category).slice(
    0,
    LEADERBOARD_DISPLAY_COUNT
  );
  const board = boards.get(categoryKey);
  if (!board || board.shapes.length !== 1) {
    renderBoard(categoryKey);
    return;
  }
  try {
    board.shapes[0].setText(buildBoardText(category, entries, cfg.colorIndex));
  } catch (e) {}
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

// ============================================================
// 管理界面（管理面板 → 排行榜管理）
// ============================================================

export function showLeaderboardAdminMenu(player, backFn = () => {}) {
  const items = STATS_CATEGORIES.map((cat, i) => ({
    label: `${cat.icon} ${cat.name}${getBoardConfig(cat.key) ? " ✓" : ""}`,
    value: i,
  }));
  const selected = new ObservableNumber(0, { clientWritable: true });

  const form = new CustomForm(player, "排行榜管理");
  form.label("§6选择要编辑的排行榜分类");
  form.spacer();
  form.dropdown("排行榜", selected, items);
  form.spacer();
  form.button("编辑设置", () => {
    const cat = STATS_CATEGORIES[selected.getData()];
    form.close();
    system.runTimeout(() => showLeaderboardEditor(player, cat, backFn), 2);
  });
  form.spacer();
  form.button("清除位置（隐藏）", () => {
    const cat = STATS_CATEGORIES[selected.getData()];
    if (getBoardConfig(cat.key)) {
      clearBoardConfig(cat.key);
      player.sendMessage(`§a已隐藏「${cat.name}」排行榜`);
      player.playSound("random.orb");
    } else {
      player.sendMessage("§7该排行榜尚未设置位置");
    }
    form.close();
    system.runTimeout(() => showLeaderboardAdminMenu(player, backFn), 2);
  });
  form.spacer().button("返回管理菜单", () => {
    form.close();
    system.runTimeout(() => backFn(player), 2);
  });
  form.show().catch((e) => console.warn("Leaderboard admin form failed:", e));
}

function showLeaderboardEditor(player, category, backFn) {
  const cfg = getBoardConfig(category.key);
  const xObs = new ObservableString(
    cfg ? String(cfg.x) : String(Math.round(player.location.x * 100) / 100),
    { clientWritable: true }
  );
  const yObs = new ObservableString(
    cfg ? String(cfg.y) : String(Math.round(player.location.y * 100) / 100),
    { clientWritable: true }
  );
  const zObs = new ObservableString(
    cfg ? String(cfg.z) : String(Math.round(player.location.z * 100) / 100),
    { clientWritable: true }
  );
  const scaleObs = new ObservableNumber(cfg?.scale ?? 1, {
    clientWritable: true,
  });
  const colorObs = new ObservableNumber(cfg?.colorIndex ?? 0, {
    clientWritable: true,
  });
  const bgObs = new ObservableBoolean(cfg?.background ?? true, {
    clientWritable: true,
  });
  const bgAlphaObs = new ObservableNumber(
    cfg ? Math.round(cfg.bgAlpha * 100) : 45,
    { clientWritable: true }
  );
  const billboardObs = new ObservableBoolean(cfg?.billboard ?? true, {
    clientWritable: true,
  });
  const yawObs = new ObservableString(
    cfg
      ? String(cfg.rotationY ?? 0)
      : String(Math.round(player.getRotation().y)),
    { clientWritable: true }
  );

  const form = new CustomForm(
    player,
    `${category.icon} ${category.name} · 排行榜设置`
  );
  form
    .textField("X 坐标", xObs)
    .textField("Y 坐标", yObs)
    .textField("Z 坐标", zObs)
    .spacer()
    .slider(
      "缩放",
      scaleObs,
      new ObservableNumber(0.5),
      new ObservableNumber(5),
      { step: 0.1 }
    )
    .spacer()
    .dropdown(
      "标题颜色",
      colorObs,
      TITLE_COLORS.map((c, i) => ({ label: c.name, value: i }))
    )
    .spacer()
    .toggle("显示背景", bgObs)
    .slider(
      "背景透明度 (%)",
      bgAlphaObs,
      new ObservableNumber(0),
      new ObservableNumber(100),
      { step: 5 }
    )
    .toggle("跟随镜头（关闭则固定朝向）", billboardObs)
    .textField("旋转角度 Yaw（固定朝向时生效）", yawObs)
    .spacer()
    .button("保存", () => {
      const x = Number(xObs.getData());
      const y = Number(yObs.getData());
      const z = Number(zObs.getData());
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        player.sendMessage("§c坐标必须为数字");
        form.close();
        system.runTimeout(() => showLeaderboardEditor(player, category, backFn), 2);
        return;
      }
      const yaw = Number(yawObs.getData());
      if (!Number.isFinite(yaw)) {
        player.sendMessage("§c旋转角度必须为数字");
        form.close();
        system.runTimeout(() => showLeaderboardEditor(player, category, backFn), 2);
        return;
      }
      const billboard = billboardObs.getData();
      saveBoardConfig(category.key, {
        x,
        y,
        z,
        scale: scaleObs.getData(),
        colorIndex: colorObs.getData(),
        background: bgObs.getData(),
        bgAlpha: bgAlphaObs.getData() / 100,
        billboard,
        rotationY: billboard ? 0 : yaw,
      });
      renderBoard(category.key);
      player.sendMessage(`§a已保存「${category.name}」排行榜设置`);
      player.playSound("random.orb");
      form.close();
      system.runTimeout(() => showLeaderboardAdminMenu(player, backFn), 2);
    })
    .spacer()
    .button("取消", () => {
      form.close();
      system.runTimeout(() => showLeaderboardAdminMenu(player, backFn), 2);
    });

  form.show().catch((e) => console.warn("Leaderboard editor form failed:", e));
}
