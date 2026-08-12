// ============================================================
// 管理员面板：管理菜单 + 岛屿管理
// 入口：手持命令方块矿车右键（menus.js 转发）
// ============================================================
import { system, world } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";
import {
  DIMENSION_NAMESPACE,
  MAX_ISLAND_MEMBERS,
} from "./config.js";
import {
  getIslandStatus,
  getIslandOwner,
  getIslandMembers,
  setIslandStatus,
} from "./island.js";
import { getPlayerNameById } from "./stats.js";
import { showNoticeAdminMenu } from "./notice.js";

function getBoundCount() {
  return world.getDynamicProperty("island:bound_counter") ?? 0;
}

/** 管理菜单：岛屿管理 / 公告管理 */
export function showAdminMenu(player) {
  const form = new CustomForm(player, "管理菜单");
  form.label("§6请选择管理功能");
  form.spacer();
  form.button("岛屿管理", () => {
    form.close();
    system.runTimeout(() => showIslandAdminMenu(player), 2);
  });
  form.spacer();
  form.button("公告管理", () => {
    form.close();
    system.runTimeout(() => showNoticeAdminMenu(player, showAdminMenu), 2);
  });
  form.spacer();
  form.button("关闭", () => form.close());
  form.show().catch((e) => console.warn("Admin menu failed:", e));
}

function showIslandAdminMenu(player) {
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

  const form = new CustomForm(player, "岛屿管理");
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

  form.spacer().button("返回管理菜单", () => {
    form.close();
    system.runTimeout(() => showAdminMenu(player), 2);
  });
  form.spacer().button("关闭", () => form.close());
  form.show().catch((e) => console.warn("Island admin form failed:", e));
}
