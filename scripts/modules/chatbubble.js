// ============================================================
// 聊天气泡 + 局域聊天
// 普通聊天：全服广播 + 头顶气泡；# 前缀消息：仅生成气泡（局域）
// 气泡按队列从上到下排列，5 秒内来新消息则整体重置存在时间
// ============================================================
import { system, world, TextPrimitive } from "@minecraft/server";

const BUBBLE_LIFETIME_TICKS = 100; // 5 秒
const MAX_BUBBLES = 5; // 单玩家同时最多显示的气泡数（超出丢弃最旧）
const BASE_Y = 2.8; // 气泡起始高度（头顶称号与名字上方）
const LINE_SPACING = 0.4; // 每条气泡的垂直间距

const bubbles = new Map(); // playerId -> { entries: [{ text, shape }], timer }

function removeBubbles(playerId) {
  const data = bubbles.get(playerId);
  if (!data) return;
  bubbles.delete(playerId);
  if (data.timer !== undefined) {
    try {
      system.clearRun(data.timer);
    } catch (e) {}
  }
  for (const entry of data.entries) {
    if (entry.shape) {
      try {
        world.primitiveShapesManager.removeText(entry.shape);
      } catch (e) {}
    }
  }
}

function renderBubbles(player, data) {
  for (const entry of data.entries) {
    if (entry.shape) {
      try {
        world.primitiveShapesManager.removeText(entry.shape);
      } catch (e) {}
      entry.shape = undefined;
    }
  }
  const count = data.entries.length;
  data.entries.forEach((entry, index) => {
    try {
      const shape = new TextPrimitive(
        { x: 0, y: BASE_Y + (count - 1 - index) * LINE_SPACING, z: 0 },
        entry.text
      );
      shape.scale = 1;
      shape.color = { red: 1, green: 1, blue: 1, alpha: 1 };
      shape.backgroundColorOverride = {
        red: 0,
        green: 0,
        blue: 0,
        alpha: 0.45,
      };
      shape.depthTest = false;
      shape.attachedTo = player;
      world.primitiveShapesManager.addText(shape, player.dimension);
      entry.shape = shape;
    } catch (e) {
      console.warn(`[ChatBubble] 气泡创建失败: ${e}`);
    }
  });
}

export function addChatBubble(player, text) {
  if (!player || !text) return;
  let data = bubbles.get(player.id);
  if (!data) {
    data = { entries: [], timer: undefined };
    bubbles.set(player.id, data);
  }
  data.entries.push({ text, shape: undefined });
  while (data.entries.length > MAX_BUBBLES) {
    const dropped = data.entries.shift();
    if (dropped.shape) {
      try {
        world.primitiveShapesManager.removeText(dropped.shape);
      } catch (e) {}
    }
  }
  renderBubbles(player, data);
  if (data.timer !== undefined) {
    try {
      system.clearRun(data.timer);
    } catch (e) {}
  }
  data.timer = system.runTimeout(
    () => removeBubbles(player.id),
    BUBBLE_LIFETIME_TICKS
  );
}

export function init() {
  world.afterEvents.playerLeave.subscribe((event) => {
    removeBubbles(event.playerId);
  });
  world.afterEvents.playerDimensionChange.subscribe((event) => {
    removeBubbles(event.player.id);
  });
}
