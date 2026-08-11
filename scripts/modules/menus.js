import { system, world, ItemStack, EntityInitializationCause, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { CustomForm, ObservableString, ObservableNumber } from "@minecraft/server-ui";
import { getPlayerMoney } from "./money.js";
import { getPlayerTitle, showTitleMenu } from "./title.js";
import {
  getPlayerBoundIndex,
  handleLobby,
  handleSpawn,
  handleIsland,
  giveMenuClock,
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
import { toggleSoul } from "./soul.js";
import { showMarketMenu, showMarketUnlockForm, onPlayerJoin as marketOnPlayerJoin } from "./market.js";
import { showRecycleCategoryMenu } from "./recycle.js";
import { showSigninForm } from "./signin.js";
import { showAssistantMenu, getAssistSettings } from "./assistants.js";
import { showLotteryMenu } from "./lottery.js";
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
  f = f.spacer();
  f = f.button("岛屿", () => {
    f.close();
    system.runTimeout(
      () => showIslandSubMenu(player, showIslandMenu),
      2
    );
  });
  f = f.button("个人", () => {
    f.close();
    system.runTimeout(() => showGrowthMenu(player), 2);
  });
  f = f.button("经济", () => {
    f.close();
    system.runTimeout(() => showTradeSubMenu(player), 2);
  });
  f = f.button("设置", () => {
    f.close();
    system.runTimeout(
      () => showAssistantMenu(player, showIslandMenu),
      2
    );
  });
  f.show().catch((e) => console.warn("Form show failed:", e));
}

// ============================================================
// 成长二级菜单
// ============================================================

function showGrowthMenu(player) {
  let f = new CustomForm(player, "个人");
  f = f.label("§7成就 / 称号 / 天赋 / 排行榜");
  f = f.spacer();
  f = f.button("成就列表", () => {
    f.close();
    system.runTimeout(() => showAchievementsMenu(player, showGrowthMenu), 2);
  });
  f = f.button("称号", () => {
    f.close();
    system.runTimeout(() => showTitleMenu(player, showGrowthMenu), 2);
  });
  f = f.button("天赋", () => {
    f.close();
    system.runTimeout(() => showTalentMenu(player, showGrowthMenu), 2);
  });
  f = f.button("排行榜", () => {
    f.close();
    system.runTimeout(() => showLeaderboardMenu(player, showGrowthMenu), 2);
  });
  f = f.spacer();
  f = f.button("返回", () => {
    f.close();
    system.runTimeout(() => showIslandMenu(player), 2);
  });
  f.show().catch((e) => console.warn("Form show failed:", e));
}

// ============================================================
// 成就列表
// ============================================================

function showAchievementsMenu(player, backFn) {
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
    .button("返回", () => {
      form.close();
      system.runTimeout(() => backFn(player), 2);
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
  let f = new CustomForm(player, "经济");
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
  f = f.button("抽奖", () => {
    f.close();
    system.runTimeout(() => showLotteryMenu(player, showTradeSubMenu), 2);
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

// ============================================================
// 自定义命令注册（/beatorini:xxx）
// ============================================================

export function registerCustomCommands() {
  system.beforeEvents.startup.subscribe((event) => {
    const registry = event.customCommandRegistry;

    // /beatorini:menu - 领取菜单时钟
    registry.registerCommand(
      {
        name: "beatorini:menu",
        description: "领取菜单时钟",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
      },
      (origin) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") {
          return {
            status: CustomCommandStatus.Failure,
            message: "该命令只能由玩家执行",
          };
        }
        system.runTimeout(() => giveMenuClock(player), 0);
        return { status: CustomCommandStatus.Success };
      }
    );

    // /beatorini:fc on|off - 灵魂出窍
    registry.registerEnum("beatorini:fc_mode", ["on", "off"]);
    registry.registerCommand(
      {
        name: "beatorini:fc",
        description: "开启/关闭灵魂出窍",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
        mandatoryParameters: [
          { type: CustomCommandParamType.Enum, name: "beatorini:fc_mode" },
        ],
      },
      (origin, mode) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") {
          return {
            status: CustomCommandStatus.Failure,
            message: "该命令只能由玩家执行",
          };
        }
        const on = mode === "on";
        system.runTimeout(() => toggleSoul(player, on), 0);
        return { status: CustomCommandStatus.Success };
      }
    );
  });
}

export function init() {
  world.beforeEvents.chatSend.subscribe((event) => {
    const player = event.sender;

    // 普通聊天消息添加称号前缀
    event.cancel = true;
    world.sendMessage(
      getPlayerTitle(player.id) +
        " <" +
        player.name +
        "> " +
        event.message
    );
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
  // 手持空桶右键黑曜石 → 回收为岩浆桶
  // ============================================================
  world.afterEvents.itemUse.subscribe((event) => {
    const { source: player, itemStack } = event;
    if (itemStack.typeId !== "minecraft:bucket") return;

    // 视线射线锁定面前的黑曜石（5 格内）
    const hit = player.getBlockFromViewDirection({ maxDistance: 5 });
    const block = hit?.block;
    if (!block || block.typeId !== "minecraft:obsidian") return;

    block.setType("minecraft:air");

    const inventory = player.getComponent("inventory").container;
    const slot = player.selectedSlotIndex;
    const handItem = inventory.getItem(slot);
    if (handItem && handItem.typeId === "minecraft:bucket") {
      if (handItem.amount > 1) {
        handItem.amount--;
        inventory.setItem(slot, handItem);
      } else {
        inventory.setItem(slot, undefined);
      }
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
    "§etips: 右键时钟打开主菜单，体验全部玩法！",
    "§etips: 输入 /menu 领取菜单时钟！",
    "§etips: 主菜单可返回大厅、设置出生点、管理岛屿！",
    "§etips: 岛屿菜单可申请访问或加入他人岛屿！",
    "§etips: 输入 /fc on 开启灵魂出窍，r96 范围内自由探索！",
    "§etips: 输入 /fc off 传送回身体！",
    "§etips: 岛屿会定期刷新流浪商人哦~",
    "§etips: 持有特定物品会自动解锁成就并奖励金币！",
    "§etips: 称号按里程碑解锁，佩戴后显示在头顶！",
    "§etips: 抽奖十连有硬保底：10抽必出史诗，100抽必出传说！",
    "§etips: 天赋每60秒自动生效，升级后效果更强！",
    "§etips: 市场交易物品无损储存，超48小时未售自动下架返还！",
    "§etips: 回收价格会随当日累计回收量递减，记得规划出售！",
    "§etips: 熔岩刷石有概率生成矿物，满进度为10%出矿率！",
    "§etips: 别把岩浆变成黑曜石！手持空桶右键黑曜石可回收岩浆",
    "§etips: 死亡不掉落物品，但会扣除金币，探索时注意安全！",
    "§etips: 主菜单可开启自动补块、工具自动选择等辅助功能！",
    "§etips: 签到奖励随连续天数提升，别忘了每天进服签到！",
    "§etips: 大厅是安全区，请勿破坏或使用道具！",
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
        `§a欢迎新玩家 ${player.name}！输入 /menu 或右键时钟开启空岛之旅`
      );
      system.runTimeout(() => giveMenuClock(player), 20);
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
