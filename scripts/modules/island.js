import {
  system,
  world,
  ItemStack,
  GameMode,
  BlockVolume,
} from "@minecraft/server";
import { CustomForm, ObservableNumber } from "@minecraft/server-ui";
import { teleportPlayer } from "../lib/teleport.js";
import { clearSignin } from "./signin.js";
import { clearLavaStreak } from "./ore-gen.js";
import {
  stashPlayerInventory,
  unstashPlayerInventory,
  clearLockerEntities,
} from "./locker.js";
import {
  DIMENSION_NAMESPACE,
  DIMENSION_COUNT,
  LOBBY_DIMENSION_ID,
  BOUND_COUNTER_KEY,
  PLAYER_BOUND_PREFIX,
  JOIN_FLAG_PREFIX,
  ISLAND_OWNER_PREFIX,
  ISLAND_MEMBERS_PREFIX,
  ISLAND_STATUS_PREFIX,
  ISLAND_JOIN_REQ_PREFIX,
  ISLAND_VISIT_REQ_PREFIX,
  ISLAND_NOTIFICATIONS_PREFIX,
  ISLAND_BOUNDARY_PREFIX,
  ISLAND_BOUNDARY_LIMIT,
  ISLAND_BOUNDARY_INITIAL,
  ISLAND_RESET_DELAY_MS,
  ISLAND_RESET_SCHEDULE_PREFIX,
  MAX_ISLAND_MEMBERS,
} from "./config.js";

// ============================================================
// 岛屿数据模型
// ============================================================

function getBoundCount() {
  return world.getDynamicProperty(BOUND_COUNTER_KEY) ?? 0;
}
function incrementBoundCount() {
  world.setDynamicProperty(BOUND_COUNTER_KEY, getBoundCount() + 1);
}

export function getPlayerBoundIndex(playerId) {
  return world.getDynamicProperty(PLAYER_BOUND_PREFIX + playerId);
}
export function setPlayerBound(playerId, index) {
  world.setDynamicProperty(PLAYER_BOUND_PREFIX + playerId, index);
}

export function hasPlayerJoinedBefore(playerId) {
  return world.getDynamicProperty(JOIN_FLAG_PREFIX + playerId) ?? false;
}
export function markPlayerJoined(playerId) {
  world.setDynamicProperty(JOIN_FLAG_PREFIX + playerId, true);
}

export function getIslandOwner(index) {
  return world.getDynamicProperty(ISLAND_OWNER_PREFIX + index);
}
export function setIslandOwner(index, playerId) {
  world.setDynamicProperty(ISLAND_OWNER_PREFIX + index, playerId);
}
export function getIslandMembers(index) {
  const raw = world.getDynamicProperty(ISLAND_MEMBERS_PREFIX + index);
  return raw ? JSON.parse(raw) : [];
}
export function setIslandMembers(index, members) {
  world.setDynamicProperty(
    ISLAND_MEMBERS_PREFIX + index,
    JSON.stringify(members)
  );
}
export function getIslandStatus(index) {
  return world.getDynamicProperty(ISLAND_STATUS_PREFIX + index) ?? "active";
}
export function setIslandStatus(index, status) {
  world.setDynamicProperty(ISLAND_STATUS_PREFIX + index, status);
}

// --- 动态边界（六极值，只增不减，用于自动重置范围） ---
function getIslandBoundary(index) {
  const raw = world.getDynamicProperty(ISLAND_BOUNDARY_PREFIX + index);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {}
  }
  return { ...ISLAND_BOUNDARY_INITIAL };
}

function setIslandBoundary(index, boundary) {
  world.setDynamicProperty(
    ISLAND_BOUNDARY_PREFIX + index,
    JSON.stringify(boundary)
  );
}

function resetIslandBoundary(index) {
  world.setDynamicProperty(ISLAND_BOUNDARY_PREFIX + index, undefined);
}

function getJoinRequests(index) {
  const raw = world.getDynamicProperty(ISLAND_JOIN_REQ_PREFIX + index);
  return raw ? JSON.parse(raw) : [];
}
function addJoinRequest(index, playerId, playerName) {
  const reqs = getJoinRequests(index);
  if (!reqs.some((r) => r.playerId === playerId)) {
    reqs.push({ playerId, playerName, timestamp: Date.now() });
    world.setDynamicProperty(
      ISLAND_JOIN_REQ_PREFIX + index,
      JSON.stringify(reqs)
    );
  }
  addNotification(index, "join", playerId, playerName);
}
function removeJoinRequest(index, playerId) {
  const reqs = getJoinRequests(index).filter((r) => r.playerId !== playerId);
  world.setDynamicProperty(ISLAND_JOIN_REQ_PREFIX + index, JSON.stringify(reqs));
}
function getVisitRequests(index) {
  const raw = world.getDynamicProperty(ISLAND_VISIT_REQ_PREFIX + index);
  return raw ? JSON.parse(raw) : [];
}
function addVisitRequest(index, playerId, playerName) {
  const reqs = getVisitRequests(index);
  if (!reqs.some((r) => r.playerId === playerId)) {
    reqs.push({ playerId, playerName, timestamp: Date.now() });
    world.setDynamicProperty(
      ISLAND_VISIT_REQ_PREFIX + index,
      JSON.stringify(reqs)
    );
  }
  addNotification(index, "visit", playerId, playerName);
}
function removeVisitRequest(index, playerId) {
  const reqs = getVisitRequests(index).filter((r) => r.playerId !== playerId);
  world.setDynamicProperty(
    ISLAND_VISIT_REQ_PREFIX + index,
    JSON.stringify(reqs)
  );
}

