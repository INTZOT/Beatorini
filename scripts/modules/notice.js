// ============================================================
// 悬浮公告管理：表单创建/编辑/删除，TextPrimitive 持久展示
// 公告存动态属性，世界加载后自动重建
// 多行公告用单个 TextPrimitive + 真换行，行距交给 lineGapHeight
// ============================================================
import { notifyIfBusy, validIndex } from "../lib/form.js";
import { system, world, TextPrimitive } from "@minecraft/server";
import {
  CustomForm,
  ObservableString,
  ObservableNumber,
  ObservableBoolean,
} from "@minecraft/server-ui";
import {
  LOBBY_DIMENSION_ID,
  NOTICE_LIST_KEY,
  NOTICE_MAX,
  NOTICE_LINE_GAP_DEFAULT,
} from "./config.js";
import { applyLineGap } from "../lib/text-primitive.js";

const noticeShapes = new Map(); // id -> TextPrimitive[]

const COLOR_PRESETS = [
  { name: "白色", rgb: { red: 1, green: 1, blue: 1 } },
  { name: "金色", rgb: { red: 1, green: 0.85, blue: 0.2 } },
  { name: "青色", rgb: { red: 0.55, green: 0.85, blue: 1 } },
  { name: "红色", rgb: { red: 1, green: 0.4, blue: 0.4 } },
  { name: "绿色", rgb: { red: 0.55, green: 1, blue: 0.55 } },
  { name: "黄色", rgb: { red: 1, green: 1, blue: 0.55 } },
  { name: "粉色", rgb: { red: 1, green: 0.55, blue: 0.75 } },
  { name: "紫色", rgb: { red: 0.75, green: 0.55, blue: 1 } },
];

