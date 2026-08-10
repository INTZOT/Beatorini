// ============================================================
// 临时：TextPrimitive 动态数据测试
// #goldtest — 头顶显示实时金币数，60 秒自动消失
// 测试通过后此模块可整体删除
// ============================================================
import { world, system, TextPrimitive } from "@minecraft/server";
import { getPlayerMoney } from "./money.js";

let activeShape = null;
let activePlayerId = null;
let intervalId = null;

function cleanup() {
  if (intervalId !== null) {
    system.clearRun(intervalId);
    intervalId = null;
  }
  if (activeShape) {
    try {
      world.primitiveShapesManager.removeText(activeShape);
    } catch (e) {}
    activeShape = null;
  }
  activePlayerId = null;
}

export function showGoldTest(player) {
  cleanup();
  activePlayerId = player.id;

  const shape = new TextPrimitive(
    { x: 0, y: 3.6, z: 0 },
    "金币数: 0"
  );
  shape.scale = 1;
  shape.color = { red: 1, green: 0.85, blue: 0.2, alpha: 1 };
  shape.backgroundColorOverride = { red: 0, green: 0, blue: 0, alpha: 0.5 };
  shape.depthTest = false;
  shape.attachedTo = player;
  shape.visibleTo = [player];
  shape.timeLeft = 60;
  world.primitiveShapesManager.addText(shape, player.dimension);
  activeShape = shape;

  const update = () => {
    if (!activeShape) return;
    try {
      shape.setText(`金币数: ${getPlayerMoney(player)}`);
    } catch (e) {}
  };
  update();
  intervalId = system.runInterval(update, 20); // 每秒刷新
  system.runTimeout(cleanup, 1200); // 60 秒后清理（与 timeLeft 对齐）

  player.sendMessage(
    "§a已生成动态金币数测试（60 秒自动消失）\n§7改变金币后观察头顶数字是否实时变化"
  );
  console.warn(`[GoldTest] started for ${player.name}`);
}

// 测试玩家下线时清理
world.afterEvents.playerLeave.subscribe((event) => {
  if (event.playerId === activePlayerId) cleanup();
});
