// ============================================================
// 大厅保护：主世界（大厅）内非管理员禁止破坏/放置方块、
// 攻击、使用道具、交互方块与实体；并阻止主世界生成实体（白名单放行）。
// 管理员以 op tag 判定。菜单时钟必须放行（右键时钟走 itemUse 事件打开菜单）。
// ============================================================
import { system, world } from "@minecraft/server";
import { LOBBY_DIMENSION_ID } from "./config.js";

const warnCooldown = new Map();

// 主世界实体生成白名单：其余实体生成后立即移除（玩家/签到烟花放行）
const ENTITY_SPAWN_WHITELIST = new Set([
  "minecraft:player",
  "minecraft:fireworks_rocket",
  "minecraft:armor_stand",
]);

function isAdmin(entity) {
  return entity?.hasTag?.("op") ?? false;
}

function inLobby(entity) {
  return entity?.dimension?.id === LOBBY_DIMENSION_ID;
}

function warnOnce(player, message) {
  const now = system.currentTick;
  if ((warnCooldown.get(player.id) ?? 0) + 60 > now) return; // 3 秒冷却防刷屏
  warnCooldown.set(player.id, now);
  player.sendMessage(message);
}

export function init() {
  // 阻止主世界生成实体（白名单放行）：同时拦截自然流浪商人/物品掉落等
  world.afterEvents.entitySpawn.subscribe((event) => {
    const ent = event.entity;
    if (!ent || ent.dimension?.id !== LOBBY_DIMENSION_ID) return;
    if (ENTITY_SPAWN_WHITELIST.has(ent.typeId)) return;
    try {
      ent.remove();
    } catch (e) {}
  });

  world.beforeEvents.playerBreakBlock.subscribe((event) => {
    const p = event.player;
    if (!isAdmin(p) && inLobby(p)) {
      event.cancel = true;
      warnOnce(p, "§c大厅内禁止破坏方块");
    }
  });

  world.beforeEvents.playerPlaceBlock.subscribe((event) => {
    const p = event.player;
    if (!isAdmin(p) && inLobby(p)) {
      event.cancel = true;
      warnOnce(p, "§c大厅内禁止放置方块");
    }
  });

  world.beforeEvents.itemUse.subscribe((event) => {
    const p = event.source;
    if (isAdmin(p) || !inLobby(p)) return;
    // 时钟用于打开菜单，必须放行
    if (event.itemStack?.typeId === "minecraft:clock") return;
    event.cancel = true;
    warnOnce(p, "§c大厅内禁止使用道具");
  });

  world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const p = event.player;
    if (isAdmin(p) || !inLobby(p)) return;
    event.cancel = true;
    warnOnce(p, "§c大厅内禁止对方块使用道具");
  });

  world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    const p = event.player;
    if (isAdmin(p) || !inLobby(p)) return;
    event.cancel = true;
    warnOnce(p, "§c大厅内禁止与实体交互");
  });

  world.beforeEvents.entityHurt.subscribe((event) => {
    const attacker = event.damageSource?.damagingEntity;
    if (!attacker || attacker.typeId !== "minecraft:player") return;
    if (isAdmin(attacker) || !inLobby(attacker)) return;
    event.cancel = true;
    warnOnce(attacker, "§c大厅内禁止攻击");
  });

}
