import { world, system } from "@minecraft/server";
import { CustomForm, ObservableNumber } from "@minecraft/server-ui";
import { TITLE_PREFIX, DEFAULT_TITLE } from "./config.js";

// --- 称号目录 ---
// id: 存储标识；name: 称号名；color: 颜色代码；desc: 解锁说明
// 后续新称号在此追加即可
export const TITLES = [
  {
    id: "newbie",
    name: "萌新",
    color: "§7",
    desc: "人人皆从萌新开始（初始称号）",
  },
];

/** 读取当前佩戴的称号显示文本（兼容旧版管理员直接设置的原始文本） */
export function getPlayerTitle(playerId) {
  const raw = world.getDynamicProperty(TITLE_PREFIX + playerId) || "";
  const t = TITLES.find((x) => x.id === raw);
  if (t) return `${t.color}【${t.name}】§r`;
  return raw ? `${raw}§r` : `${DEFAULT_TITLE}§r`;
}

/** 管理员直接设置自定义称号文本 */
export function setPlayerTitle(playerId, title) {
  world.setDynamicProperty(TITLE_PREFIX + playerId, title);
}

/** 玩家佩戴/卸下称号（存称号 id，空字符串卸下） */
export function setWornTitle(playerId, titleId) {
  world.setDynamicProperty(TITLE_PREFIX + playerId, titleId || "");
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

// ============================================================
// 称号界面（下拉选择）
// ============================================================

export function showTitleMenu(player, backFn) {
  const wornRaw = world.getDynamicProperty(TITLE_PREFIX + player.id) || "";
  const wornTitle = TITLES.find((x) => x.id === wornRaw);
  const wornText = wornTitle
    ? `${wornTitle.color}【${wornTitle.name}】§r`
    : wornRaw || `${DEFAULT_TITLE}§r`;

  const NO_TITLE_INDEX = TITLES.length; // 下拉末项：无称号
  const items = TITLES.map((t, i) => ({
    label: `${t.color}【${t.name}】`,
    value: i,
    description: t.desc,
  }));
  items.push({ label: "无称号（默认）", value: NO_TITLE_INDEX });

  const wornIndex = wornTitle
    ? TITLES.findIndex((t) => t.id === wornTitle.id)
    : NO_TITLE_INDEX;
  const selected = new ObservableNumber(wornIndex);

  const form = new CustomForm(player, "称号")
    .label(`§e当前称号: ${wornText}`)
    .spacer()
    .dropdown("选择称号", selected, items)
    .spacer()
    .button("保存", () => {
      const idx = selected.getData();
      const title = idx >= 0 && idx < TITLES.length ? TITLES[idx] : null;
      if (title) {
        setWornTitle(player.id, title.id);
        player.sendMessage(`§a已佩戴称号: ${title.color}【${title.name}】§r`);
      } else {
        setWornTitle(player.id, "");
        player.sendMessage("§7已卸下称号，恢复默认");
      }
      player.playSound("random.orb");
      form.close();
      system.runTimeout(() => showTitleMenu(player, backFn), 2);
    })
    .spacer()
    .button("返回", () => {
      form.close();
      system.runTimeout(() => backFn(player), 2);
    });

  form.show().catch((e) => console.warn("Form show failed:", e));
}

/** 初始化：没有存储过称号的玩家自动佩戴「萌新」 */
export function init() {
  world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    if (!player) return;
    if (world.getDynamicProperty(TITLE_PREFIX + player.id) === undefined) {
      setWornTitle(player.id, "newbie");
    }
  });
}