// --- 通知消息 ---
export function getNotifications(index) {
  const raw = world.getDynamicProperty(ISLAND_NOTIFICATIONS_PREFIX + index);
  return raw ? JSON.parse(raw) : [];
}
function setNotifications(index, notifications) {
  world.setDynamicProperty(
    ISLAND_NOTIFICATIONS_PREFIX + index,
    JSON.stringify(notifications)
  );
}
function addNotification(index, type, playerId, playerName) {
  const notifications = getNotifications(index);
  notifications.push({ type, playerId, playerName, timestamp: Date.now() });
  setNotifications(index, notifications);
}
function removeNotification(index, idx) {
  const notifications = getNotifications(index);
  notifications.splice(idx, 1);
  setNotifications(index, notifications);
}

export function isIslandOwner(player, index) {
  return getIslandOwner(index) === player.id;
}
export function isIslandMember(player, index) {
  return getIslandMembers(index).includes(player.id);
}

/** 寻找可用岛屿 */
function findAvailableIsland() {
  const total = getBoundCount();
  for (let i = 1; i <= total; i++) {
    if (getIslandOwner(i) === undefined && getIslandStatus(i) === "pending") {
      return i;
    }
  }
  const nextIndex = total + 1;
  if (nextIndex > DIMENSION_COUNT) return null;
  return nextIndex;
}

/** 通过 ID 获取玩家名 */
export function getPlayerNameById(playerId) {
  const player = [...world.getPlayers()].find((p) => p.id === playerId);
  return player ? player.name : playerId.slice(0, 8) + "...";
}

// ============================================================
// 传送辅助：二段落地查找
// ============================================================

function teleportToIslandSafe(player, boundIndex) {
  const dimensionId = `${DIMENSION_NAMESPACE}:void_${boundIndex}`;
  const dimension = world.getDimension(dimensionId);

  teleportPlayer(player, { x: 0.5, y: 78, z: 0.5 }, { dimension });

  const doGroundFind = (attempt) => {
    try {
      let groundY = 77;
      for (let y = 77; y >= 64; y--) {
        if (!dimension.getBlock({ x: 0, y, z: 0 })?.isAir) {
          groundY = y;
          break;
        }
      }
      if (groundY === 77 && attempt === 1) {
        system.runTimeout(() => doGroundFind(2), 15);
        return;
      }
      teleportPlayer(player, { x: 0.5, y: groundY + 1, z: 0.5 }, { dimension });
    } catch (e) {
      console.error(`[Island] Ground find failed: ${e}`);
    }
  };
  system.runTimeout(() => doGroundFind(1), 10);
}

// ============================================================
// 岛屿操作
// ============================================================

export function handleLobby(player) {
  system.runTimeout(() => {
    try {
      // 离开岛屿前往大厅：背包/装备存入自己的岛屿储物柜（已在主世界则跳过）
      if (player.dimension.id !== LOBBY_DIMENSION_ID) {
        stashPlayerInventory(player);
      }
      const lobby = world.getDimension(LOBBY_DIMENSION_ID);
      teleportPlayer(player, { x: 0, y: 0, z: 0 }, { dimension: lobby });
    } catch (e) {
      console.error(`[Lobby] Teleport failed: ${e}`);
      player.sendMessage("§c传送至大厅失败，请重试");
      return;
    }
    player.sendMessage("§a已传送至大厅！");
    player.playSound("random.orb");
    try {
      player.removeTag("visitor");
      player.addTag("member");
    } catch (e) {}
    system.runTimeout(() => {
      try {
        if (String(player.getGameMode()).toLowerCase() !== "survival") {
          player.runCommand("gamemode survival @s");
        }
      } catch (e) {}
    }, 2);
  }, 0);
}

export function handleSpawn(player) {
  system.runTimeout(() => {
    const { x, y, z } = player.location;
    const boundIndex = getPlayerBoundIndex(player.id);

    if (
      boundIndex === undefined ||
      player.dimension.id !== `${DIMENSION_NAMESPACE}:void_${boundIndex}`
    ) {
      player.sendMessage("§c只能在自己的空岛上设置出生点！");
      return;
    }

    const belowBlock = player.dimension.getBlock({
      x: Math.floor(x),
      y: Math.floor(y) - 1,
      z: Math.floor(z),
    });
    if (!belowBlock || belowBlock.isAir) {
      player.sendMessage("§c脚下不能是虚空，请在实心方块上设置出生点！");
      return;
    }

    player.setSpawnPoint({
      dimension: player.dimension,
      x: Math.floor(x),
      y: Math.floor(y),
      z: Math.floor(z),
    });
    player.sendMessage("§a已在此处设置出生点！");
    player.playSound("random.orb");
  }, 0);
}

