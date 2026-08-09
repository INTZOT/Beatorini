import { system, world, ItemStack, EntityInitializationCause } from "@minecraft/server";
import { CustomForm, ObservableString, ObservableNumber } from "@minecraft/server-ui";
import { getPlayerMoney } from "./money.js";
import { getPlayerTitle, handleTitleCommand } from "./title.js";
import {
  getPlayerBoundIndex,
  handleLobby,
  handleSpawn,
  handleIsland,
  handleVisitRequest,
  handleJoinRequest,
  handleTransfer,
  showIslandSubMenu,
  getIslandStatus,
  getIslandOwner,
  getIslandMembers,
  setIslandStatus,
  getPlayerNameById,
  markPlayerJoined,
  hasPlayerJoinedBefore,
} from "./island.js";
import { getAchievements, ACHIEVEMENTS } from "./achievements.js";
import { showLeaderboardMenu } from "./leaderboard.js";
import { showTalentMenu } from "./talent.js";
import { toggleSoul, isSoulActive } from "./soul.js";
import { showMarketMenu, showMarketUnlockForm, onPlayerJoin as marketOnPlayerJoin } from "./market.js";
import { showRecycleCategoryMenu } from "./recycle.js";
import { showSigninForm } from "./signin.js";
import { showAssistantMenu, getAssistSettings } from "./assistants.js";
import { debugVault } from "./vault.js";
import { showLotteryMenu } from "./lottery.js";
import { showImageTestForm } from "./imgtest.js";
import { DIMENSION_NAMESPACE, LOBBY_DIMENSION_ID, MAX_ISLAND_MEMBERS, MARKET_UNLOCKED_PREFIX, TRANSFER_TAX_RATE } from "./config.js";

// ============================================================
// 主菜单
// ============================================================

function showIslandMenu(player) {
  const hasIsland = getPlayerBoundIndex(player.id) !== undefined;
  const islandLabel = hasIsland ? "返回空岛" : "创建空岛";
  const money = getPlayerMoney(player);
  let f = new CustomForm(player, "灯浮市Beatorini-主菜单");
  f = f.label(`§e玩家 ${player.name}\n§6金币数 ${money}`);
  f = f.spacer();
  f = f.button(islandLabel, () => {
    f.close();
    handleIsland(player);
  });
  f = f.button("返回大厅", () => {
    f.close();
    handleLobby(player);
  });
  f = f.button("设置重生点", () => {
    f.close();
    handleSpawn(player);
  });
  f = f.button("岛屿", () => {
    f.close();
    system.runTimeout(
      () => showIslandSubMenu(player, showIslandMenu),
      2
    );
  });
  f = f.button("成就列表", () => {
    f.close();
    system.runTimeout(() => showAchievementsMenu(player), 2);
  });
  f = f.button("排行榜", () => {
    f.close();
    system.runTimeout(
      () => showLeaderboardMenu(player, showIslandMenu),
      2
    );
  });
  f = f.button("天赋", () => {
    f.close();
    system.runTimeout(
      () => showTalentMenu(player, showIslandMenu),
      2
    );
  });
  f = f.button("辅助功能", () => {
    f.close();
    system.runTimeout(
      () => showAssistantMenu(player, showIslandMenu),
      2
    );
  });
  f = f.button("交易", () => {
    f.close();
    system.runTimeout(() => showTradeSubMenu(player), 2);
  });
  f = f.button("抽奖", () => {
    f.close();
    system.runTimeout(() => showLotteryMenu(player, showIslandMenu), 2);
  });
  f.show().catch((e) => console.warn("Form show failed:", e));
}

// ============================================================
// 成就列表
// ============================================================

function showAchievementsMenu(player) {
  const completed = getAchievements(player.id);
  const unlockedCount = completed.length;
  const totalCount = ACHIEVEMENTS.length;

  const form = new CustomForm(player, "成就列表")
    .label(`§e已解锁成就: ${unlockedCount}/${totalCount}`)
    .spacer();

  for (const ach of ACHIEVEMENTS) {
    const isUnlocked = completed.includes(ach.item);
    const line = isUnlocked
      ? `§a✔ ${ach.name} §7(+${ach.reward}金币)`
      : `§7✘ ${ach.name}`;
    form.label(line);
    form.spacer();
  }

  form
    .spacer()
    .button("返回主菜单", () => {
      form.close();
      system.runTimeout(() => showIslandMenu(player), 2);
    });

  form.show().catch((e) => console.warn("Form show failed:", e));
}

// ============================================================
// 交易二级菜单
// ============================================================