function getNotices() {
  const raw = world.getDynamicProperty(NOTICE_LIST_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveNotices(list) {
  world.setDynamicProperty(NOTICE_LIST_KEY, JSON.stringify(list));
}

function clearShapes(id) {
  const shapes = noticeShapes.get(id);
  if (!shapes) return;
  for (const shape of shapes) {
    try {
      world.primitiveShapesManager.removeText(shape);
    } catch (e) {}
  }
  noticeShapes.delete(id);
}

function renderNotice(entry) {
  clearShapes(entry.id);
  // getDimension 必须在 try 内：它在外面抛错会中断整个重建循环（整批公告静默消失）
  let lobby;
  try {
    lobby = world.getDimension(LOBBY_DIMENSION_ID);
  } catch (e) {
    console.error(`[Notice] 取大厅维度失败，公告 #${entry.id} 未渲染：${e}`);
    return;
  }
  // 兼容字面 \n（从输入框粘贴的复制版）与真实换行
  const text = String(entry.text || "").replace(/\\n/g, "\n");
  const color = {
    ...(COLOR_PRESETS[entry.colorIndex]?.rgb || COLOR_PRESETS[0].rgb),
    alpha: 1,
  };

  try {
    // 单 primitive + 真换行：行距由引擎按 lineGapHeight 处理，不再逐行手算坐标
    const shape = new TextPrimitive(
      { x: entry.x, y: entry.y, z: entry.z, dimension: lobby },
      text
    );
    shape.scale = entry.scale ?? 1;
    applyLineGap(shape, entry.lineGap ?? NOTICE_LINE_GAP_DEFAULT);
    shape.color = color;
    shape.backgroundColorOverride = entry.background
      ? { red: 0, green: 0, blue: 0, alpha: entry.bgAlpha ?? 0.45 }
      : { red: 0, green: 0, blue: 0, alpha: 0 };
    shape.depthTest = false;
    if (!entry.billboard) {
      shape.useRotation = true;
      shape.rotation = { x: 0, y: entry.rotationY ?? 0, z: 0 };
    }
    world.primitiveShapesManager.addText(shape, lobby);
    noticeShapes.set(entry.id, [shape]);
  } catch (e) {
    console.warn(`[Notice] 公告渲染失败 ${entry.id}: ${e}`);
  }
}

function renderAllNotices() {
  for (const id of [...noticeShapes.keys()]) clearShapes(id);
  const notices = getNotices();
  let ok = 0;
  for (const notice of notices) {
    // 逐条兜底：单条失败不影响其余公告
    try {
      renderNotice(notice);
      ok++;
    } catch (e) {
      console.error(`[Notice] 公告 #${notice?.id} 渲染异常：${e}`);
    }
  }
  console.warn(`[Notice] 重建完成：成功 ${ok}/${notices.length} 条`);
}

export function init() {
  world.afterEvents.worldLoad.subscribe(() => {
    system.runTimeout(renderAllNotices, 20);
  });
}

// ============================================================
// 管理界面
// ============================================================

export function showNoticeAdminMenu(player, backFn = () => {}) {
  const notices = getNotices();
  const form = new CustomForm(player, "公告管理");
  form.label(`§6当前公告：${notices.length}/${NOTICE_MAX}`);
  form.spacer();

  const items = notices.map((n, i) => ({
    label: `#${n.id}  ${String(n.text ?? "").slice(0, 24).replace(/\n/g, "⏎")}  (${Math.round(n.x)}, ${Math.round(n.y)}, ${Math.round(n.z)})`,
    value: i,
  }));
  items.push({ label: "＋ 新建公告", value: notices.length });
  const selected = new ObservableNumber(0, { clientWritable: true });

  form.dropdown("选择公告", selected, items);
  form.spacer();
  form.button("编辑", () => {
    // "新建"项的下标恰好等于 notices.length，所以上界放到 length（含）
    const idx = validIndex(selected.getData(), notices.length + 1);
    if (idx === undefined) {
      player.sendMessage("§c选择无效，请重试");
      return;
    }
    form.close();
    if (idx >= notices.length) {
      system.runTimeout(() => showNoticeEditor(player, null, backFn), 2);
    } else {
      system.runTimeout(() => showNoticeEditor(player, notices[idx], backFn), 2);
    }
  });
  form.spacer();
  form.button("删除", () => {
    const idx = validIndex(selected.getData(), notices.length);
    if (idx === undefined) {
      player.sendMessage("§c请先选择要删除的公告");
      return;
    }
    const target = notices[idx];
    const list = getNotices().filter((x) => x.id !== target.id);
    saveNotices(list);
    clearShapes(target.id);
    player.sendMessage(`§a已删除公告 #${target.id}`);
    player.playSound("random.orb");
    form.close();
    system.runTimeout(() => showNoticeAdminMenu(player, backFn), 2);
  });

  form.spacer().button("返回管理菜单", () => {
    form.close();
    system.runTimeout(() => backFn(player), 2);
  });
  form.show().then((r) => notifyIfBusy(r, player)).catch((e) => console.warn("Notice admin form failed:", e));
}

function showNoticeEditor(player, notice, backFn) {
  const textObs = new ObservableString(notice?.text ?? "", {
    clientWritable: true,
  });
  const xObs = new ObservableString(
    notice ? String(notice.x) : String(Math.round(player.location.x * 100) / 100),
    { clientWritable: true }
  );
  const yObs = new ObservableString(
    notice ? String(notice.y) : String(Math.round(player.location.y * 100) / 100),
    { clientWritable: true }
  );
  const zObs = new ObservableString(
    notice ? String(notice.z) : String(Math.round(player.location.z * 100) / 100),
    { clientWritable: true }
  );
  const scaleObs = new ObservableNumber(notice?.scale ?? 1, {
    clientWritable: true,
  });
  const lineGapObs = new ObservableNumber(
    notice?.lineGap ?? NOTICE_LINE_GAP_DEFAULT,
    { clientWritable: true }
  );
  const colorObs = new ObservableNumber(notice?.colorIndex ?? 0, {
    clientWritable: true,
  });
  const bgObs = new ObservableBoolean(notice?.background ?? true, {
    clientWritable: true,
  });
  const bgAlphaObs = new ObservableNumber(
    notice ? Math.round((notice.bgAlpha ?? 0.45) * 100) : 45,
    { clientWritable: true }
  );
  const billboardObs = new ObservableBoolean(notice?.billboard ?? true, {
    clientWritable: true,
  });
  const yawObs = new ObservableString(
    notice
      ? String(notice.rotationY ?? 0)
      : String(Math.round(player.getRotation().y)),
    { clientWritable: true }
  );

  const form = new CustomForm(player, notice ? `编辑公告 #${notice.id}` : "新建公告");
  form
    .textField("内容", textObs)
    .spacer()
    .textField("X 坐标", xObs)
    .textField("Y 坐标", yObs)
    .textField("Z 坐标", zObs)
    .spacer()
    .slider("缩放", scaleObs, new ObservableNumber(0.5), new ObservableNumber(5), {
      step: 0.1,
    })
    .slider(
      "行距（多行时生效）",
      lineGapObs,
      new ObservableNumber(0),
      new ObservableNumber(1),
      { step: 0.05 }
    )
    .spacer()
    .dropdown(
      "颜色",
      colorObs,
      COLOR_PRESETS.map((c, i) => ({ label: c.name, value: i }))
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
      const text = textObs.getData().trim();
      // TextPrimitive 硬上限：128 行 × 每行 128 字符（超限会在渲染时抛错，
      // 而公告已经落盘 → 每次开机都失败、管理面板却提示"已保存"）
      const lines = text.replace(/\\n/g, "\n").split("\n");
      const tooManyLines = lines.length > 128;
      const tooLongLine = lines.findIndex((l) => l.length > 128);
      if (tooManyLines || tooLongLine >= 0) {
        player.sendMessage(
          tooManyLines
            ? `§c公告最多 128 行（当前 ${lines.length} 行）`
            : `§c第 ${tooLongLine + 1} 行超过 128 字符（当前 ${lines[tooLongLine].length}）`
        );
        form.close();
        system.runTimeout(() => showNoticeEditor(player, notice, backFn), 2);
        return;
      }
      if (!text) {
        player.sendMessage("§c公告内容不能为空");
        form.close();
        system.runTimeout(() => showNoticeEditor(player, notice, backFn), 2);
        return;
      }
      const x = Number(xObs.getData());
      const y = Number(yObs.getData());
      const z = Number(zObs.getData());
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        player.sendMessage("§c坐标必须为数字");
        form.close();
        system.runTimeout(() => showNoticeEditor(player, notice, backFn), 2);
        return;
      }
      const yaw = Number(yawObs.getData());
      if (!Number.isFinite(yaw)) {
        player.sendMessage("§c旋转角度必须为数字");
        form.close();
        system.runTimeout(() => showNoticeEditor(player, notice, backFn), 2);
        return;
      }

      const id = notice?.id ?? `n${Date.now()}`;
      const list = getNotices().filter((n) => n.id !== id);
      if (!notice && list.length >= NOTICE_MAX) {
        player.sendMessage(`§c公告数量已达上限（${NOTICE_MAX} 条）`);
        form.close();
        system.runTimeout(() => showNoticeAdminMenu(player, backFn), 2);
        return;
      }

      const entry = {
        id,
        text,
        x,
        y,
        z,
        scale: scaleObs.getData(),
        lineGap: Math.round(lineGapObs.getData() * 100) / 100,
        colorIndex: colorObs.getData(),
        background: bgObs.getData(),
        bgAlpha: bgAlphaObs.getData() / 100,
        billboard: billboardObs.getData(),
        rotationY: billboardObs.getData() ? 0 : yaw,
      };
      list.push(entry);
      saveNotices(list);
      renderNotice(entry);
      player.sendMessage(`§a公告${notice ? "已更新" : "已创建"} #${id}`);
      player.playSound("random.orb");
      form.close();
      system.runTimeout(() => showNoticeAdminMenu(player, backFn), 2);
    })
    .spacer()
    .button("取消", () => {
      form.close();
      system.runTimeout(() => showNoticeAdminMenu(player, backFn), 2);
    });

  form.show().then((r) => notifyIfBusy(r, player)).catch((e) => console.warn("Notice editor form failed:", e));
}