/** 回岛或创建岛屿 */
export function handleIsland(player) {
  const boundIndex = getPlayerBoundIndex(player.id);

  // 已绑定 → 传送回岛屿
  if (boundIndex !== undefined) {
    const status = getIslandStatus(boundIndex);
    if (
      status === "dirty" ||
      status === "pending" ||
      status === "cleaning" ||
      status === "review"
    ) {
      player.sendMessage("§c你的岛屿不可用，请稍后再试");
      return;
    }
    if (getIslandOwner(boundIndex) === undefined) {
      setIslandOwner(boundIndex, player.id);
      setIslandMembers(boundIndex, [player.id]);
      setIslandStatus(boundIndex, "active");
    }
    system.runTimeout(() => {
      try {
        teleportToIslandSafe(player, boundIndex);
        system.runTimeout(() => unstashPlayerInventory(player), 8);
        player.sendMessage("§a已将你传送回空岛！输入 #lobby 以返回大厅！");
        player.playSound("random.orb");
        try {
          player.removeTag("visitor");
          player.addTag("member");
        } catch (e) {}
      } catch (e) {
        console.error(`[Island] Return teleport failed: ${e}`);
        player.sendMessage("§c传送回岛屿失败，请重试");
      }
    }, 0);
    return;
  }

  // 未绑定 → 创建新空岛
  const nextIndex = findAvailableIsland();
  if (nextIndex === null) {
    player.sendMessage("§c所有空岛已被分配完毕！");
    return;
  }

  const dimensionId = `${DIMENSION_NAMESPACE}:void_${nextIndex}`;
  system.runTimeout(() => {
    try {
      const dimension = world.getDimension(dimensionId);

      setPlayerBound(player.id, nextIndex);
      if (nextIndex > getBoundCount()) {
        incrementBoundCount();
      }

      teleportPlayer(player, { x: 0, y: 77, z: 0 }, { dimension });
      player.setSpawnPoint({ dimension, x: 0, y: 78, z: 0 });
      system.runTimeout(() => {
        try {
          player.runCommand(`structure load "island_base" -4 64 -4`);
        } catch (e) {}
      }, 5);

      world.sendMessage(`§a玩家 ${player.name} 开启了空岛之旅`);
      player.playSound("random.orb");
      try {
        player.removeTag("visitor");
        player.addTag("member");
      } catch (e) {}

      setIslandOwner(nextIndex, player.id);
      setIslandMembers(nextIndex, [player.id]);
      setIslandStatus(nextIndex, "active");
    } catch (e) {
      console.error(`[Island] New island teleport failed: ${e}`);
      player.sendMessage("§c创建岛屿失败，请重试");
    }
  }, 0);
}

// ============================================================
// 访问/加入/转让
// ============================================================

export function handleVisitRequest(player, targetName) {
  const targetPlayer = [...world.getPlayers()].find(
    (p) => p.name === targetName
  );
  if (!targetPlayer) {
    player.sendMessage(`§c玩家 ${targetName} 不在线`);
    return;
  }
  if (targetPlayer.id === player.id) {
    player.sendMessage("§c不能访问自己的岛屿！");
    return;
  }
  const targetIsland = getPlayerBoundIndex(targetPlayer.id);
  if (targetIsland === undefined) {
    player.sendMessage(`§c玩家 ${targetName} 还未拥有空岛`);
    return;
  }
  if (getIslandStatus(targetIsland) !== "active") {
    player.sendMessage(`§c玩家 ${targetName} 的岛屿暂不可用`);
    return;
  }
  addVisitRequest(targetIsland, player.id, player.name);
  player.sendMessage(`§a已向 ${targetName} 发送访问申请`);
  if (isIslandOwner(targetPlayer, targetIsland)) {
    targetPlayer.sendMessage(
      `§e玩家 ${player.name} 想要访问你的岛屿，请在岛屿管理中处理`
    );
  }
}

export function handleJoinRequest(player, targetName) {
  const targetPlayer = [...world.getPlayers()].find(
    (p) => p.name === targetName
  );
  if (!targetPlayer) {
    player.sendMessage(`§c玩家 ${targetName} 不在线`);
    return;
  }
  if (targetPlayer.id === player.id) {
    player.sendMessage("§c不能加入自己的岛屿！");
    return;
  }
  const targetIsland = getPlayerBoundIndex(targetPlayer.id);
  if (targetIsland === undefined) {
    player.sendMessage(`§c玩家 ${targetName} 还未拥有空岛`);
    return;
  }
  if (getIslandStatus(targetIsland) !== "active") {
    player.sendMessage(`§c玩家 ${targetName} 的岛屿暂不可加入`);
    return;
  }
  if (getPlayerBoundIndex(player.id) !== undefined) {
    player.sendMessage("§c你已经拥有空岛，请先放弃当前岛屿再加入其他岛屿");
    return;
  }
  if (getIslandMembers(targetIsland).length >= MAX_ISLAND_MEMBERS) {
    player.sendMessage(`§c玩家 ${targetName} 的岛屿已满`);
    return;
  }
  addJoinRequest(targetIsland, player.id, player.name);
  player.sendMessage(`§a已向 ${targetName} 发送加入申请`);
  if (isIslandOwner(targetPlayer, targetIsland)) {
    targetPlayer.sendMessage(
      `§e玩家 ${player.name} 想要加入你的岛屿，请在岛屿管理中处理`
    );
  }
}

