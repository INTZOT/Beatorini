import { world } from "@minecraft/server";
import { TITLE_PREFIX, DEFAULT_TITLE } from "./config.js";

export function getPlayerTitle(playerId) {
  return world.getDynamicProperty(TITLE_PREFIX + playerId) || DEFAULT_TITLE;
}

export function setPlayerTitle(playerId, title) {
  world.setDynamicProperty(TITLE_PREFIX + playerId, title);
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
