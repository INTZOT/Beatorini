// ============================================================
// 临时：TextPrimitive 显示诊断
// #tptest [scale] — 在玩家面前生成英文/中文 3D 文字
// 测试通过后此模块可整体删除
// ============================================================
import { world, TextPrimitive } from "@minecraft/server";

const active = [];

export function showTextPrimitiveTest(player, scaleArg) {
  // 清理上一次测试的残留
  for (const t of active) {
    try {
      world.primitiveShapesManager.removeText(t);
    } catch (e) {}
  }
  active.length = 0;

  if (typeof TextPrimitive === "undefined") {
    player.sendMessage("§c当前运行版本没有 TextPrimitive（可能是模块版本/游戏版本不匹配）");
    return;
  }

  const rawScale = Number(scaleArg);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  const loc = { ...player.location, y: player.location.y + 4 };
  const dim = player.dimension;

  try {
    // 英文测试（排除中文字体问题）
    const ascii = new TextPrimitive({ ...loc, y: loc.y + 2 }, "Hello Text");
    ascii.scale = scale;
    ascii.color = { red: 1, green: 1, blue: 1, alpha: 1 };
    ascii.backgroundColorOverride = { red: 0, green: 0, blue: 0, alpha: 0.6 };
    ascii.depthTest = false;
    ascii.timeLeft = 30;
    world.primitiveShapesManager.addText(ascii, dim);
    active.push(ascii);

    // 中文测试
    const cn = new TextPrimitive({ ...loc }, "灯浮市 Beatorini");
    cn.scale = scale;
    cn.color = { red: 1, green: 0.85, blue: 0.2, alpha: 1 };
    cn.backgroundColorOverride = { red: 0, green: 0, blue: 0, alpha: 0.6 };
    cn.depthTest = false;
    cn.timeLeft = 30;
    world.primitiveShapesManager.addText(cn, dim);
    active.push(cn);

    const total = world.primitiveShapesManager.getShapes().length;
    player.sendMessage(
      `§a已生成 2 个 TextPrimitive（scale=${scale}，维度 ${dim.id}）` +
        `\n§7请抬头看向上方：英文「Hello Text」和中文「灯浮市 Beatorini」` +
        `\n§7当前全服 shape 数: ${total}，30 秒后自动消失`
    );
    console.warn(
      `[TPTest] added 2 shapes scale=${scale} dim=${dim.id} total=${total}`
    );
  } catch (e) {
    player.sendMessage(`§cTextPrimitive 测试失败: ${e}`);
    console.warn(`[TPTest] failed: ${e}`);
  }
}