export function handleTransfer(player, targetName) {
  const targetPlayer = [...world.getPlayers()].find(
    (p) => p.name === targetName
  );
  if (!targetPlayer) {
    player.sendMessage(`§c玩家 ${targetName} 不在线`);
    return;
  }
  if (targetPlayer.id === player.id) {
    player.sendMessage("§c不能转让给自己！");
    return;
  }
  const islandIndex = getPlayerBoundIndex(player.id);
  if (islandIndex === undefined) {
    player.sendMessage("§c你还没有空岛！");
    return;
  }
  if (!isIslandOwner(player, islandIndex)) {
    player.sendMessage("§c只有岛主可以转让岛屿！");
    return;
  }
  const members = getIslandMembers(islandIndex);
  if (!members.includes(targetPlayer.id)) {
    player.sendMessage(`§c${targetName} 不是你的岛屿成员！`);
    return;
  }

  setIslandOwner(islandIndex, targetPlayer.id);
  player.sendMessage(
    `§a你已将岛屿 #${islandIndex} 转让给 ${targetName}，你已成为岛屿成员`
  );
  player.playSound("random.orb");
  targetPlayer.sendMessage(
    `§a${player.name} 已将岛屿 #${islandIndex} 转让给你，你已成为岛主！`
  );
  targetPlayer.playSound("random.levelup");
  world.sendMessage(
    `§e玩家 ${player.name} 将岛屿 #${islandIndex} 转让给了 ${targetName}`
  );
}

// ============================================================
// 放弃岛屿
// ============================================================

function giveMenuClock(player) {
  try {
    const inventory = player.getComponent("inventory").container;
    const clock = new ItemStack("minecraft:clock", 1);
    const leftover = inventory.addItem(clock);
    if (leftover) player.dimension.spawnItem(leftover, player.location);
    player.sendMessage("§a已给予菜单时钟，右键打开空岛菜单！");
    player.playSound("random.orb");
  } catch (e) {}
}

function abandonIsland(player, islandIndex) {
  const members = getIslandMembers(islandIndex);
  const dimensionId = `${DIMENSION_NAMESPACE}:void_${islandIndex}`;
  const lobby = world.getDimension(LOBBY_DIMENSION_ID);

  // 传送访客到大厅
  const allPlayers = [...world.getPlayers()];
  for (const p of allPlayers) {
    if (p.dimension.id !== dimensionId) continue;
    if (members.includes(p.id)) continue;
    try {
      p.teleport({ x: 0, y: 0, z: 0 }, { dimension: lobby });
      p.removeTag("visitor");
      p.addTag("member");
      p.sendMessage("§c你访问的岛屿已被放弃，已传送回大厅");
      p.playSound("random.break");
    } catch (e) {}
  }

  // 解绑所有成员
  for (const memberId of members) {
    // 先移除储物柜实体（此时成员仍绑定，可定位其岛屿维度）
    clearLockerEntities(memberId);
    world.setDynamicProperty(PLAYER_BOUND_PREFIX + memberId, undefined);
    world.setDynamicProperty(JOIN_FLAG_PREFIX + memberId, undefined);
    clearSignin(memberId);
    clearLavaStreak(memberId);

    const onlineMember = [...world.getPlayers()].find(
      (p) => p.id === memberId
    );
    if (onlineMember) {
      onlineMember.runCommand("scoreboard players set @s money 0");
      try {
        onlineMember.getComponent("minecraft:inventory").container.clearAll();
      } catch (e) {}
      onlineMember.setSpawnPoint({ dimension: lobby, x: 0, y: 0, z: 0 });
      if (onlineMember.dimension.id === dimensionId) {
        try {
          onlineMember.teleport(
            { x: 0, y: 0, z: 0 },
            { dimension: lobby }
          );
        } catch (e) {
          console.error(`[AbandonIsland] Member teleport failed: ${e}`);
        }
      }
      onlineMember.sendMessage("§c你所在的岛屿已被岛主放弃，所有数据已清空");
      onlineMember.playSound("random.break");
      giveMenuClock(onlineMember);
      try {
        onlineMember.removeTag("visitor");
        onlineMember.addTag("member");
      } catch (e) {}
    } else {
      try {
        lobby.runCommand(`scoreboard players set "${memberId}" money 0`);
      } catch (e) {}
    }
  }

  // 清空岛屿管理数据
  world.setDynamicProperty(ISLAND_OWNER_PREFIX + islandIndex, undefined);
  world.setDynamicProperty(ISLAND_MEMBERS_PREFIX + islandIndex, undefined);
  world.setDynamicProperty(ISLAND_JOIN_REQ_PREFIX + islandIndex, undefined);
  world.setDynamicProperty(ISLAND_VISIT_REQ_PREFIX + islandIndex, undefined);
  world.setDynamicProperty(
    ISLAND_NOTIFICATIONS_PREFIX + islandIndex,
    undefined
  );
  scheduleIslandReset(islandIndex);

  player.sendMessage("§c岛屿已放弃，60 秒后自动重置，重置完成后等待管理员确认开放");
  player.playSound("random.break");
  world.sendMessage(`§c玩家 ${player.name} 放弃了岛屿 #${islandIndex}`);
}

// ============================================================
// 离开岛屿
// ============================================================

function leaveIsland(player) {
  const boundIndex = getPlayerBoundIndex(player.id);
  if (boundIndex === undefined) return;

  const members = getIslandMembers(boundIndex).filter(
    (id) => id !== player.id
  );
  setIslandMembers(boundIndex, members);
  clearLockerEntities(player.id);
  world.setDynamicProperty(PLAYER_BOUND_PREFIX + player.id, undefined);
  clearSignin(player.id);
  clearLavaStreak(player.id);

  system.runTimeout(() => {
    try {
      player.runCommand("scoreboard players set @s money 0");
      try {
        player.getComponent("minecraft:inventory").container.clearAll();
      } catch (e) {}
      const lobby = world.getDimension(LOBBY_DIMENSION_ID);
      player.setSpawnPoint({ dimension: lobby, x: 0, y: 0, z: 0 });
      player.teleport({ x: 0, y: 0, z: 0 }, { dimension: lobby });
      giveMenuClock(player);
      try {
        player.removeTag("visitor");
        player.addTag("member");
      } catch (e) {}
    } catch (e) {
      console.error(`[LeaveIsland] Teleport failed: ${e}`);
      player.sendMessage("§c离开岛屿失败，请重试");
    }
  }, 1);

  addNotification(boundIndex, "leave", player.id, player.name);
  player.sendMessage("§a你已离开岛屿，数据已清空（含背包）");
  player.playSound("random.break");
}