function showTradeSubMenu(player) {
  const money = getPlayerMoney(player);
  const marketUnlocked = world.getDynamicProperty(
    MARKET_UNLOCKED_PREFIX + player.id
  );
  let f = new CustomForm(player, "交易");
  f = f.label(`§6当前金币: ${money}`);
  f = f.spacer();
  f = f.button("转账", () => {
    f.close();
    system.runTimeout(() => showTransferMoneyForm(player), 2);
  });
  f = f.spacer();
  f = f.button("回收", () => {
    f.close();
    system.runTimeout(
      () => showRecycleCategoryMenu(player, showTradeSubMenu),
      2
    );
  });
  f = f.spacer();
  f = f.button("市场", () => {
    f.close();
    system.runTimeout(() => {
      if (marketUnlocked) {
        showMarketMenu(player, showTradeSubMenu);
      } else {
        showMarketUnlockForm(player, showTradeSubMenu);
      }
    }, 2);
  });
  f = f.spacer();
  f = f.button("返回", () => {
    f.close();
    system.runTimeout(() => showIslandMenu(player), 2);
  });
  f.show().catch((e) => console.warn("Trade sub-menu failed:", e));
}

// ============================================================
// 转账表单
// ============================================================

function showTransferMoneyForm(player) {
  const otherPlayers = [...world.getPlayers()].filter(
    (p) => p.id !== player.id
  );

  if (otherPlayers.length === 0) {
    player.sendMessage("§c没有其他在线玩家！");
    return;
  }

  const transferIdMap = [];
  const dropdownItems = otherPlayers.map((p, i) => {
    transferIdMap.push(p.id);
    return { label: p.name, value: i };
  });
  const selectedTarget = new ObservableNumber(0, { clientWritable: true });
  const amountObs = new ObservableString("", { clientWritable: true });
  const moneyLabel = new ObservableString(
    `§6我的金币: ${getPlayerMoney(player)}`
  );

  const form = new CustomForm(player, "转账")
    .label(moneyLabel)
    .spacer()
    .dropdown("选择目标玩家", selectedTarget, dropdownItems)
    .spacer()
    .textField("转账金额", amountObs)
    .spacer()
    .label(`§7转账手续费: ${Math.round(TRANSFER_TAX_RATE * 100)}%（由转出方支付）`)
    .spacer()
    .button("确认转账", () => {
      const targetId = transferIdMap[selectedTarget.getData()];
      const amountStr = amountObs.getData().trim();
      const amount = parseInt(amountStr, 10);
      const tax = Math.floor(amount * TRANSFER_TAX_RATE);

      if (isNaN(amount) || amount <= 0) {
        player.sendMessage("§c请输入有效金额！");
        return;
      }
      if (amount + tax > getPlayerMoney(player)) {
        player.sendMessage(
          `§c金币不足！当前: ${getPlayerMoney(player)}，需转账: ${amount}，手续费: ${tax}`
        );
        player.playSound("random.break");
        return;
      }

      const target = [...world.getPlayers()].find(
        (p) => p.id === targetId
      );
      if (!target) {
        player.sendMessage("§c目标玩家已离线！");
        return;
      }

      player.runCommand(`scoreboard players remove @s money ${amount + tax}`);
      target.runCommand(`scoreboard players add @s money ${amount}`);
      player.sendMessage(
        `§a成功转账 §e${amount} 金币 §a给 §e${target.name} §7(手续费 ${tax})`
      );
      player.playSound("random.orb");
      target.sendMessage(
        `§a你收到了 §e${player.name} §a转账的 §e${amount} 金币`
      );
      target.playSound("random.orb");
      moneyLabel.setData(`§6我的金币: ${getPlayerMoney(player)}`);
      form.close();
    })
    .spacer()
    .button("返回", () => {
      form.close();
      system.runTimeout(() => showTradeSubMenu(player), 2);
    });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

// ============================================================
// 管理员面板
// ============================================================

function showAdminMenu(player) {
  const total = getBoundCount();
  if (total === 0) {
    player.sendMessage("§c暂无岛屿数据");
    return;
  }

  const STATUS_COLOR = {
    active: "§a",
    dirty: "§c",
    pending: "§b",
    cleaning: "§e",
    review: "§d",
  };
  const STATUS_TEXT = {
    active: "使用中",
    dirty: "待重置",
    pending: "待绑定",
    cleaning: "清理中",
    review: "待确认",
  };

  const form = new CustomForm(player, "管理员面板");
  form.label(`§6共 ${total} 个岛屿`);

  for (let i = 1; i <= total; i++) {
    form.spacer();
    const status = getIslandStatus(i) || "unknown";
    const owner = getIslandOwner(i);
    const ownerName = owner ? getPlayerNameById(owner) : "无";
    const members = getIslandMembers(i);
    const color = STATUS_COLOR[status] || "§7";
    const text = STATUS_TEXT[status] || status;

    form.label(
      `§e岛屿 #${i}  ${color}[${text}]  §7岛主: ${ownerName}  §7成员: ${members.length}/${MAX_ISLAND_MEMBERS}`
    );
    form.spacer();

    form.button(`传送至岛屿 #${i}`, () => {
      form.close();
      const dimId = `${DIMENSION_NAMESPACE}:void_${i}`;
      try {
        const dim = world.getDimension(dimId);
        player.teleport({ x: 0, y: 100, z: 0 }, { dimension: dim });
        player.sendMessage(`§a已传送至岛屿 #${i} (0, 100, 0)`);
      } catch (e) {
        player.sendMessage(`§c无法传送至岛屿 #${i}`);
      }
    });

    if (status === "dirty") {
      form.spacer();
      form.button(`标记岛屿 #${i} 为待绑定`, () => {
        setIslandStatus(i, "pending");
        form.close();
        player.sendMessage(`§a岛屿 #${i} 已标记为待绑定`);
        player.playSound("random.orb");
      });
    }

    if (status === "review") {
      form.spacer();
      form.button(`确认开放岛屿 #${i}`, () => {
        setIslandStatus(i, "pending");
        form.close();
        player.sendMessage(`§a岛屿 #${i} 已确认开放，可重新分配`);
        player.playSound("random.orb");
      });
    }
  }

  form.spacer().button("关闭", () => form.close());
  form.show().catch((e) => console.warn("Form show failed:", e));
}

// Also need getBoundCount - it's internal to island.js but let's just read the counter
function getBoundCount() {
  return world.getDynamicProperty("island:bound_counter") ?? 0;
}

// ============================================================
// 聊天路由
// ============================================================

export function init() {
  world.beforeEvents.chatSend.subscribe((event) => {
    const player = event.sender;

    // 灵魂出窍中禁止使用其他命令（#fc off 除外）
    if (
      isSoulActive(player.id) &&
      event.message.startsWith("#") &&
      event.message !== "#fc off"
    ) {
      event.cancel = true;
      player.sendMessage("§c灵魂出窍中无法使用其他命令，输入 #fc off 退出");
      return;
    }

    // #lobby
    if (event.message === "#lobby") {
      event.cancel = true;
      handleLobby(player);
      return;
    }

    if (event.message === "#spawn") {
      event.cancel = true;
      handleSpawn(player);
      return;
    }
    if (event.message === "#island") {
      event.cancel = true;
      handleIsland(player);
      return;
    }
    if (event.message === "#fc on" || event.message === "#fc off") {
      event.cancel = true;
      const on = event.message === "#fc on";
      system.runTimeout(() => toggleSoul(player, on), 1);
      return;
    }
    if (event.message === "#menu") {
      event.cancel = true;
      system.runTimeout(() => {
        const inventory = player.getComponent("inventory").container;
        const clock = new ItemStack("minecraft:clock", 1);
        const leftover = inventory.addItem(clock);
        if (leftover) player.dimension.spawnItem(leftover, player.location);
        player.sendMessage("§a右键时钟打开空岛菜单！");
        player.playSound("random.orb");
      }, 0);
      return;
    }
    if (event.message.startsWith("#visit ")) {
      event.cancel = true;
      let targetName = event.message.slice(7).trim();
      if (targetName.startsWith("@")) targetName = targetName.slice(1);
      handleVisitRequest(player, targetName);
      return;
    }
    if (event.message.startsWith("#join ")) {
      event.cancel = true;
      let targetName = event.message.slice(6).trim();
      if (targetName.startsWith("@")) targetName = targetName.slice(1);
      handleJoinRequest(player, targetName);
      return;
    }
    if (event.message.startsWith("#transfer ")) {
      event.cancel = true;
      let targetName = event.message.slice(10).trim();
      if (targetName.startsWith("@")) targetName = targetName.slice(1);
      handleTransfer(player, targetName);
      return;
    }
    if (event.message.startsWith("#title ")) {
      event.cancel = true;
      handleTitleCommand(player, event.message);
      return;
    }
    if (event.message === "#vaulttest") {
      event.cancel = true;
      if (!player.hasTag("op")) {
        player.sendMessage("§c你没有权限使用此命令！");
        return;
      }
      debugVault(player);
      return;
    }
    if (event.message === "#imgtest") {
      event.cancel = true;
      if (!player.hasTag("op")) {
        player.sendMessage("§c你没有权限使用此命令！");
        return;
      }
      // chatSend 回调运行在受限执行权限下，Observable 构造器不可用；
      // 且聊天栏关闭需要时间，延迟 10 tick（0.5 秒）避免 UserBusy 阻挡表单
      system.runTimeout(() => showImageTestForm(player), 10);
      return;
    }
    // 普通聊天消息添加称号前缀
    if (!event.cancel) {
      event.cancel = true;
      world.sendMessage(
        getPlayerTitle(player.id) +
          " <" +
          player.name +
          "> " +
          event.message
      );
    }
  });

  // --- 右键时钟弹出菜单 ---
  world.afterEvents.itemUse.subscribe((event) => {
    const { source: player, itemStack } = event;
    if (itemStack.typeId !== "minecraft:clock") return;
    showIslandMenu(player);
  });

  // --- 管理员菜单：手持命令方块矿车右键 ---
  world.afterEvents.itemUse.subscribe((event) => {
    const { source: player, itemStack } = event;
    if (itemStack.typeId !== "minecraft:command_block_minecart") return;
    showAdminMenu(player);
  });

  // ============================================================
  // 访客权限
  // ============================================================
  world.beforeEvents.playerBreakBlock.subscribe((event) => {
    if (event.player.hasTag("visitor")) {
      event.cancel = true;
      return;
    }
  });

  world.beforeEvents.playerPlaceBlock.subscribe((event) => {
    if (event.player.hasTag("visitor")) {
      event.cancel = true;
      return;
    }
  });

  world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    if (event.player.hasTag("visitor")) event.cancel = true;
  });

  world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    if (event.player.hasTag("visitor")) event.cancel = true;
  });

  world.beforeEvents.entityHurt.subscribe((event) => {
    const attacker = event.damageSource.damagingEntity;
    if (
      attacker?.typeId === "minecraft:player" &&
      attacker.hasTag("visitor")
    ) {
      event.cancel = true;
    }
  });

  // ============================================================
  // 站在黑曜石上右键空桶 → 回收为岩浆桶
  // ============================================================
  world.afterEvents.itemUse.subscribe((event) => {
    const { source: player, itemStack } = event;
    if (itemStack.typeId !== "minecraft:bucket") return;

    const belowPos = {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y) - 1,
      z: Math.floor(player.location.z),
    };
    const blockBelow = player.dimension.getBlock(belowPos);
    if (!blockBelow || blockBelow.typeId !== "minecraft:obsidian") return;

    blockBelow.setType("minecraft:air");

    const inventory = player.getComponent("inventory").container;
    const slot = player.selectedSlotIndex;
    const handItem = inventory.getItem(slot);
    if (handItem.amount > 1) {
      handItem.amount--;
      inventory.setItem(slot, handItem);
    } else {
      inventory.setItem(slot, undefined);
    }

    const lavaBucket = new ItemStack("minecraft:lava_bucket", 1);
    const leftover = inventory.addItem(lavaBucket);
    if (leftover) {
      player.dimension.spawnItem(leftover, player.location);
    }

    player.sendMessage("§e下次记得保管好岩浆哦~");
    player.playSound("bucket.empty_lava");
  });

  // ============================================================
  // 快捷栏方块自动补货
  // ============================================================
  world.afterEvents.playerPlaceBlock.subscribe((event) => {
    const { player, block } = event;
    if (!getAssistSettings(player.id).blockRefill) return;
    const blockId = block.typeId;

    system.runTimeout(() => {
      const inventory = player.getComponent("inventory").container;
      const slot = player.selectedSlotIndex;
      const held = inventory.getItem(slot);

      if (held && held.amount > 0) return;

      for (let j = 0; j < inventory.size; j++) {
        if (j === slot) continue;
        const src = inventory.getItem(j);
        if (src?.typeId === blockId && src.amount > 0) {
          inventory.setItem(slot, src);
          inventory.setItem(j, undefined);
          return;
        }
      }
    }, 0);
  });

  // ============================================================
  // 定时随机提醒（每3分钟）
  // ============================================================
  const TIPS = [
    "§etips: 输入 #island 回到你的岛屿！",
    "§etips: 输入 #lobby 回到世界大厅！",
    "§etips: 输入 #spawn 设置重生点！",
    "§etips: 输入 #visit @<玩家名> 申请访问他人岛屿！",
    "§etips: 输入 #join @<玩家名> 申请加入他人岛屿！",
    "§etips: 岛屿会定期刷新流浪商人哦~",
    "§etips: 别把岩浆变成黑曜石哦~(站在黑曜石上手持空桶右键可回收岩浆)",
    "§etips: 刷石机有概率生成矿物哦~",
  ];

  let tipIndex = 0;
  system.runInterval(() => {
    world.sendMessage(TIPS[tipIndex]);
    tipIndex = (tipIndex + 1) % TIPS.length;
  }, 3600);

  // ============================================================
  // 玩家死亡/重连后恢复成员身份
  // ============================================================
  world.afterEvents.entitySpawn.subscribe((event) => {
    if (event.cause !== EntityInitializationCause.Spawned) return;
    const { entity } = event;
    if (entity.typeId !== "minecraft:player") return;
    if (entity.hasTag("visitor")) {
      try {
        entity.removeTag("visitor");
        entity.addTag("member");
      } catch (e) {}
    }
  });

  // ============================================================
  // 定时清理过期申请（每15秒）
  // ============================================================
  system.runInterval(() => {
    const now = Date.now();
    const total =
      world.getDynamicProperty("island:bound_counter") ?? 0;
    for (let i = 1; i <= total; i++) {
      const raw = world.getDynamicProperty(
        "island:notifications_" + i
      );
      if (!raw) continue;
      let notifications;
      try {
        notifications = JSON.parse(raw);
      } catch (e) {
        continue;
      }
      let changed = false;
      const cleaned = [];
      for (const n of notifications) {
        if (
          (n.type === "visit" || n.type === "join") &&
          now - n.timestamp > 60000
        ) {
          if (n.type === "visit") {
            const reqs = JSON.parse(
              world.getDynamicProperty("island:visit_req_" + i) || "[]"
            );
            world.setDynamicProperty(
              "island:visit_req_" + i,
              JSON.stringify(reqs.filter((r) => r.playerId !== n.playerId))
            );
          } else {
            const reqs = JSON.parse(
              world.getDynamicProperty("island:join_req_" + i) || "[]"
            );
            world.setDynamicProperty(
              "island:join_req_" + i,
              JSON.stringify(reqs.filter((r) => r.playerId !== n.playerId))
            );
          }
          const target = [...world.getPlayers()].find(
            (p) => p.id === n.playerId
          );
          if (target)
            target.sendMessage(
              `§c你的${n.type === "visit" ? "访问" : "加入"}申请已超时，被自动拒绝`
            );
          changed = true;
          continue;
        }
        cleaned.push(n);
      }
      if (changed) {
        world.setDynamicProperty(
          "island:notifications_" + i,
          JSON.stringify(cleaned)
        );
      }
    }
  }, 20 * 15);

  // ============================================================
  // 玩家进入事件（签到 + 欢迎）
  // ============================================================

  world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    const spawnDim = player.dimension?.id || "?";

    if (!event.initialSpawn) return;

    if (hasPlayerJoinedBefore(player.id)) {
      player.sendMessage(`§a玩家 ${player.name}，欢迎回来！`);
    } else {
      markPlayerJoined(player.id);
      player.sendMessage(
        `§a欢迎新玩家 ${player.name}！请输入 #island 以开启空岛之旅`
      );
      system.runTimeout(() => {
        const inv = player.getComponent("inventory").container;
        const clock = new ItemStack("minecraft:clock", 1);
        const leftover = inv.addItem(clock);
        if (leftover) player.dimension.spawnItem(leftover, player.location);
      }, 20);
    }

    // 玩家重连：主世界玩家不做处理；其他非空岛维度玩家传送至大厅
    const boundIndex = getPlayerBoundIndex(player.id);
    if (
      player.dimension.id !== LOBBY_DIMENSION_ID &&
      (boundIndex === undefined ||
        !player.dimension.id.startsWith(`${DIMENSION_NAMESPACE}:void_`))
    ) {
      system.runTimeout(() => {
        try {
          const lobby = world.getDimension(LOBBY_DIMENSION_ID);
          player.teleport({ x: 0, y: 0, z: 0 }, { dimension: lobby });
        } catch (e) {
          console.error(`[Spawn] Lobby redirect failed: ${e}`);
        }
      }, 0);
    }

    // 进服后立即开始检查，表单展示失败时每 tick 重试，直到玩家关闭
    showSigninForm(player);

    // 市场离线收益
    marketOnPlayerJoin(player);
  });
}