// ============================================================
// 岛主 DDUI 菜单
// ============================================================

function showIslandSubMenu(player, backFn) {
  const boundIndex = getPlayerBoundIndex(player.id);
  const hasIsland = boundIndex !== undefined;
  const isOwner = hasIsland && isIslandOwner(player, boundIndex);

  const target = new ObservableNumber(0, { clientWritable: true });
  const idMap = [null];
  const options = (() => {
    const opts = [{ label: "请选择...", value: 0 }];
    let idx = 1;
    for (const p of world.getPlayers()) {
      if (p.id !== player.id && getPlayerBoundIndex(p.id) !== undefined) {
        opts.push({ label: p.name, value: idx });
        idMap.push(p.id);
        idx++;
      }
    }
    return opts;
  })();

  let f = new CustomForm(player, "岛屿");

  if (hasIsland) {
    f = f.label(`§e岛屿 #${boundIndex}`);
    f = f.spacer();
    f = f.button("成员列表", () => {
      f.close();
      system.runTimeout(
        () => showMemberList(player, boundIndex, backFn),
        2
      );
    });
    if (isOwner) {
      f = f.spacer();
      f = f.button("消息", () => {
        f.close();
        system.runTimeout(
          () => showNotificationCenter(player, boundIndex, backFn),
          2
        );
      });
      f = f.spacer();
      f = f.button("转让岛屿", () => {
        f.close();
        system.runTimeout(
          () => showTransferSelect(player, boundIndex, backFn),
          2
        );
      });
    }
  } else {
    f = f.label("§e你还未拥有空岛");
  }

  f = f.spacer();
  f = f.label(hasIsland ? "--- 访问他人岛屿 ---" : "--- 加入他人岛屿 ---");
  f = f.spacer();
  f = f.dropdown("选择岛主", target, options);
  f = f.spacer();

  if (hasIsland) {
    f = f.button("申请访问", () => {
      const idx = target.getData();
      const targetId = idMap[idx];
      if (!targetId) {
        player.sendMessage("§c请选择目标玩家！");
        return;
      }
      const tp = [...world.getPlayers()].find((p) => p.id === targetId);
      if (!tp) {
        player.sendMessage("§c目标玩家已离线！");
        return;
      }
      handleVisitRequest(player, tp.name);
      f.close();
    });
  } else {
    f = f.button("申请加入", () => {
      const idx = target.getData();
      const targetId = idMap[idx];
      if (!targetId) {
        player.sendMessage("§c请选择目标玩家！");
        return;
      }
      const tp = [...world.getPlayers()].find((p) => p.id === targetId);
      if (!tp) {
        player.sendMessage("§c目标玩家已离线！");
        return;
      }
      handleJoinRequest(player, tp.name);
      f.close();
    });
  }

  if (hasIsland) {
    f = f.spacer();
    if (isOwner) {
      f = f.button("放弃岛屿", () => {
        f.close();
        system.runTimeout(
          () => showAbandonConfirm(player, boundIndex, backFn),
          2
        );
      });
    } else {
      f = f.button("离开岛屿", () => {
        try {
          f.close();
        } catch (e) {}
        system.runTimeout(() => leaveIsland(player), 2);
      });
    }
  }

  f = f.spacer();
  f = f.button("返回", () => {
    f.close();
    system.runTimeout(() => backFn(player), 2);
  });
  f.show().catch((e) => console.warn("Form show failed:", e));
}

// --- 成员列表 ---
function showMemberList(player, boundIndex, backFn) {
  const members = getIslandMembers(boundIndex);
  const form = new CustomForm(player, "成员列表");
  form.label(`§e岛屿成员 (${members.length}/${MAX_ISLAND_MEMBERS})`);

  for (const memberId of members) {
    form.spacer();
    const memberName = getPlayerNameById(memberId);
    const isOwner = memberId === getIslandOwner(boundIndex);
    if (isIslandOwner(player, boundIndex) && !isOwner) {
      form.button(`踢出 ${memberName}`, () => {
        form.close();
        system.runTimeout(
          () => confirmKickMember(player, boundIndex, memberId, backFn),
          2
        );
      });
    } else {
      form.label(isOwner ? `§6[岛主] ${memberName}` : `§7${memberName}`);
    }
  }

  form.spacer().button("返回", () => {
    form.close();
    system.runTimeout(() => showIslandSubMenu(player, backFn), 2);
  });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

// --- 踢出确认 ---
function confirmKickMember(player, islandIndex, targetId, backFn) {
  const targetName = getPlayerNameById(targetId);
  const form = new CustomForm(player, "确认踢出")
    .label(`§c确定要将 ${targetName} 踢出岛屿吗？`)
    .spacer()
    .button("确认踢出", () => {
      const members = getIslandMembers(islandIndex).filter(
        (id) => id !== targetId
      );
      setIslandMembers(islandIndex, members);
      clearLockerEntities(targetId);
      world.setDynamicProperty(PLAYER_BOUND_PREFIX + targetId, undefined);
      clearSignin(targetId);
      clearLavaStreak(targetId);

      const target = [...world.getPlayers()].find((p) => p.id === targetId);
      if (target) {
        target.sendMessage("§c你已被踢出岛屿！");
        target.playSound("random.break");
        giveMenuClock(target);
        try {
          const lobby = world.getDimension(LOBBY_DIMENSION_ID);
          target.setSpawnPoint({ dimension: lobby, x: 0, y: 0, z: 0 });
          target.teleport({ x: 0, y: 0, z: 0 }, { dimension: lobby });
        } catch (e) {
          console.error(`[Kick] Teleport failed: ${e}`);
        }
        try {
          target.removeTag("visitor");
          target.addTag("member");
        } catch (e) {}
      }

      player.sendMessage(`§a已将 ${targetName} 踢出岛屿`);
      player.playSound("random.orb");
      addNotification(islandIndex, "leave", targetId, targetName);
      form.close();
    })
    .spacer()
    .button("取消", () => {
      form.close();
      system.runTimeout(() => showMemberList(player, islandIndex, backFn), 2);
    });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

// --- 转让选择 ---
function showTransferSelect(player, boundIndex, backFn) {
  const members = getIslandMembers(boundIndex);
  const otherMembers = members.filter((id) => id !== player.id);

  if (otherMembers.length === 0) {
    player.sendMessage("§c没有其他成员可以转让！");
    return;
  }

  const transferIdMap = [];
  const transferOptions = otherMembers.map((id, i) => {
    transferIdMap.push(id);
    return { label: getPlayerNameById(id), value: i };
  });
  const transferTarget = new ObservableNumber(0, { clientWritable: true });

  const form = new CustomForm(player, "转让岛屿")
    .label("§e选择要转让的成员")
    .spacer()
    .dropdown("目标成员", transferTarget, transferOptions)
    .spacer()
    .button("确认转让", () => {
      const targetId = transferIdMap[transferTarget.getData()];
      const targetName = getPlayerNameById(targetId);
      form.close();
      system.runTimeout(() => handleTransfer(player, targetName), 2);
    })
    .spacer()
    .button("返回", () => {
      form.close();
      system.runTimeout(() => showIslandSubMenu(player, backFn), 2);
    });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

// --- 消息中心 ---
function showNotificationCenter(player, boundIndex, backFn) {
  const notifications = getNotifications(boundIndex);
  const now = Date.now();
  const cleaned = [];
  for (const n of notifications) {
    if (
      (n.type === "visit" || n.type === "join") &&
      now - n.timestamp > 60000
    ) {
      if (n.type === "visit") removeVisitRequest(boundIndex, n.playerId);
      else removeJoinRequest(boundIndex, n.playerId);
      const target = [...world.getPlayers()].find((p) => p.id === n.playerId);
      if (target)
        target.sendMessage(
          `§c你的${n.type === "visit" ? "访问" : "加入"}申请已超时，被自动拒绝`
        );
      continue;
    }
    cleaned.push(n);
  }
  if (cleaned.length !== notifications.length) {
    setNotifications(boundIndex, cleaned);
  }
  const activeNotifications = cleaned;
  const members = getIslandMembers(boundIndex);

  const form = new CustomForm(player, "消息");
  form.label(`§e岛屿 #${boundIndex} 消息中心`);
  form.spacer();

  const options = ["请选择一条消息..."];
  const items = [];

  for (let i = 0; i < activeNotifications.length; i++) {
    const n = activeNotifications[i];
    const prefix =
      n.type === "visit"
        ? "[访问] "
        : n.type === "join"
          ? "[加入] "
          : "[退出] ";
    options.push(`${prefix}${n.playerName}`);
    items.push({ ...n, sourceIdx: i });
  }

  if (options.length === 1) {
    form.label("§7暂无消息");
    form.spacer().button("返回", () => {
      form.close();
      system.runTimeout(() => showIslandSubMenu(player, backFn), 2);
    });
    form.show().catch((e) => console.warn("Form show failed:", e));
    return;
  }

  const dropdownItems = options.map((label, i) => ({ label, value: i }));
  const dropdownValue = new ObservableNumber(0, { clientWritable: true });
  form.dropdown("选择消息", dropdownValue, dropdownItems);

  form.spacer();
  form.button("同意", () => {
    const idx = dropdownValue.getData();
    if (idx === 0) {
      player.sendMessage("§c请先选择一条消息");
      return;
    }
    const item = items[idx - 1];
    if (item.type !== "visit" && item.type !== "join") {
      player.sendMessage("§c该消息类型不支持同意操作");
      return;
    }

    const target = [...world.getPlayers()].find(
      (p) => p.id === item.playerId
    );
    if (item.type === "visit") {
      removeVisitRequest(boundIndex, item.playerId);
      removeNotification(boundIndex, item.sourceIdx);
      if (target) {
        // 访问他人岛屿前：背包/装备存入自己的岛屿储物柜
        stashPlayerInventory(target);
        system.runTimeout(() => {
          try {
            teleportToIslandSafe(target, boundIndex);
          } catch (e) {
            console.error(`[Visit] Teleport failed: ${e}`);
            target.sendMessage("§c传送失败，请重试");
          }
        }, 1);
        target.sendMessage(
          `§a访问申请已通过，正在传送到岛屿 #${boundIndex}`
        );
        target.playSound("random.orb");
        try {
          target.removeTag("member");
          target.addTag("visitor");
        } catch (e) {}
      }
      player.sendMessage(`§a已同意 ${item.playerName} 的访问申请`);
    } else {
      removeJoinRequest(boundIndex, item.playerId);
      removeNotification(boundIndex, item.sourceIdx);
      if (members.length < MAX_ISLAND_MEMBERS) {
        const newMembers = [
          ...getIslandMembers(boundIndex),
          item.playerId,
        ];
        setIslandMembers(boundIndex, newMembers);
        setPlayerBound(item.playerId, boundIndex);
        if (target) {
          target.sendMessage(
            `§a加入申请已通过，你已成为岛屿 #${boundIndex} 的成员！`
          );
          target.playSound("random.orb");
        }
        player.sendMessage(`§a已同意 ${item.playerName} 加入岛屿`);
      } else {
        player.sendMessage("§c岛屿已满，无法接受加入申请");
      }
    }
    form.close();
    system.runTimeout(
      () => showNotificationCenter(player, boundIndex, backFn),
      2
    );
  });

  form.spacer();
  form.button("拒绝", () => {
    const idx = dropdownValue.getData();
    if (idx === 0) {
      player.sendMessage("§c请先选择一条消息");
      return;
    }
    const item = items[idx - 1];
    if (item.type !== "visit" && item.type !== "join") {
      player.sendMessage("§c该消息类型不支持拒绝操作");
      return;
    }

    if (item.type === "visit") removeVisitRequest(boundIndex, item.playerId);
    else removeJoinRequest(boundIndex, item.playerId);
    removeNotification(boundIndex, item.sourceIdx);

    const target = [...world.getPlayers()].find(
      (p) => p.id === item.playerId
    );
    if (target)
      target.sendMessage(
        `§c你的${item.type === "visit" ? "访问" : "加入"}申请被拒绝`
      );
    form.close();
    player.sendMessage(
      `§c已拒绝 ${item.playerName} 的${item.type === "visit" ? "访问" : "加入"}申请`
    );
    system.runTimeout(
      () => showNotificationCenter(player, boundIndex, backFn),
      2
    );
  });

  form.spacer();
  form.button("确认清除", () => {
    const idx = dropdownValue.getData();
    if (idx === 0) {
      player.sendMessage("§c请先选择一条消息");
      return;
    }
    const item = items[idx - 1];
    if (item.type !== "leave") {
      player.sendMessage("§c退出消息才能确认清除，访问/加入请使用同意/拒绝");
      return;
    }
    removeNotification(boundIndex, item.sourceIdx);
    form.close();
    player.sendMessage(`§a已清除 ${item.playerName} 的退出消息`);
    system.runTimeout(
      () => showNotificationCenter(player, boundIndex, backFn),
      2
    );
  });

  form.spacer();
  form.button("返回", () => {
    form.close();
    system.runTimeout(() => showIslandSubMenu(player, backFn), 2);
  });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

// --- 放弃岛屿确认 ---
function showAbandonConfirm(player, boundIndex, backFn) {
  const form = new CustomForm(player, "放弃岛屿")
    .label("§c§l警告：放弃岛屿后：")
    .spacer()
    .label("§7- 所有成员将被解绑")
    .spacer()
    .label("§7- 所有玩家数据将被清除（包括金币）")
    .spacer()
    .label("§7- 岛屿将被清空重置")
    .spacer()
    .label("§7- 此操作不可撤销！")
    .spacer()
    .button("确认放弃", () => {
      abandonIsland(player, boundIndex);
      form.close();
    })
    .spacer()
    .button("取消", () => {
      form.close();
      system.runTimeout(() => showIslandSubMenu(player, backFn), 2);
    });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

// ============================================================
// 动态边界：记录玩家放置方块的最远范围（六极值，只增不减）
// ============================================================

export function init() {
  // world API 需在世界启动后可用：恢复被中断的重置倒计时
  system.beforeEvents.startup.subscribe(() => {
    try {
      restorePendingResets();
    } catch (e) {
      console.error(`[Island] Restore pending resets failed: ${e}`);
    }
  });

  world.afterEvents.playerPlaceBlock.subscribe((event) => {
    const player = event.player;
    if (!player) return;
    const boundIndex = getPlayerBoundIndex(player.id);
    if (boundIndex === undefined) return;
    const dimensionId = `${DIMENSION_NAMESPACE}:void_${boundIndex}`;
    if (event.dimension.id !== dimensionId) return;

    const { x, y, z } = event.block.location;
    const b = getIslandBoundary(boundIndex);
    const limit = ISLAND_BOUNDARY_LIMIT;

    // 超出上限的放置不扩展边界（静默处理，不打扰玩家），避免重置范围爆炸
    if (
      Math.max(Math.abs(x), Math.abs(z)) > limit ||
      Math.abs(y) > limit
    ) {
      return;
    }

    let changed = false;
    if (x < b.xMin) {
      b.xMin = x;
      changed = true;
    }
    if (x > b.xMax) {
      b.xMax = x;
      changed = true;
    }
    if (y < b.yMin) {
      b.yMin = y;
      changed = true;
    }
    if (y > b.yMax) {
      b.yMax = y;
      changed = true;
    }
    if (z < b.zMin) {
      b.zMin = z;
      changed = true;
    }
    if (z > b.zMax) {
      b.zMax = z;
      changed = true;
    }
    if (changed) setIslandBoundary(boundIndex, b);
  });
}

// ============================================================
// 自动重置：放弃后按动态边界清空并重载初始结构
// ============================================================

function scheduleIslandReset(index) {
  setIslandStatus(index, "cleaning");
  world.setDynamicProperty(
    ISLAND_RESET_SCHEDULE_PREFIX + index,
    Date.now() + ISLAND_RESET_DELAY_MS
  );
  system.runTimeout(
    () => runIslandReset(index),
    Math.max(1, Math.floor(ISLAND_RESET_DELAY_MS / 50))
  );
}

function runIslandReset(index) {
  performIslandReset(index).catch((e) => {
    console.error(`[Island] Auto reset failed: ${e}`);
    setIslandStatus(index, "dirty");
    world.setDynamicProperty(ISLAND_RESET_SCHEDULE_PREFIX + index, undefined);
    world.sendMessage(
      `§c岛屿 #${index} 自动重置失败，已标记为待重置，请管理员人工处理`
    );
  });
}

/** 脚本重载后恢复被中断的重置倒计时 */
function restorePendingResets() {
  const total = getBoundCount();
  for (let i = 1; i <= total; i++) {
    if (getIslandStatus(i) !== "cleaning") continue;
    const target = world.getDynamicProperty(ISLAND_RESET_SCHEDULE_PREFIX + i);
    const remaining =
      typeof target === "number" ? target - Date.now() : 0;
    system.runTimeout(
      () => runIslandReset(i),
      remaining > 0 ? Math.max(1, Math.ceil(remaining / 50)) : 1
    );
    if (remaining <= 0) {
      world.sendMessage(`§e岛屿 #${i} 重置倒计时已在重载期间结束，立即执行重置`);
    }
  }
}

async function performIslandReset(index) {
  const boundary = getIslandBoundary(index);
  const limit = ISLAND_BOUNDARY_LIMIT;
  const x1 = Math.max(-limit, boundary.xMin);
  const x2 = Math.min(limit, boundary.xMax);
  const z1 = Math.max(-limit, boundary.zMin);
  const z2 = Math.min(limit, boundary.zMax);
  const y1 = Math.max(-64, boundary.yMin);
  const y2 = Math.min(319, boundary.yMax);
  if (x1 > x2 || z1 > z2 || y1 > y2) {
    setIslandStatus(index, "dirty");
    world.setDynamicProperty(ISLAND_RESET_SCHEDULE_PREFIX + index, undefined);
    return;
  }

  const dimensionId = `${DIMENSION_NAMESPACE}:void_${index}`;
  const dim = world.getDimension(dimensionId);
  const manager = world.tickingAreaManager;
  const areaName = `island_reset_${index}`;
  const air = "minecraft:air";

  // 按 32×32 瓦片滚动：临时常加载 → 等待区块加载 → 分 y 段 fill → 移除区域
  for (let tx = x1; tx <= x2; tx += 32) {
    for (let tz = z1; tz <= z2; tz += 32) {
      const fx = Math.min(tx + 31, x2);
      const fz = Math.min(tz + 31, z2);
      const tileOptions = {
        dimension: dim,
        from: { x: tx, y: y1, z: tz },
        to: { x: fx, y: y2, z: fz },
      };
      try {
        if (!manager.hasTickingArea(areaName)) {
          if (!manager.hasCapacity(tileOptions)) {
            console.warn(`[Island] 重置瓦片 ${tx},${tz} 超出区块预算，跳过`);
            continue;
          }
          await manager.createTickingArea(areaName, tileOptions);
        }
        await system.waitTicks(30); // 等待区块加载
        for (let y = y1; y <= y2; y += 32) {
          const fy = Math.min(y + 31, y2);
          try {
            dim.fillBlocks(
              new BlockVolume(
                { x: tx, y, z: tz },
                { x: fx, y: fy, z: fz }
              ),
              air
            );
          } catch (e) {
            console.warn(`[Island] 重置 fill 失败 ${tx},${y},${tz}: ${e}`);
          }
          await system.waitTicks(1);
        }
        manager.removeTickingArea(areaName);
      } catch (e) {
        console.error(`[Island] 重置瓦片失败 ${tx},${tz}: ${e}`);
        try {
          manager.removeTickingArea(areaName);
        } catch (e2) {}
      }
    }
  }

  // 清理残留实体（仅限本岛屿维度，保留玩家）：
  // 传送到自身 xz 坐标、y=-104 的虚空，实体掉出世界自然移除，
  // 避免 kill 触发掉落物生成或史莱姆分裂等残留
  try {
    for (const ent of dim.getEntities({
      excludeTypes: ["minecraft:player"],
    })) {
      try {
        const loc = ent.location;
        ent.teleport({ x: loc.x, y: -104, z: loc.z });
      } catch (e) {}
    }
  } catch (e) {}

  // 边界重置，进入待确认状态（管理员人工兜底开放）
  resetIslandBoundary(index);
  world.setDynamicProperty(ISLAND_RESET_SCHEDULE_PREFIX + index, undefined);
  setIslandStatus(index, "review");
  world.sendMessage(`§a岛屿 #${index} 自动重置完成，等待管理员确认开放`);
}

// ============================================================
// 重新导出
// ============================================================

export { showIslandSubMenu, leaveIsland };
